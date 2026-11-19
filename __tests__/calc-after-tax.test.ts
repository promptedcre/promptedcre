import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { AFTER_TAX_EXAMPLE, afterTaxInput, runAfterTax, signChanges, type AfterTaxInput } from "@/lib/calculators/after-tax";

// The expected values below were computed independently in Python on 2026-11-13
// with the decimal module at 50 digits (scratch script check.py): each loan
// balance from the closed form (the present value of the payments still owed), a
// year's interest as its payments less the drop in balance, and both IRRs by
// bisection on the present-value equation. The calculator walks the loan month by
// month instead. Money is compared to the cent, rates to 1e-6.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};
const rate = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(1e-6);
};
const ex = (over: Partial<AfterTaxInput>): AfterTaxInput => ({ ...AFTER_TAX_EXAMPLE, ...over });

// Interest only for the whole hold, with a tax loss every year that reaches the sale.
const LOSS: AfterTaxInput = ex({
  price: 2_000_000,
  closingCosts: 0,
  landShare: 0.1,
  recoveryYears: 27.5,
  noi: 120_000,
  noiGrowth: 0.02,
  holdYears: 5,
  exitCap: 0.06,
  saleCostPct: 0.02,
  loan: 1_600_000,
  rate: 0.07,
  amortYears: 0,
  ioYears: 0,
});

describe("after-tax worked example ($5,000,000 price, 7-year hold, $3,250,000 loan)", () => {
  const r = runAfterTax(AFTER_TAX_EXAMPLE);

  it("figures the basis, depreciation, equity and the rate on yearly income", () => {
    cents(r.costBasis, 5_100_000);
    cents(r.land, 1_275_000);
    cents(r.depreciableBasis, 3_825_000);
    cents(r.annualDepreciation, 98_076.9230769231);
    cents(r.equity, 1_850_000);
    rate(r.operatingRate, 0.408);
  });

  it("each year: interest, taxable income, tax, cash flow before and after tax", () => {
    const want = [
      { interest: 211250, principal: 0, ti: 40673.076923, tax: 16594.615385, bt: 138750, at: 122155.384615 },
      { interest: 209670.067449, principal: 53660.725477, ti: 52753.009474, tax: 21523.227865, bt: 97169.207074, at: 75645.979209 },
      { interest: 206076.309284, principal: 57254.483642, ti: 67161.767639, tax: 27402.001197, bt: 107984.207074, at: 80582.205878 },
      { interest: 202241.870479, principal: 61088.922447, ti: 82135.656444, tax: 33511.347829, bt: 119123.657074, at: 85612.309245 },
      { interest: 198150.632206, principal: 65180.16072, ti: 97700.528217, tax: 39861.815513, bt: 130597.290574, at: 90735.475062 },
      { interest: 193785.396129, principal: 69545.396797, ti: 113883.606799, tax: 46464.511574, bt: 142415.133079, at: 95950.621505 },
      { interest: 189127.812107, principal: 74202.980819, ti: 130713.568601, tax: 53331.135989, bt: 154587.51086, at: 101256.37487 },
    ];
    expect(r.years).toHaveLength(7);
    want.forEach((w, k) => {
      const y = r.years[k];
      cents(y?.interest, w.interest);
      cents(y?.principal, w.principal);
      cents(y?.depreciation, 98_076.9230769231);
      cents(y?.taxableIncome, w.ti);
      cents(y?.tax, w.tax);
      cents(y?.beforeTax, w.bt);
      cents(y?.afterTax, w.at);
      expect(y?.lossCarried).toBe(0);
    });
  });

  it("the sale: price, payoff, basis, the gain split in two, tax on each part, net proceeds", () => {
    const s = r.sale;
    cents(s.price, 6_149_369.327124);
    cents(s.costs, 184_481.079814);
    cents(s.loanPayoff, 2_869_067.3301);
    cents(s.depreciationTaken, 686_538.461538);
    cents(s.adjustedBasis, 4_413_461.538462);
    cents(s.gain, 1_551_426.708849);
    cents(s.unrecaptured, 686_538.461538);
    cents(s.rest, 864_888.247311);
    cents(s.taxOnUnrecaptured, 197_723.076923);
    cents(s.taxOnRest, 205_843.40286);
    cents(s.tax, 403_566.479783);
    cents(s.netBeforeTax, 3_095_820.917211);
    cents(s.netAfterTax, 2_692_254.437428);
    cents(r.operatingTax, 238_688.655352);
  });

  it("the pre-tax and after-tax IRR and the difference", () => {
    rate(r.preTaxIrr, 0.131791401033);
    rate(r.afterTaxIrr, 0.098700532472);
    rate(r.irrDifference, 0.033090868561);
    expect(r.preTaxSignChanges).toBe(1);
    expect(r.afterTaxSignChanges).toBe(1);
    expect(r.trace.at(-2)?.value).toBe("3.31 points");
  });
});

describe("a tax loss every year, carried to the sale (interest only throughout)", () => {
  const r = runAfterTax(LOSS);

  it("pays no tax while the loss builds, and carries it forward", () => {
    const carried = [57454.545455, 112509.090909, 165115.636364, 215225.221818, 262787.908073];
    r.years.forEach((y, k) => {
      expect(y.tax).toBe(0);
      expect(y.principal).toBe(0);
      cents(y.interest, 112_000);
      cents(y.lossCarried, carried[k] ?? Number.NaN);
      expect(y.afterTax).toBe(y.beforeTax);
    });
  });

  it("uses the carried loss on the rest of the gain first, then on the unrecaptured part", () => {
    const s = r.sale;
    cents(s.loanPayoff, 1_600_000);
    cents(s.gain, 491_271.101545);
    cents(s.unrecaptured, 327_272.727273);
    cents(s.rest, 163_998.374272);
    cents(s.lossCarriedIn, 262_787.908073);
    cents(s.lossUsedOnRest, 163_998.374272);
    cents(s.lossUsedOnUnrecaptured, 98_789.533801);
    cents(s.lossUnused, 0);
    cents(s.taxOnRest, 0);
    cents(s.taxOnUnrecaptured, 65_803.15972);
    cents(s.netAfterTax, 498_195.214552);
    rate(r.preTaxIrr, 0.098450369317);
    rate(r.afterTaxIrr, 0.073736177289);
    rate(r.irrDifference, 0.024714192028);
  });

  it("leaves a loss larger than the gain unused, and says so", () => {
    const s = runAfterTax({ ...LOSS, exitCap: 0.075 });
    expect(s.sale.gain).toBeGreaterThan(0);
    expect(s.sale.tax).toBe(0);
    cents(s.sale.lossUnused, s.sale.lossCarriedIn - s.sale.gain);
    expect(s.trace.some((l) => l.label === "Carried loss left unused")).toBe(true);
  });
});

describe("invariants", () => {
  const cases: Array<[string, AfterTaxInput]> = [
    ["the worked example", AFTER_TAX_EXAMPLE],
    ["the loss case", LOSS],
    ["all cash", ex({ loan: 0 })],
    ["a long hold", ex({ holdYears: 30, amortYears: 30, ioYears: 0, noiGrowth: 0.01 })],
    ["a sale at a loss", ex({ exitCap: 0.12 })],
  ];

  it.each(cases)("%s: cash flow before tax less taxable income is depreciation less principal, every year", (_, input) => {
    for (const y of runAfterTax(input).years) cents(y.beforeTax - y.taxableIncome, y.depreciation - y.principal);
  });

  it.each(cases)("%s: basis, gain and its two parts add up", (_, input) => {
    const r = runAfterTax(input);
    const s = r.sale;
    cents(s.adjustedBasis + s.depreciationTaken, r.costBasis);
    cents(s.gain, s.price - s.costs - r.costBasis + s.depreciationTaken);
    cents(s.unrecaptured + s.rest, Math.max(s.gain, 0));
    cents(r.land + r.depreciableBasis, r.costBasis);
  });

  it.each(cases)("%s: the cash before tax is the cash after tax plus every dollar of tax", (_, input) => {
    const r = runAfterTax(input);
    cents(r.preTaxCash, r.afterTaxCash + r.totalTax);
    cents(r.totalTax, r.operatingTax + r.sale.tax);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    cents(sum(r.preTaxFlows) - r.totalTax, sum(r.afterTaxFlows));
    expect(r.preTaxFlows[0]).toBe(-r.equity);
    expect(r.afterTaxFlows[0]).toBe(-r.equity);
  });

  it("with every rate at zero, no tax is due and the two IRRs are the same", () => {
    for (const [, input] of cases) {
      const r = runAfterTax({ ...input, ordinaryRate: 0, capitalGainRate: 0, unrecapturedRate: 0, niiRate: 0 });
      expect(r.totalTax).toBe(0);
      expect(r.afterTaxIrr).toBe(r.preTaxIrr);
      expect(r.irrDifference).toBe(0);
    }
  });

  it("raising any one rate never lowers the total tax or raises the after-tax IRR", () => {
    for (const [, input] of cases) {
      const base = runAfterTax(input);
      for (const k of ["ordinaryRate", "capitalGainRate", "unrecapturedRate", "niiRate"] as const) {
        const up = runAfterTax({ ...input, [k]: input[k] + 0.05 });
        expect(up.totalTax).toBeGreaterThanOrEqual(base.totalTax - 1e-9);
        if (up.afterTaxIrr !== null && base.afterTaxIrr !== null) expect(up.afterTaxIrr).toBeLessThanOrEqual(base.afterTaxIrr + 1e-12);
      }
    }
  });

  it("a flat all-cash hold sold at its cost gives the closed form: NOI over price, and NOI less tax over price", () => {
    // $80,000 a year on $1,000,000, 20% land over 40 years: $20,000 of depreciation a year.
    const r = runAfterTax(
      ex({ price: 1_000_000, closingCosts: 0, landShare: 0.2, recoveryYears: 40, noi: 80_000, noiGrowth: 0, holdYears: 5, exitCap: 0.08, saleCostPct: 0, loan: 0, ordinaryRate: 0.3, capitalGainRate: 0, unrecapturedRate: 0, niiRate: 0 }),
    );
    cents(r.annualDepreciation, 20_000);
    for (const y of r.years) cents(y.afterTax, 80_000 - 0.3 * 60_000);
    cents(r.sale.gain, 100_000);
    cents(r.sale.unrecaptured, 100_000);
    rate(r.preTaxIrr, 0.08);
    rate(r.afterTaxIrr, 0.062);
  });
});

describe("edge cases", () => {
  it("all cash: no interest, no payoff, equity is the cost basis", () => {
    const r = runAfterTax(ex({ loan: 0 }));
    cents(r.equity, r.costBasis);
    for (const y of r.years) {
      expect(y.interest).toBe(0);
      expect(y.debtService).toBe(0);
      cents(y.beforeTax, y.noi);
    }
    expect(r.sale.loanPayoff).toBe(0);
    expect(r.trace.some((l) => l.label.startsWith("Amortizing payment"))).toBe(false);
  });

  it("interest only for the whole hold: the payoff is the loan and no principal is paid", () => {
    const r = runAfterTax(ex({ amortYears: 0, ioYears: 0 }));
    cents(r.sale.loanPayoff, 3_250_000);
    for (const y of r.years) {
      cents(y.principal, 0);
      cents(y.interest, 211_250);
    }
    const r2 = runAfterTax(ex({ ioYears: 7 }));
    cents(r2.sale.loanPayoff, 3_250_000);
  });

  it("a sale at a loss: no tax on sale, the loss is not credited, and the trace says so", () => {
    const r = runAfterTax(ex({ exitCap: 0.12 }));
    expect(r.sale.gain).toBeLessThan(0);
    expect(r.sale.unrecaptured).toBe(0);
    expect(r.sale.rest).toBe(0);
    expect(r.sale.tax).toBe(0);
    cents(r.sale.netAfterTax, r.sale.netBeforeTax);
    expect(r.trace.some((l) => l.label === "Loss on sale, not credited")).toBe(true);
  });

  it("no net investment income tax: the yearly rate is the ordinary rate alone", () => {
    const r = runAfterTax(ex({ niiRate: 0 }));
    rate(r.operatingRate, 0.37);
    cents(r.years[0]?.tax, 40_673.076923 * 0.37);
    cents(r.sale.taxOnUnrecaptured, 686_538.461538 * 0.25);
    cents(r.sale.taxOnRest, 864_888.247311 * 0.2);
  });

  it("no land: the whole cost basis is depreciated", () => {
    const r = runAfterTax(ex({ landShare: 0 }));
    cents(r.depreciableBasis, 5_100_000);
    cents(r.annualDepreciation, 5_100_000 / 39);
  });

  it("a hold longer than the recovery period stops depreciation once the basis is used up", () => {
    const r = runAfterTax(ex({ recoveryYears: 4.5, holdYears: 7 }));
    const d = 3_825_000 / 4.5;
    cents(r.years[3]?.depreciation, d);
    cents(r.years[4]?.depreciation, d / 2);
    cents(r.years[5]?.depreciation, 0);
    cents(r.years[6]?.depreciation, 0);
    cents(r.sale.depreciationTaken, 3_825_000);
    cents(r.sale.adjustedBasis, 1_275_000);
  });

  it("one year held: one cash flow and the sale at the end of it", () => {
    const r = runAfterTax(ex({ holdYears: 1 }));
    expect(r.years).toHaveLength(1);
    expect(r.preTaxFlows).toHaveLength(2);
    cents(r.sale.loanPayoff, 3_250_000);
    cents(r.preTaxFlows[1] ?? Number.NaN, 138_750 + r.sale.netBeforeTax);
  });

  it("a zero interest rate: no interest, level principal", () => {
    const r = runAfterTax(ex({ rate: 0, ioYears: 0 }));
    for (const y of r.years) {
      cents(y.interest, 0);
      cents(y.principal, 3_250_000 / 25);
    }
    cents(r.sale.loanPayoff, 3_250_000 - 7 * (3_250_000 / 25));
  });

  it("counts the sign changes in a list of flows, skipping zeros", () => {
    expect(signChanges([-100, 10, 0, 110])).toBe(1);
    expect(signChanges([-100, 50, -20, 90])).toBe(3);
    expect(signChanges([10, 20])).toBe(0);
  });
});

describe("bad input is refused in plain words", () => {
  const issue = (input: unknown) => {
    const p = afterTaxInput.safeParse(input);
    expect(p.success).toBe(false);
    return p.error?.issues[0];
  };

  it("a loan with no equity left", () => {
    const i = issue(ex({ loan: 5_100_000 }));
    expect(i?.path).toEqual(["loan"]);
    expect(plainIssue(i as NonNullable<typeof i>, "money")).toBe("The loan must leave some equity: keep it under the price plus closing costs.");
  });

  it("a hold that runs past the loan's payoff", () => {
    const i = issue(ex({ holdYears: 27, amortYears: 25, ioYears: 1 }));
    expect(i?.path).toEqual(["holdYears"]);
    expect(i?.message).toMatch(/paid off before the sale/);
    expect(afterTaxInput.safeParse(ex({ holdYears: 26, amortYears: 25, ioYears: 1 })).success).toBe(true);
    expect(afterTaxInput.safeParse(ex({ holdYears: 30, amortYears: 0 })).success).toBe(true);
  });

  it("a land share of 100%, a rate of 100% and a negative closing cost", () => {
    expect(plainIssue(issue(ex({ landShare: 1 })) as never, "pct")).toBe("Less than 100%.");
    expect(plainIssue(issue(ex({ ordinaryRate: 1 })) as never, "pct")).toBe("Less than 100%.");
    expect(plainIssue(issue(ex({ closingCosts: -1 })) as never, "money")).toBe("Cannot be negative.");
    expect(plainIssue(issue(ex({ holdYears: 2.5 })) as never, "int")).toBe("Whole numbers only.");
  });

  it("a field it does not know, and a missing rate", () => {
    expect(afterTaxInput.safeParse({ ...AFTER_TAX_EXAMPLE, taxRate: 0.3 }).success).toBe(false);
    const rest: Record<string, unknown> = { ...AFTER_TAX_EXAMPLE };
    delete rest.niiRate;
    expect(issue(rest)?.path).toEqual(["niiRate"]);
    expect(() => runAfterTax(rest as unknown as AfterTaxInput)).toThrow();
  });
});

// Second review (math-review-b, 2026-11-13): an input set of the reviewer's own, pinned to
// a separate Python model written from the scope and spec before the TypeScript was read
// (a month-by-month loan walk and IRR by bisection; scratch at.py).
describe("second review: the reviewer's own case and the payoff guard", () => {
  it("a 7-year hold with two interest-only years and a 30-year amortization matches the reviewer's model", () => {
    const r = runAfterTax(ex({ noi: 400_000, loan: 3_000_000, amortYears: 30, ioYears: 2, exitCap: 0.075 }));
    cents(r.years[2]?.interest, 194_012.724389);
    cents(r.years[2]?.tax, 53_966.303834);
    cents(r.sale.price, 6_559_327.282266);
    cents(r.sale.loanPayoff, 2_808_329.323247);
    cents(r.sale.gain, 1_949_085.925336);
    cents(r.sale.unrecaptured, 686_538.461538);
    cents(r.sale.rest, 1_262_547.463798);
    cents(r.sale.tax, 498_209.373307);
    cents(r.sale.netAfterTax, 3_056_008.767244);
    rate(r.preTaxIrr, 0.162841603913);
    rate(r.afterTaxIrr, 0.120535178599);
  });

  it("a hold that ends just as the loan is paid off: a payoff of zero, never below it, and no -$0.00 in the working", () => {
    const r = runAfterTax(ex({ loan: 500_000, rate: 0.06, amortYears: 5, ioYears: 1, holdYears: 6 }));
    expect(r.sale.loanPayoff).toBe(0);
    expect(r.trace.find((l) => l.label === "Loan payoff at sale")?.value).toBe("$0.00");
    expect(r.trace.some((l) => l.value.includes("-$0.00") || l.formula.includes("-$0.00"))).toBe(false);
    cents(r.sale.netBeforeTax, r.sale.price - r.sale.costs);
  });
});
