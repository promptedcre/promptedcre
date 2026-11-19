// Plants random denylist entries in synthetic text and checks the matcher catches
// every one. Runs in memory; prints counts only, never a term.
import fs from "node:fs";
import { DENYLIST, LOCAL_DIR } from "./paths.mjs";
import { CATEGORIES, parseDenylist, render, scanText } from "./lib.mjs";

const PER_CATEGORY = 8;

function main() {
  if (!fs.existsSync(DENYLIST)) {
    if (fs.existsSync(LOCAL_DIR)) {
      console.error("Leak-check self-test failed closed: the denylist is missing.");
      return 1;
    }
    console.log("Leak-check self-test skipped: no denylist on this machine.");
    return 0;
  }
  const text = fs.readFileSync(DENYLIST, "utf8");
  const dl = parseDenylist(text);
  const byCat = new Map(CATEGORIES.map((c) => [c, []]));
  for (const raw of text.split(/\r?\n/)) {
    const tab = raw.indexOf("\t");
    if (raw.startsWith("#") || tab < 0) continue;
    byCat.get(raw.slice(0, tab))?.push(raw.slice(tab + 1));
  }

  const report = [];
  let missed = 0;
  for (const [cat, values] of byCat) {
    if (values.length === 0) continue;
    const picks = [];
    const pool = [...values];
    while (picks.length < Math.min(PER_CATEGORY, values.length)) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    let caught = 0;
    for (const value of picks) {
      const line = `Planted for the self-test: ${render(cat, value)} is here.`;
      const hits = scanText(line, dl);
      if (hits.some((h) => h.cat === cat || (cat === "domain" && h.cat === "email"))) caught += 1;
      else missed += 1;
    }
    report.push(`${cat} ${caught}/${picks.length}`);
  }
  if (missed > 0) {
    console.error(`Leak-check self-test FAILED: ${missed} planted entries were not caught (${report.join(", ")}).`);
    return 1;
  }
  console.log(`Leak-check self-test passed: planted and caught ${report.join(", ")}.`);
  return 0;
}

process.exit(main());
