import { ageInDays, MAX_QUOTE_WORDS, wordCount } from "../content/semantic";
import type { ReviewEntry } from "../schemas/records";
import { COVERAGE_KEYS, type AnyStory, type EvidencePack } from "../schemas/rankings";
import { itemHash, packHash } from "./hash";
import type { Rankings } from "./load";

export type Issues = { errors: string[]; warnings: string[] };

export const GOLDEN_TARGET = 20;

// npm run rank:validate. Every score must trace to stored evidence.
export function rankingsIssues(r: Rankings, reviews: ReviewEntry[] = [], today: Date = new Date()): Issues {
  const out: Issues = { errors: [], warnings: [] };
  const canonical = new Set(r.stories.map((s) => s.id));
  if (canonical.size !== r.stories.length) out.errors.push("stories.json: duplicate story id");

  for (const m of r.markets) {
    const mid = m.market.id;
    const stories: AnyStory[] = [...r.stories, ...m.market.tasks];
    const storyById = new Map(stories.map((s) => [s.id, s]));
    for (const t of m.market.tasks) {
      if (canonical.has(t.id)) out.errors.push(`market ${mid}: task story "${t.id}" reuses a canonical story id`);
    }
    if (storyById.size !== stories.length) out.errors.push(`market ${mid}: duplicate task story id`);

    const vendorIds = new Set<string>();
    for (const v of m.vendors) {
      if (vendorIds.has(v.id)) out.errors.push(`market ${mid}: duplicate vendor id "${v.id}"`);
      vendorIds.add(v.id);
      if (v.status === "dropped" && !v.dropReason) out.errors.push(`market ${mid} › ${v.id}: a dropped vendor says why`);
    }

    for (const [id, pack] of m.evidence) {
      if (!vendorIds.has(id)) out.errors.push(`market ${mid}: evidence for unknown vendor "${id}"`);
      const issues = packIssues(pack, id, today);
      out.errors.push(...issues.errors.map((e) => `${mid} › ${e}`));
      for (const item of pack.items) {
        if (item.hash === undefined) out.errors.push(`${mid} › evidence ${id} › ${item.id}: not sealed; run npm run rank:seal -- ${mid}`);
      }
      out.warnings.push(...issues.warnings.filter((w) => !w.includes("not sealed")).map((w) => `${mid} › ${w}`));
    }

    for (const [id, file] of m.verdicts) {
      const at = `${mid} › verdicts ${id}`;
      const pack = m.evidence.get(id);
      if (file.vendor !== id) out.errors.push(`${at}: file is for "${file.vendor}"`);
      if (!vendorIds.has(id)) {
        out.errors.push(`${at}: unknown vendor`);
        continue;
      }
      if (!pack) {
        out.errors.push(`${at}: no evidence pack to judge from`);
        continue;
      }
      if (!coverageComplete(pack)) out.errors.push(`${at}: judged before the coverage checklist was complete`);
      if (file.evidenceHash !== packHash(pack)) out.errors.push(`${at}: evidence changed after judging; run /rank-judge again for this vendor`);
      if (ageInDays(file.judged, today) < 0) out.errors.push(`${at}: judged date is in the future`);
      const itemIds = new Set(pack.items.map((i) => i.id));
      const seen = new Set<string>();
      for (const v of file.verdicts) {
        const where = `${at} › ${v.story}`;
        const story = storyById.get(v.story);
        if (!story) {
          out.errors.push(`${where}: unknown story`);
          continue;
        }
        if (seen.has(v.story)) out.errors.push(`${where}: judged twice`);
        seen.add(v.story);
        for (const e of v.evidence) if (!itemIds.has(e)) out.errors.push(`${where}: cites evidence "${e}", which is not in the pack`);
        if ((v.verdict === "full" || v.verdict === "partial") && v.evidence.length === 0) out.errors.push(`${where}: a ${v.verdict} verdict cites evidence`);
        if (v.verdict === "disputed" && v.evidence.length < 2) out.errors.push(`${where}: a disputed verdict cites the conflicting evidence (two items or more)`);
        if (v.verdict === "na" && !story.na) out.errors.push(`${where}: this story always applies; "na" is not allowed`);
        if (v.verdict !== "na" && v.quality < 10 && !v.missing) out.errors.push(`${where}: quality ${v.quality} must name what is missing`);
      }
      for (const s of stories) if (!seen.has(s.id)) out.errors.push(`${at}: no verdict for story "${s.id}"`);
    }

    const cellKeys = new Set<string>();
    for (const cell of m.golden) {
      const where = `golden ${mid} › ${cell.vendor}/${cell.story}`;
      if (!vendorIds.has(cell.vendor)) out.errors.push(`${where}: unknown vendor`);
      if (!storyById.has(cell.story)) out.errors.push(`${where}: unknown story`);
      const key = `${cell.vendor}/${cell.story}`;
      if (cellKeys.has(key)) out.errors.push(`${where}: listed twice`);
      cellKeys.add(key);
      const pack = m.evidence.get(cell.vendor);
      for (const e of cell.evidence) if (!pack?.items.some((i) => i.id === e)) out.errors.push(`${where}: cites evidence "${e}", which is not in the pack`);
      if (cell.verdict === "na" && !storyById.get(cell.story)?.na) out.errors.push(`${where}: this story always applies; "na" is not allowed`);
    }
    if (m.golden.length > 0 && m.golden.length < GOLDEN_TARGET) {
      out.warnings.push(`golden ${mid}: ${m.golden.length} of ${GOLDEN_TARGET} cells; the market cannot publish yet`);
    }
  }

  const marketIds = new Set(r.markets.map((m) => m.market.id));
  for (const e of reviews.filter((x) => x.kind === "market")) {
    if (!marketIds.has(e.id)) out.errors.push(`reviews.json › market:${e.id}: no such market`);
  }
  return out;
}

export function coverageComplete(pack: EvidencePack): boolean {
  return COVERAGE_KEYS.every((k) => pack.coverage[k] !== undefined);
}

// Checks on one evidence pack that do not need the rest of the market.
export function packIssues(pack: EvidencePack, expectedId: string, today: Date = new Date()): Issues {
  const out: Issues = { errors: [], warnings: [] };
  const at = `evidence ${expectedId}`;
  if (pack.vendor !== expectedId) out.errors.push(`${at}: file is for "${pack.vendor}"; name the file after the vendor id`);
  if (pack.collected && ageInDays(pack.collected, today) < 0) out.errors.push(`${at}: collected date is in the future`);
  const seen = new Set<string>();
  for (const item of pack.items) {
    const where = `${at} › ${item.id}`;
    if (seen.has(item.id)) out.errors.push(`${where}: duplicate item id`);
    seen.add(item.id);
    if (item.id.startsWith("c") && item.tier === "probe") out.errors.push(`${where}: only the probe harness records probe evidence (ids p1, p2, ...)`);
    if (item.id.startsWith("p") && item.tier !== "probe" && item.tier !== "code") out.errors.push(`${where}: probe items are tier probe or code`);
    const words = wordCount(item.excerpt);
    if (words > MAX_QUOTE_WORDS) out.errors.push(`${where}: excerpt is ${words} words (limit ${MAX_QUOTE_WORDS})`);
    if (ageInDays(item.fetched, today) < 0) out.errors.push(`${where}: fetched date is in the future`);
    if (item.hash === undefined) out.warnings.push(`${where}: not sealed yet (npm run rank:seal)`);
    else if (item.hash !== itemHash(item.url, item.excerpt)) out.errors.push(`${where}: hash does not match the url and excerpt; re-collect or re-seal`);
  }
  const missing = COVERAGE_KEYS.filter((k) => pack.coverage[k] === undefined);
  if (missing.length > 0) out.warnings.push(`${at}: coverage missing ${missing.join(", ")}; the vendor stays untested`);
  return out;
}
