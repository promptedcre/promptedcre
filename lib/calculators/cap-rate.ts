import { z } from "zod";
import { pmt } from "./finance";
import { defineModule } from "./module";
import { num, pct, type TraceLine, usd } from "./trace";

// A cap rate built three ways: extracted from comparable sales, the band of
// investment (loan constant and equity dividend rate), and the lender's
// coverage formula. Each method runs when its inputs are given; the result is
// the range they span. Rates are decimals; money is dollars; NOI is a year's.

const comp = z
  .object({
    label: z.string().trim().min(1).max(60).describe("a short name for the sale, e.g. 'Sale A'"),
    price: z.number().describe("the sale price, dollars; more than zero"),
    noi: z.number().describe("the buyer's first-year net operating income at the sale, dollars a year; more than zero"),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!(c.price > 0)) ctx.addIssue({ code: "custom", path: ["price"], message: `price must be more than zero for ${c.label}` });
    if (!(c.noi > 0)) ctx.addIssue({ code: "custom", path: ["noi"], message: `NOI must be more than zero for ${c.label}` });
  });

export const capRateInput = z
  .object({
    comps: z
      .array(comp)
      .max(20)
      .describe("comparable sales, each with price and first-year NOI; an empty list skips extraction"),
    ltv: z
      .number()
      .gt(0)
      .lt(1)
      .nullable()
      .describe("loan-to-value as a decimal: 0.60 is 60%; null, with rate and amortYears null, skips the loan"),
    rate: z.number().min(0).max(0.3).nullable().describe("the loan's annual interest rate as a decimal: 0.06 is 6%; null skips the loan"),
    amortYears: z
      .number()
      .int()
      .min(0)
      .max(40)
      .nullable()
      .describe("amortization in whole years, payments monthly; 0 means interest only; null skips the loan"),
    equityDividendRate: z
      .number()
      .gt(0)
      .lt(1)
      .nullable()
      .describe("the first-year cash flow after debt service an equity investor requires, over the equity, as a decimal; null skips the band of investment"),
    minDscr: z
      .number()
      .gt(0)
      .max(5)
      .nullable()
      .describe("the lender's minimum debt service coverage, e.g. 1.25; null skips the lender's formula"),
  })
  .strict()
  .superRefine((d, ctx) => {
    const keys = ["ltv", "rate", "amortYears"] as const;
    const given = keys.filter((k) => d[k] !== null).length;
    if (given > 0 && given < 3) {
      for (const k of keys) {
        if (d[k] === null) {
          ctx.addIssue({ code: "custom", path: [k], message: "the loan needs loan-to-value, rate and amortization together; leave all three blank to skip it" });
        }
      }
    }
    const hasLoan = given === 3;
    if (hasLoan && d.amortYears === 0 && d.rate === 0) {
      ctx.addIssue({ code: "custom", path: ["rate"], message: "an interest-only loan at a zero rate has no debt service, so it gives no loan constant" });
    }
    if (d.equityDividendRate !== null && !hasLoan) {
      ctx.addIssue({ code: "custom", path: ["equityDividendRate"], message: "the band of investment needs the loan: set loan-to-value, rate and amortization, or leave this blank" });
    }
    if (d.minDscr !== null && !hasLoan) {
      ctx.addIssue({ code: "custom", path: ["minDscr"], message: "the lender's formula needs the loan: set loan-to-value, rate and amortization, or leave this blank" });
    }
    const runs = d.comps.length > 0 || (hasLoan && (d.equityDividendRate !== null || d.minDscr !== null));
    if (!runs) {
      ctx.addIssue({
        code: "custom",
        path: ["comps"],
        message: "give at least one method: a comparable sale, or the loan with an equity dividend rate or a minimum coverage",
      });
    }
  });

export type CapRateInput = z.infer<typeof capRateInput>;

export type CapRateMethod = "extraction" | "band" | "lender";

export type CapRateComp = {
  label: string;
  price: number;
  noi: number;
  capRate: number; // noi / price
  priceShare: number; // price / total price of all comps; the shares sum to one
};

export type CapRateResult = {
  comps: CapRateComp[];
  // null when no comps were given
  extraction: { count: number; mean: number; median: number; weighted: number; low: number; high: number; totalPrice: number; totalNoi: number } | null;
  // null when no loan was given; the payment is 0 for an interest-only loan
  monthlyPaymentPerDollar: number | null;
  loanConstant: number | null; // a year's debt service per dollar of loan
  band: { debtPart: number; equityPart: number; rate: number } | null;
  lender: number | null;
  // the methods that ran, in a fixed order; extraction stands in as its mean
  methods: Array<{ key: CapRateMethod; label: string; rate: number }>;
  low: { key: CapRateMethod; rate: number };
  high: { key: CapRateMethod; rate: number };
  spread: number; // high less low, as a decimal
  notes: string[];
  trace: TraceLine[];
};

export const METHOD_LABEL: Record<CapRateMethod, string> = {
  extraction: "Comparable sales (mean)",
  band: "Band of investment",
  lender: "Lender's formula",
};

export function basisPoints(x: number): string {
  return `${num(x * 10_000, 0)} bp`;
}

export function runCapRate(raw: CapRateInput): CapRateResult {
  const d = capRateInput.parse(raw);
  const trace: TraceLine[] = [];
  const notes: string[] = [];

  // 1. Extraction from comparable sales.
  const totalPrice = d.comps.reduce((s, c) => s + c.price, 0);
  const totalNoi = d.comps.reduce((s, c) => s + c.noi, 0);
  const comps: CapRateComp[] = d.comps.map((c) => ({
    label: c.label,
    price: c.price,
    noi: c.noi,
    capRate: c.noi / c.price,
    priceShare: c.price / totalPrice,
  }));
  for (const c of comps) {
    trace.push({ label: `Cap rate, ${c.label}`, formula: `${usd(c.noi)} ÷ ${usd(c.price)}`, value: pct(c.capRate) });
  }
  let extraction: CapRateResult["extraction"] = null;
  if (comps.length > 0) {
    const rates = comps.map((c) => c.capRate);
    const m = rates.length;
    const mean = rates.reduce((s, x) => s + x, 0) / m;
    const sorted = [...rates].sort((a, b) => a - b);
    const mid = Math.floor(m / 2);
    const median = m % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    const weighted = totalNoi / totalPrice;
    const low = sorted[0] ?? 0;
    const high = sorted[m - 1] ?? 0;
    extraction = { count: m, mean, median, weighted, low, high, totalPrice, totalNoi };
    trace.push({ label: "Mean of the sales", formula: `(${rates.map((x) => pct(x)).join(" + ")}) ÷ ${m}`, value: pct(mean) });
    trace.push({
      label: "Median of the sales",
      formula: m % 2 === 1 ? `the middle of ${m} sorted rates` : `(${pct(sorted[mid - 1] ?? 0)} + ${pct(sorted[mid] ?? 0)}) ÷ 2, the middle two of ${m}`,
      value: pct(median),
    });
    trace.push({ label: "Price-weighted rate", formula: `total NOI ${usd(totalNoi)} ÷ total price ${usd(totalPrice)}`, value: pct(weighted) });
    trace.push({ label: "Range of the sales", formula: `lowest and highest of ${m} rates`, value: `${pct(low)} to ${pct(high)}` });
  }

  // 2. The loan constant: a year's debt service per dollar of loan, payments monthly.
  let monthlyPaymentPerDollar: number | null = null;
  let loanConstant: number | null = null;
  if (d.ltv !== null && d.rate !== null && d.amortYears !== null) {
    if (d.amortYears === 0) {
      monthlyPaymentPerDollar = 0;
      loanConstant = d.rate;
      trace.push({ label: "Loan constant", formula: `interest only: the annual rate ${pct(d.rate)}`, value: pct(loanConstant) });
    } else {
      const n = d.amortYears * 12;
      monthlyPaymentPerDollar = -pmt(d.rate / 12, n, 1);
      loanConstant = 12 * monthlyPaymentPerDollar;
      trace.push({ label: "Monthly payment per $1 of loan", formula: `PMT(${pct(d.rate)}/12, ${n}, $1)`, value: num(monthlyPaymentPerDollar, 8) });
      trace.push({ label: "Loan constant", formula: `12 × ${num(monthlyPaymentPerDollar, 8)}`, value: pct(loanConstant) });
    }
  }

  // 3. Band of investment: the debt share at the loan constant, the equity share at its dividend rate.
  let band: CapRateResult["band"] = null;
  if (loanConstant !== null && d.ltv !== null && d.equityDividendRate !== null) {
    const debtPart = d.ltv * loanConstant;
    const equityPart = (1 - d.ltv) * d.equityDividendRate;
    band = { debtPart, equityPart, rate: debtPart + equityPart };
    trace.push({ label: "Debt part", formula: `loan-to-value ${pct(d.ltv)} × loan constant ${pct(loanConstant)}`, value: pct(debtPart) });
    trace.push({ label: "Equity part", formula: `equity share ${pct(1 - d.ltv)} × equity dividend rate ${pct(d.equityDividendRate)}`, value: pct(equityPart) });
    trace.push({ label: "Band of investment", formula: `${pct(debtPart)} + ${pct(equityPart)}`, value: pct(band.rate) });
  }

  // 4. Lender's formula: the cap rate at which a loan at this loan-to-value just meets the coverage.
  let lender: number | null = null;
  if (loanConstant !== null && d.ltv !== null && d.minDscr !== null) {
    lender = d.minDscr * loanConstant * d.ltv;
    trace.push({
      label: "Lender's formula",
      formula: `coverage ${num(d.minDscr)}x × loan constant ${pct(loanConstant)} × loan-to-value ${pct(d.ltv)}`,
      value: pct(lender),
    });
    if (d.minDscr < 1) notes.push("A minimum coverage below 1.00x lets the debt service exceed the NOI.");
  }

  // 5. The range the methods span.
  const methods: CapRateResult["methods"] = [];
  if (extraction) methods.push({ key: "extraction", label: METHOD_LABEL.extraction, rate: extraction.mean });
  if (band) methods.push({ key: "band", label: METHOD_LABEL.band, rate: band.rate });
  if (lender !== null) methods.push({ key: "lender", label: METHOD_LABEL.lender, rate: lender });
  // the schema guarantees at least one method
  const first = methods[0] ?? { key: "extraction" as const, label: METHOD_LABEL.extraction, rate: Number.NaN };
  const lowM = methods.reduce((a, b) => (b.rate < a.rate ? b : a), first);
  const highM = methods.reduce((a, b) => (b.rate > a.rate ? b : a), first);
  const spread = highM.rate - lowM.rate;
  const n = methods.length;
  trace.push({ label: "Low end", formula: n === 1 ? "one method ran" : `lowest of ${n} methods: ${METHOD_LABEL[lowM.key].toLowerCase()}`, value: pct(lowM.rate) });
  trace.push({ label: "High end", formula: n === 1 ? "one method ran" : `highest of ${n} methods: ${METHOD_LABEL[highM.key].toLowerCase()}`, value: pct(highM.rate) });
  trace.push({ label: "Spread", formula: `${pct(highM.rate)} − ${pct(lowM.rate)}`, value: basisPoints(spread) });

  return {
    comps,
    extraction,
    monthlyPaymentPerDollar,
    loanConstant,
    band,
    lender,
    methods,
    low: { key: lowM.key, rate: lowM.rate },
    high: { key: highM.key, rate: highM.rate },
    spread,
    notes,
    trace,
  };
}

// Made-up, round figures: four sales, a 60% loan at 6% over 30 years, an 8%
// equity dividend rate and a 1.25x coverage. Example values, not market levels.
export const CAP_RATE_EXAMPLE: CapRateInput = {
  comps: [
    { label: "Sale A", price: 5_000_000, noi: 325_000 },
    { label: "Sale B", price: 8_000_000, noi: 560_000 },
    { label: "Sale C", price: 2_000_000, noi: 150_000 },
    { label: "Sale D", price: 4_000_000, noi: 270_000 },
  ],
  ltv: 0.6,
  rate: 0.06,
  amortYears: 30,
  equityDividendRate: 0.08,
  minDscr: 1.25,
};

export const capRateModule = defineModule({ id: "cap-rate", input: capRateInput, run: runCapRate, example: CAP_RATE_EXAMPLE });
