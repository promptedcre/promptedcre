// Server only: what the catalog says about each calculator. Which agent tool
// calls it (from the MCP tool list) and which playbook steps use it (the steps
// whose calculators list includes its id). Nothing here is typed in.

import type { Corpus } from "@/lib/content/load";
import { TOOLS } from "@/lib/mcp/server";
import { CALC_TOOL } from "@/lib/mcp/tools";
import type { PlaybookKind, StepMode } from "@/lib/schemas/playbook";

export type CalcTool = { name: string; description: string };

// With an id, the tool CALC_TOOL names for it (calc_run for a module
// calculator); without one, the calc_ tool titled with the calculator's name.
export function calcTool(name: string, id?: string): CalcTool | null {
  const byId = id === undefined ? undefined : CALC_TOOL[id];
  const t = TOOLS.find((x) => (byId ? x.name === byId : x.name.startsWith("calc_") && x.title === name));
  return t ? { name: t.name, description: t.description } : null;
}

export type CalcStepUse = { id: string; n: number; title: string; mode: StepMode };
export type CalcPlaybookUse = { slug: string; title: string; kind: PlaybookKind; steps: CalcStepUse[] };
export type CalcUsage = { playbooks: CalcPlaybookUse[]; steps: number };

export function calcUsage(corpus: Pick<Corpus, "playbooks">, id: string): CalcUsage {
  const playbooks: CalcPlaybookUse[] = [];
  for (const p of corpus.playbooks) {
    const steps = p.steps
      .map((s, i) => ({ s, n: i + 1 }))
      .filter(({ s }) => s.calculators.includes(id))
      .map(({ s, n }) => ({ id: s.id, n, title: s.title, mode: s.mode }));
    if (steps.length > 0) playbooks.push({ slug: p.slug, title: p.title, kind: p.kind, steps });
  }
  const kindOrder: Record<PlaybookKind, number> = { process: 0, audit: 1, situation: 2 };
  playbooks.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title));
  return { playbooks, steps: playbooks.reduce((n, p) => n + p.steps.length, 0) };
}

// Distinct steps that use at least one calculator, across the catalog.
export function stepsUsingAnyCalculator(corpus: Pick<Corpus, "playbooks">): number {
  return corpus.playbooks.reduce((n, p) => n + p.steps.filter((s) => s.calculators.length > 0).length, 0);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// "26 steps in 7 playbooks and 6 situations"
export function usageLine(u: CalcUsage): string {
  const by = (k: PlaybookKind) => u.playbooks.filter((p) => p.kind === k).length;
  const parts = [
    by("process") > 0 ? plural(by("process"), "playbook", "playbooks") : null,
    by("audit") > 0 ? plural(by("audit"), "audit", "audits") : null,
    by("situation") > 0 ? plural(by("situation"), "scenario", "scenarios") : null,
  ].filter((x): x is string => x !== null);
  const where = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  return `${plural(u.steps, "step", "steps")} in ${where}`;
}
