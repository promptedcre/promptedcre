import { describe, expect, it } from "vitest";
import { getStepSoftwareFile, stepKey, stepSoftware } from "@/components/rankings/step-software";
import { getCorpus } from "@/lib/content/load";
import { getRankings } from "@/lib/rankings/load";

// content/step-software.json (D218): which ranked products do each playbook step that names a
// software market. AI-drafted from each product's own description; these hold it to the
// catalog and the rosters, so a step never shows a product from another market or a product
// that is not listed, and no market step is silently left out.

const file = getStepSoftwareFile();
const corpus = getCorpus();
const rosters = new Map(getRankings().markets.map((m) => [m.market.id, new Set(m.vendors.map((v) => v.id))]));
const marketSteps = corpus.playbooks.flatMap((pb) => pb.steps.filter((s) => s.market).map((s) => ({ pb, s })));

describe("the step-to-software map", () => {
  it("says what it is and when it was drafted", () => {
    expect(file.basis).toContain("AI-drafted");
    expect(file.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has one entry for every step that names a market, and no other", () => {
    expect(Object.keys(file.steps).sort()).toEqual(marketSteps.map(({ pb, s }) => stepKey(pb.id, s.id)).sort());
  });

  it("names only products listed in that step's own market, each once", () => {
    for (const { pb, s } of marketSteps) {
      const ids = file.steps[stepKey(pb.id, s.id)] ?? [];
      const roster = rosters.get(s.market!);
      expect(roster, s.market).toBeDefined();
      expect(new Set(ids).size, stepKey(pb.id, s.id)).toBe(ids.length);
      for (const id of ids) expect(roster?.has(id), `${stepKey(pb.id, s.id)}: ${id}`).toBe(true);
    }
  });

  it("draws the scored products first, best first, then the ones not judged yet, at most the number asked", () => {
    for (const { pb, s } of marketSteps) {
      const sw = stepSoftware(pb.id, s.id, s.market, 3);
      if (!sw) continue;
      expect(sw.vendors.length).toBeGreaterThan(0);
      expect(sw.vendors.length).toBeLessThanOrEqual(3);
      const scores = sw.vendors.map((v) => v.score);
      const firstUnjudged = scores.indexOf(null);
      const scored = (firstUnjudged < 0 ? scores : scores.slice(0, firstUnjudged)) as number[];
      expect([...scored].sort((a, b) => b - a)).toEqual(scored);
      // once a product is not judged, none after it is scored
      if (firstUnjudged >= 0) expect(scores.slice(firstUnjudged).every((x) => x === null)).toBe(true);
      for (const v of sw.vendors) expect(file.steps[stepKey(pb.id, s.id)]).toContain(v.id);
    }
  });

  it("gives a registered agent step registered agent services, not the market's top three", () => {
    const sw = stepSoftware("form-sponsor-entity", "line-up-registered-agent", "formation-back-office", 4);
    const names = sw?.vendors.map((v) => v.id) ?? [];
    expect(names.length).toBeGreaterThan(0);
    for (const id of names) expect(["northwest-registered-agent", "csc", "legalzoom", "zenbusiness"]).toContain(id);
    // ZenBusiness is listed and not judged yet (D225): it shows, with no score.
    expect(sw?.vendors.find((v) => v.id === "zenbusiness")?.score).toBeNull();
  });
});
