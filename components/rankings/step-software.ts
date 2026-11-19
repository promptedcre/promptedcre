import fs from "node:fs";
import path from "node:path";
import { getMarketSummary } from "./summary";

// Server only. The software that does one playbook step (D218: the owner's "Map each step"):
// content/step-software.json names, for each step that names a ranked market, the products in
// that market that do the step's work, AI-drafted from each product's own description and
// outside any practitioner review. This turns that list into what a page draws: the ones the
// market's published ranking has scored, best score first, each with its score.
// __tests__/step-software.test.ts holds the file to the catalog and the rosters.

export type StepSoftwareFile = { basis: string; checkedOn: string; steps: Record<string, string[]> };

// `score` is null for a product the ranking lists but has not judged yet (D225: ZenBusiness).
export type StepVendor = { id: string; name: string; government: boolean; score: number | null; href: string };

/** One step's software: its market, and the scored products that do the step, best first. */
export type StepSoftware = { market: { id: string; name: string; href: string }; vendors: StepVendor[] };

const FILE = path.join(process.cwd(), "content", "step-software.json");
let cache: { mtime: number; data: StepSoftwareFile } | null = null;

export function getStepSoftwareFile(): StepSoftwareFile {
  const mtime = fs.statSync(FILE).mtimeMs;
  if (cache?.mtime !== mtime) cache = { mtime, data: JSON.parse(fs.readFileSync(FILE, "utf8")) as StepSoftwareFile };
  return cache.data;
}

/** The key a step goes by in content/step-software.json. */
export const stepKey = (playbookId: string, stepId: string) => `${playbookId}/${stepId}`;

/**
 * The products that do one step: the scored ones first, best score first, then the ones the
 * ranking lists but has not judged yet (score null), in the roster's order; at most `top`.
 * Null when the step names no market, its market is not published, or its list is empty.
 */
export function stepSoftware(playbookId: string, stepId: string, market: string | undefined, top = 3): StepSoftware | null {
  if (!market) return null;
  const ids = getStepSoftwareFile().steps[stepKey(playbookId, stepId)];
  if (!ids || ids.length === 0) return null;
  const summary = getMarketSummary(market);
  if (!summary || !summary.view.published) return null;
  const scored = summary.ranked.filter((r) => ids.includes(r.vendor.id) && r.result.score !== null);
  const unjudged = summary.listed.filter((r) => ids.includes(r.vendor.id) && r.result.score === null);
  const vendors = [...scored, ...unjudged].slice(0, top).map((r) => ({
    id: r.vendor.id,
    name: r.vendor.name,
    government: r.vendor.kind === "government",
    score: r.result.score,
    href: `/rankings/${market}/${r.vendor.id}`,
  }));
  if (vendors.length === 0) return null;
  return { market: { id: market, name: summary.view.market.name, href: `/rankings/${market}` }, vendors };
}
