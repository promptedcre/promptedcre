import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import {
  REPLACEMENT_RESERVES_EXAMPLE,
  replacementReservesInput,
  runReplacementReserves,
  type ReplacementReservesComponentInput,
  type ReplacementReservesInput,
} from "@/lib/calculators/replacement-reserves";

// The worked example's expected values were computed independently in Python on
// 2026-11-13 with exact fractions, written from the method rather than from this
// module: replacement years by testing each year for the component's age, and the
// level contribution by bisection on "never runs short" rather than by its closed
// form. Money is compared to the cent, per-square-foot figures to 1e-9.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};
const close = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(1e-9);
};
const comp = (label: string, cost: number, lifeYears: number, ageYears: number): ReplacementReservesComponentInput => ({ label, cost, lifeYears, ageYears });
const plan = (components: ReplacementReservesComponentInput[], over: Partial<ReplacementReservesInput> = {}): ReplacementReservesInput => ({
  areaSf: 10_000,
  units: null,
  components,
  inflation: 0.02,
  horizonYears: 10,
  startingBalance: 0,
  annualContribution: 0,
  ...over,
});
const issueAt = (input: unknown, path: string) => {
  const p = replacementReservesInput.safeParse(input);
  expect(p.success).toBe(false);
  const issue = p.error?.issues.find((i) => i.path.join(".") === path);
  expect(issue, path).toBeDefined();
  return issue ? plainIssue(issue) : "";
};

describe("replacement-reserves worked example (60,000 SF, five components, 10 years at 3%)", () => {
  const r = runReplacementReserves(REPLACEMENT_RESERVES_EXAMPLE);

  it("straight-line reserve by component, in total and per square foot", () => {
    expect(r.components.map((c) => c.straightLine)).toEqual([12_000, 8_000, 7_500, 3_000, 10_000]);
    cents(r.straightLine, 40_500);
    close(r.straightLinePerSf, 0.675);
    expect(r.straightLinePerUnit).toBeNull();
  });

  it("replacement years and costs grown from today's cost", () => {
    expect(r.components.map((c) => c.replacementYears)).toEqual([[10], [1], [7], [1], [3, 8]]);
    expect(r.replacements.map((x) => [x.year, x.label])).toEqual([
      [1, "HVAC units"],
      [1, "Dock levelers"],
      [3, "Exterior paint"],
      [7, "Paving"],
      [8, "Exterior paint"],
      [10, "Roof"],
    ]);
    const costs = r.replacements.map((x) => x.cost);
    cents(costs[0], 120_000);
    cents(costs[1], 30_000);
    cents(costs[2], 53_045);
    cents(costs[3], 107_464.70668761);
    cents(costs[4], 61_493.6932712435);
    cents(costs[5], 391_431.9551487734);
    cents(r.totalSpend, 763_435.3551076269);
  });

  it("the balance year by year, the first shortfall and the lowest balance", () => {
    const expected = [40_000, 80_000, 66_955, 106_955, 146_955, 186_955, 119_490.29331239, 97_996.6000411465, 137_996.6000411465, -213_435.3551076269];
    expect(r.years).toHaveLength(10);
    r.years.forEach((y, i) => cents(y.closing, expected[i] ?? Number.NaN));
    cents(r.endingBalance, -213_435.3551076269);
    expect(r.years.map((y) => y.short)).toEqual([false, false, false, false, false, false, false, false, false, true]);
    expect(r.firstShortfall?.year).toBe(10);
    cents(r.firstShortfall?.balance, -213_435.3551076269);
    expect(r.lowestBalance.year).toBe(10);
  });

  it("the level contribution that never runs short, per square foot, and the gap", () => {
    cents(r.levelContribution, 61_343.53551076269);
    expect(r.levelBindingYear).toBe(10);
    expect(Math.abs((r.levelPerSf ?? Number.NaN) - 1.0223922585127114)).toBeLessThan(1e-9);
    expect(r.levelPerUnit).toBeNull();
    cents(r.contributionGap, 21_343.53551076269);
  });

  it("traces the working in the order it was computed", () => {
    const labels = r.trace.map((l) => l.label);
    expect(labels[0]).toBe("Roof: straight-line reserve");
    const at = (s: string) => labels.indexOf(s);
    expect(at("Straight-line reserve, total")).toBeGreaterThan(0);
    expect(at("Straight-line reserve per square foot")).toBeGreaterThan(at("Straight-line reserve, total"));
    expect(at("Roof: replaced in")).toBeGreaterThan(at("Straight-line reserve per square foot"));
    expect(at("Roof, year 10: cost")).toBeGreaterThan(at("Roof: replaced in"));
    expect(at("Balance, end of year 1")).toBeGreaterThan(at("Replacement spending over 10 years"));
    expect(at("First year the reserve runs short")).toBeGreaterThan(at("Balance, end of year 10"));
    expect(at("Level contribution that never runs short")).toBeGreaterThan(at("Lowest year-end balance"));
    expect(labels.at(-1)).toBe("Added contribution needed");
    expect(r.trace.find((l) => l.label === "First year the reserve runs short")?.value).toBe("year 10, -$213,435.36");
  });
});

// A spread of plans for the invariants: the worked example and synthetic ones.
const PLANS: ReplacementReservesInput[] = [
  REPLACEMENT_RESERVES_EXAMPLE,
  plan([comp("A", 100_000, 7, 3), comp("B", 40_000, 3, 0), comp("C", 250_000, 20, 25)], { inflation: 0.04, horizonYears: 30, startingBalance: 50_000, annualContribution: 20_000 }),
  plan([comp("A", 80_000, 1, 0)], { inflation: 0, horizonYears: 5, startingBalance: 10_000, annualContribution: 90_000 }),
  plan([comp("A", 500_000, 40, 10), comp("B", 60_000, 9, 9)], { inflation: -0.01, horizonYears: 50, units: 120, areaSf: null, annualContribution: 15_000 }),
  plan([comp("A", 75_000, 15, 0)], { horizonYears: 12, startingBalance: 5_000, annualContribution: 1_000 }),
];

describe("invariants", () => {
  it("money in equals money out: ending balance = start + contributions − spending", () => {
    for (const p of PLANS) {
      const r = runReplacementReserves(p);
      cents(r.endingBalance, p.startingBalance + p.horizonYears * p.annualContribution - r.totalSpend);
      cents(
        r.years.reduce((s, y) => s + y.spend, 0),
        r.totalSpend,
      );
      cents(r.years.at(-1)?.cumulativeSpend, r.totalSpend);
    }
  });

  it("the straight-line reserves sum to the total, and the total over the area is the per-square-foot figure", () => {
    for (const p of PLANS) {
      const r = runReplacementReserves(p);
      cents(
        r.components.reduce((s, c) => s + c.straightLine, 0),
        r.straightLine,
      );
      if (p.areaSf !== null) close(r.straightLinePerSf, r.straightLine / p.areaSf);
      if (p.units !== null) close(r.straightLinePerUnit, r.straightLine / p.units);
    }
  });

  it("at the level contribution no year runs short, and some year ends at zero", () => {
    for (const p of PLANS) {
      const c = runReplacementReserves(p).levelContribution;
      const r = runReplacementReserves({ ...p, annualContribution: c });
      expect(r.firstShortfall).toBeNull();
      expect(r.trace.some((l) => l.value.includes("-$0.00"))).toBe(false);
      for (const y of r.years) expect(y.closing).toBeGreaterThan(-1e-6);
      if (c > 0) expect(Math.min(...r.years.map((y) => y.closing))).toBeLessThan(1e-6);
      // a cent less a year runs short whenever the level contribution is above zero
      if (c > 0.01) expect(runReplacementReserves({ ...p, annualContribution: c - 0.01 }).firstShortfall).not.toBeNull();
    }
  });

  it("with zero inflation every replacement costs exactly today's cost", () => {
    for (const p of PLANS) {
      const r = runReplacementReserves({ ...p, inflation: 0 });
      for (const x of r.replacements) expect(x.cost).toBe(p.components[x.component]?.cost);
    }
  });

  it("the level contribution never falls as inflation rises", () => {
    for (const p of PLANS) {
      const levels = [-0.05, -0.01, 0, 0.01, 0.03, 0.05, 0.1].map((inflation) => runReplacementReserves({ ...p, inflation }).levelContribution);
      for (let i = 1; i < levels.length; i++) expect(levels[i] ?? 0).toBeGreaterThanOrEqual((levels[i - 1] ?? 0) - 1e-9);
    }
  });
});

describe("edge cases", () => {
  it("a component past its life, or at it, is replaced in year 1 and then every life after", () => {
    const r = runReplacementReserves(plan([comp("Past", 10_000, 4, 9), comp("At", 20_000, 6, 6), comp("Due next", 30_000, 6, 5)], { horizonYears: 13 }));
    expect(r.components.map((c) => c.replacementYears)).toEqual([
      [1, 5, 9, 13],
      [1, 7, 13],
      [1, 7, 13],
    ]);
  });

  it("no replacement inside the horizon: no spending, a zero level contribution and no shortfall", () => {
    const r = runReplacementReserves(plan([comp("Roof", 400_000, 30, 5)], { horizonYears: 10, startingBalance: 0, annualContribution: 0 }));
    expect(r.components[0]?.firstYear).toBe(25);
    expect(r.replacements).toEqual([]);
    expect(r.totalSpend).toBe(0);
    expect(r.levelContribution).toBe(0);
    expect(r.levelBindingYear).toBeNull();
    expect(r.firstShortfall).toBeNull();
    expect(r.contributionGap).toBe(0);
    cents(r.straightLine, 400_000 / 30);
  });

  it("a starting balance that covers every replacement needs no contribution", () => {
    const r = runReplacementReserves(plan([comp("A", 50_000, 5, 5)], { inflation: 0, horizonYears: 5, startingBalance: 50_000 }));
    expect(r.levelContribution).toBe(0);
    expect(r.firstShortfall).toBeNull();
    expect(r.lowestBalance).toEqual({ year: 1, balance: 0 });
  });

  it("a contribution at or above the level contribution never runs short; the gap is zero", () => {
    const p = plan([comp("A", 60_000, 6, 0)], { inflation: 0, horizonYears: 6, annualContribution: 12_000 });
    const r = runReplacementReserves(p);
    cents(r.levelContribution, 10_000);
    expect(r.firstShortfall).toBeNull();
    expect(r.contributionGap).toBe(0);
    cents(r.endingBalance, 72_000 - 60_000);
  });

  it("a one-year horizon and a one-year life", () => {
    const r = runReplacementReserves(plan([comp("Filters", 2_000, 1, 0)], { horizonYears: 1, startingBalance: 500, annualContribution: 1_000 }));
    expect(r.replacements.map((x) => x.year)).toEqual([1]);
    cents(r.replacements[0]?.cost, 2_000);
    cents(r.endingBalance, -500);
    expect(r.firstShortfall).toEqual({ year: 1, balance: -500 });
    cents(r.levelContribution, 1_500);
  });

  it("a balance below zero by less than half a cent is not a shortfall; half a cent or more is", () => {
    const at = (cost: number) => runReplacementReserves(plan([comp("A", cost, 1, 0)], { inflation: 0, horizonYears: 1, annualContribution: 1_000 }));
    expect(at(1_000.004).firstShortfall).toBeNull();
    expect(at(1_000.006).firstShortfall?.year).toBe(1);
    expect(at(1_000.006).lowestBalance.balance).toBeLessThan(0);
  });

  it("per unit only, and both per square foot and per unit", () => {
    const units = runReplacementReserves(plan([comp("A", 120_000, 12, 0)], { areaSf: null, units: 40 }));
    expect(units.straightLinePerSf).toBeNull();
    close(units.straightLinePerUnit, 250);
    const both = runReplacementReserves(plan([comp("A", 120_000, 12, 0)], { areaSf: 20_000, units: 40 }));
    close(both.straightLinePerSf, 0.5);
    close(both.straightLinePerUnit, 250);
    expect(both.trace.some((l) => l.label === "Straight-line reserve per unit")).toBe(true);
  });

  it("a component with no cost reserves nothing and spends nothing", () => {
    const r = runReplacementReserves(plan([comp("Already covered", 0, 5, 5)], { horizonYears: 6 }));
    expect(r.straightLine).toBe(0);
    expect(r.totalSpend).toBe(0);
    expect(r.levelContribution).toBe(0);
  });
});

describe("bad input is refused in plain words", () => {
  const ok = plan([comp("A", 1_000, 5, 0)]);

  it("needs the area or the unit count", () => {
    expect(issueAt({ ...ok, areaSf: null, units: null }, "areaSf")).toBe("Give the area, the unit count or both.");
    expect(replacementReservesInput.safeParse({ ...ok, areaSf: null, units: 10 }).success).toBe(true);
  });

  it("refuses impossible values", () => {
    expect(issueAt({ ...ok, areaSf: 0 }, "areaSf")).toBe("Must be more than zero.");
    expect(issueAt({ ...ok, units: 2.5 }, "units")).toBe("Whole numbers only.");
    expect(issueAt({ ...ok, inflation: -1 }, "inflation")).toBe("More than -1.");
    expect(issueAt({ ...ok, inflation: 1.5 }, "inflation")).toBe("At most 1.");
    expect(issueAt({ ...ok, horizonYears: 0 }, "horizonYears")).toBe("At least 1.");
    expect(issueAt({ ...ok, horizonYears: 51 }, "horizonYears")).toBe("At most 50.");
    expect(issueAt({ ...ok, startingBalance: -1 }, "startingBalance")).toBe("Cannot be negative.");
    expect(issueAt({ ...ok, annualContribution: -1 }, "annualContribution")).toBe("Cannot be negative.");
  });

  it("refuses a bad component row by its place in the list", () => {
    expect(issueAt({ ...ok, components: [comp("A", -5, 5, 0)] }, "components.0.cost")).toBe("Cannot be negative.");
    expect(issueAt({ ...ok, components: [comp("A", 5, 0, 0)] }, "components.0.lifeYears")).toBe("At least 1.");
    expect(issueAt({ ...ok, components: [comp("A", 5, 2.5, 0)] }, "components.0.lifeYears")).toBe("Whole numbers only.");
    expect(issueAt({ ...ok, components: [comp("A", 5, 5, 0), comp("B", 5, 5, -1)] }, "components.1.ageYears")).toBe("Cannot be negative.");
    expect(issueAt({ ...ok, components: [comp("  ", 5, 5, 0)] }, "components.0.label")).toBe("Fill this in.");
    expect(issueAt({ ...ok, components: [] }, "components")).toBe("Add at least one.");
  });

  it("refuses a field it does not know, on the plan and on a row", () => {
    expect(replacementReservesInput.safeParse({ ...ok, interest: 0.02 }).success).toBe(false);
    expect(replacementReservesInput.safeParse({ ...ok, components: [{ ...comp("A", 5, 5, 0), count: 2 }] }).success).toBe(false);
    expect(() => runReplacementReserves({ ...ok, horizonYears: 0 })).toThrow();
  });
});

// Second review (math-review-b, 2026-11-13): the reviewer's own inputs, pinned to a separate
// Python model written before the TypeScript was read (scratch rr.py).
describe("second review: two replacements in one year and a reserve that runs short", () => {
  const r = runReplacementReserves({
    areaSf: 50_000,
    units: null,
    components: [comp("Roof", 300_000, 20, 15), comp("HVAC", 90_000, 15, 10), comp("Paving", 60_000, 8, 2)],
    inflation: 0.025,
    horizonYears: 12,
    startingBalance: 50_000,
    annualContribution: 30_000,
  });

  it("matches the reviewer's model", () => {
    cents(r.straightLine, 28_500);
    close(r.straightLinePerSf, 0.57);
    expect(r.replacements.map((x) => [x.year, x.label])).toEqual([
      [5, "Roof"],
      [5, "HVAC"],
      [6, "Paving"],
    ]);
    cents(r.totalSpend, 498_371.520117);
    cents(r.years[4]?.closing, -230_487.027344);
    cents(r.endingBalance, -88_371.520117);
    expect(r.firstShortfall?.year).toBe(5);
    cents(r.levelContribution, 76_097.405469);
    expect(r.levelBindingYear).toBe(5);
  });
});
