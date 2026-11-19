import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { DEBT_EXAMPLE } from "@/lib/calculators/debt";
import { DEADLINES_EXAMPLE } from "@/lib/calculators/deadlines";
import { RETURNS_EXAMPLE } from "@/lib/calculators/returns";
import { WATERFALL_EXAMPLE } from "@/lib/calculators/waterfall";
import { TOOLS, type CallLine } from "@/lib/mcp/server";

// CH08 (the 2026-11-18 rethink): the connector logs exactly one line per tool call, the tool
// and how it ended, and never what the agent sent.

async function call(name: string, args: Record<string, unknown>): Promise<void> {
  const res = await POST(
    new Request("http://127.0.0.1:3300/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );
  expect(res.status).toBe(200);
  await res.text();
}

// A word no record holds, so a line that carried an argument would show it.
const MARK = "zebraquartz7731";

const CALLS: Record<string, Record<string, unknown>> = {
  status: {},
  search: { query: `form d deadline ${MARK}` },
  list_playbooks: { kind: "audit" },
  get_playbook: { slug: "form-sponsor-entity" },
  match_situation: { description: `the wire instructions changed by email ${MARK}` },
  get_rule: { id: "us-fed.reg-d.form-d-filing" },
  get_artifact: { id: "offering-memorandum" },
  list_documents: { query: "form d" },
  get_market: { market: "formation-back-office" },
  get_vendor: { market: "formation-back-office", vendor: "zenbusiness" },
  calc_waterfall: WATERFALL_EXAMPLE as unknown as Record<string, unknown>,
  calc_debt: DEBT_EXAMPLE as unknown as Record<string, unknown>,
  calc_returns: RETURNS_EXAMPLE as unknown as Record<string, unknown>,
  calc_deadlines: { ...DEADLINES_EXAMPLE, asOf: "2026-11-18" },
  calc_run: {},
  get_firm_file_spec: {},
};

function lines(spy: { mock: { calls: unknown[][] } }): CallLine[] {
  return spy.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((s: string) => s.startsWith('{"event":"tool_call"'))
    .map((s: string) => JSON.parse(s) as CallLine);
}

describe("the call log", () => {
  afterEach(() => vi.restoreAllMocks());

  it("covers every tool in the test", () => {
    expect(Object.keys(CALLS).sort()).toEqual(TOOLS.map((t) => t.name).sort());
  });

  it("writes one line per call, with the tool and its outcome and nothing the agent sent", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const [name, args] of Object.entries(CALLS)) await call(name, args);
    const logged = lines(spy);
    expect(logged.map((l) => l.tool)).toEqual(Object.keys(CALLS));
    for (const l of logged) {
      expect(Object.keys(l).sort()).toEqual(["event", "outcome", "tool"]);
      expect(["ok", "error", "no-result", "not-covered"]).toContain(l.outcome);
    }
    const raw = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(raw).not.toContain(MARK);
    expect(raw).not.toContain("2026-11-18");
    expect(raw).not.toContain("form-sponsor-entity");
  });

  it("tells an error, an empty answer and a state not covered apart", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await call("get_rule", { id: "us-fed.no-such-rule" });
    await call("search", { query: MARK });
    await call("search", { query: "form an LLC in New York" });
    await call("search", { query: "form d deadline" });
    expect(lines(spy).map((l) => l.outcome)).toEqual(["error", "no-result", "not-covered", "ok"]);
  });

  it("logs a call the protocol refuses for bad input, once, as an error", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await call("calc_debt", { noi: MARK });
    await call("search", {});
    expect(lines(spy)).toEqual([
      { event: "tool_call", tool: "calc_debt", outcome: "error" },
      { event: "tool_call", tool: "search", outcome: "error" },
    ]);
    expect(spy.mock.calls.map((c) => String(c[0])).join("\n")).not.toContain(MARK);
  });

  it("logs nothing for a request that is not a tool call", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await POST(
      new Request("http://127.0.0.1:3300/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(lines(spy)).toEqual([]);
  });
});
