import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { formatIssues } from "../content/issues";
import { findSecrets, firmLogEvent, type FirmLogEvent } from "../schemas/firm";
import { EngineError } from "./machine";

// The firm folder on the operator's own machine: JSON files a person or an
// agent can read, plus one append-only log. Every write is validated against
// its schema, refused if it looks like it holds a secret, and replaces the file
// in one step, so a crash never leaves half a file. A lock file makes changes
// take turns, so two commands at once cannot overwrite each other.

export const LOG_FILE = "log.jsonl";
export const LOCK_FILE = ".lock";
const LOCK_STALE_MS = 30_000; // a lock this old was left by a process that died

// Blocks this thread briefly without spinning; the engine is synchronous.
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class FirmStore {
  private held = false;

  constructor(readonly dir: string) {}

  // Runs one change while holding the folder's lock. A folder that is not a
  // firm yet has nothing to protect. Waits for another writer up to `waitMs`,
  // then refuses, so a caller is never left hanging.
  withLock<T>(fn: () => T, waitMs = 5_000): T {
    // One action may run another (a deal starting a run): the lock is already ours.
    if (this.held || !this.exists("firm.json")) return fn();
    const lock = this.file(LOCK_FILE);
    const started = Date.now();
    for (;;) {
      try {
        fs.writeFileSync(lock, `${process.pid}\n`, { flag: "wx" });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        let age = 0;
        try {
          age = Date.now() - fs.statSync(lock).mtimeMs;
        } catch {
          continue; // the other writer just finished
        }
        if (age > LOCK_STALE_MS) {
          fs.rmSync(lock, { force: true });
          continue;
        }
        if (Date.now() - started >= waitMs) {
          throw new EngineError("busy", "Another command is changing this firm folder right now. Try again in a moment.", { dir: this.dir });
        }
        pause(50);
      }
    }
    this.held = true;
    try {
      return fn();
    } finally {
      this.held = false;
      fs.rmSync(lock, { force: true });
    }
  }

  file(name: string): string {
    return path.join(this.dir, name);
  }

  exists(name?: string): boolean {
    return fs.existsSync(name ? this.file(name) : this.dir);
  }

  // Reads and validates one JSON file. When the file is missing, `fallback`
  // supplies an empty record (nothing is written); without one it is an error.
  read<S extends z.ZodType>(name: string, schema: S, fallback?: () => z.output<S>): z.output<S> {
    const file = this.file(name);
    if (!fs.existsSync(file)) {
      if (fallback) return fallback();
      throw new EngineError("file-missing", `${name} is missing from ${this.dir}.`, { file: name });
    }
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      throw new EngineError("firm-invalid", `${name} is not valid JSON: ${(err as Error).message}`, { file: name });
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const problems = formatIssues(name, parsed.error, data);
      throw new EngineError("firm-invalid", `${name} does not match its schema: ${problems[0] ?? "see problems"}`, { file: name, problems });
    }
    return parsed.data;
  }

  write<S extends z.ZodType>(name: string, schema: S, value: z.input<S>): void {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const problems = formatIssues(name, parsed.error, value);
      throw new EngineError("invalid-record", `Refused to write ${name}: ${problems[0] ?? "it does not match its schema"}`, { file: name, problems });
    }
    const secrets = findSecrets(parsed.data, [name]);
    if (secrets.length > 0) {
      throw new EngineError("secret-detected", `Refused to write ${name}: ${secrets[0]}`, { file: name, problems: secrets });
    }
    this.writeText(name, `${JSON.stringify(parsed.data, null, 2)}\n`);
  }

  // For reports and calendar files. Returns the full path written.
  writeText(relPath: string, text: string): string {
    const file = this.file(relPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, file);
    return file;
  }

  appendLog(event: FirmLogEvent): void {
    const line = firmLogEvent.parse(event);
    const secrets = findSecrets(line, [LOG_FILE]);
    if (secrets.length > 0) {
      throw new EngineError("secret-detected", `Refused to log: ${secrets[0]}`, { file: LOG_FILE, problems: secrets });
    }
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(this.file(LOG_FILE), `${JSON.stringify(line)}\n`, "utf8");
  }

  // Every event, oldest first. A line that does not parse is reported, not skipped.
  readLog(): FirmLogEvent[] {
    const file = this.file(LOG_FILE);
    if (!fs.existsSync(file)) return [];
    const events: FirmLogEvent[] = [];
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((text, i) => {
        if (!text.trim()) return;
        let parsed: ReturnType<typeof firmLogEvent.safeParse>;
        try {
          parsed = firmLogEvent.safeParse(JSON.parse(text));
        } catch {
          throw new EngineError("firm-invalid", `${LOG_FILE} line ${i + 1} is not valid JSON.`, { file: LOG_FILE, line: i + 1 });
        }
        if (!parsed.success) {
          throw new EngineError("firm-invalid", `${LOG_FILE} line ${i + 1} is not a log event.`, { file: LOG_FILE, line: i + 1 });
        }
        events.push(parsed.data);
      });
    return events;
  }

  // Copies the whole folder beside itself and returns the copy's path.
  backup(date: string): string {
    const base = `${this.dir.replace(/[\\/]+$/, "")}-backup-${date}`;
    let target = base;
    for (let n = 2; fs.existsSync(target); n++) target = `${base}-${n}`;
    fs.cpSync(this.dir, target, { recursive: true, errorOnExist: true, filter: (src) => path.basename(src) !== LOCK_FILE });
    return target;
  }
}
