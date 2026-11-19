// Test fixture, not the calculator: lib/calculators/sale-proceeds.ts as it stood before the shared
// gain-tax helper (lib/calculators/gain-tax.ts) was drawn out on 2026-11-14
// (git show HEAD:lib/calculators/sale-proceeds.ts, HEAD 7165049). Only the import paths differ from
// that source. Read by __tests__/calc-gain-tax.test.ts to show that no result changed.
// Do not edit and do not import from application code.

import { z } from "zod";
import { defineModule } from "@/lib/calculators/module";
import { pct, type TraceLine, usd } from "@/lib/calculators/trace";

// What a sale of a building already owned leaves the seller: selling costs, the
// amount realized, the adjusted basis, the gain or loss and the part of a gain that
// is depreciation taken, the tax on the gain at the rates entered, the cash at
// closing before tax and after, the lowest price that clears the debts, and the
// same sale at five prices.
//
// The conventions follow 26 U.S.C. 1001, 1011, 1012 and 1016 and 26 CFR
// 1.263(a)-1(e): gain is the amount realized less the adjusted basis; costs paid to
// facilitate the sale come off the amount realized, not off basis; basis is cost
// plus capital improvements less depreciation allowed or allowable. The payoffs
// reduce cash, not gain. The tax is priced exactly as exchange-1031 prices the tax
// on a whole gain: the part up to the depreciation taken at the unrecaptured rate,
// the rest at the capital gain rate, the net investment income rate added to both as
// if all of the gain were above that tax's threshold. A loss is not priced: what it
// may save in tax is not figured. Arithmetic on the inputs, not tax advice. Nothing
// is rounded until it is shown.

// Money entered in cents leaves floating-point dust; under half a cent is nothing.
export const HALF_CENT = 0.005;

// A rate inside a formula: two decimals when that is exact and four when it is not, so
// a 2.375% rate is not shown as 2.38% beside a value computed at 2.375%.
const rate = (n: number) => (Math.abs(n * 100 - Number((n * 100).toFixed(2))) < 1e-9 ? pct(n) : pct(n, 4));

const money = (what: string) => z.number().min(0).describe(`${what}, dollars`);
const taxRate = (what: string) =>
  z
    .number()
    .min(0)
    .lt(1)
    .nullable()
    .describe(`${what}, as a decimal: 0.2 is 20%; null, with the other two tax rates null, figures no tax`);

const RATE_KEYS = ["capitalGainRate", "unrecapturedRate", "niiRate"] as const;

export const saleProceedsInput = z
  .object({
    salePrice: z
      .number()
      .positive()
      .describe(
        "the contract price of the property sold, dollars; more than zero. A loan the buyer assumes or takes the property subject to belongs in the price, and under the payoffs too",
      ),
    sellingCostRate: z
      .number()
      .min(0)
      .lt(1)
      .describe("costs of selling that scale with the price (a commission), as a decimal share of the price: 0.03 is 3%; 0 if none"),
    sellingCostFixed: money("costs of selling that do not scale with the price (legal, title, survey); 0 if none"),
    loanPayoff: money(
      "what the lender must be paid at closing, from the payoff letter: principal, accrued interest and any prepayment charge; a loan the buyer assumes or takes the property subject to goes here too; 0 if none. It reduces cash, not gain",
    ),
    otherPayoffs: money(
      "other amounts paid out of the proceeds that are not costs of selling (a second lien, property tax owed to the closing day, tenant deposits credited to the buyer); 0 if none. They reduce cash, not gain",
    ),
    originalCost: z.number().positive().describe("what the property cost, with the acquisition costs that were added to basis, dollars; more than zero"),
    improvements: money("capital improvements added since the purchase; 0 if none"),
    depreciationTaken: money(
      "depreciation allowed or allowable on the building and improvements to the date of sale, whether or not it was claimed; 0 if none; not more than cost plus improvements",
    ),
    capitalGainRate: taxRate("long-term capital gain rate on the gain beyond the depreciation taken"),
    unrecapturedRate: taxRate("rate on unrecaptured section 1250 gain, taken here as the part of the gain up to the depreciation taken"),
    niiRate: taxRate("net investment income tax rate, added to both gain rates and applied as if all of the gain were above the tax's threshold; 0 leaves it out"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.depreciationTaken > d.originalCost + d.improvements) {
      ctx.addIssue({ code: "custom", path: ["depreciationTaken"], message: "depreciation taken cannot be more than the cost plus improvements" });
    }
    if (d.salePrice * d.sellingCostRate + d.sellingCostFixed > d.salePrice + HALF_CENT) {
      ctx.addIssue({ code: "custom", path: ["sellingCostFixed"], message: "selling costs cannot be more than the sale price" });
    }
    const given = RATE_KEYS.filter((k) => d[k] !== null).length;
    if (given > 0 && given < 3) {
      for (const k of RATE_KEYS) {
        if (d[k] === null) ctx.addIssue({ code: "custom", path: [k], message: "the tax needs all three rates; leave all three blank to figure no tax" });
      }
    }
  });

export type SaleProceedsInput = z.infer<typeof saleProceedsInput>;

// The price moved by whole percents, so a round price gives round ladder prices.
export const LADDER_STEPS = [-10, -5, 0, 5, 10] as const;

export type SaleProceedsRow = {
  change: number; // the step as a decimal: -0.1 is 10 percent below the price entered
  price: number;
  sellingCosts: number;
  gain: number; // negative is a loss
  tax: number | null; // null when no rates were entered
  cashBeforeTax: number;
  cashAfterTax: number | null; // null when no rates were entered
};

export type SaleProceedsResult = {
  sellingCostsScaled: number; // price times the selling cost rate
  sellingCosts: number; // scaled plus fixed
  amountRealized: number; // price less selling costs
  adjustedBasis: number; // cost plus improvements less depreciation
  gain: number; // amount realized less adjusted basis; negative is a loss
  isLoss: boolean; // a loss of half a cent or more
  depreciationPart: number; // the lesser of the depreciation taken and the gain; 0 on a loss
  otherGain: number; // the rest of the gain; 0 on a loss
  taxed: boolean; // true when the three rates were entered
  taxOnDepreciationPart: number | null; // null when no rates were entered
  taxOnOtherGain: number | null;
  tax: number | null; // 0 on a loss: a loss is not priced, so what it may save in tax is not figured
  payoffs: number; // loan payoff plus other payoffs
  cashBeforeTax: number; // amount realized less the payoffs; negative when the sale does not clear the debts
  cashAfterTax: number | null; // cash before tax less the tax; null when no rates were entered
  clears: boolean; // cash before tax is not below zero (within half a cent)
  shortfall: number; // what the seller must bring to closing; 0 when the sale clears
  clearingPrice: number; // the lowest price at which cash before tax is zero
  ladder: SaleProceedsRow[]; // the price and 5 and 10 percent either side; the middle row is this result
  notes: string[];
  trace: TraceLine[];
};

type Rates = { gain: number; depreciation: number; nii: number };

type Figures = {
  sellingCostsScaled: number;
  sellingCosts: number;
  amountRealized: number;
  gain: number;
  depreciationPart: number;
  otherGain: number;
  taxOnDepreciationPart: number | null;
  taxOnOtherGain: number | null;
  tax: number | null;
  cashBeforeTax: number;
  cashAfterTax: number | null;
};

// Every figure that moves with the price. The fixed costs, payoffs and basis do not.
function figuresAt(price: number, d: SaleProceedsInput, adjustedBasis: number, payoffs: number, rates: Rates | null): Figures {
  const sellingCostsScaled = price * d.sellingCostRate;
  const sellingCosts = sellingCostsScaled + d.sellingCostFixed;
  const amountRealized = price - sellingCosts;
  const gain = amountRealized - adjustedBasis;
  // The same split and pricing as priceGain in exchange-1031.ts: a loss has no parts and no tax.
  const taxable = Math.max(0, gain);
  const depreciationPart = Math.min(d.depreciationTaken, taxable);
  const otherGain = taxable - depreciationPart;
  const taxOnDepreciationPart = rates ? depreciationPart * (rates.depreciation + rates.nii) : null;
  const taxOnOtherGain = rates ? otherGain * (rates.gain + rates.nii) : null;
  const tax = taxOnDepreciationPart !== null && taxOnOtherGain !== null ? taxOnDepreciationPart + taxOnOtherGain : null;
  const cashBeforeTax = amountRealized - payoffs;
  const cashAfterTax = tax === null ? null : cashBeforeTax - tax;
  return { sellingCostsScaled, sellingCosts, amountRealized, gain, depreciationPart, otherGain, taxOnDepreciationPart, taxOnOtherGain, tax, cashBeforeTax, cashAfterTax };
}

const stepWords = (step: number) => `${Math.abs(step)}% ${step < 0 ? "lower" : "higher"}`;

// Each note as a function of the figures it states, so the page can tell which notes its
// headline already says. The result carries every note that applies.
export const saleProceedsNotes = {
  doesNotClear: (shortfall: number) => `The sale does not clear the debts: the seller must bring ${usd(shortfall)} to closing.`,
  taxOnTop: (tax: number, shortAfterTax: number) => `The tax on the gain, ${usd(tax)}, is owed on top of that: ${usd(shortAfterTax)} short after tax.`,
  loss: (loss: number) => `The sale is at a loss of ${usd(loss)}, so there is no gain to tax. What the loss may save in tax is not figured here.`,
  allDepreciation: () => "The gain is no more than the depreciation taken, so all of it is the depreciation part.",
  noRates: () => "No tax rates were entered, so no tax is figured and the result stops at cash before tax.",
  taxNotCovered: (short: number) => `The cash at closing does not cover the tax on the gain: it is ${usd(short)} short.`,
};

export function runSaleProceeds(raw: SaleProceedsInput): SaleProceedsResult {
  const d = saleProceedsInput.parse(raw);
  const trace: TraceLine[] = [];
  const notes: string[] = [];
  const rates: Rates | null =
    d.capitalGainRate !== null && d.unrecapturedRate !== null && d.niiRate !== null ? { gain: d.capitalGainRate, depreciation: d.unrecapturedRate, nii: d.niiRate } : null;

  const adjustedBasis = d.originalCost + d.improvements - d.depreciationTaken;
  const payoffs = d.loanPayoff + d.otherPayoffs;
  const f = figuresAt(d.salePrice, d, adjustedBasis, payoffs, rates);
  const isLoss = f.gain < -HALF_CENT;

  trace.push({
    label: "Selling costs",
    formula: `${usd(d.salePrice)} price × ${rate(d.sellingCostRate)} + ${usd(d.sellingCostFixed)} fixed`,
    value: usd(f.sellingCosts),
  });
  trace.push({ label: "Amount realized", formula: `${usd(d.salePrice)} price − ${usd(f.sellingCosts)} selling costs`, value: usd(f.amountRealized) });
  trace.push({
    label: "Adjusted basis",
    formula: `${usd(d.originalCost)} cost + ${usd(d.improvements)} improvements − ${usd(d.depreciationTaken)} depreciation`,
    value: usd(adjustedBasis),
  });
  trace.push({ label: isLoss ? "Loss" : "Gain", formula: `${usd(f.amountRealized)} amount realized − ${usd(adjustedBasis)} adjusted basis`, value: usd(f.gain) });
  trace.push({
    label: "Gain from depreciation taken",
    formula: isLoss ? "a loss: no part of it is depreciation taken" : `min(${usd(d.depreciationTaken)} depreciation, ${usd(f.gain)} gain)`,
    value: usd(f.depreciationPart),
  });
  trace.push({
    label: "Rest of the gain",
    formula: isLoss ? "a loss: there is no gain to split" : `${usd(f.gain)} gain − ${usd(f.depreciationPart)} from depreciation`,
    value: usd(f.otherGain),
  });

  if (rates && f.taxOnDepreciationPart !== null && f.taxOnOtherGain !== null && f.tax !== null) {
    trace.push({
      label: "Tax on the depreciation part",
      formula: `${usd(f.depreciationPart)} × (${rate(rates.depreciation)} unrecaptured + ${rate(rates.nii)} net investment income)`,
      value: usd(f.taxOnDepreciationPart),
    });
    trace.push({
      label: "Tax on the rest of the gain",
      formula: `${usd(f.otherGain)} × (${rate(rates.gain)} capital gain + ${rate(rates.nii)} net investment income)`,
      value: usd(f.taxOnOtherGain),
    });
    trace.push({
      label: "Tax on the gain",
      formula: isLoss ? "a loss: no tax, and what the loss may save in tax is not figured here" : `${usd(f.taxOnDepreciationPart)} + ${usd(f.taxOnOtherGain)}`,
      value: usd(f.tax),
    });
  } else {
    trace.push({ label: "Tax on the gain", formula: "no tax rates entered", value: "not figured" });
  }

  trace.push({
    label: "Cash at closing, before tax",
    formula: `${usd(f.amountRealized)} amount realized − ${usd(d.loanPayoff)} loan payoff − ${usd(d.otherPayoffs)} other payoffs`,
    value: usd(f.cashBeforeTax),
  });
  if (f.cashAfterTax !== null && f.tax !== null) {
    trace.push({ label: "Cash after tax", formula: `${usd(f.cashBeforeTax)} before tax − ${usd(f.tax)} tax`, value: usd(f.cashAfterTax) });
  }

  // The price at which the amount realized equals the payoffs: price × (1 − rate) − fixed = payoffs.
  const clearingPrice = (payoffs + d.sellingCostFixed) / (1 - d.sellingCostRate);
  trace.push({
    label: "Clearing price",
    formula: `(${usd(d.loanPayoff)} loan payoff + ${usd(d.otherPayoffs)} other payoffs + ${usd(d.sellingCostFixed)} fixed costs) ÷ (1 − ${rate(d.sellingCostRate)})`,
    value: usd(clearingPrice),
  });

  const ladder: SaleProceedsRow[] = LADDER_STEPS.map((step) => {
    const price = step === 0 ? d.salePrice : (d.salePrice * (100 + step)) / 100;
    const g = step === 0 ? f : figuresAt(price, d, adjustedBasis, payoffs, rates);
    if (step !== 0) {
      trace.push(
        g.cashAfterTax !== null && g.tax !== null
          ? {
              label: `Cash after tax at a price ${stepWords(step)}`,
              formula: `${usd(price)} price: ${usd(g.amountRealized)} amount realized − ${usd(payoffs)} payoffs − ${usd(g.tax)} tax`,
              value: usd(g.cashAfterTax),
            }
          : {
              label: `Cash before tax at a price ${stepWords(step)}`,
              formula: `${usd(price)} price: ${usd(g.amountRealized)} amount realized − ${usd(payoffs)} payoffs`,
              value: usd(g.cashBeforeTax),
            },
      );
    }
    return { change: step / 100, price, sellingCosts: g.sellingCosts, gain: g.gain, tax: g.tax, cashBeforeTax: g.cashBeforeTax, cashAfterTax: g.cashAfterTax };
  });

  const clears = f.cashBeforeTax > -HALF_CENT;
  const shortfall = clears ? 0 : -f.cashBeforeTax;
  if (!clears) notes.push(saleProceedsNotes.doesNotClear(shortfall));
  // A sale can fail to clear the debts and still show a gain (a low basis after years of
  // depreciation): the tax is owed on top of what the seller brings.
  if (!clears && f.tax !== null && f.tax > HALF_CENT && f.cashAfterTax !== null) {
    notes.push(saleProceedsNotes.taxOnTop(f.tax, -f.cashAfterTax));
  }
  if (isLoss) notes.push(saleProceedsNotes.loss(-f.gain));
  if (!isLoss && f.gain > HALF_CENT && d.depreciationTaken > 0 && f.otherGain === 0) {
    notes.push(saleProceedsNotes.allDepreciation());
  }
  if (rates === null) notes.push(saleProceedsNotes.noRates());
  if (clears && f.cashAfterTax !== null && f.cashAfterTax < -HALF_CENT) {
    notes.push(saleProceedsNotes.taxNotCovered(-f.cashAfterTax));
  }

  return {
    sellingCostsScaled: f.sellingCostsScaled,
    sellingCosts: f.sellingCosts,
    amountRealized: f.amountRealized,
    adjustedBasis,
    gain: f.gain,
    isLoss,
    depreciationPart: f.depreciationPart,
    otherGain: f.otherGain,
    taxed: rates !== null,
    taxOnDepreciationPart: f.taxOnDepreciationPart,
    taxOnOtherGain: f.taxOnOtherGain,
    tax: f.tax,
    payoffs,
    cashBeforeTax: f.cashBeforeTax,
    cashAfterTax: f.cashAfterTax,
    clears,
    shortfall,
    clearingPrice,
    ladder,
    notes,
    trace,
  };
}

// Worked example: round, made-up figures for a fictional building. The rates are example
// values: 20% is the top long-term capital gain rate, 25% the maximum on unrecaptured
// section 1250 gain and 3.8% the net investment income tax, as the rule cards state them;
// a seller's own rates may be lower.
export const SALE_PROCEEDS_EXAMPLE: SaleProceedsInput = {
  salePrice: 6_000_000,
  sellingCostRate: 0.03,
  sellingCostFixed: 45_000,
  loanPayoff: 2_900_000,
  otherPayoffs: 60_000,
  originalCost: 3_800_000,
  improvements: 400_000,
  depreciationTaken: 700_000,
  capitalGainRate: 0.2,
  unrecapturedRate: 0.25,
  niiRate: 0.038,
};

export const saleProceedsModule = defineModule({ id: "sale-proceeds", input: saleProceedsInput, run: runSaleProceeds, example: SALE_PROCEEDS_EXAMPLE });
