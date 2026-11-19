import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { findSecrets, firmArtifacts, firmAudits, firmCalendar, firmDecisions, firmProfile, firmProgress } from "../schemas/firm";
import { defineAction, logEvent, readProfile, readProgress, type AnyAction, type Ctx } from "./actions";
import { auditProblems, auditSummary } from "./audit";
import { deadlineProblems, deadlineSummary } from "./deadlines";
import { dealProblems, dealSummary } from "./deal";
import { EngineError } from "./machine";
import { describeMachine, describeProcesses } from "./map";
import { PROCESSES, WORKFLOWS, type ProcessId } from "./processes";
import { runProblems, runSummary } from "./run";
import { LOG_FILE } from "./store";

// The firm folder itself: create it, check it, back it up, see where it stands.
// Also the read-only actions that describe the processes and print their guides.

// Every JSON file a firm folder can hold. The first four are the firm file as
// it has always been; the others appear when a process first writes them.
export const FIRM_FILES = [
  { name: "firm.json", schema: firmProfile, required: true, holds: "who the firm is" },
  { name: "decisions.json", schema: firmDecisions, required: true, holds: "choices made, by whom and when" },
  { name: "progress.json", schema: firmProgress, required: true, holds: "runs: every playbook step and its state" },
  { name: "artifacts.json", schema: firmArtifacts, required: true, holds: "where the firm's own documents are" },
  { name: "audits.json", schema: firmAudits, required: false, holds: "audits: checks, outcomes and findings" },
  { name: "calendar.json", schema: firmCalendar, required: false, holds: "dated duties" },
] as const;

const EMPTY = {
  "firm.json": (name: string | null) => ({
    schemaVersion: 1,
    name,
    entity: { type: null, state: null, status: null, formedOn: null },
    structure: null,
    propertyTypes: [],
    jurisdictions: ["us-federal", "us-tx"],
    principals: [],
  }),
  "decisions.json": () => ({ schemaVersion: 1, items: [] }),
  "progress.json": () => ({ schemaVersion: 1, playbooks: {} }),
  "artifacts.json": () => ({ schemaVersion: 1, items: [] }),
} as const;

const init = defineAction({
  name: "firm.init",
  summary: "Create a firm folder. Unknown facts start as null; --example copies the fictional example firm instead.",
  process: null,
  mutates: true,
  needsFirm: false,
  input: z
    .object({
      name: z.string().min(1).optional().describe("the firm's legal name, if known"),
      example: z.boolean().optional().describe("start from the fictional example firm"),
    })
    .strict(),
  run(ctx, args) {
    if (ctx.store.exists() && fs.readdirSync(ctx.store.dir).length > 0) {
      throw new EngineError("firm-exists", `${ctx.store.dir} already has files in it. Pick an empty or new folder.`, { dir: ctx.store.dir });
    }
    const base = FIRM_FILES.filter((f) => f.required);
    for (const f of base) {
      const value = args.example
        ? JSON.parse(fs.readFileSync(path.join(ctx.repoRoot, "content", "example-firm", f.name), "utf8"))
        : f.name === "firm.json"
          ? EMPTY["firm.json"](args.name ?? null)
          : EMPTY[f.name]();
      ctx.store.write(f.name, f.schema, value);
    }
    logEvent(ctx, { action: "firm.init", note: args.example ? "from the fictional example firm" : null });
    return { dir: ctx.store.dir, files: [...base.map((f) => f.name), LOG_FILE], example: Boolean(args.example) };
  },
  text: (r) => `Created ${r.dir}\n  ${r.files.join(", ")}`,
});

// Reads every file the way the engine will, and collects what is wrong.
function collectProblems(ctx: Ctx): { problems: string[]; files: { name: string; present: boolean; valid: boolean }[] } {
  const problems: string[] = [];
  const files: { name: string; present: boolean; valid: boolean }[] = [];
  for (const f of FIRM_FILES) {
    const present = ctx.store.exists(f.name);
    if (!present) {
      if (f.required) problems.push(`${f.name}: missing`);
      files.push({ name: f.name, present, valid: !f.required });
      continue;
    }
    let valid = true;
    try {
      ctx.store.read(f.name, f.schema);
    } catch (err) {
      valid = false;
      if (err instanceof EngineError) problems.push(...((err.details.problems as string[] | undefined) ?? [err.message]));
      else throw err;
    }
    try {
      problems.push(...findSecrets(JSON.parse(fs.readFileSync(ctx.store.file(f.name), "utf8")), [f.name]));
    } catch {
      // not JSON: already reported above
    }
    files.push({ name: f.name, present, valid });
  }
  try {
    ctx.store.readLog();
  } catch (err) {
    if (err instanceof EngineError) problems.push(err.message);
    else throw err;
  }
  // Cross-record checks need files that parse.
  if (files.every((f) => f.valid)) problems.push(...progressProblems(ctx), ...runProblems(ctx), ...auditProblems(ctx), ...deadlineProblems(ctx), ...dealProblems(ctx));
  return { problems, files };
}

// Step ids in progress.json must exist in the playbooks they name.
function progressProblems(ctx: Ctx): string[] {
  const out: string[] = [];
  const progress = readProgress(ctx);
  const bySlug = new Map(ctx.corpus.playbooks.map((p) => [p.slug, p]));
  const checkRuns = (where: string, runs: Record<string, { steps: Record<string, unknown> }>) => {
    for (const [slug, entry] of Object.entries(runs)) {
      const pb = bySlug.get(slug);
      if (!pb) {
        out.push(`${where} › ${slug}: no such playbook`);
        continue;
      }
      const ids = new Set(pb.steps.map((s) => s.id));
      for (const stepId of Object.keys(entry.steps)) if (!ids.has(stepId)) out.push(`${where} › ${slug} › ${stepId}: no such step`);
    }
  };
  checkRuns("progress.json", progress.playbooks);
  for (const [id, subject] of Object.entries(progress.subjects ?? {})) checkRuns(`progress.json › subjects.${id}`, subject.playbooks);
  for (const item of progress.other ?? []) {
    if (item.playbook && !bySlug.has(item.playbook)) out.push(`progress.json › other › "${item.task}": no such playbook "${item.playbook}"`);
  }
  return out;
}

const check = defineAction({
  name: "firm.check",
  summary: "Validate the firm folder: every file against its schema, no secrets, and every id pointing at something real.",
  process: null,
  mutates: false,
  input: z.object({}).strict(),
  run(ctx) {
    const { problems, files } = collectProblems(ctx);
    if (problems.length > 0) {
      throw new EngineError("firm-invalid", `${problems.length} problem(s) in ${ctx.store.dir}.`, { problems, files });
    }
    return { dir: ctx.store.dir, files, problems };
  },
  text: (r) => `OK  ${r.files.filter((f) => f.present).length} files valid, no secrets, every id resolves (${r.dir})`,
});

const status = defineAction({
  name: "firm.status",
  summary: "Where the firm stands: its runs, audits and deadlines in one view.",
  process: null,
  mutates: false,
  input: z.object({}).strict(),
  run(ctx) {
    const profile = readProfile(ctx);
    const log = ctx.store.readLog();
    return {
      dir: ctx.store.dir,
      name: profile.name,
      entity: { type: profile.entity.type, state: profile.entity.state, status: profile.entity.status },
      structure: profile.structure,
      runs: runSummary(ctx),
      audits: auditSummary(ctx),
      deadlines: deadlineSummary(ctx),
      deals: dealSummary(ctx),
      log: { events: log.length, last: log.at(-1) ?? null },
    };
  },
  text(r) {
    const lines = [`${r.name ?? "(no name yet)"} · ${[r.entity.type, r.entity.state, r.entity.status].filter(Boolean).join(", ") || "entity not recorded"} · ${r.structure ?? "no structure chosen"}`];
    lines.push(`Runs: ${r.runs.open} open, ${r.runs.complete} complete · ${r.runs.ready} steps ready · ${r.runs.blocked} blocked`);
    for (const run of r.runs.runs) lines.push(`  ${run.subject ? `${run.subject}:` : ""}${run.playbook}  ${run.state}  ${run.done}/${run.total} done`);
    const f = r.audits.openFindings;
    lines.push(`Audits: ${r.audits.open} open, ${r.audits.closed} closed · ${f.total} open finding${f.total === 1 ? "" : "s"} (${f.high} high, ${f.medium} medium, ${f.low} low)`);
    if (r.audits.latest) lines.push(`  ${r.audits.latest.id}: ${r.audits.latest.line ?? "cannot be scored"}`);
    lines.push(`Deadlines: ${r.deadlines.open} open · ${r.deadlines.overdue} overdue · ${r.deadlines.dueSoon} due soon`);
    for (const d of r.deadlines.next) lines.push(`  ${d.due}  ${d.daysLeft < 0 ? `overdue ${-d.daysLeft} d` : `${d.daysLeft} d`}  ${d.title}`);
    lines.push(`Deals: ${r.deals.active} active, ${r.deals.completed} completed, ${r.deals.dropped} dropped`);
    for (const d of r.deals.deals.filter((x) => x.state === "active")) lines.push(`  ${d.id}  ${d.stage ? `${d.position} of ${d.of}: ${d.stage}` : "every playbook complete"}`);
    lines.push(`Log: ${r.log.events} changes${r.log.last ? `; last ${r.log.last.action} by ${r.log.last.by} at ${localTime(r.log.last.at)}` : ""}`);
    lines.push("Next: pcre run next · pcre audit next · pcre deadline list · pcre deal list");
    return lines.join("\n");
  },
});

const upgrade = defineAction({
  name: "firm.upgrade",
  summary: "Back the folder up beside itself, then make it ready for the engine. Changes no existing record.",
  process: null,
  mutates: true,
  input: z.object({}).strict(),
  run(ctx) {
    const { problems } = collectProblems(ctx);
    if (problems.length > 0) {
      throw new EngineError("firm-invalid", `Fix ${problems.length} problem(s) before upgrading; nothing was changed.`, { problems });
    }
    const hadLog = ctx.store.exists(LOG_FILE);
    const backup = ctx.store.backup(ctx.today);
    logEvent(ctx, { action: "firm.upgrade", note: `backup at ${backup}` });
    return { dir: ctx.store.dir, backup, log: ctx.store.file(LOG_FILE), hadLog };
  },
  text: (r) => `Backed up to ${r.backup}\n${r.hadLog ? "The log was already there." : `Started the log: ${r.log}`}`,
});

const log = defineAction({
  name: "firm.log",
  summary: "The most recent changes to the firm folder, newest last.",
  process: null,
  mutates: false,
  input: z.object({ last: z.coerce.number().int().min(1).max(1000).optional().describe("how many events; default 20") }).strict(),
  run(ctx, args) {
    const events = ctx.store.readLog();
    return { total: events.length, events: events.slice(-(args.last ?? 20)) };
  },
  text: (r) =>
    r.events.map((e) => `${localTime(e.at)}  ${e.by}  ${e.action}${e.target ? `  ${e.target}` : ""}${e.to ? `  ${e.from ?? ""} -> ${e.to}` : ""}`).join("\n") ||
    "No events yet.",
});

// The log stores UTC; a person reads local time.
function localTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const processList = defineAction({
  name: "process.list",
  summary: "Every process the engine runs: its states, its transitions, who may make each one and what can refuse it.",
  process: null,
  mutates: false,
  needsFirm: false,
  input: z.object({}).strict(),
  run: () => describeProcesses(),
  text: (r) =>
    r.workflows
      .map((w) => `${w.id}: ${w.name}\n  ${w.what}\n  machines: ${w.machines.join(", ")}  commands: pcre ${w.commands.join(" | pcre ")}`)
      .join("\n\n"),
});

const processShow = defineAction({
  name: "process.show",
  summary: "One state machine in full.",
  process: null,
  mutates: false,
  needsFirm: false,
  input: z.object({ id: z.string().min(1).describe("a machine id, such as step or check") }).strict(),
  positional: ["id"],
  run(_ctx, args) {
    if (!(args.id in PROCESSES)) {
      throw new EngineError("not-found", `No process "${args.id}". There are: ${Object.keys(PROCESSES).join(", ")}.`, { processes: Object.keys(PROCESSES) });
    }
    return describeMachine(args.id as ProcessId);
  },
  text: (m) =>
    [
      `${m.name} (${m.id}, ${m.kind}): ${m.what}`,
      `kept in ${m.record}`,
      "",
      "states:",
      ...Object.entries(m.states).map(([s, meaning]) => `  ${s}${s === m.initial ? " (start)" : ""}: ${meaning}`),
      "",
      "transitions:",
      ...m.transitions.map(
        (t) =>
          `  ${t.action}: ${t.from.join(" | ")} -> ${t.to}  [${t.automatic ? "automatic" : t.who}${t.needsNote ? ", note" : ""}]${t.guards.length > 0 ? `  needs: ${t.guards.map((g) => g.id).join(", ")}` : ""}`,
      ),
    ].join("\n"),
});

const guide = defineAction({
  name: "guide.show",
  summary: "The short guide for one process, for a person or an agent starting cold.",
  process: null,
  mutates: false,
  needsFirm: false,
  input: z.object({ id: z.string().min(1).describe("run-a-playbook, audit-a-firm, track-deadlines or move-a-deal") }).strict(),
  positional: ["id"],
  run(ctx, args) {
    const workflow = WORKFLOWS.find((w) => w.id === args.id);
    if (!workflow) {
      throw new EngineError("not-found", `No guide "${args.id}". There are: ${WORKFLOWS.map((w) => w.id).join(", ")}.`, { guides: WORKFLOWS.map((w) => w.id) });
    }
    const file = path.join(ctx.repoRoot, workflow.guide);
    if (!fs.existsSync(file)) throw new EngineError("not-found", `The guide for ${workflow.name} is not written yet (${workflow.guide}).`, { guide: workflow.guide });
    return { id: workflow.id, name: workflow.name, path: workflow.guide, markdown: fs.readFileSync(file, "utf8") };
  },
  text: (r) => r.markdown,
});

export const firmActions: AnyAction[] = [init, check, status, upgrade, log, processList, processShow, guide];
