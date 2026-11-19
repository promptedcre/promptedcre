import { AFTER_TAX_EXAMPLE, runAfterTax, type AfterTaxInput, type AfterTaxResult } from "@/lib/calculators/after-tax";
import { pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

export const pointsText = (x: number) => `${(x * 100).toFixed(2)} points`;

export function afterTaxHeadline(r: AfterTaxResult): string {
  if (r.preTaxIrr === null || r.afterTaxIrr === null) {
    return `No IRR: the cash flows never change sign. Tax over the hold and sale comes to ${usd(r.totalTax, false)}.`;
  }
  return `After tax the IRR is ${pct(r.afterTaxIrr)}, against ${pct(r.preTaxIrr)} before tax: tax takes ${pointsText(r.irrDifference ?? 0)}.`;
}

export function afterTaxFigures(d: AfterTaxInput, r: AfterTaxResult): { lead: Headline; rest: Headline[] } {
  return {
    lead: {
      label: "After-tax IRR",
      value: r.afterTaxIrr === null ? "none" : pct(r.afterTaxIrr),
      sub: `on ${usd(r.equity, false)} of equity, held ${d.holdYears} ${d.holdYears === 1 ? "year" : "years"}`,
    },
    rest: [
      { label: "Pre-tax IRR", value: r.preTaxIrr === null ? "none" : pct(r.preTaxIrr) },
      { label: "Return lost to tax", value: r.irrDifference === null ? "none" : pointsText(r.irrDifference) },
      { label: "Tax on yearly income", value: usd(r.operatingTax, false), sub: `over ${d.holdYears} ${d.holdYears === 1 ? "year" : "years"}` },
      { label: "Tax on sale", value: usd(r.sale.tax, false), sub: r.sale.gain > 0 ? `on a ${usd(r.sale.gain, false)} gain` : "no gain on sale" },
    ],
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function afterTaxCells(d: AfterTaxInput, r: AfterTaxResult): Headline[] {
  return afterTaxFigures(d, r).rest.filter((h) => h.label !== "Pre-tax IRR" && h.label !== "Return lost to tax");
}

export const afterTaxInfo: ModuleInfo = {
  meta: {
    purpose: "See what income tax does to a hold's return: taxable income and tax by year, the tax on sale with the depreciation part split out, and the after-tax IRR beside the pre-tax IRR.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's basis, depreciation and equity; each year's interest, principal, taxable income, tax and cash flow before and after tax; the sale's price, payoff, adjusted basis, gain, unrecaptured section 1250 part, rest, tax on each and net proceeds; and both IRRs match a separate Python calculation (decimal module, 2026-11-13): money to the cent, rates to 1e-6.",
      "A second case with a tax loss every year is pinned the same way: the loss carried forward year by year, then used against the rest of the gain first and the unrecaptured part second; a loss larger than the gain is left unused and named in the trace.",
      "On five test cases, cash flow before tax less taxable income equals depreciation less principal every year, the basis and the two parts of the gain add up, and the cash before tax equals the cash after tax plus every dollar of tax; with every rate at zero the two IRRs are equal, raising any one rate never lowers the tax, and a flat all-cash hold sold at cost gives the closed form.",
      "All cash, interest only for the whole hold, a sale at a loss, no net investment income tax, no land, a hold longer than the recovery period, a one-year hold, a zero interest rate and a hold that ends just as the loan is paid off (a payoff of zero, never below it) are pinned; a loan that leaves no equity, a hold past the loan's payoff, a 100% land share or rate, a missing rate and unknown fields are refused in plain words.",
    ],
    tests: ["__tests__/calc-after-tax.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `a ${usd(AFTER_TAX_EXAMPLE.price, false)} purchase held ${AFTER_TAX_EXAMPLE.holdYears} years with a ${usd(AFTER_TAX_EXAMPLE.loan, false)} loan, at example rates of ${pct(AFTER_TAX_EXAMPLE.ordinaryRate, 0)} ordinary, ${pct(AFTER_TAX_EXAMPLE.niiRate, 1)} net investment income, ${pct(AFTER_TAX_EXAMPLE.unrecapturedRate, 0)} on unrecaptured section 1250 gain and ${pct(AFTER_TAX_EXAMPLE.capitalGainRate, 0)} on the rest`,
  headline: () => afterTaxHeadline(runAfterTax(AFTER_TAX_EXAMPLE)),
  preview: () => {
    const f = afterTaxFigures(AFTER_TAX_EXAMPLE, runAfterTax(AFTER_TAX_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
