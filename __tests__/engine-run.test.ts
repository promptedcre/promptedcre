import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/engine/index";
import { act, book, corpusWith, exampleFirm, refusal, step } from "./helpers/engine";

// Run a playbook, on synthetic playbooks so the tests do not lean on catalog
// text. The one exception reads the fictional example firm's own records.

// a -> b (standing) and c (human) -> f (fund only, after b) -> d (every-run) -> e (signature, human)
const WALK = book("test-walk", [
  step("a"),
  step("b", { after: ["a"], approval: "standing" }),
  step("c", { after: ["a"], mode: "human-online", actor: "principal" }),
  step("f", { after: ["b"], when: { structure: ["fund"] } }),
  step("d", { after: ["b", "c", "f"], approval: "every-run" }),
  step("e", { after: ["d"], mode: "human-offline", actor: "principal", approval: "signature" }),
]);
const OUTLINE = book("test-outline", [], { depth: "outline", outlineSteps: ["One step"] });
const AUDIT = book("test-audit", [step("x")], { kind: "audit" });
const FUND_ONLY = book("test-fund-only", [step("x")], { written: { structure: ["fund"], jurisdiction: ["us-federal", "us-tx"] } });
const CORPUS = corpusWith(WALK, OUTLINE, AUDIT, FUND_ONLY);

const ALEX = { by: "Alex Example" };

type Item = { id: string; playbook: string; subject: string | null; command: string; approval: { kind: string; satisfied: boolean }; canAgentDo: boolean };
type Next = { count: number; items: Item[]; blocked: { count: number; items: { id: string; note: string | null }[] }; complete: boolean };
type Done = { step: { id: string; status: string; by: string | null; approvedBy: string | null; proof: string | null }; state: string; next: string[] };
type Show = { state: string; variant: { structure: string }; counts: Record<string, number>; steps: { id: string; status: string; ready: boolean; waitingOn: string[]; after: string[]; who: string }[] };

function firm(): Ctx {
  return exampleFirm({ corpus: CORPUS });
}

const nextIds = (ctx: Ctx, args: Record<string, unknown> = { playbook: "test-walk" }) => act<Next>(ctx, "run.next", args).items.map((i) => i.id);

// Walks test-walk to complete for the firm (syndication) or a subject.
function walk(ctx: Ctx, subject?: string) {
  const s = subject ? { subject } : {};
  act(ctx, "run.done", { playbook: "test-walk", step: "a", ...s, proof: "notes/a.md" });
  act(ctx, "run.done", { playbook: "test-walk", step: "b", ...s, approvedBy: "Alex Example" });
  act(ctx, "run.done", { playbook: "test-walk", step: "c", ...s }, ALEX);
  if (subject && act<Show>(ctx, "run.show", { playbook: "test-walk", subject }).steps.some((x) => x.id === "f")) {
    act(ctx, "run.done", { playbook: "test-walk", step: "f", ...s });
  }
  act(ctx, "run.done", { playbook: "test-walk", step: "d", ...s, approvedBy: "Alex Example" });
  return act<Done>(ctx, "run.done", { playbook: "test-walk", step: "e", ...s }, ALEX);
}

describe("run.start", () => {
  it("refuses an outline, an audit, a variant not researched and a run that already exists", () => {
    const ctx = firm();
    expect(refusal(() => act(ctx, "run.start", { playbook: "test-outline" }))).toBe("guard-failed");
    expect(refusal(() => act(ctx, "run.start", { playbook: "test-audit" }))).toBe("wrong-kind");
    expect(refusal(() => act(ctx, "run.start", { playbook: "test-fund-only" }))).toBe("guard-failed");
    expect(refusal(() => act(ctx, "run.start", { playbook: "no-such-playbook" }))).toBe("not-found");
    expect(refusal(() => act(ctx, "run.show", { playbook: "test-walk" }))).toBe("not-found");
    const started = act<{ state: string; next: string[] }>(ctx, "run.start", { playbook: "test-walk" });
    expect(started).toMatchObject({ state: "open", next: ["a"] });
    expect(refusal(() => act(ctx, "run.start", { playbook: "test-walk" }))).toBe("already-exists");
    try {
      act(ctx, "run.start", { playbook: "test-walk" });
    } catch (err) {
      expect((err as Error).message).toContain("pcre run show test-walk");
    }
  });

  it("refuses work on a run that was never started, and says how to start it", () => {
    const ctx = firm();
    try {
      act(ctx, "run.done", { playbook: "test-walk", step: "a" });
      expect.unreachable();
    } catch (err) {
      expect((err as { code: string }).code).toBe("not-found");
      expect((err as Error).message).toContain("pcre run start test-walk");
    }
  });
});

describe("run.next and run.done", () => {
  it("follow the dependencies", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    expect(nextIds(ctx)).toEqual(["a"]);
    expect(refusal(() => act(ctx, "run.done", { playbook: "test-walk", step: "b", approvedBy: "Alex Example" }))).toBe("guard-failed");
    const done = act<Done>(ctx, "run.done", { playbook: "test-walk", step: "a", proof: "notes/a.md" });
    expect(done.step).toMatchObject({ status: "done", by: "agent", proof: "notes/a.md", approvedBy: null });
    expect(done.next).toEqual(["b", "c"]);
    expect(nextIds(ctx)).toEqual(["b", "c"]);
    const show = act<Show>(ctx, "run.show", { playbook: "test-walk" });
    expect(show.steps.find((s) => s.id === "d")).toMatchObject({ after: ["b", "c"], waitingOn: ["b", "c"], ready: false });
    expect(show.steps.find((s) => s.id === "c")?.who).toBe("principal");
  });

  it("leave a fund-only step out of a syndication run", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    const show = act<Show>(ctx, "run.show", { playbook: "test-walk" });
    expect(show.variant.structure).toBe("syndication");
    expect(show.steps.map((s) => s.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(show.counts.total).toBe(5);
    expect(refusal(() => act(ctx, "run.done", { playbook: "test-walk", step: "f" }))).toBe("not-in-variant");
    expect(refusal(() => act(ctx, "run.done", { playbook: "test-walk", step: "zz" }))).toBe("not-found");
  });

  it("keep a human step for a person: the agent is told to prepare it, the person records it", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    act(ctx, "run.done", { playbook: "test-walk", step: "a" });
    const item = act<Next>(ctx, "run.next", { playbook: "test-walk" }).items.find((i) => i.id === "c");
    expect(item?.canAgentDo).toBe(false);
    expect(item?.command).toBe('pcre run done test-walk c --by "<person>" --proof "<where the evidence is>"');
    try {
      act(ctx, "run.done", { playbook: "test-walk", step: "c" });
      expect.unreachable();
    } catch (err) {
      expect((err as { code: string; details: { guard: string } }).details.guard).toBe("person-for-human-step");
      expect((err as Error).message).toContain('--by "<name>"');
    }
    const done = act<Done>(ctx, "run.done", { playbook: "test-walk", step: "c" }, ALEX);
    expect(done.step.by).toBe("Alex Example");
  });

  it("check the three kinds of approval", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    act(ctx, "run.done", { playbook: "test-walk", step: "a" });
    act(ctx, "run.done", { playbook: "test-walk", step: "c" }, ALEX);

    // standing: refused without it; covered once a person gives it
    expect(act<Next>(ctx, "run.next", { playbook: "test-walk" }).items[0]?.approval).toMatchObject({ kind: "standing", satisfied: false });
    expect(refusal(() => act(ctx, "run.done", { playbook: "test-walk", step: "b" }))).toBe("guard-failed");
    expect(refusal(() => act(ctx, "run.approve", { playbook: "test-walk" }))).toBe("person-required");
    act(ctx, "run.approve", { playbook: "test-walk" }, ALEX);
    expect(act<Next>(ctx, "run.next", { playbook: "test-walk" }).items[0]?.approval).toMatchObject({ kind: "standing", satisfied: true });
    expect(act<Done>(ctx, "run.done", { playbook: "test-walk", step: "b" }).step.approvedBy).toBe("Alex Example");

    // every-run: the agent names the approver each time; a person recording it approves it
    expect(refusal(() => act(ctx, "run.done", { playbook: "test-walk", step: "d" }))).toBe("guard-failed");
    expect(act<Done>(ctx, "run.done", { playbook: "test-walk", step: "d", approvedBy: "Sam Sample" }).step.approvedBy).toBe("Sam Sample");

    // signature: only the person who signs, never the agent, approver or not
    expect(refusal(() => act(ctx, "run.done", { playbook: "test-walk", step: "e", approvedBy: "Alex Example" }))).toBe("guard-failed");
    expect(act<Done>(ctx, "run.done", { playbook: "test-walk", step: "e" }, ALEX).step).toMatchObject({ by: "Alex Example", approvedBy: "Alex Example" });
  });

  it("accept a standing step with a named approver, and a person recording an every-run step", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    act(ctx, "run.done", { playbook: "test-walk", step: "a" });
    expect(act<Done>(ctx, "run.done", { playbook: "test-walk", step: "b", approvedBy: "Sam Sample" }).step.approvedBy).toBe("Sam Sample");
    act(ctx, "run.done", { playbook: "test-walk", step: "c" }, ALEX);
    expect(act<Done>(ctx, "run.done", { playbook: "test-walk", step: "d" }, { by: "Sam Sample" }).step.approvedBy).toBe("Sam Sample");
  });
});

describe("other step moves", () => {
  it("skip is a person's and needs a note", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    expect(refusal(() => act(ctx, "run.skip", { playbook: "test-walk", step: "a", note: "not needed" }))).toBe("person-required");
    expect(refusal(() => act(ctx, "run.skip", { playbook: "test-walk", step: "a" }, ALEX))).toBe("note-required");
    const r = act<Done>(ctx, "run.skip", { playbook: "test-walk", step: "a", note: "done before we used the engine" }, ALEX);
    expect(r.step.status).toBe("skipped");
    expect(r.next).toEqual(["b", "c"]);
  });

  it("block and unblock", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    expect(refusal(() => act(ctx, "run.block", { playbook: "test-walk", step: "a" }))).toBe("note-required");
    act(ctx, "run.block", { playbook: "test-walk", step: "a", note: "waiting on counsel" });
    const next = act<Next>(ctx, "run.next", { playbook: "test-walk" });
    expect(next.count).toBe(0);
    expect(next.blocked.items).toEqual([expect.objectContaining({ id: "a", note: "waiting on counsel" })]);
    expect(refusal(() => act(ctx, "run.block", { playbook: "test-walk", step: "a", note: "again" }))).toBe("transition-refused");
    act(ctx, "run.unblock", { playbook: "test-walk", step: "a" });
    expect(nextIds(ctx)).toEqual(["a"]);
    act(ctx, "run.not-applicable", { playbook: "test-walk", step: "a", note: "the firm already has it" });
    expect(nextIds(ctx)).toEqual(["b", "c"]);
  });

  it("reopen puts a step back, needs a note, and refuses a step that is not resolved", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    act(ctx, "run.done", { playbook: "test-walk", step: "a" });
    expect(refusal(() => act(ctx, "run.done", { playbook: "test-walk", step: "a" }))).toBe("transition-refused");
    expect(refusal(() => act(ctx, "run.reopen", { playbook: "test-walk", step: "a" }))).toBe("note-required");
    expect(refusal(() => act(ctx, "run.reopen", { playbook: "test-walk", step: "b", note: "x" }))).toBe("transition-refused");
    const r = act<Done>(ctx, "run.reopen", { playbook: "test-walk", step: "a", note: "the filing was rejected" });
    expect(r.step.status).toBe("todo");
    expect(r.next).toEqual(["a"]);
  });
});

describe("a run end to end", () => {
  it("walks from start to complete, logs the completion, resumes on reopen, and the folder still checks", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    const last = walk(ctx);
    expect(last.state).toBe("complete");
    expect(act<Next>(ctx, "run.next", { playbook: "test-walk" })).toMatchObject({ count: 0, complete: true });
    expect(act<Show>(ctx, "run.show", { playbook: "test-walk" }).state).toBe("complete");

    const log = ctx.store.readLog();
    expect(log.at(-2)).toMatchObject({ action: "run.done", process: "step", target: "test-walk/e", from: "todo", to: "done", by: "Alex Example" });
    expect(log.at(-1)).toMatchObject({ action: "run.complete", process: "run", target: "test-walk", from: "open", to: "complete" });
    expect(log.filter((e) => e.action === "run.start")).toHaveLength(1);

    expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);

    act(ctx, "run.reopen", { playbook: "test-walk", step: "e", note: "signature page was missing" }, ALEX);
    expect(ctx.store.readLog().at(-1)).toMatchObject({ action: "run.resume", process: "run", from: "complete", to: "open" });
    expect(act<Show>(ctx, "run.show", { playbook: "test-walk" }).state).toBe("open");
  });

  it("firm status includes the run summary", () => {
    const ctx = firm();
    act(ctx, "run.start", { playbook: "test-walk" });
    act(ctx, "run.done", { playbook: "test-walk", step: "a" });
    const status = act<{ runs: { open: number; complete: number; ready: number; runs: { playbook: string; state: string; done: number; total: number }[] } }>(ctx, "firm.status");
    expect(status.runs.runs).toContainEqual({ playbook: "test-walk", subject: null, state: "open", done: 1, total: 5 });
    expect(status.runs.runs).toContainEqual(expect.objectContaining({ playbook: "file-form-d-and-state-notices", state: "open" }));
    expect(status.runs.open).toBe(2);
    expect(status.runs.ready).toBeGreaterThanOrEqual(2);
  });

  it("firm check reports a run recorded for an audit", () => {
    const ctx = firm();
    const progress = JSON.parse(fs.readFileSync(ctx.store.file("progress.json"), "utf8"));
    progress.playbooks["test-audit"] = { steps: {} };
    fs.writeFileSync(ctx.store.file("progress.json"), JSON.stringify(progress));
    try {
      act(ctx, "firm.check");
      expect.unreachable();
    } catch (err) {
      expect((err as { details: { problems: string[] } }).details.problems.join("\n")).toContain("test-audit: an audit recorded as a run");
    }
  });
});

describe("subjects", () => {
  it("are added, listed, closed and reopened, and a closed one takes no new run", () => {
    const ctx = firm();
    act(ctx, "subject.add", { id: "deal-elm", kind: "deal", label: "The warehouse on Elm", propertyType: "industrial" });
    expect(refusal(() => act(ctx, "subject.add", { id: "deal-elm", kind: "deal", label: "Again" }))).toBe("already-exists");
    expect(refusal(() => act(ctx, "subject.add", { id: "Not A Slug", kind: "deal", label: "x" }))).toBe("invalid-input");
    act(ctx, "run.start", { playbook: "test-walk", subject: "deal-elm" });
    const listed = act<{ count: number; items: { id: string; state: string; runs: number; openedOn: string }[] }>(ctx, "subject.list");
    expect(listed.items).toEqual([expect.objectContaining({ id: "deal-elm", state: "open", runs: 1, openedOn: "2026-11-12" })]);

    expect(refusal(() => act(ctx, "subject.close", { id: "deal-elm" }))).toBe("note-required");
    act(ctx, "subject.close", { id: "deal-elm", note: "seller took another offer" });
    expect(act<{ items: { state: string }[] }>(ctx, "subject.list").items[0]?.state).toBe("closed");
    expect(refusal(() => act(ctx, "run.start", { playbook: "file-form-d-and-state-notices", subject: "deal-elm" }))).toBe("subject-closed");
    // a closed subject's steps leave the firm-wide next list
    expect(act<Next>(ctx, "run.next").items.some((i) => i.subject === "deal-elm")).toBe(false);
    act(ctx, "subject.reopen", { id: "deal-elm", note: "back on" });
    expect(act<Next>(ctx, "run.next").items.some((i) => i.subject === "deal-elm")).toBe(true);
    expect(refusal(() => act(ctx, "run.start", { playbook: "test-walk", subject: "deal-nope" }))).toBe("not-found");
  });

  it("let two deals run the same playbook independently, one with a different structure", () => {
    const ctx = firm();
    act(ctx, "subject.add", { id: "deal-elm", kind: "deal", label: "The warehouse on Elm" });
    act(ctx, "subject.add", { id: "deal-oak", kind: "deal", label: "The flex park on Oak", structure: "fund" });
    act(ctx, "run.start", { playbook: "test-walk", subject: "deal-elm" });
    act(ctx, "run.start", { playbook: "test-walk", subject: "deal-oak" });

    act(ctx, "run.done", { playbook: "test-walk", step: "a", subject: "deal-elm" });
    expect(nextIds(ctx, { playbook: "test-walk", subject: "deal-elm" })).toEqual(["b", "c"]);
    expect(nextIds(ctx, { playbook: "test-walk", subject: "deal-oak" })).toEqual(["a"]);

    const oak = act<Show>(ctx, "run.show", { playbook: "test-walk", subject: "deal-oak" });
    expect(oak.variant.structure).toBe("fund");
    expect(oak.steps.map((s) => s.id)).toContain("f");
    expect(oak.steps.find((s) => s.id === "d")?.after).toEqual(["c", "f"]);

    const item = act<Next>(ctx, "run.next", { playbook: "test-walk", subject: "deal-elm" }).items[0];
    expect(item?.command).toContain("--subject deal-elm");

    expect(walk(ctx, "deal-oak").state).toBe("complete");
    expect(act<Show>(ctx, "run.show", { playbook: "test-walk", subject: "deal-elm" }).state).toBe("open");
    expect(ctx.store.readLog().filter((e) => e.action === "run.complete").map((e) => e.target)).toEqual(["deal-oak:test-walk"]);

    const list = act<{ items: { playbook: string; subject: string | null; state: string }[] }>(ctx, "run.list");
    expect(list.items.filter((i) => i.playbook === "test-walk").map((i) => `${i.subject}:${i.state}`)).toEqual(["deal-elm:open", "deal-oak:complete"]);
    expect(act<{ count: number }>(ctx, "run.list", { subject: "deal-oak" }).count).toBe(1);
    expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);
  });
});

describe("records written before the engine", () => {
  it("are read as an existing run: show, next and done all work", () => {
    const ctx = exampleFirm();
    const show = act<Show & { startedOn: string | null }>(ctx, "run.show", { playbook: "file-form-d-and-state-notices" });
    expect(show.state).toBe("open");
    expect(show.startedOn).toBeNull();
    expect(show.steps.map((s) => s.id)).not.toContain("jv-decide-filing");
    expect(show.steps.find((s) => s.id === "confirm-filing-applies")).toMatchObject({ status: "done", after: [] });
    expect(show.counts.done).toBe(2);

    const ids = nextIds(ctx, { playbook: "file-form-d-and-state-notices" });
    expect(ids).toEqual(expect.arrayContaining(["set-up-login-gov", "draft-form-id", "draft-form-d", "confirm-bad-actor-check", "list-notice-states"]));
    expect(ids).not.toContain("fix-first-sale-date");
    expect(ids).not.toContain("fund-items");

    expect(refusal(() => act(ctx, "run.start", { playbook: "file-form-d-and-state-notices" }))).toBe("already-exists");
    const done = act<Done>(ctx, "run.done", { playbook: "file-form-d-and-state-notices", step: "draft-form-id", proof: "drafts/form-id.pdf" }, { date: "2026-03-04" });
    expect(done.step).toMatchObject({ status: "done", by: "agent" });
    expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);
  });
});

describe("results", () => {
  it("are plain JSON", () => {
    const ctx = firm();
    const results: unknown[] = [
      act(ctx, "subject.add", { id: "deal-elm", kind: "deal", label: "The warehouse on Elm" }),
      act(ctx, "subject.list"),
      act(ctx, "run.start", { playbook: "test-walk" }),
      act(ctx, "run.start", { playbook: "test-walk", subject: "deal-elm" }),
      act(ctx, "run.list"),
      act(ctx, "run.show", { playbook: "test-walk" }),
      act(ctx, "run.next"),
      act(ctx, "run.next", { playbook: "file-form-d-and-state-notices" }),
      act(ctx, "run.done", { playbook: "test-walk", step: "a" }),
      act(ctx, "run.block", { playbook: "test-walk", step: "c", note: "waiting" }),
      act(ctx, "run.unblock", { playbook: "test-walk", step: "c" }),
      act(ctx, "run.approve", { playbook: "test-walk" }, ALEX),
      act(ctx, "run.reopen", { playbook: "test-walk", step: "a", note: "redo" }),
      act(ctx, "subject.close", { id: "deal-elm", note: "dropped" }),
      act(ctx, "firm.status"),
    ];
    for (const r of results) expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
  });
});
