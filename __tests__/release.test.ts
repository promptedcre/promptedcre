import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checks, compare, isPrivate, PRIVATE, readTree, writeTree } from "@/tools/release.mjs";

// CH24 (the 2026-11-18 rethink): the public copy is made by one script, the same way every
// release, from the committed tree, with the working files left out. The whole tree is read
// in memory; only a handful of files are written to disk, so the test stays light on a
// machine whose virus scanner reads every new file.

const temp: string[] = [];
afterAll(() => {
  for (const d of temp) fs.rmSync(d, { recursive: true, force: true });
});

describe("the release export", () => {
  it("leaves out the build plan, the decisions, the agent rules, the rankings procedures and the morning report", () => {
    expect(PRIVATE).toEqual(["docs/BUILD-PLAN.md", "docs/DECISIONS.md", "CLAUDE.md", ".claude/", "MORNING_REPORT.md"]);
    for (const f of ["docs/BUILD-PLAN.md", "docs/DECISIONS.md", "CLAUDE.md", ".claude/commands/rank-judge.md", "MORNING_REPORT.md"]) expect(isPrivate(f), f).toBe(true);
    for (const f of ["README.md", "docs/DEPLOY.md", "docs/guides/run-a-playbook.md", "AGENTS.md", ".github/ISSUE_TEMPLATE/contest-a-verdict.yml"]) expect(isPrivate(f), f).toBe(false);
  });

  it("reads the same files twice from one commit, and none of the private ones", { timeout: 60_000 }, () => {
    const first = readTree("HEAD");
    const second = readTree("HEAD");
    expect(first.has("README.md")).toBe(true);
    expect(first.has("package.json")).toBe(true);
    expect([...first.keys()].filter(isPrivate)).toEqual([]);
    expect([...second.keys()]).toEqual([...first.keys()]);
    for (const [f, buf] of first) expect(Buffer.compare(buf, second.get(f) ?? Buffer.alloc(0)), f).toBe(0);
  });

  it("writes a tree, reports nothing changed on a second run, and removes a stale file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pcre-release-test-"));
    temp.push(dir);
    const files = new Map([
      ["README.md", Buffer.from("# Example\r\n")],
      ["lib/a.ts", Buffer.from("export const a = 1;\n")],
      ["docs/b.md", Buffer.from("b\n")],
    ]);
    writeTree(files, dir);
    expect(compare(files, dir)).toEqual({ added: [], changed: [], removed: [] });
    // A checkout with CRLF line endings does not read as changed.
    fs.writeFileSync(path.join(dir, "lib/a.ts"), "export const a = 1;\r\n");
    expect(compare(files, dir).changed).toEqual([]);
    fs.writeFileSync(path.join(dir, "stale.txt"), "left from an earlier release");
    const next = new Map(files);
    next.set("docs/b.md", Buffer.from("b, changed\n"));
    expect(compare(next, dir)).toEqual({ added: [], changed: ["docs/b.md"], removed: ["stale.txt"] });
    writeTree(next, dir);
    expect(fs.existsSync(path.join(dir, "stale.txt"))).toBe(false);
    expect(compare(next, dir)).toEqual({ added: [], changed: [], removed: [] });
  });

  it("stops while the README's install line still has the placeholder", () => {
    const placeholder = new Map([["README.md", Buffer.from("npm install -g github:<owner>/<repo>\n")]]);
    expect(checks(placeholder).problems).toHaveLength(1);
    const filled = new Map([["README.md", Buffer.from("npm install -g github:example-org/example-repo\n")]]);
    expect(checks(filled).problems).toEqual([]);
  });
});
