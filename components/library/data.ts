import type { Corpus } from "@/lib/content/load";
import { ageInDays, STALE_DAYS } from "@/lib/content/semantic";
import { JURISDICTION_LABEL, PHASE_LABEL } from "@/lib/labels";
import type { Jurisdiction } from "@/lib/schemas/common";
import type { Playbook, PlaybookKind } from "@/lib/schemas/playbook";
import { PHASES } from "@/lib/schemas/playbook";
import type { Artifact, DocumentEntry, Rule } from "@/lib/schemas/records";

// What the three library pages compute from the catalog. Pure: every function takes the
// corpus (from getCorpus() in a server component) and returns plain data. Nothing here
// is typed in; a count on a page is a length or a sum of these.

const JURISDICTION_ORDER =["us-federal", "us-tx", "us-de"] as const satisfies readonly Jurisdiction[];

/** The link to a record, with what the page needs to draw it (written solid, outlined dashed). */
export type RecordLink = { slug: string; title: string; kind: PlaybookKind; written: boolean };

const linkOf = (p: Playbook): RecordLink => ({ slug: p.slug, title: p.title, kind: p.kind, written: p.depth === "full" });


// ---------- Rules ----------

type RuleCitation = { record: RecordLink; steps: number };
type CalculatorCite = { id: string; name: string; live: boolean };

export type RuleRow = {
  rule: Rule;
  /** Steps that cite the rule, across every record. */
  steps: number;
  records: RuleCitation[];
  calculators: CalculatorCite[];
  stale: boolean;
};

export function ruleRows(c: Corpus, today: Date): RuleRow[] {
  return c.rules.map((rule) => {
    const records = c.playbooks
      .map((p) => ({ record: linkOf(p), steps: p.steps.filter((s) => s.rules.includes(rule.id)).length }))
      .filter((r) => r.steps > 0)
      .sort((a, b) => b.steps - a.steps || a.record.title.localeCompare(b.record.title));
    return {
      rule,
      steps: records.reduce((n, r) => n + r.steps, 0),
      records,
      calculators: c.calculators
        .filter((k) => k.rules.includes(rule.id))
        .map((k) => ({ id: k.id, name: k.name, live: k.status === "live" })),
      stale: ageInDays(rule.lastVerified, today) > STALE_DAYS,
    };
  });
}

type JurisdictionCount ={ id: Jurisdiction; label: string; count: number };

export function rulesByJurisdiction(rules: readonly Rule[]): JurisdictionCount[] {
  return JURISDICTION_ORDER.map((id) => ({
    id,
    label: JURISDICTION_LABEL[id],
    count: rules.filter((r) => r.jurisdiction === id).length,
  })).filter((j) => j.count > 0);
}

// ---------- Rule subjects ----------
//
// A rule id names its jurisdiction, then the body of law it comes from: us-fed.reg-d.rule-506b,
// us-tx.boc.llc-formation. The subjects below are those namespaces gathered under the words an
// operator looks for, nothing finer: the grouping is read off the ids, never typed per rule. A
// namespace no subject claims lands in "Other", so a new body of law shows up, unsorted, rather
// than vanishing.

const SUBJECTS = [
  { key: "entity", label: "Entity", spaces: ["boc", "llc", "assumed-name", "fincen", "irs"] },
  { key: "securities", label: "Securities and investors", spaces: ["reg-d", "securities-act", "securities", "exchange-act", "ica", "edgar", "erisa"] },
  { key: "tax", label: "Tax", spaces: ["irc", "franchise-tax", "tax"] },
  { key: "property", label: "Property, title and environment", spaces: ["property", "title", "alta-nsps", "trec", "flood", "epa", "tceq"] },
  { key: "lending", label: "Lending", spaces: ["banking", "firrea", "finance"] },
  { key: "bankruptcy", label: "Bankruptcy", spaces: ["bankruptcy"] },
  { key: "contracts", label: "Contracts, signatures and dates", spaces: ["contracts", "esign", "ueta", "holidays"] },
] as const;

/** The body of law a rule id names: its second segment ("reg-d" in us-fed.reg-d.rule-506b). */
export const ruleNamespace = (id: string) => id.split(".")[1] ?? "";

export type RuleSubject = {
  key: string;
  label: string;
  rows: RuleRow[];
  /** The jurisdictions that have at least one rule here, in the page's order. */
  jurisdictions: Jurisdiction[];
};

/** The rules grouped by subject, in subject order, each group sorted by title. Every row lands in exactly one group. */
export function ruleSubjects(rows: readonly RuleRow[]): RuleSubject[] {
  const keyOf = (r: RuleRow) => SUBJECTS.find((s) => (s.spaces as readonly string[]).includes(ruleNamespace(r.rule.id)))?.key ?? "other";
  return [...SUBJECTS.map((s) => ({ key: s.key, label: s.label })), { key: "other", label: "Other" }]
    .map((s) => {
      const list = rows.filter((r) => keyOf(r) === s.key).sort((a, b) => a.rule.title.localeCompare(b.rule.title));
      return { ...s, rows: list, jurisdictions: JURISDICTION_ORDER.filter((j) => list.some((r) => r.rule.jurisdiction === j)) };
    })
    .filter((s) => s.rows.length > 0);
}

type RuleTotals = {
  cards: number;
  stale: number;
  /** Cards by review level, in the order practitioner, attorney, AI-drafted; a level no card has is left out. */
  byReview: { review: Rule["review"]; count: number }[];
  oldest: string | null;
  newest: string | null;
};

const REVIEW_ORDER = ["practitioner-reviewed", "attorney-reviewed", "ai-drafted"] as const satisfies readonly Rule["review"][];

export function ruleTotals(c: Corpus, rows: readonly RuleRow[]): RuleTotals {
  const dates = c.rules.map((r) => r.lastVerified).sort();
  return {
    cards: c.rules.length,
    stale: rows.filter((r) => r.stale).length,
    byReview: REVIEW_ORDER.map((review) => ({ review, count: c.rules.filter((r) => r.review === review).length })).filter((x) => x.count > 0),
    oldest: dates[0] ?? null,
    newest: dates[dates.length - 1] ?? null,
  };
}

// ---------- Artifacts ----------

export type ArtifactRow = {
  artifact: Artifact;
  makes: RecordLink[];
  uses: RecordLink[];
};

const hasArtifact = (list: readonly string[], id: string) => list.includes(id);

/** Every artifact with the records that produce it and the records that use it. Field standards first. */
export function artifactRows(c: Corpus): { standard: ArtifactRow[]; plain: ArtifactRow[] } {
  const rows = (list: Artifact[]) =>
    list.map((artifact) => ({
      artifact,
      makes: c.playbooks
        .filter((p) => hasArtifact(p.produces, artifact.id) || p.steps.some((s) => hasArtifact(s.produces, artifact.id)))
        .map(linkOf),
      uses: c.playbooks
        .filter((p) => hasArtifact(p.consumes, artifact.id) || p.steps.some((s) => hasArtifact(s.consumes, artifact.id)))
        .map(linkOf),
    }));
  return { standard: rows(c.artifacts.filter((a) => a.fields.length > 0)), plain: rows(c.artifacts.filter((a) => a.fields.length === 0)) };
}

// ---------- Documents ----------

export const ACCESS_ORDER = ["public-domain", "free-to-view", "member-only", "paid"] as const;
export type Access = DocumentEntry["access"];

export const ACCESS_WORD: Record<Access, string> = {
  "public-domain": "Public domain",
  "free-to-view": "Free to view",
  "member-only": "Members only",
  paid: "Paid",
};

export const ACCESS_MEANS: Record<Access, string> = {
  "public-domain": "No copyright. Free to read, download and reuse.",
  "free-to-view": "Free to read online. The publisher keeps its rights.",
  "member-only": "The publisher shows it to members only.",
  paid: "The publisher charges for it. Listed so you know it exists.",
};

type DocumentRow = {
  doc: DocumentEntry;
  /** The use case's lead words ("Stand up and report") and the rest of it. */
  lead: string;
  use: string;
  host: string;
  stale: boolean;
};

export type DocumentGroup = { key: string; label: string; rows: DocumentRow[] };

function splitUse(useCase: string): { lead: string; use: string } {
  const i = useCase.indexOf(":");
  if (i < 0) return { lead: "", use: useCase };
  return { lead: useCase.slice(0, i).trim(), use: useCase.slice(i + 1).trim() };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Documents grouped by the phase their use case names first, in phase order. Every document lands in exactly one group. */
export function documentGroups(docs: readonly DocumentEntry[], today: Date): DocumentGroup[] {
  const phases = PHASES.map((p) => ({ key: p, label: PHASE_LABEL[p] }));
  const phaseOf = (lead: string) => phases.find((p) => lead === p.label || lead.startsWith(`${p.label} `))?.key ?? "other";
  const rows = docs.map((doc) => {
    const { lead, use } = splitUse(doc.useCase);
    return { doc, lead, use, host: hostOf(doc.url), stale: ageInDays(doc.lastChecked, today) > STALE_DAYS };
  });
  return [...phases, { key: "other", label: "Other" }]
    .map((p) => ({
      key: p.key,
      label: p.label,
      rows: rows.filter((r) => phaseOf(r.lead) === p.key),
    }))
    .filter((g) => g.rows.length > 0);
}
