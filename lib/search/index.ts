import type { Corpus } from "../content/load";
import type { Rankings } from "../rankings/load";

// One search index, built from the content and rankings files. The site serves
// it at /search-index.json for the search page; the MCP `search` tool uses the
// same builder in process.

// The kinds, in the order the search page lists them: the catalog first, then the tools
// that work on it, then what the catalog rests on, then the rankings.
export const SEARCH_KINDS = ["playbook", "situation", "calculator", "rule", "artifact", "document", "market", "vendor"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export type SearchDoc = {
  kind: SearchKind;
  id: string;
  title: string;
  url: string;
  // short line shown under a hit
  summary: string;
  // everything searchable, lower-cased
  text: string;
  // true for a playbook, situation or audit that is listed but not written yet; left out otherwise
  outline?: boolean;
};

export type SearchHit = Omit<SearchDoc, "text"> & { score: number };

const STOP = new Set(
  "a an and are as at be by can do does for from has have how i if in is it its me my of on or our so that the their them then there they this to was we what when where which who why will with you your".split(" "),
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$%.\- ]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((t) => t.length > 0);
}

export function tokens(text: string): string[] {
  return words(text).filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * The words a query searches for. A one-letter word counts when the query has a longer word
 * beside it, so "form d" searches for "form" and "d"; "d" alone searches for nothing.
 */
export function queryTerms(query: string): string[] {
  const all = words(query).filter((t) => !STOP.has(t));
  return all.some((t) => t.length > 1) ? [...new Set(all)] : [];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A word's stem, crudely: "filing" and "filed" become "fil", "leases" "leas", "notes" "note".
function stemOf(t: string): string {
  if (t.length <= 4) return t;
  const ingEd = t.match(/^(.{3,}?)(ing|ed)$/);
  if (ingEd?.[1]) return ingEd[1];
  if (/(s|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (/[^su]s$/.test(t) && !/is$/.test(t)) return t.slice(0, -1);
  return t;
}

/**
 * The pattern one query word matches: whole words only, so "rent" finds "rent", "rents" and
 * "rented" but not "current", and "form" does not find "information" or "formation".
 * A word of one or two letters matches only itself.
 */
export function termSource(term: string): string {
  const body = term.length <= 2 ? escapeRe(term) : `${escapeRe(stemOf(term))}(?:e|s|es|ed|ing|ings)?`;
  return `(?<![a-z0-9])${body}(?![a-z0-9])`;
}

/** The query's words as one pattern with a single capture group, for marking matches in text; null for no words. */
export function highlightPattern(query: string): RegExp | null {
  const terms = queryTerms(query).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return null;
  return new RegExp(`(${terms.map((t) => `(?:${termSource(t)})`).join("|")})`, "gi");
}

export function buildSearchIndex(c: Corpus, r: Rankings): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const p of c.playbooks) {
    const steps = p.depth === "full" ? p.steps.map((s) => `${s.title} ${s.instruction}`).join(" ") : p.outlineSteps.join(" ");
    docs.push({
      kind: p.kind === "situation" ? "situation" : "playbook",
      id: p.id,
      title: p.title,
      url: `/playbooks/${p.slug}`,
      summary: p.summary,
      text: `${p.title} ${p.summary} ${p.situation?.trigger ?? ""} ${steps}`.toLowerCase(),
      ...(p.depth === "outline" ? { outline: true } : {}),
    });
  }
  // A calculator is found by its name, what it works out and how (its method lines); only
  // the live ones have a page.
  for (const calc of c.calculators) {
    if (calc.status !== "live") continue;
    docs.push({
      kind: "calculator",
      id: calc.id,
      title: calc.name,
      url: `/calculators/${calc.id}`,
      summary: calc.what,
      text: `${calc.name} ${calc.what} ${calc.method.join(" ")}`.toLowerCase(),
    });
  }
  for (const rule of c.rules) {
    docs.push({ kind: "rule", id: rule.id, title: rule.title, url: `/rules#rule-${rule.id}`, summary: rule.rule, text: `${rule.title} ${rule.rule} ${rule.citation.authority}`.toLowerCase() });
  }
  for (const a of c.artifacts) {
    docs.push({ kind: "artifact", id: a.id, title: a.name, url: `/artifacts#${a.id}`, summary: a.what, text: `${a.name} ${a.what} ${a.fields.map((f) => f.label).join(" ")}`.toLowerCase() });
  }
  for (const d of c.documents) {
    docs.push({ kind: "document", id: d.id, title: d.title, url: d.url, summary: `${d.publisher}. ${d.useCase}`, text: `${d.title} ${d.publisher} ${d.useCase}`.toLowerCase() });
  }
  // A software market the rankings cover, then every vendor listed in it, judged or not yet.
  for (const m of r.markets) {
    docs.push({
      kind: "market",
      id: m.market.id,
      title: m.market.name,
      url: `/rankings/${m.market.id}`,
      summary: m.market.what,
      text: `${m.market.name} ${m.market.what}`.toLowerCase(),
    });
  }
  for (const m of r.markets) {
    for (const v of m.vendors) {
      docs.push({
        kind: "vendor",
        id: `${m.market.id}/${v.id}`,
        title: v.name,
        url: `/rankings/${m.market.id}/${v.id}`,
        summary: `${v.what} Market: ${m.market.name}.`,
        text: `${v.name} ${v.what} ${m.market.name}`.toLowerCase(),
      });
    }
  }
  return docs;
}

const toHit = (d: SearchDoc, score: number): SearchHit => ({
  kind: d.kind,
  id: d.id,
  title: d.title,
  url: d.url,
  summary: d.summary,
  ...(d.outline ? { outline: true } : {}),
  score,
});

// Words match whole words (see termSource). A title match counts three; each mention in the text
// counts once, up to three; the sum is scaled by the share of the query's words found; a document
// holding the whole query as written gains a bonus, more when it is in the title. Best first; at
// the same score a written record comes before an outline.
export function searchIndex(docs: readonly SearchDoc[], query: string, kinds: readonly SearchKind[] = SEARCH_KINDS, limit = 10): SearchHit[] {
  const terms = queryTerms(query).map((t) => ({ t, re: new RegExp(termSource(t), "g") }));
  if (terms.length === 0) return [];
  // the whole query as a phrase, stop words included ("form the sponsor entity")
  const all = words(query);
  const phrase = all.length > 1 ? new RegExp(`(?<![a-z0-9])${all.map(escapeRe).join("[^a-z0-9]+")}(?![a-z0-9])`) : null;
  const hits: SearchHit[] = [];
  for (const d of docs) {
    if (!kinds.includes(d.kind)) continue;
    const title = d.title.toLowerCase();
    let score = 0;
    let matched = 0;
    let matchedLong = false;
    for (const { t, re } of terms) {
      re.lastIndex = 0;
      const inTitle = re.test(title);
      const count = d.text.match(re)?.length ?? 0;
      if (inTitle || count > 0) {
        matched += 1;
        if (t.length > 1) matchedLong = true;
      }
      score += (inTitle ? 3 : 0) + Math.min(count, 3);
    }
    // a one-letter word never makes a match on its own
    if (!matchedLong) continue;
    // reward documents that match more of the query's words
    score *= matched / terms.length;
    // and those that hold the query as written, in the title most of all
    if (phrase) score += phrase.test(title) ? 6 : phrase.test(d.text) ? 2 : 0;
    hits.push(toHit(d, Math.round(score * 100) / 100));
  }
  return hits.sort((a, b) => b.score - a.score || Number(a.outline ?? false) - Number(b.outline ?? false) || a.title.localeCompare(b.title)).slice(0, limit);
}

// How many single-letter edits (insert, delete, replace, or swap two neighbours) turn a into b.
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  const at = (i: number, j: number) => d[i]?.[j] ?? 0;
  for (let i = 1; i < rows; i++) {
    const row = d[i];
    if (!row) continue;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, at(i - 2, j - 2) + 1);
      row[j] = v;
    }
  }
  return at(a.length, b.length);
}

// How alike a typed word and a title's word are, 0 to 1. A word still being typed counts
// as the start of the longer one ("waterf" and "waterfall"); otherwise by edits per letter.
function likeness(typed: string, word: string): number {
  if (typed === word) return 1;
  if (typed.length >= 3 && word.startsWith(typed)) return 0.9;
  if (typed.length < 3 || word.length < 3) return 0;
  return 1 - editDistance(typed, word) / Math.max(typed.length, word.length);
}

// A title is "near" from this likeness up: one wrong letter in five, two in eight.
const NEAR = 0.72;

/**
 * The titles nearest to a query that matched nothing: a word misspelled ("captial call"), or
 * still being typed ("waterf"). Each of the query's words is compared with each word of a
 * title; a title is near when every query word has a near word in it, or, for a longer query,
 * all but one. Nearest first, written records before outlines. An empty list means nothing in
 * the index is close: say so, and offer the list of everything.
 */
export function nearestTitles(docs: readonly SearchDoc[], query: string, limit = 5, kinds: readonly SearchKind[] = SEARCH_KINDS): SearchHit[] {
  const typed = [...new Set(words(query).filter((t) => t.length > 1 && !STOP.has(t)))];
  if (typed.length === 0) return [];
  const need = typed.length > 2 ? typed.length - 1 : typed.length;
  const near: SearchHit[] = [];
  for (const d of docs) {
    if (!kinds.includes(d.kind)) continue;
    const titleWords = words(d.title);
    let sum = 0;
    let found = 0;
    for (const t of typed) {
      let best = 0;
      for (const w of titleWords) best = Math.max(best, likeness(t, w));
      if (best >= NEAR) {
        found += 1;
        sum += best;
      }
    }
    if (found < need) continue;
    near.push(toHit(d, Math.round((sum / typed.length) * 100) / 100));
  }
  return near.sort((a, b) => b.score - a.score || Number(a.outline ?? false) - Number(b.outline ?? false) || a.title.localeCompare(b.title)).slice(0, limit);
}
