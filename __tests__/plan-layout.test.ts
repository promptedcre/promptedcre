import { describe, expect, it } from "vitest";
import { isAgentStep, nearestPredecessors } from "@/lib/compute/metrics";
import { planLayout, planStats, type PlanLayout } from "@/lib/compute/plan-layout";
import { allVariants, applicableSteps, DEFAULT_VARIANT, isResearched, type Variant } from "@/lib/compute/variant";
import { getCorpus } from "@/lib/content/load";
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

function book(steps: Step[], over: Partial<Playbook> = {}): Playbook {
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
    ...over,
  };
}

const v = (structure: Variant["structure"]): Variant => ({ ...DEFAULT_VARIANT, structure });

// Each stage as two lists of step ids: [agent lane, person lane].
const lanes = (layout: PlanLayout) => layout.stages.map((s) => [s.agent.map((n) => n.id), s.person.map((n) => n.id)]);

const EMPTY = { stages: [], nodes: [] };

// The invariants every layout must hold.
function checkLayout(pb: Playbook, variant: Variant): void {
  const layout = planLayout(pb, variant);
  const steps = applicableSteps(pb, variant);

  // every applicable step exactly once, numbered in variant order
  expect(layout.nodes.map((n) => n.id)).toEqual(steps.map((s) => s.id));
  expect(layout.nodes.map((n) => n.n)).toEqual(steps.map((_, i) => i + 1));

  // the stages hold every node once, numbered 1..k with none empty, each lane in step order
  expect(layout.stages.map((s) => s.n)).toEqual(layout.stages.map((_, i) => i + 1));
  const placed = layout.stages.flatMap((s) => [...s.agent, ...s.person]);
  expect(placed.map((n) => n.id).sort()).toEqual(steps.map((s) => s.id).sort());
  for (const s of layout.stages) {
    expect(s.agent.length + s.person.length).toBeGreaterThan(0);
    for (const lane of [s.agent, s.person]) {
      expect(lane.map((n) => n.n)).toEqual(lane.map((n) => n.n).slice().sort((a, b) => a - b));
      for (const n of lane) expect(n.stage).toBe(s.n);
    }
    for (const n of s.agent) expect(n.side).toBe("agent");
    for (const n of s.person) expect(n.side).toBe("person");
  }

  // the lane is who does the step
  const byId = new Map(steps.map((s) => [s.id, s]));
  for (const n of layout.nodes) expect(n.side).toBe(isAgentStep(byId.get(n.id)!) ? "agent" : "person");

  // waitsOn is exactly the nearest predecessors, by number
  const number = new Map(layout.nodes.map((n) => [n.id, n.n]));
  for (const n of layout.nodes) {
    const expected = nearestPredecessors(pb, byId.get(n.id)!, variant).map((p) => number.get(p)!);
    expect(n.waitsOn).toEqual(expected.sort((a, b) => a - b));
  }

  // a stage is one past the furthest step it waits on, so nothing waits on its own stage
  const stageOf = new Map(layout.nodes.map((n) => [n.n, n.stage]));
  for (const n of layout.nodes) {
    const ins = n.waitsOn.map((w) => stageOf.get(w)!);
    expect(n.stage).toBe(ins.length ? Math.max(...ins) + 1 : 1);
    for (const s of ins) expect(n.stage).toBeGreaterThan(s);
  }

  // deterministic
  expect(planLayout(pb, variant)).toEqual(layout);
}

describe("plan layout on the corpus", () => {
  const { playbooks } = getCorpus();
  const cases = playbooks.flatMap((pb) =>
    allVariants()
      .filter((variant) => variant.propertyType === DEFAULT_VARIANT.propertyType && isResearched(pb, variant))
      .map((variant) => ({ pb, variant })),
  );

  it("has written records to lay out", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [`${c.pb.id} / ${c.variant.structure}`, c] as const))("%s", (_, c) => {
    checkLayout(c.pb, c.variant);
  });

  it("gives no nodes where the playbook is not researched", () => {
    for (const pb of playbooks) {
      for (const variant of allVariants()) {
        if (isResearched(pb, variant)) continue;
        expect(planLayout(pb, variant)).toEqual(EMPTY);
      }
    }
  });
});

describe("plan layout on synthetic playbooks", () => {
  it("lays a chain out one stage per step", () => {
    const pb = book([step("a"), step("b", { after: ["a"] }), step("c", { after: ["b"] })]);
    const layout = planLayout(pb, v("syndication"));
    expect(lanes(layout)).toEqual([
      [["a"], []],
      [["b"], []],
      [["c"], []],
    ]);
    expect(layout.nodes.map((n) => n.waitsOn)).toEqual([[], [1], [2]]);
    expect(planStats(layout)).toEqual({ longestChain: 3, widest: 1 });
    checkLayout(pb, v("syndication"));
  });

  it("puts side-by-side work in one stage, a person's step in the person's lane", () => {
    const pb = book([
      step("a"),
      step("b", { after: ["a"] }),
      step("c", { after: ["a"], mode: "human-online", actor: "principal", approval: "signature" }),
      step("d", { after: ["b", "c", "a"] }),
    ]);
    const layout = planLayout(pb, v("syndication"));
    expect(lanes(layout)).toEqual([
      [["a"], []],
      [["b"], ["c"]],
      [["d"], []],
    ]);
    // a > d is implied through b and c, so d waits on b and c only
    expect(layout.nodes.map((n) => n.waitsOn)).toEqual([[], [1], [1], [2, 3]]);
    const c = layout.nodes.find((n) => n.id === "c");
    expect(c?.side).toBe("person");
    expect(c?.actor).toBe("principal");
    expect(c?.gates).toEqual({ signature: true, irreversible: false, hardToUndo: false });
    expect(planStats(layout)).toEqual({ longestChain: 3, widest: 2 });
    checkLayout(pb, v("syndication"));
  });

  it("starts independent chains together and keeps each lane in step order", () => {
    // authored interleaved; a person's chain beside the agent's
    const pb = book([
      step("x1", { mode: "human-offline" }),
      step("a1"),
      step("a2", { after: ["a1"] }),
      step("x2", { after: ["x1"], mode: "human-online" }),
      step("a3", { after: ["a2"] }),
      step("x3", { after: ["x2"], mode: "agent-browser" }),
    ]);
    const layout = planLayout(pb, v("syndication"));
    expect(lanes(layout)).toEqual([
      [["a1"], ["x1"]],
      [["a2"], ["x2"]],
      [["a3", "x3"], []],
    ]);
    expect(planStats(layout)).toEqual({ longestChain: 3, widest: 2 });
    checkLayout(pb, v("syndication"));
  });

  it("drops steps outside the variant and bridges what waits on them", () => {
    const pb = book([step("a"), step("f", { after: ["a"], when: { structure: ["fund"] } }), step("b", { after: ["f"] })]);
    const layout = planLayout(pb, v("syndication"));
    expect(layout.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(layout.nodes[1]?.waitsOn).toEqual([1]);
    expect(planLayout(pb, v("fund")).stages).toHaveLength(3);
  });

  it("is empty for an outline or an unwritten structure", () => {
    expect(planLayout(book([step("a")], { depth: "outline" }), v("syndication")).nodes).toEqual([]);
    const pb = book([step("a")], { written: { structure: ["fund"], jurisdiction: ["us-federal", "us-tx"] } });
    expect(planLayout(pb, v("syndication"))).toEqual(EMPTY);
    expect(planStats(planLayout(pb, v("syndication")))).toEqual({ longestChain: 0, widest: 0 });
  });
});
