import { describe, expect, it } from "vitest";
import { scenarioRiskFigures, scenarioRiskHeadline } from "@/components/calc/scenario-risk-info";
import { SCENARIO_RISK_EXAMPLE, scenarioRiskInput, runScenarioRisk, type ScenarioRiskInput } from "@/lib/calculators/scenario-risk";

// The worked example's values were computed independently in Python on
// 2026-11-13 (decimal module at 40 digits; the variance both as the weighted
// squared deviations and as the mean square less the squared mean, the
// standard deviation by Decimal.sqrt), not by porting this module. Returns
// and ratios are compared to 1e-12, variances to 1e-15.

type Opt = ScenarioRiskInput["optionA"];
const opt = (name: string, rows: Array<[number, number]>): Opt => ({
  name,
  scenarios: rows.map(([probability, ret], i) => ({ label: `Case ${i + 1}`, probability, return: ret })),
});
const one = (o: Opt, threshold: number | null = null) => runScenarioRisk({ optionA: o, optionB: null, threshold });
const two = (a: Opt, b: Opt, threshold: number | null = null) => runScenarioRisk({ optionA: a, optionB: b, threshold });

// Every issue's path and message, for a plain-words check.
function rejects(input: unknown): { path: string; message: string }[] {
  const p = scenarioRiskInput.safeParse(input);
  expect(p.success).toBe(false);
  return (p.error?.issues ?? []).map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

describe("scenario risk worked example (Python, 2026-11-13)", () => {
  const r = runScenarioRisk(SCENARIO_RISK_EXAMPLE);
  const [a, b] = r.options;

  it("weighs the first option's three scenarios", () => {
    expect(a?.probabilitySum).toBeCloseTo(1, 12);
    expect(a?.expected).toBeCloseTo(0.078, 12);
    expect(a?.variance).toBeCloseTo(0.000256, 15);
    expect(a?.sd).toBeCloseTo(0.016, 12);
    expect(a?.cv).toBeCloseTo(0.20512820512820512821, 12);
    expect(a?.low).toBe(0.05);
    expect(a?.high).toBe(0.1);
    expect(a?.bandLow).toBeCloseTo(0.062, 12);
    expect(a?.bandHigh).toBeCloseTo(0.094, 12);
    expect(a?.belowThreshold).toBeCloseTo(0.2, 12);
    expect(a?.scenarios.map((s) => s.weightedSquaredDeviation)).toEqual([0.0001568, 0.0000024, 0.0000968].map((x) => expect.closeTo(x, 15)));
  });

  it("weighs the second option's four scenarios", () => {
    expect(b?.probabilitySum).toBeCloseTo(1, 12);
    expect(b?.expected).toBeCloseTo(0.09, 12);
    expect(b?.variance).toBeCloseTo(0.00558, 15);
    expect(b?.sd).toBeCloseTo(0.074699397587932394249, 12);
    expect(b?.cv).toBeCloseTo(0.82999330653258215832, 12);
    expect(b?.low).toBe(-0.06);
    expect(b?.high).toBe(0.18);
    expect(b?.bandLow).toBeCloseTo(0.015300602412067605751, 12);
    expect(b?.bandHigh).toBeCloseTo(0.16469939758793239425, 12);
    expect(b?.belowThreshold).toBeCloseTo(0.4, 12);
    expect(b?.scenarios.map((s) => s.weightedSquaredDeviation)).toEqual([0.003375, 0.000225, 0.00036, 0.00162].map((x) => expect.closeTo(x, 15)));
    expect(b?.scenarios.map((s) => s.belowThreshold)).toEqual([true, true, false, false]);
  });

  it("compares them: the second expects more, the first carries less risk per unit, neither dominates", () => {
    expect(r.comparison).toMatchObject({ higherExpected: "b", lowerCv: "a", dominant: null });
    expect(r.comparison?.expectedGap).toBeCloseTo(0.012, 12);
    expect(r.comparison?.sdGap).toBeCloseTo(0.074699397587932394249 - 0.016, 12);
    expect(scenarioRiskHeadline(r)).toBe("Value-add building expects 9.00% against 7.80%, but Stabilized building carries less risk per unit of return.");
    expect(r.trace.at(-1)).toMatchObject({ label: "Dominance", value: "neither" });
    expect(r.notes).toEqual([]);
  });

  it("shows on the page the figures the function computed", () => {
    const f = scenarioRiskFigures(SCENARIO_RISK_EXAMPLE, r);
    expect(f.lead).toMatchObject({ label: "Higher expected return", value: "9.00%" });
    expect(f.rest.map((h) => h.value)).toEqual(["Stabilized building", "Neither", "1.60%", "7.47%"]);
    const trace = Object.fromEntries(r.trace.map((l) => [l.label, l.value]));
    expect(trace["Stabilized building: variance"]).toBe("0.000256");
    expect(trace["Value-add building: coefficient of variation"]).toBe("0.8300");
    expect(trace["Value-add building: one-sigma band"]).toBe("1.53% to 16.47%");
    expect(trace["Value-add building: chance below 7.00%"]).toBe("40.00%");
  });
});

describe("invariants", () => {
  const r = runScenarioRisk(SCENARIO_RISK_EXAMPLE);

  it("the weighted returns sum to the expected return and the weighted squared deviations to the variance", () => {
    for (const o of r.options) {
      expect(o.scenarios.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1, 12);
      expect(o.scenarios.reduce((s, x) => s + x.weightedReturn, 0)).toBeCloseTo(o.expected, 15);
      expect(o.scenarios.reduce((s, x) => s + x.weightedSquaredDeviation, 0)).toBeCloseTo(o.variance, 15);
      // the variance is the mean square less the squared mean
      const meanSquare = o.scenarios.reduce((s, x) => s + x.probability * x.return * x.return, 0);
      expect(o.variance).toBeCloseTo(meanSquare - o.expected ** 2, 15);
      expect(o.low).toBeLessThanOrEqual(o.expected);
      expect(o.expected).toBeLessThanOrEqual(o.high);
    }
  });

  it("adding a constant to every return moves the expected return by it and leaves the variance alone", () => {
    const shift = (o: Opt, k: number): Opt => ({ ...o, scenarios: o.scenarios.map((s) => ({ ...s, return: s.return + k })) });
    const base = SCENARIO_RISK_EXAMPLE.optionB as Opt;
    const s = one(shift(base, 0.03)).options[0];
    const o = one(base).options[0];
    expect(s?.expected).toBeCloseTo((o?.expected ?? 0) + 0.03, 12);
    expect(s?.variance).toBeCloseTo(o?.variance ?? Number.NaN, 15);
  });

  it("scaling every return scales the standard deviation and leaves the coefficient of variation alone", () => {
    const base = SCENARIO_RISK_EXAMPLE.optionA;
    const scaled = one({ ...base, scenarios: base.scenarios.map((s) => ({ ...s, return: s.return * 2 })) }).options[0];
    const o = one(base).options[0];
    expect(scaled?.sd).toBeCloseTo(2 * (o?.sd ?? 0), 12);
    expect(scaled?.cv).toBeCloseTo(o?.cv ?? Number.NaN, 12);
  });

  it("matches the closed forms for two scenarios (Python, 2026-11-13)", () => {
    // even odds: the standard deviation is half the gap
    const even = one(opt("Even", [[0.5, 0.15], [0.5, 0.01]])).options[0];
    expect(even?.expected).toBeCloseTo(0.08, 12);
    expect(even?.sd).toBeCloseTo(0.07, 12);
    // odds p and 1 - p: the variance is p(1 - p) times the gap squared
    const skew = one(opt("Skew", [[0.3, 0.15], [0.7, 0.01]])).options[0];
    expect(skew?.variance).toBeCloseTo(0.004116, 15);
    expect(skew?.variance).toBeCloseTo(0.3 * 0.7 * 0.14 ** 2, 15);
  });
});

describe("edge cases", () => {
  it("one scenario has no spread, and its coefficient of variation is zero", () => {
    const o = one(opt("Certain", [[1, 0.06]]), 0.06).options[0];
    expect(o?.expected).toBeCloseTo(0.06, 15);
    expect(o?.variance).toBe(0);
    expect(o?.sd).toBe(0);
    expect(o?.cv).toBe(0);
    expect([o?.low, o?.high]).toEqual([0.06, 0.06]);
    expect(o?.bandLow).toBeCloseTo(0.06, 15);
    // a return exactly at the threshold is not below it
    expect(o?.belowThreshold).toBe(0);
    expect(o?.scenarios[0]?.belowThreshold).toBe(false);
  });

  it("an expected return of zero or less leaves the coefficient of variation undefined", () => {
    const zero = one(opt("Flat", [[0.5, 0.1], [0.5, -0.1]]));
    expect(zero.options[0]?.expected).toBeCloseTo(0, 15);
    expect(zero.options[0]?.cv).toBeNull();
    expect(zero.trace.find((l) => l.label === "Flat: coefficient of variation")?.value).toBe("not defined");
    expect(zero.notes[0]).toMatch(/not defined/);

    const neg = two(opt("Losing", [[1, -0.02]]), opt("Earning", [[1, 0.04]]));
    expect(neg.options[0]?.cv).toBeNull();
    expect(neg.comparison?.lowerCv).toBeNull();
    expect(neg.comparison?.higherExpected).toBe("b");
    expect(neg.comparison?.dominant).toBe("b");
  });

  // Review 2026-11-13 (math-review-a): these expected returns are zero on paper but
  // 3.5e-18 and -1.7e-18 in floating point; the first once gave a coefficient of
  // variation of 1.3e16 and the second printed "-0.00%".
  it("an expected return that is zero on paper is zero, so its coefficient is not defined", () => {
    for (const rows of [
      [[0.3, 0.07], [0.7, -0.03]],
      [[0.1, 0.09], [0.9, -0.01]],
    ] as Array<Array<[number, number]>>) {
      const r = one(opt("Paper zero", rows));
      expect(r.options[0]?.expected).toBe(0);
      expect(r.options[0]?.cv).toBeNull();
      expect(r.trace.find((l) => l.label === "Paper zero: expected return")?.value).toBe("0.00%");
    }
  });

  // Review 2026-11-13 (math-review-a), an input set of the reviewer's own, checked in an
  // independent Python implementation written from the scope.
  it("two options of the reviewer's own match an independent calculation", () => {
    const r = two(opt("Steady", [[0.3, 0.03], [0.45, 0.085], [0.25, 0.14]]), opt("Swing", [[0.1, -0.1], [0.5, 0.09], [0.4, 0.2]]), 0.06);
    const [a, b] = r.options;
    expect(a?.expected).toBeCloseTo(0.08225, 12);
    expect(a?.variance).toBeCloseTo(0.3 * 0.03 ** 2 + 0.45 * 0.085 ** 2 + 0.25 * 0.14 ** 2 - 0.08225 ** 2, 15);
    expect(a?.belowThreshold).toBeCloseTo(0.3, 12);
    expect(b?.expected).toBeCloseTo(0.115, 12);
    expect(b?.variance).toBeCloseTo(0.1 * 0.01 + 0.5 * 0.09 ** 2 + 0.4 * 0.04 - 0.115 ** 2, 15);
    expect(b?.belowThreshold).toBeCloseTo(0.1, 12);
    expect(r.comparison).toMatchObject({ higherExpected: "b", lowerCv: "a", dominant: null });
  });

  it("keeps a zero-probability scenario in the range with no weight", () => {
    const r = one(opt("Tail", [[0.5, 0.05], [0.5, 0.09], [0, -0.5]]));
    const o = r.options[0];
    expect(o?.expected).toBeCloseTo(0.07, 15);
    expect(o?.variance).toBeCloseTo(0.0004, 15);
    expect(o?.low).toBe(-0.5);
    expect(r.notes.some((n) => /zero probability/.test(n))).toBe(true);
  });

  it("skips the threshold when none is given", () => {
    const r = one(SCENARIO_RISK_EXAMPLE.optionA);
    expect(r.options[0]?.belowThreshold).toBeNull();
    expect(r.options[0]?.scenarios.every((s) => s.belowThreshold === null)).toBe(true);
    expect(r.trace.some((l) => /chance below/.test(l.label))).toBe(false);
    expect(r.comparison).toBeNull();
    expect(scenarioRiskHeadline(r)).toBe("Stabilized building expects 7.80%, with a standard deviation of 1.60%.");
  });

  it("calls a tie a tie, and names the option that dominates", () => {
    const rows: Array<[number, number]> = [[0.4, 0.03], [0.6, 0.11]];
    const tie = two(opt("Left", rows), opt("Right", rows));
    expect(tie.comparison).toMatchObject({ higherExpected: "tie", lowerCv: "tie", dominant: null });
    expect(scenarioRiskHeadline(tie)).toMatch(/^Both options expect/);

    // the same spread, two points higher: the second dominates
    const higher = two(opt("Left", rows), opt("Right", [[0.4, 0.05], [0.6, 0.13]]));
    expect(higher.comparison).toMatchObject({ higherExpected: "b", lowerCv: "b", dominant: "b" });

    // the same expected return, less spread: the first dominates
    const tighter = two(opt("Left", [[1, 0.078]]), SCENARIO_RISK_EXAMPLE.optionA);
    expect(tighter.comparison).toMatchObject({ higherExpected: "tie", lowerCv: "a", dominant: "a" });
    expect(scenarioRiskHeadline(tighter)).toMatch(/^Left expects the same 7\.80% as Stabilized building with less spread/);
  });

  it("accepts probabilities that sum to one within 0.000001, used as given", () => {
    expect(scenarioRiskInput.safeParse({ optionA: opt("Near", [[0.5, 0.1], [0.4999995, 0.02]]), optionB: null, threshold: null }).success).toBe(true);
    expect(scenarioRiskInput.safeParse({ optionA: opt("Near", [[0.5, 0.1], [0.5000005, 0.02]]), optionB: null, threshold: null }).success).toBe(true);
    const r = one(opt("Near", [[0.5, 0.1], [0.4999995, 0.02]]));
    expect(r.options[0]?.expected).toBeCloseTo(0.5 * 0.1 + 0.4999995 * 0.02, 15);
  });
});

describe("bad input is refused in plain words", () => {
  const base = SCENARIO_RISK_EXAMPLE;

  it("refuses probabilities that do not sum to 100%, quoting the sum", () => {
    const off = rejects({ ...base, optionA: opt("Short", [[0.2, 0.05], [0.6, 0.08], [0.15, 0.1]]) });
    expect(off).toEqual([{ path: "optionA.scenarios", message: "the probabilities for Short sum to 95%; they must sum to 100%" }]);
    const over = rejects({ ...base, optionB: opt("Over", [[0.5, 0.05], [0.50001, 0.08]]) });
    expect(over[0]?.path).toBe("optionB.scenarios");
    expect(over[0]?.message).toMatch(/sum to 100\.001%/);
  });

  it("refuses two options with one name", () => {
    expect(rejects({ ...base, optionB: { ...base.optionB, name: "stabilized building" } })).toEqual([
      { path: "optionB.name", message: "give the second option a different name from the first, so the comparison can say which is which" },
    ]);
  });

  it("refuses fields out of bounds, missing scenarios and fields it does not know", () => {
    const paths = (input: unknown) => rejects(input).map((i) => i.path);
    expect(paths({ ...base, optionA: opt("Bad", [[1.2, 0.05]]) })).toContain("optionA.scenarios.0.probability");
    expect(paths({ ...base, optionA: opt("Bad", [[-0.1, 0.05], [1.1, 0.05]]) })).toContain("optionA.scenarios.0.probability");
    expect(paths({ ...base, optionA: opt("Bad", [[1, -1.5]]) })).toContain("optionA.scenarios.0.return");
    expect(paths({ ...base, optionA: opt("Bad", [[1, Number.NaN]]) })).toContain("optionA.scenarios.0.return");
    expect(paths({ ...base, optionA: { name: "Empty", scenarios: [] } })).toContain("optionA.scenarios");
    expect(paths({ ...base, optionA: opt("Many", Array.from({ length: 11 }, () => [1 / 11, 0.05] as [number, number])) })).toContain("optionA.scenarios");
    expect(paths({ ...base, optionA: { ...base.optionA, name: "  " } })).toContain("optionA.name");
    expect(paths({ ...base, threshold: 6 })).toContain("threshold");
    expect(paths({ ...base, optionA: { name: "No list" } })).toContain("optionA.scenarios");
    expect(paths({ ...base, extra: 1 }).length).toBeGreaterThan(0);
    expect(paths({}).length).toBeGreaterThan(0);
    expect(() => runScenarioRisk({ ...base, threshold: Number.NaN })).toThrow();
  });
});
