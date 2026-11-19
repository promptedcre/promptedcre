import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { LEVERAGE_EXAMPLE, leverageInput, runLeverage, type LeverageInput } from "@/lib/calculators/leverage";

// The worked example's expected values were computed independently in Python on
// 2026-11-13 with the decimal module at 50 digits: the payment from the annuity
// formula, each balance as the present value of the payments still owed, and the
// cost of the extra dollars by bisection on the present-value equation. Money is
// compared to the cent, rates and ratios to 1e-6.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};
const rate = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(1e-6);
};
const ex = (over: Partial<LeverageInput>): LeverageInput => ({ ...LEVERAGE_EXAMPLE, ...over });
const cmp = (over: Partial<NonNullable<LeverageInput["compare"]>>): LeverageInput => ex({ compare: { ...(LEVERAGE_EXAMPLE.compare as NonNullable<LeverageInput["compare"]>), ...over } });

describe("leverage worked example ($6,000,000 price, 5.5% loan on a 30-year amortization)", () => {
  const r = runLeverage(LEVERAGE_EXAMPLE);

  it("figures NOI, the cap rate, the loan constant and the spread", () => {
    cents(r.egi, 570_000);
    cents(r.noi, 420_000);
    rate(r.capRate, 0.07);
    rate(r.loanConstant, 0.0681346801616404);
    rate(r.spread, 0.0018653198383596);
    expect(r.sign).toBe("positive");
  });

  it("all cash: cash-on-cash is the cap rate and coverage and debt yield are not defined", () => {
    const l = r.levels[0];
    cents(l?.loan, 0);
    cents(l?.cashFlow, 420_000);
    rate(l?.cashOnCash, 0.07);
    expect(l?.dscr).toBeNull();
    expect(l?.debtYield).toBeNull();
    rate(l?.breakEvenOccupancy, 0.25);
    rate(l?.breakEvenRentShare, 0.2631578947368421);
  });

  it("each loan-to-value level: loan, debt service, cash flow, cash-on-cash, coverage, debt yield, break-evens", () => {
    const want = [
      { loan: 3_000_000, equity: 3_000_000, ds: 204404.0404849211, cf: 215595.9595150789, coc: 0.0718653198383596, dscr: 2.0547539031205380, dy: 0.14, beo: 0.5906734008082018, brs: 0.6217614745349492 },
      { loan: 3_600_000, equity: 2_400_000, ds: 245284.8485819053, cf: 174715.1514180947, coc: 0.0727979797575395, dscr: 1.7122949192671150, dy: 0.1166666666666667, beo: 0.6588080809698421, brs: 0.6934821904945706 },
      { loan: 4_200_000, equity: 1_800_000, ds: 286165.6566788895, cf: 133834.3433211105, coc: 0.0743524129561725, dscr: 1.4676813593718128, dy: 0.1, beo: 0.7269427611314825, brs: 0.7652029064541921 },
    ];
    want.forEach((w, k) => {
      const l = r.levels[k + 1];
      cents(l?.loan, w.loan);
      cents(l?.equity, w.equity);
      cents(l?.debtService, w.ds);
      cents(l?.cashFlow, w.cf);
      rate(l?.cashOnCash, w.coc);
      rate(l?.dscr, w.dscr);
      rate(l?.debtYield, w.dy);
      rate(l?.breakEvenOccupancy, w.beo);
      rate(l?.breakEvenRentShare, w.brs);
      expect(l?.negativeCashFlow).toBe(false);
    });
  });

  it("prices the extra $600,000 the larger quote lends", () => {
    const c = r.comparison;
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c.swapped).toBe(false);
    expect(c.holdMonths).toBe(60);
    cents(c.first.payment, 20440.4040484921);
    cents(c.second.payment, 25860.1224179084);
    cents(c.first.balance, 3328581.725797981);
    cents(c.second.balance, 3920164.1410067446);
    cents(c.extraProceeds, 594_000);
    cents(c.extraPayment, 5419.7183694163);
    cents(c.extraBalance, 591582.4152087636);
    rate(c.monthlyRate, 0.0090727679376726);
    rate(c.nominal, 0.108873215252071);
    rate(c.effective, 0.1144737179735526);
    expect(c.signChanges).toBe(1);
    expect(c.note).toBeNull();
  });

  it("traces every figure in the order it was computed", () => {
    const labels = r.trace.map((t) => t.label);
    expect(labels.slice(0, 5)).toEqual(["Effective gross income", "Net operating income", "Cap rate on price", "Loan constant", "Cap rate less loan constant"]);
    expect(labels).toContain("Cash-on-cash at 70.0%");
    expect(labels.at(-1)).toBe("Extra dollars' cost less the cap rate");
    expect(r.trace.find((t) => t.label === "Coverage (DSCR) at 0.0%")?.value).toBe("none");
  });
});

describe("leverage invariants", () => {
  const cases: LeverageInput[] = [
    LEVERAGE_EXAMPLE,
    ex({ rate: 0.08, amortYears: 25, ltvLevels: [0, 0.3, 0.55, 0.8, 0.9] }),
    ex({ rate: 0.08, amortYears: 0, ltvLevels: [0.1, 0.5, 0.75] }),
    ex({ rate: 0.07, amortYears: 0, ltvLevels: [0.1, 0.5, 0.75] }),
    ex({ rate: 0, amortYears: 20, ltvLevels: [0, 0.6] }),
  ];

  it("cash-on-cash equals cap + (cap − constant) × loan / equity at every level", () => {
    for (const input of cases) {
      const r = runLeverage(input);
      for (const l of r.levels) rate(l.cashOnCash, r.capRate + r.spread * (l.loan / l.equity));
    }
  });

  it("cash-on-cash rises with loan-to-value exactly when the cap rate is above the constant", () => {
    for (const input of cases) {
      const r = runLeverage(input);
      for (let k = 1; k < r.levels.length; k += 1) {
        const step = (r.levels[k]?.cashOnCash ?? 0) - (r.levels[k - 1]?.cashOnCash ?? 0);
        if (r.sign === "neutral") expect(Math.abs(step)).toBeLessThan(1e-12);
        else expect(Math.sign(step)).toBe(r.sign === "positive" ? 1 : -1);
      }
    }
  });

  it("coverage × constant × loan-to-value gives back the cap rate; break-even occupancy recovers the costs", () => {
    for (const input of cases) {
      const r = runLeverage(input);
      for (const l of r.levels) {
        if (l.dscr !== null) rate(l.dscr * r.loanConstant * l.ltv, r.capRate);
        cents(l.breakEvenOccupancy * input.pgi, input.opex + l.debtService);
        rate(l.breakEvenRentShare, l.breakEvenOccupancy / (1 - input.vacancy));
        // money in equals money out: loan plus equity is the price; debt service plus cash flow is NOI
        cents(l.loan + l.equity, input.price);
        cents(l.debtService + l.cashFlow, r.noi);
      }
    }
  });

  it("interest only: the constant is the rate, and the extra dollars cost their closed form", () => {
    // flat case: both quotes interest only, no fees, so the extra payment is level
    // and the extra balance equals the extra loan; the cost is (r2·L2 − r1·L1) / (L2 − L1).
    const r = runLeverage(
      ex({ price: 5_000_000, pgi: 400_000, vacancy: 0.1, opex: 80_000, rate: 0.08, amortYears: 0, ltvLevels: [0, 0.4, 0.8], compare: { loan1: 2_000_000, fee1: 0, loan2: 3_000_000, rate2: 0.09, amortYears2: 0, fee2: 0, holdYears: 3 } }),
    );
    rate(r.loanConstant, 0.08);
    expect(r.sign).toBe("negative");
    rate(r.spread, -0.024);
    // computed in the same Python run: cash-on-cash 4.0% at 40%, -4.0% at 80%
    rate(r.levels[1]?.cashOnCash, 0.04);
    rate(r.levels[2]?.cashOnCash, -0.04);
    expect(r.levels[2]?.negativeCashFlow).toBe(true);
    rate(r.levels[2]?.dscr, 0.875);
    rate(r.levels[2]?.breakEvenOccupancy, 1);
    rate(r.comparison?.nominal, (0.09 * 3_000_000 - 0.08 * 2_000_000) / 1_000_000);
    rate(r.comparison?.effective, 0.1157188361952135);
    // plugged back, the monthly rate makes the extra flows worth the extra cash
    const c = r.comparison;
    const i = c?.monthlyRate ?? 0;
    const H = c?.holdMonths ?? 0;
    const pv = ((c?.extraPayment ?? 0) * (1 - (1 + i) ** -H)) / i + (c?.extraBalance ?? 0) * (1 + i) ** -H;
    cents(pv, c?.extraProceeds ?? 0);
  });

  it("the worked example's monthly cost, plugged back, makes the extra flows worth the extra cash", () => {
    const c = runLeverage(LEVERAGE_EXAMPLE).comparison;
    const i = c?.monthlyRate ?? 0;
    const H = c?.holdMonths ?? 0;
    const pv = ((c?.extraPayment ?? 0) * (1 - (1 + i) ** -H)) / i + (c?.extraBalance ?? 0) * (1 + i) ** -H;
    cents(pv, c?.extraProceeds ?? 0);
  });
});

describe("leverage edge cases", () => {
  it("a zero rate: the constant is one over the amortization, and leverage is positive", () => {
    const r = runLeverage(ex({ rate: 0, amortYears: 20, compare: null }));
    rate(r.loanConstant, 1 / 20);
    expect(r.sign).toBe("positive");
    expect(r.comparison).toBeNull();
  });

  it("a zero rate interest only: no debt service, so coverage is not defined at any level", () => {
    const r = runLeverage(ex({ rate: 0, amortYears: 0, compare: null }));
    rate(r.loanConstant, 0);
    for (const l of r.levels) {
      expect(l.dscr).toBeNull();
      cents(l.debtService, 0);
    }
  });

  it("a cap rate equal to the constant is neutral: cash-on-cash is the cap rate at every level", () => {
    // an interest-only loan at 7% against a 7% cap rate
    const r = runLeverage(ex({ rate: 0.07, amortYears: 0, compare: null }));
    expect(r.sign).toBe("neutral");
    for (const l of r.levels) rate(l.cashOnCash, 0.07);
  });

  it("a quote 2 smaller than quote 1 is swapped, with the same cost", () => {
    const base = runLeverage(LEVERAGE_EXAMPLE).comparison;
    // the worked example's two quotes entered the other way round: quote 1 carries
    // the loan's rate, so the loan's rate becomes the larger quote's 6.25%
    const s = runLeverage({ ...cmp({ loan1: 4_200_000, fee1: 42_000, loan2: 3_600_000, rate2: 0.055, amortYears2: 30, fee2: 36_000 }), rate: 0.0625 });
    expect(s.comparison?.swapped).toBe(true);
    cents(s.comparison?.extraProceeds, 594_000);
    rate(s.comparison?.effective, base?.effective ?? 0);
    expect(s.trace.some((t) => t.label === "Quotes put in order")).toBe(true);
  });

  // Review 2026-11-13 (math-review-a): an input set of the reviewer's own, checked in an
  // independent Python implementation written from the scope (bisection for the cost):
  // an interest-only loan above the cap rate, cash flow below zero at 85%, and a smaller
  // amortizing quote 2 that is swapped in as the smaller loan.
  it("an interest-only loan, a negative cash flow and a swapped quote match the reviewer's own calculation", () => {
    const r = runLeverage({
      price: 1_000_000,
      pgi: 100_000,
      vacancy: 0.1,
      opex: 20_000,
      rate: 0.09,
      amortYears: 0,
      ltvLevels: [0, 0.85],
      compare: { loan1: 900_000, fee1: 0, loan2: 600_000, rate2: 0.08, amortYears2: 25, fee2: 5_000, holdYears: 3 },
    });
    expect(r.sign).toBe("negative");
    rate(r.spread, -0.02);
    cents(r.levels[1]?.cashFlow, -6_500);
    rate(r.levels[1]?.cashOnCash, -0.043333333333333335);
    rate(r.levels[1]?.dscr, 0.9150326797385621);
    rate(r.levels[1]?.breakEvenRentShare, 1.0722222222222222);
    expect(r.levels[1]?.negativeCashFlow).toBe(true);
    const c = r.comparison;
    expect(c?.swapped).toBe(true);
    cents(c?.extraProceeds, 305_000);
    cents(c?.extraPayment, 2119.1026837619665);
    cents(c?.extraBalance, 325573.7745923321);
    rate(c?.nominal, 0.1026695252651657);
    rate(c?.effective, 0.10764130598009691);
  });

  it("the same proceeds after fees: no extra dollars, so no cost, and the trace says so", () => {
    const r = runLeverage(cmp({ loan2: 3_600_000, fee2: 36_000 }));
    expect(r.comparison?.extraProceeds).toBe(0);
    expect(r.comparison?.monthlyRate).toBeNull();
    expect(r.comparison?.effective).toBeNull();
    expect(r.comparison?.note).toMatch(/^no extra proceeds/);
    expect(r.trace.find((t) => t.label === "Monthly cost of the extra dollars")?.value).toBe("none");
  });

  it("fees that eat the extra loan leave nothing to price", () => {
    const r = runLeverage(cmp({ loan2: 3_700_000, fee2: 200_000 }));
    expect(r.comparison?.extraProceeds).toBeLessThan(0);
    expect(r.comparison?.monthlyRate).toBeNull();
  });

  it("a one-level test and a hold equal to the amortization (both balances zero)", () => {
    const r = runLeverage(ex({ ltvLevels: [0.65], compare: { loan1: 1_000_000, fee1: 0, loan2: 2_000_000, rate2: 0.055, amortYears2: 5, fee2: 0, holdYears: 5 }, amortYears: 5 }));
    expect(r.levels).toHaveLength(1);
    cents(r.comparison?.first.balance, 0);
    cents(r.comparison?.second.balance, 0);
    // same rate and amortization, no fees: the extra dollars cost the rate itself
    rate(r.comparison?.nominal, 0.055);
  });
});

describe("leverage input", () => {
  const fail = (input: unknown) => {
    const p = leverageInput.safeParse(input);
    expect(p.success).toBe(false);
    return p.error?.issues ?? [];
  };

  it("refuses expenses that leave no NOI, in plain words on the expenses field", () => {
    const issues = fail(ex({ opex: 600_000 }));
    expect(issues[0]?.path).toEqual(["opex"]);
    expect(plainIssue(issues[0] as (typeof issues)[number])).toBe("Operating expenses must be less than the income after vacancy, so NOI is above zero.");
  });

  it("refuses levels out of order or repeated, naming the level", () => {
    const issues = fail(ex({ ltvLevels: [0, 0.6, 0.6] }));
    expect(issues[0]?.path).toEqual(["ltvLevels", 2]);
    expect(issues[0]?.message).toMatch(/lowest to highest/);
  });

  it("refuses a loan-to-value of 100% or more and a vacancy of 100%", () => {
    expect(plainIssue(fail(ex({ ltvLevels: [0, 1] }))[0] as never, "pct")).toBe("Less than 100%.");
    expect(fail(ex({ vacancy: 1 })).length).toBeGreaterThan(0);
    expect(fail(ex({ ltvLevels: [] })).length).toBeGreaterThan(0);
  });

  it("refuses fees above the loan and a hold past an amortization", () => {
    expect(fail(cmp({ fee1: 4_000_000 }))[0]?.path).toEqual(["compare", "fee1"]);
    const hold = fail(cmp({ holdYears: 31 }));
    expect(hold[0]?.path).toEqual(["compare", "holdYears"]);
    expect(hold[0]?.message).toBe("the hold cannot run past either quote's amortization");
  });

  it("refuses fields it does not know", () => {
    fail({ ...LEVERAGE_EXAMPLE, ltv: 0.6 });
    fail(cmp({ ...({ extra: 1 } as object) }));
  });
});
