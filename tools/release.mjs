// The public copy, made the same way for every release (CH24; answers 6 and 7 of 2026-11-18).
// It takes the committed tree (HEAD, or --ref), leaves out the working files that stay
// private, runs the leak check on what is left, and only then writes it into the public
// folder, whose own git history starts fresh. It prints what changed since the copy already
// there. The owner commits and pushes in that folder, and Vercel deploys. Nothing here pushes,
// deploys or touches promptedcre.com.
//
//   node tools/release.mjs                    export HEAD into ../promptedcre-public
//   node tools/release.mjs --out <folder>     another folder
//   node tools/release.mjs --ref <commit>     another commit
//   node tools/release.mjs --dry-run          check and compare, write nothing
//
// The same commit always gives the same files, byte for byte, so a second run on an
// unchanged tree reports no change.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUFFER = 512 * 1024 * 1024;

// What stays private (answers 6 and 7): the build plan, the decision log, the agent rules,
// the rankings procedures (.claude/commands), and the morning report, whose own first lines
// say it should not ship with a public repository.
export const PRIVATE = ["docs/BUILD-PLAN.md", "docs/DECISIONS.md", "CLAUDE.md", ".claude/", "MORNING_REPORT.md"];

export function isPrivate(file) {
  return PRIVATE.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));
}

// The committed tree at `ref` as path -> bytes, private files left out. One `git cat-file
// --batch` reads every blob, so the export takes seconds, not a process per file.
export function readTree(ref = "HEAD", cwd = ROOT) {
  const listing = execFileSync("git", ["ls-tree", "-r", "-z", "--full-tree", ref], { cwd, encoding: "utf8", maxBuffer: BUFFER });
  const entries = listing
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split("\t");
      const [mode, type, sha] = meta.split(" ");
      return { mode, type, sha, file };
    })
    .filter((e) => e.type === "blob" && e.mode !== "120000" && !isPrivate(e.file));
  const batch = spawnSync("git", ["cat-file", "--batch"], { cwd, input: entries.map((e) => e.sha).join("\n") + "\n", maxBuffer: BUFFER });
  if (batch.status !== 0) throw new Error(`git cat-file failed: ${batch.stderr.toString()}`);
  const out = batch.stdout;
  const files = new Map();
  let at = 0;
  for (const e of entries) {
    const eol = out.indexOf(10, at);
    const header = out.subarray(at, eol).toString("utf8");
    const size = Number(header.split(" ")[2]);
    if (!header.startsWith(e.sha) || !Number.isFinite(size)) throw new Error(`unexpected git cat-file output for ${e.file}: ${header}`);
    files.set(e.file, out.subarray(eol + 1, eol + 1 + size));
    at = eol + 1 + size + 1;
  }
  return files;
}

// Text compares without carriage returns, so a copy git checked out with CRLF line endings
// does not read as changed.
const comparable = (buf) => (buf.includes(0) ? buf : Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8"));
const digest = (buf) => crypto.createHash("sha256").update(comparable(buf)).digest("hex");

// Every file under a folder, as forward-slash paths; its .git and node_modules left out.
function walk(root, rel = "") {
  if (!fs.existsSync(path.join(root, rel))) return [];
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next") continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

// What the new tree changes against the files already in `dir`.
export function compare(files, dir) {
  const before = new Map(walk(dir).map((f) => [f, digest(fs.readFileSync(path.join(dir, f)))]));
  const added = [];
  const changed = [];
  for (const [f, buf] of files) {
    if (!before.has(f)) added.push(f);
    else if (before.get(f) !== digest(buf)) changed.push(f);
  }
  const removed = [...before.keys()].filter((f) => !files.has(f));
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}

export function writeTree(files, dir) {
  for (const f of walk(dir)) if (!files.has(f)) fs.rmSync(path.join(dir, f));
  for (const [f, buf] of files) {
    const target = path.join(dir, f);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
  }
}

// Problems that stop a release, and notes that do not.
export function checks(files) {
  const problems = [];
  const notes = [];
  const readme = files.get("README.md")?.toString("utf8") ?? "";
  if (readme.includes("<owner>/<repo>")) {
    problems.push("README.md still says <owner>/<repo> in the engine's install line: put the public repository's owner and name there, and the same address in site.repoUrl (lib/site.ts).");
  }
  for (const [f, buf] of files) {
    if (buf.includes(0)) continue;
    const text = buf.toString("utf8");
    for (const p of PRIVATE) if (text.includes(p.replace(/\/$/, ""))) notes.push(`${f} mentions ${p}, which stays private.`);
  }
  return { problems, notes };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const ref = arg("--ref") ?? "HEAD";
  const out = path.resolve(ROOT, arg("--out") ?? "../promptedcre-public");
  const dry = process.argv.includes("--dry-run");
  const commit = execFileSync("git", ["rev-parse", "--short", ref], { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) console.log(`Note: this checkout has uncommitted changes. They are not in a release of ${commit}.`);

  const files = readTree(ref);
  const { problems, notes } = checks(files);

  // The leak check reads the exported files themselves, in a folder of their own.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "pcre-release-"));
  try {
    writeTree(files, staging);
    const leak = spawnSync(process.execPath, [path.join(ROOT, "tools/leakcheck/check.mjs"), "--dir", staging, "--require"], { encoding: "utf8" });
    process.stdout.write(leak.stdout);
    process.stderr.write(leak.stderr);
    if (leak.status !== 0) problems.push("The leak check failed on the exported files (above).");
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  const diff = compare(files, out);
  console.log(`Release of ${commit}: ${files.size} files (left out: ${PRIVATE.join(", ")}).`);
  console.log(`Against ${out}: ${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed.`);
  for (const [label, list] of [["added", diff.added], ["changed", diff.changed], ["removed", diff.removed]]) {
    for (const f of list.slice(0, 40)) console.log(`  ${label}: ${f}`);
    if (list.length > 40) console.log(`  ... and ${list.length - 40} more ${label}`);
  }
  for (const n of notes) console.log(`Note: ${n}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`Stopped: ${p}`);
    return 1;
  }
  if (dry) {
    console.log("Dry run: nothing written.");
    return 0;
  }
  fs.mkdirSync(out, { recursive: true });
  writeTree(files, out);
  console.log(`Written to ${out}. Next, yours: commit there, push, and Vercel deploys (docs/DEPLOY.md).`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
