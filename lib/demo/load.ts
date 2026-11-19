import fs from "node:fs";
import path from "node:path";
import { formatIssues } from "../content/issues";
import { demoRun, type DemoRun } from "../schemas/demo";

// The recorded engine run the home page shows: content/demo/run.json, read
// relative to the working folder the way lib/content/load.ts reads the catalog.

const DEMO_FILE =path.join("content", "demo", "run.json");

// Kept until the file changes, so a running dev server picks up "npm run demo:record".
let cached: { mtimeMs: number; run: DemoRun } | null = null;

export function getDemoRun(): DemoRun {
  const file = path.join(process.cwd(), DEMO_FILE);
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    // Missing: the read below says how to regenerate it.
  }
  if (cached && cached.mtimeMs === mtimeMs) return cached.run;
  const rel = DEMO_FILE.split(path.sep).join("/");
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${rel} could not be read as JSON (${(err as Error).message}). Regenerate it with "npm run demo:record".`);
  }
  const parsed = demoRun.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${rel} failed validation:\n${formatIssues(rel, parsed.error, data).join("\n")}\nRegenerate it with "npm run demo:record".`);
  }
  cached = { mtimeMs, run: parsed.data };
  return parsed.data;
}
