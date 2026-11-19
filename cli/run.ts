// The PromptedCRE command line as a function, so it can run in process: the
// entry (cli/pcre.ts), the tests and the recorded demo (tools/demo-run.ts) all
// call runCli. Every engine action is a command:
//
//   pcre <group> <verb> [arguments] [--flags]
//
// Flags every command takes:
//   --firm <folder>     the firm folder (or set PCRE_FIRM; or run from a folder that has ./firm)
//   --by <who>          who is acting: "agent" (the default) or a person's name or role
//   --date YYYY-MM-DD   the date to record an event under (default: today)
//   --json              print one JSON object: { ok, action, result } or { ok, action, error }
//
// Exit codes: 0 done · 1 the engine refused, and says why · 2 the command was
// not understood · 3 a bug. The catalog is read relative to the working folder,
// so a caller runs this with the repository as its working folder.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getCorpus } from "../lib/content/load";
import { ACTIONS, EngineError, FirmStore, execute, findAction, localDate, parseActor, type AnyAction, type Ctx } from "../lib/engine/index";

export type CliIo = {
  cwd: string; // the folder the command was typed in: --firm and ./firm are read from here
  env: Record<string, string | undefined>;
  repoRoot: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  now?: () => Date; // the clock; defaults to the real one and gives both "today" and ctx.now
};

type Kind = "boolean" | "number" | "string";
type Prop = { type?: string | string[]; anyOf?: { type?: string }[]; description?: string; enum?: unknown[] };
type Globals = { firm?: string; by?: string; date?: string; json: boolean; help: boolean };

class UsageError extends Error {}

const GLOBAL_KINDS: Record<string, Kind> = { firm: "string", by: "string", date: "string", json: "boolean", help: "boolean" };

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function props(action: AnyAction): { properties: Record<string, Prop>; required: string[] } {
  try {
    const json = z.toJSONSchema(action.input) as { properties?: Record<string, Prop>; required?: string[] };
    return { properties: json.properties ?? {}, required: json.required ?? [] };
  } catch {
    return { properties: {}, required: [] };
  }
}

function kindOf(prop: Prop): Kind {
  const types = [prop.type, ...(prop.anyOf ?? []).map((p) => p.type)].flat();
  if (types.includes("boolean")) return "boolean";
  if (types.includes("number") || types.includes("integer")) return "number";
  return "string";
}

function parseTokens(tokens: string[], action: AnyAction | null): { args: Record<string, unknown>; globals: Globals } {
  const properties: Record<string, Prop> = action ? props(action).properties : {};
  const args: Record<string, unknown> = {};
  const globals: Globals = { json: false, help: false };
  const rest: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] ?? "";
    if (!tok.startsWith("--") || tok.length === 2) {
      rest.push(tok);
      continue;
    }
    let key = tok.slice(2);
    let value: string | undefined;
    const eq = key.indexOf("=");
    if (eq >= 0) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    const name = camel(key);
    const prop = properties[name];
    const kind = GLOBAL_KINDS[name] ?? (prop ? kindOf(prop) : undefined);
    if (!kind) throw new UsageError(`Unknown flag --${key}.${action ? ` See: pcre ${action.name.replace(".", " ")} --help` : ""}`);
    let parsed: unknown;
    if (kind === "boolean") parsed = value === undefined ? true : value !== "false";
    else {
      if (value === undefined) {
        value = tokens[++i];
        if (value === undefined) throw new UsageError(`--${key} needs a value.`);
      }
      parsed = kind === "number" ? Number(value) : value;
    }
    if (name in GLOBAL_KINDS) (globals as Record<string, unknown>)[name] = parsed;
    else args[name] = parsed;
  }
  const positional = action?.positional ?? [];
  if (rest.length > positional.length) {
    throw new UsageError(`Too many arguments: "${rest.slice(positional.length).join(" ")}". Text with spaces needs quotes.`);
  }
  rest.forEach((value, i) => {
    const key = positional[i];
    if (key) args[key] = properties[key] && kindOf(properties[key]) === "number" ? Number(value) : value;
  });
  return { args, globals };
}

function helpFor(action: AnyAction): string {
  const { properties, required } = props(action);
  const words = action.name.replace(".", " ");
  const positional = action.positional.map((p) => (required.includes(p) ? `<${kebab(p)}>` : `[${kebab(p)}]`)).join(" ");
  const flags = Object.entries(properties)
    .filter(([key]) => !action.positional.includes(key))
    .map(([key, prop]) => {
      const kind = kindOf(prop);
      const choices = prop.enum ? ` (${prop.enum.join(" | ")})` : "";
      return `  --${kebab(key)}${kind === "boolean" ? "" : ` <${kind === "number" ? "n" : "text"}>`}${required.includes(key) ? "  required" : ""}${choices}${prop.description ? `  ${prop.description}` : ""}`;
    });
  const args = action.positional.map((p) => `  ${kebab(p)}${properties[p]?.description ? `  ${properties[p].description}` : ""}`);
  return [
    `pcre ${words}${positional ? ` ${positional}` : ""}`,
    `  ${action.summary}`,
    ...(args.length > 0 ? ["", "arguments:", ...args] : []),
    ...(flags.length > 0 ? ["", "flags:", ...flags] : []),
    "",
    "every command: --firm <folder>  --by <who>  --date YYYY-MM-DD  --json",
  ].join("\n");
}

function helpAll(actions: AnyAction[], group?: string): string {
  const groups = new Map<string, AnyAction[]>();
  for (const a of actions) {
    const g = a.name.split(".")[0] ?? a.name;
    if (group && g !== group) continue;
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }
  const width = Math.max(...actions.map((a) => a.name.length)) + 2;
  const lines = [...groups.entries()].flatMap(([, list]) => ["", ...list.map((a) => `  pcre ${a.name.replace(".", " ").padEnd(width)} ${a.summary}`)]);
  return [
    "pcre: run a real estate firm's playbooks, audits and deadlines from the command line.",
    "",
    "usage: pcre <group> <verb> [arguments] [--flags]      pcre <group> <verb> --help",
    ...lines,
    "",
    "every command: --firm <folder> (or PCRE_FIRM)  --by <who>  --date YYYY-MM-DD  --json",
    "start with: pcre guide show run-a-playbook",
  ].join("\n");
}

// Runs one command line (the words after "pcre") and returns its exit code.
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const clock = io.now ?? (() => new Date());
  const wantsJson = argv.includes("--json");
  const print = (value: unknown) => io.stdout(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  const fail = (action: string | null, code: string, message: string, details: Record<string, unknown>, exit: number): number => {
    if (wantsJson) print({ ok: false, action, error: { code, message, ...details } });
    else {
      io.stderr(`${message}\n`);
      const problems = details.problems;
      if (Array.isArray(problems)) for (const p of problems) io.stderr(`  ${String(p)}\n`);
    }
    return exit;
  };

  const [group, verb] = argv;
  if (!group || group === "help" || group === "--help") {
    print(helpAll(ACTIONS));
    return 0;
  }
  const action = verb && !verb.startsWith("--") ? findAction(`${group}.${verb}`) : undefined;
  if (!action) {
    const inGroup = ACTIONS.filter((a) => a.name.startsWith(`${group}.`));
    if (inGroup.length > 0 && (!verb || verb.startsWith("--"))) {
      print(helpAll(ACTIONS, group));
      return 0;
    }
    return fail(null, "unknown-command", `No command "pcre ${[group, verb].filter(Boolean).join(" ")}". Run "pcre help" to see them all.`, {}, 2);
  }

  try {
    const { args, globals } = parseTokens(argv.slice(2), action);
    if (globals.help) {
      print(helpFor(action));
      return 0;
    }
    if (globals.date && !/^\d{4}-\d{2}-\d{2}$/.test(globals.date)) throw new UsageError("--date is written like 2026-11-12.");
    const fallback = path.join(io.cwd, "firm");
    const dir = globals.firm ?? io.env.PCRE_FIRM ?? (fs.existsSync(path.join(fallback, "firm.json")) ? fallback : undefined);
    if (!dir && action.needsFirm) throw new UsageError('Say which firm folder: --firm <folder>, or set PCRE_FIRM. To make one: pcre firm init --firm <folder>');
    const today = localDate(clock());
    const ctx: Ctx = {
      store: new FirmStore(path.resolve(io.cwd, dir ?? "firm")),
      corpus: getCorpus(),
      actor: parseActor(globals.by),
      date: globals.date ?? today,
      today,
      now: clock,
      repoRoot: io.repoRoot,
    };
    const result = execute(action, ctx, args);
    if (globals.json) print({ ok: true, action: action.name, result });
    else print(action.text ? (action.text as (r: unknown) => string)(result) : result);
    return 0;
  } catch (err) {
    if (err instanceof UsageError) return fail(action.name, "usage", err.message, {}, 2);
    if (err instanceof EngineError) return fail(action.name, err.code, err.message, err.details, err.code === "invalid-input" ? 2 : 1);
    return fail(action.name, "bug", `Unexpected failure: ${(err as Error).stack ?? String(err)}`, {}, 3);
  }
}
