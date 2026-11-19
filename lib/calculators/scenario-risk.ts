import { z } from "zod";
import { defineModule } from "./module";
import { num, pct, type TraceLine } from "./trace";

// Probability-weighted scenarios for one option, or two side by side: the
// expected return, the variance and standard deviation around it (population,
// weights as given), the coefficient of variation, the range, the one-sigma
// band and the chance of landing below a threshold. Returns and probabilities
// are decimals; a return is a year's. Nothing here is a default scenario set.

// How far the probabilities may sum from one before the input is refused.
export const PROBABILITY_TOLERANCE = 1e-6;
// Two figures closer than this count as equal when the options are compared, and an
// expected return this close to zero is zero: 0.3 × 0.07 + 0.7 × −0.03 is 3.5e-18 in
// floating point, which read raw would give a coefficient of variation in the quadrillions.
export const TIE_TOLERANCE = 1e-12;

const scenario = z
  .object({
    label: z.string().trim().min(1).max(60).describe("a short name for the scenario, e.g. 'Base case'"),
    probability: z
      .number()
      .min(0)
      .max(1)
      .describe("the chance this scenario happens, as a decimal from 0 to 1: 0.25 is 25%; an option's probabilities sum to 1"),
    return: z
      .number()
      .min(-1)
      .max(5)
      .describe("the return in this scenario, as a decimal a year: 0.08 is 8%; may be negative, down to -1 (all of it lost)"),
  })
  .strict();

// "100%" or "99.9995%": a sum written so that a near miss shows.
function sumText(s: number): string {
  return `${Number((s * 100).toFixed(4))}%`;
}

const option = z
  .object({
    name: z.string().trim().min(1).max(60).describe("a short name for the option, e.g. 'Stabilized building'"),
    scenarios: z
      .array(scenario)
      .min(1)
      .max(10)
      .describe("one to ten scenarios, each with a probability and a return; the probabilities must sum to 1, within 0.000001"),
  })
  .strict()
  .superRefine((o, ctx) => {
    const list = Array.isArray(o.scenarios) ? o.scenarios : [];
    const sum = list.reduce((s, x) => s + (typeof x?.probability === "number" ? x.probability : Number.NaN), 0);
    if (list.length > 0 && Number.isFinite(sum) && Math.abs(sum - 1) > PROBABILITY_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["scenarios"],
        message: `the probabilities${o.name ? ` for ${o.name}` : ""} sum to ${sumText(sum)}; they must sum to 100%`,
      });
    }
  });

export const scenarioRiskInput = z
  .object({
    optionA: option.describe("the first option, or the only one: its name and scenarios"),
    optionB: option.nullable().describe("a second option to compare with the first; null to look at one option alone"),
    threshold: z
      .number()
      .min(-1)
      .max(5)
      .nullable()
      .describe("a return to test against, as a decimal a year: 0.07 is 7%; the result gives the chance of landing strictly below it; null skips it"),
  })
  .strict()
  .superRefine((d, ctx) => {
    const a = d.optionA?.name;
    const b = d.optionB?.name;
    if (typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase()) {
      ctx.addIssue({
        code: "custom",
        path: ["optionB", "name"],
        message: "give the second option a different name from the first, so the comparison can say which is which",
      });
    }
  });

export type ScenarioRiskInput = z.infer<typeof scenarioRiskInput>;
type OptionInput = ScenarioRiskInput["optionA"];

export type ScenarioRow = {
  label: string;
  probability: number;
  return: number;
  weightedReturn: number; // probability × return; these sum to the expected return
  deviation: number; // return less the expected return
  weightedSquaredDeviation: number; // probability × deviation²; these sum to the variance
  belowThreshold: boolean | null; // null when no threshold was given
};

export type OptionStats = {
  key: "a" | "b";
  name: string;
  scenarios: ScenarioRow[];
  probabilitySum: number;
  expected: number;
  variance: number; // population variance, in decimal return squared
  sd: number;
  cv: number | null; // SD ÷ expected return; null when the expected return is zero or less
  low: number; // lowest return of any scenario, zero-probability ones included
  high: number;
  bandLow: number; // expected return less one SD
  bandHigh: number; // expected return plus one SD
  belowThreshold: number | null; // summed probability of returns strictly below the threshold; null with no threshold
};

export type Pick = "a" | "b" | "tie";

export type Comparison = {
  higherExpected: Pick;
  lowerCv: Pick | null; // null when either coefficient of variation is not defined
  // the option whose expected return is at least the other's and whose SD is at
  // most the other's, one of the two strictly; null when neither is
  dominant: "a" | "b" | null;
  expectedGap: number; // B's expected return less A's
  sdGap: number; // B's SD less A's
};

export type ScenarioRiskResult = {
  options: OptionStats[]; // A, then B when given
  threshold: number | null;
  comparison: Comparison | null; // null with one option
  notes: string[];
  trace: TraceLine[];
};

// A probability as typed, trimmed: 0.2 is "0.2", 0.125 is "0.125".
function prob(p: number): string {
  return String(Number(p.toFixed(6)));
}

function stats(key: "a" | "b", o: OptionInput, threshold: number | null): OptionStats {
  const probabilitySum = o.scenarios.reduce((s, x) => s + x.probability, 0);
  const weighted = o.scenarios.reduce((s, x) => s + x.probability * x.return, 0);
  const expected = Math.abs(weighted) <= TIE_TOLERANCE ? 0 : weighted;
  const scenarios: ScenarioRow[] = o.scenarios.map((x) => {
    const deviation = x.return - expected;
    return {
      label: x.label,
      probability: x.probability,
      return: x.return,
      weightedReturn: x.probability * x.return,
      deviation,
      weightedSquaredDeviation: x.probability * deviation * deviation,
      belowThreshold: threshold === null ? null : x.return < threshold,
    };
  });
  const variance = scenarios.reduce((s, x) => s + x.weightedSquaredDeviation, 0);
  const sd = Math.sqrt(variance);
  const returns = o.scenarios.map((x) => x.return);
  return {
    key,
    name: o.name,
    scenarios,
    probabilitySum,
    expected,
    variance,
    sd,
    cv: expected > 0 ? sd / expected : null,
    low: Math.min(...returns),
    high: Math.max(...returns),
    bandLow: expected - sd,
    bandHigh: expected + sd,
    belowThreshold: threshold === null ? null : scenarios.reduce((s, x) => s + (x.belowThreshold ? x.probability : 0), 0),
  };
}

function pick(a: number, b: number, higher: boolean): Pick {
  if (Math.abs(a - b) <= TIE_TOLERANCE) return "tie";
  return (higher ? a > b : a < b) ? "a" : "b";
}

function compare(a: OptionStats, b: OptionStats): Comparison {
  const higherExpected = pick(a.expected, b.expected, true);
  const lowerCv = a.cv === null || b.cv === null ? null : pick(a.cv, b.cv, false);
  const lowerSd = pick(a.sd, b.sd, false);
  let dominant: "a" | "b" | null = null;
  for (const k of ["a", "b"] as const) {
    const atLeastAsHigh = higherExpected === k || higherExpected === "tie";
    const atMostAsWide = lowerSd === k || lowerSd === "tie";
    const strictlyBetter = higherExpected === k || lowerSd === k;
    if (atLeastAsHigh && atMostAsWide && strictlyBetter) dominant = k;
  }
  return { higherExpected, lowerCv, dominant, expectedGap: b.expected - a.expected, sdGap: b.sd - a.sd };
}

export function runScenarioRisk(raw: ScenarioRiskInput): ScenarioRiskResult {
  const d = scenarioRiskInput.parse(raw);
  const trace: TraceLine[] = [];
  const notes: string[] = [];
  const options = [stats("a", d.optionA, d.threshold), ...(d.optionB ? [stats("b", d.optionB, d.threshold)] : [])];

  for (const o of options) {
    const s = o.scenarios;
    trace.push({ label: `${o.name}: probabilities`, formula: s.map((x) => prob(x.probability)).join(" + "), value: sumText(o.probabilitySum) });
    trace.push({
      label: `${o.name}: expected return`,
      formula: `sum of probability × return: ${s.map((x) => `${prob(x.probability)} × ${pct(x.return)}`).join(" + ")}`,
      value: pct(o.expected),
    });
    trace.push({
      label: `${o.name}: variance`,
      formula: `sum of probability × (return − ${pct(o.expected)})², in decimals: ${s.map((x) => `${prob(x.probability)} × (${num(x.deviation, 4)})²`).join(" + ")}`,
      value: num(o.variance, 6),
    });
    trace.push({ label: `${o.name}: standard deviation`, formula: `√${num(o.variance, 6)}`, value: pct(o.sd) });
    if (o.cv === null) {
      trace.push({
        label: `${o.name}: coefficient of variation`,
        formula: `standard deviation ÷ expected return; not defined, the expected return is ${pct(o.expected)}`,
        value: "not defined",
      });
      notes.push(`${o.name} expects ${pct(o.expected)}, zero or less, so its risk per unit of return (the coefficient of variation) is not defined.`);
    } else {
      trace.push({ label: `${o.name}: coefficient of variation`, formula: `${pct(o.sd)} ÷ ${pct(o.expected)}`, value: num(o.cv, 4) });
    }
    trace.push({
      label: `${o.name}: range`,
      formula: `lowest to highest return of ${s.length === 1 ? "the one scenario" : `the ${s.length} scenarios`}`,
      value: `${pct(o.low)} to ${pct(o.high)}`,
    });
    trace.push({
      label: `${o.name}: one-sigma band`,
      formula: `${pct(o.expected)} − ${pct(o.sd)} to ${pct(o.expected)} + ${pct(o.sd)}`,
      value: `${pct(o.bandLow)} to ${pct(o.bandHigh)}`,
    });
    if (d.threshold !== null && o.belowThreshold !== null) {
      const hits = s.filter((x) => x.belowThreshold);
      trace.push({
        label: `${o.name}: chance below ${pct(d.threshold)}`,
        formula:
          hits.length === 0
            ? `no scenario returns less than ${pct(d.threshold)}`
            : `sum of the probabilities of returns under ${pct(d.threshold)}: ${hits.map((x) => prob(x.probability)).join(" + ")}`,
        value: pct(o.belowThreshold),
      });
    }
    if (s.some((x) => x.probability === 0)) notes.push(`${o.name} has a scenario at zero probability: it counts in the range and carries no weight.`);
  }

  const [a, b] = options;
  let comparison: Comparison | null = null;
  if (a && b) {
    comparison = compare(a, b);
    const nameOf = (p: Pick) => (p === "tie" ? "a tie" : p === "a" ? a.name : b.name);
    trace.push({ label: "Higher expected return", formula: `${a.name} ${pct(a.expected)} against ${b.name} ${pct(b.expected)}`, value: nameOf(comparison.higherExpected) });
    trace.push(
      comparison.lowerCv === null
        ? { label: "Lower risk per unit of return", formula: "the lower coefficient of variation; not defined while either expected return is zero or less", value: "not defined" }
        : { label: "Lower risk per unit of return", formula: `the lower coefficient of variation: ${num(a.cv ?? 0, 4)} against ${num(b.cv ?? 0, 4)}`, value: nameOf(comparison.lowerCv) },
    );
    trace.push({
      label: "Dominance",
      formula: `an expected return at least the other's and a standard deviation at most the other's: ${pct(a.expected)} and ${pct(a.sd)} against ${pct(b.expected)} and ${pct(b.sd)}`,
      value: comparison.dominant === null ? "neither" : comparison.dominant === "a" ? a.name : b.name,
    });
  }

  return { options, threshold: d.threshold, comparison, notes, trace };
}

// The worked example: two made-up options with round, invented figures.
export const SCENARIO_RISK_EXAMPLE: ScenarioRiskInput = {
  optionA: {
    name: "Stabilized building",
    scenarios: [
      { label: "Downside", probability: 0.2, return: 0.05 },
      { label: "Base case", probability: 0.6, return: 0.08 },
      { label: "Upside", probability: 0.2, return: 0.1 },
    ],
  },
  optionB: {
    name: "Value-add building",
    scenarios: [
      { label: "Lease-up fails", probability: 0.15, return: -0.06 },
      { label: "Slow lease-up", probability: 0.25, return: 0.06 },
      { label: "Plan", probability: 0.4, return: 0.12 },
      { label: "Strong lease-up", probability: 0.2, return: 0.18 },
    ],
  },
  threshold: 0.07,
};

export const scenarioRiskModule = defineModule({ id: "scenario-risk", input: scenarioRiskInput, run: runScenarioRisk, example: SCENARIO_RISK_EXAMPLE });
