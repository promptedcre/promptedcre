import { AsyncLocalStorage } from "node:async_hooks";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { jobSentences } from "../agent-job";
import { engineLine, terms } from "../site";
import * as t from "./tools";

// The MCP tool surface (build plan section 10): read-only, no sign-in, stateless.
// Sixteen tools (calc_run made it sixteen); a test measures the total description size.

export const SERVER_INFO = { name: "promptedcre", version: t.SERVER_VERSION } as const;

// The agent's job first (CH05), then how to use these tools, the engine in one line (CH03)
// and the terms (CH04). The job, the engine line and the terms each have one source.
export const INSTRUCTIONS = [
  "PromptedCRE: open playbooks for small real estate operators, read-only.",
  jobSentences("hosted"),
  "Start with search or list_playbooks; get_playbook gives the steps in order, who does each one (agent or person), approvals, rules and sources. " +
    "Keep the operator's firm file on their machine (get_firm_file_spec) and never send it here.",
  engineLine(),
  `Terms: ${terms().join(" ")}`,
].join(" ");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

type Payload = unknown;

// One line per tool call (CH08, amending D62's "no logging in handlers"): the tool and how
// the call ended, and nothing else. Never its arguments, the words of a query, an address or
// firm data. The hosting service keeps the lines with its runtime logs, for as long as its
// plan keeps logs.
export type CallOutcome = "ok" | "error" | "no-result" | "not-covered";
export type CallLine = { event: "tool_call"; tool: string; outcome: CallOutcome };

export function outcomeOf(payload: Payload): Exclude<CallOutcome, "error"> {
  if (!payload || typeof payload !== "object") return "ok";
  const p = payload as Record<string, unknown>;
  if (typeof p.coverage === "string") return "not-covered";
  const none = (k: string) => Array.isArray(p[k]) && (p[k] as unknown[]).length === 0;
  if ("hits" in p && none("hits")) return "no-result";
  if ("matches" in p && none("matches") && none("processes")) return "no-result";
  if (p.count === 0) return "no-result";
  return "ok";
}

// The request being answered, so the route can tell whether a tool's own handler wrote its
// line: a call the protocol layer refuses for bad input never reaches the handler, and the
// route writes that call's line instead (app/api/mcp/route.ts).
export const callScope = new AsyncLocalStorage<{ logged: boolean }>();

export function logCall(line: CallLine): void {
  const scope = callScope.getStore();
  if (scope) scope.logged = true;
  console.info(JSON.stringify(line));
}

function reply(tool: string, run: () => Payload) {
  try {
    const payload = run();
    logCall({ event: "tool_call", tool, outcome: outcomeOf(payload) });
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
  } catch (err) {
    logCall({ event: "tool_call", tool, outcome: "error" });
    const message =
      err instanceof t.ToolError ? err.message : err instanceof z.ZodError ? `Invalid input: ${err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}` : "The tool failed; try again or check the input.";
    return { isError: true as const, content: [{ type: "text" as const, text: message }] };
  }
}

export type ToolDef = { name: string; title: string; description: string; inputSchema: z.ZodType; run: (args: never) => Payload };

const empty = z.object({});

export const TOOLS: ToolDef[] = [
  { name: "status", title: "Status", description: "What PromptedCRE covers, and its terms: counts, structures, jurisdictions and the content date. Call once at the start.", inputSchema: empty, run: () => t.status() },
  { name: "search", title: "Search", description: "Search playbooks, situations, rules, artifacts, documents, vendors. Hits carry full links. Open one with its get_ tool (vendor id: market/vendor); documents are links, calculators use calc_ tools.", inputSchema: t.searchArgs, run: t.search },
  { name: "list_playbooks", title: "List playbooks", description: "List playbooks, situations and audits by kind, phase or depth, with agent share, time and review status.", inputSchema: t.listPlaybooksArgs, run: t.listPlaybooks },
  { name: "get_playbook", title: "Get a playbook", description: "Get a playbook's steps in order for a structure, property type and jurisdictions: who does each step, approvals, rules and cited sources.", inputSchema: t.getPlaybookArgs, run: t.getPlaybook },
  { name: "match_situation", title: "Match a situation", description: "Describe what happened; get the closest situations, ranked, with their urgency.", inputSchema: t.matchSituationArgs, run: t.matchSituation },
  { name: "get_rule", title: "Get a rule card", description: "Get one rule card: the rule in plain words, its legal citation and sources.", inputSchema: t.getRuleArgs, run: t.getRule },
  { name: "get_artifact", title: "Get an artifact", description: "Get one artifact definition: what the document or record is, and its fields.", inputSchema: t.getArtifactArgs, run: t.getArtifact },
  { name: "list_documents", title: "List documents", description: "List the public forms and official pages operators use, with links and access level.", inputSchema: t.listDocumentsArgs, run: t.listDocuments },
  { name: "get_market", title: "Get a software market", description: "Get a software market's agent-readiness ranking: vendors, scores and status.", inputSchema: t.getMarketArgs, run: t.getMarket },
  { name: "get_vendor", title: "Get a vendor", description: "Get one vendor's verdicts in a ranked market, each with its cited evidence.", inputSchema: t.getVendorArgs, run: t.getVendor },
  { name: "calc_waterfall", title: "Waterfall and promote", description: "Run a distribution waterfall: preferred return, return of capital, catch-up and promote tiers, by deal or whole fund. Returns cash by party and a formula trace.", inputSchema: t.calcWaterfallArgs, run: t.calcWaterfall },
  { name: "calc_debt", title: "Debt sizing", description: "Size a loan under coverage, loan-to-value and debt-yield limits. Returns the binding limit, the payment schedule and a formula trace.", inputSchema: t.calcDebtArgs, run: t.calcDebt },
  { name: "calc_returns", title: "Returns and sensitivity", description: "IRR, equity multiple and cash-on-cash, levered and unlevered, with an exit-cap and growth sensitivity grid and a formula trace.", inputSchema: t.calcReturnsArgs, run: t.calcReturns },
  { name: "calc_deadlines", title: "Deadline calendar", description: "Deadlines from rule cards: Form D, Texas notice and franchise report, 1031, tax protest, contract periods. All inputs required except franchiseReportYear and asOf: null if unknown, [] for no periods.", inputSchema: t.calcDeadlinesArgs, run: t.calcDeadlines },
  { name: "calc_run", title: "Run a calculator", description: "Every other calculator, by id: value, cap rate, loans, leverage, IRR, tax, a sale, 1031, leases, reserves. No id lists them; an id alone gives its schema and example.", inputSchema: t.calcRunArgs, run: t.calcRun },
  { name: "get_firm_file_spec", title: "Firm file spec", description: "Schema and rules for the operator's local firm file. Keep it on the operator's machine; never send it here.", inputSchema: empty, run: () => t.firmFileSpec() },
];

export function registerTools(server: McpServer): void {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema as z.ZodObject, annotations: READ_ONLY },
      async (args: unknown) => reply(tool.name, () => tool.run(args as never)),
    );
  }
}
