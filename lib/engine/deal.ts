import { z } from "zod";
import { isResearched, type Variant } from "../compute/variant";
import { propertyType, slug, structure } from "../schemas/common";
import { findSecrets, type FirmDecisions, type FirmProgress, type FirmSubject } from "../schemas/firm";
import type { Playbook } from "../schemas/playbook";
import {
  defineAction,
  execute,
  findPlaybook,
  logEvent,
  readCalendar,
  readDecisions,
  readProgress,
  variantFor,
  writeDecisions,
  writeProgress,
  type AnyAction,
  type Ctx,
} from "./actions";
import { actorLabel, EngineError, isPerson, transition } from "./machine";
import { PROCESSES } from "./processes";
import { runActions, runView, startRun } from "./run";

// Move a deal from screen to close: the `deal` machine (lib/engine/processes.ts)
// and the decision log. A deal is a subject of kind deal. Its stage is worked out
// from its runs on every call and never stored, so it cannot drift from them.

type DealState = "active" | "completed" | "dropped";
type RunState = ReturnType<typeof runView>["state"];
type Counts = ReturnType<typeof runView>["counts"];
type Decision = FirmDecisions["items"][number];

type Stage = { playbook: string; title: string; position: number; of: number; runState: RunState };
type TrackItem = { position: number; playbook: string; title: string; runState: RunState; counts: Counts; ready: number };

// The acquisition track: the featured, fully written acquisition playbooks, in
// catalog order. Read from the catalog every time, so a new playbook joins it
// without a code change.
function trackOf(ctx: Ctx): Playbook[] {
  return ctx.corpus.playbooks
    .filter((p) => p.kind === "process" && p.phase === "acquire" && p.featured && p.depth === "full")
    .sort((a, b) => a.order - b.order);
}

function requireTrack(ctx: Ctx): Playbook[] {
  const track = trackOf(ctx);
  if (track.length === 0) {
    throw new EngineError("not-found", "The catalog has no acquisition playbooks written in full, so there is no track to move a deal through.", { track: [] });
  }
  return track;
}

// A deal with no closedOn is active, whatever its outcome says (firm check
// reports that mismatch). A deal that is closed with no outcome reads as dropped.
function stateOf(subject: FirmSubject): DealState {
  if (!subject.closedOn) return "active";
  return subject.outcome === "completed" ? "completed" : "dropped";
}

function trackView(ctx: Ctx, progress: FirmProgress, track: Playbook[], id: string): TrackItem[] {
  return track.map((pb, i) => {
    const view = runView(ctx, progress, pb, id);
    return { position: i + 1, playbook: pb.slug, title: pb.title, runState: view.state, counts: view.counts, ready: view.ready.length };
  });
}

// The first playbook not complete. A later playbook that has not been started is
// not reached until a person decides to go on, so until then the stage stays on
// the complete playbook before it. Null once every playbook is complete.
function stageOf(items: TrackItem[]): Stage | null {
  const i = items.findIndex((t) => t.runState !== "complete");
  if (i === -1) return null;
  const at = i > 0 && items[i]?.runState === "not-started" ? items[i - 1] : items[i];
  if (!at) return null;
  return { playbook: at.playbook, title: at.title, position: at.position, of: items.length, runState: at.runState };
}

const openSteps = (c: Counts) => c.todo + c.blocked;

function nextCommand(id: string, state: DealState, stage: Stage | null): string | null {
  if (state !== "active") return null;
  if (!stage) return `pcre deal complete ${id}`;
  if (stage.runState === "not-started") return `pcre run start ${stage.playbook} --subject ${id}`;
  if (stage.runState === "open") return `pcre run next --subject ${id}`;
  return `pcre deal advance ${id} --by "<name>" --note "<why>"`;
}

function openDeadlines(ctx: Ctx, id: string) {
  const items = readCalendar(ctx)
    .items.filter((d) => d.subject === id && d.status === "open")
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((d) => ({ id: d.id, title: d.title, due: d.due, needsReview: d.needsReview }));
  return { count: items.length, items };
}

// The deal a command names: it exists and it is a deal.
function loadDeal(progress: FirmProgress, id: string): FirmSubject {
  const subject = progress.subjects?.[id];
  if (!subject) {
    throw new EngineError("not-found", `No deal "${id}". Add it with: pcre deal add ${id} --label "..." (pcre deal list --all shows every deal).`, { subject: id });
  }
  if (subject.kind !== "deal") {
    throw new EngineError("wrong-kind", `${id} is a subject of kind ${subject.kind}, not a deal. Its runs are worked with: pcre run next --subject ${id}`, {
      subject: id,
      kind: subject.kind,
    });
  }
  return subject;
}

function dealView(ctx: Ctx, progress: FirmProgress, track: Playbook[], id: string) {
  const subject = loadDeal(progress, id);
  const state = stateOf(subject);
  const items = trackView(ctx, progress, track, id);
  const stage = state === "active" ? stageOf(items) : null;
  const decisions = readDecisions(ctx)
    .items.map((d, i) => ({ n: i + 1, ...d, subject: d.subject ?? null }))
    .filter((d) => d.subject === id);
  return {
    id,
    label: subject.label,
    state,
    outcome: subject.outcome ?? null,
    // A deal closed by hand (subject close) carries no outcome; say so rather than guess.
    outcomeRecorded: state === "active" || Boolean(subject.outcome),
    structure: subject.structure ?? null,
    propertyType: subject.propertyType ?? null,
    openedOn: subject.openedOn,
    closedOn: subject.closedOn ?? null,
    note: subject.note ?? null,
    stage,
    track: { count: items.length, items },
    decisions: { count: decisions.length, items: decisions },
    deadlines: openDeadlines(ctx, id),
    next: nextCommand(id, state, stage),
  };
}

type DealView = ReturnType<typeof dealView>;

const stageText = (stage: Stage | null) => (stage ? `${stage.position} of ${stage.of}: ${stage.title}` : "every playbook complete");

const stateText = (v: Pick<DealView, "state" | "closedOn" | "outcomeRecorded">) =>
  v.state === "active" ? "active" : `${v.state} on ${v.closedOn ?? "an unknown date"}${v.outcomeRecorded ? "" : " (no outcome was recorded)"}`;

function viewText(v: DealView): string {
  const lines = [`${v.id}: ${v.label}  ${stateText(v)}`];
  if (v.state === "active") lines.push(`stage: ${stageText(v.stage)}${v.stage ? ` (${v.stage.runState})` : ""}`);
  for (const t of v.track.items) {
    const resolved = t.counts.done + t.counts.skipped + t.counts.notApplicable;
    lines.push(`  ${t.position}. ${t.runState.padEnd(11)} ${resolved}/${t.counts.total}  ${t.title}`);
  }
  if (v.decisions.count > 0) lines.push(`decisions: ${v.decisions.count}, last: ${v.decisions.items.at(-1)?.decision ?? ""}`);
  if (v.deadlines.count > 0) lines.push(`open deadlines: ${v.deadlines.count}, next due ${v.deadlines.items[0]?.due ?? ""}`);
  if (v.next) lines.push(`next: ${v.next}`);
  return lines.join("\n");
}

function appendDecision(ctx: Ctx, decision: Decision): number {
  const file = readDecisions(ctx);
  file.items.push(decision);
  writeDecisions(ctx, file);
  return file.items.length;
}

// advance and drop write two files. A note that would be refused as a secret is
// refused before the first write, so one file is never changed without the other.
function refuseSecret(note: string | undefined): void {
  const problems = findSecrets({ note: note ?? null }, ["decisions.json"]);
  if (problems.length > 0) throw new EngineError("secret-detected", `Refused: ${problems[0]}`, { problems });
}

const dealId = z.string().min(1).describe("the deal's id");
const why = (what: string) => z.string().optional().describe(`required: ${what}`);

// ---- Deals ----

const add = defineAction({
  name: "deal.add",
  summary: "Add a deal and start the first acquisition playbook for it.",
  process: "deal",
  mutates: true,
  input: z
    .object({
      id: slug.describe("a short id of your own, such as deal-elm"),
      label: z.string().min(1).describe("the firm's own name for the deal"),
      structure: structure.optional().describe("when this deal's structure differs from the firm's"),
      propertyType: propertyType.optional().describe("the property type, when it differs from the firm's first one"),
      note: z.string().min(1).optional().describe("anything worth keeping with it"),
    })
    .strict(),
  positional: ["id"],
  run(ctx, args) {
    const track = requireTrack(ctx);
    const first = track[0] as Playbook;
    const progress = readProgress(ctx);
    if (progress.subjects?.[args.id]) {
      throw new EngineError("already-exists", `There is already a subject "${args.id}". See it with "pcre deal show ${args.id}", or pick another id.`, { subject: args.id });
    }
    // The deal's variant before it exists: the firm's, with the deal's own structure and property type.
    const base = variantFor(ctx, null);
    const variant: Variant = { ...base, structure: args.structure ?? base.structure, propertyType: args.propertyType ?? base.propertyType };
    if (!isResearched(first, variant)) {
      throw new EngineError(
        "guard-failed",
        `${first.title} (${first.slug}) is not researched for a ${variant.structure} deal in ${variant.jurisdictions.join(", ")}. It is written for ${first.written.structure.join(", ")} in ${first.written.jurisdiction.join(", ")}.`,
        { guard: "playbook-is-written", playbook: first.slug, variant, written: first.written },
      );
    }
    const subjectAdd = runActions.find((a) => a.name === "subject.add") as AnyAction;
    execute(subjectAdd, ctx, {
      id: args.id,
      kind: "deal",
      label: args.label,
      ...(args.structure ? { structure: args.structure } : {}),
      ...(args.propertyType ? { propertyType: args.propertyType } : {}),
      ...(args.note ? { note: args.note } : {}),
    });
    startRun(ctx, first.slug, args.id);
    logEvent(ctx, { action: "deal.add", process: "deal", target: args.id, from: null, to: PROCESSES.deal.initial, note: args.note ?? null });
    return dealView(ctx, readProgress(ctx), track, args.id);
  },
  text: (v) => `Added deal ${v.id}: ${v.label}\nstage: ${stageText(v.stage)}${v.next ? `\nnext: ${v.next}` : ""}`,
});

const list = defineAction({
  name: "deal.list",
  summary: "Every active deal with its stage, the steps ready now and its open deadlines; --all adds completed and dropped deals.",
  process: "deal",
  mutates: false,
  input: z.object({ all: z.boolean().optional().describe("include completed and dropped deals") }).strict(),
  run(ctx, args) {
    const track = requireTrack(ctx);
    const progress = readProgress(ctx);
    const items = Object.entries(progress.subjects ?? {})
      .filter(([, s]) => s.kind === "deal" && (args.all || stateOf(s) === "active"))
      .map(([id]) => {
        const v = dealView(ctx, progress, track, id);
        const current = v.stage ? v.track.items[v.stage.position - 1] : undefined;
        return {
          id,
          label: v.label,
          state: v.state,
          outcome: v.outcome,
          stage: v.stage,
          counts: current?.counts ?? null,
          ready: current?.ready ?? 0,
          openDeadlines: v.deadlines.count,
          nextDue: v.deadlines.items[0]?.due ?? null,
          openedOn: v.openedOn,
          closedOn: v.closedOn,
        };
      });
    return { count: items.length, items };
  },
  text: (r) =>
    r.items
      .map((d) => {
        const where = d.state === "active" ? stageText(d.stage) : d.label;
        const ready =
          d.state !== "active" ? "" : d.stage?.runState === "complete" ? "  (complete: a person decides to go on)" : d.stage ? `  (${d.ready} step${d.ready === 1 ? "" : "s"} ready)` : "";
        const due = d.openDeadlines > 0 ? `  ${d.openDeadlines} deadline${d.openDeadlines === 1 ? "" : "s"}, next ${d.nextDue ?? ""}` : "";
        return `${d.id}  ${d.state}  ${where}${ready}${due}`;
      })
      .join("\n") || 'No deals. Add one with: pcre deal add <id> --label "..."',
});

const show = defineAction({
  name: "deal.show",
  summary: "One deal: its stage, every acquisition playbook's run, its decisions, its open deadlines and the command to run next.",
  process: "deal",
  mutates: false,
  input: z.object({ id: dealId }).strict(),
  positional: ["id"],
  run(ctx, args) {
    const track = requireTrack(ctx);
    return dealView(ctx, readProgress(ctx), track, args.id);
  },
  text: viewText,
});

const advance = defineAction({
  name: "deal.advance",
  summary: "A person decides to go on: records the decision and starts the next acquisition playbook.",
  process: "deal",
  mutates: true,
  input: z.object({ id: dealId, note: why("why the deal goes on") }).strict(),
  positional: ["id"],
  run(ctx, args) {
    const track = requireTrack(ctx);
    const progress = readProgress(ctx);
    const subject = loadDeal(progress, args.id);
    const from = stateOf(subject);
    const move = transition(PROCESSES.deal, from, "advance", ctx.actor, args.note);
    const items = trackView(ctx, progress, track, args.id);
    const stage = stageOf(items);
    if (stage?.runState === "not-started") {
      throw new EngineError("guard-failed", `${stage.title} was never started for ${args.id}. Start it with: pcre run start ${stage.playbook} --subject ${args.id}`, {
        guard: "stage-complete",
        playbook: stage.playbook,
      });
    }
    if (stage?.runState === "open") {
      const counts = items[stage.position - 1]?.counts;
      const open = counts ? openSteps(counts) : 0;
      throw new EngineError(
        "guard-failed",
        `${stage.title} still has ${open} open step${open === 1 ? "" : "s"} for ${args.id}. Finish them first: pcre run next ${stage.playbook} --subject ${args.id}`,
        { guard: "stage-complete", playbook: stage.playbook, open },
      );
    }
    const current = stage ? track[stage.position - 1] : undefined;
    const nextPb = stage ? track[stage.position] : undefined;
    if (!current || !nextPb) {
      throw new EngineError("guard-failed", `Every acquisition playbook is complete for ${args.id}; there is no next one. Close it as bought with: pcre deal complete ${args.id}`, {
        guard: "next-playbook-written",
      });
    }
    const variant = variantFor(ctx, args.id);
    if (!isResearched(nextPb, variant)) {
      throw new EngineError(
        "guard-failed",
        `${nextPb.title} (${nextPb.slug}) is not researched for a ${variant.structure} deal in ${variant.jurisdictions.join(", ")}, so it cannot be started. It is written for ${nextPb.written.structure.join(", ")} in ${nextPb.written.jurisdiction.join(", ")}.`,
        { guard: "next-playbook-written", playbook: nextPb.slug, variant, written: nextPb.written },
      );
    }
    refuseSecret(args.note);
    // Start the run before writing the decision: if the start refuses, nothing is written.
    startRun(ctx, nextPb.slug, args.id);
    const decision: Decision = {
      date: ctx.date,
      decision: `Go on from "${current.title}" to "${nextPb.title}"`,
      by: actorLabel(ctx.actor),
      playbook: current.slug,
      note: args.note ?? null,
      subject: args.id,
    };
    const n = appendDecision(ctx, decision);
    logEvent(ctx, { action: "deal.advance", process: "deal", target: args.id, from, to: move.to, note: args.note ?? null });
    return { deal: dealView(ctx, readProgress(ctx), track, args.id), decision: { n, ...decision } };
  },
  text: (r) => `${r.decision.by}: ${r.decision.decision}\n${r.deal.id} stage: ${stageText(r.deal.stage)}${r.deal.next ? `\nnext: ${r.deal.next}` : ""}`,
});

const drop = defineAction({
  name: "deal.drop",
  summary: "A person decides not to go on with a deal, at any stage. The reason is kept with the decision.",
  process: "deal",
  mutates: true,
  input: z.object({ id: dealId, note: why("why the deal is dropped") }).strict(),
  positional: ["id"],
  run(ctx, args) {
    const track = requireTrack(ctx);
    const progress = readProgress(ctx);
    const subject = loadDeal(progress, args.id);
    const from = stateOf(subject);
    const move = transition(PROCESSES.deal, from, "drop", ctx.actor, args.note);
    const stage = stageOf(trackView(ctx, progress, track, args.id));
    refuseSecret(args.note);
    subject.closedOn = ctx.date;
    subject.outcome = "dropped";
    writeProgress(ctx, progress);
    const decision: Decision = {
      date: ctx.date,
      decision: stage ? `Drop the deal at "${stage.title}"` : "Drop the deal after the last playbook",
      by: actorLabel(ctx.actor),
      playbook: stage?.playbook ?? null,
      note: args.note ?? null,
      subject: args.id,
    };
    const n = appendDecision(ctx, decision);
    logEvent(ctx, { action: "deal.drop", process: "deal", target: args.id, from, to: move.to, note: args.note ?? null });
    return { deal: dealView(ctx, readProgress(ctx), track, args.id), decision: { n, ...decision } };
  },
  text: (r) =>
    `${r.decision.by}: ${r.decision.decision}\n${r.deal.id} is dropped as of ${r.deal.closedOn ?? ""}.${
      r.deal.deadlines.count > 0 ? `\n${r.deal.deadlines.count} of its deadlines are still open: pcre deadline list --subject ${r.deal.id}` : ""
    }`,
});

const complete = defineAction({
  name: "deal.complete",
  summary: "Close a deal as bought, once every acquisition playbook is complete.",
  process: "deal",
  mutates: true,
  input: z.object({ id: dealId, note: z.string().min(1).optional().describe("anything worth keeping with it") }).strict(),
  positional: ["id"],
  run(ctx, args) {
    const track = requireTrack(ctx);
    const progress = readProgress(ctx);
    const subject = loadDeal(progress, args.id);
    const from = stateOf(subject);
    const move = transition(PROCESSES.deal, from, "complete", ctx.actor, args.note);
    const open = trackView(ctx, progress, track, args.id).filter((t) => t.runState !== "complete");
    if (open.length > 0) {
      throw new EngineError(
        "guard-failed",
        `${args.id} still has ${open.length} acquisition playbook${open.length === 1 ? "" : "s"} not complete: ${open.map((t) => `${t.title} (${t.runState})`).join(", ")}. See where it stands with: pcre deal show ${args.id}`,
        { guard: "track-complete", open: open.map((t) => ({ playbook: t.playbook, runState: t.runState })) },
      );
    }
    subject.closedOn = ctx.date;
    subject.outcome = "completed";
    writeProgress(ctx, progress);
    logEvent(ctx, { action: "deal.complete", process: "deal", target: args.id, from, to: move.to, note: args.note ?? null });
    return dealView(ctx, readProgress(ctx), track, args.id);
  },
  text: (v) => `${v.id} is completed as of ${v.closedOn ?? ""}: every acquisition playbook is complete.`,
});

const reopen = defineAction({
  name: "deal.reopen",
  summary: "Open a completed or dropped deal again.",
  process: "deal",
  mutates: true,
  input: z.object({ id: dealId, note: why("why the deal is open again") }).strict(),
  positional: ["id"],
  run(ctx, args) {
    const track = requireTrack(ctx);
    const progress = readProgress(ctx);
    const subject = loadDeal(progress, args.id);
    const from = stateOf(subject);
    const move = transition(PROCESSES.deal, from, "reopen", ctx.actor, args.note);
    subject.closedOn = null;
    subject.outcome = null;
    writeProgress(ctx, progress);
    logEvent(ctx, { action: "deal.reopen", process: "deal", target: args.id, from, to: move.to, note: args.note ?? null });
    return dealView(ctx, readProgress(ctx), track, args.id);
  },
  text: (v) => `${v.id} is active again.\nstage: ${stageText(v.stage)}${v.next ? `\nnext: ${v.next}` : ""}`,
});

// ---- Decisions ----

const decisionAdd = defineAction({
  name: "decision.add",
  summary: "Record a person's decision about the firm, a playbook or one deal.",
  process: "deal",
  mutates: true,
  input: z
    .object({
      decision: z.string().min(3).describe("what was decided, in plain words"),
      playbook: z.string().min(1).optional().describe("the playbook it is about, by slug"),
      subject: z.string().min(1).optional().describe("the deal, offering or investor it is about, by id"),
      note: z.string().min(1).optional().describe("why, or anything worth keeping with it"),
    })
    .strict(),
  run(ctx, args) {
    if (!isPerson(ctx.actor)) {
      throw new EngineError("person-required", 'A decision is a person\'s. The agent can draft it but not sign it: ask the person, and once they decide, record it in their name with --by "<name>".', {
        action: "decision.add",
      });
    }
    const playbook = args.playbook ? findPlaybook(ctx, args.playbook).slug : null;
    if (args.subject && !readProgress(ctx).subjects?.[args.subject]) {
      throw new EngineError("not-found", `No subject "${args.subject}". See them with "pcre subject list", or leave --subject out.`, { subject: args.subject });
    }
    const decision: Decision = {
      date: ctx.date,
      decision: args.decision,
      by: actorLabel(ctx.actor),
      playbook,
      note: args.note ?? null,
      subject: args.subject ?? null,
    };
    const n = appendDecision(ctx, decision);
    logEvent(ctx, { action: "decision.add", process: null, target: args.subject ?? playbook, note: args.note ?? null });
    return { n, ...decision };
  },
  text: (d) => `Decision ${d.n} recorded: ${d.decision}  (${d.by}, ${d.date ?? "no date"})`,
});

const decisionList = defineAction({
  name: "decision.list",
  summary: "The decision log, oldest first, for the whole firm or for one subject or playbook.",
  process: "deal",
  mutates: false,
  input: z
    .object({
      subject: z.string().min(1).optional().describe("only decisions about this subject"),
      playbook: z.string().min(1).optional().describe("only decisions about this playbook"),
    })
    .strict(),
  run(ctx, args) {
    const items = readDecisions(ctx)
      .items.map((d, i) => ({ n: i + 1, ...d, subject: d.subject ?? null }))
      .filter((d) => (!args.subject || d.subject === args.subject) && (!args.playbook || d.playbook === args.playbook));
    return { count: items.length, items };
  },
  text: (r) =>
    r.items.map((d) => `${String(d.n).padStart(3)}. ${d.date ?? "no date"}  ${d.by}  ${d.decision}${d.subject ? `  [${d.subject}]` : ""}`).join("\n") ||
    "No decisions recorded.",
});

export const dealActions: AnyAction[] = [add, list, show, advance, drop, complete, reopen, decisionAdd, decisionList];

// What `pcre firm status` shows for deals: every deal, closed ones included.
export function dealSummary(ctx: Ctx) {
  const track = trackOf(ctx);
  const progress = readProgress(ctx);
  const deals = Object.entries(progress.subjects ?? {})
    .filter(([, s]) => s.kind === "deal")
    .map(([id, s]) => {
      const state = stateOf(s);
      const stage = state === "active" && track.length > 0 ? stageOf(trackView(ctx, progress, track, id)) : null;
      return { id, label: s.label, state, stage: stage?.title ?? null, position: stage?.position ?? null, of: track.length };
    });
  return {
    active: deals.filter((d) => d.state === "active").length,
    completed: deals.filter((d) => d.state === "completed").length,
    dropped: deals.filter((d) => d.state === "dropped").length,
    deals,
  };
}

// Problems `pcre firm check` reports for deal records beyond their schema. Only
// what is certainly wrong, so a folder written before the engine keeps passing.
export function dealProblems(ctx: Ctx): string[] {
  const progress = readProgress(ctx);
  const subjects = progress.subjects ?? {};
  const out: string[] = [];
  for (const [id, s] of Object.entries(subjects)) {
    if (s.outcome && !s.closedOn) out.push(`progress.json › subjects.${id}: outcome "${s.outcome}" but no closedOn; a subject with an outcome is closed`);
  }
  readDecisions(ctx).items.forEach((d, i) => {
    if (d.subject && !subjects[d.subject]) out.push(`decisions.json › items[${i}] "${d.decision}": no such subject "${d.subject}"`);
  });
  return out;
}
