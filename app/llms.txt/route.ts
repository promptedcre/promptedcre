import { getCorpus } from "@/lib/content/load";
import { PLANS_LABEL, llmsNote } from "@/lib/plans";
import { getRankings } from "@/lib/rankings/load";
import { engineLine, site, terms } from "@/lib/site";

// The llms.txt index: what the site is and where an agent should look.
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const origin = new URL(request.url).origin;
  const { playbooks, calculators } = getCorpus();
  const written = playbooks.filter((p) => p.depth === "full");
  const line = (title: string, path: string, note: string) => `- [${title}](${origin}${path}): ${note}`;
  // "72 playbooks, all written in full", or how many of them are still outlines.
  const outlinedNote = (records: typeof playbooks, noun: string) => {
    const out = records.filter((p) => p.depth !== "full").length;
    return `${records.length} ${noun}, ${out === 0 ? "all written in full" : `${records.length - out} written in full and ${out} outlined by step title`}`;
  };
  const text = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    site.connectorLive
      ? "Status: the hosted connector is live."
      : "Status: the hosted connector is not live yet. Until it is, read the pages and the JSON exports listed below.",
    "",
    `Connect an agent${site.connectorLive ? "" : " (once the connector is live)"}: ${origin}/install (MCP server at ${origin}/api/mcp, read-only, no sign-in).`,
    `An agent's job, in full (what it may do alone, where it asks first, what it never does, what done means), opens ${origin}/install.`,
    "",
    engineLine(),
    "",
    "## Terms",
    "",
    ...terms().map((l) => `- ${l}`),
    "",
    "## For people",
    "",
    line("Connect your agent", "/connect", "how a person connects an agent, one host at a time, and what the agent can and cannot see"),
    // The plans, for a person who asks what it costs (decision 129). /install and the
    // connector say only what works today.
    line(PLANS_LABEL, "/plans", llmsNote()),
    line("Audit a firm", "/audit", "the audit offer, with a finished example audit of a fictional firm: score, findings and a sheet for each person"),
    line("A recorded run", "/run", "the engine run on a fictional firm: every command, who ran it, its real output and the files it wrote"),
    "",
    "## Playbooks written in full",
    "",
    ...written.filter((p) => p.kind === "process").map((p) => line(p.title, `/playbooks/${p.slug}`, p.summary)),
    "",
    "## Scenarios written in full",
    "",
    ...written.filter((p) => p.kind === "situation").map((p) => line(p.title, `/playbooks/${p.slug}`, p.summary)),
    "",
    "## Audits written in full",
    "",
    ...written.filter((p) => p.kind === "audit").map((p) => line(p.title, `/playbooks/${p.slug}`, p.summary)),
    "",
    "## Libraries",
    "",
    line("All playbooks", "/playbooks", outlinedNote(playbooks.filter((p) => p.kind === "process"), "playbooks")),
    line("All situations", "/situations", outlinedNote(playbooks.filter((p) => p.kind === "situation"), "situations")),
    line("Audits", "/playbooks#audits", `${playbooks.filter((p) => p.kind === "audit").length} audits for a firm that already exists, ${written.filter((p) => p.kind === "audit").length} written in full`),
    line("Rules", "/rules", "rule cards with primary-source citations, by jurisdiction"),
    line("Firm documents", "/artifacts", "the documents and records the playbooks use and make"),
    line("Public forms", "/documents", "public forms and official pages, link-checked"),
    "",
    "## Calculators",
    "",
    "Through the connector, calc_run lists and runs, by id, every calculator below that has no tool of its own.",
    "",
    ...calculators.filter((c) => c.status === "live").map((c) => line(c.name, `/calculators/${c.id}`, c.what)),
    "",
    "## Software rankings",
    "",
    line("Methodology", "/rankings/methodology", "stories, evidence, judge, score and rules"),
    ...getRankings().markets.map((m) => line(m.market.name, `/rankings/${m.market.id}`, m.market.what)),
    "",
    "## Data",
    "",
    ...["playbooks", "rules", "artifacts", "documents", "calculators"].map((n) => line(`${n}.json`, `/export/${n}.json`, `all ${n} as JSON (CC BY 4.0)`)),
    `- Each written record as one Markdown file, ${origin}/playbooks/<slug>/playbook.md: paste it into any AI chat, no connector needed; it says which steps a person must do (CC BY 4.0)`,
    line("processes.json", "/export/processes.json","the state machines for runs, audits and deadlines: states, transitions, who may make each (Apache-2.0)"),
    "",
  ].join("\n");
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
