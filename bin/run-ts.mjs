// Runs one of the engine's TypeScript entries (cli/pcre.ts, cli/mcp.ts) through tsx, the
// way pcre.cmd does from a checkout. The installed commands (bin/pcre.mjs, bin/pcre-mcp.mjs)
// call it, so `npm install -g github:<owner>/<repo>` gives a machine the engine with no
// build step. Standard input and output pass straight through: the local MCP server speaks
// its protocol on them.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function runTs(entry) {
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  const child = spawn(process.execPath, [tsx, "--tsconfig", path.join(root, "tsconfig.json"), path.join(root, entry), ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
