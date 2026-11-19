import type { MetadataRoute } from "next";
import { getCorpus } from "@/lib/content/load";
import { getRankings } from "@/lib/rankings/load";
import { site } from "@/lib/site";

// The pages a reader lands on. The text and data routes for agents (/install,
// /llms.txt, /export, /api/mcp, /search-index.json) are not pages and stay out.
const PAGE_ROUTES = [
  "/",
  "/audit",
  "/connect",
  "/run",
  "/playbooks",
  "/situations",
  "/rankings",
  "/rankings/methodology",
  "/calculators",
  "/rules",
  "/artifacts",
  "/documents",
  "/search",
] as const;

// Built from the same lists the dynamic pages pre-render, so the sitemap cannot name
// a page the build does not make.
export default function sitemap(): MetadataRoute.Sitemap {
  const corpus = getCorpus();
  const rankings = getRankings();
  const paths: string[] = [
    ...PAGE_ROUTES,
    ...corpus.playbooks.map((p) => `/playbooks/${p.slug}`),
    ...corpus.calculators.filter((c) => c.status === "live").map((c) => `/calculators/${c.id}`),
    ...rankings.markets.flatMap((m) => [
      `/rankings/${m.market.id}`,
      ...m.vendors.map((v) => `/rankings/${m.market.id}/${v.id}`),
    ]),
  ];
  const base = site.url.replace(/\/+$/, "");
  return [...new Set(paths)].map((p) => ({ url: p === "/" ? base : `${base}${p}` }));
}
