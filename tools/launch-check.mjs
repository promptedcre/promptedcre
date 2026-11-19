// The launch-day check (CH09), run against the project's vercel.app address, which serves
// the same deployment as the domain. It never runs against promptedcre.com. It only reads.
//
//   node tools/launch-check.mjs https://<project>.vercel.app [--log <file outside the repo>]
//
// Three parts, each line marked PASS or FAIL:
// 1. The bot check: the pages and a valid connector call, each sent with a user agent naming
//    GPTBot, ClaudeBot and PerplexityBot, expecting a normal response. Sent from this laptop,
//    it shows what the host does with those names, not how the real crawlers are treated.
// 2. The connector's answers to malformed requests: a GET is 405, a bare POST 415, a POST
//    without both Accept types 406, and a JSON-RPC call with both is 200.
// 3. The awkward set: an outline, the joint-venture-only record, a state outside coverage, a
//    bad calculator input, the same call twice, and a Form D date already past.
// The playbook run and the ten operator questions are run by hand (docs/DEPLOY.md, section 4).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "").replace(/\/+$/, "");
const logAt = process.argv.indexOf("--log");
const logFile = logAt > 0 ? path.resolve(process.argv[logAt + 1] ?? "") : null;

function refuse(message) {
  console.error(message);
  process.exit(2);
}

let host = "";
try {
  host = new URL(base).hostname;
} catch {
  refuse("usage: node tools/launch-check.mjs https://<project>.vercel.app [--log <file>]");
}
if (/(^|\.)promptedcre\.com$/i.test(host)) refuse("Not against promptedcre.com: run this on the project's vercel.app address, which serves the same deployment.");
if (!base.startsWith("https://") && !/^(127\.0\.0\.1|localhost)$/.test(host)) refuse("Use the https address (http only for 127.0.0.1, to rehearse on a local build).");
if (logFile && (logFile + path.sep).startsWith(ROOT + path.sep)) refuse("Keep the log outside the repository: pass a --log path in another folder.");

const BOTS = {
  GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  ClaudeBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  PerplexityBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
};
const PAGES = ["/", "/install", "/llms.txt", "/playbooks/form-sponsor-entity", "/playbooks/form-sponsor-entity/playbook.md", "/export/playbooks.json"];
const BOTH = "application/json, text/event-stream";

const lines = [];
let failed = 0;
function mark(ok, what, detail = "") {
  if (!ok) failed += 1;
  const line = `${ok ? "PASS" : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`;
  lines.push(line);
  console.log(line);
}

async function rpc(method, params = {}, headers = {}) {
  const res = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: BOTH, "mcp-protocol-version": "2025-06-18", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  const json = text.trim().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "{}");
  return { status: res.status, body: JSON.parse(json) };
}

async function tool(name, args) {
  const { body } = await rpc("tools/call", { name, arguments: args });
  const result = body.result ?? {};
  const text = result.content?.[0]?.text ?? "";
  return { isError: result.isError === true, text, data: result.isError ? null : JSON.parse(text || "{}") };
}

const today = new Date().toISOString().slice(0, 10);
const daysBefore = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  lines.push(`Launch check of ${base}, ${new Date().toISOString()}`);
  console.log(lines[0]);

  console.log("\n1. Bot check");
  for (const [bot, agent] of Object.entries(BOTS)) {
    for (const p of PAGES) {
      const res = await fetch(`${base}${p}`, { headers: { "user-agent": agent } });
      await res.arrayBuffer();
      mark(res.status === 200, `${bot} ${p}`, `HTTP ${res.status}`);
    }
    const call = await rpc("tools/list", {}, { "user-agent": agent });
    mark(call.status === 200 && Array.isArray(call.body.result?.tools), `${bot} connector tools/list`, `HTTP ${call.status}`);
  }

  console.log("\n2. Malformed requests");
  const get = await fetch(`${base}/api/mcp`);
  mark(get.status === 405, "GET /api/mcp", `HTTP ${get.status}, expected 405`);
  const bare = await fetch(`${base}/api/mcp`, { method: "POST" });
  mark(bare.status === 415, "bare POST", `HTTP ${bare.status}, expected 415`);
  const oneAccept = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  mark(oneAccept.status === 406, "POST without both Accept types", `HTTP ${oneAccept.status}, expected 406`);
  const ok = await rpc("tools/list");
  mark(ok.status === 200 && ok.body.result?.tools?.length === 16, "JSON-RPC tools/list", `HTTP ${ok.status}, ${ok.body.result?.tools?.length ?? 0} tools`);

  console.log("\n3. The awkward set");
  const outlines = await tool("list_playbooks", { depth: "outline" });
  const outline = outlines.data?.items?.[0]?.slug;
  const o = outline ? await tool("get_playbook", { slug: outline }) : null;
  mark(Boolean(o?.data?.note?.startsWith("Outline only")), "an outline", outline ?? "no outline listed");

  const all = await tool("list_playbooks", { depth: "full" });
  const jv = all.data?.items?.find((i) => JSON.stringify(i.writtenForStructures) === JSON.stringify(["jv"]))?.slug;
  const j = jv ? await tool("get_playbook", { slug: jv }) : null;
  mark(Boolean(j?.data?.note?.startsWith("Not written for this variant") && j.data.steps.length === 0), "the joint-venture-only record, asked for a syndication", jv ?? "none found");

  const ny = await tool("search", { query: "form an LLC in New York" });
  mark(Boolean(ny.data?.coverage?.includes("New York")), "a state outside coverage", ny.data?.coverage ?? "no note");

  const bad = await tool("calc_debt", {});
  mark(bad.isError, "a bad calculator input", bad.isError ? bad.text.slice(0, 80) : "no error returned");

  const s1 = await tool("status", {});
  const s2 = await tool("status", {});
  mark(s1.text === s2.text && !s1.isError, "the same call twice", s1.text === s2.text ? "identical" : "differs");

  const late = await tool("calc_deadlines", {
    firstSaleDate: daysBefore(60),
    firstTexasSaleDate: null,
    exchangeTransferDate: null,
    returnDueDate: null,
    appraisalNoticeDate: null,
    protestYear: null,
    contractEffectiveDate: null,
    contractPeriods: [],
    asOf: today,
  });
  const formD = late.data?.result?.items?.find((x) => x.id === "form-d");
  mark(formD?.passed === true && late.data?.formDPassed?.playbook === "missed-form-d-deadline", "a Form D date already past", formD ? `due ${formD.date}` : "no Form D date");

  const summary = `\n${failed === 0 ? "All passed" : `${failed} failed`}. The playbook run and the ten questions are run by hand (docs/DEPLOY.md, section 4).`;
  lines.push(summary.trim());
  console.log(summary);
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${lines.join("\n")}\n\n`);
    console.log(`Logged to ${logFile}`);
  }
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`The check could not finish: ${err.message}`);
    process.exit(1);
  },
);
