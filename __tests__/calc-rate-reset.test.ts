import { describe, expect, it } from "vitest";
import { pmt } from "@/lib/calculators/finance";
import { RATE_RESET_EXAMPLE, rateResetInput, runRateReset, type RateResetInput } from "@/lib/calculators/rate-reset";

// The worked example's values were computed independently in Python on
// 2026-11-13 (decimal module at 40 digits), not by porting this module: the
// payment from the annuity closed form, each year-end balance from the
// closed-form remaining balance, and interest as the twelve payments less the
// fall in balance. This module loops month by month through the shared
// schedule instead. Money is compared to 1e-6 dollars, ratios to 1e-9.

const money = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual as number).toBeCloseTo(expected, 6);
};
const ratio = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual as number).toBeCloseTo(expected, 9);
};

const withInput = (patch: Partial<RateResetInput>): RateResetInput => ({ ...RATE_RESET_EXAMPLE, ...patch });

function rejects(input: unknown): { path: string; message: string }[] {
  const p = rateResetInput.safeParse(input);
  expect(p.success).toBe(false);
  return (p.error?.issues ?? []).map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

describe("floating-rate worked example (Python, 2026-11-13)", () => {
  const r = runRateReset(RATE_RESET_EXAMPLE);

  it("sets each year's rate inside the cap and floor, and says which one binds", () => {
    expect(r.years.map((y) => y.rate)).toEqual([0.065, 0.07, 0.08, 0.075, 0.0675].map((x) => expect.closeTo(x, 12)));
    expect(r.years.map((y) => y.bound)).toEqual(["floor", null, "cap", null, null]);
    ratio(r.years[0]?.uncappedRate, 0.06);
    ratio(r.years[2]?.uncappedRate, 0.085);
  });

  it("re-amortizes the payment on the actual balance over the months left", () => {
    expect(r.years.map((y) => y.monthsLeft)).toEqual([300, 288, 276, 264, 252]);
    const pay = [20256.2148404292, 21177.2596944999, 23020.5630865813, 22116.2914293713, 20832.1076656024];
    pay.forEach((p, i) => money(r.years[i]?.payment, p));
    const ds = [243074.5780851503, 254127.1163339991, 276246.757038975, 265395.4971524556, 249985.291987229];
    ds.forEach((x, i) => money(r.years[i]?.debtService, x));
  });

  it("pins interest, principal and the balance each year", () => {
    const interest = [193541.6007220207, 204975.6189991211, 230450.2073393997, 212365.6273960699, 187250.750812679];
    const principal = [49532.9773631295, 49151.4973348781, 45796.5496995753, 53029.8697563858, 62734.54117455];
    const end = [2950467.0226368705, 2901315.5253019924, 2855518.9756024171, 2802489.1058460313, 2739754.5646714813];
    interest.forEach((x, i) => money(r.years[i]?.interest, x));
    principal.forEach((x, i) => money(r.years[i]?.principal, x));
    end.forEach((x, i) => money(r.years[i]?.endBalance, x));
    money(r.totalInterest, 1028583.8052692903);
    money(r.totalPrincipal, 260245.4353285187);
    money(r.endingBalance, 2739754.5646714813);
  });

  it("pins NOI, coverage, the payment change and the first year below the minimum", () => {
    const noi = [320000, 326400, 332928, 339586.56, 346378.2912];
    noi.forEach((x, i) => money(r.years[i]?.noi, x));
    const dscr = [1.316468396329, 1.284396583523, 1.205183378689, 1.279549064108, 1.385594682177];
    dscr.forEach((x, i) => ratio(r.years[i]?.dscr, x));
    const shock = [0, 0.045469741574, 0.136469141344, 0.091827451653, 0.0284304264];
    shock.forEach((x, i) => ratio(r.years[i]?.shock, x));
    expect(r.years.map((y) => y.belowMin)).toEqual([false, false, true, false, false]);
    expect(r.firstBreachYear).toBe(3);
    expect(r.maxPaymentYear).toBe(3);
    money(r.maxPayment, 23020.5630865813);
    ratio(r.maxShock, 0.136469141344);
    expect(r.lowestDscrYear).toBe(3);
    ratio(r.lowestDscr, 1.205183378689);
  });

  it("writes the trace in the order it computed, ending on the balance", () => {
    expect(r.trace[0]).toEqual({ label: "Amortization", formula: "25 years × 12, payments monthly in arrears", value: "300 months" });
    expect(r.trace[1]).toEqual({ label: "Year 1 rate (floor binds)", formula: "min(8.00%, max(6.50%, 3.00% + 3.00%))", value: "6.50%" });
    expect(r.trace[2]).toEqual({ label: "Year 1 payment, a month", formula: "PMT(6.50%/12, 300, $3,000,000.00)", value: "$20,256.21" });
    expect(r.trace.find((l) => l.label === "Year 3 rate (cap binds)")?.value).toBe("8.00%");
    expect(r.trace.find((l) => l.label === "Year 5 rate")?.formula).toBe("min(8.00%, max(6.50%, 3.75% + 3.00%))");
    expect(r.trace.find((l) => l.label === "First year below the minimum")?.value).toBe("year 3");
    expect(r.trace.at(-1)).toEqual({ label: "Balance at the end of year 5", formula: "$3,000,000.00 − principal paid $260,245.44", value: "$2,739,754.56" });
  });
});

describe("invariants", () => {
  const cases: RateResetInput[] = [
    RATE_RESET_EXAMPLE,
    withInput({ amortYears: 30, rateCap: null, rateFloor: null, indexPath: [0.02, 0.06, 0.01, 0.09, 0.03, 0.05, 0.04] }),
    withInput({ amortYears: 0, indexPath: [0.03, 0.06, 0.02] }),
    withInput({ amortYears: 3, indexPath: [0.04, 0.05, 0.06, 0.07, 0.08] }),
  ];

  it("money in equals money out: each year's principal is the fall in balance, and the loan less principal paid is the ending balance", () => {
    for (const c of cases) {
      const r = runRateReset(c);
      for (const y of r.years) {
        expect(y.beginBalance - y.principal).toBeCloseTo(y.endBalance, 6);
        expect(y.interest + y.principal).toBeCloseTo(y.debtService, 6);
        if (!y.paidOff) expect(y.debtService).toBeCloseTo(12 * y.payment, 6);
      }
      expect(c.loan - r.totalPrincipal).toBeCloseTo(r.endingBalance, 6);
      expect(r.totalInterest + r.totalPrincipal).toBeCloseTo(r.totalDebtService, 6);
      for (let i = 1; i < r.years.length; i += 1) expect(r.years[i]?.beginBalance).toBe(r.years[i - 1]?.endBalance);
    }
  });

  it("keeps every rate inside the cap and floor, and coverage times debt service is NOI", () => {
    for (const c of cases) {
      for (const y of runRateReset(c).years) {
        if (c.rateFloor !== null) expect(y.rate).toBeGreaterThanOrEqual(c.rateFloor);
        if (c.rateCap !== null) expect(y.rate).toBeLessThanOrEqual(c.rateCap);
        if (y.dscr !== null) expect(y.dscr * y.debtService).toBeCloseTo(y.noi, 6);
      }
    }
  });

  it("raises the payment when the rate rises and lowers it when the rate falls", () => {
    const r = runRateReset(cases[1] as RateResetInput);
    for (let i = 1; i < r.years.length; i += 1) {
      const a = r.years[i - 1];
      const b = r.years[i];
      if (!a || !b) continue;
      if (b.rate > a.rate) expect(b.payment).toBeGreaterThan(a.payment);
      if (b.rate < a.rate) expect(b.payment).toBeLessThan(a.payment);
    }
  });

  it("a flat path equals the level payment every year, to the cent (Python: $21,203.38 at 7% over 25 years)", () => {
    const r = runRateReset(withInput({ spread: 0, indexPath: [0.07, 0.07, 0.07, 0.07, 0.07], rateCap: null, rateFloor: null, noiGrowth: 0, minDscr: null }));
    const level = -pmt(0.07 / 12, 300, 3_000_000);
    money(level, 21203.3759182528);
    for (const y of r.years) {
      money(y.payment, 21203.3759182528);
      ratio(y.shock, 0);
    }
    money(r.endingBalance, 2734864.5721185432);
    expect(r.firstBreachYear).toBeNull();
    expect(r.trace.some((l) => l.label === "First year below the minimum")).toBe(false);
  });
});

describe("edge cases", () => {
  it("interest only: the balance never falls and the payment moves one for one with the rate (Python)", () => {
    const r = runRateReset(withInput({ amortYears: 0, indexPath: [0.035, 0.05], rateCap: null, rateFloor: null, noiGrowth: 0 }));
    expect(r.years.map((y) => y.monthsLeft)).toEqual([null, null]);
    money(r.years[0]?.payment, 16250);
    money(r.years[1]?.payment, 20000);
    ratio(r.years[0]?.dscr, 1.641025641026);
    ratio(r.years[1]?.dscr, 1.333333333333);
    for (const y of r.years) {
      expect(y.principal).toBeCloseTo(0, 9);
      expect(y.endBalance).toBeCloseTo(3_000_000, 6);
    }
    // 6.50% to 8.00%: the interest-only payment rises by the same share as the rate
    ratio(r.years[1]?.shock, 0.08 / 0.065 - 1);
    expect(r.trace[0]?.value).toBe("interest only");
  });

  it("a path longer than the amortization pays the loan off, then shows no payment and no coverage (Python)", () => {
    const r = runRateReset({ loan: 1_200_000, amortYears: 2, spread: 0, indexPath: [0.06, 0.06, 0.06], rateCap: null, rateFloor: null, noi: 500_000, noiGrowth: 0, minDscr: 1.25 });
    money(r.years[0]?.payment, 53184.7323033083);
    money(r.years[0]?.endBalance, 617949.7916239552);
    money(r.years[1]?.payment, 53184.7323033083);
    expect(r.years[1]?.endBalance).toBe(0);
    expect(r.years[2]).toMatchObject({ paidOff: true, payment: 0, debtService: 0, dscr: null, endBalance: 0, belowMin: false });
    ratio(r.years[0]?.dscr, 0.7834328549224426);
    expect(r.firstBreachYear).toBe(1);
    money(r.totalPrincipal, 1_200_000);
    expect(r.endingBalance).toBe(0);
  });

  it("a zero rate repays the loan in equal parts (Python)", () => {
    const r = runRateReset({ loan: 1_200_000, amortYears: 10, spread: 0, indexPath: [0, 0], rateCap: null, rateFloor: null, noi: 200_000, noiGrowth: 0, minDscr: null });
    money(r.years[0]?.payment, 10000);
    money(r.years[0]?.endBalance, 1_080_000);
    money(r.years[1]?.endBalance, 960_000);
    expect(r.totalInterest).toBeCloseTo(0, 9);
  });

  it("interest only at a zero rate has no debt service: coverage and shock are null, not zero", () => {
    const r = runRateReset({ loan: 1_000_000, amortYears: 0, spread: 0, indexPath: [0, 0.05], rateCap: null, rateFloor: null, noi: 100_000, noiGrowth: 0, minDscr: 1.25 });
    expect(r.years[0]?.dscr).toBeNull();
    expect(r.years[1]?.shock).toBeNull();
    expect(r.maxShock).toBeNull();
    ratio(r.years[1]?.dscr, 100_000 / 50_000);
    expect(r.firstBreachYear).toBeNull();
  });

  it("one year is a full path", () => {
    const r = runRateReset(withInput({ indexPath: [0.03] }));
    expect(r.years).toHaveLength(1);
    money(r.years[0]?.payment, 20256.2148404292);
    expect(r.maxPaymentYear).toBe(1);
    ratio(r.maxShock, 0);
  });

  // Review 2026-11-13 (math-review-a): an input set of the reviewer's own, a six-year path
  // that hits the floor, the cap and falls back, checked in an independent Python month
  // loop written from the scope (payment re-set on the actual balance each year).
  it("a six-year path through the floor and the cap matches the reviewer's own calculation", () => {
    const r = runRateReset({ loan: 2_000_000, amortYears: 20, spread: 0.0225, indexPath: [0.04, 0.0475, 0.0525, 0.035, 0.06, 0.03], rateCap: 0.075, rateFloor: 0.06, noi: 240_000, noiGrowth: 0.015, minDscr: 1.3 });
    expect(r.years.map((y) => y.bound)).toEqual([null, null, null, "floor", "cap", "floor"]);
    const pay = [14618.56404755148, 15471.720894087946, 16030.8482614539, 14451.057792777363, 15953.971165201878, 14522.856526103098];
    const end = [1948107.45644899, 1897201.6812348266, 1845363.7523185816, 1780919.8258984678, 1721009.5413565885, 1648010.0415549679];
    pay.forEach((p, i) => money(r.years[i]?.payment, p));
    end.forEach((e, i) => expect(Math.abs((r.years[i]?.endBalance ?? Number.NaN) - e)).toBeLessThan(1e-5));
    ratio(r.years[2]?.dscr, 1.2853031644958812);
    ratio(r.years[3]?.shock, -0.011458461599186398);
    expect(r.firstBreachYear).toBe(3);
  });

  it("no minimum means no flag", () => {
    const r = runRateReset(withInput({ minDscr: null }));
    expect(r.firstBreachYear).toBeNull();
    expect(r.years.every((y) => !y.belowMin)).toBe(true);
  });
});

describe("bad input is refused in plain words", () => {
  it("refuses an empty path", () => {
    expect(rejects(withInput({ indexPath: [] }))).toContainEqual({ path: "indexPath", message: "enter at least one year's index rate" });
  });

  it("refuses a rate below zero when there is no floor, naming the year", () => {
    const issues = rejects(withInput({ spread: 0.005, indexPath: [0.01, -0.01], rateFloor: null }));
    expect(issues).toEqual([{ path: "indexPath.1", message: "year 2: the index plus the spread is a rate below zero; raise the index or set a floor" }]);
    // a floor holds the rate at or above zero, so the same path runs
    const r = runRateReset(withInput({ spread: 0.005, indexPath: [0.01, -0.01], rateFloor: 0.02 }));
    expect(r.years[1]).toMatchObject({ rate: 0.02, bound: "floor" });
  });

  it("refuses a floor above the cap", () => {
    expect(rejects(withInput({ rateCap: 0.06, rateFloor: 0.07 }))).toEqual([{ path: "rateFloor", message: "the floor cannot be above the cap" }]);
  });

  it("refuses a zero loan, a fractional amortization, a non-positive NOI and an unknown field", () => {
    expect(rejects(withInput({ loan: 0 }))[0]?.path).toBe("loan");
    expect(rejects(withInput({ amortYears: 25.5 }))[0]?.path).toBe("amortYears");
    expect(rejects(withInput({ noi: 0 }))[0]?.path).toBe("noi");
    expect(rejects({ ...RATE_RESET_EXAMPLE, term: 5 }).length).toBeGreaterThan(0);
  });
});
