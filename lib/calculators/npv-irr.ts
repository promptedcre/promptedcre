import { z } from "zod";
import { irr, npv } from "./finance";
import { defineModule } from "./module";
import { num, pct, roundCents, type TraceLine, usd } from "./trace";

// Equity in at year 0, operating cash back each year, a net sale in the last year:
// NPV at a required return, the IRR, and how much of the IRR's present value comes
// from operations and how much from the sale. Annual periods, every flow at the end
// of its year. Pure: no I/O, no clock.

export const MAX_YEARS = 50;

export const npvIrrInput = z
  .object({
    equity: z.number().positive().describe("equity invested at year 0, dollars; entered as a positive amount and paid out at time 0"),
    operatingFlows: z
      .array(z.number().describe("one year's operating cash flow to equity, dollars; may be negative"))
      .min(1)
      .max(MAX_YEARS)
      .describe(
        "operating cash flow to equity for each year of the hold, after debt service and before the sale, dollars; year 1 first; any sign (a negative year is a capital call or shortfall); the list's length is the hold in years",
      ),
    saleProceeds: z
      .number()
      .min(0)
      .nullable()
      .describe(
        "net sale proceeds to equity in the final year, after selling costs and the loan payoff, dollars; entered apart from that year's operating flow; null (or 0) for no sale",
      ),
    requiredReturn: z.number().min(0).max(1).describe("the return the equity requires, an annual decimal: 0.08 is 8%; the rate NPV is discounted at"),
    financeRate: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .describe("for the modified IRR: the annual decimal rate negative flows are discounted to year 0 at; null to skip the modified IRR (give both rates or neither)"),
    reinvestmentRate: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .describe("for the modified IRR: the annual decimal rate positive flows are compounded to the final year at; null to skip the modified IRR (give both rates or neither)"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.financeRate === null && d.reinvestmentRate !== null) {
      ctx.addIssue({ code: "custom", message: "give a finance rate as well, or clear the reinvestment rate", path: ["financeRate"] });
    }
    if (d.reinvestmentRate === null && d.financeRate !== null) {
      ctx.addIssue({ code: "custom", message: "give a reinvestment rate as well, or clear the finance rate", path: ["reinvestmentRate"] });
    }
  });

export type NpvIrrInput = z.infer<typeof npvIrrInput>;

export type NpvIrrYear = {
  year: number;
  operating: number;
  // 0 in every year but the last, and in the last when there is no sale
  sale: number;
  cashFlow: number;
  pvAtRequired: number;
  // null when there is no IRR
  pvAtIrr: number | null;
  // undiscounted, from year 0 (the equity) through this year
  cumulative: number;
};

export type Partition = {
  operations: number;
  sale: number;
  // at the IRR: shares of the equity; at the required return: shares of the total
  // present value. Null where that total is zero or less.
  operationsShare: number | null;
  saleShare: number | null;
};

export type NpvIrrResult = {
  equity: number;
  requiredReturn: number;
  holdYears: number;
  // year 0 (the equity, negative) through the final year
  flows: number[];
  years: NpvIrrYear[];
  // every flow summed, undiscounted: the profit before the time value of money
  netCash: number;
  // the present value at the required return of years 1 to N
  presentValue: number;
  npv: number;
  profitabilityIndex: number;
  signChanges: number;
  // true when the flows change sign more than once: more than one rate may make NPV zero
  irrMayNotBeUnique: boolean;
  irr: number | null;
  // NPV recomputed at the IRR: zero within a fraction of a cent (null with no IRR)
  npvAtIrr: number | null;
  // the partition of the equity at the IRR (null with no IRR)
  atIrr: Partition | null;
  // the same split of the present value at the required return
  atRequired: Partition;
  // the first year cumulative cash, sale included, is zero or more; null if it never is
  paybackYear: number | null;
  // null unless both rates are given, or when no flow is positive
  mirr: number | null;
  mirrParts: { futureValueOfInflows: number; presentValueOfOutlays: number } | null;
  notes: string[];
  trace: TraceLine[];
};

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// A sum of dollars within a millionth of a dollar of zero is zero. Floating point leaves
// such a residue when cash back exactly repays the equity (100,000.30 less 50,000.10 less
// 50,000.20) or the required return is exactly the IRR; read raw, it would print as
// "-$0.00" and push payback past a year that does pay back.
const ZERO = 1e-6;
const tidy = (x: number) => (Math.abs(x) < ZERO ? 0 : x);

// Sign changes along the flows, zeros skipped.
export function countSignChanges(flows: number[]): number {
  let changes = 0;
  let last = 0;
  for (const f of flows) {
    if (f === 0) continue;
    const s = Math.sign(f);
    if (last !== 0 && s !== last) changes += 1;
    last = s;
  }
  return changes;
}

export function runNpvIrr(raw: NpvIrrInput): NpvIrrResult {
  const d = npvIrrInput.parse(raw);
  const trace: TraceLine[] = [];
  const notes: string[] = [];
  const n = d.operatingFlows.length;
  const sale = d.saleProceeds ?? 0;
  const k = d.requiredReturn;
  const last = d.operatingFlows[n - 1] ?? 0;
  const span = n === 1 ? "year 1" : `years 1–${n}`;

  const flows = [-d.equity, ...d.operatingFlows.map((x, i) => (i === n - 1 ? x + sale : x))];
  trace.push({ label: "Equity at year 0", formula: `${usd(d.equity)} paid in at time 0, entered as a negative flow`, value: usd(-d.equity) });
  trace.push({
    label: `Cash flow in year ${n}, the final year`,
    formula: d.saleProceeds === null ? `${usd(last)} operating; no sale entered` : `${usd(last)} operating + ${usd(sale)} net sale`,
    value: usd(flows[n] ?? 0),
  });

  const netCash = tidy(sumOf(flows));
  trace.push({ label: "Net cash, undiscounted", formula: `sum of ${span} − ${usd(d.equity)} equity`, value: usd(netCash) });

  // ---------- NPV at the required return ----------
  const npvAtK = tidy(npv(k, flows));
  const presentValue = npvAtK + d.equity;
  trace.push({ label: `Present value of the cash back at ${pct(k)}`, formula: `Σ CF_t ÷ (1 + ${pct(k)})^t, ${span}`, value: usd(presentValue) });
  trace.push({ label: `NPV at the ${pct(k)} required return`, formula: `${usd(presentValue)} − ${usd(d.equity)}`, value: usd(npvAtK) });
  const profitabilityIndex = presentValue / d.equity;
  trace.push({ label: "Profitability index", formula: `${usd(presentValue)} ÷ ${usd(d.equity)} (= 1 + NPV ÷ equity)`, value: num(profitabilityIndex, 3) });

  // ---------- IRR ----------
  const signChanges = countSignChanges(flows);
  const irrMayNotBeUnique = signChanges > 1;
  trace.push({
    label: irrMayNotBeUnique ? "Sign changes in the flows: the IRR may not be unique" : "Sign changes in the flows",
    formula: `count of sign changes from year 0 to year ${n}, zero years skipped`,
    value: String(signChanges),
  });
  if (irrMayNotBeUnique) {
    notes.push(`The flows change sign ${signChanges} times, so more than one rate can make NPV zero. The IRR shown is the one the search found; read it with the NPV.`);
  }

  const rate = irr(flows);
  if (rate === null) {
    // With no sign change there is provably no IRR. With one, a null only means the
    // search (Newton's method, then halving between −99.99% and 1,000%) did not find a
    // rate, so the words claim only that.
    const why =
      signChanges === 0
        ? "the flows never change sign, so no rate makes NPV zero"
        : "the search between −99.99% and 1,000% found no rate that makes NPV zero";
    trace.push({ label: "IRR", formula: `IRR(year 0 to year ${n}): ${why}`, value: "none" });
    notes.push(signChanges === 0 ? `There is no IRR: ${why}. The NPV still reads.` : `No IRR was found: ${why}. The NPV still reads.`);
  } else {
    trace.push({ label: "IRR", formula: `IRR(year 0 to year ${n}): the rate where NPV = 0`, value: pct(rate) });
  }

  const discount = (r: number, t: number) => (1 + r) ** t;
  const years: NpvIrrYear[] = [];
  let cumulative = -d.equity;
  d.operatingFlows.forEach((operating, i) => {
    const t = i + 1;
    const s = t === n ? sale : 0;
    const cf = operating + s;
    cumulative += cf;
    years.push({ year: t, operating, sale: s, cashFlow: cf, pvAtRequired: cf / discount(k, t), pvAtIrr: rate === null ? null : cf / discount(rate, t), cumulative: tidy(cumulative) });
  });

  // ---------- the partition ----------
  const opsPv = (r: number) => sumOf(d.operatingFlows.map((x, i) => x / discount(r, i + 1)));
  const salePv = (r: number) => sale / discount(r, n);

  let npvAtIrr: number | null = null;
  let atIrr: Partition | null = null;
  if (rate === null) {
    trace.push({ label: "Partition at the IRR", formula: "no IRR, so nothing to partition", value: "not defined" });
  } else {
    npvAtIrr = npv(rate, flows);
    trace.push({ label: "NPV at the IRR (check)", formula: `Σ CF_t ÷ (1 + ${pct(rate)})^t, year 0 to year ${n}`, value: usd(roundCents(npvAtIrr)) });
    const operations = opsPv(rate);
    const salePart = salePv(rate);
    atIrr = { operations, sale: salePart, operationsShare: operations / d.equity, saleShare: salePart / d.equity };
    trace.push({ label: "Present value of operations at the IRR", formula: `Σ operating_t ÷ (1 + ${pct(rate)})^t, ${span}`, value: usd(operations) });
    trace.push({
      label: "Present value of the sale at the IRR",
      formula: d.saleProceeds === null ? "no sale entered" : `${usd(sale)} ÷ (1 + ${pct(rate)})^${n}`,
      value: usd(salePart),
    });
    trace.push({ label: "Share of the IRR from operations", formula: `${usd(operations)} ÷ ${usd(d.equity)} equity`, value: pct(operations / d.equity) });
    trace.push({ label: "Share of the IRR from the sale", formula: `${usd(salePart)} ÷ ${usd(d.equity)} equity`, value: pct(salePart / d.equity) });
    if (operations < 0) notes.push("Operations are worth less than nothing at the IRR, so the sale carries more than all of the equity.");
  }

  const opsK = opsPv(k);
  const saleK = salePv(k);
  const totalK = opsK + saleK;
  const atRequired: Partition = {
    operations: opsK,
    sale: saleK,
    operationsShare: totalK > 0 ? opsK / totalK : null,
    saleShare: totalK > 0 ? saleK / totalK : null,
  };
  trace.push({ label: `Present value of operations at ${pct(k)}`, formula: `Σ operating_t ÷ (1 + ${pct(k)})^t, ${span}`, value: usd(opsK) });
  trace.push({
    label: `Present value of the sale at ${pct(k)}`,
    formula: d.saleProceeds === null ? "no sale entered" : `${usd(sale)} ÷ (1 + ${pct(k)})^${n}`,
    value: usd(saleK),
  });
  trace.push({
    label: `Share of the present value at ${pct(k)} from the sale`,
    formula: totalK > 0 ? `${usd(saleK)} ÷ ${usd(totalK)}` : `the present value is ${usd(totalK)}: no share to take`,
    value: atRequired.saleShare === null ? "not defined" : pct(atRequired.saleShare),
  });

  // ---------- payback ----------
  const paybackYear = years.find((y) => y.cumulative >= 0)?.year ?? null;
  trace.push({
    label: "Payback year",
    formula: "first year the cumulative cash from year 0, sale included, is $0 or more; undiscounted",
    value: paybackYear === null ? "never" : `year ${paybackYear}`,
  });
  if (paybackYear === null) notes.push("The cash back never covers the equity within the hold.");

  // ---------- modified IRR ----------
  let mirr: number | null = null;
  let mirrParts: NpvIrrResult["mirrParts"] = null;
  if (d.financeRate === null || d.reinvestmentRate === null) {
    trace.push({ label: "Modified IRR", formula: "no finance and reinvestment rates entered", value: "not computed" });
  } else {
    const rr = d.reinvestmentRate;
    const fr = d.financeRate;
    const futureValueOfInflows = sumOf(flows.map((cf, t) => (cf > 0 ? cf * discount(rr, n - t) : 0)));
    const presentValueOfOutlays = sumOf(flows.map((cf, t) => (cf < 0 ? -cf / discount(fr, t) : 0)));
    mirrParts = { futureValueOfInflows, presentValueOfOutlays };
    trace.push({ label: `Positive flows carried to year ${n} at ${pct(rr)}`, formula: `Σ CF_t × (1 + ${pct(rr)})^(${n} − t), positive years only`, value: usd(futureValueOfInflows) });
    trace.push({ label: `Outlays brought to year 0 at ${pct(fr)}`, formula: `Σ |CF_t| ÷ (1 + ${pct(fr)})^t, negative years only`, value: usd(presentValueOfOutlays) });
    if (futureValueOfInflows > 0) {
      mirr = (futureValueOfInflows / presentValueOfOutlays) ** (1 / n) - 1;
      trace.push({ label: "Modified IRR", formula: `(${usd(futureValueOfInflows)} ÷ ${usd(presentValueOfOutlays)})^(1/${n}) − 1`, value: pct(mirr) });
    } else {
      trace.push({ label: "Modified IRR", formula: "no positive flow to carry forward", value: "not defined" });
    }
  }

  return {
    equity: d.equity,
    requiredReturn: k,
    holdYears: n,
    flows,
    years,
    netCash,
    presentValue,
    npv: npvAtK,
    profitabilityIndex,
    signChanges,
    irrMayNotBeUnique,
    irr: rate,
    npvAtIrr,
    atIrr,
    atRequired,
    paybackYear,
    mirr,
    mirrParts,
    notes,
    trace,
  };
}

// Made-up figures for the worked example: $2M of equity, five years of rising cash, a sale.
export const NPV_IRR_EXAMPLE: NpvIrrInput = {
  equity: 2_000_000,
  operatingFlows: [100_000, 110_000, 120_000, 130_000, 140_000],
  saleProceeds: 2_600_000,
  requiredReturn: 0.08,
  financeRate: 0.06,
  reinvestmentRate: 0.05,
};

export const npvIrrModule = defineModule({ id: "npv-irr", input: npvIrrInput, run: runNpvIrr, example: NPV_IRR_EXAMPLE });
