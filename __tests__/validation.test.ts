import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCorpus, parseFile } from "@/lib/content/load";
import { checkCorpus } from "@/lib/content/semantic";
import { playbook } from "@/lib/schemas/playbook";

const fixture = path.join(process.cwd(), "__tests__", "fixtures", "invalid-playbook.json");

describe("schema validation", () => {
  it("rejects a broken record with one readable line per problem", () => {
    const result = parseFile(playbook, fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.errors.join("\n");
    expect(text).toContain("__tests__/fixtures/invalid-playbook.json › review: Invalid option");
    expect(text).toContain('(got "reviewed-by-someone")');
    expect(text).toContain("lastVerified: expected a date written like 2026-11-11");
    expect(text).toContain('steps[0].mode: Invalid option: expected one of "agent"|"agent-browser"|"human-online"|"human-offline" (got "robot")');
    expect(text).toMatch(/steps\[0\]: Unrecognized key: "colour"/);
  });

  it("loads the real content with no schema errors", () => {
    const { corpus, errors } = loadCorpus();
    expect(errors).toEqual([]);
    expect(corpus.playbooks.length).toBeGreaterThan(0);
    expect(corpus.playbooks.some((p) => p.depth === "full")).toBe(true);
  });

  it("passes every cross-record rule", () => {
    const { corpus } = loadCorpus();
    const { errors } = checkCorpus(corpus);
    expect(errors).toEqual([]);
  });

  it("writes every flagship playbook and situation at full depth", () => {
    const { corpus } = loadCorpus();
    const featured = corpus.playbooks.filter((p) => p.featured);
    expect(featured.filter((p) => p.kind === "process")).toHaveLength(12);
    expect(featured.filter((p) => p.kind === "situation")).toHaveLength(6);
    expect(featured.filter((p) => p.depth !== "full").map((p) => p.id)).toEqual([]);
  });

  it("shows Practitioner-reviewed only on the 12 playbooks approved at Gate B", () => {
    const { corpus } = loadCorpus();
    const reviewed = corpus.playbooks.filter((p) => p.review !== "ai-drafted");
    expect(reviewed).toHaveLength(12);
    expect(reviewed.every((p) => p.featured && p.kind === "process" && p.review === "practitioner-reviewed")).toBe(true);
    expect(corpus.reviews.filter((r) => r.kind === "playbook" && r.gate === "B")).toHaveLength(12);
  });
});

describe("review ledger", () => {
  it("refuses a review chip with no dated approval behind it", () => {
    const { corpus } = loadCorpus();
    const situation = corpus.playbooks.find((p) => p.kind === "situation" && p.depth === "full");
    if (!situation) throw new Error("needs a written situation");
    const promoted = { ...structuredClone(situation), review: "practitioner-reviewed" as const };
    const playbooks = corpus.playbooks.map((p) => (p.id === situation.id ? promoted : p));
    const { errors } = checkCorpus({ ...corpus, playbooks });
    expect(errors.join("\n")).toContain(`playbook:${situation.id}: marked practitioner-reviewed with no matching approval`);
  });
});

describe("cross-record rules", () => {
  it("catches unknown references, bad order and human-only rules", () => {
    const { corpus } = loadCorpus();
    const pilot = corpus.playbooks.find((p) => p.depth === "full");
    expect(pilot).toBeDefined();
    if (!pilot) return;
    const broken = structuredClone(pilot);
    const [first, second] = broken.steps;
    if (!first || !second) throw new Error("pilot needs two steps");
    first.after = [second.id];
    second.rules = ["us-fed.no-such-rule"];
    second.mode = "agent";
    second.approval = "signature";
    const { errors } = checkCorpus({ ...corpus, playbooks: [broken] });
    const text = errors.join("\n");
    expect(text).toContain("which is listed later");
    expect(text).toContain('unknown rule "us-fed.no-such-rule"');
    expect(text).toContain("signatures are always human");
  });
});
