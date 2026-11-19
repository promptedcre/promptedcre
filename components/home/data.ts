import { mcpUrlFor } from "@/components/connect/host-steps";
import { stepSoftware } from "@/components/rankings/step-software";
import { getRankingsSummary } from "@/components/rankings/summary";
import { siteFacts, type SiteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import type { BoardRow, BoardScene } from "@/lib/demo/board";
import { HOSTS, type HostStatus } from "@/lib/hosts";
import { PHASE_LABEL } from "@/lib/labels";
import type { Playbook } from "@/lib/schemas/playbook";
import { setupPrompt, site } from "@/lib/site";

// Everything the home page shows, read once on the server (D218). Every number comes from
// the catalog (siteFacts), HOSTS or the rankings summary. The only words written here are
// labels; the twelve playbooks of the journey are the one hand-made choice, and a test
// holds each to a written record.

type Link = { text: string; href: string };

// The journey the home page's table walks, in the order a firm meets it: form the firm,
// raise, buy, then run the property. The owner's pick (D218, Q20): twelve rows.
export const JOURNEY = [
  "form-sponsor-entity",
  "choose-structure-and-exemption",
  "prepare-offering-documents",
  "onboard-an-investor",
  "file-form-d-and-state-notices",
  "screen-deal-buy-box",
  "underwrite-a-deal",
  "submit-letter-of-intent",
  "run-due-diligence",
  "finance-and-close",
  "renew-a-tenant",
  "make-a-distribution",
] as const;

// How many company icons a row of the journey shows at most.
export const SOFTWARE_SHOWN = 4;

export type SoftwareMark = { id: string; name: string; government: boolean; href: string };

export type ShareCells = { agent: number; total: number; pct: number | null };

export type JourneyRow = ShareCells & {
  slug: string;
  title: string;
  phase: string;
  software: SoftwareMark[];
};

export type ScenarioRow = ShareCells & {
  slug: string;
  title: string;
  urgency: "hours" | "days" | "weeks";
};

export type HostChip = { id: string; name: string; status: HostStatus };

export type HomeData = {
  facts: SiteFacts;
  hosts: HostChip[];
  // The box's three ways in: the sentence, Claude Code's command, the connector's address.
  prompt: string;
  command: string;
  mcpUrl: string;
  // What works while the hosted connector is off; null once it is on.
  today: Link | null;
  journey: JourneyRow[];
  scenarios: ScenarioRow[];
  // How many records each "See all" leads to.
  all: { playbooks: number; scenarios: number };
  // The software rankings' totals, for the stat cards (D224).
  software: { judged: number; listed: number; markets: number };
};

/** "a", "a and b", "a, b and c". */
export const listWords = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The catalog in the site's one sentence, computed and with no denominators:
// "44 written in full: 32 playbooks, 11 scenarios and 1 audit. 52 more are outlined."
export function catalogSentence(facts: SiteFacts, { lead = true }: { lead?: boolean } = {}): string {
  const { writtenByKind: w, written, outlined } = facts.counts;
  const kinds = listWords([plural(w.process, "playbook"), plural(w.situation, "scenario"), plural(w.audit, "audit")]);
  const more = outlined > 0 ? ` ${outlined} more ${outlined === 1 ? "is" : "are"} outlined.` : "";
  return `${lead ? `${written} ` : ""}written in full: ${kinds}.${more}`;
}

// What the page says about availability, once, from lib/site.ts's two flags. A statement is
// null once its flag is on, and the whole answer is null when both are.
export type Availability = { today: boolean; connector: string | null; engine: string | null };

export function availability(flags: { connectorLive: boolean; engineReleased: boolean }): Availability | null {
  const { connectorLive, engineReleased } = flags;
  if (connectorLive && engineReleased) return null;
  return {
    today: !connectorLive,
    connector: connectorLive ? null : "The hosted connector is not switched on yet.",
    engine: engineReleased
      ? null
      : connectorLive
        ? "The engine is not released yet; with the connector, every step tells your agent who does it and where to stop."
        : "The engine is not released yet.",
  };
}

// The motion specimen's moment (app/styleguide/motion): the first refused row that a person
// picks up in the same scene, the agent's own step before it and the person's row after it.
export type StoryRows = { own: BoardRow; refused: BoardRow; person: BoardRow };

export function pickStory(scene: BoardScene): StoryRows {
  const i = scene.rows.findIndex((r) => r.outcome.kind === "refused" && r.then?.sameScene === true);
  const refused = scene.rows[i];
  if (!refused?.then) throw new Error(`Scene "${scene.id}" has no refused step that a person picks up in the same scene.`);
  const own = scene.rows.slice(0, i).findLast((r) => r.lane === "agent" && !r.read && r.outcome.kind === "done");
  const person = scene.rows[refused.then.n - 1];
  if (!own || !person) throw new Error(`Scene "${scene.id}" has no agent's own step before its refusal, or no person's step after it.`);
  if (person.lane !== "person" || person.outcome.kind !== "done") throw new Error(`Scene "${scene.id}": step ${person.n} is not a person's step recorded as done.`);
  return { own, refused, person };
}

// The software a playbook's steps use (D218, the owner's "Map each step"): for each step, the
// scored products content/step-software.json names for it (components/rankings/step-software),
// gathered over the record's steps, each once, best agent-ready score first, until `max`.
export function softwareFor(pb: Playbook, max = SOFTWARE_SHOWN): SoftwareMark[] {
  const seen = new Map<string, SoftwareMark & { score: number | null }>();
  for (const s of pb.steps) {
    for (const v of stepSoftware(pb.id, s.id, s.market, Number.POSITIVE_INFINITY)?.vendors ?? []) {
      if (!seen.has(v.id)) seen.set(v.id, { id: v.id, name: v.name, government: v.government, href: v.href, score: v.score });
    }
  }
  return [...seen.values()]
    // Scored products first, best first; a product not judged yet comes after them.
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((m) => ({ id: m.id, name: m.name, government: m.government, href: m.href }));
}

export function journeyRows(facts: SiteFacts, ids: readonly string[] = JOURNEY): JourneyRow[] {
  const corpus = getCorpus();
  return ids.map((id) => {
    const rec = facts.records.find((r) => r.id === id);
    const pb = corpus.playbooks.find((p) => p.id === id);
    if (!rec || !pb || pb.depth !== "full") throw new Error(`The journey names "${id}", which is not a written playbook.`);
    const s = rec.byStructure.syndication;
    return { slug: rec.slug, title: rec.title, phase: PHASE_LABEL[rec.phase], agent: s.agent, total: s.total, pct: s.pct, software: softwareFor(pb) };
  });
}

const URGENCY_ORDER = { hours: 0, days: 1, weeks: 2 } as const;

// The written scenarios, the most urgent first, then in the catalog's order.
export function scenarioRows(facts: SiteFacts): ScenarioRow[] {
  const corpus = getCorpus();
  return corpus.playbooks
    .filter((p) => p.kind === "situation" && p.depth === "full" && p.situation)
    .sort((a, b) => URGENCY_ORDER[a.situation!.urgency] - URGENCY_ORDER[b.situation!.urgency] || a.order - b.order)
    .map((p) => {
      const rec = facts.records.find((r) => r.id === p.id);
      const s = rec?.byStructure.syndication ?? { agent: 0, total: 0, pct: null };
      return { slug: p.slug, title: p.title, urgency: p.situation!.urgency, agent: s.agent, total: s.total, pct: s.pct };
    });
}

// The rankings' own totals, as /rankings prints them: products judged, listed and markets.
function softwareTotals(): HomeData["software"] {
  const { totals } = getRankingsSummary();
  return { judged: totals.judged, listed: totals.listed, markets: totals.markets };
}

export function getHomeData(): HomeData {
  const corpus = getCorpus();
  const facts = siteFacts(corpus);
  const mcpUrl = mcpUrlFor(site.url);
  const claudeCode = HOSTS.find((h) => h.id === "claude-code");
  const { listedByKind: listed } = facts.counts;
  return {
    facts,
    hosts: HOSTS.map((h) => ({ id: h.id, name: h.name, status: h.status })),
    prompt: setupPrompt(),
    command: claudeCode?.steps(mcpUrl)[0] ?? `claude mcp add --transport http promptedcre ${mcpUrl}`,
    mcpUrl,
    today: availability(site)?.today ? { text: "Copy a playbook into any AI chat", href: "/playbooks" } : null,
    journey: journeyRows(facts),
    scenarios: scenarioRows(facts),
    all: { playbooks: listed.process, scenarios: listed.situation },
    software: softwareTotals(),
  };
}
