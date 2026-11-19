import { z } from "zod";
import { defineModule } from "./module";
import { multiple, num, pct, type TraceLine, usd } from "./trace";

// One stabilized year, no growth: potential gross income down to NOI, then value by
// direct capitalization, with the ratios a buyer reads beside it. Pure: no I/O, no clock.

const expenseLine = z
  .object({
    label: z.string().trim().min(1).max(60).describe('what the expense is, in a few words: "Property taxes"'),
    amount: z.number().min(0).describe("the expense for the year, dollars; 0 is allowed"),
  })
  .strict();

export const incomeValueInput = z
  .object({
    area: z.number().positive().nullable().describe("rentable area, square feet; null when not given (value per square foot is then not computed)"),
    pgi: z.number().positive().describe("potential gross income for the year: rent at full occupancy, dollars"),
    otherIncome: z.number().min(0).describe("other income for the year (parking, storage, fees), dollars, already net of its own loss; 0 for none"),
    vacancy: z.number().min(0).lt(1).describe("vacancy and collection loss as a decimal share of potential gross income: 0.05 is 5%"),
    expenses: z
      .array(expenseLine)
      .max(20)
      .describe("operating expenses as labeled lines, dollars a year each; an empty list means none. Leave out debt service, depreciation, income tax and capital items"),
    reserves: z.number().min(0).nullable().describe("replacement reserves for the year, dollars; null for none"),
    capRate: z.number().gt(0).lt(1).describe("cap rate as a decimal: 0.07 is 7%"),
    capitalize: z
      .enum(["afterReserves", "beforeReserves"])
      .describe('which NOI is capitalized: "afterReserves" (NOI less replacement reserves) or "beforeReserves"'),
    price: z.number().positive().nullable().describe("a price to test against the value, dollars; null for none"),
  })
  .strict()
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.expenses.forEach((e, i) => {
      const key = e.label.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: "each expense line needs its own name", path: ["expenses", i, "label"] });
      seen.add(key);
    });
  });

export type IncomeValueInput = z.infer<typeof incomeValueInput>;

export type StatementLine = {
  label: string;
  // "income" adds, "deduction" subtracts, "total" is a subtotal
  kind: "income" | "deduction" | "total";
  amount: number;
  perSf: number | null;
  shareOfEgi: number;
};

export type SensitivityRow = { capRate: number; value: number; valuePerSf: number | null };

export type IncomeValueResult = {
  vacancyLoss: number;
  egi: number;
  opex: number;
  // 0 when none was entered
  reserves: number;
  noiBeforeReserves: number;
  noiAfterReserves: number;
  capitalized: "afterReserves" | "beforeReserves";
  noiCapitalized: number;
  capRate: number;
  expenseRatio: number;
  expenseRatioWithReserves: number;
  // null when the capitalized NOI is zero or less: there is nothing to capitalize
  value: number | null;
  // null with no area, or no value
  valuePerSf: number | null;
  // null when no price is given
  gim: number | null;
  // null with no price, or when the capitalized NOI is zero or less
  impliedCapRate: number | null;
  // value minus price: positive means the price is below the value; a gap under half a cent is 0
  valueLessPrice: number | null;
  // each expense line, the reserves and the NOI after reserves as shares of EGI; they sum to one
  egiShares: Array<{ label: string; share: number }>;
  statement: StatementLine[];
  // value at the cap rate and 25 and 50 basis points either side; empty when there is no value
  sensitivity: SensitivityRow[];
  notes: string[];
  trace: TraceLine[];
};

export const SENSITIVITY_STEPS = [-0.005, -0.0025, 0, 0.0025, 0.005] as const;

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function runIncomeValue(raw: IncomeValueInput): IncomeValueResult {
  const d = incomeValueInput.parse(raw);
  const trace: TraceLine[] = [];
  const notes: string[] = [];
  const perSf = (x: number) => (d.area === null ? null : x / d.area);

  const vacancyLoss = d.pgi * d.vacancy;
  trace.push({ label: "Vacancy and collection loss", formula: `${usd(d.pgi)} × ${pct(d.vacancy)}`, value: usd(vacancyLoss) });

  const egi = d.pgi - vacancyLoss + d.otherIncome;
  trace.push({ label: "Effective gross income", formula: `${usd(d.pgi)} − ${usd(vacancyLoss)} + ${usd(d.otherIncome)} other income`, value: usd(egi) });

  const opex = sumOf(d.expenses.map((e) => e.amount));
  trace.push({
    label: "Operating expenses",
    formula:
      d.expenses.length === 0
        ? "no expense lines entered"
        : d.expenses.length <= 6
          ? d.expenses.map((e) => usd(e.amount)).join(" + ")
          : `sum of ${d.expenses.length} lines`,
    value: usd(opex),
  });

  const noiBeforeReserves = egi - opex;
  trace.push({ label: "NOI before reserves", formula: `${usd(egi)} − ${usd(opex)}`, value: usd(noiBeforeReserves) });

  const reserves = d.reserves ?? 0;
  const noiAfterReserves = noiBeforeReserves - reserves;
  trace.push({
    label: "NOI after reserves",
    formula: d.reserves === null ? `${usd(noiBeforeReserves)} − $0.00 (no reserves entered)` : `${usd(noiBeforeReserves)} − ${usd(reserves)}`,
    value: usd(noiAfterReserves),
  });

  // EGI is always above zero: potential gross income is positive and the loss share is under one.
  const expenseRatio = opex / egi;
  trace.push({ label: "Expense ratio", formula: `${usd(opex)} ÷ ${usd(egi)}`, value: pct(expenseRatio) });
  const expenseRatioWithReserves = (opex + reserves) / egi;
  trace.push({ label: "Expense ratio with reserves", formula: `(${usd(opex)} + ${usd(reserves)}) ÷ ${usd(egi)}`, value: pct(expenseRatioWithReserves) });

  const after = d.capitalize === "afterReserves";
  const noiCapitalized = after ? noiAfterReserves : noiBeforeReserves;
  const which = after ? "NOI after reserves" : "NOI before reserves";

  let value: number | null = null;
  if (noiCapitalized > 0) {
    value = noiCapitalized / d.capRate;
    trace.push({ label: `Value by direct capitalization, on ${which}`, formula: `${usd(noiCapitalized)} ÷ ${pct(d.capRate)}`, value: usd(value) });
  } else {
    trace.push({ label: `Value by direct capitalization, on ${which}`, formula: `${usd(noiCapitalized)} is zero or less: nothing to capitalize`, value: "not defined" });
    notes.push(`The ${which} is ${usd(noiCapitalized, false)}, so direct capitalization gives no value.`);
  }

  let valuePerSf: number | null = null;
  if (value !== null && d.area !== null) {
    valuePerSf = value / d.area;
    trace.push({ label: "Value per square foot", formula: `${usd(value)} ÷ ${num(d.area, 0)} SF`, value: usd(valuePerSf) });
  }

  let gim: number | null = null;
  let impliedCapRate: number | null = null;
  let valueLessPrice: number | null = null;
  if (d.price !== null) {
    gim = d.price / d.pgi;
    trace.push({ label: "Gross income multiplier", formula: `${usd(d.price)} ÷ ${usd(d.pgi)} potential gross income`, value: multiple(gim) });
    if (noiCapitalized > 0) {
      impliedCapRate = noiCapitalized / d.price;
      trace.push({ label: "Cap rate implied by the price", formula: `${usd(noiCapitalized)} ÷ ${usd(d.price)}`, value: pct(impliedCapRate, 3) });
    }
    if (value !== null) {
      // NOI over the cap rate is rarely exact in floating point, so a price equal to
      // the value can leave a gap of a fraction of a cent: under half a cent is no gap.
      const gap = value - d.price;
      valueLessPrice = Math.abs(gap) < 0.005 ? 0 : gap;
      trace.push({ label: "Value less price", formula: `${usd(value)} − ${usd(d.price)}`, value: usd(valueLessPrice) });
      // the note rounds to whole dollars, so a gap under half a dollar reads as equal
      if (valueLessPrice >= 0.5) notes.push(`The price is ${usd(valueLessPrice, false)} below the capitalized value.`);
      else if (valueLessPrice <= -0.5) notes.push(`The price is ${usd(-valueLessPrice, false)} above the capitalized value.`);
      else notes.push("The price equals the capitalized value, to the dollar.");
    }
  }

  // Value at the cap rate plus and minus 25 and 50 basis points; a rate at or below zero is skipped.
  const sensitivity: SensitivityRow[] = [];
  if (noiCapitalized > 0) {
    for (const step of SENSITIVITY_STEPS) {
      const rate = d.capRate + step;
      if (rate <= 0) continue;
      const v = noiCapitalized / rate;
      sensitivity.push({ capRate: rate, value: v, valuePerSf: perSf(v) });
      if (step !== 0) trace.push({ label: `Value at a ${pct(rate)} cap rate`, formula: `${usd(noiCapitalized)} ÷ ${pct(rate)}`, value: usd(v) });
    }
  }

  if (d.capRate < 0.02 || d.capRate > 0.15) {
    notes.push(`The cap rate entered is ${pct(d.capRate)}. Check that it was entered as intended: as a decimal, 0.07 is 7%.`);
  }

  const share = (x: number) => x / egi;
  const egiShares = [
    ...d.expenses.map((e) => ({ label: e.label, share: share(e.amount) })),
    { label: "Replacement reserves", share: share(reserves) },
    { label: "NOI after reserves", share: share(noiAfterReserves) },
  ];

  const line = (label: string, kind: StatementLine["kind"], amount: number): StatementLine => ({ label, kind, amount, perSf: perSf(amount), shareOfEgi: share(amount) });
  const statement: StatementLine[] = [
    line("Potential gross income", "income", d.pgi),
    line("Vacancy and collection loss", "deduction", vacancyLoss),
    line("Other income", "income", d.otherIncome),
    line("Effective gross income", "total", egi),
    ...d.expenses.map((e) => line(e.label, "deduction", e.amount)),
    line("Operating expenses", "total", opex),
    line("NOI before reserves", "total", noiBeforeReserves),
    line("Replacement reserves", "deduction", reserves),
    line("NOI after reserves", "total", noiAfterReserves),
  ];

  return {
    vacancyLoss,
    egi,
    opex,
    reserves,
    noiBeforeReserves,
    noiAfterReserves,
    capitalized: d.capitalize,
    noiCapitalized,
    capRate: d.capRate,
    expenseRatio,
    expenseRatioWithReserves,
    value,
    valuePerSf,
    gim,
    impliedCapRate,
    valueLessPrice,
    egiShares,
    statement,
    sensitivity,
    notes,
    trace,
  };
}

// Synthetic: round, made-up figures for a fictional building. Not a real deal and not a market rate.
export const INCOME_VALUE_EXAMPLE: IncomeValueInput = {
  area: 40_000,
  pgi: 500_000,
  otherIncome: 10_000,
  vacancy: 0.05,
  expenses: [
    { label: "Property taxes", amount: 50_000 },
    { label: "Insurance", amount: 15_000 },
    { label: "Repairs and maintenance", amount: 20_000 },
    { label: "Management", amount: 15_000 },
  ],
  reserves: 8_000,
  capRate: 0.07,
  capitalize: "afterReserves",
  price: 5_000_000,
};

export const incomeValueModule = defineModule({ id: "income-value", input: incomeValueInput, run: runIncomeValue, example: INCOME_VALUE_EXAMPLE });
