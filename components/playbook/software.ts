import { getRankingsSummary } from "@/components/rankings/summary";
import { stepSoftware } from "@/components/rankings/step-software";
import type { Playbook } from "@/lib/schemas/playbook";
import type { MarketTop } from "./software-line";

/** How many products a step card shows at most. */
export const TOP_SHOWN = 4;

// Server only: it reads the rankings files and content/step-software.json.

/** The ids of the published markets, for the cards that link to a market's ranking. */
export function publishedMarkets(): Set<string> {
  return new Set(getRankingsSummary().markets.filter((m) => m.view.published).map((m) => m.view.market.id));
}

// The software that does each step of one record (D218, the owner's "Map each step"), by step
// id: the scored products content/step-software.json names for that step, best score first,
// at most `top`, with the market they are ranked in. A step with no market, an unpublished
// market or no scored product on its list is left out, so its card shows no line.
export function stepSoftwareFor(pb: Playbook, top: number = TOP_SHOWN): Map<string, MarketTop> {
  const out = new Map<string, MarketTop>();
  for (const step of pb.steps) {
    const sw = stepSoftware(pb.id, step.id, step.market, top);
    if (!sw) continue;
    out.set(step.id, {
      id: sw.market.id,
      name: sw.market.name,
      vendors: sw.vendors.map((v) => ({ id: v.id, name: v.name, government: v.government, score: v.score })),
    });
  }
  return out;
}
