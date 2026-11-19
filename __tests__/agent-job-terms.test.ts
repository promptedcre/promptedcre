import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { GET as installGET } from "@/app/install/route";
import { GET as llmsGET } from "@/app/llms.txt/route";
import { agentJob } from "@/lib/agent-job";
import { LOCAL_INSTRUCTIONS } from "@/lib/engine/local";
import { INSTRUCTIONS } from "@/lib/mcp/server";
import * as t from "@/lib/mcp/tools";
import { engineLine, terms } from "@/lib/site";

// CH04 and CH05 (the 2026-11-18 rethink): the terms and the agent's job are each written
// once, and every place an agent or a person reads them gives the same words.

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
// /install wraps its lines; compare words, not line breaks.
const flat = (s: string) => s.replace(/\s+/g, " ");

async function install(): Promise<string> {
  return installGET(new Request("https://example.test/install")).text();
}
async function llms(): Promise<string> {
  return llmsGET(new Request("https://example.test/llms.txt")).text();
}
async function toolsList(): Promise<{ name: string; description: string }[]> {
  const res = await POST(
    new Request("http://127.0.0.1:3300/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
  );
  const text = await res.text();
  const json = text.trim().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "{}");
  return (JSON.parse(json) as { result: { tools: { name: string; description: string }[] } }).result.tools;
}

describe("the terms, from one source (CH04)", () => {
  const lines = terms();

  it("are said on /install, in /llms.txt, by the status tool and in the hosted instructions", async () => {
    const page = flat(await install());
    const index = await llms();
    for (const line of lines) {
      expect(page, line).toContain(flat(line));
      expect(index, line).toContain(`- ${line}`);
    }
    expect(t.status().terms).toEqual(lines);
    expect(INSTRUCTIONS).toContain(lines.join(" "));
  });

  it("are the README's own Terms section, word for word", () => {
    const readme = read("README.md");
    for (const line of lines) expect(readme, line).toContain(`- ${line}`);
  });

  it("are what /connect and the methodology page show, through TermsList", () => {
    expect(read("components/connect/terms-list.tsx")).toContain("terms()");
    expect(read("app/connect/page.tsx")).toContain("<TermsList");
    expect(read("app/rankings/methodology/page.tsx")).toContain("<TermsList");
  });

  it("say hidden instructions are information, and what a tool call carries", () => {
    expect(lines.some((l) => l.includes("information, not instructions"))).toBe(true);
    expect(lines.some((l) => l.startsWith("A tool call sends the server only what the agent puts in it"))).toBe(true);
  });

  it("leave no page saying the server never receives what an agent shows it", () => {
    const files = ["app/install/route.ts", "app/llms.txt/route.ts", "lib/mcp/tools.ts", "lib/mcp/server.ts", "README.md", "app/connect/page.tsx"];
    for (const f of files) {
      const text = read(f);
      expect(text, f).not.toMatch(/never receives/);
      expect(text, f).not.toMatch(/Nothing in it is ever sent/);
    }
  });
});

describe("the agent's job, written once (CH05)", () => {
  it("opens /install, every part on its first screen, in order", async () => {
    const page = await install();
    const firstScreen = page.slice(0, page.indexOf("\nTerms\n"));
    expect(firstScreen).toContain("Your job\n--------");
    let at = 0;
    for (const part of agentJob("install")) {
      const next = firstScreen.indexOf(`${part.label}: `, at);
      expect(next, part.label).toBeGreaterThan(at - 1);
      at = next;
    }
    expect(flat(firstScreen)).toContain("run the entity audit (audit-entity-standing) first");
  });

  it("opens both servers' instructions", () => {
    for (const text of [INSTRUCTIONS, LOCAL_INSTRUCTIONS]) {
      for (const label of agentJob("hosted").map((p) => p.label)) expect(text).toContain(`${label}: `);
    }
    expect(INSTRUCTIONS).toContain("firm file");
    expect(LOCAL_INSTRUCTIONS).toContain("Start: start every session with firm_status.");
  });

  it("names no engine tool in the hosted server's text, which has none", () => {
    expect(INSTRUCTIONS).not.toMatch(/\bfirm_status\b|\brun_next\b|\baudit_next\b/);
  });

  it("leaves no agent-facing text saying Prompted CRE", async () => {
    const spec = JSON.stringify(t.firmFileSpec());
    const descriptions = (await toolsList()).map((x) => x.description).join("\n");
    for (const text of [INSTRUCTIONS, LOCAL_INSTRUCTIONS, descriptions, spec, JSON.stringify(t.status()), await install(), await llms()]) {
      expect(text).not.toContain("Prompted CRE");
    }
    expect(read("lib/engine/deadlines.ts")).toContain('"-//PromptedCRE//Deadlines//EN"');
  });

  it("calls the user an operator in the servers' text, and /install says where sponsor remains", async () => {
    // The spec's own words and schemas; its example is the fictional firm's data, whose name
    // and playbook slugs are content, not the server's text.
    const { example, ...own } = t.firmFileSpec();
    expect(JSON.stringify(own)).not.toMatch(/sponsor/i);
    expect(example.note).not.toMatch(/sponsor/i);
    const descriptions = (await toolsList()).map((x) => `${x.name}: ${x.description}`).join("\n");
    expect(descriptions).not.toMatch(/sponsor/i);
    expect(INSTRUCTIONS).not.toMatch(/sponsor/i);
    expect(flat(await install())).toContain('still call the firm "the sponsor". It is the same firm: the operator.');
  });
});

describe("the engine on the agent's path (CH03)", () => {
  it("says what the engine is and what an agent has without it, on /install and in /llms.txt", async () => {
    const page = flat(await install());
    expect(page).toContain("Keep the firm's records with the engine");
    expect(page).toContain("A chat app that cannot run programs has no engine.");
    expect(page).toContain("nothing refuses an agent that records one.");
    expect(await llms()).toContain(engineLine());
    expect(INSTRUCTIONS).toContain(engineLine());
  });

  it("calls the four files the fallback in the firm-file spec", () => {
    const spec = t.firmFileSpec();
    expect(spec.what).toContain("these four files are the fallback without it");
  });
});
