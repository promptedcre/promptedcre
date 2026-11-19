// Validates every content record, the cross-record rules, and the example firm
// file. Usage:
//   npm run validate
//   npm run validate -- --file path/to/record.json --type playbook|rule|artifact
import path from "node:path";
import type { z } from "zod";
import { loadCorpus, parseFile, rel, CONTENT_DIR } from "../lib/content/load";
import { checkCorpus } from "../lib/content/semantic";
import { firmArtifacts, firmDecisions, firmProfile, firmProgress, findSecrets } from "../lib/schemas/firm";
import { playbook } from "../lib/schemas/playbook";
import { artifact, rule } from "../lib/schemas/records";

const SCHEMAS: Record<string, z.ZodType> = { playbook, rule, artifact };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function validateOne(file: string, type: string): number {
  const schema = SCHEMAS[type];
  if (!schema) {
    console.error(`Unknown --type "${type}". Use one of: ${Object.keys(SCHEMAS).join(", ")}`);
    return 2;
  }
  const parsed = parseFile(schema, file);
  if (parsed.ok) {
    console.log(`OK  ${rel(file)} is a valid ${type}`);
    return 0;
  }
  console.error(`${parsed.errors.length} problem(s) in ${rel(file)}:`);
  for (const line of parsed.errors) console.error(`  ${line}`);
  return 1;
}

function validateFirm(errors: string[]): void {
  const dir = path.join(CONTENT_DIR, "example-firm");
  const parts: Array<[string, z.ZodType]> = [
    ["firm.json", firmProfile],
    ["decisions.json", firmDecisions],
    ["progress.json", firmProgress],
    ["artifacts.json", firmArtifacts],
  ];
  for (const [name, schema] of parts) {
    const file = path.join(dir, name);
    const parsed = parseFile(schema, file);
    if (!parsed.ok) {
      errors.push(...parsed.errors);
      continue;
    }
    for (const msg of findSecrets(parsed.value)) errors.push(`${rel(file)} › ${msg}`);
  }
}

function main(): number {
  const file = arg("--file");
  if (file) {
    const abs = path.resolve(file);
    const type = arg("--type") ?? (abs.includes(`${path.sep}rules${path.sep}`) ? "rule" : "playbook");
    return validateOne(abs, type);
  }

  const { corpus, errors } = loadCorpus();
  validateFirm(errors);
  const check = checkCorpus(corpus);
  errors.push(...check.errors);

  for (const w of check.warnings) console.warn(`warn  ${w}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    return 1;
  }
  const full = corpus.playbooks.filter((p) => p.depth === "full").length;
  console.log(
    `OK  ${corpus.playbooks.length} playbooks (${full} full, ${corpus.playbooks.length - full} outline), ` +
      `${corpus.rules.length} rules, ${corpus.artifacts.length} artifacts, ${corpus.documents.length} documents, ` +
      `${corpus.calculators.length} calculators, ${corpus.markets.length} markets, example firm valid`,
  );
  return 0;
}

process.exit(main());
