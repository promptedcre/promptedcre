import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { playbook, type Playbook } from "../schemas/playbook";
import {
  artifact,
  calculatorRegistry,
  documentIndex,
  marketEntry,
  reviewLedger,
  rule,
  type Artifact,
  type CalculatorEntry,
  type DocumentEntry,
  type MarketEntry,
  type ReviewEntry,
  type Rule,
} from "../schemas/records";
import { formatIssues } from "./issues";

export const ROOT = process.cwd();
export const CONTENT_DIR = path.join(ROOT, "content");
export const RANKINGS_DIR = path.join(ROOT, "rankings");

export type Corpus = {
  playbooks: Playbook[];
  rules: Rule[];
  artifacts: Artifact[];
  documents: DocumentEntry[];
  calculators: CalculatorEntry[];
  markets: MarketEntry[];
  reviews: ReviewEntry[];
};

export function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

export function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJson(full));
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out.sort();
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseFile<S extends z.ZodType>(schema: S, file: string): Parsed<z.output<S>> {
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { ok: false, errors: [`${rel(file)}: not valid JSON (${(err as Error).message})`] };
  }
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: formatIssues(rel(file), result.error, data) };
}

function collect<S extends z.ZodType>(schema: S, files: string[], errors: string[]): z.output<S>[] {
  const values: z.output<S>[] = [];
  for (const file of files) {
    const parsed = parseFile(schema, file);
    if (parsed.ok) values.push(parsed.value);
    else errors.push(...parsed.errors);
  }
  return values;
}

function single<S extends z.ZodType>(schema: S, file: string, errors: string[]): z.output<S> | null {
  if (!fs.existsSync(file)) return null;
  const parsed = parseFile(schema, file);
  if (parsed.ok) return parsed.value;
  errors.push(...parsed.errors);
  return null;
}

export function loadCorpus(): { corpus: Corpus; errors: string[] } {
  const errors: string[] = [];
  const playbooks = collect(playbook, listJson(path.join(CONTENT_DIR, "playbooks")), errors).sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  );
  const rules = collect(rule, listJson(path.join(CONTENT_DIR, "rules")), errors).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const artifacts = collect(artifact, listJson(path.join(CONTENT_DIR, "artifacts")), errors).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const documents =
    single(documentIndex, path.join(CONTENT_DIR, "documents", "index.json"), errors)?.documents ?? [];
  const calculators =
    single(calculatorRegistry, path.join(CONTENT_DIR, "calculators.json"), errors)?.calculators ?? [];
  const marketsDir = path.join(RANKINGS_DIR, "markets");
  const markets = fs.existsSync(marketsDir)
    ? fs
        .readdirSync(marketsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => single(marketEntry, path.join(marketsDir, d.name, "market.json"), errors))
        .filter((m): m is MarketEntry => m !== null)
    : [];
  const reviews = single(reviewLedger, path.join(CONTENT_DIR, "reviews.json"), errors)?.reviews ?? [];
  return { corpus: { playbooks, rules, artifacts, documents, calculators, markets, reviews }, errors };
}

let cached: Corpus | null = null;

// Pages call this. Invalid content fails the build with the readable messages.
export function getCorpus(): Corpus {
  if (cached) return cached;
  const { corpus, errors } = loadCorpus();
  if (errors.length > 0) {
    throw new Error(`Content failed validation:\n${errors.join("\n")}`);
  }
  cached = corpus;
  return corpus;
}

export function getPlaybook(slugValue: string): Playbook | undefined {
  return getCorpus().playbooks.find((p) => p.slug === slugValue);
}
