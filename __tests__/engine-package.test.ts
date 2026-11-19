import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { engineInstall, engineLine, site } from "@/lib/site";

// The engine, packaged (answer 15 and card G, 2026-11-18): installed straight from GitHub,
// with two commands that run from any folder.

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("the engine package", () => {
  it("names the two commands, each a file that exists", () => {
    expect(pkg.bin).toEqual({ pcre: "bin/pcre.mjs", "pcre-mcp": "bin/pcre-mcp.mjs" });
    for (const file of Object.values(pkg.bin ?? {})) expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
  });

  it("installs what the commands run with: tsx is a dependency, not a dev dependency", () => {
    expect(pkg.dependencies?.tsx).toBeTruthy();
    expect(pkg.devDependencies?.tsx).toBeUndefined();
  });

  it("runs pcre from a folder outside the repository", { timeout: 60_000 }, () => {
    const out = spawnSync(process.execPath, [path.join(ROOT, "bin", "pcre.mjs"), "help"], { cwd: os.tmpdir(), encoding: "utf8" });
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toContain("usage: pcre <group> <verb>");
    const bad = spawnSync(process.execPath, [path.join(ROOT, "bin", "pcre.mjs"), "no-such", "verb"], { cwd: os.tmpdir(), encoding: "utf8" });
    expect(bad.status).toBe(2);
  });

  it("gives the install command only for a GitHub repository", () => {
    expect(engineInstall("https://github.com/example-org/example-repo")).toBe("npm install -g github:example-org/example-repo");
    expect(engineInstall("https://github.com/example-org/example-repo.git/")).toBe("npm install -g github:example-org/example-repo");
    expect(engineInstall(null)).toBeNull();
    expect(engineInstall("https://example.test/repo")).toBeNull();
  });

  it("puts the install command in the engine line only once released, with a public repository", () => {
    const base = { codeLicense: "Apache-2.0", contentLicense: "CC BY 4.0" };
    expect(engineLine({ ...base, repoUrl: null, engineReleased: false })).toContain("is not released yet");
    expect(engineLine({ ...base, repoUrl: "https://github.com/example-org/example-repo", engineReleased: false })).toContain("is not released yet");
    expect(engineLine({ ...base, repoUrl: "https://github.com/example-org/example-repo", engineReleased: true })).toContain(
      "install: npm install -g github:example-org/example-repo",
    );
  });

  it("shows the README's install line, with the real repository once there is one", () => {
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    const install = engineInstall();
    expect(readme).toContain(install ?? "npm install -g github:<owner>/<repo>");
    expect(readme).not.toContain("Prompted CRE");
    expect(site.repoUrl === null || !readme.includes("<owner>/<repo>")).toBe(true);
  });
});
