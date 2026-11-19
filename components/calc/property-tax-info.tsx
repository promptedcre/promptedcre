import { per100Text, PROPERTY_TAX_EXAMPLE, runPropertyTax, type PropertyTaxInput, type PropertyTaxResult } from "@/lib/calculators/property-tax";
import { pct, usd } from "@/lib/calculators/trace";
import { count } from "./format";
import { HeadlineFigures, type Fill, type Headline, type SplitSegment } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

const NOT_GIVEN = "not given";
const signed = (n: number) => `${n > 0 ? "+" : ""}${usd(n, false)}`;

export function propertyTaxHeadline(r: PropertyTaxResult): string {
  return `The tax is ${usd(r.totalTax, false)} a year, an effective ${pct(r.effectiveRate)} of the appraised value.`;
}

export function propertyTaxFigures(d: PropertyTaxInput, r: PropertyTaxResult): { lead: Headline; rest: Headline[] } {
  const { purchase, protest, proration } = r;
  return {
    lead: {
      label: "Tax for the year",
      value: usd(r.totalTax, false),
      sub: `on ${usd(r.taxableValue, false)} taxable at ${per100Text(r.combinedRate)} per $100`,
    },
    rest: [
      { label: "Effective rate", value: pct(r.effectiveRate), sub: `of ${usd(d.appraisedValue, false)} appraised` },
      {
        label: "Tax at the purchase price",
        value: purchase ? usd(purchase.totalTax, false) : NOT_GIVEN,
        sub: purchase ? `${signed(purchase.difference)} a year at ${usd(purchase.price, false)}` : "no price entered",
      },
      {
        label: "Saved by the protest",
        value: protest ? usd(protest.saving, false) : NOT_GIVEN,
        sub: protest ? `a year, on ${usd(protest.reduction, false)} off the value` : "no reduction entered",
      },
      {
        label: proration ? (proration.payer === "seller" ? "Seller credits the buyer" : "Buyer credits the seller") : "Closing proration",
        value: proration ? usd(proration.credit) : NOT_GIVEN,
        sub: proration ? `seller ${proration.sellerDays} of ${proration.daysInYear} days, closing ${proration.closingDate}` : "no closing date entered",
      },
    ],
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function propertyTaxCells(d: PropertyTaxInput, r: PropertyTaxResult): Headline[] {
  return propertyTaxFigures(d, r).rest.filter((h) => h.label !== "Effective rate");
}

const FILLS: Fill[] = ["solid", "tint", "light", "outline"];

// The year's tax by taxing unit, for the drawing on the calculator page.
export function propertyTaxUnitSplit(r: PropertyTaxResult): SplitSegment[] {
  return r.units.map((u, i) => ({ key: `u${i}`, label: u.name, value: u.tax, fill: FILLS[i % FILLS.length] ?? "solid" }));
}

// The year's tax split at closing: the seller's days and the buyer's.
export function propertyTaxProrationSplit(r: PropertyTaxResult): SplitSegment[] {
  const p = r.proration;
  if (!p) return [];
  return [
    { key: "seller", label: `Seller, ${count(p.sellerDays, "day")}`, value: p.sellerShare, fill: "solid" },
    { key: "buyer", label: `Buyer, ${count(p.buyerDays, "day")}`, value: p.buyerShare, fill: "tint" },
  ];
}

export const propertyTaxInfo: ModuleInfo = {
  meta: {
    purpose: "Estimate a property's yearly tax from its appraised value and each taxing unit's rate, then test a reset to the purchase price, a protest reduction and the closing-day proration.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's taxable value, each unit's tax and share, the combined and effective rates, the tax at the purchase price and its change, the protest saving, and the seller's and buyer's days, shares and credit match a separate Python calculation (decimal arithmetic and datetime day counts, 2026-11-13), as do a case with a 0.4 assessment ratio and a paid-in-advance closing where the buyer owns the day.",
      "Across many values, rates and closing dates, the units' shares sum to one, their taxes, taxes at the price and savings sum to the totals, the seller's and buyer's shares sum to the year's tax, tax is linear in value, and one unit at a ratio of one equals value times rate.",
      "No taxing units, a zero rate, a reduction above the value, a price below it, January 1 and December 31 closings (a seller who owns December 31 bears the whole tax, the buyer exactly none) and leap years (2000 and 2028 have 366 days, 2100 has 365) are pinned; a zero value, a ratio above one, a rate above 5%, a blank unit name, more than 20 units and an impossible date are refused in plain words.",
    ],
    tests: ["__tests__/calc-property-tax.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `${usd(PROPERTY_TAX_EXAMPLE.appraisedValue, false)} appraised, ${count(PROPERTY_TAX_EXAMPLE.units.length, "made-up taxing unit")}, a ${usd(
    PROPERTY_TAX_EXAMPLE.purchasePrice ?? 0,
    false,
  )} price, closing ${PROPERTY_TAX_EXAMPLE.closingDate ?? "not given"}`,
  headline: () => propertyTaxHeadline(runPropertyTax(PROPERTY_TAX_EXAMPLE)),
  preview: () => {
    const f = propertyTaxFigures(PROPERTY_TAX_EXAMPLE, runPropertyTax(PROPERTY_TAX_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
