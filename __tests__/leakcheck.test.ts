import { describe, expect, it } from "vitest";
import { parseDenylist, render, scanText } from "../tools/leakcheck/lib.mjs";

type Hit = { line: number; col: number; cat: string; len: number };

// Synthetic entries only (digits of pi, e and the square root of two; 555 phone
// numbers; invented names). The real denylist never enters the repo or the tests.
const DENYLIST = [
  "# test denylist",
  "phrase\tquillon brandvold",
  "phrase\t4821 zephyrine",
  "phrase-cs\tWill Price",
  "phrase-cs\tOrvexa",
  "id\tA1b2C3d4E5f6G7h",
  "email\tpat@quillon-example.test",
  "domain\tquillon-example.test",
  "phone\t2025550147",
  "money\t314159300",
  "pct\t2.71",
  "area\t27183",
  "acres\t1.41",
].join("\n");

const dl = parseDenylist(DENYLIST, ["Prompted CRE"]);
const cats = (text: string) => (scanText(text, dl) as Hit[]).map((h) => h.cat);

describe("leak-check matcher", () => {
  it("finds names case-insensitively, across hyphens and line positions", () => {
    expect(cats("Call Quillon Brandvold today")).toEqual(["phrase"]);
    expect(cats("see quillon-brandvold.md")).toEqual(["phrase"]);
    expect(cats("4821 Zephyrine Drive, Suite 100")).toEqual(["phrase"]);
  });

  it("matches everyday-word names only with exact case", () => {
    expect(cats("Will Price called")).toEqual(["phrase-cs"]);
    expect(cats("the rent will price in")).toEqual([]);
    expect(cats("Orvexa signed")).toEqual(["phrase-cs"]);
    expect(cats("orvexa signed")).toEqual([]);
  });

  it("does not match inside longer words", () => {
    expect(cats("quillonbrandvold")).toEqual([]);
    expect(cats("14821 Zephyrine")).toEqual([]);
  });

  it("finds ids, emails, domains and phones in their usual shapes", () => {
    expect(cats("record A1b2C3d4E5f6G7h")).toEqual(["id"]);
    expect(cats("mail pat@quillon-example.test")).toEqual(["email"]);
    expect(cats("mail lee@quillon-example.test")).toEqual(["domain"]);
    expect(cats("see www.quillon-example.test/about")).toEqual(["domain"]);
    for (const p of ["(202) 555-0147", "202-555-0147", "202.555.0147", "+1 202 555 0147", "2025550147"]) {
      expect(cats(`phone ${p}`)).toEqual(["phone"]);
    }
  });

  it("finds figures written several ways", () => {
    expect(cats("price $3,141,593")).toEqual(["money"]);
    expect(cats("price $3.141593M")).toEqual(["money"]);
    expect(cats("price 3,141,593 total")).toEqual(["money"]);
    expect(cats("a 2.71% cap rate")).toEqual(["pct"]);
    expect(cats("27,183 SF building")).toEqual(["area"]);
    expect(cats("27183 sq ft")).toEqual(["area"]);
    expect(cats("on 1.41 acres")).toEqual(["acres"]);
    expect(cats("$3,141,000 and 2.7% and 27,000 SF")).toEqual([]);
  });

  it("drops allowlisted names and reports location without the term", () => {
    const allowed = parseDenylist("phrase\tprompted cre", ["Prompted CRE"]);
    expect(scanText("Prompted CRE", allowed)).toEqual([]);
    const [hit] = scanText("xx Quillon Brandvold", dl) as Hit[];
    expect(hit).toEqual({ line: 1, col: 4, cat: "phrase", len: 17 });
  });

  it("renders entries back to natural text for the self-test", () => {
    for (const [cat, value] of [
      ["money", "314159300"],
      ["pct", "2.71"],
      ["area", "27183"],
      ["acres", "1.41"],
      ["phone", "2025550147"],
      ["domain", "quillon-example.test"],
    ]) {
      const found = cats(`planted ${render(cat, value)} here`);
      expect(found.length).toBeGreaterThan(0);
    }
  });
});
