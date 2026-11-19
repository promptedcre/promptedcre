import { z } from "zod";
import { jobBlock, wrap } from "@/lib/agent-job";
import { getCorpus } from "@/lib/content/load";
import { HOSTS, addsLine, statusLine } from "@/lib/hosts";
import { TOOLS } from "@/lib/mcp/server";
import { engineInstall, site, terms } from "@/lib/site";

// Plain-text setup page an agent can read. It opens with the agent's job (CH05) and the
// terms (CH04), each from its one source, then what PromptedCRE supplies, the MCP URL, the
// tools with what each takes, the engine (CH03), how each host adds the connector, how to
// audit a firm that already exists, and the firm file. The hosts and what each status rests
// on come from lib/hosts.ts, the same list the home page shows.
export const dynamic = "force-dynamic";

// What a tool takes, from its own schema, never typed by hand: "search(query, kinds?, limit?)".
function toolLine(tool: (typeof TOOLS)[number]): string {
  const schema = z.toJSONSchema(tool.inputSchema, { target: "draft-2020-12", io: "input" }) as { properties?: Record<string, unknown>; required?: string[] };
  const required = new Set(schema.required ?? []);
  const args = Object.keys(schema.properties ?? {}).map((k) => (required.has(k) ? k : `${k}?`));
  return wrap(`${tool.name}(${args.join(", ")})`, 76, "    ");
}

// The engine, said at length: what it is, how to install and start it once it is released,
// and, always, what an agent has without it.
function engineSection(): string {
  const install = site.engineReleased ? engineInstall() : null;
  const what = install
    ? "The engine is a command line (pcre) and a local MCP server (pcre-mcp) that keep a firm's records in a folder on the operator's own machine: playbook runs, audits, deadlines and deals, with a log of every change. It refuses any move a playbook does not allow, and it never records a person's step under the agent's name. The name it records instead is the agent's word that the person did it, not proof."
    : "The engine is a command line and a local MCP server that keep a firm's records in a folder on the operator's own machine: playbook runs, audits, deadlines and deals, with a log of every change. It is not released yet.";
  const steps = install
    ? [
        "",
        "Install it (Node 24):",
        `  ${install}`,
        "Start a firm folder:",
        "  pcre firm init --firm <folder>",
        "Start every session with:",
        "  pcre firm status --firm <folder>   (or the firm_status tool)",
        "Add the local server to Claude Code:",
        "  claude mcp add promptedcre-local -- pcre-mcp --firm <folder>",
        "  (On Windows, put cmd /c before pcre-mcp.)",
        "Add it to Codex, in ~/.codex/config.toml:",
        "  [mcp_servers.promptedcre-local]",
        '  command = "pcre-mcp"',
        '  args = ["--firm", "<folder>"]',
      ]
    : [];
  const without =
    "A chat app that cannot run programs has no engine. There, your agent keeps the four-file folder by hand (get_firm_file_spec), and only the playbook's own stops guard a person's step: nothing refuses an agent that records one.";
  return [wrap(what, 78), ...steps, "", wrap(without, 78)].join("\n");
}

export function GET(request: Request): Response {
  const origin = new URL(request.url).origin;
  const mcp = `${origin}/api/mcp`;
  const hosts = HOSTS.map((h) =>
    [
      `${h.name}${h.detail ? ` (${h.detail})` : ""}`,
      `  Status: ${statusLine(h)}. ${h.basis}`,
      `  ${addsLine(h)}`,
      ...h.steps(mcp).map((line) => `  ${line}`),
      ...h.setup(mcp).map((line) => `  ${line}`),
    ].join("\n"),
  ).join("\n\n");
  const audits = getCorpus()
    .playbooks.filter((p) => p.kind === "audit")
    .sort((a, b) => a.order - b.order)
    .map((a) => `  ${a.slug}: ${a.depth === "full" ? `${a.steps.length} checks, written` : "listed, not written yet"}`)
    .join("\n");
  const status = site.connectorLive
    ? "Status: the hosted connector is live."
    : `Status: the hosted connector is not live yet. The setup below is how to add
it once it is. Until then, read the pages and the JSON exports listed at
${origin}/llms.txt.`;
  const text = `PromptedCRE: connect your agent
================================

${status}

Your job
--------
${jobBlock("install")}

Terms
-----
${terms()
  .map((line) => wrap(`- ${line}`, 78, "  "))
  .join("\n")}

What PromptedCRE is
-------------------
PromptedCRE is an open set of playbooks for real estate operators: firms that
raise capital and own property. It covers starting a firm, raising capital and
buying property, and auditing a firm that already exists. Each step says
whether an AI agent can do it or a person must, links the rules behind it and
says where it comes from: a cited source or common practice. The server is
read-only.

Some playbooks, rule cards and calculator labels still call the firm "the
sponsor". It is the same firm: the operator.

MCP server (streamable HTTP, no sign-in)
  ${mcp}

Tools (${TOOLS.length}), each with what it takes (? marks an optional input)
${TOOLS.map((t) => `  ${toolLine(t)}`).join("\n")}
  calc_run runs every calculator that has no tool of its own: with no id it
  lists them, with an id it returns the input schema and a worked
  example, and with an id and input it returns the result and its trace.

Keep the firm's records with the engine
---------------------------------------
${engineSection()}

Add it to your agent
--------------------
A host is "tested" once a playbook has been run through it end to end.
"Documented" means its steps come from the vendor's own documentation and
have not been run yet.

${hosts}

Audit a firm that already exists
--------------------------------
An audit is a playbook whose steps are checks. list_playbooks with kind
"audit" lists them; get_playbook returns the checks.
${audits}
Record each check as clear, a finding or unverified, with where the proof is.
A check you could not verify is unverified, not passed. An audit never fixes
anything: it ends with what to fix, who fixes it and when it is due.
Where an audit is only listed, walk the written playbooks as a checklist
instead: record each step that is already done, with its date and where the
proof is, then list what is left.
Ask once, at the start, before looking anything up in a public record such as
a state filing search, a franchise tax status page or SEC filings. Never log in
anywhere.

The firm file
-------------
Your agent keeps a small folder on your machine: firm.json, decisions.json,
progress.json and artifacts.json. Call get_firm_file_spec for the schemas.
The folder never leaves your machine, and no tool here takes it. A tool call
carries only what your agent puts in it (see Terms). What you share with a
chat app is handled under that app's own terms.

Pages for the person you work with
----------------------------------
  ${origin}/connect
    How a person connects an agent, host by host, and what the agent can
    and cannot see.
  ${origin}/audit
    The audit offer, with a finished example audit of a fictional firm: its
    score, findings and the sheet for each person with something to fix.
  ${origin}/run
    A recorded run of the engine on that firm: every command, who ran it and
    its real output, including the steps it refused.

More: ${origin}/llms.txt

Not legal, tax or investment advice. Every step says where it comes from.
`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
