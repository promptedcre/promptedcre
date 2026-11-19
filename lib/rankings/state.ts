import { scoreVendor, compareScores, type Score } from "../scoring/score";
import type { AnyStory, EvidencePack, GoldenCell, Vendor, VerdictFile } from "../schemas/rankings";
import { coverageComplete } from "./check";
import { packHash } from "./hash";
import type { MarketData, Rankings } from "./load";

export const GOLDEN_CELLS = 20;
export const GOLDEN_TO_PUBLISH = 18;

export type VendorStatus = "judged" | "untested" | "stale" | "dropped";

export type VendorRow = {
  vendor: Vendor;
  status: VendorStatus;
  // why a vendor is untested, in plain words
  reason: string | null;
  pack: EvidencePack | null;
  verdicts: VerdictFile | null;
  result: Score;
};

export type Calibration = {
  cells: number;
  judged: number;
  matches: number;
  passed: boolean;
  misses: { cell: GoldenCell; judge: string | null }[];
};

export type MarketView = MarketData & {
  stories: AnyStory[];
  rows: VendorRow[];
  calibration: Calibration;
  published: boolean;
};

export function storiesFor(r: Rankings, m: MarketData): AnyStory[] {
  return [...r.stories, ...m.market.tasks];
}

export function vendorRow(m: MarketData, stories: AnyStory[], v: Vendor): VendorRow {
  const pack = m.evidence.get(v.id) ?? null;
  const verdicts = m.verdicts.get(v.id) ?? null;
  const base = { vendor: v, pack, verdicts };
  const none = scoreVendor(stories, null);
  if (v.status === "dropped") return { ...base, status: "dropped", reason: v.dropReason ?? "dropped", result: none };
  if (!pack) return { ...base, status: "untested", reason: "no evidence collected yet", result: none };
  if (!coverageComplete(pack)) return { ...base, status: "untested", reason: "the coverage checklist is not complete", result: none };
  if (!verdicts) return { ...base, status: "untested", reason: "not judged yet", result: none };
  if (verdicts.evidenceHash !== packHash(pack)) return { ...base, status: "stale", reason: "evidence changed after judging", result: none };
  return { ...base, status: "judged", reason: null, result: scoreVendor(stories, verdicts.verdicts) };
}

export function calibrate(m: MarketData): Calibration {
  let judged = 0;
  let matches = 0;
  const misses: Calibration["misses"] = [];
  for (const cell of m.golden) {
    const v = m.verdicts.get(cell.vendor)?.verdicts.find((x) => x.story === cell.story);
    if (!v) {
      misses.push({ cell, judge: null });
      continue;
    }
    judged += 1;
    if (v.verdict === cell.verdict) matches += 1;
    else misses.push({ cell, judge: v.verdict });
  }
  const cells = m.golden.length;
  return { cells, judged, matches, misses, passed: cells >= GOLDEN_CELLS && judged === cells && matches >= GOLDEN_TO_PUBLISH };
}

export function marketView(r: Rankings, m: MarketData): MarketView {
  const stories = storiesFor(r, m);
  const rows = m.vendors
    .map((v) => vendorRow(m, stories, v))
    .sort((a, b) => {
      if ((a.status === "dropped") !== (b.status === "dropped")) return a.status === "dropped" ? 1 : -1;
      return compareScores({ score: a.result.score, name: a.vendor.name }, { score: b.result.score, name: b.vendor.name });
    });
  const calibration = calibrate(m);
  return { ...m, stories, rows, calibration, published: calibration.passed };
}
