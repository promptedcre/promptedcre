import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { plainIssue } from "@/components/calc/format";
import { SaleProceedsCalculator } from "@/components/calc/sale-proceeds-calculator";
import { saleProceedsFigures, saleProceedsHeadline, saleProceedsInfo, saleProceedsPageNotes, saleProceedsRowLabel, saleProceedsSplit } from "@/components/calc/sale-proceeds-info";
import { EXCHANGE_1031_EXAMPLE, runExchange1031 } from "@/lib/calculators/exchange-1031";
import { LADDER_STEPS, SALE_PROCEEDS_EXAMPLE, runSaleProceeds, saleProceedsInput, type SaleProceedsInput, type SaleProceedsResult } from "@/lib/calculators/sale-proceeds";

// The expected values were computed independently in Python on 2026-11-14 with the
// decimal module at 40 digits, by routes that share no code with the module: cash as a
// settlement statement (the price less each disbursement in turn); the gain two ways
// that had to agree (amount realized less adjusted basis, and the price over what was
// paid in, plus the depreciation recovered, less the costs of selling); the tax two ways
// that had to agree (a walk through the two layers of gain, and the whole gain at the
// capital gain rate plus the extra the depreciation layer bears); and the clearing price
// by bisection on the settlement statement. Money is compared to the cent.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(0.005);
};

const EX = SALE_PROCEEDS_EXAMPLE;
const ex = (over: Partial<SaleProceedsInput>): SaleProceedsInput => ({ ...EX, ...over });
const run = (over: Partial<SaleProceedsInput>) => runSaleProceeds(ex(over));
const NO_RATES = { capitalGainRate: null, unrecapturedRate: null, niiRate: null };

type Want = { costs: number; ar: number; basis: number; gain: number; dep: number; rest: number; taxDep: number; taxRest: number; tax: number; before: number; after: number; clearing: number };
function pin(r: SaleProceedsResult, w: Want) {
  cents(r.sellingCosts, w.costs);
  cents(r.amountRealized, w.ar);
  cents(r.adjustedBasis, w.basis);
  cents(r.gain, w.gain);
  cents(r.depreciationPart, w.dep);
  cents(r.otherGain, w.rest);
  cents(r.taxOnDepreciationPart, w.taxDep);
  cents(r.taxOnOtherGain, w.taxRest);
  cents(r.tax, w.tax);
  cents(r.cashBeforeTax, w.before);
  cents(r.cashAfterTax, w.after);
  cents(r.clearingPrice, w.clearing);
}

// The first issue on a path, in the words the page shows.
function refusal(input: unknown, path: string, kind: "money" | "pct" = "money"): string {
  const p = saleProceedsInput.safeParse(input);
  expect(p.success).toBe(false);
  const issue = p.error?.issues.find((i) => i.path.map(String).join(".") === path);
  expect(issue, `an issue on ${path}`).toBeDefined();
  return plainIssue(issue as NonNullable<typeof issue>, kind);
}

describe("sale-proceeds worked example ($6,000,000 sale; Python, 2026-11-14)", () => {
  const r = runSaleProceeds(EX);

  it("matches the independent calculation", () => {
    pin(r, {
      costs: 225_000,
      ar: 5_775_000,
      basis: 3_500_000,
      gain: 2_275_000,
      dep: 700_000,
      rest: 1_575_000,
      taxDep: 201_600,
      taxRest: 374_850,
      tax: 576_450,
      before: 2_815_000,
      after: 2_238_550,
      clearing: 3_097_938.14433,
    });
    cents(r.sellingCostsScaled, 180_000);
    cents(r.payoffs, 2_960_000);
    expect(r.taxed).toBe(true);
    expect(r.isLoss).toBe(false);
    expect(r.clears).toBe(true);
    expect(r.shortfall).toBe(0);
    expect(r.notes).toEqual([]);
  });

  it("gives the same sale at the price and 5 and 10 percent either side", () => {
    // price, selling costs, gain, tax, cash before tax, cash after tax
    const want = [
      [5_400_000, 207_000, 1_693_000, 437_934, 2_233_000, 1_795_066],
      [5_700_000, 216_000, 1_984_000, 507_192, 2_524_000, 2_016_808],
      [6_000_000, 225_000, 2_275_000, 576_450, 2_815_000, 2_238_550],
      [6_300_000, 234_000, 2_566_000, 645_708, 3_106_000, 2_460_292],
      [6_600_000, 243_000, 2_857_000, 714_966, 3_397_000, 2_682_034],
    ];
    expect(r.ladder).toHaveLength(5);
    expect(r.ladder.map((row) => row.change)).toEqual(LADDER_STEPS.map((s) => s / 100));
    r.ladder.forEach((row, i) => {
      const [price, costs, gain, tax, before, after] = want[i] as number[];
      expect(row.price).toBe(price);
      cents(row.sellingCosts, costs as number);
      cents(row.gain, gain as number);
      cents(row.tax, tax as number);
      cents(row.cashBeforeTax, before as number);
      cents(row.cashAfterTax, after as number);
    });
  });

  it("traces every figure in the order it was computed", () => {
    expect(r.trace.map((l) => l.label)).toEqual([
      "Selling costs",
      "Amount realized",
      "Adjusted basis",
      "Gain",
      "Gain from depreciation taken",
      "Rest of the gain",
      "Tax on the depreciation part",
      "Tax on the rest of the gain",
      "Tax on the gain",
      "Cash at closing, before tax",
      "Cash after tax",
      "Clearing price",
      "Cash after tax at a price 10% lower",
      "Cash after tax at a price 5% lower",
      "Cash after tax at a price 5% higher",
      "Cash after tax at a price 10% higher",
    ]);
    const value = (label: string) => r.trace.find((l) => l.label === label)?.value;
    expect(value("Selling costs")).toBe("$225,000.00");
    expect(value("Gain")).toBe("$2,275,000.00");
    expect(value("Tax on the gain")).toBe("$576,450.00");
    expect(value("Cash after tax")).toBe("$2,238,550.00");
    expect(value("Clearing price")).toBe("$3,097,938.14");
    expect(value("Cash after tax at a price 10% lower")).toBe("$1,795,066.00");
    expect(r.trace.find((l) => l.label === "Tax on the depreciation part")?.formula).toBe("$700,000.00 × (25.00% unrecaptured + 3.80% net investment income)");
  });

  it("says it in one sentence, and the page's figures are the result's own", () => {
    expect(saleProceedsHeadline(r)).toBe("The sale leaves $2,238,550 after tax: $2,815,000 at closing, less $576,450 of tax on the gain.");
    const f = saleProceedsFigures(EX, r);
    expect(f.lead).toMatchObject({ label: "Cash after tax", value: "$2,238,550" });
    expect(f.rest.map((h) => h.label)).toEqual(["Cash at closing, before tax", "Tax on the gain", "Gain", "Amount realized", "Adjusted basis", "Clearing price"]);
    // where the price goes: the parts drawn add back to the price
    const split = saleProceedsSplit(r);
    cents(split?.reduce((s, x) => s + x.value, 0), EX.salePrice);
  });
});

describe("the IRS's own illustration (Publication 544, 2025, Gain or Loss From Sales and Exchanges, example 1)", () => {
  it("a $140,000 contract total, $4,000 of selling expenses, on a $70,000 cost with $20,000 of improvements and $10,000 of depreciation: a $56,000 gain", () => {
    const r = runSaleProceeds({
      salePrice: 140_000,
      sellingCostRate: 0,
      sellingCostFixed: 4_000,
      loanPayoff: 17_000,
      otherPayoffs: 3_000,
      originalCost: 70_000,
      improvements: 20_000,
      depreciationTaken: 10_000,
      ...NO_RATES,
    });
    cents(r.amountRealized, 136_000);
    cents(r.adjustedBasis, 80_000);
    cents(r.gain, 56_000);
    // The mortgage and the taxes the buyer took over count in the gain and come out of the
    // proceeds. The IRS's $140,000 includes $20,000 of property received, which this
    // calculator can only enter as part of the price: its $116,000 "cash before tax" is the
    // $100,000 of cash less the $4,000 of selling expenses, plus that $20,000 of property.
    // (Reviewer's correction, 2026-11-14: Publication 544 states $100,000 in cash, not $120,000.)
    cents(r.cashBeforeTax, 116_000);
    cents(r.cashBeforeTax - 20_000, 100_000 - 4_000);
  });
});

// Reviewer (math-review-sale): sales of the reviewer's own, computed independently in Python
// with the decimal module on 2026-11-14 from the scope alone, before the module was read.
describe("reviewer's independent sales (Python, 2026-11-14)", () => {
  it("an ordinary taxed sale: $2,400,000 at 5% plus $30,000 of selling costs", () => {
    const r = runSaleProceeds({
      salePrice: 2_400_000,
      sellingCostRate: 0.05,
      sellingCostFixed: 30_000,
      loanPayoff: 1_100_000,
      otherPayoffs: 20_000,
      originalCost: 1_500_000,
      improvements: 200_000,
      depreciationTaken: 350_000,
      capitalGainRate: 0.2,
      unrecapturedRate: 0.25,
      niiRate: 0.038,
    });
    pin(r, { costs: 150_000, ar: 2_250_000, basis: 1_350_000, gain: 900_000, dep: 350_000, rest: 550_000, taxDep: 100_800, taxRest: 130_900, tax: 231_700, before: 1_130_000, after: 898_300, clearing: 1_210_526.315789 });
    [724_564, 811_432, 898_300, 985_168, 1_072_036].forEach((x, i) => cents(r.ladder[i]?.cashAfterTax, x));
    expect(r.notes).toEqual([]);
  });

  it("a sale that does not clear the debts but still has a gain: the tax is owed on top of what the seller brings", () => {
    // no selling cost rate, large fixed costs, a low basis after heavy depreciation
    const r = runSaleProceeds({
      salePrice: 500_000,
      sellingCostRate: 0,
      sellingCostFixed: 90_000,
      loanPayoff: 480_000,
      otherPayoffs: 0,
      originalCost: 400_000,
      improvements: 0,
      depreciationTaken: 250_000,
      capitalGainRate: 0.2,
      unrecapturedRate: 0.25,
      niiRate: 0.038,
    });
    pin(r, { costs: 90_000, ar: 410_000, basis: 150_000, gain: 260_000, dep: 250_000, rest: 10_000, taxDep: 72_000, taxRest: 2_380, tax: 74_380, before: -70_000, after: -144_380, clearing: 570_000 });
    expect(r.clears).toBe(false);
    cents(r.shortfall, 70_000);
    expect(r.notes).toEqual([
      "The sale does not clear the debts: the seller must bring $70,000.00 to closing.",
      "The tax on the gain, $74,380.00, is owed on top of that: $144,380.00 short after tax.",
    ]);
    // the headline names the tax as well as the cash to bring, so the page repeats neither note
    expect(saleProceedsHeadline(r)).toBe("The sale does not clear the debts: the seller must bring $70,000 to closing and owes $74,380 of tax on the gain, $144,380 in all.");
    expect(saleProceedsPageNotes(r)).toEqual([]);
  });

  it("a loss with a loan larger than the price: no tax, and the shortfall to bring", () => {
    const r = runSaleProceeds({
      salePrice: 700_000,
      sellingCostRate: 0.06,
      sellingCostFixed: 15_000,
      loanPayoff: 800_000,
      otherPayoffs: 25_000,
      originalCost: 1_000_000,
      improvements: 100_000,
      depreciationTaken: 120_000,
      capitalGainRate: 0.2,
      unrecapturedRate: 0.25,
      niiRate: 0.038,
    });
    pin(r, { costs: 57_000, ar: 643_000, basis: 980_000, gain: -337_000, dep: 0, rest: 0, taxDep: 0, taxRest: 0, tax: 0, before: -182_000, after: -182_000, clearing: 893_617.021277 });
    cents(r.shortfall, 182_000);
    expect(r.notes).toEqual([
      "The sale does not clear the debts: the seller must bring $182,000.00 to closing.",
      "The sale is at a loss of $337,000.00, so there is no gain to tax. What the loss may save in tax is not figured here.",
    ]);
    // the headline states the cash to bring and not the loss, so the page keeps the loss note
    expect(saleProceedsHeadline(r)).toBe("The sale does not clear the debts: the seller must bring $182,000 to closing.");
    expect(saleProceedsPageNotes(r)).toEqual(["The sale is at a loss of $337,000.00, so there is no gain to tax. What the loss may save in tax is not figured here."]);
  });

  it("the example line names every figure the example's basis and payoffs are built from", () => {
    expect(saleProceedsInfo.exampleLine).toBe(
      "a $6,000,000 sale with 3% and $45,000 of selling costs, a $2,900,000 loan and $60,000 of other payoffs, on a $3,800,000 cost plus $400,000 of improvements less $700,000 of depreciation, at example rates of 20% on the gain, 25% on the depreciation part and 3.8% net investment income",
    );
  });
});

describe("edge cases, against the same independent calculation", () => {
  it("no loan and no other payoffs: the cash is the amount realized", () => {
    const r = run({ loanPayoff: 0, otherPayoffs: 0 });
    pin(r, { costs: 225_000, ar: 5_775_000, basis: 3_500_000, gain: 2_275_000, dep: 700_000, rest: 1_575_000, taxDep: 201_600, taxRest: 374_850, tax: 576_450, before: 5_775_000, after: 5_198_550, clearing: 46_391.752577 });
    expect(r.cashBeforeTax).toBe(r.amountRealized);
    // with no fixed cost either, any price clears
    expect(run({ loanPayoff: 0, otherPayoffs: 0, sellingCostFixed: 0 }).clearingPrice).toBe(0);
  });

  it("a loss: no tax, no depreciation part, and what the loss may save in tax is not figured", () => {
    const r = run({ salePrice: 3_000_000, loanPayoff: 1_500_000 });
    pin(r, { costs: 135_000, ar: 2_865_000, basis: 3_500_000, gain: -635_000, dep: 0, rest: 0, taxDep: 0, taxRest: 0, tax: 0, before: 1_305_000, after: 1_305_000, clearing: 1_654_639.175258 });
    expect(r.isLoss).toBe(true);
    expect(r.depreciationPart).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.cashAfterTax).toBe(r.cashBeforeTax);
    expect(r.trace[3]?.label).toBe("Loss");
    expect(r.trace[3]?.value).toBe("-$635,000.00");
    expect(r.notes).toEqual(["The sale is at a loss of $635,000.00, so there is no gain to tax. What the loss may save in tax is not figured here."]);
    expect(r.trace.find((l) => l.label === "Tax on the gain")).toEqual({
      label: "Tax on the gain",
      formula: "a loss: no tax, and what the loss may save in tax is not figured here",
      value: "$0.00",
    });
    expect(saleProceedsHeadline(r)).toBe("The sale leaves $1,305,000 at closing, at a loss of $635,000; what the loss may save in tax is not figured here.");
    // nowhere does a loss read as if it had no tax value
    for (const text of [...r.notes, ...r.trace.map((l) => l.formula), saleProceedsHeadline(r)]) expect(text).not.toContain("not credited");
    expect(saleProceedsPageNotes(r)).toEqual([]);
    expect(saleProceedsFigures(ex({ salePrice: 3_000_000, loanPayoff: 1_500_000 }), r).rest.find((h) => h.label === "Loss")?.value).toBe("$635,000");
  });

  it("a gain smaller than the depreciation taken: all of it is the depreciation part", () => {
    const r = run({ salePrice: 4_000_000 });
    pin(r, { costs: 165_000, ar: 3_835_000, basis: 3_500_000, gain: 335_000, dep: 335_000, rest: 0, taxDep: 96_480, taxRest: 0, tax: 96_480, before: 875_000, after: 778_520, clearing: 3_097_938.14433 });
    expect(r.otherGain).toBe(0);
    expect(r.notes).toEqual(["The gain is no more than the depreciation taken, so all of it is the depreciation part."]);
  });

  it("rates all null: no tax is figured and the result stops at cash before tax", () => {
    const r = run(NO_RATES);
    cents(r.gain, 2_275_000);
    cents(r.depreciationPart, 700_000);
    cents(r.otherGain, 1_575_000);
    cents(r.cashBeforeTax, 2_815_000);
    cents(r.clearingPrice, 3_097_938.14433);
    expect(r.taxed).toBe(false);
    expect(r.taxOnDepreciationPart).toBeNull();
    expect(r.taxOnOtherGain).toBeNull();
    expect(r.tax).toBeNull();
    expect(r.cashAfterTax).toBeNull();
    for (const row of r.ladder) {
      expect(row.tax).toBeNull();
      expect(row.cashAfterTax).toBeNull();
    }
    [2_233_000, 2_524_000, 2_815_000, 3_106_000, 3_397_000].forEach((x, i) => cents(r.ladder[i]?.cashBeforeTax, x));
    const labels = r.trace.map((l) => l.label);
    expect(labels).not.toContain("Cash after tax");
    expect(labels).not.toContain("Tax on the depreciation part");
    expect(labels).toContain("Cash before tax at a price 10% lower");
    expect(r.trace.find((l) => l.label === "Tax on the gain")).toEqual({ label: "Tax on the gain", formula: "no tax rates entered", value: "not figured" });
    expect(r.notes).toEqual(["No tax rates were entered, so no tax is figured and the result stops at cash before tax."]);
    expect(saleProceedsHeadline(r)).toBe("The sale leaves $2,815,000 at closing, before tax.");
    expect(saleProceedsPageNotes(r)).toEqual([]);
    expect(saleProceedsFigures(ex(NO_RATES), r).lead).toMatchObject({ label: "Cash at closing, before tax", value: "$2,815,000" });
    cents(saleProceedsSplit(r)?.reduce((s, x) => s + x.value, 0), EX.salePrice);
  });

  it("cash before tax below zero: the sale does not clear the debts, and the note says how much to bring", () => {
    const r = run({ salePrice: 3_000_000 });
    pin(r, { costs: 135_000, ar: 2_865_000, basis: 3_500_000, gain: -635_000, dep: 0, rest: 0, taxDep: 0, taxRest: 0, tax: 0, before: -95_000, after: -95_000, clearing: 3_097_938.14433 });
    expect(r.clears).toBe(false);
    cents(r.shortfall, 95_000);
    expect(r.notes[0]).toBe("The sale does not clear the debts: the seller must bring $95,000.00 to closing.");
    // a loss, so no tax to name beside the cash to bring
    expect(saleProceedsHeadline(r)).toBe("The sale does not clear the debts: the seller must bring $95,000 to closing.");
    expect(saleProceedsPageNotes(r)).toEqual(["The sale is at a loss of $635,000.00, so there is no gain to tax. What the loss may save in tax is not figured here."]);
    // the ladder crosses zero between the price and 5 percent above it
    [-386_000, -240_500, -95_000, 50_500, 196_000].forEach((x, i) => cents(r.ladder[i]?.cashBeforeTax, x));
    expect(saleProceedsSplit(r)).toBeNull();
  });

  it("zero selling costs: the amount realized is the price", () => {
    const r = run({ sellingCostRate: 0, sellingCostFixed: 0 });
    pin(r, { costs: 0, ar: 6_000_000, basis: 3_500_000, gain: 2_500_000, dep: 700_000, rest: 1_800_000, taxDep: 201_600, taxRest: 428_400, tax: 630_000, before: 3_040_000, after: 2_410_000, clearing: 2_960_000 });
    expect(r.amountRealized).toBe(6_000_000);
    expect(r.clearingPrice).toBe(2_960_000);
  });

  it("cash at closing that does not cover the tax is said so", () => {
    const r = run({ loanPayoff: 5_500_000 });
    pin(r, { costs: 225_000, ar: 5_775_000, basis: 3_500_000, gain: 2_275_000, dep: 700_000, rest: 1_575_000, taxDep: 201_600, taxRest: 374_850, tax: 576_450, before: 215_000, after: -361_450, clearing: 5_778_350.515464 });
    expect(r.clears).toBe(true);
    expect(r.notes).toEqual(["The cash at closing does not cover the tax on the gain: it is $361,450.00 short."]);
    // its own sentence: the cash at closing, the tax and how much it is short; never "leaves" a negative amount
    expect(saleProceedsHeadline(r)).toBe("The sale leaves $215,000 at closing, which does not cover the $576,450 of tax on the gain: it is $361,450 short.");
    expect(saleProceedsHeadline(r)).not.toContain("-$");
    expect(saleProceedsPageNotes(r)).toEqual([]);
    expect(saleProceedsSplit(r)).toBeNull();
  });

  it("no depreciation taken: all of the gain at the capital gain rate", () => {
    const r = run({ depreciationTaken: 0 });
    pin(r, { costs: 225_000, ar: 5_775_000, basis: 4_200_000, gain: 1_575_000, dep: 0, rest: 1_575_000, taxDep: 0, taxRest: 374_850, tax: 374_850, before: 2_815_000, after: 2_440_150, clearing: 3_097_938.14433 });
    expect(r.notes).toEqual([]);
  });

  it("a net investment income rate of zero is a rate, not a blank", () => {
    const r = run({ capitalGainRate: 0.15, niiRate: 0 });
    pin(r, { costs: 225_000, ar: 5_775_000, basis: 3_500_000, gain: 2_275_000, dep: 700_000, rest: 1_575_000, taxDep: 175_000, taxRest: 236_250, tax: 411_250, before: 2_815_000, after: 2_403_750, clearing: 3_097_938.14433 });
    expect(r.taxed).toBe(true);
  });

  it("figures entered in cents", () => {
    const r = runSaleProceeds({
      salePrice: 4_321_987.65,
      sellingCostRate: 0.0275,
      sellingCostFixed: 38_412.19,
      loanPayoff: 1_987_654.32,
      otherPayoffs: 23_456.78,
      originalCost: 2_765_432.1,
      improvements: 123_456.78,
      depreciationTaken: 456_789.01,
      capitalGainRate: 0.15,
      unrecapturedRate: 0.22,
      niiRate: 0.038,
    });
    pin(r, {
      costs: 157_266.850375,
      ar: 4_164_720.799625,
      basis: 2_432_099.87,
      gain: 1_732_620.929625,
      dep: 456_789.01,
      rest: 1_275_831.919625,
      taxDep: 117_851.56458,
      taxRest: 239_856.40089,
      tax: 357_707.96547,
      before: 2_153_609.699625,
      after: 1_795_901.734156,
      clearing: 2_107_478.96144,
    });
  });

  it("depreciation equal to cost plus improvements leaves a basis of zero, and the whole amount realized is gain", () => {
    const r = run({ depreciationTaken: 4_200_000 });
    expect(r.adjustedBasis).toBe(0);
    cents(r.gain, 5_775_000);
    cents(r.depreciationPart, 4_200_000);
    cents(r.otherGain, 1_575_000);
  });
});

describe("a sale that does not clear the debts and still has a taxable gain (Python, 2026-11-14)", () => {
  // a low basis after years of depreciation, and a loan larger than the amount realized
  const input: SaleProceedsInput = {
    salePrice: 1_800_000,
    sellingCostRate: 0.04,
    sellingCostFixed: 28_000,
    loanPayoff: 1_750_000,
    otherPayoffs: 12_000,
    originalCost: 900_000,
    improvements: 150_000,
    depreciationTaken: 400_000,
    capitalGainRate: 0.2,
    unrecapturedRate: 0.25,
    niiRate: 0.038,
  };
  const r = runSaleProceeds(input);

  it("matches the independent calculation", () => {
    pin(r, { costs: 100_000, ar: 1_700_000, basis: 650_000, gain: 1_050_000, dep: 400_000, rest: 650_000, taxDep: 115_200, taxRest: 154_700, tax: 269_900, before: -62_000, after: -331_900, clearing: 1_864_583.333333 });
    expect(r.clears).toBe(false);
    expect(r.isLoss).toBe(false);
    cents(r.shortfall, 62_000);
  });

  it("names the tax in the headline, in one sentence, beside the cash to bring", () => {
    const headline = saleProceedsHeadline(r);
    expect(headline).toBe("The sale does not clear the debts: the seller must bring $62,000 to closing and owes $269,900 of tax on the gain, $331,900 in all.");
    expect(headline.match(/\./g)).toHaveLength(1);
  });

  it("keeps both notes in the result, and the page does not print them again under the headline", () => {
    expect(r.notes).toEqual([
      "The sale does not clear the debts: the seller must bring $62,000.00 to closing.",
      "The tax on the gain, $269,900.00, is owed on top of that: $331,900.00 short after tax.",
    ]);
    expect(saleProceedsPageNotes(r)).toEqual([]);
  });

  it("with no rates entered, the headline names only the cash to bring and the page still says no tax was figured", () => {
    const blank = runSaleProceeds({ ...input, ...NO_RATES });
    expect(saleProceedsHeadline(blank)).toBe("The sale does not clear the debts: the seller must bring $62,000 to closing.");
    expect(blank.notes).toEqual([
      "The sale does not clear the debts: the seller must bring $62,000.00 to closing.",
      "No tax rates were entered, so no tax is figured and the result stops at cash before tax.",
    ]);
    expect(saleProceedsPageNotes(blank)).toEqual(["No tax rates were entered, so no tax is figured and the result stops at cash before tax."]);
  });
});

describe("what the page shows", () => {
  it("prints a note only when the headline does not already state it, and the result keeps every note", () => {
    // a gain no larger than the depreciation taken: the headline does not say so, so the page does
    const small = run({ salePrice: 4_000_000 });
    expect(small.notes).toHaveLength(1);
    expect(saleProceedsPageNotes(small)).toEqual(small.notes);
    // a loss with no rates: the headline says "before tax", so only the loss note is printed
    const loss = run({ salePrice: 3_000_000, loanPayoff: 1_500_000, ...NO_RATES });
    expect(saleProceedsHeadline(loss)).toBe("The sale leaves $1,305,000 at closing, before tax.");
    expect(loss.notes).toHaveLength(2);
    expect(saleProceedsPageNotes(loss)).toEqual(["The sale is at a loss of $635,000.00, so there is no gain to tax. What the loss may save in tax is not figured here."]);
    // the worked example has no notes at all
    expect(saleProceedsPageNotes(runSaleProceeds(EX))).toEqual([]);
  });

  it("labels the ladder's middle row as the price entered, on the worked example too", () => {
    const r = runSaleProceeds(EX);
    expect(r.ladder.map(saleProceedsRowLabel)).toEqual(["$5,400,000 (10% lower)", "$5,700,000 (5% lower)", "$6,000,000 (entered)", "$6,300,000 (5% higher)", "$6,600,000 (10% higher)"]);
  });

  it("renders the worked example with short hints that say what a seller could get wrong", () => {
    const html = renderToStaticMarkup(createElement(SaleProceedsCalculator, { tool: "calc_run" }));
    expect(html).toContain("$6,000,000 (entered)");
    expect(html).not.toContain("(yours)");
    expect(html).toContain("with any loan the buyer takes over");
    expect(html).toContain("payoff letter total, or a loan taken over");
    // the cold wording read of 2026-11-14 (S1 to S4): four hints say more, where a seller could misread the short form
    expect(html).toContain("a second lien, property tax owed to closing, tenant deposits credited to the buyer");
    expect(html).toContain("allowed or allowable, claimed or not; 0 if none");
    expect(html).toContain("on gain up to the building&#x27;s straight-line depreciation");
    expect(html).toContain("only if it applies to the seller; added to both rates; 0 leaves it out");
    expect(html).toContain("the top federal rates the rule cards state");
    expect(html).not.toContain("federal maximums");
    // every field has its hint, and all but those four are still as short as the longest on the like-kind exchange page (43 characters)
    const hints = [...html.matchAll(/<[a-z]+[^>]*\sid="[^"]*-h"[^>]*>([^<]*)</g)].map((m) => m[1] as string);
    expect(hints).toHaveLength(11);
    expect(hints.filter((hint) => hint.length > 43)).toHaveLength(4);
    // each input has one label, and its unit and hint are tied to it
    expect(html.match(/<label /g)).toHaveLength(11);
    expect(html).not.toMatch(/<input[^>]*aria-labelledby/);
  });
});

describe("what the schema tells an agent", () => {
  const props = (z.toJSONSchema(saleProceedsInput, { io: "input" }) as { properties: Record<string, { description?: string }> }).properties;

  it("says a loan the buyer assumes or takes subject to belongs in the price and under the payoffs", () => {
    expect(props.salePrice?.description).toContain("A loan the buyer assumes or takes the property subject to belongs in the price, and under the payoffs too");
    expect(props.loanPayoff?.description).toContain("a loan the buyer assumes or takes the property subject to goes here too");
  });

  it("says the net investment income rate is applied as if all of the gain were above the tax's threshold", () => {
    expect(props.niiRate?.description).toContain("applied as if all of the gain were above the tax's threshold");
  });

  it("entered that way, a loan the buyer takes over raises the gain and leaves the cash where it was", () => {
    // the cash price alone, then the same sale with a $500,000 loan the buyer takes over, in the price and in the payoffs
    const cashOnly = run({ salePrice: 5_500_000, sellingCostRate: 0, loanPayoff: 2_400_000 });
    const withLoan = run({ salePrice: 6_000_000, sellingCostRate: 0, loanPayoff: 2_900_000 });
    cents(withLoan.cashBeforeTax, cashOnly.cashBeforeTax);
    cents(withLoan.gain - cashOnly.gain, 500_000);
  });
});

describe("rates inside the trace formulas", () => {
  it("prints a rate that needs more than two decimals with four, so the rate shown is the rate used", () => {
    // Python, 2026-11-14: $4,000,000 at 2.375% is $95,000, plus $45,000 fixed
    const r = run({ salePrice: 4_000_000, sellingCostRate: 0.02375, loanPayoff: 1_900_000, otherPayoffs: 0, originalCost: 2_600_000, improvements: 200_000, depreciationTaken: 500_000, capitalGainRate: 0.18125 });
    pin(r, { costs: 140_000, ar: 3_860_000, basis: 2_300_000, gain: 1_560_000, dep: 500_000, rest: 1_060_000, taxDep: 144_000, taxRest: 232_405, tax: 376_405, before: 1_960_000, after: 1_583_595, clearing: 1_992_317.541613 });
    const line = (label: string) => r.trace.find((l) => l.label === label);
    expect(line("Selling costs")).toEqual({ label: "Selling costs", formula: "$4,000,000.00 price × 2.3750% + $45,000.00 fixed", value: "$140,000.00" });
    expect(line("Tax on the rest of the gain")?.formula).toBe("$1,060,000.00 × (18.1250% capital gain + 3.80% net investment income)");
    expect(line("Tax on the depreciation part")?.formula).toBe("$500,000.00 × (25.00% unrecaptured + 3.80% net investment income)");
    expect(line("Clearing price")?.formula).toBe("($1,900,000.00 loan payoff + $0.00 other payoffs + $45,000.00 fixed costs) ÷ (1 − 2.3750%)");
    for (const l of r.trace) expect(l.formula).not.toContain("2.38%");
  });

  it("leaves the worked example's formulas at two decimals", () => {
    const r = runSaleProceeds(EX);
    const formula = (label: string) => r.trace.find((l) => l.label === label)?.formula;
    expect(formula("Selling costs")).toBe("$6,000,000.00 price × 3.00% + $45,000.00 fixed");
    expect(formula("Tax on the depreciation part")).toBe("$700,000.00 × (25.00% unrecaptured + 3.80% net investment income)");
    expect(formula("Tax on the rest of the gain")).toBe("$1,575,000.00 × (20.00% capital gain + 3.80% net investment income)");
    expect(formula("Clearing price")).toBe("($2,900,000.00 loan payoff + $60,000.00 other payoffs + $45,000.00 fixed costs) ÷ (1 − 3.00%)");
  });
});

describe("invariants", () => {
  const cases: SaleProceedsInput[] = [
    EX,
    ex({ salePrice: 3_000_000 }),
    ex({ salePrice: 4_000_000 }),
    ex({ sellingCostRate: 0, sellingCostFixed: 0 }),
    ex({ loanPayoff: 0, otherPayoffs: 0, ...NO_RATES }),
    ex({ salePrice: 9_500_000, sellingCostRate: 0.045, sellingCostFixed: 80_000, loanPayoff: 4_100_000, otherPayoffs: 0, depreciationTaken: 1_250_000, capitalGainRate: 0.15, unrecapturedRate: 0.22, niiRate: 0 }),
    ex({ salePrice: 2_000_000, originalCost: 2_500_000, improvements: 0, depreciationTaken: 0, loanPayoff: 2_200_000 }),
  ];
  // One numbering: a case keeps its number in every group below, the taxed group too.
  const numbered = cases.map((c, i) => [i + 1, c] as const);
  const taxedCases = numbered.filter(([, c]) => c.capitalGainRate !== null);

  it.each(numbered)("case %i: the money and the gain add up", (_, c) => {
    const r = runSaleProceeds(c);
    // amount realized = adjusted basis + gain
    cents(r.adjustedBasis + r.gain, r.amountRealized);
    // the depreciation part plus the rest is the gain, when there is a gain
    if (r.gain > 0) cents(r.depreciationPart + r.otherGain, r.gain);
    else expect(r.depreciationPart + r.otherGain).toBe(0);
    expect(r.depreciationPart).toBeLessThanOrEqual(c.depreciationTaken);
    // money in equals money out: the price goes to selling costs, the payoffs and the seller
    cents(r.cashBeforeTax + c.loanPayoff + c.otherPayoffs + r.sellingCosts, c.salePrice);
    cents(r.sellingCostsScaled + c.sellingCostFixed, r.sellingCosts);
    if (r.tax !== null) {
      cents((r.taxOnDepreciationPart ?? 0) + (r.taxOnOtherGain ?? 0), r.tax);
      cents(r.cashBeforeTax - r.tax, r.cashAfterTax as number);
      expect(r.tax).toBeGreaterThanOrEqual(0);
    }
    cents(r.shortfall, Math.max(0, -r.cashBeforeTax));
    expect(r.clears).toBe(r.cashBeforeTax >= 0);
  });

  it.each(numbered)("case %i: at the clearing price, cash before tax is zero", (_, c) => {
    const r = runSaleProceeds(c);
    if (r.clearingPrice === 0) return;
    const at = runSaleProceeds({ ...c, salePrice: r.clearingPrice });
    cents(at.cashBeforeTax, 0);
    expect(at.clears).toBe(true);
    expect(at.shortfall).toBe(0);
    expect(at.notes.some((n) => n.startsWith("The sale does not clear"))).toBe(false);
    cents(at.clearingPrice, r.clearingPrice);
    if (c.loanPayoff + c.otherPayoffs === 0) {
      // with nothing to pay off, the clearing price is where the selling costs take the whole price; under it the input is refused
      cents(at.amountRealized, 0);
      expect(refusal({ ...c, salePrice: r.clearingPrice - 1 }, "sellingCostFixed")).toBe("Selling costs cannot be more than the sale price.");
      return;
    }
    // a dollar under it, the seller brings what a dollar of price would have left
    const under = runSaleProceeds({ ...c, salePrice: r.clearingPrice - 1 });
    expect(under.clears).toBe(false);
    cents(under.shortfall, 1 - c.sellingCostRate);
  });

  it.each(numbered)("case %i: cash before tax rises by one less the selling cost rate for each dollar of price", (_, c) => {
    const r = runSaleProceeds(c);
    const up = runSaleProceeds({ ...c, salePrice: c.salePrice + 1_000 });
    cents(up.cashBeforeTax - r.cashBeforeTax, 1_000 * (1 - c.sellingCostRate));
    // down the ladder too: each row against the one before it
    r.ladder.slice(1).forEach((row, i) => {
      const prev = r.ladder[i] as (typeof r.ladder)[number];
      cents(row.cashBeforeTax - prev.cashBeforeTax, (row.price - prev.price) * (1 - c.sellingCostRate));
      expect(row.price).toBeGreaterThan(prev.price);
      if (row.tax !== null && prev.tax !== null) expect(row.tax).toBeGreaterThanOrEqual(prev.tax);
    });
  });

  it.each(numbered)("case %i: the ladder's middle row is the main result, and every row is the calculator run at that price", (_, c) => {
    const r = runSaleProceeds(c);
    expect(r.ladder[2]).toEqual({ change: 0, price: c.salePrice, sellingCosts: r.sellingCosts, gain: r.gain, tax: r.tax, cashBeforeTax: r.cashBeforeTax, cashAfterTax: r.cashAfterTax });
    for (const row of r.ladder) {
      const at = runSaleProceeds({ ...c, salePrice: row.price });
      cents(row.price, c.salePrice * (1 + row.change));
      expect(row.sellingCosts).toBe(at.sellingCosts);
      expect(row.gain).toBe(at.gain);
      expect(row.tax).toBe(at.tax);
      expect(row.cashBeforeTax).toBe(at.cashBeforeTax);
      expect(row.cashAfterTax).toBe(at.cashAfterTax);
    }
  });

  it("keeps one numbering: the taxed group is every case but the one with no rates, each under its own number", () => {
    expect(taxedCases.map(([n]) => n)).toEqual([1, 2, 3, 4, 6, 7]);
  });

  it.each(taxedCases)(
    "case %i: the tax is what exchange-1031 reports as the tax on the whole gain for the same sale",
    (_, c) => {
      const r = runSaleProceeds(c);
      // The same sale as an exchange: every selling cost as a selling cost, the same basis, depreciation and rates.
      // What is bought and borrowed on the other side does not change the tax on the whole gain.
      const x = runExchange1031({
        ...EXCHANGE_1031_EXAMPLE,
        salePrice: c.salePrice,
        sellingCosts: r.sellingCosts,
        exchangeCosts: 0,
        adjustedBasis: r.adjustedBasis,
        debtPaidOff: c.loanPayoff,
        depreciationTaken: c.depreciationTaken,
        capitalGainRate: c.capitalGainRate as number,
        unrecapturedRate: c.unrecapturedRate as number,
        niiRate: c.niiRate as number,
      });
      cents(x.amountRealized, r.amountRealized);
      cents(x.realizedGain, r.gain);
      cents(x.taxNow + x.taxDeferred, r.tax as number);
      cents(x.straightSaleTax, r.tax as number);
      expect(x.isLoss).toBe(r.isLoss);
    },
  );

  it("the tax does not fall as the price rises, and is zero until there is a gain", () => {
    let last = -1;
    for (const price of [2_000_000, 3_000_000, 3_700_000, 4_000_000, 5_000_000, 6_000_000, 8_000_000]) {
      const r = run({ salePrice: price, loanPayoff: 0, otherPayoffs: 0 });
      expect(r.tax).toBeGreaterThanOrEqual(last);
      if (r.gain <= 0) expect(r.tax).toBe(0);
      last = r.tax as number;
    }
  });
});

describe("input", () => {
  it("accepts the worked example and refuses fields it does not know", () => {
    expect(saleProceedsInput.safeParse(EX).success).toBe(true);
    expect(saleProceedsInput.safeParse({ ...EX, stateRate: 0.05 }).success).toBe(false);
    expect(saleProceedsInput.safeParse({}).success).toBe(false);
  });

  it("refuses depreciation above cost plus improvements, in plain words", () => {
    expect(refusal(ex({ depreciationTaken: 4_200_000.01 }), "depreciationTaken")).toBe("Depreciation taken cannot be more than the cost plus improvements.");
    expect(saleProceedsInput.safeParse(ex({ depreciationTaken: 4_200_000 })).success).toBe(true);
  });

  it("refuses a selling cost rate of 100% or more, and selling costs above the price", () => {
    expect(refusal(ex({ sellingCostRate: 1 }), "sellingCostRate", "pct")).toBe("Less than 100%.");
    expect(refusal(ex({ sellingCostRate: 1.5 }), "sellingCostRate", "pct")).toBe("Less than 100%.");
    expect(refusal(ex({ sellingCostFixed: 5_900_000 }), "sellingCostFixed")).toBe("Selling costs cannot be more than the sale price.");
  });

  it("refuses rates given in part, naming each one that is missing", () => {
    const words = "The tax needs all three rates; leave all three blank to figure no tax.";
    expect(refusal(ex({ niiRate: null }), "niiRate", "pct")).toBe(words);
    const two = saleProceedsInput.safeParse(ex({ capitalGainRate: null, unrecapturedRate: null }));
    expect(two.error?.issues.map((i) => i.path.join("."))).toEqual(["capitalGainRate", "unrecapturedRate"]);
    expect(refusal(ex({ capitalGainRate: null, unrecapturedRate: null }), "unrecapturedRate", "pct")).toBe(words);
    expect(saleProceedsInput.safeParse(ex(NO_RATES)).success).toBe(true);
  });

  it("refuses a tax rate of 100%, a negative amount, a zero price or cost and a value that is not a number", () => {
    expect(refusal(ex({ capitalGainRate: 1 }), "capitalGainRate", "pct")).toBe("Less than 100%.");
    expect(refusal(ex({ niiRate: -0.01 }), "niiRate", "pct")).toBe("Cannot be negative.");
    expect(refusal(ex({ loanPayoff: -1 }), "loanPayoff")).toBe("Cannot be negative.");
    expect(refusal(ex({ salePrice: 0 }), "salePrice")).toBe("Must be more than zero.");
    expect(refusal(ex({ originalCost: 0 }), "originalCost")).toBe("Must be more than zero.");
    expect(refusal(ex({ improvements: Number.NaN }), "improvements")).toBe("Enter a number.");
    expect(() => runSaleProceeds(ex({ salePrice: Number.NaN }))).toThrow();
    expect(() => runSaleProceeds(ex({ niiRate: null }))).toThrow();
  });
});
