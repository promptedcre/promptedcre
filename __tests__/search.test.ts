import { describe, expect, it } from "vitest";
import { KIND_ONE, KIND_PLURAL, groupHits, indexLine, kindCount, kindLabel, writtenFirst } from "@/components/library/search-shared";
import { loadCorpus } from "@/lib/content/load";
import { loadRankings } from "@/lib/rankings/load";
import { SEARCH_KINDS, buildSearchIndex, highlightPattern, nearestTitles, queryTerms, searchIndex, type SearchDoc } from "@/lib/search/index";

// Synthetic records: the ranking rules, without depending on what the catalog says today.
const doc = (id: string, title: string, body = "", outline = false): SearchDoc => ({
  kind: "playbook",
  id,
  title,
  url: `/playbooks/${id}`,
  summary: "",
  text: `${title} ${body}`.toLowerCase(),
  ...(outline ? { outline: true } : {}),
});

describe("search ranking", () => {
  it('finds the Form D playbook first for "form d"', () => {
    const docs = buildSearchIndex(loadCorpus().corpus, loadRankings().rankings);
    const hits = searchIndex(docs, "form d", ["playbook"], 5);
    expect(hits[0]?.id).toBe("file-form-d-and-state-notices");
    // a record that only says "formation" or "information" is not a match for "form"
    const all = searchIndex(docs, "form d", undefined, docs.length);
    for (const h of all) {
      const d = docs.find((x) => x.kind === h.kind && x.id === h.id);
      expect(d?.text, h.title).toMatch(/(?<![a-z0-9])(form|forms|formed|forming|d)(?![a-z0-9])/);
    }
  });

  it('matches whole words: "rent" finds "rents" but not "current"', () => {
    const docs = [doc("a", "Keep the books current"), doc("b", "Collect the rents"), doc("c", "Rent roll")];
    const ids = searchIndex(docs, "rent").map((h) => h.id);
    expect([...ids].sort()).toEqual(["b", "c"]);
    expect(searchIndex([doc("x", "Information and formation")], "form")).toEqual([]);
  });

  it("counts a one-letter word next to another word, and never alone", () => {
    expect(queryTerms("form d")).toEqual(["form", "d"]);
    expect(queryTerms("d")).toEqual([]);
    const docs = [
      doc("form-id", "Form ID", "apply for edgar access"),
      doc("form-d", "File Form D", "the notice of exempt offering"),
      doc("only-d", "Schedule D", "capital gains"),
    ];
    const hits = searchIndex(docs, "form d");
    expect(hits[0]?.id).toBe("form-d");
    expect(hits.map((h) => h.id)).toContain("form-id");
    // "d" alone does not make "Schedule D" a match for "form d"
    expect(hits.map((h) => h.id)).not.toContain("only-d");
    expect(searchIndex(docs, "d")).toEqual([]);
  });

  it("ranks a title holding the whole query above one holding its words apart", () => {
    const docs = [doc("apart", "Call the lender about capital"), doc("phrase", "Send a capital call")];
    expect(searchIndex(docs, "capital call")[0]?.id).toBe("phrase");
  });

  it("marks whole words only", () => {
    const re = highlightPattern("form d");
    expect(re).not.toBeNull();
    const parts = "File Form D with information".split(re as RegExp);
    expect(parts.filter((_, i) => i % 2 === 1)).toEqual(["Form", "D"]);
    expect(highlightPattern("d")).toBeNull();
  });
});

describe("what the index holds", () => {
  const { corpus } = loadCorpus();
  const { rankings } = loadRankings();
  const docs = buildSearchIndex(corpus, rankings);
  const of = (kind: SearchDoc["kind"]) => docs.filter((d) => d.kind === kind);

  it("holds every calculator that has a page, and finds one by its name", () => {
    const live = corpus.calculators.filter((c) => c.status === "live");
    expect(live.length).toBeGreaterThan(0);
    expect(of("calculator").map((d) => d.id)).toEqual(live.map((c) => c.id));
    for (const c of live) {
      expect(searchIndex(docs, c.name, ["calculator"], 3)[0]?.id, c.name).toBe(c.id);
      expect(of("calculator").find((d) => d.id === c.id)?.url).toBe(`/calculators/${c.id}`);
    }
    // the search a reviewer tried: "waterfall" found two outlines and no calculator
    expect(searchIndex(docs, "waterfall", undefined, docs.length).some((h) => h.kind === "calculator" && h.id === "waterfall-promote")).toBe(true);
  });

  it("holds every ranked market, and finds it by its name", () => {
    expect(rankings.markets.length).toBeGreaterThan(0);
    expect(of("market").map((d) => d.id)).toEqual(rankings.markets.map((m) => m.market.id));
    for (const m of rankings.markets) {
      expect(searchIndex(docs, m.market.name, ["market"], 3)[0]?.id, m.market.name).toBe(m.market.id);
    }
  });

  it("marks an outline as an outline, and nothing else", () => {
    const outlined = corpus.playbooks.filter((p) => p.depth === "outline").map((p) => p.id);
    expect(docs.filter((d) => d.outline).map((d) => d.id).sort()).toEqual([...outlined].sort());
    for (const d of docs) if (d.outline !== undefined) expect(d.outline).toBe(true);
    // a hit carries the mark, so a list can say "Outline" without asking the catalog again
    const first = docs.find((d) => d.outline);
    if (first) {
      const hits = searchIndex(docs, first.title, [first.kind], docs.length);
      expect(hits.find((h) => h.id === first.id)?.outline).toBe(true);
      expect(hits.filter((h) => !docs.find((d) => d.kind === h.kind && d.id === h.id)?.outline).every((h) => h.outline === undefined)).toBe(true);
    }
  });

  it("files every record under a kind the pages know, and counts them in one line", () => {
    for (const d of docs) expect(SEARCH_KINDS).toContain(d.kind);
    const kinds = new Set(docs.map((d) => d.kind)).size;
    expect(indexLine(docs)).toBe(`${docs.length} records in ${kinds} kinds`);
  });

  it("names each kind with one noun: in a heading, on a chip and in a count", () => {
    for (const k of SEARCH_KINDS) {
      expect(kindCount(k, 2)).toBe(`2 ${KIND_PLURAL[k].toLowerCase()}`);
      expect(kindLabel(k).toLowerCase()).toBe(KIND_ONE[k]);
    }
    expect(kindCount("market", 1)).toBe("1 software market");
    expect(kindCount("vendor", 1)).toBe("1 software vendor");
    // every listed vendor is in the index, judged or not yet, so no name calls them all ranked
    expect(of("vendor")).toHaveLength(rankings.markets.reduce((n, m) => n + m.vendors.length, 0));
    for (const k of ["market", "vendor"] as const) expect(`${KIND_PLURAL[k]} ${KIND_ONE[k]}`).not.toMatch(/ranked/i);
  });
});

describe("written records before outlines", () => {
  it("lists a kind's written hits first, each part best first", () => {
    const docs = [
      doc("outline-best", "Make a distribution", "distribution distribution", true),
      doc("written-weak", "Close the books", "a distribution is recorded"),
      doc("written-strong", "Plan the distribution", "distribution"),
      doc("outline-weak", "Wind down", "final distribution", true),
    ];
    const hits = searchIndex(docs, "distribution", undefined, docs.length);
    // by relevance alone the outline with the word in its title leads
    expect(hits[0]?.id).toBe("outline-best");
    const [group] = groupHits(hits);
    expect(group?.hits.map((h) => h.id)).toEqual(["written-strong", "written-weak", "outline-best", "outline-weak"]);
    expect(writtenFirst(hits).map((h) => h.outline === true)).toEqual([false, false, true, true]);
    // a group cut short keeps its written hits
    expect(groupHits(hits, 2)[0]?.hits.map((h) => h.id)).toEqual(["written-strong", "written-weak"]);
    expect(groupHits(hits, 2)[0]?.total).toBe(4);
  });

  it("breaks a tie in favor of the written record", () => {
    const docs = [doc("a-outline", "Alpha rent roll", "", true), doc("b-written", "Beta rent roll")];
    expect(searchIndex(docs, "rent roll").map((h) => h.id)).toEqual(["b-written", "a-outline"]);
  });
});

describe("the nearest titles, when nothing matches", () => {
  const docs = [
    doc("call", "Call capital and fund a closing"),
    doc("waterfall", "Waterfall and promote"),
    doc("books", "Keep the books current"),
    doc("outline", "Capital account statements", "", true),
  ];

  it("finds a title through a misspelled word", () => {
    expect(searchIndex(docs, "captial cal")).toEqual([]);
    expect(nearestTitles(docs, "captial cal").map((h) => h.id)).toEqual(["call"]);
    expect(nearestTitles(docs, "waterfal").map((h) => h.id)).toEqual(["waterfall"]);
  });

  it("finds a title from a word still being typed", () => {
    expect(searchIndex(docs, "waterf")).toEqual([]);
    expect(nearestTitles(docs, "waterf").map((h) => h.id)).toEqual(["waterfall"]);
  });

  it("puts a written record before an outline that is as near", () => {
    expect(nearestTitles(docs, "capitol").map((h) => h.id)).toEqual(["call", "outline"]);
  });

  it("offers nothing when nothing is near, and never more than asked", () => {
    expect(nearestTitles(docs, "zzqxv")).toEqual([]);
    expect(nearestTitles(docs, "d")).toEqual([]);
    expect(nearestTitles(docs, "")).toEqual([]);
    expect(nearestTitles(docs, "capital", 1)).toHaveLength(1);
    expect(nearestTitles(docs, "waterfal", 5, ["rule"])).toEqual([]);
  });
});
