import { describe, expect, it } from "vitest";
import { computeMetrics } from "@/lib/compute/metrics";
import { planLayout } from "@/lib/compute/plan-layout";
import { playbookFacts } from "@/lib/compute/playbook-facts";
import { stepMarks } from "@/lib/compute/site-facts";
import { DEFAULT_VARIANT, isResearched, openingVariant, type Variant } from "@/lib/compute/variant";
import { getCorpus } from "@/lib/content/load";
import { STRUCTURES, type Jurisdiction, type Structure } from "@/lib/schemas/common";
import type { Playbook } from "@/lib/schemas/playbook";

// A record may be written for fewer than three structures. openingVariant says which view
// the Markdown copy of such a record is made for (and which view its page should open on,
// once the page reads it). Everything computed for a structure a record is not written for
// is empty, never another structure's steps.

const corpus = getCorpus();
const written = corpus.playbooks.filter((p) => p.depth === "full");
const view = (structure: Structure): Variant => ({ ...DEFAULT_VARIANT, structure });

// A written record none of whose steps is limited to a structure, declared as written for fewer.
function redeclared(structure: Structure[], jurisdiction?: Jurisdiction[]): Playbook {
  const base = written.find((p) => p.kind === "process" && p.steps.every((s) => !s.when));
  if (!base) throw new Error("no written record without a step condition");
  return { ...base, written: { structure, jurisdiction: jurisdiction ?? base.written.jurisdiction } };
}

function expectEmpty(pb: Playbook, structure: Structure): void {
  const v = view(structure);
  const where = `${pb.slug} ${structure}`;
  expect(isResearched(pb, v), where).toBe(false);
  const m = computeMetrics(pb, v);
  expect([m.researched, m.total, m.agent, m.agenticPct], where).toEqual([false, 0, 0, null]);
  const f = playbookFacts(pb, v);
  expect([f.steps, f.agent, f.firstPersonStep], where).toEqual([0, 0, null]);
  expect(planLayout(pb, v), where).toEqual({ stages: [], nodes: [] });
  expect(stepMarks(pb, structure), where).toEqual([]);
}

describe("the view a record's file is made for", () => {
  it("is the default view for every record written for it", () => {
    const byDefault = written.filter((pb) => pb.written.structure.includes(DEFAULT_VARIANT.structure));
    expect(byDefault.length).toBeGreaterThan(0);
    for (const pb of byDefault) expect(openingVariant(pb), pb.slug).toEqual(DEFAULT_VARIANT);
  });

  it("is the first structure the record is written for, in the catalog's order", () => {
    expect(openingVariant(redeclared(["jv"]))).toEqual(view("jv"));
    expect(openingVariant(redeclared(["fund"]))).toEqual(view("fund"));
    expect(openingVariant(redeclared(["jv", "fund"]))).toEqual(view("fund"));
    expect(openingVariant(redeclared(["fund", "jv"]))).toEqual(view("fund"));
    expect(openingVariant(redeclared(["jv", "syndication"]))).toEqual(DEFAULT_VARIANT);
  });

  it("is nothing for an outline, for no structure, and for a record that lacks the default coverage", () => {
    const outline = corpus.playbooks.find((p) => p.depth === "outline");
    expect(outline).toBeTruthy();
    expect(openingVariant(outline!)).toBeNull();
    expect(openingVariant(redeclared([]))).toBeNull();
    expect(openingVariant(redeclared(["jv"], ["us-federal"]))).toBeNull();
  });

  it("skips a structure the record is written for but has no step in", () => {
    const base = redeclared(["fund", "jv"]);
    const jvSteps: Playbook = { ...base, steps: base.steps.map((s) => ({ ...s, when: { structure: ["jv"] as Structure[] } })) };
    expect(openingVariant(jvSteps)).toEqual(view("jv"));
    expect(openingVariant({ ...base, steps: [] })).toBeNull();
    // The default view is held to the same rule: written for it, but no step in it.
    const all = redeclared([...STRUCTURES]);
    const allJvSteps: Playbook = { ...all, steps: all.steps.map((s) => ({ ...s, when: { structure: ["jv"] as Structure[] } })) };
    expect(openingVariant(allJvSteps)).toEqual(view("jv"));
  });

  it("is a view with steps for every written record in the catalog", () => {
    for (const pb of written) {
      const v = openingVariant(pb);
      expect(v, pb.slug).not.toBeNull();
      expect(pb.written.structure, pb.slug).toContain(v!.structure);
      expect(computeMetrics(pb, v!).total, pb.slug).toBeGreaterThan(0);
    }
  });
});

describe("a structure a record is not written for", () => {
  it("has steps exactly where the record says it is written", () => {
    for (const pb of written) {
      for (const s of STRUCTURES) {
        const here = pb.written.structure.includes(s);
        expect(computeMetrics(pb, view(s)).total > 0, `${pb.slug} ${s}`).toBe(here);
        if (!here) expectEmpty(pb, s);
      }
    }
  });

  it("is empty for a record written for one structure, whatever the catalog holds", () => {
    const jvOnly = redeclared(["jv"]);
    expectEmpty(jvOnly, "syndication");
    expectEmpty(jvOnly, "fund");
    const m = computeMetrics(jvOnly, view("jv"));
    expect(m.researched).toBe(true);
    expect(m.total).toBe(jvOnly.steps.length);
    expect(stepMarks(jvOnly, "jv")).toHaveLength(jvOnly.steps.length);
    expect(planLayout(jvOnly, view("jv")).nodes).toHaveLength(jvOnly.steps.length);
  });
});
