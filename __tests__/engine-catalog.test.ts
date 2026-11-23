import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STRUCTURES } from "@/lib/schemas/common";
import { firmProfile } from "@/lib/schemas/firm";
import { act, exampleFirm, makeCtx, realCorpus, refusal, tempFirmDir } from "./helpers/engine";

// The engine against the real catalog: every written record must be workable
// from start to finish, and the command line must do what the actions do.

type RunNext = { count: number; complete: boolean; items: { id: string }[] };
type AuditNext = { count: number; complete: boolean; items: { id: string; canAgentVerify: boolean; needsLookupApproval: boolean }[] };
type Score = { checks: number; clear: number; finding: number; unverified: number; unchecked: number; notCovered: string[]; line: string };

describe("the catalog on the engine", () => {
  it("lets every written playbook and situation be walked to complete, in every structure it is written for", () => {
    const written = realCorpus().playbooks.filter((p) => p.depth === "full" && p.kind !== "audit");
    expect(written.length).toBeGreaterThan(0);
    for (const structure of STRUCTURES) {
      const ctx = makeCtx();
      act(ctx, "firm.init", { name: "Sample Holdings LLC" });
      const profile = ctx.store.read("firm.json", firmProfile);
      ctx.store.write("firm.json", firmProfile, { ...profile, structure });
      for (const pb of written.filter((p) => p.written.structure.includes(structure))) {
        act(ctx, "run.start", { playbook: pb.slug });
        for (let turn = 0; turn < 100; turn++) {
          const next = act<RunNext>(ctx, "run.next", { playbook: pb.slug });
          if (next.complete) break;
          // A run with open steps and nothing ready would be a playbook no one can finish.
          expect(next.count, `${pb.slug} (${structure}) has open steps but nothing ready`).toBeGreaterThan(0);
          for (const item of next.items) act(ctx, "run.done", { playbook: pb.slug, step: item.id, proof: "test walk" }, { by: "Alex Example" });
        }
        expect(act<{ state: string }>(ctx, "run.show", { playbook: pb.slug }).state, `${pb.slug} (${structure})`).toBe("complete");
      }
      expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);
    }
    // Every step of every written record, three times over, each a file write. The
    // budget grows with the catalog: 42 written records took 66 to 97 s alone on 2026-11-14,
    // and all 94 took 24 s on a Linux machine on 2026-11-23, so a slower Windows disk gets room.
  }, 480_000);

  it("lets every written audit be walked from open to closed, and holds an agent to the rules on the way", () => {
    const audits = realCorpus().playbooks.filter((p) => p.kind === "audit" && p.depth === "full");
    expect(audits.length).toBeGreaterThan(0);
    for (const pb of audits) {
      const ctx = exampleFirm();
      const opened = act<{ audit: { id: string }; checks: number; readPublicRecords: number }>(ctx, "audit.open", { playbook: pb.slug });
      expect(opened.checks).toBeGreaterThan(0);
      let recorded = 0;
      for (let turn = 0; turn < 100; turn++) {
        const next = act<AuditNext>(ctx, "audit.next");
        if (next.complete) break;
        expect(next.count, `${pb.slug} has unchecked checks but nothing ready`).toBeGreaterThan(0);
        for (const item of next.items) {
          const clear = { check: item.id, outcome: "clear", evidence: "test walk" };
          // An agent may not read a public record before a person approves lookups, nor clear a human check.
          if (item.needsLookupApproval || !item.canAgentVerify) expect(refusal(() => act(ctx, "audit.record", clear)), item.id).toBe("guard-failed");
          act(ctx, "audit.record", clear, { by: "Alex Example" });
          recorded += 1;
        }
      }
      expect(recorded).toBe(opened.checks);
      const score = act<Score>(ctx, "audit.score");
      expect(score).toMatchObject({ checks: opened.checks, clear: opened.checks, finding: 0, unverified: 0, unchecked: 0 });
      // A score always says what it does not cover, every other audit included (D257).
      expect(score.notCovered.length).toBeGreaterThan(0);
      for (const other of audits.filter((a) => a.slug !== pb.slug)) expect(score.notCovered).toContain(`${other.title} (a separate audit)`);
      expect(act<{ state: string }>(ctx, "audit.close").state).toBe("closed");
      expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);
    }
  });
});

describe("the command line", () => {
  const pcre = (...args: string[]) => {
    const out = spawnSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), path.join("cli", "pcre.ts"), ...args], { encoding: "utf8" });
    let json: { ok?: boolean; action?: string; result?: Record<string, unknown>; error?: { code: string; message: string } } | null = null;
    try {
      json = JSON.parse(out.stdout);
    } catch {
      json = null;
    }
    return { code: out.status, json, stdout: out.stdout, stderr: out.stderr };
  };

  it("prints one JSON object per command with --json, and exits 0, 1 or 2 by what happened", () => {
    const firm = tempFirmDir();
    const init = pcre("firm", "init", "--example", "--firm", firm, "--json");
    expect(init.code).toBe(0);
    expect(init.json).toMatchObject({ ok: true, action: "firm.init" });

    const next = pcre("run", "next", "--firm", firm, "--json");
    expect(next.code).toBe(0);
    expect(next.json).toMatchObject({ ok: true, action: "run.next" });

    // The example firm's next Form D step is a person's: the agent is refused, with a reason, and exit code 1.
    const refused = pcre("run", "done", "file-form-d-and-state-notices", "set-up-login-gov", "--firm", firm, "--json");
    expect(refused.code).toBe(1);
    expect(refused.json).toMatchObject({ ok: false, action: "run.done", error: { code: "guard-failed" } });

    const typo = pcre("run", "next", "--frim", firm, "--json");
    expect(typo.code).toBe(2);
    expect(typo.json).toMatchObject({ ok: false, error: { code: "usage" } });

    expect(pcre("nonsense", "--json").code).toBe(2);
    // Without --json a person gets readable text on standard output and reasons on standard error.
    const text = pcre("firm", "check", "--firm", firm);
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/^OK /);
  }, 60_000);
});
