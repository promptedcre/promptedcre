import type { Playbook, StepMode } from "../schemas/playbook";
import { isAgentStep, nearestPredecessors } from "./metrics";
import { applicableSteps, isResearched, type Variant } from "./variant";

// The order of work: who does each step and what waits on what, as stages read top to
// bottom. A step's stage is one past the furthest step it waits on, so a step that
// waits on nothing is in stage 1 and no two steps in one stage wait on each other.
// Inside a stage the steps sit in two lanes, the agent's and a person's, each in step
// order, the way the recorded run is drawn on /run.

export type PlanSide = "agent" | "person";

export type PlanGates = {
  signature: boolean; // approval is a signature
  irreversible: boolean;
  hardToUndo: boolean;
};

export type PlanNode = {
  id: string;
  title: string;
  mode: StepMode;
  actor: string | null;
  n: number; // the step's 1-based number in this variant
  stage: number; // 1-based
  side: PlanSide;
  gates: PlanGates;
  waitsOn: number[]; // the numbers of the steps it waits on directly, ascending
};

export type PlanStage = { n: number; agent: PlanNode[]; person: PlanNode[] };

export type PlanLayout = {
  stages: PlanStage[];
  nodes: PlanNode[]; // in step order
};

export type PlanStats = {
  longestChain: number; // steps on the longest chain of prerequisites: the number of stages
  widest: number; // steps in the fullest stage
};

const EMPTY: PlanLayout = { stages: [], nodes: [] };

export function planLayout(pb: Playbook, v: Variant): PlanLayout {
  if (!isResearched(pb, v)) return EMPTY;
  const steps = applicableSteps(pb, v);
  if (steps.length === 0) return EMPTY;

  const index = new Map(steps.map((s, i) => [s.id, i]));
  const preds: number[][] = steps.map((s) =>
    nearestPredecessors(pb, s, v)
      .map((p) => index.get(p))
      .filter((i): i is number => i !== undefined)
      .sort((a, b) => a - b),
  );

  // Longest path from a step that waits on nothing. Authored order is topological
  // (validation guarantees it), so one pass in step order suffices.
  const stage: number[] = [];
  steps.forEach((_, i) => {
    stage[i] = Math.max(0, ...(preds[i] ?? []).map((p) => stage[p] ?? 0)) + 1;
  });

  const nodes: PlanNode[] = steps.map((s, i) => ({
    id: s.id,
    title: s.title,
    mode: s.mode,
    actor: s.actor ?? null,
    n: i + 1,
    stage: stage[i] ?? 1,
    side: isAgentStep(s) ? "agent" : "person",
    gates: {
      signature: s.approval === "signature",
      irreversible: s.undo === "irreversible",
      hardToUndo: s.undo === "hard-to-undo",
    },
    waitsOn: (preds[i] ?? []).map((p) => p + 1),
  }));

  const count = Math.max(...nodes.map((n) => n.stage));
  const stages: PlanStage[] = Array.from({ length: count }, (_, k) => {
    const here = nodes.filter((n) => n.stage === k + 1);
    return { n: k + 1, agent: here.filter((n) => n.side === "agent"), person: here.filter((n) => n.side === "person") };
  });
  return { stages, nodes };
}

export function planStats(layout: PlanLayout): PlanStats {
  return {
    longestChain: layout.stages.length,
    widest: Math.max(0, ...layout.stages.map((s) => s.agent.length + s.person.length)),
  };
}
