// Installs the local pre-commit hook. The hook lives in .git/hooks, so it is
// never committed; run this once per clone on the owner's machine.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
const hookPath = path.join(gitDir, "hooks", "pre-commit");
const hook = `#!/bin/sh
# Prompted CRE leak check (local hook, not committed). Fails closed if the
# denylist is missing. Installed by tools/leakcheck/install-hook.mjs.
exec node tools/leakcheck/check.mjs --staged --require
`;

fs.mkdirSync(path.dirname(hookPath), { recursive: true });
if (fs.existsSync(hookPath) && !fs.readFileSync(hookPath, "utf8").includes("Prompted CRE leak check")) {
  console.error(`A different pre-commit hook already exists at ${hookPath}; not overwriting it.`);
  process.exit(1);
}
fs.writeFileSync(hookPath, hook, { mode: 0o755 });
console.log(`Installed the leak-check pre-commit hook at ${hookPath}`);
