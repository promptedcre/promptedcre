import { z } from "zod";
import { annualSchedule } from "./debt";
import { irr } from "./finance";
import { multiple, pct, type TraceLine, usd } from "./trace";

export const returnsInput = z
  .object({
    price: z.number().positive(),
    closingCostPct: z.number().min(0).max(0.2).describe("decimal share of the price"),
    noi: z.number().positive().describe("year-1 net operating income, dollars"),
    noiGrowth: z.number().min(-0.2).max(0.3).describe("annual decimal, e.g. 0.03; stands in for rent growth"),
    holdYears: z.number().int().min(1).max(30),
    exitCap: z.number().positive().max(0.3).describe("decimal, applied to the NOI of the year after the sale"),
    saleCostPct: z.number().min(0).max(0.2).describe("decimal share of the sale price"),
    loan: z.number().min(0).describe("loan amount, dollars; 0 for none"),
    rate: z.number().min(0).max(0.3).describe("annual rate as a decimal"),
    amortYears: z.number().int().min(0).max(40),
    ioYears: z.number().int().min(0).max(40),
  })
  .strict()
  .refine((d) => d.loan < d.price * (1 + d.closingCostPct), { message: "the loan must leave some equity", path: ["loan"] });

export type ReturnsInput = z.infer<typeof returnsInput>;

export type ReturnsYear = {
  year: number;
  noi: number;
  debtService: number;
  saleProceeds: number; // net of sale costs, before the loan payoff
  loanPayoff: number;
  unlevered: number;
  levered: number;
};

export type ReturnsResult = {
  equity: number;
  exitValue: number;
  unleveredFlows: number[];
  leveredFlows: number[];
  unleveredIrr: number | null;
  leveredIrr: number | null;
  equityMultiple: number;
  cashOnCashYear1: number;
  averageCashOnCash: number;
  years: ReturnsYear[];
  sensitivity: { exitCaps: number[]; growths: number[]; irr: Array<Array<number | null>> };
  trace: TraceLine[];
  // Added outputs; they change no figure above. The hold years (1 = the first year)
  // whose debt service is interest only, in order: years 1 to min(ioYears, holdYears)
  // on an amortizing loan, every hold year on a loan with amortYears 0 (it never
  // amortizes), and none with no loan.
  interestOnlyYears: number[];
  // Whether year 1 is one of them, so cashOnCashYear1 was computed on an
  // interest-only payment rather than an amortizing one.
  cashOnCashYear1InterestOnly: boolean;
};

// Interest only means the year's payments carry no principal: during the stated
// interest-only period, or for the whole loan when there is no amortization. This
// follows the schedule in ./debt, which pays interest only through month ioYears × 12.
function interestOnlyYearsOf(d: ReturnsInput): number[] {
  if (d.loan <= 0) return [];
  const last = d.amortYears === 0 ? d.holdYears : Math.min(d.ioYears, d.holdYears);
  return Array.from({ length: last }, (_, i) => i + 1);
}

function flows(d: ReturnsInput) {
  const totalCost = d.price * (1 + d.closingCostPct);
  const equity = totalCost - d.loan;
  const debt = d.loan > 0 ? annualSchedule(d.loan, d.rate, d.amortYears, d.ioYears, d.holdYears) : [];
  const noiAt = (t: number) => d.noi * (1 + d.noiGrowth) ** (t - 1);
  const exitValue = noiAt(d.holdYears + 1) / d.exitCap;
  const netSale = exitValue * (1 - d.saleCostPct);
  const years: ReturnsYear[] = [];
  for (let t = 1; t <= d.holdYears; t += 1) {
    const noi = noiAt(t);
    const ds = debt[t - 1]?.payment ?? 0;
    const sale = t === d.holdYears ? netSale : 0;
    const payoff = t === d.holdYears ? (debt[t - 1]?.endBalance ?? 0) : 0;
    years.push({ year: t, noi, debtService: ds, saleProceeds: sale, loanPayoff: payoff, unlevered: noi + sale, levered: noi - ds + sale - payoff });
  }
  return {
    totalCost,
    equity,
    exitValue,
    netSale,
    years,
    unleveredFlows: [-totalCost, ...years.map((y) => y.unlevered)],
    leveredFlows: [-equity, ...years.map((y) => y.levered)],
  };
}

export function runReturns(raw: ReturnsInput): ReturnsResult {
  const d = returnsInput.parse(raw);
  const f = flows(d);
  const unleveredIrr = irr(f.unleveredFlows);
  const leveredIrr = irr(f.leveredFlows);

  // Shortfall years count as more equity; positive years as distributions.
  const extraEquity = f.leveredFlows.slice(1).filter((x) => x < 0).reduce((s, x) => s - x, 0);
  const distributions = f.leveredFlows.slice(1).filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const equityMultiple = distributions / (f.equity + extraEquity);
  const operating = f.years.map((y) => y.noi - y.debtService);
  const cashOnCashYear1 = (operating[0] ?? 0) / f.equity;
  const averageCashOnCash = operating.reduce((s, x) => s + x, 0) / operating.length / f.equity;

  const exitCaps = [-0.005, -0.0025, 0, 0.0025, 0.005].map((x) => Math.round((d.exitCap + x) * 1e6) / 1e6);
  const growths = [-0.01, -0.005, 0, 0.005, 0.01].map((x) => Math.round((d.noiGrowth + x) * 1e6) / 1e6);
  const grid = exitCaps.map((cap) => growths.map((g) => irr(flows({ ...d, exitCap: cap, noiGrowth: g }).leveredFlows)));

  const interestOnlyYears = interestOnlyYearsOf(d);

  const last = f.years[f.years.length - 1];
  const trace: TraceLine[] = [
    { label: "All-in cost", formula: `${usd(d.price)} × (1 + ${pct(d.closingCostPct)})`, value: usd(f.totalCost) },
    { label: "Equity", formula: `${usd(f.totalCost)} − ${usd(d.loan)} loan`, value: usd(f.equity) },
    {
      label: `NOI in year ${d.holdYears + 1}`,
      formula: `${usd(d.noi)} × (1 + ${pct(d.noiGrowth)})^${d.holdYears}`,
      value: usd(d.noi * (1 + d.noiGrowth) ** d.holdYears),
    },
    { label: "Sale price", formula: `year-${d.holdYears + 1} NOI ÷ ${pct(d.exitCap)} exit cap`, value: usd(f.exitValue) },
    { label: "Net sale proceeds", formula: `${usd(f.exitValue)} × (1 − ${pct(d.saleCostPct)})`, value: usd(f.netSale) },
    { label: "Loan payoff at sale", formula: `balance after ${d.holdYears} years`, value: usd(last?.loanPayoff ?? 0) },
    { label: "Unlevered IRR", formula: "IRR(all-in cost, NOI by year, net sale)", value: unleveredIrr === null ? "n/a" : pct(unleveredIrr) },
    { label: "Levered IRR", formula: "IRR(equity, NOI − debt service, net sale − payoff)", value: leveredIrr === null ? "n/a" : pct(leveredIrr) },
    { label: "Equity multiple", formula: `${usd(distributions)} ÷ ${usd(f.equity + extraEquity)}`, value: multiple(equityMultiple) },
    { label: "Year-1 cash-on-cash", formula: `${usd(operating[0] ?? 0)} ÷ ${usd(f.equity)}`, value: pct(cashOnCashYear1) },
  ];

  return {
    equity: f.equity,
    exitValue: f.exitValue,
    unleveredFlows: f.unleveredFlows,
    leveredFlows: f.leveredFlows,
    unleveredIrr,
    leveredIrr,
    equityMultiple,
    cashOnCashYear1,
    averageCashOnCash,
    years: f.years,
    sensitivity: { exitCaps, growths, irr: grid },
    trace,
    interestOnlyYears,
    cashOnCashYear1InterestOnly: interestOnlyYears.includes(1),
  };
}

export const RETURNS_EXAMPLE: ReturnsInput = {
  price: 10_000_000,
  closingCostPct: 0.02,
  noi: 600_000,
  noiGrowth: 0.03,
  holdYears: 5,
  exitCap: 0.065,
  saleCostPct: 0.02,
  loan: 6_000_000,
  rate: 0.065,
  amortYears: 30,
  ioYears: 0,
};
