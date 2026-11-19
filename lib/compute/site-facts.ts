import { JURISDICTIONS, REVIEW_LEVELS, STRUCTURES, type Jurisdiction, type Review, type Structure } from "../schemas/common";
import {
  PHASES,
  PHASES_NOT_AUDITED,
  PLAYBOOK_KINDS,
  STEP_MODES,
  type Phase,
  type Playbook,
  type PlaybookKind,
  type StepMode,
} from "../schemas/playbook";
import type { Corpus } from "../content/load";
import { JURISDICTION_LABEL, PHASE_LABEL } from "../labels";
import { computeMetrics } from "./metrics";
import { agentShareByStructure } from "./summary";
import { applicableSteps, DEFAULT_JURISDICTIONS, DEFAULT_VARIANT, isResearched, type Variant } from "./variant";

// The numbers the marketing pages show, computed from the catalog in one place.
// Pure: no file system and no clock, so a page and a test see the same object.

// A: agent. B: agent in a browser. H: a person, online. O: a person, offline.
export type StepMark = "A" | "B" | "H" | "O";

export const MARK_OF: Record<StepMode, StepMark> = {
  agent: "A",
  "agent-browser": "B",
  "human-online": "H",
  "human-offline": "O",
};

const variantFor = (structure: Structure): Variant => ({ ...DEFAULT_VARIANT, structure });

// The marks of the steps that apply in this structure at the default property type
// and jurisdictions, in authored order. Empty when that variant was not researched,
// which is exactly when computeMetrics counts no steps.
export function stepMarks(pb: Playbook, structure: Structure): StepMark[] {
  const v = variantFor(structure);
  if (!isResearched(pb, v)) return [];
  return applicableSteps(pb, v).map((s) => MARK_OF[s.mode]);
}

// cited and practice split the same steps the share counts (cited + practice = total),
// so a page that prints "206 written steps" can say how many of those 206 cite a source.
export type StructureShare = {
  agent: number;
  total: number;
  pct: number | null;
  modes: Record<StepMode, number>;
  cited: number;
  practice: number;
};

export type RecordFacts = {
  id: string;
  slug: string;
  title: string;
  kind: PlaybookKind;
  phase: Phase;
  review: Review;
  featured: boolean;
  order: number;
  /** The date of the record's last full citation check (not a review); null when never checked. */
  lastVerified: string | null;
  byStructure: Record<Structure, { marks: StepMark[]; agent: number; total: number; pct: number | null }>;
};

/** The earliest and latest sources-checked dates among the written records at one review level. */
export type CheckedRange = { first: string | null; last: string | null };

export type PhaseFacts = {
  phase: Phase;
  label: string;
  written: number;
  outlined: number;
  playbooks: Array<{ slug: string; title: string; depth: "full" | "outline"; featured: boolean }>;
};

export type AuditFacts = {
  slug: string;
  title: string;
  summary: string;
  depth: "full" | "outline";
  review: Review;
  phase: Phase;
  checks: number;
  agentChecks: number | null;
  checkTitles: string[];
};

/** One kind of record in the canonical counts line: how many are written in full, of how many listed. */
export type CountPart = { kind: PlaybookKind; label: string; written: number; listed: number };

/** The record kinds as the ledger's rows name them. */
const KIND_PLURAL: Record<PlaybookKind, string> = { process: "Playbooks", situation: "Situations", audit: "Audits" };
/** The record kinds inside the catalog's sentence: one, many. */
const KIND_NOUN: Record<PlaybookKind, [string, string]> = {
  process: ["playbook", "playbooks"],
  situation: ["scenario", "scenarios"],
  audit: ["audit", "audits"],
};

export type SiteFacts = {
  // The one counting model. A record is a playbook, a situation or an audit. `line` is the
  // catalog's one sentence, said the same way wherever a page counts the catalog:
  // "19 written in full: 12 playbooks, 6 situations and 1 audit. 76 more are outlined."
  // The denominators (of 71, of 22, of 2, of 95) are in `parts` and are printed only in the
  // ledger on /playbooks, which explains each one.
  catalog: { parts: CountPart[]; written: number; listed: number; line: string };
  counts: {
    playbooks: number;
    processes: number;
    situations: number;
    audits: number;
    written: number;
    outlined: number;
    writtenByKind: Record<PlaybookKind, number>;
    listedByKind: Record<PlaybookKind, number>;
    rules: number;
    rulesByJurisdiction: Record<Jurisdiction, number>;
    artifacts: number;
    documents: number;
    calculators: number;
    calculatorsLive: number;
  };
  share: Record<Structure, StructureShare>;
  records: RecordFacts[];
  phases: PhaseFacts[];
  situations: { written: number; listed: number };
  trust: {
    // sourcesListed counts every source entry, so a statute cited by three records
    // counts three times: it is a count of citations. sourcesUnique counts distinct
    // addresses. A page says "N sources" only of sourcesUnique.
    sourcesListed: number;
    sourcesUnique: number;
    steps: number;
    citedSteps: number;
    practiceSteps: number;
    review: Record<Review, number>;
    // When the written records at each review level last had their sources checked, so a
    // page can say "AI-drafted, sources checked 2026-11-12" rather than a bare count.
    checked: Record<Review, CheckedRange>;
  };
  // The jurisdictions the written steps are read for (the default view), and the one way
  // every page writes them: "Federal + Texas".
  coverage: { jurisdictions: Jurisdiction[]; label: string };
  audits: AuditFacts[];
  notAudited: Array<{ phase: Phase; label: string }>;
};

function tally<K extends string>(keys: readonly K[], values: K[]): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const v of values) out[v] += 1;
  return out;
}

function perStructure<T>(make: (structure: Structure) => T): Record<Structure, T> {
  return Object.fromEntries(STRUCTURES.map((s) => [s, make(s)])) as Record<Structure, T>;
}

// The layout, the page and its pieces all ask for the same catalog's facts, so one
// result is kept per catalog object. A catalog is never changed after it is loaded.
const computed = new WeakMap<Corpus, SiteFacts>();

export function siteFacts(corpus: Corpus): SiteFacts {
  const hit = computed.get(corpus);
  if (hit) return hit;
  const facts = computeSiteFacts(corpus);
  computed.set(corpus, facts);
  return facts;
}

function computeSiteFacts(corpus: Corpus): SiteFacts {
  const { playbooks, rules, artifacts, documents, calculators } = corpus;
  const written = playbooks.filter((p) => p.depth === "full");
  const ofKind = (kind: PlaybookKind) => playbooks.filter((p) => p.kind === kind);

  const listedByKind = tally(PLAYBOOK_KINDS, playbooks.map((p) => p.kind));
  const writtenByKind = tally(PLAYBOOK_KINDS, written.map((p) => p.kind));

  const headline = agentShareByStructure(playbooks);
  const share = perStructure<StructureShare>((structure) => {
    const v = variantFor(structure);
    const steps = written.flatMap((pb) => (isResearched(pb, v) ? applicableSteps(pb, v) : []));
    const cited = steps.filter((s) => s.basis === "cited").length;
    return {
      ...headline[structure],
      modes: tally(STEP_MODES, steps.map((s) => s.mode)),
      cited,
      practice: steps.length - cited,
    };
  });

  const records: RecordFacts[] = written.map((pb) => ({
    id: pb.id,
    slug: pb.slug,
    title: pb.title,
    kind: pb.kind,
    phase: pb.phase,
    review: pb.review,
    featured: pb.featured,
    order: pb.order,
    lastVerified: pb.lastVerified,
    byStructure: perStructure((structure) => {
      const m = computeMetrics(pb, variantFor(structure));
      return { marks: stepMarks(pb, structure), agent: m.agent, total: m.total, pct: m.agenticPct };
    }),
  }));

  const processes = ofKind("process");
  const phases: PhaseFacts[] = PHASES.map((phase) => {
    const list = processes.filter((p) => p.phase === phase);
    return {
      phase,
      label: PHASE_LABEL[phase],
      written: list.filter((p) => p.depth === "full").length,
      outlined: list.filter((p) => p.depth === "outline").length,
      playbooks: list.map((p) => ({ slug: p.slug, title: p.title, depth: p.depth, featured: p.featured })),
    };
  });

  const allSteps = written.flatMap((pb) => pb.steps);
  const citedSteps = allSteps.filter((s) => s.basis === "cited").length;
  const sourceUrls = [...written.flatMap((pb) => pb.sources), ...rules.flatMap((r) => r.sources)].map((s) => s.url);
  const sourcesListed = sourceUrls.length;
  const sourcesUnique = new Set(sourceUrls).size;

  const audits: AuditFacts[] = ofKind("audit").map((pb) => {
    const full = pb.depth === "full";
    return {
      slug: pb.slug,
      title: pb.title,
      summary: pb.summary,
      depth: pb.depth,
      review: pb.review,
      phase: pb.phase,
      checks: full ? pb.steps.length : pb.outlineSteps.length,
      agentChecks: full ? computeMetrics(pb, DEFAULT_VARIANT).agent : null,
      checkTitles: full ? pb.steps.map((s) => s.title) : [...pb.outlineSteps],
    };
  });

  const parts: CountPart[] = PLAYBOOK_KINDS.map((kind) => ({
    kind,
    label: KIND_PLURAL[kind],
    written: writtenByKind[kind],
    listed: listedByKind[kind],
  }));
  const named = parts.filter((p) => p.written > 0).map((p) => `${p.written} ${KIND_NOUN[p.kind][p.written === 1 ? 0 : 1]}`);
  const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named.join("");
  const outlined = playbooks.length - written.length;
  const line =
    `${written.length} written in full${list ? `: ${list}` : ""}.` +
    (outlined > 0 ? ` ${outlined} more ${outlined === 1 ? "is" : "are"} outlined.` : "");

  return {
    catalog: { parts, written: written.length, listed: playbooks.length, line },
    counts: {
      playbooks: playbooks.length,
      processes: listedByKind.process,
      situations: listedByKind.situation,
      audits: listedByKind.audit,
      written: written.length,
      outlined: playbooks.length - written.length,
      writtenByKind,
      listedByKind,
      rules: rules.length,
      rulesByJurisdiction: tally(JURISDICTIONS, rules.map((r) => r.jurisdiction)),
      artifacts: artifacts.length,
      documents: documents.length,
      calculators: calculators.length,
      calculatorsLive: calculators.filter((c) => c.status === "live").length,
    },
    share,
    records,
    phases,
    situations: { written: writtenByKind.situation, listed: listedByKind.situation },
    trust: {
      sourcesListed,
      sourcesUnique,
      steps: allSteps.length,
      citedSteps,
      practiceSteps: allSteps.filter((s) => s.basis === "practitioner").length,
      review: tally(REVIEW_LEVELS, written.map((p) => p.review)),
      checked: Object.fromEntries(
        REVIEW_LEVELS.map((r) => {
          // ISO dates sort as text
          const dates = written.filter((p) => p.review === r && p.lastVerified).map((p) => p.lastVerified as string).sort();
          return [r, { first: dates[0] ?? null, last: dates.at(-1) ?? null }];
        }),
      ) as Record<Review, CheckedRange>,
    },
    coverage: {
      jurisdictions: [...DEFAULT_JURISDICTIONS],
      label: DEFAULT_JURISDICTIONS.map((j) => JURISDICTION_LABEL[j]).join(" + "),
    },
    audits,
    notAudited: PHASES_NOT_AUDITED.map((phase) => ({ phase, label: PHASE_LABEL[phase] })),
  };
}
