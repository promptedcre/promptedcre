import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { fromDays, toDays } from "../calculators/dates";
import { computeDeadlines, deadlinesInput, type Deadline, type DeadlinesInput } from "../calculators/deadlines";
import { isoDate, ruleId, slug } from "../schemas/common";
import type { FirmCalendar, FirmDeadline } from "../schemas/firm";
import { defineAction, logEvent, readCalendar, readProgress, writeCalendar, type AnyAction, type Ctx } from "./actions";
import { toIcs, type IcsItem } from "./ics";
import { actionsFrom, actorLabel, EngineError, transition } from "./machine";
import { PROCESSES } from "./processes";

// Track deadlines: the `deadline` machine (lib/engine/processes.ts). A deadline
// stores only open, done or dismissed. Overdue, due soon and upcoming are worked
// out from ctx.today on every read, so they can never go stale in the file.

export const DUE_SOON_DAYS = 30;
const PRODUCT_ID = "-//PromptedCRE//Deadlines//EN";

export type DeadlineState = "overdue" | "due-soon" | "upcoming" | "done" | "dismissed";
export type DeadlineView = FirmDeadline & { state: DeadlineState; daysLeft: number };

// Whole days from today to the due date, in UTC, so no time zone moves a day.
export function daysLeft(due: string, today: string): number {
  return toDays(due) - toDays(today);
}

export function stateOf(item: Pick<FirmDeadline, "status" | "due">, today: string): DeadlineState {
  if (item.status !== "open") return item.status;
  const left = daysLeft(item.due, today);
  if (left < 0) return "overdue";
  if (left <= DUE_SOON_DAYS) return "due-soon";
  return "upcoming";
}

function view(item: FirmDeadline, today: string): DeadlineView {
  return { ...item, state: stateOf(item, today), daysLeft: daysLeft(item.due, today) };
}

const byDue = (a: FirmDeadline, b: FirmDeadline) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id);

// Lowercase letters and digits joined by hyphens, to fit the slug schema.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function defaultId(title: string, due: string): string {
  return [slugify(title), due].filter(Boolean).join("-");
}

function requireRealDate(value: string, flag: string): void {
  if (fromDays(toDays(value)) !== value) {
    throw new EngineError("invalid-input", `${flag} ${value} is not a real calendar date. Write it like 2026-11-12.`, { [flag]: value });
  }
}

function requireRule(ctx: Ctx, rule: string | null | undefined): void {
  if (!rule) return;
  if (ctx.corpus.rules.some((r) => r.id === rule)) return;
  throw new EngineError("not-found", `No rule "${rule}" in the catalog. Leave --rule off, or use a rule id from the catalog, such as us-fed.reg-d.form-d-filing.`, {
    rule,
  });
}

function requireSubject(ctx: Ctx, subject: string | null | undefined): void {
  if (!subject) return;
  const subjects = readProgress(ctx).subjects ?? {};
  if (subject in subjects) return;
  throw new EngineError("not-found", `No subject "${subject}". Add it with "pcre subject add ${subject} --kind deal --label ...", or leave --subject off.`, {
    subject,
    subjects: Object.keys(subjects),
  });
}

function findDeadline(calendar: FirmCalendar, id: string): FirmDeadline {
  const found = calendar.items.find((d) => d.id === id);
  if (found) return found;
  throw new EngineError("not-found", `No deadline "${id}". See them all with "pcre deadline list --status all".`, { id });
}

// What an operator can do next from a stored status.
function nextActions(status: FirmDeadline["status"]): string[] {
  return actionsFrom(PROCESSES.deadline, status).map((t) => `deadline.${t.action}`);
}

function daysText(v: Pick<DeadlineView, "state" | "daysLeft">): string {
  if (v.state === "done" || v.state === "dismissed") return v.state;
  if (v.daysLeft < 0) return `overdue ${-v.daysLeft} day${v.daysLeft === -1 ? "" : "s"}`;
  if (v.daysLeft === 0) return "due today";
  return `${v.daysLeft} day${v.daysLeft === 1 ? "" : "s"} left`;
}

function line(v: DeadlineView): string {
  return `${v.due}  ${daysText(v).padEnd(17)} ${v.title}${v.needsReview ? " (check)" : ""}  [${v.id}]`;
}

// ---- add ----

const add = defineAction({
  name: "deadline.add",
  summary: "Add a dated duty to the firm's calendar by hand.",
  process: "deadline",
  mutates: true,
  input: z
    .object({
      title: z.string().min(3).describe("what has to be done, in plain words"),
      due: isoDate.describe("the due date, YYYY-MM-DD"),
      id: slug.optional().describe("an id of your own; default: the title and the due date joined by hyphens"),
      rule: ruleId.optional().describe("the catalog rule the date comes from, if any"),
      subject: slug.optional().describe("a subject id from progress.json, if it belongs to one deal or offering"),
      basis: z.string().min(1).optional().describe("how the date was worked out"),
      note: z.string().min(1).optional().describe("anything a person should know"),
      source: z.enum(["manual", "audit", "playbook"]).optional().describe("where it came from; default manual"),
      needsReview: z.boolean().optional().describe("flag the date for a person to check before relying on it"),
    })
    .strict(),
  run(ctx, args) {
    requireRealDate(args.due, "--due");
    const id = args.id ?? defaultId(args.title, args.due);
    if (!slug.safeParse(id).success) {
      throw new EngineError("invalid-input", `Could not make an id from "${args.title}". Give one with --id, such as renew-agent-2027.`, { title: args.title });
    }
    const calendar = readCalendar(ctx);
    if (calendar.items.some((d) => d.id === id)) {
      throw new EngineError("already-exists", `There is already a deadline "${id}". See it with "pcre deadline show ${id}", or pick another --id.`, { id });
    }
    requireRule(ctx, args.rule);
    requireSubject(ctx, args.subject);
    const record: FirmDeadline = {
      id,
      title: args.title,
      due: args.due,
      rule: args.rule ?? null,
      source: args.source ?? "manual",
      basis: args.basis ?? null,
      needsReview: args.needsReview ?? false,
      ...(args.subject ? { subject: args.subject } : {}),
      status: "open",
      closedOn: null,
      by: null,
      note: args.note ?? null,
    };
    calendar.items.push(record);
    writeCalendar(ctx, calendar);
    logEvent(ctx, { action: "deadline.add", process: "deadline", target: id, from: null, to: "open" });
    return { deadline: view(record, ctx.today), next: nextActions("open") };
  },
  text: (r) => `Added ${r.deadline.id}\n  ${line(r.deadline)}`,
});

// ---- compute ----

const DATE_FLAGS = ["firstSaleDate", "firstTexasSaleDate", "exchangeTransferDate", "returnDueDate", "appraisalNoticeDate", "contractEffectiveDate"] as const;
type DateFlag = (typeof DATE_FLAGS)[number];

const NEEDS =
  "The calculator needs at least one of: --first-sale-date, --first-texas-sale-date, --exchange-transfer-date, --appraisal-notice-date, --protest-year or --franchise-report-year, " +
  "or --contract-effective-date with at least one contract period (given in --input or --input-file).";

function readInput(ctx: Ctx, args: { input?: string; inputFile?: string }): unknown {
  if (args.input !== undefined && args.inputFile !== undefined) {
    throw new EngineError("invalid-input", "Give --input or --input-file, not both.", {});
  }
  let text = args.input;
  if (args.inputFile !== undefined) {
    const file = path.resolve(ctx.store.dir, args.inputFile);
    if (!fs.existsSync(file)) throw new EngineError("not-found", `No input file at ${file}. A relative path is read from the firm folder.`, { file });
    text = fs.readFileSync(file, "utf8");
  }
  try {
    return JSON.parse(text ?? "");
  } catch (err) {
    throw new EngineError("invalid-input", `The calculator input is not valid JSON: ${(err as Error).message}`, {});
  }
}

function buildInput(
  ctx: Ctx,
  args: Partial<Record<DateFlag, string>> & { protestYear?: number; franchiseReportYear?: number; input?: string; inputFile?: string },
): DeadlinesInput {
  if (args.input !== undefined || args.inputFile !== undefined) {
    const parsed = deadlinesInput.safeParse(readInput(ctx, args));
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
      throw new EngineError(
        "invalid-input",
        `The calculator input does not fit: ${problems[0] ?? "see problems"}. It needs every field, with null for a date you do not have.`,
        { problems },
      );
    }
    return parsed.data;
  }
  for (const key of DATE_FLAGS) {
    const value = args[key];
    if (value !== undefined) requireRealDate(value, `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  }
  return {
    firstSaleDate: args.firstSaleDate ?? null,
    firstTexasSaleDate: args.firstTexasSaleDate ?? null,
    exchangeTransferDate: args.exchangeTransferDate ?? null,
    returnDueDate: args.returnDueDate ?? null,
    appraisalNoticeDate: args.appraisalNoticeDate ?? null,
    protestYear: args.protestYear ?? null,
    franchiseReportYear: args.franchiseReportYear ?? null,
    contractEffectiveDate: args.contractEffectiveDate ?? null,
    contractPeriods: [],
  };
}

const NO_DATES: DeadlinesInput = {
  firstSaleDate: null,
  firstTexasSaleDate: null,
  exchangeTransferDate: null,
  returnDueDate: null,
  appraisalNoticeDate: null,
  protestYear: null,
  contractEffectiveDate: null,
  contractPeriods: [],
};

export function basisOf(item: Pick<Deadline, "computedFrom" | "rolledFrom" | "rollReason">): string {
  return item.rolledFrom ? `${item.computedFrom}; moved from ${item.rolledFrom} past ${item.rollReason ?? "a day that does not count"}` : item.computedFrom;
}

const compute = defineAction({
  name: "deadline.compute",
  summary: "Work out dates with the deadline calculator and add each to the calendar, flagged for review.",
  process: "deadline",
  mutates: true,
  input: z
    .object({
      firstSaleDate: isoDate.optional().describe("date of the first sale in the offering (Form D)"),
      firstTexasSaleDate: isoDate.optional().describe("date of the first sale to a Texas investor (Texas notice)"),
      exchangeTransferDate: isoDate.optional().describe("date the relinquished property was transferred (1031)"),
      returnDueDate: isoDate.optional().describe("tax return due date for the year of transfer, with extensions (1031)"),
      appraisalNoticeDate: isoDate.optional().describe("date the appraisal notice was delivered (Texas protest)"),
      protestYear: z.coerce.number().int().min(2000).max(2100).optional().describe("tax year to protest (Texas protest)"),
      contractEffectiveDate: isoDate.optional().describe("contract effective date; its periods come from --input"),
      franchiseReportYear: z.coerce.number().int().min(2000).max(2100).optional().describe("a year a Texas franchise tax report is due (May 15)"),
      franchiseReportThrough: z.coerce.number().int().min(2000).max(2100).optional().describe("with --franchise-report-year: also every year after it, through this one"),
      input: z.string().min(1).optional().describe("the whole calculator input as JSON; wins over the date flags"),
      inputFile: z.string().min(1).optional().describe("a JSON file holding the whole calculator input; relative to the firm folder"),
      subject: slug.optional().describe("a subject id from progress.json, if the dates belong to one deal or offering"),
    })
    .strict(),
  run(ctx, args) {
    const input = buildInput(ctx, args);
    requireSubject(ctx, args.subject);
    const { items, trace } = computeDeadlines(input);
    // One report a year: --franchise-report-through repeats the franchise date for the years after the first.
    if (args.franchiseReportThrough !== undefined) {
      const first = input.franchiseReportYear ?? null;
      if (first === null || args.franchiseReportThrough < first || args.franchiseReportThrough - first > 20) {
        throw new EngineError("invalid-input", "--franchise-report-through goes with --franchise-report-year, is not before it, and is at most 20 years after it.", {});
      }
      for (let year = first + 1; year <= args.franchiseReportThrough; year++) {
        const more = computeDeadlines({ ...NO_DATES, franchiseReportYear: year });
        items.push(...more.items);
        trace.push(...more.trace);
      }
    }
    if (items.length === 0) throw new EngineError("invalid-input", `Nothing to compute from what was given. ${NEEDS}`, { input });
    const calendar = readCalendar(ctx);
    const added: FirmDeadline[] = [];
    const existing: FirmDeadline[] = [];
    for (const item of items) {
      // A subject's dates carry its id, so the same date computed for two deals stays two deadlines.
      const id = `${args.subject ? `${args.subject}-` : ""}${item.id}-${item.date}`;
      const there = calendar.items.find((d) => d.id === id);
      // A date already on the calendar is left exactly as it is: a person may have closed or annotated it.
      if (there) {
        existing.push(there);
        continue;
      }
      const record: FirmDeadline = {
        id,
        title: item.label,
        due: item.date,
        rule: item.ruleId,
        source: "calculator",
        basis: basisOf(item),
        needsReview: true,
        ...(args.subject ? { subject: args.subject } : {}),
        status: "open",
        closedOn: null,
        by: null,
        note: item.note,
      };
      calendar.items.push(record);
      added.push(record);
    }
    if (added.length > 0) {
      writeCalendar(ctx, calendar);
      for (const d of added) logEvent(ctx, { action: "deadline.compute", process: "deadline", target: d.id, from: null, to: "open" });
    }
    return { added, existing, trace };
  },
  text: (r) =>
    [
      `Added ${r.added.length}, already on the calendar ${r.existing.length}.`,
      ...r.added.map((d) => `  + ${d.due}  ${d.title}  [${d.id}]`),
      ...r.existing.map((d) => `  = ${d.due}  ${d.title}  [${d.id}]`),
      "Every computed date is flagged for review: check it against its rule before relying on it.",
    ].join("\n"),
});

// ---- list and show ----

const list = defineAction({
  name: "deadline.list",
  summary: "The firm's deadlines by due date, with what is overdue and what is due soon.",
  process: "deadline",
  mutates: false,
  input: z
    .object({
      status: z.enum(["open", "done", "dismissed", "all"]).optional().describe("which deadlines; default open"),
      within: z.coerce.number().int().min(0).optional().describe("only open deadlines due within this many days, plus everything overdue"),
      subject: slug.optional().describe("only this subject's deadlines"),
    })
    .strict(),
  run(ctx, args) {
    const status = args.status ?? "open";
    const items = readCalendar(ctx)
      .items.filter((d) => status === "all" || d.status === status)
      .filter((d) => !args.subject || d.subject === args.subject)
      .sort(byDue)
      .map((d) => view(d, ctx.today))
      .filter((v) => args.within === undefined || (v.status === "open" && v.daysLeft <= args.within));
    return {
      count: items.length,
      overdue: items.filter((v) => v.state === "overdue").length,
      dueSoon: items.filter((v) => v.state === "due-soon").length,
      today: ctx.today,
      items,
    };
  },
  text: (r) =>
    r.count === 0
      ? 'No deadlines to show. Add one with "pcre deadline add --title ... --due YYYY-MM-DD".'
      : [`${r.count} deadline${r.count === 1 ? "" : "s"}: ${r.overdue} overdue, ${r.dueSoon} due soon (today ${r.today})`, ...r.items.map(line)].join("\n"),
});

const show = defineAction({
  name: "deadline.show",
  summary: "One deadline in full: its date, where it came from, its state and what can be done next.",
  process: "deadline",
  mutates: false,
  input: z.object({ id: z.string().min(1).describe("the deadline's id") }).strict(),
  positional: ["id"],
  run(ctx, args) {
    const record = findDeadline(readCalendar(ctx), args.id);
    return { deadline: view(record, ctx.today), next: nextActions(record.status) };
  },
  text: (r) => {
    const d = r.deadline;
    return [
      `${d.title}  [${d.id}]`,
      `  due ${d.due}: ${daysText(d)}`,
      d.rule ? `  rule ${d.rule}` : null,
      d.basis ? `  worked out: ${d.basis}` : null,
      d.note ? `  note: ${d.note}` : null,
      d.needsReview ? "  Check this date before relying on it." : null,
      d.closedOn ? `  closed ${d.closedOn} by ${d.by ?? "unknown"}` : null,
      `  next: ${r.next.join(", ") || "nothing"}`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  },
});

// ---- done, dismiss, reopen ----

// Keeps the record's earlier note and adds the new one under it, so a reason
// given at dismissal does not erase what the calculator or a person wrote before.
function appendNote(old: string | null, verb: string, ctx: Ctx, note: string | undefined): string | null {
  const text = (note ?? "").trim();
  if (!text) return old;
  const entry = `${verb} ${ctx.date} by ${actorLabel(ctx.actor)}: ${text}`;
  return old ? `${old}\n${entry}` : entry;
}

function move(ctx: Ctx, id: string, action: "done" | "dismiss" | "reopen", note: string | undefined) {
  const calendar = readCalendar(ctx);
  const record = findDeadline(calendar, id);
  const from = record.status;
  const to = transition(PROCESSES.deadline, from, action, ctx.actor, note).to as FirmDeadline["status"];
  record.status = to;
  if (to === "open") {
    record.closedOn = null;
    record.by = null;
  } else {
    record.closedOn = ctx.date;
    record.by = actorLabel(ctx.actor);
  }
  const verb = action === "done" ? "Done" : action === "dismiss" ? "Dismissed" : "Reopened";
  record.note = appendNote(record.note, verb, ctx, note);
  writeCalendar(ctx, calendar);
  logEvent(ctx, { action: `deadline.${action}`, process: "deadline", target: id, from, to, note: note?.trim() || null });
  return { deadline: view(record, ctx.today), from, next: nextActions(to) };
}

const changed = (r: ReturnType<typeof move>) => `${r.deadline.id}: ${r.from} -> ${r.deadline.status}\n  ${line(r.deadline)}`;

const done = defineAction({
  name: "deadline.done",
  summary: "Record that a deadline was met.",
  process: "deadline",
  mutates: true,
  input: z
    .object({
      id: z.string().min(1).describe("the deadline's id"),
      note: z.string().min(1).optional().describe("how it was met, or where the proof is"),
    })
    .strict(),
  positional: ["id"],
  run: (ctx, args) => move(ctx, args.id, "done", args.note),
  text: changed,
});

const dismiss = defineAction({
  name: "deadline.dismiss",
  summary: "A person decides a deadline does not apply, and says why.",
  process: "deadline",
  mutates: true,
  input: z
    .object({
      id: z.string().min(1).describe("the deadline's id"),
      note: z.string().optional().describe("required: why it does not apply"),
    })
    .strict(),
  positional: ["id"],
  run: (ctx, args) => move(ctx, args.id, "dismiss", args.note),
  text: changed,
});

const reopen = defineAction({
  name: "deadline.reopen",
  summary: "Open a done or dismissed deadline again, and say why.",
  process: "deadline",
  mutates: true,
  input: z
    .object({
      id: z.string().min(1).describe("the deadline's id"),
      note: z.string().optional().describe("required: why it is open again"),
    })
    .strict(),
  positional: ["id"],
  run: (ctx, args) => move(ctx, args.id, "reopen", args.note),
  text: changed,
});

// ---- export ----

// A relative path is inside the firm folder; any path that resolves outside it is refused.
function insideFirm(ctx: Ctx, out: string): string {
  const dir = path.resolve(ctx.store.dir);
  const rel = path.relative(dir, path.resolve(dir, out));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new EngineError("invalid-input", `${out} is outside the firm folder. Write the calendar file inside ${dir}, such as --out calendar.ics.`, { out, dir });
  }
  return rel;
}

const exportIcs = defineAction({
  name: "deadline.export",
  summary: "Write the deadlines to a calendar file (.ics) that a calendar app can import.",
  process: "deadline",
  mutates: true,
  input: z
    .object({
      out: z.string().min(1).optional().describe("where to write it, inside the firm folder; default calendar.ics"),
      status: z.enum(["open", "all"]).optional().describe("open deadlines only (the default), or all of them"),
    })
    .strict(),
  run(ctx, args) {
    const rel = insideFirm(ctx, args.out ?? "calendar.ics");
    const titles = new Map(ctx.corpus.rules.map((r) => [r.id, r.title]));
    const items: IcsItem[] = readCalendar(ctx)
      .items.filter((d) => (args.status ?? "open") === "all" || d.status === "open")
      .map((d) => ({
        id: d.id,
        title: d.title,
        due: d.due,
        rule: d.rule,
        ruleTitle: d.rule ? (titles.get(d.rule) ?? null) : null,
        basis: d.basis,
        note: d.note,
        needsReview: d.needsReview,
        status: d.status,
      }));
    const file = ctx.store.writeText(rel, toIcs(items, { now: ctx.now(), productId: PRODUCT_ID }));
    logEvent(ctx, { action: "deadline.export", process: null, target: rel, note: `${items.length} event${items.length === 1 ? "" : "s"}` });
    return { path: file, events: items.length };
  },
  text: (r) => `Wrote ${r.events} event${r.events === 1 ? "" : "s"} to ${r.path}\nImport it into your calendar app; export again after any change.`,
});

export const deadlineActions: AnyAction[] = [add, compute, list, show, done, dismiss, reopen, exportIcs];

// What `pcre firm status` shows for deadlines.
export function deadlineSummary(ctx: Ctx): {
  open: number;
  overdue: number;
  dueSoon: number;
  next: { id: string; title: string; due: string; daysLeft: number; state: DeadlineState }[];
} {
  const open = readCalendar(ctx)
    .items.filter((d) => d.status === "open")
    .sort(byDue)
    .map((d) => view(d, ctx.today));
  return {
    open: open.length,
    overdue: open.filter((v) => v.state === "overdue").length,
    dueSoon: open.filter((v) => v.state === "due-soon").length,
    next: open.slice(0, 5).map((v) => ({ id: v.id, title: v.title, due: v.due, daysLeft: v.daysLeft, state: v.state })),
  };
}

// Problems `pcre firm check` reports for calendar records beyond their schema.
export function deadlineProblems(ctx: Ctx): string[] {
  const out: string[] = [];
  const rules = new Set(ctx.corpus.rules.map((r) => r.id));
  const subjects = readProgress(ctx).subjects ?? {};
  const seen = new Set<string>();
  for (const d of readCalendar(ctx).items) {
    const where = `calendar.json › ${d.id}`;
    if (seen.has(d.id)) out.push(`${where}: the id is used by more than one deadline`);
    seen.add(d.id);
    if (d.rule && !rules.has(d.rule)) out.push(`${where}: no rule "${d.rule}" in the catalog`);
    if (d.subject && !(d.subject in subjects)) out.push(`${where}: no subject "${d.subject}" in progress.json`);
    if (d.status !== "open" && !d.closedOn) out.push(`${where}: ${d.status} but has no closedOn date`);
  }
  return out;
}
