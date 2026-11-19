import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The official Texas statutes site serves only an application shell to scripts, so a
// source on it cannot be re-checked. Statute text read for a card is recorded at the
// Legislature's text server; the official address may stay in citation.url only.
const dir = path.join(process.cwd(), "content", "rules", "us-tx");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

const OFFICIAL = /^https?:\/\/statutes\.capitol\.texas\.gov\//i;
const TEXT_SERVER = /^https:\/\/tcss\.legis\.texas\.gov\/resources\/([A-Z]{2})\/htm\/\1\.[0-9A-Z]+\.htm$/;

type Source = { id: string; url: string; tier: string };
type Card = { id: string; citation?: { url?: string }; sources?: Source[] };

describe("Texas rule card sources", () => {
  it("finds the Texas cards", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s reads statute text at tcss.legis.texas.gov", (file) => {
    const card = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Card;
    const all = card.sources ?? [];
    const primary = all.filter((s) => s.tier === "primary");
    const onOfficial = all.filter((s) => OFFICIAL.test(s.url)).map((s) => s.id);
    expect(onOfficial, `${card.id}: sources on statutes.capitol.texas.gov (citation.url only)`).toEqual([]);
    const badText = primary
      .filter((s) => /tcss\.legis\.texas\.gov/i.test(s.url) && !TEXT_SERVER.test(s.url))
      .map((s) => s.url);
    expect(badText, `${card.id}: malformed tcss.legis.texas.gov address`).toEqual([]);
  });

  it("keeps the official address allowed in citation.url", () => {
    const cited = files
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Card)
      .filter((c) => OFFICIAL.test(c.citation?.url ?? ""));
    for (const c of cited) {
      expect(c.citation?.url).toMatch(/^https:\/\/statutes\.capitol\.texas\.gov\/Docs\/[A-Z]{2}\/htm\/[A-Z]{2}\.[0-9A-Z]+\.htm$/);
    }
  });
});
