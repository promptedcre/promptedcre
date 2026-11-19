import { z } from "zod";
import { fv, irr, pmt } from "./finance";
import { defineModule } from "./module";
import { multiple, pct, type TraceLine, usd } from "./trace";

// Whether debt helps or hurts, for one stabilized year. NOI over price is the
// cap rate; a year of payments over the loan is the loan constant. When the cap
// rate is above the constant, each extra dollar of debt raises the cash return
// on the equity; when it is below, each dollar lowers it. Equity is the price
// less the loan (closing costs and reserves left out). Loan payments are monthly,
// in arrears, at the annual rate divided by twelve. Nothing is rounded until it
// is shown.

const quoteSchema = z
  .object({
    loan1: z.number().min(0).describe("quote 1: loan amount, dollars; it carries the loan's interest rate and amortization"),
    fee1: z.number().min(0).describe("quote 1: fees paid at closing, dollars; 0 if none"),
    loan2: z.number().min(0).describe("quote 2: loan amount, dollars; whichever loan is larger is compared as the second"),
    rate2: z.number().min(0).max(0.3).describe("quote 2: annual interest rate as a decimal: 0.0625 is 6.25%"),
    amortYears2: z.number().int().min(0).max(40).describe("quote 2: amortization in whole years; 0 means interest only"),
    fee2: z.number().min(0).describe("quote 2: fees paid at closing, dollars; 0 if none"),
    holdYears: z.number().int().min(1).max(40).describe("whole years the loan is expected to be held before it is paid off"),
  })
  .strict();

export const leverageInput = z
  .object({
    price: z.number().positive().describe("purchase price, dollars"),
    pgi: z.number().positive().describe("potential gross income: a full year's rent with every space leased, dollars a year"),
    vacancy: z.number().min(0).lt(1).describe("vacancy and collection loss as a decimal share of potential gross income: 0.05 is 5%"),
    opex: z.number().min(0).describe("operating expenses for the year, dollars; treated as fixed when occupancy changes"),
    rate: z.number().min(0).max(0.3).describe("loan annual interest rate as a decimal: 0.055 is 5.5%; the monthly rate is this divided by 12"),
    amortYears: z.number().int().min(0).max(40).describe("loan amortization in whole years; 0 means interest only, so the loan constant is the rate"),
    ltvLevels: z
      .array(z.number().min(0).lt(1).describe("a loan-to-value level as a decimal: 0.65 is 65%; 0 is all cash"))
      .min(1)
      .max(8)
      .describe("loan-to-value levels to test, as decimals from lowest to highest, each once; 0 is all cash"),
    compare: quoteSchema
      .nullable()
      .describe("two loan quotes, to price the extra dollars the larger one lends; null leaves the comparison out"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.pgi * (1 - d.vacancy) - d.opex <= 0) {
      ctx.addIssue({ code: "custom", message: "operating expenses must be less than the income after vacancy, so NOI is above zero", path: ["opex"] });
    }
    d.ltvLevels.forEach((v, i) => {
      if (i > 0 && v <= (d.ltvLevels[i - 1] as number)) {
        ctx.addIssue({ code: "custom", message: "list the loan-to-value levels from lowest to highest, each once", path: ["ltvLevels", i] });
      }
    });
    const c = d.compare;
    if (c) {
      if (c.fee1 > c.loan1) ctx.addIssue({ code: "custom", message: "fees cannot be more than the loan", path: ["compare", "fee1"] });
      if (c.fee2 > c.loan2) ctx.addIssue({ code: "custom", message: "fees cannot be more than the loan", path: ["compare", "fee2"] });
      const shortest = Math.min(d.amortYears > 0 ? d.amortYears : Infinity, c.amortYears2 > 0 ? c.amortYears2 : Infinity);
      if (c.holdYears > shortest) {
        ctx.addIssue({ code: "custom", message: "the hold cannot run past either quote's amortization", path: ["compare", "holdYears"] });
      }
    }
  });

export type LeverageInput = z.infer<typeof leverageInput>;

export type LeverageSign = "positive" | "negative" | "neutral";

export type LeverageLevel = {
  ltv: number;
  loan: number;
  equity: number; // price less loan
  debtService: number; // a year of payments: loan constant times loan
  cashFlow: number; // NOI less debt service
  cashOnCash: number; // cash flow over equity
  dscr: number | null; // NOI over debt service; null when there is no debt service
  debtYield: number | null; // NOI over loan; null when there is no loan
  breakEvenOccupancy: number; // (expenses + debt service) / potential gross income
  breakEvenRentShare: number; // (expenses + debt service) / income after vacancy
  negativeCashFlow: boolean;
};

export type QuoteTerms = { loan: number; fee: number; rate: number; amortYears: number; payment: number; balance: number };

export type IncrementalCost = {
  swapped: boolean; // quote 2 lent less, so the two were compared the other way round
  holdMonths: number;
  first: QuoteTerms; // the smaller loan
  second: QuoteTerms; // the larger loan
  extraProceeds: number; // (larger loan - its fee) - (smaller loan - its fee)
  extraPayment: number; // a month
  extraBalance: number; // at the end of the hold
  signChanges: number;
  monthlyRate: number | null;
  nominal: number | null; // 12 x the monthly rate
  effective: number | null; // (1 + monthly)^12 - 1
  note: string | null; // why the cost is null, or that it may not be the only rate
};

export type LeverageResult = {
  egi: number;
  noi: number;
  capRate: number;
  loanConstant: number;
  spread: number; // cap rate less loan constant
  sign: LeverageSign;
  levels: LeverageLevel[];
  comparison: IncrementalCost | null;
  trace: TraceLine[];
};

// A spread this close to zero is no spread: debt neither helps nor hurts.
const NEUTRAL = 1e-12;

// The annual loan constant: a year of level monthly payments per dollar lent;
// interest only, the rate itself.
function constantOf(rate: number, amortYears: number): number {
  return amortYears === 0 ? rate : -12 * pmt(rate / 12, amortYears * 12, 1);
}

function quoteTerms(loan: number, fee: number, rate: number, amortYears: number, months: number): QuoteTerms {
  const i = rate / 12;
  if (amortYears === 0) return { loan, fee, rate, amortYears, payment: loan * i, balance: loan };
  const payment = -pmt(i, amortYears * 12, loan);
  const left = -fv(i, months, -payment, loan);
  // a balance within a millionth of a dollar of zero is zero
  return { loan, fee, rate, amortYears, payment, balance: Math.abs(left) < 1e-6 ? 0 : left };
}

export function amortText(years: number): string {
  return years === 0 ? "interest only" : `${years}-year amortization`;
}

function signChanges(flows: number[]): number {
  let n = 0;
  let last = 0;
  for (const f of flows) {
    if (f === 0) continue;
    if (last !== 0 && Math.sign(f) !== Math.sign(last)) n += 1;
    last = f;
  }
  return n;
}

function paymentFormula(q: QuoteTerms): string {
  return q.amortYears === 0 ? `${usd(q.loan)} × ${pct(q.rate, 3)}/12` : `PMT(${pct(q.rate, 3)}/12, ${q.amortYears * 12}, ${usd(q.loan)})`;
}

function balanceFormula(q: QuoteTerms, months: number): string {
  return q.amortYears === 0 ? "interest only: the full loan" : `FV(${pct(q.rate, 3)}/12, ${months}, ${usd(q.payment)}, ${usd(q.loan)})`;
}

export function runLeverage(raw: LeverageInput): LeverageResult {
  const d = leverageInput.parse(raw);
  const trace: TraceLine[] = [];

  const egi = d.pgi * (1 - d.vacancy);
  trace.push({ label: "Effective gross income", formula: `${usd(d.pgi)} × (1 − ${pct(d.vacancy)})`, value: usd(egi) });
  const noi = egi - d.opex;
  trace.push({ label: "Net operating income", formula: `${usd(egi)} − ${usd(d.opex)}`, value: usd(noi) });
  const capRate = noi / d.price;
  trace.push({ label: "Cap rate on price", formula: `${usd(noi)} ÷ ${usd(d.price)}`, value: pct(capRate, 3) });

  const loanConstant = constantOf(d.rate, d.amortYears);
  trace.push({
    label: "Loan constant",
    formula: d.amortYears === 0 ? `interest only: the rate, ${pct(d.rate, 3)}` : `12 × PMT(${pct(d.rate, 3)}/12, ${d.amortYears * 12}, $1)`,
    value: pct(loanConstant, 3),
  });
  const spread = capRate - loanConstant;
  const sign: LeverageSign = Math.abs(spread) < NEUTRAL ? "neutral" : spread > 0 ? "positive" : "negative";
  const effect = sign === "positive" ? "debt raises the cash return" : sign === "negative" ? "debt lowers the cash return" : "debt leaves the cash return unchanged";
  trace.push({ label: "Cap rate less loan constant", formula: `${pct(capRate, 3)} − ${pct(loanConstant, 3)}: ${effect}`, value: pct(spread, 3) });

  const levels: LeverageLevel[] = d.ltvLevels.map((ltv) => {
    const at = `at ${pct(ltv, 1)}`;
    const loan = ltv * d.price;
    const equity = d.price - loan;
    const debtService = loanConstant * loan;
    const cashFlow = noi - debtService;
    const cashOnCash = cashFlow / equity;
    const dscr = debtService > 0 ? noi / debtService : null;
    const debtYield = loan > 0 ? noi / loan : null;
    const breakEvenOccupancy = (d.opex + debtService) / d.pgi;
    const breakEvenRentShare = (d.opex + debtService) / egi;
    trace.push({ label: `Loan ${at}`, formula: `${pct(ltv, 1)} × ${usd(d.price)}`, value: usd(loan) });
    trace.push({ label: `Equity ${at}`, formula: `${usd(d.price)} − ${usd(loan)}`, value: usd(equity) });
    trace.push({ label: `Debt service ${at}`, formula: `${pct(loanConstant, 3)} × ${usd(loan)}`, value: usd(debtService) });
    trace.push({ label: `Cash flow after debt ${at}`, formula: `${usd(noi)} − ${usd(debtService)}`, value: usd(cashFlow) });
    trace.push({
      label: `Cash-on-cash ${at}`,
      formula: `${usd(cashFlow)} ÷ ${usd(equity)}${cashFlow < 0 ? ": cash flow below zero" : ""}`,
      value: pct(cashOnCash, 3),
    });
    trace.push({
      label: `Coverage (DSCR) ${at}`,
      formula: dscr === null ? "no debt service: not defined" : `${usd(noi)} ÷ ${usd(debtService)}`,
      value: dscr === null ? "none" : multiple(dscr),
    });
    trace.push({
      label: `Debt yield ${at}`,
      formula: debtYield === null ? "no loan: not defined" : `${usd(noi)} ÷ ${usd(loan)}`,
      value: debtYield === null ? "none" : pct(debtYield, 3),
    });
    trace.push({ label: `Break-even occupancy ${at}`, formula: `(${usd(d.opex)} + ${usd(debtService)}) ÷ ${usd(d.pgi)}`, value: pct(breakEvenOccupancy) });
    trace.push({ label: `Break-even share of rent ${at}`, formula: `(${usd(d.opex)} + ${usd(debtService)}) ÷ ${usd(egi)}`, value: pct(breakEvenRentShare) });
    return { ltv, loan, equity, debtService, cashFlow, cashOnCash, dscr, debtYield, breakEvenOccupancy, breakEvenRentShare, negativeCashFlow: cashFlow < 0 };
  });

  let comparison: IncrementalCost | null = null;
  const c = d.compare;
  if (c) {
    const H = c.holdYears * 12;
    const q1 = { loan: c.loan1, fee: c.fee1, rate: d.rate, amortYears: d.amortYears };
    const q2 = { loan: c.loan2, fee: c.fee2, rate: c.rate2, amortYears: c.amortYears2 };
    const swapped = q2.loan < q1.loan;
    const [lo, hi] = swapped ? [q2, q1] : [q1, q2];
    const first = quoteTerms(lo.loan, lo.fee, lo.rate, lo.amortYears, H);
    const second = quoteTerms(hi.loan, hi.fee, hi.rate, hi.amortYears, H);
    if (swapped) trace.push({ label: "Quotes put in order", formula: "quote 2 lends less, so it is compared as the smaller loan", value: "swapped" });
    trace.push({ label: "Smaller loan's monthly payment", formula: paymentFormula(first), value: usd(first.payment) });
    trace.push({ label: "Larger loan's monthly payment", formula: paymentFormula(second), value: usd(second.payment) });
    trace.push({ label: `Smaller loan's balance after ${H} months`, formula: balanceFormula(first, H), value: usd(first.balance) });
    trace.push({ label: `Larger loan's balance after ${H} months`, formula: balanceFormula(second, H), value: usd(second.balance) });
    const extraProceeds = second.loan - second.fee - (first.loan - first.fee);
    const extraPayment = second.payment - first.payment;
    const extraBalance = second.balance - first.balance;
    trace.push({
      label: "Extra cash at closing",
      formula: `(${usd(second.loan)} − ${usd(second.fee)}) − (${usd(first.loan)} − ${usd(first.fee)})`,
      value: usd(extraProceeds),
    });
    trace.push({ label: "Extra monthly payment", formula: `${usd(second.payment)} − ${usd(first.payment)}`, value: usd(extraPayment) });
    trace.push({ label: "Extra balance at payoff", formula: `${usd(second.balance)} − ${usd(first.balance)}`, value: usd(extraBalance) });

    // The extra loan from the borrower's side: cash in at closing, the extra
    // payment out each month, the extra balance out at the end of the hold.
    const flows = [extraProceeds, ...Array.from({ length: H }, (_, k) => -extraPayment - (k === H - 1 ? extraBalance : 0))];
    const changes = signChanges(flows);
    let monthly: number | null = null;
    let note: string | null = null;
    if (extraProceeds <= 0) {
      note =
        extraProceeds === 0
          ? "no extra proceeds: the larger loan nets no more cash after fees, so compare the rates directly"
          : "the larger loan nets less cash after fees, so there are no extra dollars to price";
    } else {
      monthly = irr(flows, 0.005);
      if (monthly === null) note = "no rate makes the extra payments and balance worth the extra cash";
      else if (changes > 1) note = "the extra flows change sign more than once, so this rate may not be the only one";
    }
    const nominal = monthly === null ? null : 12 * monthly;
    const effective = monthly === null ? null : (1 + monthly) ** 12 - 1;
    trace.push({
      label: "Monthly cost of the extra dollars",
      formula:
        monthly === null
          ? (note ?? "not defined")
          : `IRR of ${usd(extraProceeds)} in, ${usd(extraPayment)} out a month for ${H} months, ${usd(extraBalance)} more out at month ${H}`,
      value: monthly === null ? "none" : pct(monthly, 4),
    });
    if (monthly !== null && nominal !== null && effective !== null) {
      trace.push({ label: "Cost of the extra dollars, nominal", formula: `12 × ${pct(monthly, 4)}`, value: pct(nominal, 3) });
      trace.push({ label: "Cost of the extra dollars, effective", formula: `(1 + ${pct(monthly, 4)})^12 − 1`, value: pct(effective, 3) });
      trace.push({
        label: "Extra dollars' cost less the cap rate",
        formula: `${pct(effective, 3)} − ${pct(capRate, 3)}; compare it with the unlevered return or the equity's next-best use`,
        value: pct(effective - capRate, 3),
      });
      if (note) trace.push({ label: "More than one sign change", formula: note, value: `${changes} changes` });
    }
    comparison = { swapped, holdMonths: H, first, second, extraProceeds, extraPayment, extraBalance, signChanges: changes, monthlyRate: monthly, nominal, effective, note };
  }

  return { egi, noi, capRate, loanConstant, spread, sign, levels, comparison, trace };
}

export const LEVERAGE_EXAMPLE: LeverageInput = {
  price: 6_000_000,
  pgi: 600_000,
  vacancy: 0.05,
  opex: 150_000,
  rate: 0.055,
  amortYears: 30,
  ltvLevels: [0, 0.5, 0.6, 0.7],
  compare: {
    loan1: 3_600_000,
    fee1: 36_000,
    loan2: 4_200_000,
    rate2: 0.0625,
    amortYears2: 30,
    fee2: 42_000,
    holdYears: 5,
  },
};

export const leverageModule = defineModule({ id: "leverage", input: leverageInput, run: runLeverage, example: LEVERAGE_EXAMPLE });
