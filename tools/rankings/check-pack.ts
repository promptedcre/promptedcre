// Checks one evidence pack before it is sealed.
//   npx tsx tools/rankings/check-pack.ts rankings/markets/<market>/evidence/<vendor>.json
import path from "node:path";
import { parseFile } from "../../lib/content/load";
import { packIssues } from "../../lib/rankings/check";
import { evidencePack } from "../../lib/schemas/rankings";

const file = process.argv[2];
if (!file) {
  console.error("usage: npx tsx tools/rankings/check-pack.ts <evidence file>");
  process.exit(2);
}
const parsed = parseFile(evidencePack, path.resolve(file));
if (!parsed.ok) {
  for (const e of parsed.errors) console.error(e);
  process.exit(1);
}
const issues = packIssues(parsed.value, path.basename(file, ".json"));
for (const i of issues.errors) console.error(`error  ${i}`);
for (const i of issues.warnings) console.warn(`warn   ${i}`);
const p = parsed.value;
const keys = Object.keys(p.coverage).join(", ") || "none";
console.log(`${issues.errors.length === 0 ? "OK" : "FAIL"}  ${p.vendor}: ${p.items.length} items; coverage: ${keys}`);
process.exit(issues.errors.length === 0 ? 0 : 1);
