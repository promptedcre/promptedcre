// Starts the production server from the repo folder, whatever folder the caller
// runs it from. The connector routes read content/ and rankings/ relative to the
// working folder, so `next start <dir>` from elsewhere is not enough.
//   node tools/serve.mjs [port]          the production build (run `npm run build` first)
//   node tools/serve.mjs [port] --dev    the development server, which rebuilds on save
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = process.argv[2] ?? "3300";
const mode = process.argv.includes("--dev") ? "dev" : "start";
const child = spawn(process.execPath, [next, mode, "-H", "127.0.0.1", "-p", port], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
