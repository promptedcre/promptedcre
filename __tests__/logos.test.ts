import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRankings } from "@/lib/rankings/load";
import { HOSTS } from "@/lib/hosts";
import { LOGOS, logoLetters, logoSrc } from "@/lib/logos";

// Every company icon the site draws (D218) is a file the company's own site served, kept as
// fetched: its hash is on record in lib/logos.ts, so a file swapped or edited by hand fails here.

const DIR = path.join(process.cwd(), "public", "logos");

// Vendors with no icon on file, each for the reason the fetch recorded on 2026-11-15. A new
// vendor without an icon must be added here on purpose; it draws a letter tile of ours.
const NO_ICON = ["costar", "northwest-registered-agent", "radix-underwriting"];

describe("company icons", () => {
  it("each have one file, as fetched, and each file has its entry", () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
    expect(files.map((f) => f.replace(/\.png$/, "")).sort()).toEqual(Object.keys(LOGOS).sort());
    for (const [id, e] of Object.entries(LOGOS)) {
      const bytes = fs.readFileSync(path.join(DIR, `${id}.png`));
      expect(crypto.createHash("sha256").update(bytes).digest("hex"), id).toBe(e.sha256);
      expect(e.from.startsWith("https://"), id).toBe(true);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(e.on), id).toBe(true);
      expect(logoSrc(id)).toBe(`/logos/${id}.png`);
    }
  });

  it("cover every host, and every ranked company but the ones on record as missing", () => {
    for (const h of HOSTS) expect(logoSrc(h.id), h.id).not.toBeNull();
    const missing = getRankings()
      .markets.flatMap((m) => m.vendors)
      .filter((v) => v.kind !== "government" && logoSrc(v.id) === null)
      .map((v) => v.id)
      .sort();
    expect(missing).toEqual([...NO_ICON].sort());
  });

  it("draw a two-letter tile of ours for a name with no icon", () => {
    expect(logoLetters("CoStar")).toBe("Co");
    expect(logoLetters("Northwest Registered Agent")).toBe("NR");
    expect(logoLetters("Radix Underwriting")).toBe("RU");
  });
});
