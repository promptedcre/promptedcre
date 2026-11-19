import { z } from "zod";
import { fv, pmt, pv } from "./finance";
import { num, pct, type TraceLine, usd } from "./trace";

export const debtInput = z
  .object({
    noi: z.number().positive().describe("annual net operating income, dollars"),
    value: z.number().positive().describe("value or price for loan-to-value, dollars"),
    rate: z.number().min(0).max(0.3).describe("annual rate as a decimal: 0.065 is 6.5%"),
    amortYears: z.number().int().min(0).max(40).describe("0 means interest-only for the whole term"),
    termYears: z.number().int().min(1).max(40),
    ioYears: z.number().int().min(0).max(40).describe("interest-only years at the start"),
    minDscr: z.number().positive().nullable().describe("e.g. 1.25; null for no limit"),
    maxLtv: z.number().positive().max(1).nullable().describe("decimal, e.g. 0.70; null for no limit"),
    minDebtYield: z.number().positive().max(1).nullable().describe("decimal, e.g. 0.08; null for no limit"),
  })
  .strict()
  .refine((d) => d.ioYears <= d.termYears, { message: "interest-only years cannot exceed the term", path: ["ioYears"] })
  .refine((d) => d.minDscr !== null || d.maxLtv !== null || d.minDebtYield !== null, {
    message: "set at least one sizing limit",
    path: ["minDscr"],
  });

export type DebtInput = z.infer<typeof debtInput>;
export type Constraint = "dscr" | "ltv" | "debt-yield";

export type DebtYear = {
  year: number;
  beginBalance: number;
  interest: number;
  principal: number;
  payment: number;
  endBalance: number;
};

export type DebtResult = {
  loan: number;
  binding: Constraint;
  byConstraint: Partial<Record<Constraint, number>>;
  monthlyRate: number;
  ioPayment: number; // monthly, during interest-only months
  amortPayment: number | null; // monthly, once amortization starts
  firstFullYearDebtService: number; // the year sizing is based on
  dscr: number;
  ltv: number;
  debtYield: number;
  balloon: number; // balance due at the end of the term
  schedule: DebtYear[];
  trace: TraceLine[];
};

const LABEL: Record<Constraint, string> = { dscr: "coverage (DSCR)", ltv: "loan-to-value", "debt-yield": "debt yield" };

// Year-by-year schedule with monthly payments. Amortization starts after the
// interest-only months and runs over the full amortization period. The last
// scheduled payment retires the loan: it pays the balance that is left (the level
// payment, within floating-point residue), the balance is then exactly zero, and
// any later year in the schedule shows no payment.
export function annualSchedule(
  loan: number,
  annualRate: number,
  amortYears: number,
  ioYears: number,
  years: number,
): DebtYear[] {
  const r = annualRate / 12;
  const amortPayment = amortYears > 0 ? -pmt(r, amortYears * 12, loan) : null;
  const lastPaymentMonth = amortPayment === null ? Number.POSITIVE_INFINITY : (ioYears + amortYears) * 12;
  const out: DebtYear[] = [];
  let balance = loan;
  for (let year = 1; year <= years; year += 1) {
    const begin = balance;
    let interest = 0;
    let principal = 0;
    for (let m = 1; m <= 12; m += 1) {
      const month = (year - 1) * 12 + m;
      const i = balance * r;
      if (month >= lastPaymentMonth) {
        // The final payment, and every month after it: whatever is owed is paid and
        // the balance closes at zero (after payoff, nothing is owed, so nothing is paid).
        interest += i;
        principal += balance;
        balance = 0;
        continue;
      }
      const payment = month <= ioYears * 12 || amortPayment === null ? i : amortPayment;
      interest += i;
      principal += payment - i;
      balance -= payment - i;
    }
    out.push({ year, beginBalance: begin, interest, principal, payment: interest + principal, endBalance: balance });
  }
  return out;
}

export function sizeDebt(raw: DebtInput): DebtResult {
  const d = debtInput.parse(raw);
  const r = d.rate / 12;
  const amortizing = d.amortYears > 0;
  const n = d.amortYears * 12;
  const trace: TraceLine[] = [];
  const by: Partial<Record<Constraint, number>> = {};

  if (d.minDscr !== null) {
    const allowedAnnual = d.noi / d.minDscr;
    trace.push({ label: "Debt service the NOI supports", formula: `${usd(d.noi)} ÷ ${num(d.minDscr)}`, value: usd(allowedAnnual) });
    if (amortizing) {
      // Sized on the amortizing payment, the larger of the two, so coverage holds after interest-only ends.
      by.dscr = pv(r, n, -allowedAnnual / 12);
      trace.push({
        label: "Loan by coverage",
        formula: `PV(${pct(d.rate)}/12, ${n}, ${usd(allowedAnnual / 12)})`,
        value: usd(by.dscr),
      });
    } else {
      by.dscr = d.rate > 0 ? allowedAnnual / d.rate : Number.POSITIVE_INFINITY;
      trace.push({ label: "Loan by coverage (interest only)", formula: `${usd(allowedAnnual)} ÷ ${pct(d.rate)}`, value: usd(by.dscr) });
    }
  }
  if (d.maxLtv !== null) {
    by.ltv = d.value * d.maxLtv;
    trace.push({ label: "Loan by loan-to-value", formula: `${usd(d.value)} × ${pct(d.maxLtv)}`, value: usd(by.ltv) });
  }
  if (d.minDebtYield !== null) {
    by["debt-yield"] = d.noi / d.minDebtYield;
    trace.push({ label: "Loan by debt yield", formula: `${usd(d.noi)} ÷ ${pct(d.minDebtYield)}`, value: usd(by["debt-yield"]) });
  }

  const entries = Object.entries(by) as Array<[Constraint, number]>;
  const [binding, loan] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  trace.push({ label: "Largest loan that meets every limit", formula: `smallest of the limits: ${LABEL[binding]}`, value: usd(loan) });

  const ioPayment = loan * r;
  const amortPayment = amortizing ? -pmt(r, n, loan) : null;
  trace.push({ label: "Interest-only payment", formula: `${usd(loan)} × ${pct(d.rate)}/12`, value: usd(ioPayment) });
  if (amortPayment !== null) {
    trace.push({ label: "Amortizing payment", formula: `PMT(${pct(d.rate)}/12, ${n}, ${usd(loan)})`, value: usd(amortPayment) });
  }

  const schedule = annualSchedule(loan, d.rate, d.amortYears, d.ioYears, d.termYears);
  const amortMonthsPaid = Math.max(0, d.termYears * 12 - d.ioYears * 12);
  // A term that runs to the end of amortization or past it leaves nothing due:
  // the closed form would go below zero after the last payment, so it is not used there.
  const paidOff = amortPayment !== null && amortMonthsPaid >= n;
  const balloon = amortPayment === null ? loan : paidOff ? 0 : -fv(r, amortMonthsPaid, -amortPayment, loan);
  trace.push({
    label: "Balance due at maturity",
    formula:
      amortPayment === null
        ? "interest only: the full loan"
        : paidOff
          ? `amortization ends in month ${d.ioYears * 12 + n}, within the ${d.termYears * 12}-month term: nothing is left`
          : `FV(${pct(d.rate)}/12, ${amortMonthsPaid}, ${usd(amortPayment)}, ${usd(loan)})`,
    value: usd(balloon),
  });

  const fullYearDs = amortPayment === null ? ioPayment * 12 : amortPayment * 12;
  const dscr = d.noi / fullYearDs;
  trace.push({ label: "Coverage on the amortizing payment", formula: `${usd(d.noi)} ÷ ${usd(fullYearDs)}`, value: `${num(dscr)}x` });

  return {
    loan,
    binding,
    byConstraint: by,
    monthlyRate: r,
    ioPayment,
    amortPayment,
    firstFullYearDebtService: fullYearDs,
    dscr,
    ltv: loan / d.value,
    debtYield: d.noi / loan,
    balloon,
    schedule,
    trace,
  };
}

export const DEBT_EXAMPLE: DebtInput = {
  noi: 500_000,
  value: 8_000_000,
  rate: 0.065,
  amortYears: 30,
  termYears: 10,
  ioYears: 2,
  minDscr: 1.25,
  maxLtv: 0.7,
  minDebtYield: 0.08,
};
