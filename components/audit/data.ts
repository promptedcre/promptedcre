import type { Stake } from "@/components/run/findings-report";
import { siteFacts, MARK_OF, type AuditFacts, type StepMark } from "@/lib/compute/site-facts";
import { getCorpus, type Corpus } from "@/lib/content/load";
import type { ParsedSheet } from "@/lib/demo/findings";
import { getDemoRun } from "@/lib/demo/load";
import { JURISDICTION_LABEL, PHASE_LABEL } from "@/lib/labels";
import type { Review } from "@/lib/schemas/common";
import { readsPublicRecord, type Phase, type Playbook, type Step, type StepMode } from "@/lib/schemas/playbook";
import { doors, site } from "@/lib/site";

// Everything the /audit page shows, computed in one place from the catalog
// (siteFacts and the audit playbook itself), the recorded run and lib/site.ts.
// Server only: getCorpus() and getDemoRun() read from disk. Nothing is typed in.

export type CheckRow = {
  n: number;
  id: string;
  title: string;
  mode: StepMode;
  mark: StepMark;
  // Who verifies it: "agent", "agent in a browser", or the person the step names.
  who: string;
  agent: boolean;
  // By the engine's own rule (readsPublicRecord in lib/schemas/playbook.ts): a check
  // reads a public record when its step carries a standing approval. An agent may record
  // such a check only after a person has approved lookups for the audit, once.
  readsPublicRecord: boolean;
  basis: "cited" | "practitioner";
  sources: number;
  // Rule cards the check links; the findings report lists them with the sources.
  rules: number;
  href: string;
  // What missing it can cost, in a rule card's own words (STAKES), or null.
  stake: Stake | null;
};

// A document the audit reads from the firm's own files, by its artifact record.
export type AuditInput = { id: string; name: string; href: string };

export type WrittenAudit = {
  slug: string;
  title: string;
  summary: string;
  href: string;
  phase: Phase;
  phaseLabel: string;
  // The review state in a word, said as what it is ("AI-drafted"); the date beside it is lastVerified.
  reviewWord: string;
  // The jurisdictions the audit was written for, the way the site writes coverage: "Federal + Texas".
  covers: string;
  lastVerified: string | null;
  checks: number;
  agentChecks: number;
  personChecks: number;
  cited: number;
  practice: number;
  publicRecord: number;
  sources: number;
  marks: StepMark[];
  rows: CheckRow[];
  // The documents its checks read (the playbook's `consumes`), named as the catalog names them.
  reads: AuditInput[];
};

export type CoverageTile =
  | { kind: "written"; phase: Phase; phaseLabel: string; audit: WrittenAudit }
  | { kind: "outlined"; phase: Phase; phaseLabel: string; slug: string; title: string; summary: string; planned: string[] }
  | { kind: "none"; phase: Phase; phaseLabel: string }
  // A phase with no audit in the catalog that is not named as "not covered yet" either.
  | { kind: "unlisted"; phase: Phase; phaseLabel: string };

// The lookup approval as the recording has it, and the three steps that show it: the
// agent's lookup the engine refused, the approval, and the same lookup recorded.
export type LookupApproval = { by: string; on: string; command: string; scene: string; steps: [refused: number, approved: number, recorded: number] };

export type AuditPageData = {
  audit: WrittenAudit;
  prompt: string;
  coverage: CoverageTile[];
  approval: LookupApproval | null;
};

const ACTOR_WORD: Partial<Record<string, string>> = { cpa: "CPA" };
const REVIEW_WORD: Record<Review, string> = {
  "ai-drafted": "AI-drafted",
  "practitioner-reviewed": "Practitioner-reviewed",
  "attorney-reviewed": "Attorney-reviewed",
};

function whoWord(s: Step): string {
  if (s.mode === "agent") return "agent";
  if (s.mode === "agent-browser") return "agent in a browser";
  const actor = s.actor ?? "principal";
  return ACTOR_WORD[actor] ?? actor;
}

// The checks whose miss has a consequence written on a rule card they cite. Each pairing
// names the card and the first words of its sentence that states the consequence; the
// page shows that sentence as the card has it, read from the card, and links the card.
// A pairing that stops holding (the check no longer cites the card, or no sentence of the
// card opens with those words) throws, so a changed card fails the build instead of being
// misquoted. A check of another audit that is not listed here shows no stake.
export const STAKES: readonly { check: string; rule: string; opens: string }[] = [
  { check: "confirm-state-status", rule: "us-tx.franchise-tax.forfeiture", opens: "A forfeited entity cannot sue or defend" },
  { check: "confirm-registered-agent", rule: "us-tx.boc.registered-agent-lapse", opens: "The Secretary of State may terminate" },
  { check: "confirm-franchise-reports", rule: "us-tx.franchise-tax.forfeiture", opens: "A forfeited entity cannot sue or defend" },
  { check: "check-assumed-names", rule: "us-tx.assumed-name.certificate", opens: "Until it files one" },
];

// One sentence per item: a full stop, a space, then a capital letter.
const sentencesOf = (text: string) => text.split(/(?<=\.)\s+(?=[A-Z])/);

function stakeOf(step: Step, rules: Corpus["rules"]): Stake | null {
  const pair = STAKES.find((p) => p.check === step.id);
  if (!pair) return null;
  if (!step.rules.includes(pair.rule)) throw new Error(`Check ${step.id} no longer cites rule card ${pair.rule}; fix STAKES in components/audit/data.ts.`);
  const card = rules.find((r) => r.id === pair.rule);
  if (!card) throw new Error(`Rule card ${pair.rule} is not in the catalog; fix STAKES in components/audit/data.ts.`);
  const text = sentencesOf(card.rule).find((s) => s.startsWith(pair.opens));
  if (!text) throw new Error(`No sentence of rule card ${pair.rule} opens with "${pair.opens}"; fix STAKES in components/audit/data.ts.`);
  return { text, rule: card.title, href: `/rules#rule-${card.id}` };
}

function rowsOf(pb: Playbook, rules: Corpus["rules"]): CheckRow[] {
  return pb.steps.map((s, i) => ({
    n: i + 1,
    id: s.id,
    title: s.title,
    mode: s.mode,
    mark: MARK_OF[s.mode],
    who: whoWord(s),
    agent: s.mode === "agent" || s.mode === "agent-browser",
    readsPublicRecord: readsPublicRecord(s),
    basis: s.basis,
    sources: s.sources.length,
    rules: s.rules.length,
    href: `/playbooks/${pb.slug}#step-${s.id}`,
    stake: stakeOf(s, rules),
  }));
}

function readsOf(pb: Playbook, artifacts: Corpus["artifacts"]): AuditInput[] {
  return pb.consumes.map((id) => {
    const a = artifacts.find((x) => x.id === id);
    if (!a) throw new Error(`${pb.slug} reads artifact ${id}, which the catalog does not hold.`);
    return { id, name: a.name, href: `/artifacts#${id}` };
  });
}

// The stake under each open finding of the recorded audit, by finding id: the finding's
// check comes from the sheet that carries it, and its stake from that check's row.
export function findingStakes(audit: WrittenAudit, sheets: ParsedSheet[]): Record<string, Stake> {
  const out: Record<string, Stake> = {};
  for (const f of sheets.flatMap((s) => s.findings)) {
    const stake = audit.rows.find((r) => r.id === f.check.id)?.stake;
    if (stake) out[f.id] = stake;
  }
  return out;
}

function writtenAudit(facts: AuditFacts, pb: Playbook, corpus: Corpus): WrittenAudit {
  const rows = rowsOf(pb, corpus.rules);
  const agentChecks = facts.agentChecks ?? rows.filter((r) => r.agent).length;
  return {
    slug: pb.slug,
    title: pb.title,
    summary: pb.summary,
    href: `/playbooks/${pb.slug}`,
    phase: pb.phase,
    phaseLabel: PHASE_LABEL[pb.phase],
    reviewWord: REVIEW_WORD[pb.review],
    covers: pb.written.jurisdiction.map((j) => JURISDICTION_LABEL[j]).join(" + "),
    lastVerified: pb.lastVerified,
    checks: facts.checks,
    agentChecks,
    personChecks: facts.checks - agentChecks,
    cited: rows.filter((r) => r.basis === "cited").length,
    practice: rows.filter((r) => r.basis === "practitioner").length,
    publicRecord: rows.filter((r) => r.readsPublicRecord).length,
    sources: pb.sources.length,
    marks: rows.map((r) => r.mark),
    rows,
    reads: readsOf(pb, corpus.artifacts),
  };
}

// The lookup approval as the recording has it: the person who approved, the day, and the
// steps around it. The page draws the step before the approval as the refused lookup and
// the step after it as the same lookup recorded, so a recording where that is no longer
// what those steps are throws here instead of drawing the wrong rows.
function recordedApproval(): LookupApproval | null {
  const run = getDemoRun();
  for (const scene of run.scenes) {
    const i = scene.steps.findIndex((s) => s.by && s.command.startsWith("pcre audit approve-lookups"));
    const step = scene.steps[i];
    if (!step?.by) continue;
    const before = scene.steps[i - 1];
    const after = scene.steps[i + 1];
    if (!before || !after || before.exit !== 1 || after.exit !== 0 || before.command !== after.command) {
      throw new Error(
        `Scene "${scene.id}": the step before the lookup approval is not a refused lookup that the step after it records. Fix recordedApproval in components/audit/data.ts or re-record with "npm run demo:record".`,
      );
    }
    return { by: step.by, on: run.recordedOn, command: step.command, scene: scene.id, steps: [i, i + 1, i + 2] };
  }
  return null;
}

export function getAuditPage(): AuditPageData {
  const corpus = getCorpus();
  const facts = siteFacts(corpus);
  const order = (p: Phase) => facts.phases.findIndex((x) => x.phase === p);

  // Every written audit, in catalog order; the page leads with the first.
  const written = facts.audits.flatMap((a) => {
    const pb = a.depth === "full" ? corpus.playbooks.find((p) => p.slug === a.slug) : undefined;
    return pb ? [writtenAudit(a, pb, corpus)] : [];
  });
  const audit = written[0];
  if (!audit) throw new Error("The catalog holds no written audit playbook, so /audit has nothing to show.");

  const tiles: CoverageTile[] = [
    ...written.map((w): CoverageTile => ({ kind: "written", phase: w.phase, phaseLabel: w.phaseLabel, audit: w })),
    ...facts.audits
      .filter((a) => a.depth !== "full")
      .map((a): CoverageTile => ({ kind: "outlined", phase: a.phase, phaseLabel: PHASE_LABEL[a.phase], slug: a.slug, title: a.title, summary: a.summary, planned: a.checkTitles })),
    ...facts.notAudited.map((p): CoverageTile => ({ kind: "none", phase: p.phase, phaseLabel: p.label })),
  ];
  // Every phase of a firm's life shows once: the rest have no audit listed at all.
  const shown = new Set(tiles.map((t) => t.phase));
  for (const p of facts.phases) {
    if (!shown.has(p.phase)) tiles.push({ kind: "unlisted", phase: p.phase, phaseLabel: PHASE_LABEL[p.phase] });
  }
  const rank = { written: 0, outlined: 1, none: 2, unlisted: 3 } as const;
  tiles.sort((x, y) => rank[x.kind] - rank[y.kind] || order(x.phase) - order(y.phase));

  const door = doors.find((d) => d.id === "audit");
  if (!door) throw new Error("lib/site.ts has no audit door.");

  return { audit, prompt: door.prompt(site.url), coverage: tiles, approval: recordedApproval() };
}
