import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { coverageNote, statesNotCovered } from "@/lib/mcp/coverage";
import { DEBT_EXAMPLE } from "@/lib/calculators/debt";

// CH06 (the 2026-11-18 rethink): honest answers to awkward asks, checked over the protocol
// the way an agent meets them.

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await POST(
    new Request("http://127.0.0.1:3300/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );
  expect(res.status).toBe(200);
  const text = await res.text();
  const json = text.trim().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "{}");
  const result = (JSON.parse(json) as { result: { isError?: boolean; content: { text: string }[] } }).result;
  expect(result.isError, result.content[0]?.text).toBeFalsy();
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

const isHttps = (u: unknown) => typeof u === "string" && /^https:\/\/\S+$/.test(u);

describe("a state the catalog does not cover", () => {
  it("gets a note naming it, from search and from situation matching", async () => {
    const s = await call("search", { query: "form an LLC in New York" });
    expect(s.coverage).toMatch(/^Not covered: New York\./);
    const m = await call("match_situation", { description: "We want to form an LLC in New York for our first deal" });
    expect(m.coverage).toMatch(/^Not covered: New York\./);
  });

  it("is named by its full name in any case, or its code in capitals, never Texas or Delaware", () => {
    expect(statesNotCovered("form an llc in new york")).toEqual(["New York"]);
    expect(statesNotCovered("Form D for a CA investor")).toEqual(["California"]);
    expect(statesNotCovered("an LLC in West Virginia")).toEqual(["West Virginia"]);
    expect(statesNotCovered("Texas and Delaware, TX and DE")).toEqual([]);
    expect(statesNotCovered("is it ok to file in or near Austin, me or hi")).toEqual([]);
    expect(statesNotCovered("Is that OK?")).toEqual([]);
    expect(statesNotCovered("FORM AN LLC IN TEXAS")).toEqual([]);
    expect(coverageNote("a Form D deadline")).toBeNull();
  });
});

describe("a Form D date already past", () => {
  it("is marked passed from asOf, and points to the missed Form D scenario", async () => {
    const out = await call("calc_deadlines", {
      firstSaleDate: "2026-09-01",
      firstTexasSaleDate: null,
      exchangeTransferDate: null,
      returnDueDate: null,
      appraisalNoticeDate: null,
      protestYear: null,
      contractEffectiveDate: null,
      contractPeriods: [],
      asOf: "2026-11-18",
    });
    const items = (out.result as { items: { id: string; date: string; passed?: boolean }[] }).items;
    const formD = items.find((x) => x.id === "form-d");
    expect(formD?.date).toBe("2026-09-16");
    expect(formD?.passed).toBe(true);
    const missed = out.formDPassed as { playbook: string; url: string };
    expect(missed.playbook).toBe("missed-form-d-deadline");
    expect(isHttps(missed.url)).toBe(true);
  });

  it("is not marked at all without asOf, and a date still ahead is not passed", async () => {
    const base = { firstTexasSaleDate: null, exchangeTransferDate: null, returnDueDate: null, appraisalNoticeDate: null, protestYear: null, contractEffectiveDate: null, contractPeriods: [] };
    const plain = await call("calc_deadlines", { ...base, firstSaleDate: "2026-09-01" });
    expect((plain.result as { items: { passed?: boolean }[] }).items[0]?.passed).toBeUndefined();
    expect(plain.formDPassed).toBeUndefined();
    const ahead = await call("calc_deadlines", { ...base, firstSaleDate: "2026-11-10", asOf: "2026-11-18" });
    expect((ahead.result as { items: { passed?: boolean }[] }).items[0]?.passed).toBe(false);
  });
});

describe("every record a tool returns", () => {
  it("carries a full https address", async () => {
    const list = await call("list_playbooks", {});
    for (const item of list.items as { url: string }[]) expect(isHttps(item.url)).toBe(true);
    expect(isHttps((await call("get_playbook", { slug: "form-sponsor-entity" })).url)).toBe(true);
    const search = await call("search", { query: "form d deadline" });
    for (const hit of search.hits as { url: string }[]) expect(isHttps(hit.url), hit.url).toBe(true);
    const m = await call("match_situation", { description: "the wire instructions for the closing changed by email" });
    for (const r of [...(m.matches as { url: string }[]), ...(m.processes as { url: string }[])]) expect(isHttps(r.url)).toBe(true);
    expect(isHttps((await call("get_rule", { id: "us-fed.reg-d.form-d-filing" })).url)).toBe(true);
    expect(isHttps((await call("get_artifact", { id: "offering-memorandum" })).url)).toBe(true);
    for (const d of (await call("list_documents", {})).documents as { url: string }[]) expect(isHttps(d.url), d.url).toBe(true);
    const status = (await call("status", {})) as { markets: { id: string }[] };
    const market = await call("get_market", { market: status.markets[0]?.id ?? "" });
    expect(isHttps(market.url)).toBe(true);
    const vendors = market.vendors as { id: string; url: string }[];
    for (const v of vendors) expect(isHttps(v.url)).toBe(true);
    expect(isHttps((await call("get_vendor", { market: status.markets[0]?.id ?? "", vendor: vendors[0]?.id ?? "" })).url)).toBe(true);
    expect(isHttps((await call("calc_debt", DEBT_EXAMPLE as unknown as Record<string, unknown>)).url)).toBe(true);
    for (const c of (await call("calc_run", {})).calculators as { url: string }[]) expect(isHttps(c.url)).toBe(true);
  });
});
