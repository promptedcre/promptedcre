import { siteFacts, type RecordFacts, type SiteFacts } from "@/lib/compute/site-facts";
import { joinAnd } from "@/components/playbook/words";
import { getCorpus, type Corpus } from "@/lib/content/load";
import { PLAYBOOK_KINDS, type Phase, type Playbook, type PlaybookKind } from "@/lib/schemas/playbook";

// The catalog as the board, the outlined rows and the elevation read it: every
// record numbered within its kind in catalog order, with the few fields siteFacts
// leaves out (sources, summary, a situation's trigger and urgency). Server only:
// getCatalog() reads the content folder. Everything here is counted, never typed.

export type Urgency = "hours" | "days" | "weeks";
export const URGENCIES: readonly Urgency[] = ["hours", "days", "weeks"];

type Common = {
  /** 1-based position within its kind, in catalog order (processes run 1 to 71 across the phases). */
  no: number;
  summary: string;
  trigger: string | null;
  urgency: Urgency | null;
};

/** A record written at full depth: siteFacts' record plus its sources count. */
export type BoardRecord = RecordFacts & Common & { sources: number };

/** An outlined record: its title and, when it has them, the titles of its planned steps. */
export type OutlineRecord = Common & {
  id: string;
  slug: string;
  title: string;
  kind: PlaybookKind;
  phase: Phase;
  /** How many steps (or checks, for an audit) are planned; 0 when none are listed yet. */
  planned: number;
};

export type Catalog = {
  facts: SiteFacts;
  written: BoardRecord[];
  outlined: OutlineRecord[];
};

function common(pb: Playbook, no: number): Common {
  return {
    no,
    summary: pb.summary,
    trigger: pb.situation?.trigger ?? null,
    urgency: pb.situation?.urgency ?? null,
  };
}

export function catalogFrom(corpus: Corpus, facts: SiteFacts = siteFacts(corpus)): Catalog {
  const numbered = new Map<string, number>();
  for (const kind of PLAYBOOK_KINDS) {
    corpus.playbooks
      .filter((p) => p.kind === kind)
      .sort((a, b) => a.order - b.order)
      .forEach((p, i) => numbered.set(p.id, i + 1));
  }
  const byId = new Map(corpus.playbooks.map((p) => [p.id, p]));

  const written: BoardRecord[] = facts.records.flatMap((r) => {
    const pb = byId.get(r.id);
    if (!pb) return [];
    return [{ ...r, ...common(pb, numbered.get(r.id) ?? 0), sources: pb.sources.length }];
  });

  const outlined: OutlineRecord[] = corpus.playbooks
    .filter((p) => p.depth === "outline")
    .map((p) => ({
      ...common(p, numbered.get(p.id) ?? 0),
      id: p.id,
      slug: p.slug,
      title: p.title,
      kind: p.kind,
      phase: p.phase,
      planned: p.outlineSteps.length,
    }));

  const byNo = <T extends { no: number }>(a: T, b: T) => a.no - b.no;
  return { facts, written: written.sort(byNo), outlined: outlined.sort(byNo) };
}

/** The catalog from the content folder. Server components only. */
export function getCatalog(): Catalog {
  return catalogFrom(getCorpus());
}

const KIND_NOUN: Record<PlaybookKind, [one: string, many: string]> = {
  process: ["playbook", "playbooks"],
  situation: ["scenario", "scenarios"],
  audit: ["audit", "audits"],
};

/** "12 playbooks", "1 audit": a count of one kind of record, in words. */
export function kindCount(kind: PlaybookKind, n: number): string {
  return `${n} ${KIND_NOUN[kind][n === 1 ? 0 : 1]}`;
}

/**
 * What is written, in the catalog's one sentence: "12 playbooks, 6 situations and 1 audit", counted
 * from the records given, by kind in catalog order, leaving out a kind with none written.
 */
export function writtenByKind(records: readonly { kind: PlaybookKind }[]): string {
  return joinAnd(
    PLAYBOOK_KINDS.map((k) => ({ k, n: records.filter((r) => r.kind === k).length }))
      .filter(({ n }) => n > 0)
      .map(({ k, n }) => kindCount(k, n)),
  );
}

/** "60 more are outlined.", or nothing when none are. */
export function moreOutlined(n: number): string {
  return n === 0 ? "" : `${n} more ${n === 1 ? "is" : "are"} outlined.`;
}

/** Records of one kind (and, optionally, one phase or urgency), keeping their order. */
export function pick<T extends { kind: PlaybookKind; phase: Phase; urgency: Urgency | null }>(
  list: readonly T[],
  where: { kind: PlaybookKind; phase?: Phase; urgency?: Urgency },
): T[] {
  return list.filter(
    (r) =>
      r.kind === where.kind &&
      (where.phase === undefined || r.phase === where.phase) &&
      (where.urgency === undefined || r.urgency === where.urgency),
  );
}
