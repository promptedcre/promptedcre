import { SCENARIO_RISK_EXAMPLE, runScenarioRisk, type OptionStats, type ScenarioRiskInput, type ScenarioRiskResult } from "@/lib/calculators/scenario-risk";
import { num, pct } from "@/lib/calculators/trace";
import { count } from "./format";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

const cvText = (o: OptionStats) => (o.cv === null ? "not defined" : num(o.cv, 2));

export function scenarioRiskHeadline(r: ScenarioRiskResult): string {
  const [a, b] = r.options;
  const c = r.comparison;
  if (!a) return "No option to weigh.";
  if (!b || !c) return `${a.name} expects ${pct(a.expected)}, with a standard deviation of ${pct(a.sd)}.`;
  if (c.dominant !== null) {
    const [w, l] = c.dominant === "a" ? [a, b] : [b, a];
    if (c.higherExpected === "tie") return `${w.name} expects the same ${pct(w.expected)} as ${l.name} with less spread: it dominates.`;
    return `${w.name} expects ${pct(w.expected)} against ${pct(l.expected)} with no more spread: it dominates.`;
  }
  if (c.higherExpected === "tie") return `Both options expect ${pct(a.expected)} with the same spread.`;
  const [h, o] = c.higherExpected === "a" ? [a, b] : [b, a];
  const lead = `${h.name} expects ${pct(h.expected)} against ${pct(o.expected)}`;
  if (c.lowerCv === null) return `${lead}; risk per unit of return is not defined while an expected return is zero or less.`;
  if (c.lowerCv === "tie") return `${lead}, at the same risk per unit of return.`;
  if (c.lowerCv === h.key) return `${lead}, with more spread but less risk per unit of return.`;
  return `${lead}, but ${o.name} carries less risk per unit of return.`;
}

export function scenarioRiskFigures(d: ScenarioRiskInput, r: ScenarioRiskResult): { lead: Headline; rest: Headline[] } {
  const [a, b] = r.options;
  const c = r.comparison;
  if (!a) return { lead: { label: "Expected return", value: "none" }, rest: [] };
  if (!b || !c) {
    return {
      lead: { label: "Expected return", value: pct(a.expected), sub: `${a.name} · ${count(a.scenarios.length, "scenario")}` },
      rest: [
        { label: "Standard deviation", value: pct(a.sd), sub: `one either side: ${pct(a.bandLow)} to ${pct(a.bandHigh)}` },
        { label: "Coefficient of variation", value: cvText(a), sub: "standard deviation ÷ expected return" },
        { label: "Range", value: `${pct(a.low)} to ${pct(a.high)}`, sub: "lowest to highest scenario" },
        d.threshold === null || a.belowThreshold === null
          ? { label: "Chance below a threshold", value: "not set", sub: "no threshold given" }
          : { label: `Chance below ${pct(d.threshold)}`, value: pct(a.belowThreshold), sub: "summed probability" },
      ],
    };
  }
  const nameOf = (k: "a" | "b") => (k === "a" ? a.name : b.name);
  const [h, o] = c.higherExpected === "b" ? [b, a] : [a, b];
  return {
    lead:
      c.higherExpected === "tie"
        ? { label: "Expected return, both options", value: pct(a.expected), sub: "a tie" }
        : { label: "Higher expected return", value: pct(h.expected), sub: `${h.name} · ${o.name} ${pct(o.expected)}` },
    rest: [
      {
        label: "Lower risk per unit of return",
        value: c.lowerCv === null ? "Not defined" : c.lowerCv === "tie" ? "Tie" : nameOf(c.lowerCv),
        sub: `coefficient of variation ${cvText(a)} against ${cvText(b)}`,
      },
      {
        label: "Dominates",
        value: c.dominant === null ? "Neither" : nameOf(c.dominant),
        sub: "as high a return, no more spread",
      },
      { label: `Standard deviation, ${a.name}`, value: pct(a.sd), sub: `range ${pct(a.low)} to ${pct(a.high)}` },
      { label: `Standard deviation, ${b.name}`, value: pct(b.sd), sub: `range ${pct(b.low)} to ${pct(b.high)}` },
    ],
  };
}

const ex = SCENARIO_RISK_EXAMPLE;

export const scenarioRiskInfo: ModuleInfo = {
  meta: {
    purpose: "Weigh a deal's scenarios by how likely you think each is, and see the expected return, its spread and which of two options pays better for the risk.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example is pinned to values computed independently in Python with the decimal module: each option's probability sum, expected return, variance (checked both as the weighted squared deviations and as the mean square less the squared mean), standard deviation, coefficient of variation, range, one-sigma band and chance below the threshold, and the comparison.",
      "The tests pin that the weighted returns sum to the expected return, the weighted squared deviations sum to the variance, the expected return lies inside the range, adding a constant to every return moves the expected return by it and leaves the variance alone, and scaling every return scales the deviation and leaves the coefficient of variation alone.",
      "Closed forms are pinned: two scenarios at even odds give a standard deviation of half the gap, and two at any odds a variance of p(1 − p) times the gap squared.",
      "Edge cases are pinned: one scenario (zero spread), an expected return of zero or less, including one that is zero only on paper (coefficient not defined), a zero-probability scenario (in the range, no weight), a return exactly at the threshold (not below it), ties and dominance; probabilities that do not sum to 100%, two options with one name and bad fields are refused with a plain message.",
    ],
    tests: ["__tests__/calc-scenario-risk.test.ts"],
  },
  exampleLine: ex.optionB
    ? `${ex.optionA.name} (${count(ex.optionA.scenarios.length, "scenario")}) against ${ex.optionB.name} (${count(ex.optionB.scenarios.length, "scenario")}); a ${pct(ex.threshold ?? 0, 0)} threshold`
    : `${ex.optionA.name}, ${count(ex.optionA.scenarios.length, "scenario")}`,
  headline: () => scenarioRiskHeadline(runScenarioRisk(SCENARIO_RISK_EXAMPLE)),
  preview: () => {
    const f = scenarioRiskFigures(SCENARIO_RISK_EXAMPLE, runScenarioRisk(SCENARIO_RISK_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
