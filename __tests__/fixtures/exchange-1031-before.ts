// Test fixture, not the calculator: lib/calculators/exchange-1031.ts as it stood before the shared
// gain-tax helper (lib/calculators/gain-tax.ts) was drawn out on 2026-11-14
// (git show HEAD:lib/calculators/exchange-1031.ts, HEAD 7165049). Only the import paths differ from
// that source. Read by __tests__/calc-gain-tax.test.ts to show that no result changed.
// Do not edit and do not import from application code.

import { z } from "zod";
import { defineModule } from "@/lib/calculators/module";
import { pct, type TraceLine, usd } from "@/lib/calculators/trace";

// Like-kind exchange arithmetic for one exchange: the gain realized on the property
// given up, the boot received, the gain recognized now, the gain deferred and the
// basis the replacement property carries. The netting follows 26 CFR 1.1031(b)-1(c)
// and 1.1031(d)-2: debt the taxpayer is relieved of counts as money received; new
// debt on the replacement and cash the taxpayer adds offset that relief; neither
// offsets cash or other property the taxpayer takes (example 2 of 1.1031(d)-2,
// both parties). The basis is the regulation's form: the basis given up, plus
// liabilities taken on and cash added, less money received (cash and liabilities
// relieved), plus gain recognized, less the fair market value of other property
// received (which takes its own value as basis, 1.1031(d)-1(c)). Selling costs and
// exchange costs both reduce the amount realized, as Form 8824 treats exchange
// expenses; every cost is taken as paid out of the proceeds, so the cash taken is
// what is left. Tax is priced at the rates entered, with recognized gain taken from
// the depreciation part first. Arithmetic on the inputs, not tax advice. Nothing is
// rounded until it is shown.

const money = (what: string) => z.number().min(0).describe(`${what}, dollars`);
const rateField = (what: string) => z.number().min(0).lt(1).describe(`${what}, as a decimal: 0.2 is 20%; 0 leaves it out`);

export const exchange1031Input = z
  .object({
    salePrice: z.number().positive().describe("price of the property given up (the relinquished property), dollars"),
    sellingCosts: money("selling costs on the property given up (commission, title, closing), which reduce the amount realized"),
    adjustedBasis: money("adjusted basis of the property given up: cost plus improvements less depreciation allowed or allowable"),
    debtPaidOff: money("debt on the property given up that is paid off at closing or taken over by the buyer"),
    replacementPrice: z.number().positive().describe("price of the replacement property, dollars"),
    newDebt: money("debt on the replacement property: a new loan, or a loan the taxpayer takes over"),
    cashAdded: money("the taxpayer's own cash put into the replacement purchase, beyond the exchange proceeds"),
    exchangeCosts: money("costs of the exchange and of buying the replacement (intermediary fee, title, closing; not loan fees), which also reduce the amount realized"),
    cashTaken: money("cash the taxpayer receives out of the exchange, after every closing and exchange cost is paid"),
    otherProperty: money("fair market value of any other property received that is not like-kind real property; 0 if none"),
    depreciationTaken: money("depreciation allowed or allowable on the property given up; the part of a gain up to this amount is priced at the unrecaptured section 1250 rate; 0 if none"),
    capitalGainRate: rateField("long-term capital gain rate on gain beyond the depreciation taken"),
    unrecapturedRate: rateField("rate on unrecaptured section 1250 gain, the part of the gain that is depreciation taken"),
    niiRate: rateField("net investment income tax rate, added to both gain rates"),
  })
  .strict()
  .refine((d) => d.sellingCosts + d.exchangeCosts <= d.salePrice, { message: "selling and exchange costs together cannot be more than the sale price", path: ["sellingCosts"] });

export type Exchange1031Input = z.infer<typeof exchange1031Input>;

export type Exchange1031Checks = {
  equalOrGreaterValue: boolean; // replacement price at least the amount realized
  allEquityReinvested: boolean; // no cash and no other property taken out
  debtReplaced: boolean; // no net liability relief
  fullyDeferred: boolean; // no gain recognized (or no gain to recognize)
};

export type Exchange1031Result = {
  amountRealized: number; // sale price less selling and exchange costs
  realizedGain: number; // amount realized less adjusted basis; negative is a loss
  isLoss: boolean;
  liabilitiesRelieved: number; // debt paid off: treated as money received
  offsetByNewDebt: number; // the part of that relief new debt offsets
  offsetByCashAdded: number; // the part cash added offsets, after new debt
  netLiabilityRelief: number; // what is left: boot
  takenOut: number; // cash taken + other property: the net equity not reinvested
  boot: number; // cash taken + other property + net liability relief
  recognizedGain: number; // min(boot, gain); never a loss
  deferredGain: number; // realized less recognized; negative when a loss is carried in basis
  replacementBasis: number; // the regulation's form, for the like-kind replacement
  replacementBasisFromCost: number; // cross-check: replacement price less deferred gain
  otherPropertyBasis: number; // other property takes its fair market value as basis
  sourcesUsesGap: number; // proceeds and new money less what they bought and what was taken; 0 for one closing
  balanced: boolean; // |gap| under half a cent
  recognizedUnrecaptured: number; // the part of recognized gain priced as depreciation taken
  recognizedCapitalGain: number; // the rest
  taxNow: number; // tax on the recognized gain at the entered rates
  straightSaleTax: number; // tax on the whole realized gain at the same rates, as if all of it were recognized now
  taxDeferred: number; // straight-sale tax less tax now
  checks: Exchange1031Checks;
  trace: TraceLine[];
};

const HALF_CENT = 0.005;

// Tax on a gain at the entered rates: the part up to the depreciation taken at the
// unrecaptured rate, the rest at the capital gain rate, the NII rate on both.
function priceGain(gain: number, d: Exchange1031Input): { unrecaptured: number; capital: number; tax: number } {
  const g = Math.max(0, gain);
  const unrecaptured = Math.min(d.depreciationTaken, g);
  const capital = g - unrecaptured;
  return { unrecaptured, capital, tax: unrecaptured * (d.unrecapturedRate + d.niiRate) + capital * (d.capitalGainRate + d.niiRate) };
}

const yesNo = (b: boolean) => (b ? "yes" : "no");

export function runExchange1031(raw: Exchange1031Input): Exchange1031Result {
  const d = exchange1031Input.parse(raw);
  const trace: TraceLine[] = [];

  const amountRealized = d.salePrice - d.sellingCosts - d.exchangeCosts;
  trace.push({
    label: "Amount realized",
    formula: `${usd(d.salePrice)} sale price − ${usd(d.sellingCosts)} selling costs − ${usd(d.exchangeCosts)} exchange costs`,
    value: usd(amountRealized),
  });

  const realizedGain = amountRealized - d.adjustedBasis;
  const isLoss = realizedGain < 0;
  trace.push({ label: isLoss ? "Realized loss" : "Realized gain", formula: `${usd(amountRealized)} amount realized − ${usd(d.adjustedBasis)} adjusted basis`, value: usd(realizedGain) });

  // The netting (26 CFR 1.1031(b)-1(c), 1.1031(d)-2 example 2): liabilities relieved
  // are money received; liabilities taken on offset them first, then cash added.
  const liabilitiesRelieved = d.debtPaidOff;
  trace.push({ label: "Liabilities relieved", formula: "debt paid off or taken over on the property given up, treated as money received", value: usd(liabilitiesRelieved) });

  const offsetByNewDebt = Math.min(liabilitiesRelieved, d.newDebt);
  trace.push({ label: "Offset by new debt", formula: `min(${usd(liabilitiesRelieved)} relieved, ${usd(d.newDebt)} new debt)`, value: usd(offsetByNewDebt) });

  const offsetByCashAdded = Math.min(liabilitiesRelieved - offsetByNewDebt, d.cashAdded);
  trace.push({
    label: "Offset by cash added",
    formula: `min(${usd(liabilitiesRelieved)} − ${usd(offsetByNewDebt)} relief left, ${usd(d.cashAdded)} cash added)`,
    value: usd(offsetByCashAdded),
  });

  const netLiabilityRelief = liabilitiesRelieved - offsetByNewDebt - offsetByCashAdded;
  trace.push({
    label: "Net liability relief",
    formula: `${usd(liabilitiesRelieved)} − ${usd(offsetByNewDebt)} − ${usd(offsetByCashAdded)}`,
    value: usd(netLiabilityRelief),
  });

  const takenOut = d.cashTaken + d.otherProperty;
  const boot = takenOut + netLiabilityRelief;
  trace.push({
    label: "Boot received",
    formula: `${usd(d.cashTaken)} cash taken + ${usd(d.otherProperty)} other property + ${usd(netLiabilityRelief)} net liability relief (neither new debt nor cash added offsets cash or other property taken)`,
    value: usd(boot),
  });

  const recognizedGain = Math.min(boot, Math.max(realizedGain, 0));
  trace.push({
    label: "Recognized gain",
    formula: isLoss ? `no gain to recognize, and a loss in an exchange is not recognized: min(${usd(boot)} boot, 0)` : `min(${usd(boot)} boot, ${usd(realizedGain)} realized gain)`,
    value: usd(recognizedGain),
  });

  const deferredGain = realizedGain - recognizedGain;
  trace.push({
    label: isLoss ? "Deferred loss" : "Deferred gain",
    formula: `${usd(realizedGain)} realized − ${usd(recognizedGain)} recognized${isLoss ? " (carried into the replacement's basis)" : ""}`,
    value: usd(deferredGain),
  });

  const replacementBasis = d.adjustedBasis + d.newDebt + d.cashAdded - d.cashTaken - liabilitiesRelieved + recognizedGain - d.otherProperty;
  trace.push({
    label: "Basis of the replacement",
    formula: `${usd(d.adjustedBasis)} basis given up + ${usd(d.newDebt)} new debt + ${usd(d.cashAdded)} cash added − ${usd(d.cashTaken)} cash taken − ${usd(liabilitiesRelieved)} liabilities relieved + ${usd(recognizedGain)} recognized − ${usd(d.otherProperty)} other property`,
    value: usd(replacementBasis),
  });

  const otherPropertyBasis = d.otherProperty;
  if (d.otherProperty > 0) {
    trace.push({ label: "Basis of the other property", formula: "its fair market value", value: usd(otherPropertyBasis) });
  }

  const replacementBasisFromCost = d.replacementPrice - deferredGain;
  trace.push({
    label: "Basis cross-check, from price",
    formula: `${usd(d.replacementPrice)} replacement price − ${usd(deferredGain)} deferred`,
    value: usd(replacementBasisFromCost),
  });

  const rawGap = amountRealized - d.debtPaidOff + d.newDebt + d.cashAdded - d.replacementPrice - d.cashTaken - d.otherProperty;
  const balanced = Math.abs(rawGap) < HALF_CENT;
  // Inputs in cents leave floating-point dust in a balanced closing; under half a cent the gap is zero.
  const sourcesUsesGap = balanced ? 0 : rawGap;
  trace.push({
    label: "Sources and uses gap",
    formula: `${usd(amountRealized)} realized − ${usd(d.debtPaidOff)} debt paid off + ${usd(d.newDebt)} new debt + ${usd(d.cashAdded)} cash added − ${usd(d.replacementPrice)} replacement − ${usd(d.cashTaken)} cash taken − ${usd(d.otherProperty)} other property${balanced ? "" : " (not zero: the inputs do not describe one closing, and the two bases differ by this gap)"}`,
    value: usd(sourcesUsesGap),
  });

  const now = priceGain(recognizedGain, d);
  const straight = priceGain(realizedGain, d);
  const gainRate = d.capitalGainRate + d.niiRate;
  const deprRate = d.unrecapturedRate + d.niiRate;
  trace.push({
    label: "Recognized gain from depreciation taken",
    formula: `min(${usd(d.depreciationTaken)} depreciation taken, ${usd(recognizedGain)} recognized), taken first`,
    value: usd(now.unrecaptured),
  });
  trace.push({
    label: "Tax now",
    formula: `${usd(now.unrecaptured)} × (${pct(d.unrecapturedRate)} + ${pct(d.niiRate)}) + ${usd(now.capital)} × (${pct(d.capitalGainRate)} + ${pct(d.niiRate)})`,
    value: usd(now.tax),
  });
  trace.push({
    label: "Tax on the whole gain",
    formula: `as if all of it were recognized now: ${usd(straight.unrecaptured)} × ${pct(deprRate)} + ${usd(straight.capital)} × ${pct(gainRate)}${isLoss ? " (a loss: no tax, and the loss a sale could deduct is not priced here)" : ""}`,
    value: usd(straight.tax),
  });

  const taxDeferred = straight.tax - now.tax;
  trace.push({ label: "Tax deferred", formula: `${usd(straight.tax)} on the whole gain − ${usd(now.tax)} now`, value: usd(taxDeferred) });

  const checks: Exchange1031Checks = {
    equalOrGreaterValue: d.replacementPrice >= amountRealized,
    allEquityReinvested: takenOut === 0,
    debtReplaced: netLiabilityRelief === 0,
    fullyDeferred: recognizedGain === 0,
  };
  trace.push({ label: "Replacement at least equal in value", formula: `${usd(d.replacementPrice)} replacement ≥ ${usd(amountRealized)} amount realized`, value: yesNo(checks.equalOrGreaterValue) });
  trace.push({ label: "All net equity reinvested", formula: `${usd(d.cashTaken)} cash taken + ${usd(d.otherProperty)} other property = $0.00`, value: yesNo(checks.allEquityReinvested) });
  trace.push({ label: "Debt replaced", formula: `${usd(netLiabilityRelief)} net liability relief = $0.00`, value: yesNo(checks.debtReplaced) });

  return {
    amountRealized,
    realizedGain,
    isLoss,
    liabilitiesRelieved,
    offsetByNewDebt,
    offsetByCashAdded,
    netLiabilityRelief,
    takenOut,
    boot,
    recognizedGain,
    deferredGain,
    replacementBasis,
    replacementBasisFromCost,
    otherPropertyBasis,
    sourcesUsesGap,
    balanced,
    recognizedUnrecaptured: now.unrecaptured,
    recognizedCapitalGain: now.capital,
    taxNow: now.tax,
    straightSaleTax: straight.tax,
    taxDeferred,
    checks,
    trace,
  };
}

// Worked example: round, made-up figures. The rates are example values: 20% is the top
// long-term capital gain rate, 25% the maximum on unrecaptured section 1250 gain and
// 3.8% the net investment income tax, as the rule cards state them; a taxpayer's own
// rates may be lower.
export const EXCHANGE_1031_EXAMPLE: Exchange1031Input = {
  salePrice: 4_000_000,
  sellingCosts: 120_000,
  adjustedBasis: 1_500_000,
  debtPaidOff: 1_600_000,
  replacementPrice: 4_300_000,
  newDebt: 2_150_000,
  cashAdded: 0,
  exchangeCosts: 30_000,
  cashTaken: 100_000,
  otherProperty: 0,
  depreciationTaken: 800_000,
  capitalGainRate: 0.2,
  unrecapturedRate: 0.25,
  niiRate: 0.038,
};

export const exchange1031Module = defineModule({ id: "exchange-1031", input: exchange1031Input, run: runExchange1031, example: EXCHANGE_1031_EXAMPLE });
