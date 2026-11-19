import { describe, expect, it } from "vitest";
import { computeMetrics } from "@/lib/compute/metrics";
import { MARK_OF, siteFacts, stepMarks, type StepMark } from "@/lib/compute/site-facts";
import { agentShareByStructure } from "@/lib/compute/summary";
import { DEFAULT_VARIANT } from "@/lib/compute/variant";
import { getCorpus } from "@/lib/content/load";
import { STRUCTURES } from "@/lib/schemas/common";
import { STEP_MODES } from "@/lib/schemas/playbook";
import { book, step } from "./helpers/engine";

const corpus = getCorpus();
const facts = siteFacts(corpus);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const countMarks = (marks: StepMark[], ...want: StepMark[]) => marks.filter((m) => want.includes(m)).length;

describe("site facts from the real catalog", () => {
  it("is plain data that survives a JSON round trip", () => {
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
  });

  it("splits every playbook into written or outlined, and by kind", () => {
    const { counts } = facts;
    expect(counts.written + counts.outlined).toBe(counts.playbooks);
    expect(counts.processes + counts.situations + counts.audits).toBe(counts.playbooks);
    expect(sum(Object.values(counts.writtenByKind))).toBe(counts.written);
    expect(sum(Object.values(counts.listedByKind))).toBe(counts.playbooks);
    expect(sum(Object.values(counts.rulesByJurisdiction))).toBe(counts.rules);
    expect(counts.calculatorsLive).toBeLessThanOrEqual(counts.calculators);
    expect(facts.situations).toEqual({ written: counts.writtenByKind.situation, listed: counts.situations });
  });

  it("says the catalog in one counting model, the canonical line computed from the counts", () => {
    const { catalog, counts } = facts;
    expect(catalog.parts.map((p) => p.kind)).toEqual(["process", "situation", "audit"]);
    expect(catalog.parts.map((p) => p.label)).toEqual(["Playbooks", "Situations", "Audits"]);
    for (const p of catalog.parts) {
      expect(p.written).toBe(counts.writtenByKind[p.kind]);
      expect(p.listed).toBe(counts.listedByKind[p.kind]);
    }
    expect(sum(catalog.parts.map((p) => p.written))).toBe(catalog.written);
    expect(sum(catalog.parts.map((p) => p.listed))).toBe(catalog.listed);
    expect(catalog.written).toBe(counts.written);
    expect(catalog.listed).toBe(counts.playbooks);
    const [pb, sit, aud] = catalog.parts;
    // The catalog's one sentence: what is written, by kind, then how many more are outlined.
    // It never carries a denominator; those belong to the ledger.
    const word = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const named = [
      pb!.written > 0 ? word(pb!.written, "playbook", "playbooks") : null,
      sit!.written > 0 ? word(sit!.written, "scenario", "scenarios") : null,
      aud!.written > 0 ? word(aud!.written, "audit", "audits") : null,
    ].filter((x): x is string => x !== null);
    const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named.join("");
    const outlined = catalog.listed - catalog.written;
    expect(catalog.line).toBe(
      `${catalog.written} written in full${list ? `: ${list}` : ""}.` +
        (outlined > 0 ? ` ${outlined} more ${outlined === 1 ? "is" : "are"} outlined.` : ""),
    );
    expect(catalog.line).not.toMatch(/\d+ of \d+/);
  });

  it("matches the home page's agent share, and its marks add up to it", () => {
    const headline = agentShareByStructure(corpus.playbooks);
    for (const s of STRUCTURES) {
      const { modes, cited, practice, ...share } = facts.share[s];
      expect(share).toEqual(headline[s]);
      expect(sum(STEP_MODES.map((m) => modes[m]))).toBe(share.total);
      expect(modes.agent + modes["agent-browser"]).toBe(share.agent);
      // The cited and common-practice counts split the same steps the share counts.
      expect(cited + practice).toBe(share.total);
      expect(cited).toBeLessThanOrEqual(facts.trust.citedSteps);

      const marks = facts.records.flatMap((r) => r.byStructure[s].marks);
      expect(marks.length).toBe(share.total);
      expect(countMarks(marks, "A", "B")).toBe(share.agent);
      for (const mode of STEP_MODES) expect(countMarks(marks, MARK_OF[mode])).toBe(modes[mode]);
    }
  });

  it("gives every written record the same numbers computeMetrics does", () => {
    const written = corpus.playbooks.filter((p) => p.depth === "full");
    expect(facts.records.map((r) => r.slug)).toEqual(written.map((p) => p.slug));
    for (const r of facts.records) {
      const pb = written.find((p) => p.slug === r.slug);
      if (!pb) throw new Error(`no playbook ${r.slug}`);
      for (const s of STRUCTURES) {
        const m = computeMetrics(pb, { ...DEFAULT_VARIANT, structure: s });
        const row = r.byStructure[s];
        expect(row.pct).toBe(m.agenticPct);
        expect(row.total).toBe(m.total);
        expect(row.agent).toBe(m.agent);
        expect(row.marks.length).toBe(m.total);
        expect(countMarks(row.marks, "A", "B")).toBe(m.agent);
      }
    }
  });

  it("covers every process playbook exactly once in the phase list", () => {
    const processes = corpus.playbooks.filter((p) => p.kind === "process").map((p) => p.slug);
    const listed = facts.phases.flatMap((p) => p.playbooks.map((x) => x.slug));
    expect([...listed].sort()).toEqual([...processes].sort());
    expect(new Set(listed).size).toBe(listed.length);
    for (const p of facts.phases) {
      expect(p.written + p.outlined).toBe(p.playbooks.length);
      expect(p.written).toBe(p.playbooks.filter((x) => x.depth === "full").length);
    }
  });

  it("splits written steps into cited and practitioner, and reviews by record", () => {
    const { trust, counts } = facts;
    expect(trust.citedSteps + trust.practiceSteps).toBe(trust.steps);
    expect(sum(Object.values(trust.review))).toBe(counts.written);
    expect(trust.sourcesListed).toBeGreaterThan(0);
  });

  it("dates each review level by its records' sources checks", () => {
    const written = corpus.playbooks.filter((p) => p.depth === "full");
    for (const [level, range] of Object.entries(facts.trust.checked)) {
      const dates = written.filter((p) => p.review === level && p.lastVerified).map((p) => p.lastVerified as string);
      if (dates.length === 0) {
        expect(range).toEqual({ first: null, last: null });
        continue;
      }
      expect(range.first).toBe([...dates].sort()[0]);
      expect(range.last).toBe([...dates].sort().at(-1));
    }
    for (const r of facts.records) expect(r.lastVerified).toBe(written.find((p) => p.slug === r.slug)?.lastVerified);
  });

  it("writes coverage one way: the default jurisdictions, joined with a plus", () => {
    expect(facts.coverage.label).toBe("Federal + Texas");
    expect(facts.coverage.jurisdictions).toEqual(["us-federal", "us-tx"]);
  });

  it("lists every audit, with checks from steps or outline titles", () => {
    const audits = corpus.playbooks.filter((p) => p.kind === "audit");
    expect(facts.audits.map((a) => a.slug)).toEqual(audits.map((a) => a.slug));
    for (const a of facts.audits) {
      expect(a.checkTitles.length).toBe(a.checks);
      if (a.depth === "outline") expect(a.agentChecks).toBeNull();
      else expect(a.agentChecks).not.toBeNull();
    }
    expect(facts.notAudited.length).toBeGreaterThan(0);
  });

  it("takes no marks from an outline", () => {
    const outlines = corpus.playbooks.filter((p) => p.depth === "outline");
    for (const pb of outlines) for (const s of STRUCTURES) expect(stepMarks(pb, s)).toEqual([]);
    const slugs = new Set(outlines.map((p) => p.slug));
    expect(facts.records.some((r) => slugs.has(r.slug))).toBe(false);
  });
});

describe("stepMarks on a synthetic playbook", () => {
  const pb = book("marks", [
    step("a"),
    step("b", { mode: "agent-browser" }),
    step("c", { mode: "human-online", actor: "principal" }),
    step("d", { mode: "human-offline", actor: "principal", when: { structure: ["fund"] } }),
  ]);

  it("keeps a step limited to one structure out of the others", () => {
    expect(stepMarks(pb, "syndication")).toEqual(["A", "B", "H"]);
    expect(stepMarks(pb, "fund")).toEqual(["A", "B", "H", "O"]);
    expect(stepMarks(pb, "jv")).toEqual(["A", "B", "H"]);
  });

  it("is empty for a structure that was not researched, or an outline", () => {
    const syndicationOnly = { ...pb, written: { ...pb.written, structure: ["syndication" as const] } };
    expect(stepMarks(syndicationOnly, "fund")).toEqual([]);
    expect(stepMarks(syndicationOnly, "syndication")).toEqual(["A", "B", "H"]);
    expect(stepMarks({ ...pb, depth: "outline" }, "syndication")).toEqual([]);
  });
});
