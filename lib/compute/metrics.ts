import type { Playbook, Step } from "../schemas/playbook";
import { effortMinutes, elapsedHours } from "./duration";
import { applicableSteps, applies, isResearched, type Variant } from "./variant";

export type RangeTotal = {
  known: number; // steps with an estimate
  total: number; // applicable steps
  min: number;
  max: number;
  complete: boolean; // every applicable step has an estimate
};

export type Metrics = {
  researched: boolean;
  total: number;
  agent: number;
  agenticPct: number | null;
  effortMinutes: RangeTotal; // summed hands-on time
  elapsedHours: RangeTotal; // longest dependency chain, calendar time
};

const AGENT_MODES =new Set(["agent", "agent-browser"]);

export function isAgentStep(step: Step): boolean {
  return AGENT_MODES.has(step.mode);
}

// Predecessors that apply in this variant. A predecessor that does not apply
// passes its own predecessors through, so the chain never breaks.
function effectivePredecessors(pb: Playbook, step: Step, v: Variant): string[] {
  const byId = new Map(pb.steps.map((s) => [s.id, s]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const pred = byId.get(id);
    if (!pred) return;
    if (applies(pred.when, v)) out.add(id);
    else pred.after.forEach(visit);
  };
  step.after.forEach(visit);
  return [...out];
}

// The effective predecessors less any that another one already implies, so a
// reader of one variant sees each step's nearest prerequisites and no step
// outside the variant.
export function nearestPredecessors(pb: Playbook, step: Step, v: Variant): string[] {
  const byId = new Map(pb.steps.map((s) => [s.id, s]));
  const preds = effectivePredecessors(pb, step, v);
  const implied = new Set<string>();
  const climb = (id: string) => {
    const s = byId.get(id);
    if (!s) return;
    for (const p of effectivePredecessors(pb, s, v)) {
      if (implied.has(p)) continue;
      implied.add(p);
      climb(p);
    }
  };
  preds.forEach(climb);
  return preds.filter((p) => !implied.has(p));
}

export function computeMetrics(pb: Playbook, v: Variant): Metrics {
  const researched = isResearched(pb, v);
  const steps = researched ? applicableSteps(pb, v) : [];
  const total = steps.length;
  const agent = steps.filter(isAgentStep).length;

  let effortKnown = 0;
  let effortMin = 0;
  let effortMax = 0;
  for (const s of steps) {
    if (!s.effort) continue;
    const e = effortMinutes(s.effort);
    effortKnown += 1;
    effortMin += e.min;
    effortMax += e.max;
  }

  // Critical path over authored order (validation guarantees it is topological).
  const finishMin = new Map<string, number>();
  const finishMax = new Map<string, number>();
  let elapsedKnown = 0;
  for (const s of steps) {
    const preds = effectivePredecessors(pb, s, v);
    const startMin = Math.max(0, ...preds.map((p) => finishMin.get(p) ?? 0));
    const startMax = Math.max(0, ...preds.map((p) => finishMax.get(p) ?? 0));
    let dMin = 0;
    let dMax = 0;
    if (s.elapsed) {
      const e = elapsedHours(s.elapsed);
      dMin = e.min;
      dMax = e.max;
      elapsedKnown += 1;
    }
    finishMin.set(s.id, startMin + dMin);
    finishMax.set(s.id, startMax + dMax);
  }
  const elapsedMin = Math.max(0, ...finishMin.values());
  const elapsedMax = Math.max(0, ...finishMax.values());

  return {
    researched,
    total,
    agent,
    agenticPct: researched && total > 0 ? Math.round((100 * agent) / total) : null,
    effortMinutes: {
      known: effortKnown,
      total,
      min: effortMin,
      max: effortMax,
      complete: total > 0 && effortKnown === total,
    },
    elapsedHours: {
      known: elapsedKnown,
      total,
      min: elapsedMin,
      max: elapsedMax,
      complete: total > 0 && elapsedKnown === total,
    },
  };
}
