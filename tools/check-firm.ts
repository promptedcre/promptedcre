// Checks a firm-file folder an agent wrote: each file against its schema, no
// secrets, and progress step ids that exist in the playbooks they name.
//   npx tsx tools/check-firm.ts <folder>
// Runs from any folder: the content loader reads files relative to the working
// folder, so this script moves to the repo before loading it.
import fs from "node:fs";
import path from "node:path";
import { findSecrets, firmArtifacts, firmDecisions, firmProfile, firmProgress } from "../lib/schemas/firm";

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx tools/check-firm.ts <folder>");
    process.exit(2);
  }
  const dir = path.resolve(arg);
  process.chdir(path.resolve(path.dirname(process.argv[1] ?? "."), ".."));
  const { getCorpus, parseFile } = await import("../lib/content/load");

  const FILES = [
    ["firm.json", firmProfile],
    ["decisions.json", firmDecisions],
    ["progress.json", firmProgress],
    ["artifacts.json", firmArtifacts],
  ] as const;

  const problems: string[] = [];
  const parsed = new Map<string, unknown>();
  for (const [name, schema] of FILES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      problems.push(`${name}: missing`);
      continue;
    }
    const result = parseFile(schema, file);
    if (!result.ok) problems.push(...result.errors);
    else parsed.set(name, result.value);
    problems.push(...findSecrets(JSON.parse(fs.readFileSync(file, "utf8")), [name]));
  }

  const progress = parsed.get("progress.json") as
    | { playbooks: Record<string, { steps: Record<string, unknown> }>; other?: { task: string; playbook: string | null }[] }
    | undefined;
  if (progress) {
    const { playbooks } = getCorpus();
    for (const [slug, entry] of Object.entries(progress.playbooks)) {
      const pb = playbooks.find((p) => p.slug === slug);
      if (!pb) {
        problems.push(`progress.json › ${slug}: no such playbook`);
        continue;
      }
      const ids = new Set(pb.steps.map((s) => s.id));
      for (const step of Object.keys(entry.steps)) if (!ids.has(step)) problems.push(`progress.json › ${slug} › ${step}: no such step`);
    }
    for (const item of progress.other ?? []) {
      if (item.playbook && !playbooks.some((p) => p.slug === item.playbook)) problems.push(`progress.json › other › "${item.task}": no such playbook "${item.playbook}"`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    console.error(`FAIL  ${problems.length} problem(s) in ${dir}`);
    process.exit(1);
  }
  console.log(`OK  ${FILES.length} files valid, no secrets, progress step ids match their playbooks (${dir})`);
}

void main();
