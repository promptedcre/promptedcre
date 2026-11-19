import { getCorpus } from "@/lib/content/load";
import { getRankings } from "@/lib/rankings/load";
import { marketView, type MarketView, type VendorRow } from "@/lib/rankings/state";
import type { MarketReview } from "./status";

// Server only (reads the rankings files). Everything a page says about the rankings as a
// whole is computed here from getRankings() and the review ledger, never typed in.

export type RankedRow = VendorRow & { rank: number | null };

export type MarketSummary = {
  view: MarketView;
  review: MarketReview;
  // vendors still in the market (dropped ones left out)
  listed: RankedRow[];
  judged: RankedRow[];
  // judged rows with a score, in rank order; empty until the market publishes
  ranked: RankedRow[];
  dropped: VendorRow[];
  // the latest date a vendor in this market was judged, if any
  judgedOn: string | null;
  evidenceItems: number;
};

// What a score means, read off the published markets: the highest score (and whose it is),
// and how many applicable verdicts found no evidence an agent can do the task.
export type ScoreRange = {
  top: { score: number; vendor: string; market: string } | null;
  verdicts: number;
  none: number;
};

type RankingsSummary = {
  markets: MarketSummary[];
  totals: {
    markets: number;
    listed: number;
    judged: number;
    evidenceItems: number;
    judgedOn: string | null;
  };
  range: ScoreRange;
};

export function scoreRange(markets: MarketSummary[]): ScoreRange {
  let top: ScoreRange["top"] = null;
  let verdicts = 0;
  let none = 0;
  for (const m of markets) {
    for (const r of m.ranked) {
      const s = r.result.score;
      if (s !== null && (top === null || s > top.score)) top = { score: s, vendor: r.vendor.name, market: m.view.market.name };
      for (const c of r.result.cells) {
        if (c.verdict.verdict === "na") continue;
        verdicts += 1;
        if (c.verdict.verdict === "none") none += 1;
      }
    }
  }
  return { top, verdicts, none };
}

const latest = (dates: (string | null | undefined)[]): string | null =>
  dates.filter((d): d is string => typeof d === "string").sort().at(-1) ?? null;

// The rank of each row as the market page shows it: 1, 2, 3 for judged rows in score order
// once the market is published; null for every other row.
function rankRows(view: MarketView): RankedRow[] {
  let n = 0;
  return view.rows.map((r) => ({ ...r, rank: view.published && r.status === "judged" && r.result.score !== null ? (n += 1) : null }));
}

function summarizeMarket(view: MarketView, review: MarketReview): MarketSummary {
  const rows = rankRows(view);
  const listed = rows.filter((r) => r.status !== "dropped");
  const judged = listed.filter((r) => r.status === "judged");
  return {
    view,
    review,
    listed,
    judged,
    ranked: judged.filter((r) => r.rank !== null),
    dropped: view.rows.filter((r) => r.status === "dropped"),
    judgedOn: latest(judged.map((r) => r.verdicts?.judged)),
    evidenceItems: listed.reduce((n, r) => n + (r.pack?.items.length ?? 0), 0),
  };
}

function marketReview(marketId: string): MarketReview {
  const entry = getCorpus().reviews.find((r) => r.kind === "market" && r.id === marketId);
  return entry ? { date: entry.date } : null;
}

export function getMarketSummary(marketId: string): MarketSummary | null {
  const rankings = getRankings();
  const data = rankings.markets.find((m) => m.market.id === marketId);
  return data ? summarizeMarket(marketView(rankings, data), marketReview(marketId)) : null;
}

export function getRankingsSummary(): RankingsSummary {
  const rankings = getRankings();
  const markets = rankings.markets.map((m) => summarizeMarket(marketView(rankings, m), marketReview(m.market.id)));
  return {
    markets,
    totals: {
      markets: markets.length,
      listed: markets.reduce((n, m) => n + m.listed.length, 0),
      judged: markets.reduce((n, m) => n + m.judged.length, 0),
      evidenceItems: markets.reduce((n, m) => n + m.evidenceItems, 0),
      judgedOn: latest(markets.map((m) => m.judgedOn)),
    },
    range: scoreRange(markets),
  };
}
