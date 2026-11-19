import { STRUCTURES, type Structure } from "../schemas/common";
import type { Playbook } from "../schemas/playbook";
import { formatHours, formatMinutes } from "./duration";
import { computeMetrics, type Metrics, type RangeTotal } from "./metrics";
import { DEFAULT_VARIANT } from "./variant";

export type AgentShare = { agent: number; total: number; pct: number | null };

// The agent share across every record written at full depth, for each structure
// at the default property type and jurisdictions: the home page's headline number.
// Outlines and unresearched variants contribute no steps, so they cannot move it.
export function agentShareByStructure(playbooks: Playbook[]): Record<Structure, AgentShare> {
  return Object.fromEntries(
    STRUCTURES.map((structure) => {
      let agent = 0;
      let total = 0;
      for (const pb of playbooks) {
        const m = computeMetrics(pb, { ...DEFAULT_VARIANT, structure });
        agent += m.agent;
        total += m.total;
      }
      return [structure, { agent, total, pct: total > 0 ? Math.round((100 * agent) / total) : null }];
    }),
  ) as Record<Structure, AgentShare>;
}

export type TotalText = { value: string; detail: string | null };

function total(r: RangeTotal, format: (min: number, max: number) => string): TotalText {
  if (r.total === 0) return { value: "—", detail: null };
  if (r.known === 0) return { value: "not estimated", detail: `0 of ${r.total} steps` };
  if (r.complete) return { value: format(r.min, r.max), detail: null };
  return { value: `≥ ${format(r.min, r.min)}`, detail: `${r.known} of ${r.total} steps estimated` };
}

export function effortText(m: Metrics): TotalText {
  return total(m.effortMinutes, formatMinutes);
}

export function elapsedText(m: Metrics): TotalText {
  return total(m.elapsedHours, formatHours);
}
