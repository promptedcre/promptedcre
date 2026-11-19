import type { z } from "zod";
import { DEFAULT_JURISDICTIONS, type Variant } from "../compute/variant";
import type { Corpus } from "../content/load";
import {
  firmAudits,
  firmCalendar,
  firmDecisions,
  firmProfile,
  firmProgress,
  type FirmAudits,
  type FirmCalendar,
  type FirmDecisions,
  type FirmProfile,
  type FirmProgress,
  type PlaybookProgress,
} from "../schemas/firm";
import type { Playbook, PlaybookKind } from "../schemas/playbook";
import { actorLabel, EngineError, type Actor } from "./machine";
import type { FirmStore } from "./store";

// An action is one thing the engine can do: a name, an input schema and a
// function. The command line and the local MCP server are both generated from
// the list of actions (lib/engine/index.ts), so a new action appears in both.

export type Ctx = {
  store: FirmStore;
  corpus: Corpus;
  actor: Actor;
  date: string; // the date an event is recorded under: today unless the caller gives one
  today: string; // the real current date, used to work out what is overdue
  now: () => Date;
  repoRoot: string;
};

export type AnyAction = {
  name: string; // "run.next": `pcre run next` on the command line, `run_next` as an MCP tool
  summary: string;
  process: string | null; // the machine or workflow it belongs to, for help and the process map
  mutates: boolean; // writes to the firm folder
  needsFirm: boolean;
  input: z.ZodObject;
  positional: readonly string[]; // input keys filled from positional arguments, in order
  run: (ctx: Ctx, args: never) => unknown;
  text?: (result: never) => string; // readable output for the command line without --json
};

export function defineAction<S extends z.ZodObject, R>(def: {
  name: string;
  summary: string;
  process: string | null;
  mutates: boolean;
  needsFirm?: boolean;
  input: S;
  positional?: readonly (keyof z.output<S> & string)[];
  run: (ctx: Ctx, args: z.output<S>) => R;
  text?: (result: R) => string;
}): AnyAction {
  return {
    name: def.name,
    summary: def.summary,
    process: def.process,
    mutates: def.mutates,
    needsFirm: def.needsFirm ?? true,
    input: def.input,
    positional: def.positional ?? [],
    run: def.run as AnyAction["run"],
    text: def.text as AnyAction["text"],
  };
}

export function toolName(action: AnyAction): string {
  return action.name.replace(/[.-]/g, "_");
}

// The calendar date where the operator is, as YYYY-MM-DD.
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Validates the input, then runs the action. Every refusal is an EngineError.
export function execute(action: AnyAction, ctx: Ctx, raw: unknown): unknown {
  const parsed = action.input.safeParse(raw ?? {});
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
    throw new EngineError("invalid-input", `${action.name}: ${problems.join("; ")}`, { problems });
  }
  if (action.needsFirm && !ctx.store.exists("firm.json")) {
    throw new EngineError("no-firm", `No firm folder at ${ctx.store.dir}. Create one with "pcre firm init --firm <folder>", or point --firm at an existing one.`, {
      dir: ctx.store.dir,
    });
  }
  const run = () => (action.run as (ctx: Ctx, args: unknown) => unknown)(ctx, parsed.data);
  // A change holds the folder's lock from its first read to its last write.
  return action.mutates ? ctx.store.withLock(run) : run();
}

// Appends one line to the firm's log. Call it after the files are written.
export function logEvent(
  ctx: Ctx,
  e: { action: string; process?: string | null; target?: string | null; from?: string | null; to?: string | null; note?: string | null },
): void {
  ctx.store.appendLog({
    at: ctx.now().toISOString(),
    by: actorLabel(ctx.actor),
    action: e.action,
    process: e.process ?? null,
    target: e.target ?? null,
    from: e.from ?? null,
    to: e.to ?? null,
    note: e.note ?? null,
  });
}

// ---- The firm's records. Optional files read as empty when they are not there yet. ----

export function readProfile(ctx: Ctx): FirmProfile {
  return ctx.store.read("firm.json", firmProfile);
}

export function readProgress(ctx: Ctx): FirmProgress {
  return ctx.store.read("progress.json", firmProgress, (): FirmProgress => ({ schemaVersion: 1, playbooks: {} }));
}

export function writeProgress(ctx: Ctx, value: FirmProgress): void {
  ctx.store.write("progress.json", firmProgress, value);
}

export function readDecisions(ctx: Ctx): FirmDecisions {
  return ctx.store.read("decisions.json", firmDecisions, (): FirmDecisions => ({ schemaVersion: 1, items: [] }));
}

export function writeDecisions(ctx: Ctx, value: FirmDecisions): void {
  ctx.store.write("decisions.json", firmDecisions, value);
}

export function readAudits(ctx: Ctx): FirmAudits {
  return ctx.store.read("audits.json", firmAudits, (): FirmAudits => ({ schemaVersion: 1, audits: [] }));
}

export function writeAudits(ctx: Ctx, value: FirmAudits): void {
  ctx.store.write("audits.json", firmAudits, value);
}

export function readCalendar(ctx: Ctx): FirmCalendar {
  return ctx.store.read("calendar.json", firmCalendar, (): FirmCalendar => ({ schemaVersion: 1, items: [] }));
}

export function writeCalendar(ctx: Ctx, value: FirmCalendar): void {
  ctx.store.write("calendar.json", firmCalendar, value);
}

// The runs that belong to the firm itself, or to one subject. Changing the
// returned object changes `progress`; write it back with writeProgress.
export function runsOf(progress: FirmProgress, subjectId: string | null | undefined): Record<string, PlaybookProgress> {
  if (!subjectId) return progress.playbooks;
  const subject = progress.subjects?.[subjectId];
  if (!subject) {
    throw new EngineError("not-found", `No subject "${subjectId}". Add it with "pcre subject add ${subjectId} --kind deal --label ...", or list them with "pcre subject list".`, {
      subject: subjectId,
      subjects: Object.keys(progress.subjects ?? {}),
    });
  }
  return subject.playbooks;
}

// The structure, property type and jurisdictions a run is read in: the firm's
// own, with a subject's structure and property type taking over when it has them.
export function variantFor(ctx: Ctx, subjectId?: string | null): Variant {
  const profile = readProfile(ctx);
  const subject = subjectId ? readProgress(ctx).subjects?.[subjectId] : undefined;
  return {
    structure: subject?.structure ?? profile.structure ?? "syndication",
    propertyType: subject?.propertyType ?? profile.propertyTypes[0] ?? "industrial",
    jurisdictions: profile.jurisdictions.length > 0 ? profile.jurisdictions : DEFAULT_JURISDICTIONS,
  };
}

// Finds a playbook by slug, optionally of given kinds, and says what is close when it is not there.
export function findPlaybook(ctx: Ctx, slugValue: string, kinds?: readonly PlaybookKind[]): Playbook {
  const pool = ctx.corpus.playbooks.filter((p) => !kinds || kinds.includes(p.kind));
  const found = pool.find((p) => p.slug === slugValue);
  if (found) return found;
  const words = slugValue.split("-").filter((w) => w.length > 2);
  const close = pool.filter((p) => words.some((w) => p.slug.includes(w))).map((p) => p.slug);
  const what = kinds ? kinds.join(" or ") : "playbook";
  throw new EngineError("not-found", `No ${what} "${slugValue}".${close.length > 0 ? ` Close: ${close.slice(0, 5).join(", ")}.` : ""}`, {
    slug: slugValue,
    close: close.slice(0, 5),
  });
}
