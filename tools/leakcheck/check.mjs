// Scans the repo for denylisted terms before anything is committed or built.
//   node tools/leakcheck/check.mjs              working tree (tracked + untracked, not ignored)
//   node tools/leakcheck/check.mjs --staged     staged versions only (the pre-commit hook)
//   node tools/leakcheck/check.mjs --dir <path> every file in a folder that is not a checkout,
//                                               such as the public copy tools/release.mjs makes
//   --require                                   fail if the denylist is missing
// Output names file, line, column and category. It never prints a matched term.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DENYLIST, LOCAL_DIR, ALLOW } from "./paths.mjs";
import { parseDenylist, scanText } from "./lib.mjs";

const argv = process.argv.slice(2);
const args = new Set(argv);
const staged = args.has("--staged");
const dirAt = argv.indexOf("--dir");
const dir = dirAt >= 0 && argv[dirAt + 1] ? path.resolve(argv[dirAt + 1]) : null;
const required = args.has("--require") || fs.existsSync(LOCAL_DIR);

// Every file under a folder, as forward-slash paths relative to it; .git and node_modules left out.
function walk(root, rel = "") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|mov|lock)$/i;
const SKIP_FILES = new Set(["package-lock.json"]);
const MAX_BYTES = 5 * 1024 * 1024;

function git(argv) {
  return execFileSync("git", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function readAllow() {
  try {
    return fs
      .readFileSync(ALLOW, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

function listFiles() {
  if (dir) return walk(dir);
  const out = staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    : git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  return out.split("\0").filter(Boolean);
}

function readFile(file) {
  if (staged) {
    const buf = execFileSync("git", ["show", `:${file}`], { maxBuffer: 64 * 1024 * 1024 });
    return buf.length > MAX_BYTES || buf.includes(0) ? null : buf.toString("utf8");
  }
  const full = dir ? path.join(dir, file) : file;
  if (!fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  if (!stat.isFile() || stat.size > MAX_BYTES) return null;
  const buf = fs.readFileSync(full);
  return buf.includes(0) ? null : buf.toString("utf8");
}

function main() {
  if (!fs.existsSync(DENYLIST)) {
    if (required) {
      console.error(
        "Leak check failed closed: the denylist is missing on this machine.\n" +
          "Regenerate it with: npm run leakcheck:generate",
      );
      return 1;
    }
    console.log("Leak check skipped: no denylist on this machine.");
    return 0;
  }
  const dl = parseDenylist(fs.readFileSync(DENYLIST, "utf8"), readAllow());
  const files = listFiles().filter((f) => !SKIP_EXT.test(f) && !SKIP_FILES.has(f.split("/").pop()));

  let total = 0;
  for (const file of files) {
    const text = readFile(file);
    if (text === null) continue;
    for (const hit of scanText(text, dl)) {
      total += 1;
      console.error(`${file}:${hit.line}:${hit.col}  ${hit.cat} (${hit.len} chars)`);
    }
  }
  if (total > 0) {
    console.error(`\nLeak check failed: ${total} hit(s). Open each location and rewrite it; the term is not printed.`);
    return 1;
  }
  console.log(`Leak check passed: ${files.length} ${staged ? "staged " : dir ? "exported " : ""}files clean against ${dl.count} denylist entries.`);
  return 0;
}

process.exit(main());
