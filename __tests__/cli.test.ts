import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli/run";
import { ACTIONS } from "@/lib/engine/index";
import { exampleFirm, TODAY } from "./helpers/engine";

// The command line, driven in process the way cli/pcre.ts drives it.
async function pcre(argv: string[], firmDir?: string): Promise<{ exit: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const exit = await runCli(argv, {
    cwd: firmDir ? path.dirname(firmDir) : process.cwd(),
    env: firmDir ? { PCRE_FIRM: firmDir } : {},
    repoRoot: process.cwd(),
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    now: () => new Date(`${TODAY}T12:00:00.000Z`),
  });
  return { exit, stdout, stderr };
}

describe("the command line in process", () => {
  it("lists every action in its help", async () => {
    const { exit, stdout, stderr } = await pcre(["help"]);
    expect(exit).toBe(0);
    expect(stderr).toBe("");
    for (const action of ACTIONS) expect(stdout, action.name).toContain(`pcre ${action.name.replace(".", " ")} `);
  });

  it("returns 1 on a refusal and writes the reason to stderr", async () => {
    const dir = exampleFirm().store.dir;
    const { exit, stdout, stderr } = await pcre(["run", "done", "file-form-d-and-state-notices", "set-up-login-gov"], dir);
    expect(exit).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("is a step a person does");
    expect(stderr).toContain('--by "<name>"');
  });

  it("returns { ok, action, result } with --json", async () => {
    const dir = exampleFirm().store.dir;
    const { exit, stdout, stderr } = await pcre(["firm", "status", "--json"], dir);
    expect(exit).toBe(0);
    expect(stderr).toBe("");
    const out = JSON.parse(stdout) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["ok", "action", "result"]);
    expect(out).toMatchObject({ ok: true, action: "firm.status", result: { name: "Example Sponsor LLC" } });
  });

  it("records under the clock it is given", async () => {
    const dir = exampleFirm().store.dir;
    const { exit, stdout } = await pcre(["run", "done", "file-form-d-and-state-notices", "confirm-bad-actor-check", "--proof", "drafts/questionnaires.pdf"], dir);
    expect(exit).toBe(0);
    expect(stdout).toContain(`done by agent on ${TODAY}`);
  });

  it("returns 2 for a command it does not know, and for a malformed one", async () => {
    const unknown = await pcre(["nosuch", "thing"]);
    expect(unknown.exit).toBe(2);
    expect(unknown.stderr).toBe('No command "pcre nosuch thing". Run "pcre help" to see them all.\n');
    const json = await pcre(["nosuch", "thing", "--json"]);
    expect(json.exit).toBe(2);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, action: null, error: { code: "unknown-command" } });
    const missing = await pcre(["run", "done"], exampleFirm().store.dir);
    expect(missing.exit).toBe(2);
    expect(missing.stderr).toContain("run.done: playbook:");
  });
});
