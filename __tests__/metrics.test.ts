import { describe, expect, it } from "vitest";
import { formatHours, formatMinutes } from "@/lib/compute/duration";
import { computeMetrics, isAgentStep } from "@/lib/compute/metrics";
import { agentShareByStructure } from "@/lib/compute/summary";
import { applicableSteps, DEFAULT_VARIANT, type Variant } from "@/lib/compute/variant";
import { loadCorpus } from "@/lib/content/load";
import type { Playbook, Step } from "@/lib/schemas/playbook";

function step(id: string, over: Partial<Step> = {}): Step {
  return {
    id,
    title: `Step ${id}`,
    instruction: "An instruction long enough for the schema.",
    mode: "agent",
    modeBasis: "Synthetic test step.",
    risk: "low",
    undo: "reversible",
    approval: "none",
    effort: null,
    elapsed: null,
    after: [],
    rules: [],
    calculators: [],
    consumes: [],
    produces: [],
    basis: "practitioner",
    sources: [],
    ...over,
  };
}

function book(steps: Step[]): Playbook {
  return {
    id: "synthetic",
    slug: "synthetic",
    kind: "process",
    title: "Synthetic",
    summary: "A synthetic playbook for tests.",
    phase: "raise",
    order: 1,
    featured: false,
    depth: "full",
    review: "ai-drafted",
    lastVerified: "2026-11-11",
    requires: [],
    consumes: [],
    produces: [],
    written: { structure: ["syndication", "fund", "jv"], jurisdiction: ["us-federal", "us-tx"] },
    sources: [],
    steps,
    outlineSteps: [],
  };
}

const v = (structure: Variant["structure"]): Variant => ({ ...DEFAULT_VARIANT, structure });

describe("agentic percentage", () => {
  it("counts agent and agent-browser steps over applicable steps", () => {
    const pb = book([
      step("a"),
      step("b", { mode: "agent-browser" }),
      step("c", { mode: "human-online", actor: "principal" }),
      step("d", { mode: "human-offline", actor: "principal", when: { structure: ["fund"] } }),
    ]);
    expect(computeMetrics(pb, v("syndication")).agenticPct).toBe(67); // 2 of 3
    expect(computeMetrics(pb, v("fund")).agenticPct).toBe(50); // 2 of 4
  });

  it("is null when the structure was not researched or the playbook is an outline", () => {
    const pb = book([step("a")]);
    pb.written.structure = ["syndication"];
    expect(computeMetrics(pb, v("fund")).agenticPct).toBeNull();
    expect(computeMetrics({ ...pb, depth: "outline" }, v("syndication")).agenticPct).toBeNull();
  });
});

describe("the home page's agent share", () => {
  it("adds agent steps over applicable steps across records, per structure", () => {
    const first = book([step("a"), step("b", { mode: "human-online", actor: "principal" })]);
    const second = {
      ...book([step("c"), step("d"), step("e", { mode: "human-offline", actor: "principal", when: { structure: ["fund"] } })]),
      id: "second",
      slug: "second",
    };
    const share = agentShareByStructure([first, second]);
    expect(share.syndication).toEqual({ agent: 3, total: 4, pct: 75 });
    expect(share.fund).toEqual({ agent: 3, total: 5, pct: 60 });
  });

  it("counts nothing from an outline, and is null when nothing is written", () => {
    const written = book([step("a")]);
    const outline: Playbook = { ...book([]), id: "outline", slug: "outline", depth: "outline" };
    expect(agentShareByStructure([written, outline]).syndication).toEqual({ agent: 1, total: 1, pct: 100 });
    expect(agentShareByStructure([outline]).syndication.pct).toBeNull();
  });
});

describe("time totals", () => {
  it("sums hands-on effort and follows the dependency chain for calendar time", () => {
    const pb = book([
      step("a", { effort: { min: 1, max: 2, unit: "hours", basis: "practitioner" }, elapsed: { min: 1, max: 2, unit: "days", basis: "practitioner" } }),
      step("b", { after: ["a"], elapsed: { min: 3, max: 3, unit: "days", basis: "practitioner" } }),
      step("c", { after: ["a"], elapsed: { min: 1, max: 1, unit: "days", basis: "practitioner" } }),
      step("d", { after: ["b", "c"], effort: { min: 30, max: 30, unit: "minutes", basis: "practitioner" } }),
    ]);
    const m = computeMetrics(pb, v("syndication"));
    expect(m.effortMinutes).toMatchObject({ known: 2, total: 4, min: 90, max: 150, complete: false });
    // a (1-2 d) then the longer branch b (3 d); d adds no calendar time
    expect(m.elapsedHours.min).toBe(4 * 24);
    expect(m.elapsedHours.max).toBe(5 * 24);
    expect(m.elapsedHours.known).toBe(3);
  });

  it("passes a skipped step's predecessors through to the next step", () => {
    const pb = book([
      step("a", { elapsed: { min: 2, max: 2, unit: "days", basis: "practitioner" } }),
      step("fund-only", { after: ["a"], when: { structure: ["fund"] }, elapsed: { min: 5, max: 5, unit: "days", basis: "practitioner" } }),
      step("c", { after: ["fund-only"], elapsed: { min: 1, max: 1, unit: "days", basis: "practitioner" } }),
    ]);
    expect(computeMetrics(pb, v("syndication")).elapsedHours.max).toBe(3 * 24);
    expect(computeMetrics(pb, v("fund")).elapsedHours.max).toBe(8 * 24);
  });

  it("counts a business day as 1.4 calendar days", () => {
    const pb = book([step("a", { elapsed: { min: 2, max: 2, unit: "business-days", basis: "practitioner" } })]);
    expect(computeMetrics(pb, v("syndication")).elapsedHours.max).toBeCloseTo(2 * 24 * 1.4);
  });

  it("formats totals for display", () => {
    expect(formatMinutes(300, 300)).toBe("5 h");
    expect(formatMinutes(20, 45)).toBe("20–45 min");
    expect(formatHours(67.2, 67.2)).toBe("2.8 d");
  });
});

describe("the pilot playbook", () => {
  it("computes a percentage for every researched structure from its own steps", () => {
    const { corpus } = loadCorpus();
    const pilot = corpus.playbooks.find((p) => p.depth === "full");
    if (!pilot) throw new Error("no full playbook");
    for (const structure of pilot.written.structure) {
      const variant = v(structure);
      const steps = applicableSteps(pilot, variant);
      const expected = Math.round((100 * steps.filter(isAgentStep).length) / steps.length);
      expect(computeMetrics(pilot, variant).agenticPct).toBe(expected);
    }
  });
});
