import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { EXCHANGE_1031_EXAMPLE, exchange1031Input, runExchange1031, type Exchange1031Input, type Exchange1031Result } from "@/lib/calculators/exchange-1031";

// The expected values were computed independently in Python on 2026-11-13 with the
// decimal module, by two routes that share no code with the module: the IRS Form 8824
// layout (2026 instructions, lines 15 to 25: boot reduced by exchange expenses, gain
// realized as line 17 less line 18, basis as line 18 plus line 20 less line 15) and the
// sale-price layout (amount realized less basis; the replacement's price less the
// deferred gain). Tax was a bracket walk. Money is compared to the cent.

const cents = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(0.005);
const ex = (over: Partial<Exchange1031Input>): Exchange1031Input => ({ ...EXCHANGE_1031_EXAMPLE, ...over });
const NO_RATES = { capitalGainRate: 0, unrecapturedRate: 0, niiRate: 0, depreciationTaken: 0 };

type Want = { ar: number; rg: number; relief: number; boot: number; rec: number; deferred: number; basis: number; fromPrice: number; gap: number; taxNow: number; whole: number };
function pin(r: Exchange1031Result, w: Want) {
  cents(r.amountRealized, w.ar);
  cents(r.realizedGain, w.rg);
  cents(r.netLiabilityRelief, w.relief);
  cents(r.boot, w.boot);
  cents(r.recognizedGain, w.rec);
  cents(r.deferredGain, w.deferred);
  cents(r.replacementBasis, w.basis);
  cents(r.replacementBasisFromCost, w.fromPrice);
  cents(r.sourcesUsesGap, w.gap);
  cents(r.taxNow, w.taxNow);
  cents(r.straightSaleTax, w.whole);
  cents(r.taxDeferred, w.whole - w.taxNow);
}

describe("exchange-1031 worked example ($4,000,000 sale, $100,000 cash taken out)", () => {
  const r = runExchange1031(EXCHANGE_1031_EXAMPLE);

  it("matches the independent calculation", () => {
    pin(r, { ar: 3_850_000, rg: 2_350_000, relief: 0, boot: 100_000, rec: 100_000, deferred: 2_250_000, basis: 2_050_000, fromPrice: 2_050_000, gap: 0, taxNow: 28_800, whole: 599_300 });
    cents(r.recognizedUnrecaptured, 100_000);
    cents(r.recognizedCapitalGain, 0);
    cents(r.taxDeferred, 570_500);
    expect(r.balanced).toBe(true);
    expect(r.isLoss).toBe(false);
  });

  it("shows the netting: new debt covers the debt paid off, so the cash taken is the only boot", () => {
    cents(r.liabilitiesRelieved, 1_600_000);
    cents(r.offsetByNewDebt, 1_600_000);
    cents(r.offsetByCashAdded, 0);
    expect(r.checks).toEqual({ equalOrGreaterValue: true, allEquityReinvested: false, debtReplaced: true, fullyDeferred: false });
  });

  it("traces every figure in the order it was computed", () => {
    const labels = r.trace.map((l) => l.label);
    expect(labels.slice(0, 9)).toEqual([
      "Amount realized",
      "Realized gain",
      "Liabilities relieved",
      "Offset by new debt",
      "Offset by cash added",
      "Net liability relief",
      "Boot received",
      "Recognized gain",
      "Deferred gain",
    ]);
    expect(labels).toContain("Basis of the replacement");
    expect(labels).toContain("Tax deferred");
    expect(r.trace.find((l) => l.label === "Basis of the replacement")?.value).toBe("$2,050,000.00");
    expect(r.trace.find((l) => l.label === "Tax now")?.value).toBe("$28,800.00");
  });
});

describe("the regulation's own illustrations (26 CFR 1.1031(d)-2 and 1.1031(b)-1)", () => {
  const swap = (o: Partial<Exchange1031Input>) => runExchange1031({ ...EXCHANGE_1031_EXAMPLE, ...NO_RATES, sellingCosts: 0, exchangeCosts: 0, cashAdded: 0, newDebt: 0, otherProperty: 0, ...o });

  it("1.1031(d)-2 example 1: liabilities relieved are money received", () => {
    const r = swap({ salePrice: 800_000, adjustedBasis: 500_000, debtPaidOff: 150_000, replacementPrice: 600_000, cashTaken: 50_000 });
    cents(r.realizedGain, 300_000);
    cents(r.boot, 200_000);
    cents(r.recognizedGain, 200_000);
    cents(r.replacementBasis, 500_000);
    expect(r.balanced).toBe(true);
  });

  it("1.1031(d)-2 example 2, party D: liabilities taken on offset liabilities relieved, not the cash received", () => {
    const r = swap({ salePrice: 220_000, adjustedBasis: 100_000, debtPaidOff: 80_000, replacementPrice: 250_000, newDebt: 150_000, cashTaken: 40_000 });
    cents(r.realizedGain, 120_000);
    cents(r.netLiabilityRelief, 0);
    cents(r.boot, 40_000);
    cents(r.recognizedGain, 40_000);
    cents(r.replacementBasis, 170_000);
  });

  it("1.1031(d)-2 example 2, party E: cash paid offsets liabilities relieved", () => {
    const r = swap({ salePrice: 250_000, adjustedBasis: 175_000, debtPaidOff: 150_000, replacementPrice: 220_000, newDebt: 80_000, cashAdded: 40_000, cashTaken: 0 });
    cents(r.realizedGain, 75_000);
    cents(r.offsetByCashAdded, 40_000);
    cents(r.boot, 30_000);
    cents(r.recognizedGain, 30_000);
    cents(r.replacementBasis, 175_000);
  });

  it("1.1031(b)-1 example 1: gain recognized only to the extent of the cash", () => {
    const r = swap({ salePrice: 8_000, adjustedBasis: 5_000, debtPaidOff: 0, replacementPrice: 6_000, cashTaken: 2_000 });
    cents(r.realizedGain, 3_000);
    cents(r.recognizedGain, 2_000);
    cents(r.deferredGain, 1_000);
    cents(r.replacementBasis, 5_000);
  });
});

describe("edge cases, against the same independent calculation", () => {
  it("trading down in debt with cash added to cover it: no boot", () => {
    const r = runExchange1031(ex({ replacementPrice: 3_900_000, newDebt: 1_200_000, cashAdded: 450_000, cashTaken: 0 }));
    pin(r, { ar: 3_850_000, rg: 2_350_000, relief: 0, boot: 0, rec: 0, deferred: 2_350_000, basis: 1_550_000, fromPrice: 1_550_000, gap: 0, taxNow: 0, whole: 599_300 });
    cents(r.offsetByCashAdded, 400_000);
    expect(r.checks.fullyDeferred).toBe(true);
    expect(r.checks.debtReplaced).toBe(true);
  });

  it("trading down in debt with no cash added: the net relief is boot", () => {
    const r = runExchange1031(ex({ replacementPrice: 3_400_000, newDebt: 1_200_000, cashAdded: 0, cashTaken: 50_000 }));
    pin(r, { ar: 3_850_000, rg: 2_350_000, relief: 400_000, boot: 450_000, rec: 450_000, deferred: 1_900_000, basis: 1_500_000, fromPrice: 1_500_000, gap: 0, taxNow: 129_600, whole: 599_300 });
    expect(r.checks.debtReplaced).toBe(false);
    expect(r.checks.equalOrGreaterValue).toBe(false);
  });

  it("trading down with cash added that covers part of the relief", () => {
    const r = runExchange1031(ex({ replacementPrice: 3_500_000, newDebt: 1_200_000, cashAdded: 100_000, cashTaken: 50_000 }));
    pin(r, { ar: 3_850_000, rg: 2_350_000, relief: 300_000, boot: 350_000, rec: 350_000, deferred: 2_000_000, basis: 1_500_000, fromPrice: 1_500_000, gap: 0, taxNow: 100_800, whole: 599_300 });
  });

  it("full boot: boot beyond the gain recognizes the whole gain and the basis is the price", () => {
    const r = runExchange1031(ex({ replacementPrice: 1_000_000, newDebt: 0, cashAdded: 0, cashTaken: 1_250_000 }));
    pin(r, { ar: 3_850_000, rg: 2_350_000, relief: 1_600_000, boot: 2_850_000, rec: 2_350_000, deferred: 0, basis: 1_000_000, fromPrice: 1_000_000, gap: 0, taxNow: 599_300, whole: 599_300 });
  });

  it("a loss: nothing recognized, the loss carried into a basis above the price, no tax either way", () => {
    const r = runExchange1031({
      salePrice: 2_500_000,
      sellingCosts: 50_000,
      adjustedBasis: 2_800_000,
      debtPaidOff: 1_000_000,
      replacementPrice: 2_700_000,
      newDebt: 1_300_000,
      cashAdded: 0,
      exchangeCosts: 50_000,
      cashTaken: 0,
      otherProperty: 0,
      depreciationTaken: 400_000,
      capitalGainRate: 0.2,
      unrecapturedRate: 0.25,
      niiRate: 0.038,
    });
    pin(r, { ar: 2_400_000, rg: -400_000, relief: 0, boot: 0, rec: 0, deferred: -400_000, basis: 3_100_000, fromPrice: 3_100_000, gap: 0, taxNow: 0, whole: 0 });
    expect(r.isLoss).toBe(true);
    expect(r.trace[1]?.label).toBe("Realized loss");
    // boot does not make a loss recognized
    const withCash = runExchange1031({ ...EXCHANGE_1031_EXAMPLE, salePrice: 2_500_000, sellingCosts: 50_000, adjustedBasis: 2_800_000, debtPaidOff: 1_000_000, exchangeCosts: 50_000, cashTaken: 100_000 });
    expect(withCash.recognizedGain).toBe(0);
  });

  it("other property received is boot and takes its value as basis", () => {
    const r = runExchange1031(ex({ cashTaken: 0, otherProperty: 100_000 }));
    pin(r, { ar: 3_850_000, rg: 2_350_000, relief: 0, boot: 100_000, rec: 100_000, deferred: 2_250_000, basis: 2_050_000, fromPrice: 2_050_000, gap: 0, taxNow: 28_800, whole: 599_300 });
    cents(r.otherPropertyBasis, 100_000);
    expect(r.trace.some((l) => l.label === "Basis of the other property")).toBe(true);
  });

  it("inputs that do not balance: the gap is reported and the two bases differ by it", () => {
    const r = runExchange1031(ex({ replacementPrice: 4_350_000 }));
    pin(r, { ar: 3_850_000, rg: 2_350_000, relief: 0, boot: 100_000, rec: 100_000, deferred: 2_250_000, basis: 2_050_000, fromPrice: 2_100_000, gap: -50_000, taxNow: 28_800, whole: 599_300 });
    expect(r.balanced).toBe(false);
  });

  it("zero rates: no tax now, on the whole gain or deferred", () => {
    const r = runExchange1031(ex({ capitalGainRate: 0, unrecapturedRate: 0, niiRate: 0 }));
    expect(r.taxNow).toBe(0);
    expect(r.straightSaleTax).toBe(0);
    expect(r.taxDeferred).toBe(0);
    cents(r.recognizedGain, 100_000);
  });

  it("no depreciation taken: all of the gain at the capital gain rate", () => {
    const r = runExchange1031(ex({ depreciationTaken: 0 }));
    cents(r.taxNow, 100_000 * 0.238);
    cents(r.straightSaleTax, 2_350_000 * 0.238);
  });
});

describe("invariants", () => {
  // balanced closings: cash taken is whatever the closing leaves
  const cases: Exchange1031Input[] = [
    [5_000_000, 150_000, 900_000, 2_000_000, 5_500_000, 3_000_000, 0, 50_000, 1_000_000],
    [5_000_000, 150_000, 900_000, 2_000_000, 3_000_000, 500_000, 200_000, 50_000, 0],
    [1_000_000, 60_000, 1_200_000, 700_000, 900_000, 600_000, 0, 10_000, 0],
    [2_000_000, 0, 0, 0, 1_500_000, 0, 0, 0, 0],
    [3_000_000, 90_000, 1_000_000, 2_500_000, 2_000_000, 0, 1_000_000, 30_000, 0],
  ].map(([sp, sc, ab, dp, rp, nd, ca, ec, dep]) => {
    const ar = (sp as number) - (sc as number) - (ec as number);
    const cashTaken = Math.max(0, ar - (dp as number) + (nd as number) + (ca as number) - (rp as number));
    const cashAdded = (ca as number) + Math.max(0, (rp as number) - (ar - (dp as number) + (nd as number) + (ca as number)));
    return ex({ salePrice: sp, sellingCosts: sc, adjustedBasis: ab, debtPaidOff: dp, replacementPrice: rp, newDebt: nd, cashAdded, exchangeCosts: ec, cashTaken, otherProperty: 0, depreciationTaken: dep });
  });

  it.each(cases.map((c, i) => [i + 1, c] as const))("case %i: money in equals money out, and the gain splits into recognized and deferred", (_, c) => {
    const r = runExchange1031(c);
    expect(r.balanced).toBe(true);
    // sources (proceeds after costs and payoff, new debt, cash added) equal uses (replacement, cash out)
    cents(c.salePrice - c.sellingCosts - c.exchangeCosts - c.debtPaidOff + c.newDebt + c.cashAdded, c.replacementPrice + c.cashTaken + c.otherProperty);
    cents(r.recognizedGain + r.deferredGain, r.realizedGain);
    if (r.realizedGain > 0) cents(r.recognizedGain / r.realizedGain + r.deferredGain / r.realizedGain, 1);
    expect(r.recognizedGain).toBeGreaterThanOrEqual(0);
    expect(r.recognizedGain).toBeLessThanOrEqual(Math.max(r.realizedGain, 0) + 1e-9);
    expect(r.recognizedGain).toBeLessThanOrEqual(r.boot + 1e-9);
    cents(r.replacementBasis, r.replacementBasisFromCost);
    cents(r.taxNow + r.taxDeferred, r.straightSaleTax);
    expect(r.taxDeferred).toBeGreaterThanOrEqual(-1e-9);
    cents(r.offsetByNewDebt + r.offsetByCashAdded + r.netLiabilityRelief, r.liabilitiesRelieved);
  });

  it("with no boot, the basis is the closed form: basis given up + new debt + cash added − debt paid off", () => {
    for (const c of cases) {
      const r = runExchange1031(c);
      if (r.boot !== 0) continue;
      cents(r.replacementBasis, c.adjustedBasis + c.newDebt + c.cashAdded - c.debtPaidOff);
    }
    const flat = runExchange1031(ex({ cashTaken: 0, replacementPrice: 4_400_000 }));
    expect(flat.boot).toBe(0);
    cents(flat.replacementBasis, 1_500_000 + 2_150_000 - 1_600_000);
  });

  it("the gap always equals the difference between the two bases", () => {
    for (const rp of [3_000_000, 4_300_000, 5_000_000]) {
      const r = runExchange1031(ex({ replacementPrice: rp }));
      cents(r.replacementBasis - r.replacementBasisFromCost, r.sourcesUsesGap);
    }
  });

  it("tax now does not fall as more cash is taken out", () => {
    let last = -1;
    for (const cash of [0, 50_000, 500_000, 1_000_000, 2_000_000, 3_000_000]) {
      const r = runExchange1031(ex({ cashTaken: cash, replacementPrice: 4_400_000 - cash }));
      expect(r.taxNow).toBeGreaterThanOrEqual(last);
      last = r.taxNow;
    }
  });
});

describe("input", () => {
  it("accepts the worked example and refuses fields it does not know", () => {
    expect(exchange1031Input.safeParse(EXCHANGE_1031_EXAMPLE).success).toBe(true);
    expect(exchange1031Input.safeParse({ ...EXCHANGE_1031_EXAMPLE, ordinaryRate: 0.37 }).success).toBe(false);
  });

  it("refuses costs above the price, in plain words, on the selling costs", () => {
    const p = exchange1031Input.safeParse(ex({ sellingCosts: 3_990_000, exchangeCosts: 30_000 }));
    expect(p.success).toBe(false);
    const issue = p.error?.issues[0];
    expect(issue?.path).toEqual(["sellingCosts"]);
    expect(plainIssue(issue as NonNullable<typeof issue>, "money")).toBe("Selling and exchange costs together cannot be more than the sale price.");
  });

  it("refuses a rate of 100% or more, a negative amount and a zero price, in plain words", () => {
    const rate = exchange1031Input.safeParse(ex({ capitalGainRate: 1 })).error?.issues[0];
    expect(rate?.path).toEqual(["capitalGainRate"]);
    expect(plainIssue(rate as NonNullable<typeof rate>, "pct")).toBe("Less than 100%.");
    const neg = exchange1031Input.safeParse(ex({ cashTaken: -1 })).error?.issues[0];
    expect(plainIssue(neg as NonNullable<typeof neg>, "money")).toBe("Cannot be negative.");
    const zero = exchange1031Input.safeParse(ex({ replacementPrice: 0 })).error?.issues[0];
    expect(plainIssue(zero as NonNullable<typeof zero>, "money")).toBe("Must be more than zero.");
    expect(() => runExchange1031(ex({ salePrice: Number.NaN }))).toThrow();
  });
});

// Second review (math-review-b, 2026-11-13): the reviewer's own inputs, pinned to a separate
// Python model written before the TypeScript was read (scratch ex.py), read as Form 8824 reads
// exchange expenses (they reduce the gain realized; the basis comes out the same either way).
describe("second review", () => {
  it("the reviewer's own exchange: more new debt than debt paid off, cash taken out", () => {
    const r = runExchange1031(ex({ replacementPrice: 4_000_000, newDebt: 2_000_000, exchangeCosts: 40_000, cashTaken: 240_000, depreciationTaken: 900_000 }));
    pin(r, { ar: 3_840_000, rg: 2_340_000, relief: 0, boot: 240_000, rec: 240_000, deferred: 2_100_000, basis: 1_900_000, fromPrice: 1_900_000, gap: 0, taxNow: 69_120, whole: 601_920 });
    cents(r.takenOut, 240_000);
  });

  it("a balanced closing in cents shows a gap of exactly zero, never -$0.00", () => {
    const sale = 3_589_638.47;
    const c = { salePrice: sale, sellingCosts: 73_585.85, exchangeCosts: 25_075.56, debtPaidOff: 668_256.5, newDebt: 32_578.11, cashAdded: 0, cashTaken: 16_950.48, otherProperty: 0 };
    const r = runExchange1031(ex({ ...c, replacementPrice: sale - c.sellingCosts - c.exchangeCosts - c.debtPaidOff + c.newDebt - c.cashTaken }));
    expect(r.balanced).toBe(true);
    expect(r.sourcesUsesGap).toBe(0);
    expect(r.trace.find((l) => l.label === "Sources and uses gap")?.value).toBe("$0.00");
  });
});
