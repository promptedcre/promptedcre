import { z } from "zod";
import { isAgentStep, nearestPredecessors } from "../compute/metrics";
import { applicableSteps, isResearched, type Variant } from "../compute/variant";
import { propertyType, slug, structure } from "../schemas/common";
import { SUBJECT_KINDS, type FirmProgress, type PlaybookProgress, type StepState, type StepStatus } from "../schemas/firm";
import type { Playbook, Step } from "../schemas/playbook";
import { defineAction, execute, findPlaybook, logEvent, readProgress, runsOf, variantFor, writeProgress, type AnyAction, type Ctx } from "./actions";
import { actorLabel, EngineError, isPerson, transition } from "./machine";
import { PROCESSES } from "./processes";

// Run a playbook: the `run`, `step` and `subject` machines (lib/engine/processes.ts).
// A run's state is worked out from its steps on every call and never stored, so
// a file edited by hand, or written before the engine, can never disagree with it.

type RunState = "not-started" | "open" | "complete";
type Counts = { total: number; done: number; skipped: number; notApplicable: number; blocked: number; todo: number };

// One run, with everything needed to read it: its playbook, whose run it is and
// the variant its steps are read in.
type RunRef = { pb: Playbook; subject: string | null; run: PlaybookProgress; variant: Variant };

const RESOLVED: ReadonlySet<StepStatus> = new Set<StepStatus>(["done", "skipped", "not-applicable"]);
const HUMAN_MODES: ReadonlySet<string> = new Set(["human-online", "human-offline"]);

const subjectFlag = (subject: string | null) => (subject ? ` --subject ${subject}` : "");
const where = (pb: string, subject: string | null) => (subject ? `${subject}:${pb}` : pb);
const stepTarget = (pb: string, step: string, subject: string | null) => `${where(pb, subject)}/${step}`;
const cmd = (verb: string, pb: string, subject: string | null, step?: string) => `pcre run ${verb} ${pb}${step ? ` ${step}` : ""}${subjectFlag(subject)}`;
const variantText = (v: Variant) => `${v.structure} · ${v.propertyType} · ${v.jurisdictions.join(", ")}`;

function statusOf(run: PlaybookProgress, stepId: string): StepStatus {
  return run.steps[stepId]?.status ?? "todo";
}

function isResolved(run: PlaybookProgress, stepId: string): boolean {
  return RESOLVED.has(statusOf(run, stepId));
}

function waitingOn(ref: RunRef, step: Step): string[] {
  return nearestPredecessors(ref.pb, step, ref.variant).filter((id) => !isResolved(ref.run, id));
}

function isReady(ref: RunRef, step: Step): boolean {
  return statusOf(ref.run, step.id) === "todo" && waitingOn(ref, step).length === 0;
}

function stateOf(ref: RunRef): RunState {
  return applicableSteps(ref.pb, ref.variant).every((s) => isResolved(ref.run, s.id)) ? "complete" : "open";
}

function countsOf(ref: RunRef): Counts {
  const counts: Counts = { total: 0, done: 0, skipped: 0, notApplicable: 0, blocked: 0, todo: 0 };
  for (const s of applicableSteps(ref.pb, ref.variant)) {
    counts.total += 1;
    const status = statusOf(ref.run, s.id);
    if (status === "not-applicable") counts.notApplicable += 1;
    else counts[status] += 1;
  }
  return counts;
}

function readyIds(ref: RunRef): string[] {
  return applicableSteps(ref.pb, ref.variant)
    .filter((s) => isReady(ref, s))
    .map((s) => s.id);
}

function whoDoes(step: Step): string {
  return isAgentStep(step) ? "agent" : (step.actor ?? "person");
}

function subjectIsClosed(progress: FirmProgress, subject: string | null): boolean {
  return Boolean(subject && progress.subjects?.[subject]?.closedOn);
}

// Every run of the firm and of its subjects, or of one subject. Runs for a slug
// the catalog does not have are left out here; `firm check` reports them.
function allRuns(ctx: Ctx, progress: FirmProgress, opts: { subject?: string | null; openSubjectsOnly?: boolean } = {}): RunRef[] {
  const out: RunRef[] = [];
  const bySlug = new Map(ctx.corpus.playbooks.map((p) => [p.slug, p]));
  const add = (subject: string | null, runs: Record<string, PlaybookProgress>) => {
    const variant = variantFor(ctx, subject);
    for (const [slugValue, run] of Object.entries(runs)) {
      const pb = bySlug.get(slugValue);
      if (pb) out.push({ pb, subject, run, variant });
    }
  };
  if (opts.subject) {
    add(opts.subject, runsOf(progress, opts.subject));
    return out;
  }
  add(null, progress.playbooks);
  for (const [id, subject] of Object.entries(progress.subjects ?? {})) {
    if (opts.openSubjectsOnly && subject.closedOn) continue;
    add(id, subject.playbooks);
  }
  return out;
}

// The run a command names, or a refusal that gives the start command.
function loadRun(ctx: Ctx, progress: FirmProgress, playbookSlug: string, subject: string | null): RunRef {
  const runs = runsOf(progress, subject);
  const pb = findPlaybook(ctx, playbookSlug);
  const run = runs[pb.slug];
  if (!run) {
    throw new EngineError("not-found", `No run of ${pb.slug}${subject ? ` for ${subject}` : ""} yet. Start it with: ${cmd("start", pb.slug, subject)}`, {
      playbook: pb.slug,
      subject,
      command: cmd("start", pb.slug, subject),
    });
  }
  return { pb, subject, run, variant: variantFor(ctx, subject) };
}

// The step a command names, if it exists and applies in this run's variant.
function findStep(ref: RunRef, stepId: string): Step {
  const step = ref.pb.steps.find((s) => s.id === stepId);
  if (!step) {
    throw new EngineError("not-found", `${ref.pb.slug} has no step "${stepId}". See its steps with: ${cmd("show", ref.pb.slug, ref.subject)}`, {
      playbook: ref.pb.slug,
      step: stepId,
    });
  }
  if (!applicableSteps(ref.pb, ref.variant).includes(step)) {
    throw new EngineError(
      "not-in-variant",
      `"${stepId}" does not apply to this run (${variantText(ref.variant)}), so there is nothing to record. See the steps that apply with: ${cmd("show", ref.pb.slug, ref.subject)}`,
      { playbook: ref.pb.slug, step: stepId, variant: ref.variant },
    );
  }
  return step;
}

const optSubject = z.string().min(1).optional().describe("a subject id, for a deal's or an offering's run; leave out for the firm's own run");
const playbookArg = z.string().min(1).describe("the playbook's slug, such as form-sponsor-entity");
const stepArg = z.string().min(1).describe("the step's id, as run show lists it");

// ---- Subjects ----

const subjectAdd = defineAction({
  name: "subject.add",
  summary: "Add a subject the firm runs playbooks for: a deal, an offering, an investor, a property.",
  process: "subject",
  mutates: true,
  input: z
    .object({
      id: slug.describe("a short id of your own, such as deal-elm-warehouse"),
      kind: z.enum(SUBJECT_KINDS).describe("what it is"),
      label: z.string().min(1).describe("the firm's own name for it"),
      structure: structure.optional().describe("when this subject's structure differs from the firm's"),
      propertyType: propertyType.optional().describe("the property type, for a deal or a property"),
      note: z.string().min(1).optional().describe("anything worth keeping with it"),
    })
    .strict(),
  positional: ["id"],
  run(ctx, args) {
    const progress = readProgress(ctx);
    const subjects = (progress.subjects ??= {});
    if (subjects[args.id]) {
      throw new EngineError("already-exists", `There is already a subject "${args.id}". See it with "pcre subject list", or pick another id.`, { subject: args.id });
    }
    const record = {
      kind: args.kind,
      label: args.label,
      structure: args.structure ?? null,
      propertyType: args.propertyType ?? null,
      openedOn: ctx.date,
      closedOn: null,
      note: args.note ?? null,
      playbooks: {},
    };
    subjects[args.id] = record;
    writeProgress(ctx, progress);
    logEvent(ctx, { action: "subject.add", process: "subject", target: args.id, from: null, to: PROCESSES.subject.initial, note: args.note ?? null });
    return { id: args.id, ...record, state: "open" as const };
  },
  text: (r) => `Added ${r.kind} ${r.id}: ${r.label} (opened ${r.openedOn})\n  next: pcre run start <playbook> --subject ${r.id}`,
});

const subjectList = defineAction({
  name: "subject.list",
  summary: "Every subject, open or closed, with how many runs it has.",
  process: "subject",
  mutates: false,
  input: z.object({}).strict(),
  run(ctx) {
    const progress = readProgress(ctx);
    const items = Object.entries(progress.subjects ?? {}).map(([id, s]) => ({
      id,
      kind: s.kind,
      label: s.label,
      state: s.closedOn ? ("closed" as const) : ("open" as const),
      structure: s.structure ?? null,
      propertyType: s.propertyType ?? null,
      openedOn: s.openedOn,
      closedOn: s.closedOn ?? null,
      runs: Object.keys(s.playbooks).length,
    }));
    return { count: items.length, items };
  },
  text: (r) =>
    r.items.map((s) => `${s.id}  ${s.kind}  ${s.state}  ${s.label}  (${s.runs} run${s.runs === 1 ? "" : "s"})`).join("\n") ||
    'No subjects yet. Add one with: pcre subject add <id> --kind deal --label "..."',
});

type SubjectMoveResult = { id: string; state: string; closedOn: string | null; note: string | null };

function subjectMove(name: "subject.close" | "subject.reopen", action: "close" | "reopen", summary: string): AnyAction {
  return defineAction({
    name,
    summary,
    process: "subject",
    mutates: true,
    input: z.object({ id: z.string().min(1).describe("the subject's id"), note: z.string().optional().describe("why: needed") }).strict(),
    positional: ["id"],
    run(ctx, args): SubjectMoveResult {
      const progress = readProgress(ctx);
      runsOf(progress, args.id); // refuses an unknown subject, and gives the add command
      const subject = progress.subjects?.[args.id];
      if (!subject) throw new EngineError("not-found", `No subject "${args.id}".`, { subject: args.id });
      const from = subject.closedOn ? "closed" : "open";
      const move = transition(PROCESSES.subject, from, action, ctx.actor, args.note);
      subject.closedOn = move.to === "closed" ? ctx.date : null;
      // An open subject has not ended, so it carries no outcome.
      if (move.to === "open") subject.outcome = null;
      writeProgress(ctx, progress);
      logEvent(ctx, { action: name, process: "subject", target: args.id, from, to: move.to, note: args.note ?? null });
      return { id: args.id, state: move.to, closedOn: subject.closedOn, note: args.note ?? null };
    },
    text: (r) => `${r.id} is ${r.state}${r.closedOn ? ` as of ${r.closedOn}` : ""}.`,
  });
}

// ---- Runs ----

const start = defineAction({
  name: "run.start",
  summary: "Start a run of a playbook, for the firm or for one subject.",
  process: "run",
  mutates: true,
  input: z.object({ playbook: playbookArg, subject: optSubject }).strict(),
  positional: ["playbook"],
  run(ctx, args) {
    const subject = args.subject ?? null;
    const progress = readProgress(ctx);
    const runs = runsOf(progress, subject);
    const pb = findPlaybook(ctx, args.playbook);
    if (pb.kind === "audit") {
      throw new EngineError("wrong-kind", `${pb.slug} is an audit, not a playbook to run. Audits are opened with: pcre audit open ${pb.slug}${subjectFlag(subject)}`, {
        playbook: pb.slug,
        kind: pb.kind,
      });
    }
    const variant = variantFor(ctx, subject);
    if (pb.depth !== "full") {
      throw new EngineError("guard-failed", `${pb.slug} is an outline: its steps are not written yet, so there is nothing to run.`, {
        guard: "playbook-is-written",
        playbook: pb.slug,
      });
    }
    if (!isResearched(pb, variant)) {
      throw new EngineError(
        "guard-failed",
        `${pb.slug} is not researched for ${variantText(variant)}. It is written for ${pb.written.structure.join(", ")} in ${pb.written.jurisdiction.join(", ")}.`,
        { guard: "playbook-is-written", playbook: pb.slug, variant, written: pb.written },
      );
    }
    if (subjectIsClosed(progress, subject)) {
      throw new EngineError("subject-closed", `${subject} is closed. Reopen it first: pcre subject reopen ${subject} --note "..."`, { subject });
    }
    if (runs[pb.slug]) {
      throw new EngineError("already-exists", `${pb.slug} is already running${subject ? ` for ${subject}` : ""}. See it with: ${cmd("show", pb.slug, subject)}`, {
        playbook: pb.slug,
        subject,
        command: cmd("show", pb.slug, subject),
      });
    }
    const move = transition(PROCESSES.run, "not-started", "start", ctx.actor);
    const run: PlaybookProgress = { steps: {}, startedOn: ctx.date };
    runs[pb.slug] = run;
    writeProgress(ctx, progress);
    logEvent(ctx, { action: "run.start", process: "run", target: where(pb.slug, subject), from: "not-started", to: move.to });
    const ref: RunRef = { pb, subject, run, variant };
    return {
      playbook: pb.slug,
      title: pb.title,
      subject,
      variant,
      state: stateOf(ref),
      startedOn: ctx.date,
      counts: countsOf(ref),
      next: readyIds(ref),
      command: `pcre run next ${pb.slug}${subjectFlag(subject)}`,
    };
  },
  text: (r) => `Started ${r.playbook}${r.subject ? ` for ${r.subject}` : ""} (${variantText(r.variant)}): ${r.counts.total} steps apply.\n  next: ${r.command}`,
});

const list = defineAction({
  name: "run.list",
  summary: "Every run of the firm and of its subjects, with how far along each one is.",
  process: "run",
  mutates: false,
  input: z.object({ subject: optSubject }).strict(),
  run(ctx, args) {
    const progress = readProgress(ctx);
    const items = allRuns(ctx, progress, { subject: args.subject ?? null }).map((ref) => ({
      playbook: ref.pb.slug,
      title: ref.pb.title,
      subject: ref.subject,
      state: stateOf(ref),
      counts: countsOf(ref),
      startedOn: ref.run.startedOn ?? null,
      ready: readyIds(ref).length,
    }));
    return { count: items.length, items };
  },
  text: (r) =>
    r.items
      .map((i) => `${where(i.playbook, i.subject)}  ${i.state}  ${i.counts.done + i.counts.skipped + i.counts.notApplicable}/${i.counts.total} resolved  ${i.ready} ready`)
      .join("\n") || "No runs yet. Start one with: pcre run start <playbook>",
});

const show = defineAction({
  name: "run.show",
  summary: "One run in full: every step that applies, its status, who does it and what it waits on.",
  process: "run",
  mutates: false,
  input: z.object({ playbook: playbookArg, subject: optSubject }).strict(),
  positional: ["playbook"],
  run(ctx, args) {
    const ref = loadRun(ctx, readProgress(ctx), args.playbook, args.subject ?? null);
    const steps = applicableSteps(ref.pb, ref.variant).map((s, i) => {
      const rec: StepState | undefined = ref.run.steps[s.id];
      return {
        n: i + 1,
        id: s.id,
        title: s.title,
        status: statusOf(ref.run, s.id),
        who: whoDoes(s),
        mode: s.mode,
        approval: s.approval,
        after: nearestPredecessors(ref.pb, s, ref.variant),
        ready: isReady(ref, s),
        waitingOn: waitingOn(ref, s),
        date: rec?.date ?? null,
        by: rec?.by ?? null,
        proof: rec?.proof ?? null,
        approvedBy: rec?.approvedBy ?? null,
        note: rec?.note ?? null,
      };
    });
    return {
      playbook: ref.pb.slug,
      title: ref.pb.title,
      subject: ref.subject,
      variant: ref.variant,
      state: stateOf(ref),
      startedOn: ref.run.startedOn ?? null,
      standingApproval: ref.run.standingApproval ?? null,
      counts: countsOf(ref),
      steps,
    };
  },
  text: (r) =>
    [
      `${r.title} (${where(r.playbook, r.subject)}): ${r.state}, ${r.counts.done} done of ${r.counts.total}  [${variantText(r.variant)}]`,
      ...r.steps.map((s) => `  ${String(s.n).padStart(2)}. ${s.status.padEnd(14)} ${s.ready ? "ready " : "      "}${s.id}  (${s.who})`),
    ].join("\n"),
});

// What a step's approval needs, read for whoever is asking: a person recording
// a step is taken as approving it.
function approvalFor(ctx: Ctx, ref: RunRef, step: Step): { kind: Step["approval"]; satisfied: boolean; how: string } {
  const person = isPerson(ctx.actor);
  const standing = ref.run.standingApproval ?? null;
  switch (step.approval) {
    case "none":
      return { kind: "none", satisfied: true, how: "No approval needed." };
    case "standing":
      return standing
        ? { kind: "standing", satisfied: true, how: `Covered by the standing approval ${standing.by} gave on ${standing.date}.` }
        : {
            kind: "standing",
            satisfied: person,
            how: `Needs the run's standing approval: ask a person once for this run, and once they say yes record it in their name with "${cmd("approve", ref.pb.slug, ref.subject)} --by <name>". Or record this step alone with --approved-by <name> once they approve it.`,
          };
    case "every-run":
      return {
        kind: "every-run",
        satisfied: person,
        how: "A person approves this step each time: ask and wait. Once they say yes, record it in their name with --approved-by <name>, or they record it with --by <name>.",
      };
    case "signature":
      return { kind: "signature", satisfied: person, how: "A person signs it: say what to sign and where. Once they say it is signed, record it in their name with --by <name>." };
  }
}

// The exact line that records a step, with the flags its guards will ask for.
function doneCommand(ref: RunRef, step: Step): string {
  let line = cmd("done", ref.pb.slug, ref.subject, step.id);
  if (HUMAN_MODES.has(step.mode) || step.approval === "signature") line += ' --by "<person>"';
  else if (step.approval === "every-run" || (step.approval === "standing" && !ref.run.standingApproval)) line += ' --approved-by "<person>"';
  return `${line} --proof "<where the evidence is>"`;
}

function nextItem(ctx: Ctx, ref: RunRef, step: Step) {
  const sources = new Map(ref.pb.sources.map((s) => [s.id, s]));
  const rules = new Map(ctx.corpus.rules.map((r) => [r.id, r]));
  return {
    playbook: ref.pb.slug,
    subject: ref.subject,
    id: step.id,
    title: step.title,
    who: whoDoes(step),
    mode: step.mode,
    canAgentDo: isAgentStep(step),
    approval: approvalFor(ctx, ref, step),
    instruction: step.instruction,
    propertyTypeNote: step.typeNotes?.[ref.variant.propertyType] ?? null,
    rules: step.rules.map((id) => ({ id, title: rules.get(id)?.title ?? null })),
    calculators: step.calculators,
    sources: step.sources.flatMap((id) => {
      const s = sources.get(id);
      return s ? [{ title: s.title, url: s.url }] : [];
    }),
    command: doneCommand(ref, step),
  };
}

const next = defineAction({
  name: "run.next",
  summary: "The steps that can be done now, with who does each, what approval it needs and the command that records it.",
  process: "step",
  mutates: false,
  input: z.object({ playbook: playbookArg.optional(), subject: optSubject }).strict(),
  positional: ["playbook"],
  run(ctx, args) {
    const progress = readProgress(ctx);
    const subject = args.subject ?? null;
    const refs = args.playbook
      ? [loadRun(ctx, progress, args.playbook, subject)]
      : allRuns(ctx, progress, { subject, openSubjectsOnly: true }).filter((r) => r.pb.kind !== "audit" && stateOf(r) === "open");
    const items = refs.flatMap((ref) =>
      applicableSteps(ref.pb, ref.variant)
        .filter((s) => isReady(ref, s))
        .map((s) => nextItem(ctx, ref, s)),
    );
    const blocked = refs.flatMap((ref) =>
      applicableSteps(ref.pb, ref.variant)
        .filter((s) => statusOf(ref.run, s.id) === "blocked")
        .map((s) => ({
          playbook: ref.pb.slug,
          subject: ref.subject,
          id: s.id,
          title: s.title,
          date: ref.run.steps[s.id]?.date ?? null,
          note: ref.run.steps[s.id]?.note ?? null,
        })),
    );
    return {
      count: items.length,
      items,
      blocked: { count: blocked.length, items: blocked },
      runs: refs.length,
      complete: refs.length > 0 && refs.every((r) => stateOf(r) === "complete"),
    };
  },
  text: (r) => {
    if (r.complete) return "Nothing left: every step that applies is resolved.";
    if (r.runs === 0) return "No open runs. Start one with: pcre run start <playbook>";
    const lines = r.items.map((i) => `${where(i.playbook, i.subject)}/${i.id}  (${i.who}${i.approval.kind !== "none" ? `, approval: ${i.approval.kind}` : ""})\n  ${i.command}`);
    for (const b of r.blocked.items) lines.push(`blocked: ${where(b.playbook, b.subject)}/${b.id}${b.note ? `  ${b.note}` : ""}`);
    return lines.join("\n") || "Nothing is ready: the open steps wait on blocked or unfinished ones.";
  },
});

type StepResult = {
  playbook: string;
  subject: string | null;
  step: { id: string; title: string; status: StepStatus; date: string | null; note: string | null; by: string | null; proof: string | null; approvedBy: string | null };
  state: RunState;
  counts: Counts;
  next: string[];
};

// Writes a step's new state, logs it, and logs the run completing or resuming
// when that changed. Returns what every step command returns.
function commitStep(ctx: Ctx, progress: FirmProgress, ref: RunRef, step: Step, action: string, from: string, record: StepState): StepResult {
  const before = stateOf(ref);
  ref.run.steps[step.id] = record;
  const after = stateOf(ref);
  writeProgress(ctx, progress);
  logEvent(ctx, { action, process: "step", target: stepTarget(ref.pb.slug, step.id, ref.subject), from, to: record.status, note: record.note });
  if (before === "open" && after === "complete") {
    logEvent(ctx, { action: "run.complete", process: "run", target: where(ref.pb.slug, ref.subject), from: "open", to: "complete" });
  }
  if (before === "complete" && after === "open") {
    logEvent(ctx, { action: "run.resume", process: "run", target: where(ref.pb.slug, ref.subject), from: "complete", to: "open" });
  }
  return {
    playbook: ref.pb.slug,
    subject: ref.subject,
    step: {
      id: step.id,
      title: step.title,
      status: record.status,
      date: record.date,
      note: record.note,
      by: record.by ?? null,
      proof: record.proof ?? null,
      approvedBy: record.approvedBy ?? null,
    },
    state: after,
    counts: countsOf(ref),
    next: readyIds(ref),
  };
}

// The step machine's check, with the refusal reworded around this run's commands.
function stepTransition(ctx: Ctx, ref: RunRef, step: Step, action: string, note: string | null | undefined) {
  const from = statusOf(ref.run, step.id);
  try {
    return { from, move: transition(PROCESSES.step, from, action, ctx.actor, note) };
  } catch (err) {
    if (err instanceof EngineError && err.code === "transition-refused") {
      const allowed = (err.details.allowed as string[] | undefined) ?? [];
      const hint = allowed.includes("reopen")
        ? ` To change it, reopen it first: ${cmd("reopen", ref.pb.slug, ref.subject, step.id)} --note "..."`
        : allowed.length > 0
          ? ` From ${from} you can: ${allowed.join(", ")}.`
          : "";
      throw new EngineError("transition-refused", `"${step.id}" is ${from}, so it cannot be marked ${action}.${hint}`, { ...err.details, step: step.id });
    }
    throw err;
  }
}

const stepText = (r: StepResult) =>
  [
    `${r.step.id}: ${r.step.status}${r.step.by ? ` by ${r.step.by}` : ""}${r.step.date ? ` on ${r.step.date}` : ""}`,
    `${where(r.playbook, r.subject)} is ${r.state}: ${r.counts.done} done of ${r.counts.total}`,
    r.next.length > 0 ? `ready now: ${r.next.join(", ")}` : r.state === "complete" ? "Nothing left." : "Nothing ready now.",
  ].join("\n");

const done = defineAction({
  name: "run.done",
  summary: "Record a step as done, with who did it, where the proof is and who approved it.",
  process: "step",
  mutates: true,
  input: z
    .object({
      playbook: playbookArg,
      step: stepArg,
      subject: optSubject,
      proof: z.string().min(1).optional().describe("where the evidence is: a file path, a web address or a short description"),
      approvedBy: z
        .string()
        .min(1)
        .optional()
        .describe("the person who approved it, for a step that needs approval: give it only after that person said yes. It is recorded as their approval, on your word"),
      note: z.string().min(1).optional().describe("anything worth keeping with the record"),
    })
    .strict(),
  positional: ["playbook", "step"],
  run(ctx, args): StepResult {
    const progress = readProgress(ctx);
    const ref = loadRun(ctx, progress, args.playbook, args.subject ?? null);
    const s = findStep(ref, args.step);
    const { from } = stepTransition(ctx, ref, s, "done", args.note);

    const open = waitingOn(ref, s);
    if (open.length > 0) {
      throw new EngineError(
        "guard-failed",
        `"${s.id}" comes after steps that are still open: ${open.join(", ")}. Resolve those first; "${cmd("next", ref.pb.slug, ref.subject)}" shows what is ready.`,
        { guard: "predecessors-resolved", waitingOn: open },
      );
    }
    const person = isPerson(ctx.actor);
    if (HUMAN_MODES.has(s.mode) && !person) {
      throw new EngineError(
        "guard-failed",
        `"${s.id}" is a step a person does (${s.mode}${s.actor ? `, ${s.actor}` : ""}). Prepare it, then hand it to them: say what to do and where, and wait. Once they say it is done, record it in their name: ${cmd("done", ref.pb.slug, ref.subject, s.id)} --by "<name>"`,
        { guard: "person-for-human-step", mode: s.mode, actor: s.actor ?? null },
      );
    }
    const standing = ref.run.standingApproval ?? null;
    const approvalProblem =
      s.approval === "every-run" && !person && !args.approvedBy
        ? `"${s.id}" needs a person's approval each time. Ask them and wait. Once they say yes, record it in their name with --approved-by "<name>", or they record it with --by "<name>".`
        : s.approval === "standing" && !person && !args.approvedBy && !standing
          ? `"${s.id}" is covered by the run's standing approval, and none is recorded yet. Ask a person once for this run, and wait. Once they say yes, record it in their name: ${cmd("approve", ref.pb.slug, ref.subject)} --by "<name>". Or record this step alone with --approved-by "<name>" once they approve it.`
          : s.approval === "signature" && !person
            ? `"${s.id}" is signed by a person. Say what to sign and where, and wait. Once they say it is signed, record it in their name: ${cmd("done", ref.pb.slug, ref.subject, s.id)} --by "<name>"`
            : null;
    if (approvalProblem) throw new EngineError("guard-failed", approvalProblem, { guard: "approval-recorded", approval: s.approval });

    // Who approved: the person named, else the standing approval that covers
    // the step, else the person recording a step that needs approval.
    const approvedBy = args.approvedBy ?? (s.approval === "standing" && standing ? standing.by : s.approval !== "none" && person ? actorLabel(ctx.actor) : null);
    return commitStep(ctx, progress, ref, s, "run.done", from, {
      status: "done",
      date: ctx.date,
      note: args.note ?? null,
      by: actorLabel(ctx.actor),
      proof: args.proof ?? null,
      approvedBy,
    });
  },
  text: stepText,
});

// block, unblock, skip, not-applicable and reopen: one step-machine move each,
// with no guards beyond the machine's own (who may, and whether a note is needed).
function stepMove(name: string, action: string, summary: string, noteHelp: string): AnyAction {
  return defineAction({
    name,
    summary,
    process: "step",
    mutates: true,
    input: z.object({ playbook: playbookArg, step: stepArg, subject: optSubject, note: z.string().optional().describe(noteHelp) }).strict(),
    positional: ["playbook", "step"],
    run(ctx, args): StepResult {
      const progress = readProgress(ctx);
      const ref = loadRun(ctx, progress, args.playbook, args.subject ?? null);
      const s = findStep(ref, args.step);
      const { from, move } = stepTransition(ctx, ref, s, action, args.note);
      return commitStep(ctx, progress, ref, s, name, from, {
        status: move.to as StepStatus,
        date: ctx.date,
        note: args.note?.trim() ? args.note : null,
        by: actorLabel(ctx.actor),
      });
    },
    text: stepText,
  });
}

const approve = defineAction({
  name: "run.approve",
  summary: "A person's one approval for every step in this run marked standing.",
  process: "run",
  mutates: true,
  input: z.object({ playbook: playbookArg, subject: optSubject }).strict(),
  positional: ["playbook"],
  run(ctx, args) {
    const progress = readProgress(ctx);
    const ref = loadRun(ctx, progress, args.playbook, args.subject ?? null);
    const state = stateOf(ref);
    const move = transition(PROCESSES.run, state, "approve", ctx.actor);
    const standingApproval = { by: actorLabel(ctx.actor), date: ctx.date };
    ref.run.standingApproval = standingApproval;
    writeProgress(ctx, progress);
    logEvent(ctx, { action: "run.approve", process: "run", target: where(ref.pb.slug, ref.subject), from: state, to: move.to });
    const covers = applicableSteps(ref.pb, ref.variant)
      .filter((s) => s.approval === "standing")
      .map((s) => s.id);
    return { playbook: ref.pb.slug, subject: ref.subject, standingApproval, covers };
  },
  text: (r) => `${r.standingApproval.by} approved ${where(r.playbook, r.subject)} on ${r.standingApproval.date}. Covers: ${r.covers.join(", ") || "no steps in this variant"}.`,
});

export const runActions: AnyAction[] = [
  subjectAdd,
  subjectList,
  subjectMove("subject.close", "close", "Close a subject: the deal closed or died, the offering ended. Its runs stay on record."),
  subjectMove("subject.reopen", "reopen", "Open a closed subject again."),
  start,
  list,
  show,
  next,
  done,
  stepMove("run.block", "block", "Mark a step as waiting on someone or something.", "what it is waiting on"),
  stepMove("run.unblock", "unblock", "The wait is over: put a blocked step back to do.", "what changed"),
  stepMove("run.skip", "skip", "A person decides not to do a step.", "why it is skipped"),
  stepMove("run.not-applicable", "not-applicable", "Record that a step does not fit this firm or this subject.", "why it does not fit"),
  stepMove("run.reopen", "reopen", "Put a resolved step back to do.", "why it is reopened"),
  approve,
];

// ---- For other process modules ----

// One playbook's run for the firm or for a subject, read without going through
// an action: its state, its counts and the steps ready now.
export function runView(ctx: Ctx, progress: FirmProgress, pb: Playbook, subject: string | null): { state: RunState; counts: Counts; ready: string[] } {
  const variant = variantFor(ctx, subject);
  const run = runsOf(progress, subject)[pb.slug];
  if (!run) {
    const total = applicableSteps(pb, variant).length;
    return { state: "not-started", counts: { total, done: 0, skipped: 0, notApplicable: 0, blocked: 0, todo: total }, ready: [] };
  }
  const ref: RunRef = { pb, subject, run, variant };
  return { state: stateOf(ref), counts: countsOf(ref), ready: readyIds(ref) };
}

// Starts a run exactly as `pcre run start` does, with the same refusals, for a
// module that starts one as part of its own move.
export function startRun(ctx: Ctx, playbook: string, subject: string | null): unknown {
  return execute(start, ctx, subject ? { playbook, subject } : { playbook });
}

// What `pcre firm status` shows for runs. Ready and blocked count steps in open
// runs only, and leave out closed subjects, as `run next` does.
export function runSummary(ctx: Ctx) {
  const progress = readProgress(ctx);
  const refs = allRuns(ctx, progress).filter((r) => r.pb.kind !== "audit");
  let ready = 0;
  let blocked = 0;
  const runs = refs.map((ref) => {
    const state = stateOf(ref);
    const counts = countsOf(ref);
    if (state === "open" && !subjectIsClosed(progress, ref.subject)) {
      ready += readyIds(ref).length;
      blocked += counts.blocked;
    }
    return { playbook: ref.pb.slug, subject: ref.subject, state, done: counts.done, total: counts.total };
  });
  return {
    open: runs.filter((r) => r.state === "open").length,
    complete: runs.filter((r) => r.state === "complete").length,
    ready,
    blocked,
    runs,
  };
}

// Problems `pcre firm check` reports for run records beyond their schema. Only
// what is certainly wrong: a step marked done by "agent" on a human step may be
// a record from before the engine, so it is not reported.
export function runProblems(ctx: Ctx): string[] {
  const progress = readProgress(ctx);
  const kinds = new Map(ctx.corpus.playbooks.map((p) => [p.slug, p.kind]));
  const out: string[] = [];
  const check = (whereLabel: string, runs: Record<string, PlaybookProgress>) => {
    for (const slugValue of Object.keys(runs)) {
      if (kinds.get(slugValue) === "audit") out.push(`${whereLabel} › ${slugValue}: an audit recorded as a run; audits are kept in audits.json (pcre audit open)`);
    }
  };
  check("progress.json", progress.playbooks);
  for (const [id, s] of Object.entries(progress.subjects ?? {})) check(`progress.json › subjects.${id}`, s.playbooks);
  return out;
}
