// Records one judge's output as rankings/markets/<market>/verdicts/<vendor>.json,
// with the evidence hash, prompt version and date. Refuses output that breaks the
// rules, so nothing unchecked reaches the site.
//   npx tsx tools/rankings/record-verdict.ts <market-id> <vendor-id>
// Reads rankings/.work/judge/<market>/<vendor>.out.json.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { rankingsIssues } from "../../lib/rankings/check";
import { packHash } from "../../lib/rankings/hash";
import { loadRankings, MARKETS_DIR } from "../../lib/rankings/load";
import { verdict, verdictFile } from "../../lib/schemas/rankings";
import { promptVersion, WORK_DIR } from "./judge-input";

const judgeOutput = z.object({ judgeModel: z.string().min(3), verdicts: z.array(verdict).min(1) }).strict();

const [market, vendor] = process.argv.slice(2);
if (!market || !vendor) {
  console.error("usage: npx tsx tools/rankings/record-verdict.ts <market-id> <vendor-id>");
  process.exit(2);
}
const outFile = path.join(WORK_DIR, market, `${vendor}.out.json`);
const raw = fs.readFileSync(outFile, "utf8").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
// An empty "missing" means nothing is missing; drop it rather than reject the answer.
// This changes no verdict, quality, citation or rationale.
const answer = JSON.parse(raw) as { verdicts?: { missing?: string }[] };
for (const v of answer.verdicts ?? []) if (typeof v.missing === "string" && v.missing.trim() === "") delete v.missing;
const parsed = judgeOutput.safeParse(answer);
if (!parsed.success) {
  console.error(`judge output for ${vendor} is malformed:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  process.exit(1);
}

const { rankings } = loadRankings();
const m = rankings.markets.find((x) => x.market.id === market);
const pack = m?.evidence.get(vendor);
if (!m || !pack) {
  console.error(`no evidence pack for ${market}/${vendor}`);
  process.exit(1);
}
const record = verdictFile.parse({
  vendor,
  judged: new Date().toISOString().slice(0, 10),
  judgeModel: parsed.data.judgeModel,
  promptVersion: promptVersion(),
  evidenceHash: packHash(pack),
  verdicts: parsed.data.verdicts,
});

// check this vendor's verdicts in place before writing
m.verdicts.set(vendor, record);
const issues = rankingsIssues(rankings).errors.filter((e) => e.startsWith(`${market} › verdicts ${vendor}`));
if (issues.length > 0) {
  for (const e of issues) console.error(`  ${e}`);
  console.error(`not recorded: ${issues.length} problem(s)`);
  process.exit(1);
}
const dir = path.join(MARKETS_DIR, market, "verdicts");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${vendor}.json`), `${JSON.stringify(record, null, 2)}\n`);
console.log(`recorded ${market}/${vendor}: ${record.verdicts.length} verdicts, judge ${record.judgeModel}, ${record.promptVersion}`);
