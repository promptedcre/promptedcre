// Writes the judge's whole input for each vendor that is ready to judge: the judge
// prompt, the market's stories and that vendor's evidence pack, nothing else.
//   npx tsx tools/rankings/judge-input.ts <market-id> [vendor-id ...] [--all]
// Without --all, only vendors whose verdict is missing or stale are written.
// Output: rankings/.work/judge/<market>/<vendor>.md (git-ignored).
import fs from "node:fs";
import path from "node:path";
import { RANKINGS_DIR } from "../../lib/content/load";
import { coverageComplete } from "../../lib/rankings/check";
import { packHash } from "../../lib/rankings/hash";
import { loadRankings } from "../../lib/rankings/load";
import { storiesFor } from "../../lib/rankings/state";
import type { AnyStory, EvidencePack, Vendor } from "../../lib/schemas/rankings";

export const WORK_DIR = path.join(RANKINGS_DIR, ".work", "judge");
export const PROMPT_FILE = path.join(RANKINGS_DIR, "judge-prompt.md");

export function promptVersion(): string {
  const head = fs.readFileSync(PROMPT_FILE, "utf8").match(/prompt version:\s*([\w.-]+)/);
  if (!head?.[1]) throw new Error("judge-prompt.md must start with its prompt version");
  return head[1];
}

export function judgeInput(vendor: Vendor, stories: AnyStory[], pack: EvidencePack): string {
  const prompt = fs.readFileSync(PROMPT_FILE, "utf8").replace(/<!--[\s\S]*?-->\s*/, "");
  const storyLines = stories.map(
    (s) =>
      `- \`${s.id}\`: ${s.title}. ${s.question}\n  Full: ${s.full}\n  Partial: ${s.partial}` +
      (s.na ? `\n  "na" is allowed only when: ${s.na}` : `\n  "na" is not allowed.`),
  );
  const coverage = (["docs", "api", "pricing", "changelog"] as const).map((k) => {
    const c = pack.coverage[k];
    return c ? `- ${k}: ${c.found ? "found" : "checked, none found"}: ${c.url}${c.note ? ` (${c.note})` : ""}` : `- ${k}: not recorded`;
  });
  const items = pack.items.map(
    (i) => `- ${i.id} [${i.tier}] ${i.url} (fetched ${i.fetched}): "${i.excerpt}"${i.note ? `\n  note: ${i.note}` : ""}`,
  );
  return [
    prompt.trim(),
    "",
    `## Stories (${stories.length})`,
    "",
    ...storyLines,
    "",
    `## Evidence pack: ${vendor.name} (\`${vendor.id}\`)`,
    "",
    "Coverage checklist:",
    "",
    ...coverage,
    "",
    `Items (${pack.items.length}):`,
    "",
    ...items,
    "",
  ].join("\n");
}

function main(): void {
  const [market, ...rest] = process.argv.slice(2);
  const all = rest.includes("--all");
  const only = rest.filter((a) => !a.startsWith("--"));
  const { rankings, errors } = loadRankings();
  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  const m = rankings.markets.find((x) => x.market.id === market);
  if (!m) {
    console.error("usage: npx tsx tools/rankings/judge-input.ts <market-id> [vendor-id ...] [--all]");
    process.exit(2);
  }
  const stories = storiesFor(rankings, m);
  const dir = path.join(WORK_DIR, m.market.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const v of m.vendors) {
    if (v.status === "dropped" || (only.length > 0 && !only.includes(v.id))) continue;
    const pack = m.evidence.get(v.id);
    if (!pack || !coverageComplete(pack)) {
      console.log(`skip   ${v.id}: not ready (coverage incomplete)`);
      continue;
    }
    if (pack.items.some((i) => !i.hash)) {
      console.log(`skip   ${v.id}: evidence not sealed`);
      continue;
    }
    const current = m.verdicts.get(v.id);
    if (!all && current && current.evidenceHash === packHash(pack)) {
      console.log(`fresh  ${v.id}: verdict matches the evidence; not re-judged`);
      continue;
    }
    const file = path.join(dir, `${v.id}.md`);
    fs.writeFileSync(file, judgeInput(v, stories, pack));
    console.log(`ready  ${v.id}: ${path.relative(process.cwd(), file)}`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/rankings/judge-input.ts")) main();
