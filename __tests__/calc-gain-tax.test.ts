import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as afterTax from "@/lib/calculators/after-tax";
import * as exchange from "@/lib/calculators/exchange-1031";
import { splitGain, taxGain, type GainRates } from "@/lib/calculators/gain-tax";
import * as saleProceeds from "@/lib/calculators/sale-proceeds";
import * as afterTaxBefore from "./fixtures/after-tax-before";
import * as exchangeBefore from "./fixtures/exchange-1031-before";
import * as saleProceedsBefore from "./fixtures/sale-proceeds-before";

// The shared gain-tax helper (2026-11-14): after-tax, exchange-1031 and sale-proceeds
// now split and price a gain through one function. The fixtures are the three files as
// they stood before (git show HEAD), so every comparison below is the old code against
// the new on the same input, every field of every result, for exact equality
// (toStrictEqual tells 0 from -0 and checks every trace line).

const RATES: GainRates = { capitalGain: 0.2, unrecaptured: 0.25, nii: 0.038 };
const BIG = 9e15; // past Number.MAX_SAFE_INTEGER's order; the money fields have no upper bound
const TOP_RATE = 0.999999; // the rate fields are below 1

describe("the helper, pinned to values figured in Python (decimal), 2026-11-14", () => {
  it("splits a gain at the depreciation taken and prices each part", () => {
    expect(splitGain(2_000_000, 800_000)).toEqual({ unrecaptured: 800_000, rest: 1_200_000 });
    const g = taxGain(2_000_000, 800_000, RATES);
    expect(g.taxOnUnrecaptured).toBeCloseTo(230_400, 6);
    expect(g.taxOnRest).toBeCloseTo(285_600, 6);
    expect(g.tax).toBeCloseTo(516_000, 6);
    expect([g.lossCarriedIn, g.lossUsedOnRest, g.lossUsedOnUnrecaptured, g.lossUnused]).toEqual([0, 0, 0, 0]);
  });

  it("puts a gain smaller than the depreciation taken all in the unrecaptured part", () => {
    const g = taxGain(500_000, 800_000, RATES);
    expect([g.unrecaptured, g.rest]).toEqual([500_000, 0]);
    expect(g.tax).toBeCloseTo(144_000, 6);
  });

  it("gives a loss no parts and no tax", () => {
    expect(splitGain(-100_000, 800_000)).toEqual({ unrecaptured: 0, rest: 0 });
    expect(taxGain(-100_000, 800_000, RATES).tax).toBe(0);
  });

  it("offsets a carried loss against the rest first, then the unrecaptured part, and leaves the excess uncredited", () => {
    const a = taxGain(2_000_000, 800_000, RATES, 1_500_000);
    expect([a.lossUsedOnRest, a.lossUsedOnUnrecaptured, a.lossUnused]).toEqual([1_200_000, 300_000, 0]);
    expect(a.taxOnRest).toBe(0);
    expect(a.tax).toBeCloseTo(144_000, 6);
    const b = taxGain(2_000_000, 800_000, RATES, 2_500_000);
    expect([b.lossUsedOnRest, b.lossUsedOnUnrecaptured, b.lossUnused, b.tax]).toEqual([1_200_000, 800_000, 500_000, 0]);
  });
});

// A seeded generator, so the sweep is the same every run.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const between = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();
const whole = (r: () => number, lo: number, hi: number) => Math.floor(between(r, lo, hi + 1));

function sameExports(now: object, before: object) {
  expect(Object.keys(now).sort()).toEqual(Object.keys(before).sort());
}
const inputSchema = (s: z.ZodType) => JSON.stringify(z.toJSONSchema(s, { target: "draft-2020-12", io: "input" }));

describe("after-tax: old and new agree exactly", () => {
  const EX = afterTax.AFTER_TAX_EXAMPLE;
  const named: [string, afterTax.AfterTaxInput][] = [
    ["the worked example", EX],
    ["a loss on sale", { ...EX, exitCap: 0.2 }],
    ["a gain smaller than the depreciation taken", { ...EX, exitCap: 0.09 }],
    // landShare must stay below 1, so the schema allows no input with zero depreciation; this is the closest it allows.
    ["depreciation as near zero as the schema allows", { ...EX, landShare: 0.9999999999 }],
    ["every rate zero", { ...EX, ordinaryRate: 0, capitalGainRate: 0, unrecapturedRate: 0, niiRate: 0 }],
    ["a zero net investment income rate", { ...EX, niiRate: 0 }],
    ["operating losses carried into the sale and used against both parts", { ...EX, noi: 150_000, loan: 5_000_000, rate: 0.1, amortYears: 0, ioYears: 0, exitCap: 0.023 }],
    ["operating losses larger than the gain, left unused", { ...EX, noi: 150_000, loan: 5_000_000, rate: 0.1, amortYears: 0, ioYears: 0, exitCap: 0.06 }],
    ["all cash", { ...EX, loan: 0 }],
    [
      "the largest inputs the schema allows",
      {
        price: BIG,
        closingCosts: BIG,
        landShare: 0,
        recoveryYears: 100,
        noi: BIG,
        noiGrowth: 1,
        holdYears: 30,
        exitCap: TOP_RATE,
        saleCostPct: TOP_RATE,
        loan: BIG,
        rate: 0.3,
        amortYears: 40,
        ioYears: 40,
        ordinaryRate: TOP_RATE,
        capitalGainRate: TOP_RATE,
        unrecapturedRate: TOP_RATE,
        niiRate: TOP_RATE,
      },
    ],
  ];

  it("the named cases are what they say", () => {
    const at = (name: string) => afterTaxBefore.runAfterTax(named.find(([n]) => n === name)![1]).sale;
    expect(at("a loss on sale").gain).toBeLessThan(0);
    const small = at("a gain smaller than the depreciation taken");
    expect(small.gain).toBeGreaterThan(0);
    expect(small.gain).toBeLessThan(small.depreciationTaken);
    const used = at("operating losses carried into the sale and used against both parts");
    expect(used.lossUsedOnRest).toBeGreaterThan(0);
    expect(used.lossUsedOnUnrecaptured).toBeGreaterThan(0);
    expect(at("operating losses larger than the gain, left unused").lossUnused).toBeGreaterThan(0);
    for (const [, c] of named) expect(afterTax.afterTaxInput.safeParse(c).success).toBe(true);
  });

  it.each(named)("%s", (_, c) => {
    expect(afterTax.runAfterTax(c)).toStrictEqual(afterTaxBefore.runAfterTax(c));
  });

  it("a seeded sweep of 100 valid inputs", () => {
    const r = lcg(1031);
    let n = 0;
    while (n < 100) {
      const price = between(r, 100_000, 50_000_000);
      const c: afterTax.AfterTaxInput = {
        price,
        closingCosts: between(r, 0, price * 0.05),
        landShare: between(r, 0, 0.6),
        recoveryYears: r() < 0.5 ? 39 : 27.5,
        noi: price * between(r, 0.01, 0.12),
        noiGrowth: between(r, -0.1, 0.1),
        holdYears: whole(r, 1, 30),
        exitCap: between(r, 0.03, 0.15),
        saleCostPct: between(r, 0, 0.08),
        loan: r() < 0.2 ? 0 : price * between(r, 0, 0.95),
        rate: between(r, 0, 0.12),
        amortYears: whole(r, 0, 30),
        ioYears: whole(r, 0, 10),
        ordinaryRate: r() < 0.1 ? 0 : between(r, 0, 0.5),
        capitalGainRate: r() < 0.1 ? 0 : between(r, 0, 0.3),
        unrecapturedRate: r() < 0.1 ? 0 : between(r, 0, 0.3),
        niiRate: r() < 0.3 ? 0 : 0.038,
      };
      if (!afterTax.afterTaxInput.safeParse(c).success) continue;
      expect(afterTax.runAfterTax(c)).toStrictEqual(afterTaxBefore.runAfterTax(c));
      n += 1;
    }
  }, 120_000);

  it("exports, input schema, example and module are unchanged", () => {
    sameExports(afterTax, afterTaxBefore);
    expect(inputSchema(afterTax.afterTaxInput)).toBe(inputSchema(afterTaxBefore.afterTaxInput));
    expect(afterTax.AFTER_TAX_EXAMPLE).toStrictEqual(afterTaxBefore.AFTER_TAX_EXAMPLE);
    expect(afterTax.afterTaxModule.id).toBe(afterTaxBefore.afterTaxModule.id);
    expect(afterTax.afterTaxModule.run(EX)).toStrictEqual(afterTaxBefore.afterTaxModule.run(EX));
  });
});

describe("exchange-1031: old and new agree exactly", () => {
  const EX = exchange.EXCHANGE_1031_EXAMPLE;
  const named: [string, exchange.Exchange1031Input][] = [
    ["the worked example", EX],
    ["a realized loss", { ...EX, adjustedBasis: 5_000_000 }],
    ["a gain smaller than the depreciation taken", { ...EX, adjustedBasis: 3_500_000 }],
    ["zero depreciation", { ...EX, depreciationTaken: 0 }],
    ["every rate zero", { ...EX, capitalGainRate: 0, unrecapturedRate: 0, niiRate: 0 }],
    ["boot larger than the gain", { ...EX, cashTaken: 3_000_000, otherProperty: 500_000 }],
    ["fully deferred", { ...EX, cashTaken: 0, newDebt: 2_000_000, cashAdded: 300_000 }],
    [
      "the largest inputs the schema allows",
      {
        salePrice: BIG,
        sellingCosts: BIG / 2,
        adjustedBasis: BIG,
        debtPaidOff: BIG,
        replacementPrice: BIG,
        newDebt: BIG,
        cashAdded: BIG,
        exchangeCosts: BIG / 2,
        cashTaken: BIG,
        otherProperty: BIG,
        depreciationTaken: BIG,
        capitalGainRate: TOP_RATE,
        unrecapturedRate: TOP_RATE,
        niiRate: TOP_RATE,
      },
    ],
    ["the largest gain the schema allows", { ...EX, salePrice: BIG, adjustedBasis: 0, depreciationTaken: BIG / 3, cashTaken: BIG, capitalGainRate: TOP_RATE, unrecapturedRate: TOP_RATE, niiRate: TOP_RATE }],
  ];

  it("the named cases are what they say", () => {
    const at = (name: string) => exchangeBefore.runExchange1031(named.find(([n]) => n === name)![1]);
    expect(at("a realized loss").isLoss).toBe(true);
    const small = at("a gain smaller than the depreciation taken");
    expect(small.realizedGain).toBeGreaterThan(0);
    expect(small.realizedGain).toBeLessThan(EX.depreciationTaken);
    expect(at("boot larger than the gain").boot).toBeGreaterThan(at("boot larger than the gain").realizedGain);
    for (const [, c] of named) expect(exchange.exchange1031Input.safeParse(c).success).toBe(true);
  });

  it.each(named)("%s", (_, c) => {
    expect(exchange.runExchange1031(c)).toStrictEqual(exchangeBefore.runExchange1031(c));
  });

  it("a seeded sweep of 200 valid inputs", () => {
    const r = lcg(8824);
    let n = 0;
    while (n < 200) {
      const salePrice = between(r, 100_000, 50_000_000);
      const c: exchange.Exchange1031Input = {
        salePrice,
        sellingCosts: between(r, 0, salePrice * 0.08),
        adjustedBasis: between(r, 0, salePrice * 1.5),
        debtPaidOff: r() < 0.2 ? 0 : between(r, 0, salePrice),
        replacementPrice: between(r, salePrice * 0.5, salePrice * 2),
        newDebt: r() < 0.2 ? 0 : between(r, 0, salePrice * 1.5),
        cashAdded: r() < 0.5 ? 0 : between(r, 0, salePrice * 0.3),
        exchangeCosts: between(r, 0, salePrice * 0.02),
        cashTaken: r() < 0.4 ? 0 : between(r, 0, salePrice * 0.5),
        otherProperty: r() < 0.7 ? 0 : between(r, 0, salePrice * 0.2),
        depreciationTaken: r() < 0.15 ? 0 : between(r, 0, salePrice),
        capitalGainRate: r() < 0.1 ? 0 : between(r, 0, 0.3),
        unrecapturedRate: r() < 0.1 ? 0 : between(r, 0, 0.3),
        niiRate: r() < 0.3 ? 0 : 0.038,
      };
      if (!exchange.exchange1031Input.safeParse(c).success) continue;
      expect(exchange.runExchange1031(c)).toStrictEqual(exchangeBefore.runExchange1031(c));
      n += 1;
    }
  }, 120_000);

  it("exports, input schema, example and module are unchanged", () => {
    sameExports(exchange, exchangeBefore);
    expect(inputSchema(exchange.exchange1031Input)).toBe(inputSchema(exchangeBefore.exchange1031Input));
    expect(exchange.EXCHANGE_1031_EXAMPLE).toStrictEqual(exchangeBefore.EXCHANGE_1031_EXAMPLE);
    expect(exchange.exchange1031Module.id).toBe(exchangeBefore.exchange1031Module.id);
    expect(exchange.exchange1031Module.run(EX)).toStrictEqual(exchangeBefore.exchange1031Module.run(EX));
  });
});

describe("sale-proceeds: old and new agree exactly", () => {
  const EX = saleProceeds.SALE_PROCEEDS_EXAMPLE;
  const named: [string, saleProceeds.SaleProceedsInput][] = [
    ["the worked example", EX],
    ["a loss", { ...EX, originalCost: 8_000_000 }],
    ["a gain smaller than the depreciation taken", { ...EX, originalCost: 5_400_000 }],
    ["zero depreciation", { ...EX, depreciationTaken: 0 }],
    ["every rate zero", { ...EX, capitalGainRate: 0, unrecapturedRate: 0, niiRate: 0 }],
    ["no rates entered", { ...EX, capitalGainRate: null, unrecapturedRate: null, niiRate: null }],
    ["a sale that does not clear the debts", { ...EX, loanPayoff: 6_500_000 }],
    [
      "the largest inputs the schema allows",
      {
        salePrice: BIG,
        sellingCostRate: TOP_RATE,
        sellingCostFixed: 0,
        loanPayoff: BIG,
        otherPayoffs: BIG,
        originalCost: BIG,
        improvements: BIG,
        depreciationTaken: 2 * BIG,
        capitalGainRate: TOP_RATE,
        unrecapturedRate: TOP_RATE,
        niiRate: TOP_RATE,
      },
    ],
    ["the largest gain the schema allows", { ...EX, salePrice: BIG, sellingCostRate: 0, sellingCostFixed: 0, originalCost: BIG / 4, improvements: 0, depreciationTaken: BIG / 4, capitalGainRate: TOP_RATE, unrecapturedRate: TOP_RATE, niiRate: TOP_RATE }],
  ];

  it("the named cases are what they say", () => {
    const at = (name: string) => saleProceedsBefore.runSaleProceeds(named.find(([n]) => n === name)![1]);
    expect(at("a loss").isLoss).toBe(true);
    const small = at("a gain smaller than the depreciation taken");
    expect(small.gain).toBeGreaterThan(0);
    expect(small.gain).toBeLessThan(EX.depreciationTaken);
    expect(at("a sale that does not clear the debts").clears).toBe(false);
    for (const [, c] of named) expect(saleProceeds.saleProceedsInput.safeParse(c).success).toBe(true);
  });

  it.each(named)("%s", (_, c) => {
    expect(saleProceeds.runSaleProceeds(c)).toStrictEqual(saleProceedsBefore.runSaleProceeds(c));
  });

  it("a seeded sweep of 200 valid inputs", () => {
    const r = lcg(1250);
    let n = 0;
    while (n < 200) {
      const salePrice = between(r, 100_000, 50_000_000);
      const originalCost = between(r, 50_000, salePrice * 1.3);
      const improvements = r() < 0.4 ? 0 : between(r, 0, originalCost * 0.3);
      const blank = r() < 0.15;
      const c: saleProceeds.SaleProceedsInput = {
        salePrice,
        sellingCostRate: between(r, 0, 0.08),
        sellingCostFixed: r() < 0.3 ? 0 : between(r, 0, 200_000),
        loanPayoff: r() < 0.2 ? 0 : between(r, 0, salePrice * 1.1),
        otherPayoffs: r() < 0.5 ? 0 : between(r, 0, 300_000),
        originalCost,
        improvements,
        depreciationTaken: r() < 0.15 ? 0 : between(r, 0, originalCost + improvements),
        capitalGainRate: blank ? null : r() < 0.1 ? 0 : between(r, 0, 0.3),
        unrecapturedRate: blank ? null : r() < 0.1 ? 0 : between(r, 0, 0.3),
        niiRate: blank ? null : r() < 0.3 ? 0 : 0.038,
      };
      if (!saleProceeds.saleProceedsInput.safeParse(c).success) continue;
      expect(saleProceeds.runSaleProceeds(c)).toStrictEqual(saleProceedsBefore.runSaleProceeds(c));
      n += 1;
    }
  }, 120_000);

  it("exports, input schema, example, notes and module are unchanged", () => {
    sameExports(saleProceeds, saleProceedsBefore);
    expect(inputSchema(saleProceeds.saleProceedsInput)).toBe(inputSchema(saleProceedsBefore.saleProceedsInput));
    expect(saleProceeds.SALE_PROCEEDS_EXAMPLE).toStrictEqual(saleProceedsBefore.SALE_PROCEEDS_EXAMPLE);
    expect(saleProceeds.HALF_CENT).toBe(saleProceedsBefore.HALF_CENT);
    expect(saleProceeds.LADDER_STEPS).toStrictEqual(saleProceedsBefore.LADDER_STEPS);
    expect(Object.keys(saleProceeds.saleProceedsNotes)).toEqual(Object.keys(saleProceedsBefore.saleProceedsNotes));
    expect(saleProceeds.saleProceedsModule.id).toBe(saleProceedsBefore.saleProceedsModule.id);
    expect(saleProceeds.saleProceedsModule.run(EX)).toStrictEqual(saleProceedsBefore.saleProceedsModule.run(EX));
  });
});

describe("the three agree by construction", () => {
  it("on one gain, the three report the same split and tax (no carried loss in after-tax)", () => {
    // An all-cash after-tax hold with no operating loss, and the same sale through the other two.
    const a = afterTax.runAfterTax({ ...afterTax.AFTER_TAX_EXAMPLE, loan: 0 });
    expect(a.sale.lossCarriedIn).toBe(0);
    const gain = a.sale.gain;
    const taken = a.sale.depreciationTaken;
    const x = exchange.runExchange1031({
      ...exchange.EXCHANGE_1031_EXAMPLE,
      salePrice: a.sale.price,
      sellingCosts: a.sale.costs,
      exchangeCosts: 0,
      adjustedBasis: a.sale.adjustedBasis,
      depreciationTaken: taken,
    });
    const s = saleProceeds.runSaleProceeds({
      ...saleProceeds.SALE_PROCEEDS_EXAMPLE,
      salePrice: a.sale.price,
      sellingCostRate: 0,
      sellingCostFixed: a.sale.costs,
      originalCost: a.costBasis,
      improvements: 0,
      depreciationTaken: taken,
    });
    const h = taxGain(gain, taken, RATES);
    expect(a.sale.tax).toBe(h.tax);
    expect(Math.abs(x.straightSaleTax - h.tax)).toBeLessThan(0.005);
    expect(Math.abs((s.tax as number) - h.tax)).toBeLessThan(0.005);
    expect(Math.abs(s.depreciationPart - a.sale.unrecaptured)).toBeLessThan(0.005);
  });
});
