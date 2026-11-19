import { getCorpus } from "@/lib/content/load";
import { getRankings } from "@/lib/rankings/load";
import { buildSearchIndex } from "@/lib/search/index";

// The one search index, written at build time. The search page loads it; the
// MCP search tool builds the same index in process.
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json({ docs: buildSearchIndex(getCorpus(), getRankings()) });
}
