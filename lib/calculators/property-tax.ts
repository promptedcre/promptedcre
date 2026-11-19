import { z } from "zod";
import { isoDate } from "../schemas/common";
import { fromDays, toDays } from "./dates";
import { defineModule } from "./module";
import { num, pct, type TraceLine, usd } from "./trace";

// A property tax estimate from the inputs: the appraised value on the roll times an
// assessment ratio is the taxable value, and each taxing unit's rate (a decimal of
// value: 0.0055 is $0.55 per $100) times the taxable value is that unit's tax. Then
// three what-ifs, each optional: the tax if the appraised value were reset to a
// purchase price, what a protest reduction in appraised value saves, and how the
// year's tax splits between seller and buyer on a closing date.
// Conventions: nothing is rounded until it is shown. A protest reduction lowers the
// appraised value, and the taxable value after it is the reduced value times the
// ratio, floored at zero. The proration splits the year's tax at the roll value by
// days in the closing date's calendar year (365, or 366 in a leap year); the seller
// has the days from January 1 through the day before closing, plus the closing day
// when the seller owns it. No rate, exemption, cap or rollback is built in.

export const MAX_UNITS = 20;
// A unit's rate above this is almost always a per-$100 figure typed as a decimal.
export const MAX_UNIT_RATE = 0.05;

const shaped = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const realDate = (s: string) => shaped(s) && fromDays(toDays(s)) === s;

// A misshapen date is named once, by isoDate's own check; this one catches 2027-02-30.
const date = isoDate.refine((s) => !shaped(s) || realDate(s), { message: "not a real calendar date" });

export const propertyTaxUnit = z
  .object({
    name: z.string().trim().min(1).max(60).describe('the taxing unit\'s name ("County", "City", "School district")'),
    rate: z
      .number()
      .min(0)
      .max(MAX_UNIT_RATE)
      .describe("the unit's tax rate as a decimal of taxable value: 0.0055 is $0.55 per $100 of value (0.55%); at most 0.05"),
  })
  .strict();

export const propertyTaxInput = z
  .object({
    appraisedValue: z.number().positive().describe("the appraised value on the tax roll, dollars"),
    assessmentRatio: z
      .number()
      .positive()
      .max(1)
      .describe("the share of appraised value that is taxed, as a decimal: 1 where the full value is taxed, 0.4 where 40% is"),
    units: z
      .array(propertyTaxUnit)
      .max(MAX_UNITS)
      .describe(`each taxing unit that levies on the property, with its rate, 0 to ${MAX_UNITS} units; an empty list gives no tax`),
    purchasePrice: z
      .number()
      .positive()
      .nullable()
      .describe("a purchase price, dollars, to see the tax if the appraised value were reset to it; null to skip"),
    protestReduction: z
      .number()
      .min(0)
      .nullable()
      .describe("a reduction in appraised value from a protest, dollars; the value after it is floored at 0; null to skip"),
    closingDate: date.nullable().describe("the closing date, YYYY-MM-DD, to split the year's tax between seller and buyer; null to skip"),
    sellerOwnsClosingDay: z.boolean().describe("true when the seller is charged with the closing day itself, false when the buyer is"),
    taxUnpaidAtClosing: z
      .boolean()
      .describe(
        "true when the year's tax is still unpaid at closing (paid in arrears, so the seller credits the buyer the seller's share); false when it was already paid (the buyer credits the seller the buyer's share)",
      ),
  })
  .strict();

export type PropertyTaxInput = z.infer<typeof propertyTaxInput>;
export type PropertyTaxUnitInput = z.infer<typeof propertyTaxUnit>;

export type UnitTax = {
  name: string;
  rate: number;
  // the rate per $100 of value, as tax bills write it
  per100: number;
  tax: number;
  // this unit's tax as a share of the total; null when the total is 0
  share: number | null;
  // this unit's tax at the purchase price, and its part of the protest saving; null when not asked for
  taxAtPrice: number | null;
  protestSaving: number | null;
};

export type PurchaseReset = {
  price: number;
  taxableValue: number;
  totalTax: number;
  // tax at the price ÷ the price
  effectiveRate: number;
  // tax at the price less tax at the roll value: above zero means the tax goes up
  difference: number;
};

export type ProtestResult = {
  reduction: number;
  appraisedAfter: number;
  taxableValue: number;
  totalTax: number;
  saving: number;
};

export type Party = "seller" | "buyer";

export type Proration = {
  closingDate: string;
  year: number;
  daysInYear: number;
  sellerDays: number;
  buyerDays: number;
  sellerShare: number;
  buyerShare: number;
  taxUnpaidAtClosing: boolean;
  // who credits whom at closing, and how much
  payer: Party;
  payee: Party;
  credit: number;
};

export type PropertyTaxResult = {
  appraisedValue: number;
  assessmentRatio: number;
  taxableValue: number;
  // the sum of the units' rates, a decimal of taxable value
  combinedRate: number;
  units: UnitTax[];
  totalTax: number;
  // total tax ÷ appraised value
  effectiveRate: number;
  purchase: PurchaseReset | null;
  protest: ProtestResult | null;
  proration: Proration | null;
  trace: TraceLine[];
};

// A rate as tax bills write it: dollars per $100 of value.
export function per100Text(rate: number): string {
  return `$${num(rate * 100, 4)}`;
}
const times = (value: number, rate: number) => `${usd(value)} ÷ 100 × ${per100Text(rate)}`;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function runPropertyTax(raw: PropertyTaxInput): PropertyTaxResult {
  const d = propertyTaxInput.parse(raw);
  const trace: TraceLine[] = [];
  const ratio = num(d.assessmentRatio, 4);

  const taxableValue = d.appraisedValue * d.assessmentRatio;
  trace.push({ label: "Taxable value", formula: `${usd(d.appraisedValue)} appraised × ${ratio} ratio`, value: usd(taxableValue) });

  const taxes = d.units.map((u) => taxableValue * u.rate);
  d.units.forEach((u, i) => {
    trace.push({ label: `Tax: ${u.name}`, formula: times(taxableValue, u.rate), value: usd(taxes[i] ?? 0) });
  });
  const combinedRate = d.units.reduce((s, u) => s + u.rate, 0);
  trace.push({
    label: "Combined rate per $100",
    formula: d.units.length ? `sum of the ${d.units.length} units' rates` : "no taxing units",
    value: `${per100Text(combinedRate)} (${pct(combinedRate, 4)})`,
  });
  const totalTax = taxes.reduce((s, x) => s + x, 0);
  trace.push({ label: "Tax for the year", formula: d.units.length ? `sum of the ${d.units.length} units' tax` : "no taxing units", value: usd(totalTax) });
  const effectiveRate = totalTax / d.appraisedValue;
  trace.push({ label: "Effective rate", formula: `${usd(totalTax)} ÷ ${usd(d.appraisedValue)} appraised`, value: pct(effectiveRate, 4) });

  let purchase: PurchaseReset | null = null;
  if (d.purchasePrice !== null) {
    const tv = d.purchasePrice * d.assessmentRatio;
    trace.push({ label: "Taxable value at the price", formula: `${usd(d.purchasePrice)} price × ${ratio} ratio`, value: usd(tv) });
    const t = tv * combinedRate;
    trace.push({ label: "Tax at the price", formula: times(tv, combinedRate), value: usd(t) });
    const difference = t - totalTax;
    trace.push({ label: "Change in the yearly tax", formula: `${usd(t)} − ${usd(totalTax)}`, value: usd(difference) });
    purchase = { price: d.purchasePrice, taxableValue: tv, totalTax: t, effectiveRate: t / d.purchasePrice, difference };
  }

  let protest: ProtestResult | null = null;
  if (d.protestReduction !== null) {
    const appraisedAfter = Math.max(0, d.appraisedValue - d.protestReduction);
    trace.push({
      label: "Appraised value after the protest",
      formula: `${usd(d.appraisedValue)} − ${usd(d.protestReduction)}${d.protestReduction > d.appraisedValue ? ", floored at $0" : ""}`,
      value: usd(appraisedAfter),
    });
    const tv = appraisedAfter * d.assessmentRatio;
    trace.push({ label: "Taxable value after the protest", formula: `${usd(appraisedAfter)} × ${ratio} ratio`, value: usd(tv) });
    const t = tv * combinedRate;
    trace.push({ label: "Tax after the protest", formula: times(tv, combinedRate), value: usd(t) });
    const saving = totalTax - t;
    trace.push({ label: "Saved by the protest", formula: `${usd(totalTax)} − ${usd(t)}`, value: usd(saving) });
    protest = { reduction: d.protestReduction, appraisedAfter, taxableValue: tv, totalTax: t, saving };
  }

  const units: UnitTax[] = d.units.map((u, i) => {
    const tax = taxes[i] ?? 0;
    return {
      name: u.name,
      rate: u.rate,
      per100: u.rate * 100,
      tax,
      share: totalTax > 0 ? tax / totalTax : null,
      taxAtPrice: purchase ? purchase.taxableValue * u.rate : null,
      protestSaving: protest ? tax - protest.taxableValue * u.rate : null,
    };
  });

  let proration: Proration | null = null;
  if (d.closingDate !== null) {
    const yearText = d.closingDate.slice(0, 4);
    const year = Number(yearText);
    const daysInYear = isLeap(year) ? 366 : 365;
    const before = toDays(d.closingDate) - toDays(`${yearText}-01-01`);
    trace.push({ label: "Days before the closing day", formula: `${yearText}-01-01 up to ${d.closingDate}, the closing day not counted`, value: `${before} days` });
    const sellerDays = before + (d.sellerOwnsClosingDay ? 1 : 0);
    trace.push({
      label: "Seller's days",
      formula: d.sellerOwnsClosingDay ? `${before} + 1: the seller owns the closing day` : `${before}: the buyer owns the closing day`,
      value: `${sellerDays} of ${daysInYear}`,
    });
    const buyerDays = daysInYear - sellerDays;
    // A seller who has every day of the year has all of the tax: taken whole, so the
    // buyer's share is exactly zero rather than floating-point dust below it.
    const sellerShare = sellerDays === daysInYear ? totalTax : (totalTax * sellerDays) / daysInYear;
    trace.push({ label: "Seller's share of the year's tax", formula: `${usd(totalTax)} × ${sellerDays} ÷ ${daysInYear}`, value: usd(sellerShare) });
    const buyerShare = totalTax - sellerShare;
    trace.push({ label: "Buyer's share of the year's tax", formula: `${usd(totalTax)} − ${usd(sellerShare)}, for ${buyerDays} days`, value: usd(buyerShare) });
    const payer: Party = d.taxUnpaidAtClosing ? "seller" : "buyer";
    const credit = d.taxUnpaidAtClosing ? sellerShare : buyerShare;
    trace.push({
      label: d.taxUnpaidAtClosing ? "Seller credits the buyer" : "Buyer credits the seller",
      formula: d.taxUnpaidAtClosing ? "unpaid at closing, so the buyer pays the bill: the seller's share" : "paid before closing, so the seller paid the bill: the buyer's share",
      value: usd(credit),
    });
    proration = {
      closingDate: d.closingDate,
      year,
      daysInYear,
      sellerDays,
      buyerDays,
      sellerShare,
      buyerShare,
      taxUnpaidAtClosing: d.taxUnpaidAtClosing,
      payer,
      payee: payer === "seller" ? "buyer" : "seller",
      credit,
    };
  }

  return {
    appraisedValue: d.appraisedValue,
    assessmentRatio: d.assessmentRatio,
    taxableValue,
    combinedRate,
    units,
    totalTax,
    effectiveRate,
    purchase,
    protest,
    proration,
    trace,
  };
}

// Made-up figures and made-up units: no rate here is any real unit's rate.
export const PROPERTY_TAX_EXAMPLE: PropertyTaxInput = {
  appraisedValue: 4_000_000,
  assessmentRatio: 1,
  units: [
    { name: "Example County", rate: 0.0035 },
    { name: "Example City", rate: 0.006 },
    { name: "Example School District", rate: 0.011 },
    { name: "Example Utility District", rate: 0.002 },
  ],
  purchasePrice: 5_000_000,
  protestReduction: 250_000,
  closingDate: "2027-09-30",
  sellerOwnsClosingDay: true,
  taxUnpaidAtClosing: true,
};

export const propertyTaxModule = defineModule({ id: "property-tax", input: propertyTaxInput, run: runPropertyTax, example: PROPERTY_TAX_EXAMPLE });
