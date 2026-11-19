// Citation checks.
//   npm run citations        offline: every cited claim resolves to an opened
//                            primary source with an access date and short quotes
//   npm run citations:live   also requests every URL once (manual; never in tests)
import { getCorpus } from "../lib/content/load";
import { ageInDays, MAX_QUOTE_WORDS, STALE_DAYS, wordCount } from "../lib/content/semantic";
import type { Source } from "../lib/schemas/common";

const live = process.argv.includes("--live");
// Generic client name: no personal contact details in requests to outside sites.
const USER_AGENT = process.env.CITATION_CHECK_UA ?? "Mozilla/5.0 (compatible; PromptedCRE-citation-check/0.1)";

type Cited = { where: string; source: Source };

function collect(): { cited: Cited[]; errors: string[]; warnings: string[] } {
  const corpus = getCorpus();
  const today = new Date();
  const cited: Cited[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const pb of corpus.playbooks.filter((p) => p.depth === "full")) {
    const byId = new Map(pb.sources.map((s) => [s.id, s]));
    for (const s of pb.sources) cited.push({ where: `playbook ${pb.id}`, source: s });
    for (const step of pb.steps.filter((s) => s.basis === "cited")) {
      const sources = step.sources.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s));
      if (sources.length === 0) errors.push(`playbook ${pb.id} › step ${step.id}: no source`);
      else if (!sources.some((s) => s.tier === "primary")) {
        errors.push(`playbook ${pb.id} › step ${step.id}: no primary source`);
      }
    }
    const unused = pb.sources.filter(
      (s) =>
        !pb.steps.some(
          (st) => st.sources.includes(s.id) || st.effort?.sourceId === s.id || st.elapsed?.sourceId === s.id || st.cost?.sourceId === s.id,
        ),
    );
    for (const s of unused) warnings.push(`playbook ${pb.id}: source "${s.id}" is listed but no step cites it`);
  }
  for (const r of corpus.rules) for (const s of r.sources) cited.push({ where: `rule ${r.id}`, source: s });

  for (const { where, source } of cited) {
    if (!source.url.startsWith("https://")) errors.push(`${where}: ${source.id} is not https`);
    if (source.quote && wordCount(source.quote) > MAX_QUOTE_WORDS) errors.push(`${where}: ${source.id} quote too long`);
    const age = ageInDays(source.accessed, today);
    if (age > STALE_DAYS) warnings.push(`${where}: ${source.id} opened ${age} days ago (check date)`);
  }
  return { cited, errors, warnings };
}

async function check(url: string): Promise<{ status: number | null; note: string }> {
  const init = { redirect: "follow" as const, headers: { "user-agent": USER_AGENT } };
  try {
    let res = await fetch(url, { ...init, method: "HEAD", signal: AbortSignal.timeout(20_000) });
    if (res.status === 405 || res.status === 403 || res.status === 404) {
      res = await fetch(url, { ...init, method: "GET", signal: AbortSignal.timeout(20_000) });
    }
    return { status: res.status, note: res.ok ? "ok" : "" };
  } catch (err) {
    return { status: null, note: (err as Error).message };
  }
}

async function main(): Promise<number> {
  const { cited, errors, warnings } = collect();
  for (const w of warnings) console.warn(`warn  ${w}`);
  const urls = [...new Set(cited.map((c) => c.source.url))];

  if (live) {
    let broken = 0;
    let blocked = 0;
    // a small pool: eight requests at a time, results printed in source order
    const results = new Array<{ status: number | null; note: string }>(urls.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(8, urls.length) }, async () => {
        while (next < urls.length) {
          const i = next++;
          results[i] = await check(urls[i] ?? "");
        }
      }),
    );
    urls.forEach((url, i) => {
      const { status, note } = results[i] ?? { status: null, note: "not checked" };
      if (status !== null && status < 400) console.log(`ok       ${status}  ${url}`);
      else if (status === 401 || status === 403 || status === 429) {
        blocked += 1;
        console.warn(`blocked  ${status}  ${url}  (site refuses automated requests; not verified)`);
      } else {
        broken += 1;
        console.error(`broken   ${status ?? "---"}  ${url}  ${note}`);
      }
    });
    console.log(`\n${urls.length} URLs: ${urls.length - broken - blocked} ok, ${blocked} blocked, ${broken} broken`);
    if (broken > 0) errors.push(`${broken} cited URL(s) failed`);
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    return 1;
  }
  console.log(`OK  ${cited.length} citations across ${urls.length} URLs; every cited step has a primary source`);
  return 0;
}

main().then((code) => process.exit(code));
