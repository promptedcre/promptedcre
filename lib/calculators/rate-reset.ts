import { z } from "zod";
import { annualSchedule } from "./debt";
import { pmt } from "./finance";
import { defineModule } from "./module";
import { multiple, pct, type TraceLine, usd } from "./trace";

// A floating or resetting rate, stressed along a path the user enters: one index
// rate a year. The all-in rate is the index plus the spread, held inside the cap
// and floor. The rate resets once a year, at the start of each loan year, and the
// monthly payment is re-amortized then on the actual balance over the months of
// amortization left. Coverage is that year's NOI over that year's twelve payments.
// A stress test of the path given, never a forecast: no index level is built in.

export const rateResetInput = z
  .object({
    loan: z.number().gt(0).describe("the loan amount at the start of year 1, dollars"),
    amortYears: z
      .number()
      .int()
      .min(0)
      .max(40)
      .describe("amortization in whole years from the start of year 1, payments monthly in arrears; 0 means interest only for the whole path"),
    spread: z.number().min(0).max(0.2).describe("the lender's spread over the index as a decimal: 0.03 is 3%"),
    indexPath: z
      .array(z.number().min(-0.1).max(0.3).describe("the index rate for one year as a decimal: 0.04 is 4%"))
      .min(1, "enter at least one year's index rate")
      .max(40)
      .describe("the index rate for each loan year, year 1 first, as decimals; a path you choose to test, not a forecast; its length is the horizon in years"),
    rateCap: z.number().gt(0).max(0.5).nullable().describe("the highest all-in rate the loan allows as a decimal: 0.08 is 8%; null for no cap"),
    rateFloor: z.number().min(0).max(0.5).nullable().describe("the lowest all-in rate the loan allows as a decimal: 0.05 is 5%; null for no floor"),
    noi: z.number().gt(0).describe("net operating income in year 1, dollars a year"),
    noiGrowth: z.number().gt(-1).max(0.5).describe("yearly NOI growth as a decimal: 0.02 is 2%; 0 holds NOI flat"),
    minDscr: z.number().gt(0).max(5).nullable().describe("the debt service coverage to flag, e.g. 1.25; null for no flag"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.rateCap !== null && d.rateFloor !== null && d.rateFloor > d.rateCap) {
      ctx.addIssue({ code: "custom", path: ["rateFloor"], message: "the floor cannot be above the cap" });
    }
    if (d.rateFloor === null) {
      d.indexPath.forEach((x, i) => {
        if (x + d.spread < 0) {
          ctx.addIssue({
            code: "custom",
            path: ["indexPath", i],
            message: `year ${i + 1}: the index plus the spread is a rate below zero; raise the index or set a floor`,
          });
        }
      });
    }
  });

export type RateResetInput = z.infer<typeof rateResetInput>;

export type RateBound = "cap" | "floor" | null;

export type RateResetYear = {
  year: number;
  index: number;
  // index plus spread, before the cap and floor
  uncappedRate: number;
  // the all-in rate for the year, inside the cap and floor
  rate: number;
  // which limit set the rate, when one did
  bound: RateBound;
  // months of amortization left at the reset; null for interest only
  monthsLeft: number | null;
  // true once an amortizing loan is paid off: no payment, no coverage
  paidOff: boolean;
  // the level monthly payment for the year
  payment: number;
  beginBalance: number;
  interest: number;
  principal: number;
  // the year's twelve payments
  debtService: number;
  endBalance: number;
  noi: number;
  // NOI over debt service; null when there is no debt service
  dscr: number | null;
  // payment over year 1's payment, less 1; null when year 1 has no payment
  shock: number | null;
  // true when coverage is below the minimum given
  belowMin: boolean;
};

export type RateResetResult = {
  years: RateResetYear[];
  firstPayment: number;
  maxPayment: number;
  maxPaymentYear: number;
  // the largest payment over year 1's, less 1; null when year 1 has no payment
  maxShock: number | null;
  // the lowest coverage on the path and its year; null when no year has debt service
  lowestDscr: number | null;
  lowestDscrYear: number | null;
  // the first year coverage falls below the minimum; null for none, or when no minimum is given
  firstBreachYear: number | null;
  totalInterest: number;
  totalPrincipal: number;
  totalDebtService: number;
  // the balance at the end of the last year of the path
  endingBalance: number;
  trace: TraceLine[];
};

// A rate as entered: two decimals of a percent unless the input carries more.
export function rateText(n: number): string {
  for (const d of [2, 3, 4]) {
    if (Math.abs(n * 100 - Number((n * 100).toFixed(d))) < 1e-9) return pct(n, d);
  }
  return pct(n, 4);
}

function rateFormula(d: RateResetInput, index: number): string {
  const sum = `${rateText(index)} + ${rateText(d.spread)}`;
  const floored = d.rateFloor === null ? sum : `max(${rateText(d.rateFloor)}, ${sum})`;
  return d.rateCap === null ? floored : `min(${rateText(d.rateCap)}, ${floored})`;
}

export function runRateReset(raw: RateResetInput): RateResetResult {
  const d = rateResetInput.parse(raw);
  const trace: TraceLine[] = [];
  const io = d.amortYears === 0;
  const n = d.amortYears * 12;

  trace.push({
    label: "Amortization",
    formula: io ? "0 years: interest only, the balance never falls" : `${d.amortYears} years × 12, payments monthly in arrears`,
    value: io ? "interest only" : `${n} months`,
  });

  const years: RateResetYear[] = [];
  let balance = d.loan;
  for (let y = 1; y <= d.indexPath.length; y += 1) {
    const index = d.indexPath[y - 1] ?? 0;
    const uncapped = index + d.spread;
    let r = uncapped;
    let bound: RateBound = null;
    if (d.rateFloor !== null && r < d.rateFloor) {
      r = d.rateFloor;
      bound = "floor";
    }
    if (d.rateCap !== null && r > d.rateCap) {
      r = d.rateCap;
      bound = "cap";
    }
    const noi = d.noi * (1 + d.noiGrowth) ** (y - 1);
    const begin = balance;
    const monthsLeft = io ? null : n - 12 * (y - 1);
    const paidOff = monthsLeft !== null && monthsLeft <= 0;
    const tag = `Year ${y}`;

    trace.push({ label: `${tag} rate${bound ? ` (${bound} binds)` : ""}`, formula: rateFormula(d, index), value: rateText(r) });

    let payment = 0;
    let interest = 0;
    let principal = 0;
    if (paidOff) {
      trace.push({ label: `${tag} payment, a month`, formula: `the loan was paid off at the end of year ${d.amortYears}`, value: usd(0) });
    } else {
      // One year of the shared schedule: the payment is set on this year's opening
      // balance over the amortization left, and holds for the twelve months.
      const row = annualSchedule(begin, r, io ? 0 : (monthsLeft ?? 0) / 12, 0, 1)[0];
      payment = io ? (begin * r) / 12 : -pmt(r / 12, monthsLeft ?? 0, begin);
      interest = row?.interest ?? 0;
      principal = row?.principal ?? 0;
      balance = row?.endBalance ?? begin;
      // The last amortizing year retires the loan: what is left is float rounding, closed to zero.
      if (monthsLeft === 12) {
        principal = begin;
        balance = 0;
      }
      trace.push({
        label: `${tag} payment, a month`,
        formula: io ? `${usd(begin)} × ${rateText(r)} ÷ 12` : `PMT(${rateText(r)}/12, ${monthsLeft}, ${usd(begin)})`,
        value: usd(payment),
      });
    }
    const debtService = interest + principal;
    if (!paidOff) {
      trace.push({ label: `${tag} debt service`, formula: `12 × ${usd(payment)}`, value: usd(debtService) });
      trace.push({ label: `${tag} interest`, formula: `each month's opening balance × ${rateText(r)} ÷ 12, summed`, value: usd(interest) });
      trace.push({ label: `${tag} principal`, formula: `${usd(debtService)} − ${usd(interest)}`, value: usd(principal) });
      trace.push({ label: `${tag} ending balance`, formula: `${usd(begin)} − ${usd(principal)}`, value: usd(balance) });
    }
    trace.push({
      label: `${tag} NOI`,
      formula: y === 1 ? "year-1 NOI as entered" : `${usd(d.noi)} × (1 + ${rateText(d.noiGrowth)})^${y - 1}`,
      value: usd(noi),
    });
    const dscr = debtService > 0 ? noi / debtService : null;
    trace.push({
      label: `${tag} coverage`,
      formula: dscr === null ? "no debt service this year: coverage is not defined" : `${usd(noi)} ÷ ${usd(debtService)}`,
      value: dscr === null ? "none" : multiple(dscr),
    });
    const first = years[0]?.payment ?? payment;
    const shock = first > 0 ? payment / first - 1 : null;
    if (y > 1) {
      trace.push({
        label: `${tag} payment change from year 1`,
        formula: shock === null ? "year 1 has no payment: the change is not defined" : `${usd(payment)} ÷ ${usd(first)} − 1`,
        value: shock === null ? "none" : pct(shock),
      });
    }
    years.push({
      year: y,
      index,
      uncappedRate: uncapped,
      rate: r,
      bound,
      monthsLeft,
      paidOff,
      payment,
      beginBalance: begin,
      interest,
      principal,
      debtService,
      endBalance: balance,
      noi,
      dscr,
      shock,
      belowMin: d.minDscr !== null && dscr !== null && dscr < d.minDscr,
    });
  }

  const firstPayment = years[0]?.payment ?? 0;
  const peak = years.reduce((a, b) => (b.payment > a.payment ? b : a));
  const maxShock = firstPayment > 0 ? peak.payment / firstPayment - 1 : null;
  trace.push({ label: "Highest payment, a month", formula: `largest of ${years.length} yearly payments: year ${peak.year}`, value: usd(peak.payment) });
  trace.push({
    label: "Payment shock",
    formula: maxShock === null ? "year 1 has no payment: the shock is not defined" : `${usd(peak.payment)} ÷ ${usd(firstPayment)} − 1`,
    value: maxShock === null ? "none" : pct(maxShock),
  });

  const covered = years.filter((y) => y.dscr !== null);
  const low = covered.length > 0 ? covered.reduce((a, b) => ((b.dscr ?? 0) < (a.dscr ?? 0) ? b : a)) : null;
  trace.push({
    label: "Lowest coverage",
    formula: low === null ? "no year has debt service" : `lowest of ${covered.length} yearly coverages: year ${low.year}`,
    value: low === null || low.dscr === null ? "none" : multiple(low.dscr),
  });

  const breach = years.find((y) => y.belowMin) ?? null;
  if (d.minDscr !== null) {
    trace.push({
      label: "First year below the minimum",
      formula: `first year coverage < ${multiple(d.minDscr)}`,
      value: breach === null ? "none" : `year ${breach.year}`,
    });
  }

  const totalInterest = years.reduce((s, y) => s + y.interest, 0);
  const totalPrincipal = years.reduce((s, y) => s + y.principal, 0);
  const endingBalance = years.at(-1)?.endBalance ?? d.loan;
  trace.push({ label: "Interest over the path", formula: `sum of ${years.length} years' interest`, value: usd(totalInterest) });
  trace.push({ label: `Balance at the end of year ${years.length}`, formula: `${usd(d.loan)} − principal paid ${usd(totalPrincipal)}`, value: usd(endingBalance) });

  return {
    years,
    firstPayment,
    maxPayment: peak.payment,
    maxPaymentYear: peak.year,
    maxShock,
    lowestDscr: low?.dscr ?? null,
    lowestDscrYear: low?.year ?? null,
    firstBreachYear: breach?.year ?? null,
    totalInterest,
    totalPrincipal,
    totalDebtService: totalInterest + totalPrincipal,
    endingBalance,
    trace,
  };
}

// Round, made-up figures. The index path is an example to stress, not a view of any index.
export const RATE_RESET_EXAMPLE: RateResetInput = {
  loan: 3_000_000,
  amortYears: 25,
  spread: 0.03,
  indexPath: [0.03, 0.04, 0.055, 0.045, 0.0375],
  rateCap: 0.08,
  rateFloor: 0.065,
  noi: 320_000,
  noiGrowth: 0.02,
  minDscr: 1.25,
};

export const rateResetModule = defineModule({ id: "rate-reset", input: rateResetInput, run: runRateReset, example: RATE_RESET_EXAMPLE });
