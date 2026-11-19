import { Fragment } from "react";
import { SEARCH_KINDS, highlightPattern, type SearchDoc, type SearchHit, type SearchKind } from "@/lib/search/index";

// What the search page and the search palette share: the kind names, the pages that list
// each kind, grouping hits by kind in one fixed order (written records before outlines),
// loading the one index once per page, and marking matched words.
// Pure and browser-safe (lib/search/index imports only types from the content loader).

// One noun per kind, used the same way in a heading, a chip and a count. The two rankings
// kinds take the rankings pages' own words: a market there is a software market (on a real
// estate site a bare "market" reads as a place), and what is listed in one is a vendor. Every
// listed vendor is in the index, judged or not yet, so the name does not call them all ranked.
const KIND_NOUN: Record<SearchKind, readonly [one: string, many: string]> = {
  // the index files audits under "playbook", so a count and a heading say so
  playbook: ["playbook or audit", "playbooks and audits"],
  situation: ["scenario", "scenarios"],
  calculator: ["calculator", "calculators"],
  rule: ["rule card", "rule cards"],
  artifact: ["firm document", "firm documents"],
  document: ["public form", "public forms"],
  market: ["software market", "software markets"],
  vendor: ["software vendor", "software vendors"],
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const byKind = (name: (kind: SearchKind) => string) => Object.fromEntries(SEARCH_KINDS.map((k) => [k, name(k)])) as Record<SearchKind, string>;

/** A kind as a group's heading: "Playbooks and audits", "Software vendors". */
export const KIND_PLURAL: Record<SearchKind, string> = byKind((k) => capital(KIND_NOUN[k][1]));

/** One record's kind, inside a sentence or a name: "calculator", "software vendor". */
export const KIND_ONE: Record<SearchKind, string> = { ...byKind((k) => KIND_NOUN[k][0]), playbook: "playbook" };

/** One record's kind as a label of its own, where a list mixes kinds: "Calculator", "Software vendor". */
export const kindLabel = (kind: SearchKind) => capital(KIND_ONE[kind]);

/** "19 calculators", "1 software market": a count of one kind, in words. */
export const kindCount = (kind: SearchKind, n: number) => `${n} ${KIND_NOUN[kind][n === 1 ? 0 : 1]}`;

// The site's own page for each kind: the better place to read a whole kind than a list of titles.
export const KIND_PAGE: Record<SearchKind, { href: string; label: string }> = {
  playbook: { href: "/playbooks", label: "Playbooks" },
  situation: { href: "/situations", label: "Scenarios" },
  calculator: { href: "/calculators", label: "Calculators" },
  rule: { href: "/rules", label: "Rules" },
  artifact: { href: "/artifacts", label: "Firm documents" },
  document: { href: "/documents", label: "Public forms" },
  market: { href: "/rankings", label: "Software" },
  vendor: { href: "/rankings", label: "Software" },
};

export type HitGroup = { kind: SearchKind; hits: SearchHit[]; total: number };

// Written records first, then outlines; inside each, the order given (best first, or index order).
export const writtenFirst = <T extends { outline?: boolean }>(hits: readonly T[]): T[] => [...hits.filter((h) => !h.outline), ...hits.filter((h) => h.outline)];

/**
 * Hits grouped by kind, written records before outlines inside each group; a group keeps its
 * first `perGroup` hits. Groups come in SEARCH_KINDS order, or with `byScore` the group holding
 * the best hit first (so the first option is the best match, ties kept in kind order).
 */
export function groupHits(hits: readonly SearchHit[], perGroup = Number.POSITIVE_INFINITY, byScore = false): HitGroup[] {
  const groups = SEARCH_KINDS.map((kind) => {
    const all = writtenFirst(hits.filter((h) => h.kind === kind));
    return { kind, hits: all.slice(0, perGroup), total: all.length, best: Math.max(...all.map((h) => h.score)) };
  }).filter((g) => g.total > 0);
  if (byScore) groups.sort((a, b) => b.best - a.best);
  return groups.map(({ kind, hits: list, total }) => ({ kind, hits: list, total }));
}

export const isExternal = (url: string) => /^https?:\/\//.test(url);

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** The quiet line over a hit's summary: where an outside document lives, or a rule card's id. Null for the rest. */
export const hitMeta = (h: Pick<SearchHit, "kind" | "id" | "url">): string | null => (isExternal(h.url) ? hostOf(h.url) : h.kind === "rule" ? h.id : null);

let pending: Promise<SearchDoc[]> | null = null;

/** Fetches /search-index.json once per page load; a failure clears the cache so a retry can work. */
export function loadSearchIndex(): Promise<SearchDoc[]> {
  if (!pending) {
    pending = fetch("/search-index.json")
      .then((r) => {
        if (!r.ok) throw new Error(`search index: ${r.status}`);
        return r.json() as Promise<{ docs: SearchDoc[] }>;
      })
      .then((j) => j.docs)
      .catch((err: unknown) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

export function countKinds(docs: readonly { kind: SearchKind }[]): Record<SearchKind, number> {
  const out = Object.fromEntries(SEARCH_KINDS.map((k) => [k, 0])) as Record<SearchKind, number>;
  for (const d of docs) out[d.kind] += 1;
  return out;
}

/** "340 records in 8 kinds", counted from the index itself. */
export function indexLine(docs: readonly { kind: SearchKind }[]): string {
  const kinds = new Set(docs.map((d) => d.kind)).size;
  return `${docs.length} ${docs.length === 1 ? "record" : "records"} in ${kinds} ${kinds === 1 ? "kind" : "kinds"}`;
}

/**
 * The text with each query word that appears in it wrapped in <mark>: whole words, as the
 * search matches them. The mark is a step of paper under the word and the text ink on it.
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const pattern = highlightPattern(query);
  if (!pattern) return <>{text}</>;
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-tile text-text">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
