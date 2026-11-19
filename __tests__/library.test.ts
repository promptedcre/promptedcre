import { describe, expect, it } from "vitest";
import { documentGroups, ruleNamespace, ruleRows, ruleSubjects, ruleTotals, rulesByJurisdiction } from "@/components/library/data";
import { getRankingsSummary } from "@/components/rankings/summary";
import { getCorpus } from "@/lib/content/load";

// What the library and rankings pages print is computed here; these pin the arithmetic so a
// page never shows a count that does not add up.

const corpus = getCorpus();
const today = new Date("2026-11-13T12:00:00Z");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("rule cards", () => {
  const rows = ruleRows(corpus, today);
  const totals = ruleTotals(corpus, rows);

  it("counts every card once, by jurisdiction and by review level", () => {
    expect(totals.cards).toBe(corpus.rules.length);
    expect(sum(rulesByJurisdiction(corpus.rules).map((j) => j.count))).toBe(totals.cards);
    expect(sum(totals.byReview.map((r) => r.count))).toBe(totals.cards);
    // a review level no card has is left out, never printed as a zero
    expect(totals.byReview.every((r) => r.count > 0)).toBe(true);
  });

  it("dates the check from the oldest to the newest card", () => {
    const dates = corpus.rules.map((r) => r.lastVerified).sort();
    expect(totals.oldest).toBe(dates[0]);
    expect(totals.newest).toBe(dates.at(-1));
  });

  it("groups every card into exactly one subject, read off its id, with the jurisdictions it holds", () => {
    const subjects = ruleSubjects(rows);
    const all = subjects.flatMap((s) => s.rows);
    expect(all).toHaveLength(totals.cards);
    expect(new Set(all.map((r) => r.rule.id)).size).toBe(totals.cards);
    for (const s of subjects) {
      expect(s.rows.length).toBeGreaterThan(0);
      expect(new Set(s.rows.map((r) => r.rule.jurisdiction))).toEqual(new Set(s.jurisdictions));
      // a subject gathers whole namespaces: no namespace is split across two subjects
      for (const r of s.rows) {
        const ns = ruleNamespace(r.rule.id);
        expect(subjects.filter((o) => o.rows.some((x) => ruleNamespace(x.rule.id) === ns && x.rule.jurisdiction === r.rule.jurisdiction))).toHaveLength(1);
      }
    }
  });

  it("cites a card only from written steps, and its step count is the sum over records", () => {
    for (const row of rows) {
      expect(row.steps).toBe(sum(row.records.map((r) => r.steps)));
      for (const r of row.records) expect(r.record.written).toBe(true);
    }
  });
});

describe("documents", () => {
  it("lists every document once, in exactly one phase", () => {
    const groups = documentGroups(corpus.documents, today);
    const all = groups.flatMap((g) => g.rows);
    expect(all).toHaveLength(corpus.documents.length);
    expect(new Set(all.map((r) => r.doc.id)).size).toBe(corpus.documents.length);
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
  });
});

describe("rankings summary", () => {
  const { markets, totals } = getRankingsSummary();

  it("adds the markets up to the totals the index prints", () => {
    expect(totals.markets).toBe(markets.length);
    expect(totals.listed).toBe(sum(markets.map((m) => m.listed.length)));
    expect(totals.judged).toBe(sum(markets.map((m) => m.judged.length)));
    expect(totals.judged).toBeLessThanOrEqual(totals.listed);
  });

  it("ranks a published market's judged vendors 1, 2, 3 in score order", () => {
    for (const m of markets) {
      if (!m.view.published) {
        expect(m.ranked).toHaveLength(0);
        continue;
      }
      expect(m.ranked.map((r) => r.rank)).toEqual(m.ranked.map((_, i) => i + 1));
      const scores = m.ranked.map((r) => r.result.score ?? 0);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    }
  });
});
