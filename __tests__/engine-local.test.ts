import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIONS, findAction } from "@/lib/engine/index";
import { callLocal, localTools, RESERVED_INPUTS, type LocalEnv } from "@/lib/engine/local";
import { exampleFirm, realCorpus, tempFirmDir, TODAY } from "./helpers/engine";

function env(firmDir: string): LocalEnv {
  return { firmDir, repoRoot: process.cwd(), corpus: realCorpus(), now: () => new Date(`${TODAY}T18:00:00.000Z`) };
}

describe("the local MCP tools", () => {
  it("offer every action once, and no action uses an input name the interfaces reserve", () => {
    const tools = localTools();
    expect(tools).toHaveLength(ACTIONS.length);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of tools) {
      expect(t.name, t.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
      expect(t.readOnly).toBe(!t.action.mutates);
      const own = Object.keys(t.action.input.shape);
      for (const reserved of RESERVED_INPUTS) expect(own, `${t.action.name} uses the reserved input "${reserved}"`).not.toContain(reserved);
      expect(Object.keys(t.inputSchema.shape)).toEqual(expect.arrayContaining(["by", "date"]));
    }
  });

  it("run an action and return its result, or its refusal as data", () => {
    const ctx = exampleFirm();
    const status = findAction("firm.status");
    const show = findAction("process.show");
    if (!status || !show) throw new Error("actions missing");
    const ok = callLocal(env(ctx.store.dir), status, {});
    expect(ok).toMatchObject({ ok: true, action: "firm.status", result: { name: "Example Sponsor LLC" } });
    expect(callLocal(env(ctx.store.dir), show, { id: "nope" })).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(callLocal(env(tempFirmDir()), status, {})).toMatchObject({ ok: false, error: { code: "no-firm" } });
    expect(callLocal(env(ctx.store.dir), status, { date: "tomorrow" })).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  });

  it("record who acted and the date given, the way --by and --date do", () => {
    const ctx = exampleFirm();
    const upgrade = findAction("firm.upgrade");
    const log = findAction("firm.log");
    if (!upgrade || !log) throw new Error("actions missing");
    expect(callLocal(env(ctx.store.dir), upgrade, { by: "Alex Example" }).ok).toBe(true);
    const out = callLocal(env(ctx.store.dir), log, { last: 1 });
    expect(out).toMatchObject({ ok: true, result: { events: [{ action: "firm.upgrade", by: "Alex Example" }] } });
  });
});

describe("the local MCP server", () => {
  it("speaks the protocol over stdio: lists the tools and answers a call", async () => {
    const ctx = exampleFirm();
    const child = spawn(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), path.join("cli", "mcp.ts"), "--firm", ctx.store.dir], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const replies = new Map<number, Record<string, unknown>>();
    let buffer = "";
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the server did not answer in time")), 25_000);
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const message = JSON.parse(line) as { id?: number };
          if (typeof message.id === "number") replies.set(message.id, message);
          if (replies.has(1) && replies.has(2) && replies.has(3)) {
            clearTimeout(timer);
            resolve();
          }
        }
      });
      child.on("error", reject);
    });
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "firm_status", arguments: {} } });
    try {
      await done;
    } finally {
      child.stdin.end();
      child.kill();
    }
    const init = replies.get(1)?.result as { serverInfo: { name: string } };
    expect(init.serverInfo.name).toBe("promptedcre-local");
    const listed = (replies.get(2)?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(listed.map((t) => t.name)).toEqual(localTools().map((t) => t.name));
    expect(listed.find((t) => t.name === "firm_status")?.annotations.readOnlyHint).toBe(true);
    const call = replies.get(3)?.result as { content: { text: string }[]; isError?: boolean };
    expect(call.isError).toBeUndefined();
    expect(JSON.parse(call.content[0]?.text ?? "{}")).toMatchObject({ ok: true, action: "firm.status", result: { name: "Example Sponsor LLC" } });
  }, 30_000);
});
