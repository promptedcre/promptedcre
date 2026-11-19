// npm run rank:excerpts [-- <market-id>]: live check that every collected excerpt
// still appears, word for word, on the page it cites. Manual; never run in tests.
// Pages that refuse automated requests or render only in a browser are reported as
// "unverifiable", not as failures.
import { loadRankings } from "../../lib/rankings/load";
import { fetchPage, normalize } from "./page-text.mjs";

type Page = { status: number; type: string; lines: string[] } | null;

async function main(): Promise<void> {
  const only = process.argv[2];
  const { rankings, errors } = loadRankings();
  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  const jobs: { market: string; vendor: string; id: string; url: string; excerpt: string }[] = [];
  for (const m of rankings.markets) {
    if (only && m.market.id !== only) continue;
    for (const [vendor, pack] of m.evidence) {
      for (const item of pack.items) {
        if (item.id.startsWith("c")) jobs.push({ market: m.market.id, vendor, id: item.id, url: item.url, excerpt: item.excerpt });
      }
    }
  }

  const urls = [...new Set(jobs.map((j) => j.url))];
  const pages = new Map<string, Page>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, urls.length) }, async () => {
      while (next < urls.length) {
        const url = urls[next++] as string;
        try {
          pages.set(url, (await fetchPage(url)) as Page);
        } catch {
          pages.set(url, null);
        }
      }
    }),
  );

  let verified = 0;
  let unverifiable = 0;
  const notFound: string[] = [];
  for (const j of jobs) {
    const page = pages.get(j.url);
    // PDFs and refused or browser-rendered pages cannot be read here; check those by hand
    if (!page || page.status >= 400 || page.lines.length < 15 || /pdf/i.test(page.type) || j.url.toLowerCase().endsWith(".pdf")) {
      unverifiable += 1;
      if (process.argv.includes("--verbose")) {
        const why = !page ? "no response" : page.status >= 400 ? `HTTP ${page.status}` : /pdf/i.test(page.type) || j.url.toLowerCase().endsWith(".pdf") ? "PDF" : "rendered in the browser";
        console.log(`unverifiable (${why})  ${j.market} › ${j.vendor} › ${j.id}  ${j.url}`);
      }
      continue;
    }
    // drop Markdown line markers (quote, bullet, heading) before comparing
    const text = normalize(page.lines.map((l) => l.replace(/^\s*(?:>|[*-]|#+|\d+\.)\s+/, "")).join(" "));
    const parts = j.excerpt
      .replace(/^\s*(?:>|[*-]|#+|\d+\.)\s+/, "")
      .split(/\.\.\.|…/)
      .map((p) => normalize(p))
      .filter((p) => p.length > 0);
    if (parts.every((p) => text.includes(p))) verified += 1;
    else notFound.push(`${j.market} › ${j.vendor} › ${j.id}  ${j.url}\n      "${j.excerpt}"`);
  }

  for (const n of notFound) console.log(`not found  ${n}`);
  console.log(`\n${jobs.length} collected excerpts: ${verified} verified, ${notFound.length} not found, ${unverifiable} unverifiable (refused or browser-rendered pages)`);
  process.exit(notFound.length > 0 ? 1 : 0);
}

main();
