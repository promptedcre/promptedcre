import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIONS, toolName } from "@/lib/engine/index";
import { AGENT, parseActor, transition, validateProcess } from "@/lib/engine/machine";
import { withMachines } from "@/lib/engine/map";
import { GUARDS, PROCESSES, WORKFLOWS } from "@/lib/engine/processes";
import { firmProgress } from "@/lib/schemas/firm";
import { act, exampleFirm, makeCtx, refusal } from "./helpers/engine";

const person = parseActor("Alex Example");

describe("process definitions", () => {
  it("are well formed: every state is declared and reachable, and every guard is explained", () => {
    for (const def of Object.values(PROCESSES)) {
      expect(validateProcess(def), def.id).toEqual([]);
      for (const t of def.transitions) for (const g of t.guards) expect(g in GUARDS, `${def.id}.${t.action}: ${g}`).toBe(true);
    }
    for (const w of WORKFLOWS) for (const m of w.machines) expect(m in PROCESSES).toBe(true);
  });

  it("refuse a move the state does not allow, and say what is allowed", () => {
    expect(transition(PROCESSES.step, "todo", "done", AGENT).to).toBe("done");
    expect(refusal(() => transition(PROCESSES.step, "done", "block", AGENT, "waiting"))).toBe("transition-refused");
    expect(refusal(() => transition(PROCESSES.step, "todo", "fly", AGENT))).toBe("no-such-action");
    expect(refusal(() => transition(PROCESSES.step, "limbo", "done", AGENT))).toBe("unknown-state");
  });

  it("keep a person's decisions with a person, and ask for the reason", () => {
    expect(refusal(() => transition(PROCESSES.step, "todo", "skip", AGENT, "not needed"))).toBe("person-required");
    expect(transition(PROCESSES.step, "todo", "skip", person, "not needed").to).toBe("skipped");
    expect(refusal(() => transition(PROCESSES.step, "todo", "skip", person, "  "))).toBe("note-required");
    expect(refusal(() => transition(PROCESSES.finding, "open", "accept", AGENT, "fine"))).toBe("person-required");
    expect(refusal(() => transition(PROCESSES.deadline, "open", "dismiss", AGENT, "n/a"))).toBe("person-required");
    expect(refusal(() => transition(PROCESSES.audit, "open", "approve-lookups", AGENT))).toBe("person-required");
  });

  it("do not let anyone request a move the engine makes by itself", () => {
    expect(refusal(() => transition(PROCESSES.run, "open", "complete", person))).toBe("automatic");
  });
});

describe("actions", () => {
  it("have unique names that work as commands and as tool names", () => {
    const names = ACTIONS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(ACTIONS.map(toolName)).size).toBe(names.length);
    for (const a of ACTIONS) {
      expect(a.name, a.name).toMatch(/^[a-z]+\.[a-z]+(-[a-z]+)*$/);
      expect(a.summary.length, a.name).toBeGreaterThan(10);
      const keys = Object.keys(a.input.shape);
      for (const p of a.positional) expect(keys, `${a.name} positional ${p}`).toContain(p);
    }
  });
});

describe("firm folder", () => {
  it("is created empty, with unknowns as null, and passes its own check", () => {
    const ctx = makeCtx();
    const made = act<{ files: string[] }>(ctx, "firm.init", { name: "Sample Holdings LLC" });
    expect(made.files).toContain("log.jsonl");
    const profile = JSON.parse(fs.readFileSync(ctx.store.file("firm.json"), "utf8"));
    expect(profile).toMatchObject({ name: "Sample Holdings LLC", structure: null, entity: { type: null, status: null } });
    expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);
    expect(refusal(() => act(ctx, "firm.init"))).toBe("firm-exists");
  });

  it("refuses to work without a folder, and says how to make one", () => {
    expect(refusal(() => act(makeCtx(), "firm.status"))).toBe("no-firm");
  });

  it("reports a step id that no playbook has", () => {
    const ctx = exampleFirm();
    const progress = JSON.parse(fs.readFileSync(ctx.store.file("progress.json"), "utf8"));
    progress.playbooks["file-form-d-and-state-notices"].steps["no-such-step"] = { status: "todo", date: null, note: null };
    fs.writeFileSync(ctx.store.file("progress.json"), JSON.stringify(progress));
    expect(refusal(() => act(ctx, "firm.check"))).toBe("firm-invalid");
  });

  it("never writes something shaped like a tax id or an account number", () => {
    const ctx = exampleFirm();
    const progress = ctx.store.read("progress.json", firmProgress);
    progress.other = [{ task: "Call the bank", status: "todo", date: null, playbook: null, note: "account 000000000000" }];
    expect(refusal(() => ctx.store.write("progress.json", firmProgress, progress))).toBe("secret-detected");
    expect(refusal(() => ctx.store.appendLog({ at: "2026-11-12T12:00:00Z", by: "agent", action: "x", process: null, target: null, from: null, to: null, note: "ein 00-0000000" }))).toBe(
      "secret-detected",
    );
  });

  it("backs up before an upgrade, changes no record, and logs who did it", () => {
    const ctx = exampleFirm();
    const before = fs.readFileSync(ctx.store.file("progress.json"), "utf8");
    const out = act<{ backup: string }>(ctx, "firm.upgrade", {}, { by: "Alex Example" });
    expect(fs.existsSync(out.backup)).toBe(true);
    expect(fs.readFileSync(`${out.backup}/progress.json`, "utf8")).toBe(before);
    expect(fs.readFileSync(ctx.store.file("progress.json"), "utf8")).toBe(before);
    const again = act<{ backup: string }>(ctx, "firm.upgrade");
    expect(again.backup).not.toBe(out.backup);
    const log = act<{ events: { action: string; by: string }[] }>(ctx, "firm.log", { last: 2 });
    expect(log.events.map((e) => `${e.action} by ${e.by}`)).toEqual(["firm.upgrade by Alex Example", "firm.upgrade by agent"]);
  });

  it("makes changes take turns: a second writer waits, then is told the folder is busy", () => {
    const ctx = exampleFirm();
    const lock = ctx.store.file(".lock");
    fs.writeFileSync(lock, "another process\n");
    expect(refusal(() => ctx.store.withLock(() => "never", 120))).toBe("busy");
    // A lock left behind by a process that died is cleared, and the change goes through.
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lock, old, old);
    expect(ctx.store.withLock(() => "done")).toBe("done");
    expect(fs.existsSync(lock)).toBe(false);
    // An action that changes the folder holds the lock while it runs and lets go after, even when it refuses.
    act(ctx, "firm.upgrade");
    expect(refusal(() => act(ctx, "firm.init"))).toBe("firm-exists");
    expect(fs.existsSync(lock)).toBe(false);
    // The lock itself is never part of a backup.
    const backup = act<{ backup: string }>(ctx, "firm.upgrade").backup;
    expect(fs.existsSync(`${backup}/.lock`)).toBe(false);
  });

  it("still accepts a progress file written before the engine existed", () => {
    const old = { schemaVersion: 1, playbooks: { "form-sponsor-entity": { steps: { "check-name-texas": { status: "done", date: "2026-01-10", note: null } } } } };
    expect(firmProgress.safeParse(old).success).toBe(true);
  });
});

describe("the process map", () => {
  it("prints the machines exactly as they are defined", () => {
    const doc = fs.readFileSync("docs/PROCESS_MAP.md", "utf8").replace(/\r\n/g, "\n");
    expect(withMachines(doc) === doc, "docs/PROCESS_MAP.md is out of date; run: npx tsx tools/process-map.ts --write").toBe(true);
  });
});

describe("process descriptions", () => {
  it("are available as data, with what each guard means", () => {
    const all = act<{ workflows: { id: string }[]; machines: { id: string; transitions: { guards: { id: string; means: string | null }[] }[] }[] }>(makeCtx(), "process.list");
    expect(all.workflows.map((w) => w.id)).toEqual(["run-a-playbook", "audit-a-firm", "track-deadlines", "move-a-deal"]);
    for (const m of all.machines) for (const t of m.transitions) for (const g of t.guards) expect(g.means, `${m.id}: ${g.id}`).toBeTruthy();
    expect(refusal(() => act(makeCtx(), "process.show", { id: "nope" }))).toBe("not-found");
  });
});
