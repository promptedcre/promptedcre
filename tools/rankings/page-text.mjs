// Prints the readable text of a web page, so evidence excerpts can be copied
// verbatim. Used while collecting rankings evidence and by the live excerpt check.
//   node tools/rankings/page-text.mjs <url> [--grep api,mcp,webhook] [--max 12000]
import { pathToFileURL } from "node:url";

const USER_AGENT = process.env.RANK_UA ?? "Mozilla/5.0 (compatible; PromptedCRE-rankings/0.1)";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", trade: "™", reg: "®", copy: "©" };

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

// HTML to lines of visible text. Block elements end a line.
export function htmlToLines(html) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/?(p|div|section|article|header|footer|nav|main|aside|li|ul|ol|h[1-6]|tr|td|th|table|dt|dd|pre|blockquote|figcaption|summary|details|button|label|option)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/[\s ]+/g, " ").trim())
    .filter((l) => l.length > 0);
}

// For comparing an excerpt with page text: ignores Markdown emphasis, code marks and
// stray bullets, curly quotes, dash styles, spacing, and the space a link tag leaves
// before punctuation.
export function normalize(text) {
  return text
    .replace(/\*\*|`/g, "")
    .replace(/\s\*\s/g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[\s ]+/g, " ")
    .replace(/ ([.,;:!?)])/g, "$1")
    .replace(/\( /g, "(")
    .trim()
    .toLowerCase();
}

export async function fetchPage(url, timeoutMs = 20_000) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const type = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const lines = /html/i.test(type) || /^\s*</.test(raw) ? htmlToLines(raw) : raw.split(/\r?\n/).map((l) => decodeEntities(l).trim()).filter(Boolean);
  return { status: res.status, finalUrl: res.url, type, title: decodeEntities(title), lines, bytes: raw.length };
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => /^https?:\/\//.test(a));
  if (!url) {
    console.error("usage: node tools/rankings/page-text.mjs <url> [--grep word,word] [--max chars]");
    process.exit(2);
  }
  const grepAt = args.indexOf("--grep");
  const words = grepAt >= 0 ? (args[grepAt + 1] ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean) : [];
  const maxAt = args.indexOf("--max");
  const max = maxAt >= 0 ? Number(args[maxAt + 1]) : 12_000;
  let page;
  try {
    page = await fetchPage(url);
  } catch (err) {
    console.log(`error  ${url}  ${err.message}`);
    process.exit(1);
  }
  const text = page.lines.join("\n");
  console.log(`status ${page.status} · ${page.type || "no type"} · ${page.bytes} bytes · ${page.lines.length} lines · final ${page.finalUrl}`);
  if (page.title) console.log(`title  ${page.title}`);
  if (page.status === 401 || page.status === 403 || page.status === 429) console.log("note   the site refused the request; record nothing from it");
  if (page.lines.length < 15 && page.status < 400) console.log("note   very little text: the page probably renders in the browser; try another page or a browser fetch");
  console.log("---");
  if (words.length > 0) {
    page.lines.forEach((line, i) => {
      const l = line.toLowerCase();
      if (words.some((w) => l.includes(w))) console.log(`${String(i + 1).padStart(4)}  ${line.slice(0, 600)}`);
    });
  } else {
    console.log(text.slice(0, max));
    if (text.length > max) console.log(`… (${text.length - max} more characters; use --max or --grep)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
