import fs from "node:fs";
import path from "node:path";
import { MARK_OF, type StepMark } from "../compute/site-facts";
import { applicableSteps, type Variant } from "../compute/variant";
import { formatIssues } from "../content/issues";
import { findAction, toolName } from "../engine/index";
import { LOCAL_SERVER } from "../engine/local";
import { JURISDICTION_LABEL, PROPERTY_LABEL, STRUCTURE_LABEL } from "../labels";
import { JURISDICTIONS, PROPERTY_TYPES, STRUCTURES, type Jurisdiction, type PropertyType, type Structure } from "../schemas/common";
import { demoRun, type DemoRun, type DemoStep } from "../schemas/demo";
import type { Playbook, Step } from "../schemas/playbook";
import { parseCalendar } from "./findings";

// The formation run (content/demo/form-llc.json, written by tools/demo-llc.ts) as an agent
// session, the way a coding agent's harness shows one: each recorded command is a call to
// the engine's own tool (cli/mcp.ts serves every action as a tool, named by toolName()), with
// its key arguments, and under it the engine's result in its own words. A person's step is
// handed to the person in plain words and comes back as that person's report, both read off
// the record; then the agent records it. Beside it stands the playbook's step list, in the
// view the run was read in, as the agent's task list.
//
// Every value comes from the recording or the catalog. A command that names a step takes the
// step's own title from the catalog; a command that names none takes a short fixed label
// below. A result is the engine's printed lines less the hints a command line adds (the next
// command to type, what is ready now) and less a deadline's id; a refusal is the engine's own
// message up to the command it suggests, and a refusal this file does not recognize throws, so
// a change in the engine's wording fails the test instead of putting words in its mouth. The
// software a step names comes from the caller (`vendorsFor`, which reads
// content/step-software.json and the rankings); it is shown as the service used only where
// the record itself names it, by its proof's file name.
//
// getLlcRun() reads the file from disk (server only); buildLlcChat() is pure.

export const LLC_FILE = path.join("content", "demo", "form-llc.json");

// Kept until the file changes, so a running dev server picks up "npm run demo:record-llc".
let cached: { mtimeMs: number; run: DemoRun } | null = null;

export function getLlcRun(): DemoRun {
  const file = path.join(process.cwd(), LLC_FILE);
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    // Missing: the read below says how to regenerate it.
  }
  if (cached && cached.mtimeMs === mtimeMs) return cached.run;
  const rel = LLC_FILE.split(path.sep).join("/");
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${rel} could not be read as JSON (${(err as Error).message}). Regenerate it with "npm run demo:record-llc".`);
  }
  const parsed = demoRun.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${rel} failed validation:\n${formatIssues(rel, parsed.error, data).join("\n")}\nRegenerate it with "npm run demo:record-llc".`);
  }
  cached = { mtimeMs, run: parsed.data };
  return parsed.data;
}

// ---------- The shape a page draws ----------

export type LlcLane = "agent" | "person";

/** Who acted on a record: the agent, or a person as recorded with --by. */
export type LlcWho = { lane: LlcLane; name: string; mark: StepMark };

/** A product that does a step, with the agent-ready score (out of 100) its market's ranking gives it; null when it is listed but not judged yet. */
export type LlcVendor = { id: string; name: string; government: boolean; score: number | null; href: string };

/** The products that do one step: the scored ones first, best first, then the listed ones not judged yet. */
export type LlcMarket = { id: string; name: string; href: string; vendors: LlcVendor[] };

/**
 * The caller's lookup of the software that does one step of a playbook (by the playbook's id,
 * the step's id and the market the step names); null when the step has none.
 */
export type VendorsFor = (playbookId: string, stepId: string, marketId: string) => LlcMarket | null;

export type LlcArg = { name: string; value: string | number | boolean };

/** A call to one of the engine's tools: its name as the local MCP server serves it, and the arguments the record gives it. */
export type LlcCall = { tool: string; args: LlcArg[] };

/** One recorded command as the session shows it. */
export type LlcEntry = {
  /** The recorded command, 0-based. */
  line: number;
  /** Who acted on the record: the agent, or the person named with --by. */
  who: LlcWho;
  /** The step's number in the list, for a command that records a step. */
  step: number | null;
  /** What it is: the step's own title, or a fixed label. */
  title: string;
  /** A person's record: the step handed to the person in plain words (whose step it is, and who records it). */
  ask: string | null;
  /** A person's record: what the person reports, read off the record ("done, proof drafts/..."). */
  reply: string | null;
  /** A step's record: the proof the record names (its --proof), for the session to show as a file. */
  proof: string | null;
  call: LlcCall;
  /** The engine's result, line by line, in its own words. */
  result: string[];
  refused: boolean;
  /** The software the record itself names (the proof's file name starts with the product's id), from the step's list. */
  service: LlcVendor | null;
  /** The products that do this step, when it names a market. */
  market: LlcMarket | null;
  /** The run was complete after this command. */
  complete: boolean;
};

export type LlcStepRow = {
  n: number;
  id: string;
  title: string;
  mark: StepMark;
  /** Who does it, as the catalog says: "agent", or the person's role ("counsel", "principal"). */
  role: string;
  /** "signature" for a step a person signs (the catalog's approval). */
  gate: "signature" | null;
  /** The recorded command that resolved it, 0-based; null when the recording never did. */
  doneAt: number | null;
};

export type LlcDate = {
  date: string;
  /** What is due, as the calendar file says it, less a trailing "(2027)" that repeats the year. */
  title: string;
  /** Where the calculator moved the date from, and the day of the week that moved it. */
  moved: { from: string; weekday: string } | null;
  /** The engine marked the date to be checked before anyone relies on it. */
  check: boolean;
};

export type LlcResult = {
  firm: string;
  playbook: string;
  done: number;
  total: number;
  /** The record of the step that signs and files the certificate of formation. */
  formation: { step: number; title: string; by: string; date: string } | null;
  dates: LlcDate[];
  /** What every date is for, when the dates share it. */
  datesTitle: string | null;
  calendar: { path: string; events: number } | null;
  /** The engine's line that every date it worked out is flagged for review. */
  review: string | null;
};

export type LlcLine = { command: string; by: string | null; exit: number; output: string; caption: string | null };

export type LlcChat = {
  recordedOn: string;
  firm: string;
  playbook: { slug: string; title: string };
  /** The view the run was read in, as the engine printed it and in words. */
  view: Variant & { label: string };
  /** The local engine's MCP server, the one whose tools the session calls. */
  server: { name: string; version: string };
  steps: LlcStepRow[];
  entries: LlcEntry[];
  result: LlcResult;
  /** The people the recording names with --by, roles left out: made up, like the firm. */
  people: string[];
  /** Every recorded command as it was recorded, for a page that wants to show them. */
  lines: LlcLine[];
};

// ---------- Words ----------

const AGENT = "Your agent";

// Work is named as the task, as a step's own title is.
const LABEL: Record<string, string> = {
  "firm init": "Set up the firm folder",
  "run approve": "Give the run's standing approval",
  "deadline compute": "Work out the filing dates",
  "deadline export": "Write the calendar file",
};

const ROLE_PHRASE: Record<string, string> = { cpa: "the CPA", counsel: "counsel", principal: "the principal" };
const ROLES = new Set(["principal", "counsel", "cpa", "lender", "title", "consultant", "investor", "broker", "agency"]);

const rolePhrase = (role: string) => ROLE_PHRASE[role] ?? `the ${role}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "Alex Example" stays a name; a role passed with --by reads as one ("Counsel").
const personName = (by: string) => (ROLES.has(by) ? capitalize(rolePhrase(by)) : by);
// Inside a sentence a role stays lower case: "Over to counsel".
const inSentence = (by: string) => (ROLES.has(by) ? rolePhrase(by) : by);

// ---------- Reading a recorded command ----------

type Parsed = { key: string; args: string[]; flags: Record<string, string | true> };

function parseCommand(command: string): Parsed {
  const tokens = [...command.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((m) => ({
    text: m[1] !== undefined ? m[1].replace(/\\(["\\$`])/g, "$1") : (m[2] ?? ""),
    quoted: m[1] !== undefined,
  }));
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (!t.quoted && t.text.startsWith("--")) {
      const next = tokens[i + 1];
      if (next && (next.quoted || !next.text.startsWith("--"))) {
        flags[t.text.slice(2)] = next.text;
        i += 1;
      } else flags[t.text.slice(2)] = true;
    } else words.push(t.text);
  }
  const [group = "", verb = "", ...args] = words;
  return { key: `${group} ${verb}`, args, flags };
}

function flag(p: Parsed, name: string): string | null {
  const v = p.flags[name];
  return typeof v === "string" ? v : null;
}

function oneOf<T extends string>(values: readonly T[], value: string | undefined, what: string, where: string): T {
  if (value !== undefined && (values as readonly string[]).includes(value)) return value as T;
  throw new Error(`${where}: "${String(value)}" is not a ${what} the site knows.`);
}

// "Started form-sponsor-entity (syndication · industrial · us-federal, us-tx): 12 steps apply."
function readStart(output: string, where: string): { variant: Variant; applies: number } {
  const m = /^Started \S+ \(([\w-]+) · ([\w-]+) · ([^)]+)\): (\d+) steps? apply\./m.exec(output);
  if (!m) throw new Error(`${where}: the start of the run does not say which view it is read in.`);
  const variant: Variant = {
    structure: oneOf<Structure>(STRUCTURES, m[1], "structure", where),
    propertyType: oneOf<PropertyType>(PROPERTY_TYPES, m[2], "property type", where),
    jurisdictions: (m[3] ?? "").split(", ").map((j) => oneOf<Jurisdiction>(JURISDICTIONS, j, "jurisdiction", where)),
  };
  return { variant, applies: Number(m[4]) };
}

function viewLabel(v: Variant): string {
  return [STRUCTURE_LABEL[v.structure], PROPERTY_LABEL[v.propertyType], v.jurisdictions.map((j) => JURISDICTION_LABEL[j]).join(", ")].join(" · ");
}

// The tool call a recorded command is: the action it names, served by the local MCP server
// under toolName(); its positional words under the action's own input names, and its flags
// under theirs. A run's playbook is said once, at its start, and left out of each step's call.
function callOf(p: Parsed, where: string): LlcCall {
  const action = findAction(p.key.replace(" ", "."));
  if (!action) throw new Error(`${where}: the engine has no action "${p.key}".`);
  const args: LlcArg[] = [];
  action.positional.forEach((name, i) => {
    const value = p.args[i];
    if (value !== undefined && !(action.name === "run.done" && name === "playbook")) args.push({ name, value });
  });
  for (const [name, value] of Object.entries(p.flags)) {
    const key = name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    args.push({ name: key, value: value === true ? true : /^\d+$/.test(value) ? Number(value) : value });
  }
  return { tool: toolName(action), args };
}

// The engine's own message for a refusal, up to the command it suggests typing next.
function refusalWords(output: string, where: string): string {
  const message = output.trim().split("\n")[0] ?? "";
  const known = [/is a step a person does/, /is covered by the run's standing approval, and none is recorded yet/, /is signed by a person/, /comes after steps that are still open/];
  if (!known.some((re) => re.test(message))) {
    throw new Error(`${where}: the engine refused in words this page does not know how to say: ${JSON.stringify(message)}`);
  }
  const cut = message.indexOf(": pcre ");
  return `${(cut >= 0 ? message.slice(0, cut) : message).replace(/\.?$/, "")}.`;
}

// What the engine printed, less the hints a command line adds and less a deadline's id.
function resultLines(key: string, output: string): string[] {
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^(next|ready now): /.test(l) && !/^Import it into your calendar app/.test(l));
  if (key === "run done") {
    // "draft-certificate: done by agent on 2026-11-17" and "form-sponsor-entity is open: 4 done of 12", as one line.
    const [done = "", state = "", ...rest] = lines;
    const counts = state.replace(/^\S+ is (open|complete): /, (_, s: string) => (s === "complete" ? "complete: " : ""));
    return [[done.replace(/^\S+: /, ""), counts].filter(Boolean).join(" · "), ...rest];
  }
  return lines.map((l) => l.replace(/\s{2}\[[\w-]+\]$/, ""));
}

// ---------- The session ----------

export function buildLlcChat(run: DemoRun, playbooks: Playbook[], vendorsFor: VendorsFor): LlcChat {
  const scene = run.scenes[0];
  if (!scene || run.scenes.length !== 1) throw new Error("content/demo/form-llc.json: expected one scene, the formation run.");
  const at = (i: number, s: DemoStep) => `content/demo/form-llc.json, command ${i + 1} (${s.command})`;

  // The run's playbook and the view it is read in, from "pcre run start".
  const startAt = scene.steps.findIndex((s) => s.command.startsWith("pcre run start ") && s.exit === 0);
  const start = scene.steps[startAt];
  if (!start) throw new Error("content/demo/form-llc.json: the recording never starts a run.");
  const slugValue = parseCommand(start.command).args[0] ?? "";
  const pb = playbooks.find((p) => p.slug === slugValue);
  if (!pb) throw new Error(`${at(startAt, start)}: the catalog has no playbook "${slugValue}". Re-record with "npm run demo:record-llc".`);
  const { variant, applies } = readStart(start.output, at(startAt, start));
  const listed = applicableSteps(pb, variant);
  if (listed.length !== applies) {
    throw new Error(`${at(startAt, start)}: the engine said ${applies} steps apply and the catalog now has ${listed.length}. Re-record with "npm run demo:record-llc".`);
  }

  const steps: LlcStepRow[] = listed.map((s, i) => ({
    n: i + 1,
    id: s.id,
    title: s.title,
    mark: MARK_OF[s.mode],
    role: s.mode === "agent" || s.mode === "agent-browser" ? "agent" : (s.actor ?? "person"),
    gate: s.approval === "signature" ? "signature" : null,
    doneAt: null,
  }));
  const rowOf = (id: string, where: string): { row: LlcStepRow; step: Step } => {
    const i = listed.findIndex((s) => s.id === id);
    const row = steps[i];
    const step = listed[i];
    if (!row || !step) throw new Error(`${where}: "${id}" is not a step of ${pb.slug} in the ${viewLabel(variant)} view.`);
    return { row, step };
  };

  const entries: LlcEntry[] = [];
  let complete: { done: number; total: number } | null = null;
  for (const [line, s] of scene.steps.entries()) {
    const where = at(line, s);
    const p = parseCommand(s.command);
    const by = s.by;
    if (s.exit !== 0 && s.exit !== 1) throw new Error(`${where}: exit ${s.exit} is neither done nor refused.`);
    const refused = s.exit === 1;
    const base = { line, call: callOf(p, where), refused, ask: null, reply: null, proof: null, service: null, market: null, complete: false };

    if (p.key === "run done") {
      const { row, step } = rowOf(p.args[1] ?? "", where);
      const stepMark = MARK_OF[step.mode];
      const proof = flag(p, "proof");
      if (refused) {
        entries.push({ ...base, who: { lane: "agent", name: AGENT, mark: stepMark === "B" ? "B" : "A" }, step: row.n, title: step.title, result: [refusalWords(s.output, where)] });
        continue;
      }
      const done = /is complete: (\d+) done of (\d+)/.exec(s.output);
      if (done) complete = { done: Number(done[1]), total: Number(done[2]) };
      row.doneAt = line;
      const market = step.market ? vendorsFor(pb.id, step.id, step.market) : null;
      const file = proof?.split("/").at(-1) ?? "";
      const service = market?.vendors.find((v) => file.startsWith(`${v.id}-`)) ?? null;
      const who: LlcWho =
        by === null ? { lane: "agent", name: AGENT, mark: stepMark === "B" ? "B" : "A" } : { lane: "person", name: personName(by), mark: stepMark === "O" ? "O" : "H" };
      entries.push({
        ...base,
        who,
        step: row.n,
        title: step.title,
        ask: by === null ? null : `Step ${row.n} is a person's step: ${step.title}. Over to ${inSentence(by)}.`,
        reply: by === null ? null : proof ? `done, proof ${proof}` : "done",
        proof,
        result: resultLines(p.key, s.output),
        service,
        market,
        complete: done !== null,
      });
      continue;
    }

    if (refused) throw new Error(`${where}: only a step's record is shown as refused; this command did not succeed.`);
    if (p.key === "run approve") {
      if (by === null) throw new Error(`${where}: an approval with no person named.`);
      const covered = (/Covers: (.+)\.$/m.exec(s.output)?.[1] ?? "")
        .split(", ")
        .filter(Boolean)
        .map((id) => steps.find((r) => r.id === id))
        .filter((r): r is LlcStepRow => r !== undefined);
      const what = covered.map((r) => `Step ${r.n}, ${r.title},`).join(" and ");
      entries.push({
        ...base,
        who: { lane: "person", name: personName(by), mark: "H" },
        step: null,
        title: LABEL[p.key] ?? p.key,
        ask: `${what || "A step"} needs the run's standing approval. Over to ${inSentence(by)}.`,
        reply: "approved",
        result: resultLines(p.key, s.output),
      });
      continue;
    }
    const title = p.key === "run start" ? pb.title : p.key === "firm init" && flag(p, "name") ? `${LABEL[p.key]} for ${flag(p, "name")}` : LABEL[p.key];
    if (!title) throw new Error(`${where}: "pcre ${p.key}" has no words in the session. Add them to lib/demo/llc.ts.`);
    entries.push({ ...base, who: { lane: "agent", name: AGENT, mark: "A" }, step: null, title, result: resultLines(p.key, s.output) });
  }

  return {
    recordedOn: run.recordedOn,
    firm: run.firm,
    playbook: { slug: pb.slug, title: pb.title },
    view: { ...variant, label: viewLabel(variant) },
    server: { name: LOCAL_SERVER.name, version: LOCAL_SERVER.version },
    steps,
    entries,
    result: buildResult(run, scene.steps, pb, listed, steps, complete),
    people: [...new Set(scene.steps.flatMap((s) => (s.by !== null && !ROLES.has(s.by) ? [s.by] : [])))],
    lines: scene.steps.map((s) => ({ command: s.command, by: s.by, exit: s.exit, output: s.output, caption: s.caption })),
  };
}

// The end of the run: the firm, whether every step is done, the formation's own record,
// and the dates the run put on the calendar, read from the file the engine wrote and held
// to what "deadline compute" printed.
function buildResult(
  run: DemoRun,
  lines: DemoStep[],
  pb: Playbook,
  listed: Step[],
  steps: LlcStepRow[],
  complete: { done: number; total: number } | null,
): LlcResult {
  const filing = listed.findIndex((s) => s.approval === "signature" && (s.produces ?? []).includes("certificate-of-formation"));
  const filed = steps[filing];
  const record = filed?.doneAt === null || filed?.doneAt === undefined ? null : lines[filed.doneAt];
  const recorded = record ? /^\S+: done by (.+) on (\d{4}-\d{2}-\d{2})$/m.exec(record.output) : null;
  const formation = filed && recorded ? { step: filed.n, title: filed.title, by: recorded[1] ?? "", date: recorded[2] ?? "" } : null;

  const ics = run.scenes[0]?.files.find((f) => f.path.endsWith(".ics"));
  const events = ics ? [...parseCalendar(ics.text)].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const computed = lines.flatMap((s) => [...s.output.matchAll(/^ {2}\+ (\d{4}-\d{2}-\d{2}) {2}(.+?) {2}\[[\w-]+\]$/gm)].map((m) => ({ date: m[1] ?? "", title: m[2] ?? "" })));
  for (const c of computed) {
    if (!events.some((e) => e.date === c.date && e.summary === c.title)) {
      throw new Error(`content/demo/form-llc.json: the calendar file has no event for ${c.date} "${c.title}", which deadline compute added.`);
    }
  }
  const bare = (title: string) => title.replace(/\s*\(\d{4}\)$/, "");
  const shared = events.length > 0 && events.every((e) => bare(e.summary) === bare(events[0]?.summary ?? "")) ? bare(events[0]?.summary ?? "") : null;
  const dates: LlcDate[] = events.map((e) => {
    const moved = /moved from (\d{4}-\d{2}-\d{2}) past (\w+)/.exec(e.description ?? "");
    return {
      date: e.date,
      title: shared ?? e.summary,
      moved: moved ? { from: moved[1] ?? "", weekday: moved[2] ?? "" } : null,
      check: /Check this date before relying on it/.test(e.description ?? ""),
    };
  });
  const exported = lines.map((s) => /^Wrote (\d+) events? to (\S+)$/m.exec(s.output)).find((m) => m !== null);
  const review = lines.map((s) => /^Every computed date is flagged for review: .+$/m.exec(s.output)?.[0]).find((m) => m !== undefined) ?? null;

  return {
    firm: run.firm,
    playbook: pb.title,
    done: complete?.done ?? steps.filter((r) => r.doneAt !== null).length,
    total: complete?.total ?? steps.length,
    formation,
    dates,
    datesTitle: shared,
    calendar: exported ? { path: exported[2] ?? "", events: Number(exported[1]) } : null,
    review,
  };
}
