import fs from "node:fs";
import path from "node:path";
import { parseFile, RANKINGS_DIR } from "../content/load";
import {
  evidencePack,
  goldenFile,
  marketFile,
  storyFile,
  vendorFile,
  verdictFile,
  type EvidencePack,
  type GoldenCell,
  type MarketFile,
  type Story,
  type Vendor,
  type VerdictFile,
} from "../schemas/rankings";

export type MarketData = {
  market: MarketFile;
  vendors: Vendor[];
  evidence: Map<string, EvidencePack>;
  verdicts: Map<string, VerdictFile>;
  golden: GoldenCell[];
};

export type Rankings = {
  storiesVersion: string;
  stories: Story[];
  markets: MarketData[];
};

export const MARKETS_DIR = path.join(RANKINGS_DIR, "markets");

function readDir<T>(dir: string, parse: (file: string) => T | null): Map<string, T> {
  const out = new Map<string, T>();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const value = parse(path.join(dir, name));
    if (value !== null) out.set(name.replace(/\.json$/, ""), value);
  }
  return out;
}

export function loadRankings(): { rankings: Rankings; errors: string[] } {
  const errors: string[] = [];
  const take = <T,>(result: { ok: true; value: T } | { ok: false; errors: string[] }): T | null => {
    if (result.ok) return result.value;
    errors.push(...result.errors);
    return null;
  };

  const storiesFile = take(parseFile(storyFile, path.join(RANKINGS_DIR, "stories.json")));
  const markets: MarketData[] = [];
  const dirs = fs.existsSync(MARKETS_DIR)
    ? fs.readdirSync(MARKETS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : [];
  for (const id of dirs) {
    const dir = path.join(MARKETS_DIR, id);
    const market = take(parseFile(marketFile, path.join(dir, "market.json")));
    const roster = take(parseFile(vendorFile, path.join(dir, "vendors.json")));
    if (!market || !roster) continue;
    if (market.id !== id) errors.push(`rankings/markets/${id}/market.json: id "${market.id}" must match its folder`);
    if (roster.market !== id) errors.push(`rankings/markets/${id}/vendors.json: market "${roster.market}" must match its folder`);
    const evidence = readDir(path.join(dir, "evidence"), (f) => take(parseFile(evidencePack, f)));
    const verdicts = readDir(path.join(dir, "verdicts"), (f) => take(parseFile(verdictFile, f)));
    const goldenPath = path.join(RANKINGS_DIR, "golden", `${id}.json`);
    const golden = fs.existsSync(goldenPath) ? (take(parseFile(goldenFile, goldenPath))?.cells ?? []) : [];
    markets.push({ market, vendors: roster.vendors, evidence, verdicts, golden });
  }
  markets.sort((a, b) => a.market.order - b.market.order);
  return {
    rankings: { storiesVersion: storiesFile?.version ?? "", stories: storiesFile?.stories ?? [], markets },
    errors,
  };
}

let cached: Rankings | null = null;

// Pages call this. Invalid rankings data fails the build with readable messages.
export function getRankings(): Rankings {
  if (cached) return cached;
  const { rankings, errors } = loadRankings();
  if (errors.length > 0) throw new Error(`Rankings failed validation:\n${errors.join("\n")}`);
  cached = rankings;
  return rankings;
}
