// Deterministic, keyless HTTP checks for one market (build plan section 9, step 1).
//   npm run rank:probe -- <market-id>
// Only definitive results become evidence (ids p1, p2, ...). A refused, failed or
// ambiguous request records nothing. Re-running replaces the earlier probe items.
import fs from "node:fs";
import path from "node:path";
import { wordCount } from "../../lib/content/semantic";
import { itemHash } from "../../lib/rankings/hash";
import { MARKETS_DIR } from "../../lib/rankings/load";
import { evidencePack, vendorFile, type EvidenceItem, type EvidencePack } from "../../lib/schemas/rankings";
import { decodeEntities } from "./page-text.mjs";

const USER_AGENT = process.env.RANK_UA ?? "Mozilla/5.0 (compatible; PromptedCRE-rank-probe/0.1)";
const TODAY = new Date().toISOString().slice(0, 10);
const MAX_WORDS = 25;

type Found = Omit<EvidenceItem, "id" | "hash" | "fetched">;

function clip(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= MAX_WORDS ? words.join(" ") : `${words.slice(0, MAX_WORDS - 1).join(" ")} ...`;
}

async function get(url: string, accept = "*/*"): Promise<{ status: number; url: string; type: string; body: string } | null> {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": USER_AGENT, accept }, signal: AbortSignal.timeout(15_000) });
    const body = await res.text();
    return { status: res.status, url: res.url, type: res.headers.get("content-type") ?? "", body };
  } catch {
    return null;
  }
}

const looksLikeHtml = (type: string, body: string) => /html/i.test(type) || /^\s*</.test(body);

async function llmsTxt(host: string): Promise<Found | null> {
  const r = await get(`https://${host}/llms.txt`, "text/plain,text/markdown,*/*;q=0.5");
  if (!r || r.status !== 200 || !new URL(r.url).pathname.endsWith("/llms.txt")) return null;
  if (looksLikeHtml(r.type, r.body) || r.body.trim().length < 200) return null;
  // a real llms.txt has a title heading or Markdown links, not only front matter
  if (!/^#\s+\S/m.test(r.body) && !/\]\(https?:\/\//.test(r.body)) return null;
  const lines = r.body.split(/\r?\n/).map((l) => l.trim());
  const title = lines.find((l) => /^#\s+\S/.test(l)) ?? lines.find((l) => /[A-Za-z]/.test(l) && !/^[\w-]+:\s/.test(l)) ?? "";
  return { tier: "probe", url: r.url, excerpt: clip(title), note: `llms.txt: GET 200, ${r.body.length} bytes` };
}

// matches `openapi: 3.0.3` in YAML and `{"openapi":"3.0.3"` at the start of JSON
const SPEC = /^\s*\{?\s*["']?(openapi|swagger)["']?\s*:\s*["']?\d/m;

async function openApi(url: string): Promise<Found | null> {
  const r = await get(url, "application/json,application/yaml,text/yaml,*/*;q=0.5");
  if (!r || r.status !== 200 || looksLikeHtml(r.type, r.body)) return null;
  const head = r.body.slice(0, 4000);
  const line = head.split(/\r?\n|,/).find((l) => SPEC.test(l));
  if (!line) return null;
  return { tier: "probe", url: r.url, excerpt: clip(line.trim()), note: `API spec file: GET 200, ${r.body.length} bytes` };
}

async function pageResolves(url: string, what: string): Promise<Found | null> {
  const r = await get(url, "text/html,*/*;q=0.5");
  if (!r || r.status !== 200) return null;
  const title = decodeEntities((r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  if (!title) return null;
  return { tier: "probe", url: r.url, excerpt: clip(title), note: `${what} page resolves: GET 200 (page title)` };
}

async function npmPackage(name: string): Promise<Found | null> {
  const r = await get(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, "application/json");
  if (!r || r.status !== 200) return null;
  try {
    const j = JSON.parse(r.body) as { "dist-tags"?: { latest?: string }; description?: string; time?: Record<string, string> };
    const latest = j["dist-tags"]?.latest;
    if (!latest) return null;
    const published = j.time?.[latest]?.slice(0, 10) ?? "unknown";
    return { tier: "code", url: `https://www.npmjs.com/package/${name}`, excerpt: clip(`${name} ${latest}: ${j.description ?? ""}`), note: `npm registry: latest ${latest}, published ${published}` };
  } catch {
    return null;
  }
}

async function pypiPackage(name: string): Promise<Found | null> {
  const r = await get(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, "application/json");
  if (!r || r.status !== 200) return null;
  try {
    const j = JSON.parse(r.body) as { info?: { version?: string; summary?: string }; urls?: { upload_time?: string }[] };
    const version = j.info?.version;
    if (!version) return null;
    const uploaded = j.urls?.[0]?.upload_time?.slice(0, 10) ?? "unknown";
    return { tier: "code", url: `https://pypi.org/project/${name}/`, excerpt: clip(`${name} ${version}: ${j.info?.summary ?? ""}`), note: `PyPI: latest ${version}, uploaded ${uploaded}` };
  } catch {
    return null;
  }
}

async function githubRepo(url: string): Promise<Found | null> {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  const r = await get(`https://api.github.com/repos/${m[1]}/${m[2]}`, "application/vnd.github+json");
  if (!r || r.status !== 200) return null;
  try {
    const j = JSON.parse(r.body) as { full_name: string; description: string | null; archived: boolean; pushed_at: string; html_url: string };
    return { tier: "code", url: j.html_url, excerpt: clip(`${j.full_name}: ${j.description ?? ""}`), note: `GitHub: ${j.archived ? "archived" : "not archived"}, last push ${j.pushed_at.slice(0, 10)}` };
  } catch {
    return null;
  }
}

async function probeVendor(homepage: string, pack: EvidencePack): Promise<Found[]> {
  const found: Found[] = [];
  const hosts = [...new Set([homepage, pack.links.docs, pack.links.api].filter((u): u is string => Boolean(u)).map((u) => new URL(u).host))];
  for (const host of hosts) {
    const f = await llmsTxt(host);
    if (f) found.push(f);
  }
  const specUrls = new Set<string>();
  if (pack.links.openapi) specUrls.add(pack.links.openapi);
  if (pack.links.api) {
    const origin = new URL(pack.links.api).origin;
    for (const p of ["/openapi.json", "/swagger.json", "/openapi.yaml"]) specUrls.add(origin + p);
  }
  for (const u of specUrls) {
    const f = await openApi(u);
    if (f) {
      found.push(f);
      break;
    }
  }
  if (pack.links.mcp) {
    const f = await pageResolves(pack.links.mcp, "MCP");
    if (f) found.push(f);
  }
  if (pack.links.cli) {
    const f = await pageResolves(pack.links.cli, "CLI or SDK");
    if (f) found.push(f);
  }
  for (const p of pack.packages) {
    const f = p.registry === "npm" ? await npmPackage(p.name) : await pypiPackage(p.name);
    if (f) found.push(f);
  }
  for (const repo of pack.repos) {
    const f = await githubRepo(repo);
    if (f) found.push(f);
  }
  // keep only distinct results
  const seen = new Set<string>();
  return found.filter((f) => {
    const key = f.note?.startsWith("llms.txt") ? `llms|${f.excerpt}|${f.note}` : `${f.url}|${f.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return wordCount(f.excerpt) <= MAX_WORDS;
  });
}

async function main(): Promise<void> {
  const market = process.argv[2];
  if (!market) {
    console.error("usage: npm run rank:probe -- <market-id>");
    process.exit(2);
  }
  const dir = path.join(MARKETS_DIR, market);
  const roster = vendorFile.parse(JSON.parse(fs.readFileSync(path.join(dir, "vendors.json"), "utf8")));
  const evidenceDir = path.join(dir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });

  const vendors = roster.vendors.filter((v) => v.status !== "dropped");
  const lines: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, vendors.length) }, async () => {
      while (next < vendors.length) {
        const v = vendors[next++];
        if (!v) break;
        const file = path.join(evidenceDir, `${v.id}.json`);
        const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { vendor: v.id, coverage: {}, items: [] };
        const pack = evidencePack.parse(raw);
        const found = await probeVendor(v.homepage, pack);
        const kept = (raw.items ?? []).filter((i: { id: string }) => !i.id.startsWith("p"));
        const probes = found.map((f, i) => {
          const item: EvidenceItem = { id: `p${i + 1}`, ...f, fetched: TODAY };
          return { ...item, hash: itemHash(item.url, item.excerpt) };
        });
        raw.items = [...kept, ...probes];
        fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
        lines.push(`${v.id.padEnd(32)} ${probes.length === 0 ? "nothing definitive" : probes.map((p) => p.note?.split(":")[0]).join(" · ")}`);
      }
    }),
  );
  for (const l of lines.sort()) console.log(l);
}

main();
