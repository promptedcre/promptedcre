import { createElement, type ComponentType, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { POST } from "@/app/api/mcp/route";
import { calcTool } from "@/components/calc/catalog";
import { workedExample } from "@/components/calc/examples";
import { figureFace, figureRuns, type CountAs } from "@/components/calc/format";
import { CALC_GROUPS, groupCalculators } from "@/components/calc/groups";
import { CALC_META, calcMeta, type CalcId } from "@/components/calc/meta";
import { MODULE_INFO } from "@/components/calc/module-info";
import { calculatorPreview, exampleLine } from "@/components/calc/previews";
import { getModule, isModuleCalc, MODULE_IDS, MODULES, runModule } from "@/lib/calculators/modules";
import { loadCorpus } from "@/lib/content/load";
import { TOOLS } from "@/lib/mcp/server";
import * as t from "@/lib/mcp/tools";

// The wiring every module calculator shares: registry, module shape, page info,
// client component and the calc_run tool. These hold for a stub and for the
// finished calculator alike; each calculator pins its own math in its own test.

const corpus = loadCorpus().corpus;
const live = corpus.calculators.filter((c) => c.status === "live");

// The naming rule a builder can guess from the id: cap-rate → capRate, CapRate, CAP_RATE.
const parts = (id: string) => id.split("-");
const camel = (id: string) => parts(id).map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
const pascal = (id: string) => parts(id).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
const constant = (id: string) => id.replace(/-/g, "_").toUpperCase();

// Text as React writes it into markup.
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

async function rpcCall(name: string, args: Record<string, unknown>): Promise<{ isError?: boolean; content: { text: string }[] }> {
  const res = await POST(
    new Request("http://127.0.0.1:3300/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );
  const text = await res.text();
  const json = text.trim().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "{}");
  return (JSON.parse(json) as { result: { isError?: boolean; content: { text: string }[] } }).result;
}

describe("module registry", () => {
  it("lists every module as a live calculator, and every live calculator is an original or a module", () => {
    const liveIds = new Set(live.map((c) => c.id));
    for (const id of MODULE_IDS) expect(liveIds.has(id), id).toBe(true);
    for (const c of live) expect(c.id in CALC_META || isModuleCalc(c.id), c.id).toBe(true);
    expect(new Set(MODULE_IDS).size).toBe(MODULE_IDS.length);
    expect(Object.keys(MODULES).sort()).toEqual([...MODULE_IDS].sort());
    expect(Object.keys(MODULE_INFO).sort()).toEqual([...MODULE_IDS].sort());
  });

  it("lists the originals first, then the modules in their own order", () => {
    const order = live.map((c) => c.id);
    const firstModule = order.findIndex((id) => isModuleCalc(id));
    expect(order.slice(firstModule)).toEqual([...MODULE_IDS]);
    expect(order.slice(0, firstModule).every((id) => id in CALC_META)).toBe(true);
  });
});

describe("the groups on /calculators", () => {
  it("place every live calculator once, five at most to a group", () => {
    const placed = CALC_GROUPS.flatMap((g) => g.ids);
    expect([...placed].sort()).toEqual(live.map((c) => c.id).sort());
    expect(new Set(placed).size).toBe(placed.length);
    for (const g of CALC_GROUPS) expect(g.ids.length, g.name).toBeLessThanOrEqual(5);
    // nothing falls through to the catch-all group
    expect(groupCalculators(live).map((g) => g.group.id)).toEqual(CALC_GROUPS.map((g) => g.id));
  });
});

// The data face is for figures and the text face for words (the page sets each run of a
// string in its own). The split is one function, so it is pinned here on every line of every
// worked example: nothing of a string is lost, no amount, rate or date is left among the
// words, and no word is set among the figures.
describe("figures and words", () => {
  const marked = (s: string, counts: CountAs = "figure") =>
    figureRuns(s, counts)
      .map((r) => (r.figure ? `[${r.text}]` : r.text))
      .join("");

  it("sets a formula's amounts, operators and function calls as figures and its words as words", () => {
    expect(marked("$500,000.00 ÷ 1.25", "word")).toBe("[$500,000.00 ÷ 1.25]");
    expect(marked("PV(6.50%/12, 360, $33,333.33)", "word")).toBe("[PV(6.50%/12, 360, $33,333.33)]");
    expect(marked("$10,200,000.00 − $6,000,000.00 loan", "word")).toBe("[$10,200,000.00 − $6,000,000.00] loan");
    expect(marked("smallest of the limits: coverage (DSCR)", "word")).toBe("smallest of the limits: coverage (DSCR)");
    expect(marked("IRR(contributions out, investor cash in)", "word")).toBe("[IRR(]contributions out, investor cash in[)]");
    expect(marked("first year max(1, 25 − 15) = 10, then every 25 years, through year 10", "word")).toBe("first year [max(1, 25 − 15) = 10], then every 25 years, through year 10");
    expect(marked("later of May 15 and notice 2026-05-20 + 30 days = 2026-06-19", "word")).toBe("later of May 15 and notice [2026-05-20 + 30] days [= 2026-06-19]");
    expect(marked("$11.00/SF × 50,000 SF − $500,000 (in place $10.00/SF)", "word")).toBe("[$11.00/SF × 50,000 SF − $500,000] (in place [$10.00/SF])");
  });

  it("reads a count inside a phrase as a word, and an operator between two words too", () => {
    expect(marked("sum of 6 lease years", "word")).toBe("sum of 6 lease years");
    expect(marked("year-6 NOI ÷ 6.50% exit cap", "word")).toBe("year-6 NOI [÷ 6.50%] exit cap");
    expect(marked("actual/360 charges the actual days", "word")).toBe("actual/360 charges the actual days");
    expect(marked("balance + interest − payment, month by month, 120 times", "word")).toBe("balance + interest − payment, month by month, 120 times");
    expect(marked("30 years × 12", "word")).toBe("30 years [× 12]");
  });

  it("sets every number of a value, a table cell or a dimension as a figure, and leaves its words", () => {
    expect(marked("$1,840,000 distributed")).toBe("[$1,840,000] distributed");
    expect(marked("5 years held")).toBe("[5] years held");
    expect(marked("Loan $5.27M")).toBe("Loan [$5.27M]");
    expect(marked("2.68x on $100,000")).toBe("[2.68x] on [$100,000]");
    expect(marked("Monday, 2026-06-22")).toBe("Monday, [2026-06-22]");
    expect(marked("year 10, -$213,435.36")).toBe("year [10, -$213,435.36]");
    expect(marked("212 bp")).toBe("[212 bp]");
    expect(figureFace(figureRuns("$5,273,694"))).toBe("data");
    expect(figureFace(figureRuns("none: nothing put in"))).toBe("words");
    expect(figureFace(figureRuns("$455,089 interest only"))).toBe("mixed");
    expect(figureFace(figureRuns(""))).toBe("data");
  });

  // Every line of the working, on all the worked examples.
  const lines = [
    ...(Object.keys(CALC_META) as CalcId[]).flatMap((id) => workedExample(id).trace.map((l) => ({ id: id as string, ...l }))),
    ...MODULE_IDS.flatMap((id) => {
      const m = getModule(id);
      return m.run(m.example).trace.map((l) => ({ id: id as string, ...l }));
    }),
  ];
  // What may stand among the figures besides digits and signs: a function's name, a unit, a subscripted variable, a power.
  const allowed = /(?:PV|PMT|FV|IRR|IPMT|PPMT|XIRR|min|max)\(|\b(?:SF|yr|mo|bp)\b|[A-Za-z]+_[A-Za-z]+|\^[A-Za-z0-9]+/g;

  it("splits every line of every worked example without losing a character", () => {
    expect(lines.length).toBeGreaterThan(400);
    for (const l of lines) {
      expect(figureRuns(l.formula, "word").map((r) => r.text).join(""), `${l.id}: ${l.label}`).toBe(l.formula);
      expect(figureRuns(l.value).map((r) => r.text).join(""), `${l.id}: ${l.label}`).toBe(l.value);
    }
  });

  it("leaves no amount, rate or date among the words, and no word among the figures", () => {
    for (const l of lines) {
      for (const [text, counts] of [[l.formula, "word"], [l.value, "figure"]] as Array<[string, CountAs]>) {
        for (const r of figureRuns(text, counts)) {
          const at = `${l.id}: ${l.label}: "${r.text}"`;
          if (r.figure) expect(r.text.replace(allowed, ""), at).not.toMatch(/[A-Za-z]{2,}/);
          else expect(r.text, at).not.toMatch(/\$\d|\d%|\d{4}-\d{2}-\d{2}|\d\.\d/);
        }
      }
    }
  });
});

describe.each(MODULE_IDS)("module %s", (id) => {
  const m = getModule(id);
  const entry = live.find((c) => c.id === id);

  it("keeps the exported names the naming rule gives", async () => {
    const lib = (await import(`../lib/calculators/${id}.ts`)) as Record<string, unknown>;
    expect(lib[`${camel(id)}Input`]).toBe(m.input);
    expect(typeof lib[`run${pascal(id)}`]).toBe("function");
    expect(lib[`${constant(id)}_EXAMPLE`]).toBe(m.example);
    expect(lib[`${camel(id)}Module`]).toBe(m);
    const info = (await import(`../components/calc/${id}-info.tsx`)) as Record<string, unknown>;
    expect(info[`${camel(id)}Info`]).toBe(MODULE_INFO[id]);
    const client = (await import(`../components/calc/${id}-calculator.tsx`)) as Record<string, unknown>;
    expect(typeof client[`${pascal(id)}Calculator`]).toBe("function");
  });

  it("has a registry entry that explains its method", () => {
    expect(m.id).toBe(id);
    expect(entry?.method.length ?? 0).toBeGreaterThan(0);
  });

  it("parses its worked example and returns a trace", () => {
    expect(m.input.safeParse(m.example).success).toBe(true);
    const r = m.run(m.example);
    expect(r.trace.length).toBeGreaterThan(0);
    for (const line of r.trace) {
      expect(line.label.length).toBeGreaterThan(0);
      expect(line.formula.length).toBeGreaterThan(0);
      expect(line.value.length).toBeGreaterThan(0);
    }
    // pure: the same input gives the same answer
    expect(JSON.stringify(m.run(m.example))).toBe(JSON.stringify(r));
  });

  it("describes every input field and rejects fields it does not know (D66)", () => {
    const schema = z.toJSONSchema(m.input, { io: "input" }) as { type: string; properties?: Record<string, { description?: string }>; additionalProperties?: unknown };
    expect(schema.type).toBe("object");
    const props = Object.entries(schema.properties ?? {});
    expect(props.length).toBeGreaterThan(0);
    for (const [key, p] of props) expect(p.description?.length ?? 0, `${id}.${key}`).toBeGreaterThan(0);
    expect(m.input.safeParse({ ...(m.example as object), notAField: 1 }).success).toBe(false);
  });

  it("gives the site its meta, example line, headline and preview", () => {
    const info = MODULE_INFO[id];
    expect(calcMeta(id)).toBe(info.meta);
    expect(info.meta.purpose.length).toBeGreaterThan(10);
    expect(info.meta.pinned.length).toBeGreaterThan(0);
    expect(info.meta.tests.length).toBeGreaterThan(0);
    expect(["independent", "none", "excel", "published"]).toContain(info.meta.checkedAgainst);
    expect(exampleLine(id)).toBe(info.exampleLine);
    const preview = calculatorPreview(id);
    expect(preview?.headline).toBe(info.headline());
    expect(preview?.headline.length ?? 0).toBeGreaterThan(0);
    expect(renderToStaticMarkup(preview?.figure as ReactElement).length).toBeGreaterThan(0);
    expect(calcTool(entry?.name ?? "", id)?.name).toBe("calc_run");
  });

  it("renders its client calculator on the worked example, with the trace", async () => {
    const client = (await import(`../components/calc/${id}-calculator.tsx`)) as Record<string, ComponentType<{ tool?: string | null }>>;
    const C = client[`${pascal(id)}Calculator`];
    expect(C).toBeDefined();
    const html = renderToStaticMarkup(createElement(C as ComponentType<{ tool?: string | null }>, { tool: "calc_run" }));
    const first = m.run(m.example).trace[0];
    expect(html).toContain(escapeHtml(MODULE_INFO[id].headline()));
    expect(html).toContain(escapeHtml(first?.label ?? ""));
    // the form is a section of its own beside the answer (an h2), and its errors are announced once, by the page's quiet live line
    expect(html).toMatch(/<h2[^>]*>Inputs<\/h2>/);
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).not.toContain('role="alert"');
  });

  it("runs through calc_run: listed, described, run, and bad input refused in plain words", () => {
    const listed = t.calcRun({}) as { calculators: { id: string; name: string; what: string | null }[] };
    expect(listed.calculators.find((c) => c.id === id)).toMatchObject({ name: entry?.name, what: entry?.what });

    const described = t.calcRun({ id }) as { input: { type: string }; example: unknown; page: string; method: string[] };
    expect(described.input.type).toBe("object");
    expect(described.example).toEqual(m.example);
    expect(described.page).toBe(`/calculators/${id}`);
    expect(described.method).toEqual(entry?.method);

    const ran = t.calcRun({ id, input: m.example as Record<string, unknown> }) as { result: { trace: unknown[] }; rules: unknown[]; page: string };
    expect(ran.result).toEqual(runModule(id, m.example));
    expect(ran.result.trace.length).toBeGreaterThan(0);
    expect(ran.rules).toHaveLength(entry?.rules.length ?? 0);
    expect(ran.page).toBe(`/calculators/${id}`);

    expect(() => t.calcRun({ id, input: {} })).toThrow(t.ToolError);
    expect(() => t.calcRun({ id, input: {} })).toThrow(new RegExp(`^Invalid input for ${id}: input\\.`));
  });
});

describe("calc_run", () => {
  it("is one read-only tool, and the module ids are its only ids", () => {
    const tool = TOOLS.find((x) => x.name === "calc_run");
    expect(tool).toBeDefined();
    expect(tool?.description.length ?? 0).toBeLessThanOrEqual(200);
    for (const id of MODULE_IDS) expect(t.CALC_TOOL[id]).toBe("calc_run");
    expect(t.calcRunArgs.safeParse({ id: "debt-sizing" }).success).toBe(false);
    expect(() => t.calcRun({ input: { a: 1 } })).toThrow(t.ToolError);
    expect(t.status().calculators.filter((c) => c.tool === "calc_run")).toHaveLength(MODULE_IDS.length);
  });

  it("answers over the protocol, and a wrong input comes back as a tool error", async () => {
    const id = MODULE_IDS[0];
    const ok = await rpcCall("calc_run", { id, input: getModule(id).example as Record<string, unknown> });
    expect(ok.isError).toBeFalsy();
    expect((JSON.parse(ok.content[0]?.text ?? "{}") as { result: { trace: unknown[] } }).result.trace.length).toBeGreaterThan(0);
    const bad = await rpcCall("calc_run", { id, input: { notAField: "x" } });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]?.text).toMatch(/^Invalid input for /);
    const unknown = await rpcCall("calc_run", { id: "no-such-calculator" });
    expect(unknown.isError).toBe(true);
    // the protocol layer refuses an unknown id before the tool runs, naming the ids it takes
    expect(unknown.content[0]?.text).toMatch(/id: Invalid option/);
    expect(unknown.content[0]?.text).toContain(MODULE_IDS[0]);
  });
});
