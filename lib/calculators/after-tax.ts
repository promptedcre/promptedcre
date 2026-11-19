import { z } from "zod";
import { annualSchedule, type DebtYear } from "./debt";
import { irr, pmt } from "./finance";
import { taxGain } from "./gain-tax";
import { defineModule } from "./module";
import { pct, type TraceLine, usd } from "./trace";

// After-tax return on one leveraged hold. Taxable income each year is NOI less
// interest and straight-line depreciation; a year's loss is carried forward to
// later years of this property and then to its gain on sale; the gain is split
// into the part that is depreciation taken (unrecaptured section 1250 gain) and
// the rest. Every rate is an input. Arithmetic on the inputs, not tax advice.

const rateField = (what: string) =>
  z.number().min(0).lt(1).describe(`${what}, as a decimal: 0.25 is 25%; 0 when it does not apply. An input, never a default`);

export const afterTaxInput = z
  .object({
    price: z.number().positive().describe("purchase price, dollars"),
    closingCosts: z.number().min(0).describe("closing costs paid at purchase, dollars; added to the cost basis and depreciated with the building share"),
    landShare: z.number().min(0).lt(1).describe("share of the cost basis that is land, as a decimal: 0.25 is 25%; land is not depreciated"),
    recoveryYears: z.number().positive().max(100).describe("recovery period of the building in years, straight line, e.g. 39 or 27.5"),
    noi: z.number().positive().describe("year-1 net operating income, dollars"),
    noiGrowth: z.number().gt(-1).max(1).describe("annual NOI growth as a decimal, e.g. 0.03"),
    holdYears: z.number().int().min(1).max(30).describe("years held; the sale is at the end of the last year"),
    exitCap: z.number().positive().lt(1).describe("exit cap rate as a decimal, applied to the NOI of the year after the sale"),
    saleCostPct: z.number().min(0).lt(1).describe("sale costs as a decimal share of the sale price"),
    loan: z.number().min(0).describe("loan amount at purchase, dollars; 0 for all cash"),
    rate: z.number().min(0).max(0.3).describe("annual interest rate as a decimal: 0.065 is 6.5%; paid monthly at the rate divided by 12"),
    amortYears: z.number().int().min(0).max(40).describe("amortization in years, counted from the end of the interest-only period; 0 means interest only for the whole hold"),
    ioYears: z.number().int().min(0).max(40).describe("interest-only years at the start of the loan; 0 for none"),
    ordinaryRate: rateField("ordinary income tax rate on the yearly taxable income"),
    capitalGainRate: rateField("long-term capital gain rate on the gain beyond depreciation taken"),
    unrecapturedRate: rateField("rate on unrecaptured section 1250 gain, the part of the gain that is depreciation taken"),
    niiRate: rateField("net investment income tax rate, added to every other rate"),
  })
  .strict()
  .refine((d) => d.loan < d.price + d.closingCosts, { message: "the loan must leave some equity: keep it under the price plus closing costs", path: ["loan"] })
  .refine((d) => d.loan === 0 || d.amortYears === 0 || d.holdYears <= d.ioYears + d.amortYears, {
    message: "the loan would be paid off before the sale: keep the hold within the interest-only years plus the amortization",
    path: ["holdYears"],
  });

export type AfterTaxInput = z.infer<typeof afterTaxInput>;

export type AfterTaxYear = {
  year: number;
  noi: number;
  debtService: number;
  interest: number;
  principal: number;
  depreciation: number;
  taxableIncome: number; // NOI − interest − depreciation; negative is a loss
  lossUsed: number; // loss carried in from earlier years, used this year
  lossCarried: number; // loss carried forward at the end of the year
  tax: number;
  beforeTax: number; // NOI − debt service
  afterTax: number; // before tax − tax
};

export type AfterTaxSale = {
  noiNextYear: number;
  price: number;
  costs: number;
  loanPayoff: number;
  depreciationTaken: number;
  adjustedBasis: number;
  gain: number; // negative is a loss on sale, not credited here
  unrecaptured: number; // part of a positive gain that is depreciation taken
  rest: number; // the rest of a positive gain
  lossCarriedIn: number; // operating loss still carried at the sale
  lossUsedOnRest: number;
  lossUsedOnUnrecaptured: number;
  lossUnused: number; // carried loss larger than the gain: not credited here
  taxOnUnrecaptured: number;
  taxOnRest: number;
  tax: number;
  netBeforeTax: number;
  netAfterTax: number;
};

export type AfterTaxResult = {
  costBasis: number;
  land: number;
  depreciableBasis: number;
  annualDepreciation: number;
  equity: number;
  operatingRate: number;
  years: AfterTaxYear[];
  sale: AfterTaxSale;
  preTaxFlows: number[];
  afterTaxFlows: number[];
  preTaxIrr: number | null;
  afterTaxIrr: number | null;
  irrDifference: number | null; // pre-tax IRR − after-tax IRR
  preTaxSignChanges: number;
  afterTaxSignChanges: number;
  operatingTax: number; // tax over the hold, before the sale
  totalTax: number; // operating tax + tax on sale
  preTaxCash: number; // every pre-tax flow after the equity, summed
  afterTaxCash: number; // every after-tax flow after the equity, summed
  trace: TraceLine[];
};

// Flows that cross zero more than once can have more than one IRR.
export function signChanges(flows: number[]): number {
  let n = 0;
  let last = 0;
  for (const f of flows) {
    if (f === 0) continue;
    if (last !== 0 && Math.sign(f) !== Math.sign(last)) n += 1;
    last = f;
  }
  return n;
}

const irrText = (x: number | null, n: number) => (x === null ? "none: the flows never change sign" : n > 1 ? `${pct(x)} (flows change sign ${n} times; may not be unique)` : pct(x));

export function runAfterTax(raw: AfterTaxInput): AfterTaxResult {
  const d = afterTaxInput.parse(raw);
  const trace: TraceLine[] = [];
  const costBasis = d.price + d.closingCosts;
  const land = costBasis * d.landShare;
  const depreciableBasis = costBasis - land;
  const annualDepreciation = depreciableBasis / d.recoveryYears;
  const equity = costBasis - d.loan;
  const operatingRate = d.ordinaryRate + d.niiRate;

  trace.push({ label: "Cost basis", formula: `${usd(d.price)} price + ${usd(d.closingCosts)} closing costs`, value: usd(costBasis) });
  trace.push({ label: "Land, not depreciated", formula: `${usd(costBasis)} × ${pct(d.landShare)}`, value: usd(land) });
  trace.push({ label: "Depreciable basis", formula: `${usd(costBasis)} − ${usd(land)}`, value: usd(depreciableBasis) });
  trace.push({ label: "Depreciation, a full year", formula: `${usd(depreciableBasis)} ÷ ${d.recoveryYears} years, straight line`, value: usd(annualDepreciation) });
  trace.push({ label: "Equity", formula: `${usd(costBasis)} − ${usd(d.loan)} loan`, value: usd(equity) });
  trace.push({ label: "Tax rate on yearly income", formula: `${pct(d.ordinaryRate)} ordinary + ${pct(d.niiRate)} net investment income`, value: pct(operatingRate) });

  const debt: DebtYear[] = d.loan > 0 ? annualSchedule(d.loan, d.rate, d.amortYears, d.ioYears, d.holdYears) : [];
  if (d.loan > 0) {
    const ioMonths = d.amortYears === 0 ? d.holdYears * 12 : Math.min(d.ioYears, d.holdYears) * 12;
    if (ioMonths > 0) trace.push({ label: "Interest-only payment, a month", formula: `${usd(d.loan)} × ${pct(d.rate)} ÷ 12`, value: usd((d.loan * d.rate) / 12) });
    if (d.amortYears > 0 && d.ioYears < d.holdYears) {
      trace.push({ label: "Amortizing payment, a month", formula: `PMT(${pct(d.rate)} ÷ 12, ${d.amortYears * 12}, ${usd(d.loan)})`, value: usd(-pmt(d.rate / 12, d.amortYears * 12, d.loan)) });
    }
  }

  const years: AfterTaxYear[] = [];
  let carried = 0;
  let taken = 0;
  for (let y = 1; y <= d.holdYears; y += 1) {
    const noi = d.noi * (1 + d.noiGrowth) ** (y - 1);
    const dy = debt[y - 1];
    const interest = dy?.interest ?? 0;
    const principal = dy?.principal ?? 0;
    const debtService = dy?.payment ?? 0;
    // Straight line until the depreciable basis is used up (a hold longer than the recovery period).
    const depreciation = Math.max(0, Math.min(annualDepreciation, depreciableBasis - taken));
    taken += depreciation;
    const taxableIncome = noi - interest - depreciation;
    let lossUsed = 0;
    let tax = 0;
    const carriedIn = carried;
    if (taxableIncome < 0) {
      carried += -taxableIncome;
    } else {
      lossUsed = Math.min(carried, taxableIncome);
      carried -= lossUsed;
      tax = (taxableIncome - lossUsed) * operatingRate;
    }
    const beforeTax = noi - debtService;
    const afterTax = beforeTax - tax;
    years.push({ year: y, noi, debtService, interest, principal, depreciation, taxableIncome, lossUsed, lossCarried: carried, tax, beforeTax, afterTax });

    trace.push({
      label: `Year ${y} taxable income`,
      formula: `${usd(noi)} NOI − ${usd(interest)} interest − ${usd(depreciation)} depreciation`,
      value: usd(taxableIncome),
    });
    trace.push({
      label: `Year ${y} tax`,
      formula:
        taxableIncome < 0
          ? `a loss: no tax; ${usd(-taxableIncome)} carried forward, ${usd(carried)} in all`
          : lossUsed > 0
            ? `(${usd(taxableIncome)} − ${usd(lossUsed)} of the ${usd(carriedIn)} loss carried in) × ${pct(operatingRate)}`
            : `${usd(taxableIncome)} × ${pct(operatingRate)}`,
      value: usd(tax),
    });
    trace.push({ label: `Year ${y} cash flow before tax`, formula: `${usd(noi)} NOI − ${usd(debtService)} debt service`, value: usd(beforeTax) });
    trace.push({ label: `Year ${y} cash flow after tax`, formula: `${usd(beforeTax)} − ${usd(tax)} tax`, value: usd(afterTax) });
  }

  // The sale, at the end of the last year.
  const N = d.holdYears;
  const noiNextYear = d.noi * (1 + d.noiGrowth) ** N;
  const salePrice = noiNextYear / d.exitCap;
  const costs = salePrice * d.saleCostPct;
  // The shared schedule closes a paid-off loan at exactly zero; this floor stays as a
  // second guard, so the payoff is never below zero.
  const loanPayoff = Math.max(0, debt[N - 1]?.endBalance ?? 0);
  const adjustedBasis = costBasis - taken;
  const gain = salePrice - costs - adjustedBasis;
  const positive = Math.max(gain, 0);
  // The split and its tax are the shared helper's (gain-tax.ts), so this figure cannot
  // drift from exchange-1031 and sale-proceeds. Only this calculator passes a carried
  // loss: it follows the operating losses of the hold into the sale, where they offset
  // the rest of the gain first, then the unrecaptured part.
  const g = taxGain(gain, taken, { capitalGain: d.capitalGainRate, unrecaptured: d.unrecapturedRate, nii: d.niiRate }, carried);
  const { unrecaptured, rest, lossCarriedIn, lossUsedOnRest, lossUsedOnUnrecaptured, lossUnused, taxOnUnrecaptured, taxOnRest } = g;
  const saleTax = g.tax;
  const netBeforeTax = salePrice - costs - loanPayoff;
  const netAfterTax = netBeforeTax - saleTax;

  trace.push({ label: `NOI in year ${N + 1}`, formula: `${usd(d.noi)} × (1 + ${pct(d.noiGrowth)})^${N}`, value: usd(noiNextYear) });
  trace.push({ label: "Sale price", formula: `${usd(noiNextYear)} ÷ ${pct(d.exitCap)} exit cap`, value: usd(salePrice) });
  trace.push({ label: "Sale costs", formula: `${usd(salePrice)} × ${pct(d.saleCostPct)}`, value: usd(costs) });
  trace.push({ label: "Loan payoff at sale", formula: d.loan > 0 ? `balance after ${N} years` : "no loan", value: usd(loanPayoff) });
  trace.push({ label: "Depreciation taken", formula: `the ${N} years' depreciation, summed`, value: usd(taken) });
  trace.push({ label: "Adjusted basis", formula: `${usd(costBasis)} − ${usd(taken)}`, value: usd(adjustedBasis) });
  trace.push({ label: "Gain on sale", formula: `${usd(salePrice)} − ${usd(costs)} − ${usd(adjustedBasis)}`, value: usd(gain) });
  if (gain < 0) {
    trace.push({ label: "Loss on sale, not credited", formula: "a loss on sale is not set against other income here: no tax on sale", value: usd(-gain) });
  }
  trace.push({ label: "Unrecaptured section 1250 gain", formula: `smaller of ${usd(taken)} depreciation taken and ${usd(positive)} gain`, value: usd(unrecaptured) });
  trace.push({ label: "Rest of the gain", formula: `${usd(positive)} − ${usd(unrecaptured)}`, value: usd(rest) });
  if (lossCarriedIn > 0) {
    trace.push({
      label: "Carried loss used against the gain",
      formula: `${usd(lossCarriedIn)} carried: ${usd(lossUsedOnRest)} against the rest, then ${usd(lossUsedOnUnrecaptured)} against the unrecaptured part`,
      value: usd(lossUsedOnRest + lossUsedOnUnrecaptured),
    });
  }
  trace.push({
    label: "Tax on the unrecaptured gain",
    formula: `(${usd(unrecaptured)} − ${usd(lossUsedOnUnrecaptured)}) × (${pct(d.unrecapturedRate)} + ${pct(d.niiRate)})`,
    value: usd(taxOnUnrecaptured),
  });
  trace.push({
    label: "Tax on the rest of the gain",
    formula: `(${usd(rest)} − ${usd(lossUsedOnRest)}) × (${pct(d.capitalGainRate)} + ${pct(d.niiRate)})`,
    value: usd(taxOnRest),
  });
  trace.push({ label: "Tax on sale", formula: `${usd(taxOnUnrecaptured)} + ${usd(taxOnRest)}`, value: usd(saleTax) });
  if (lossUnused > 0) {
    trace.push({ label: "Carried loss left unused", formula: "larger than the gain; not credited against other income here", value: usd(lossUnused) });
  }
  trace.push({ label: "Net sale proceeds before tax", formula: `${usd(salePrice)} − ${usd(costs)} − ${usd(loanPayoff)} payoff`, value: usd(netBeforeTax) });
  trace.push({ label: "Net sale proceeds after tax", formula: `${usd(netBeforeTax)} − ${usd(saleTax)}`, value: usd(netAfterTax) });

  const preTaxFlows = [-equity, ...years.map((y, i) => y.beforeTax + (i === N - 1 ? netBeforeTax : 0))];
  const afterTaxFlows = [-equity, ...years.map((y, i) => y.afterTax + (i === N - 1 ? netAfterTax : 0))];
  const preTaxIrr = irr(preTaxFlows);
  const afterTaxIrr = irr(afterTaxFlows);
  const irrDifference = preTaxIrr !== null && afterTaxIrr !== null ? preTaxIrr - afterTaxIrr : null;
  const preTaxSignChanges = signChanges(preTaxFlows);
  const afterTaxSignChanges = signChanges(afterTaxFlows);
  const operatingTax = years.reduce((s, y) => s + y.tax, 0);
  const totalTax = operatingTax + saleTax;
  const preTaxCash = preTaxFlows.slice(1).reduce((s, x) => s + x, 0);
  const afterTaxCash = afterTaxFlows.slice(1).reduce((s, x) => s + x, 0);

  trace.push({ label: "Pre-tax IRR", formula: `IRR(${usd(-equity)} equity, cash flow before tax by year, net sale before tax in year ${N})`, value: irrText(preTaxIrr, preTaxSignChanges) });
  trace.push({ label: "After-tax IRR", formula: `IRR(${usd(-equity)} equity, cash flow after tax by year, net sale after tax in year ${N})`, value: irrText(afterTaxIrr, afterTaxSignChanges) });
  trace.push({
    label: "Return lost to tax",
    formula: irrDifference === null ? "needs both IRRs" : `${pct(preTaxIrr ?? 0)} − ${pct(afterTaxIrr ?? 0)}`,
    value: irrDifference === null ? "none" : `${(irrDifference * 100).toFixed(2)} points`,
  });
  trace.push({ label: "Tax over the hold and sale", formula: `${usd(operatingTax)} on yearly income + ${usd(saleTax)} on sale`, value: usd(totalTax) });

  return {
    costBasis,
    land,
    depreciableBasis,
    annualDepreciation,
    equity,
    operatingRate,
    years,
    sale: {
      noiNextYear,
      price: salePrice,
      costs,
      loanPayoff,
      depreciationTaken: taken,
      adjustedBasis,
      gain,
      unrecaptured,
      rest,
      lossCarriedIn,
      lossUsedOnRest,
      lossUsedOnUnrecaptured,
      lossUnused,
      taxOnUnrecaptured,
      taxOnRest,
      tax: saleTax,
      netBeforeTax,
      netAfterTax,
    },
    preTaxFlows,
    afterTaxFlows,
    preTaxIrr,
    afterTaxIrr,
    irrDifference,
    preTaxSignChanges,
    afterTaxSignChanges,
    operatingTax,
    totalTax,
    preTaxCash,
    afterTaxCash,
    trace,
  };
}

// Synthetic: round, made-up figures. The four tax rates are example values (top
// federal rates read on 2026-11-13), not defaults: enter your own.
export const AFTER_TAX_EXAMPLE: AfterTaxInput = {
  price: 5_000_000,
  closingCosts: 100_000,
  landShare: 0.25,
  recoveryYears: 39,
  noi: 350_000,
  noiGrowth: 0.03,
  holdYears: 7,
  exitCap: 0.07,
  saleCostPct: 0.03,
  loan: 3_250_000,
  rate: 0.065,
  amortYears: 25,
  ioYears: 1,
  ordinaryRate: 0.37,
  capitalGainRate: 0.2,
  unrecapturedRate: 0.25,
  niiRate: 0.038,
};

export const afterTaxModule = defineModule({ id: "after-tax", input: afterTaxInput, run: runAfterTax, example: AFTER_TAX_EXAMPLE });
