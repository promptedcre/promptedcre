import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { Corpus } from "@/lib/content/load";
import { findAction, type Ctx } from "@/lib/engine/index";
import { act, book, exampleFirm, makeCtx, realCorpus, refusal, step } from "./helpers/engine";

// Move a deal from screen to close, on a track of three synthetic playbooks so
// the tests do not lean on catalog text. One test walks the real catalog's track.

const ACQ = { phase: "acquire" as const, featured: true };
const A = book("test-screen", [step("look"), step("decide", { after: ["look"], mode: "human-online", actor: "principal" })], { ...ACQ, order: 10 });
const B = book("test-offer", [step("draft"), step("send", { after: ["draft"] })], { ...ACQ, order: 20 });
const C = book("test-close", [step("fund")], { ...ACQ, order: 30 });
// Not on the track: not featured, or not acquisition.
const ASIDE = book("test-aside", [step("x")], { phase: "acquire", featured: false, order: 15 });
const RAISE = book("test-raise", [step("x")], { featured: true, order: 5 });

const ALEX = { by: "Alex Example" };

function corpus(...playbooks: Corpus["playbooks"]): Corpus {
  return { ...realCorpus(), playbooks };
}

function firm(c: Corpus = corpus(A, B, C, ASIDE, RAISE)): Ctx {
  const ctx = makeCtx({ corpus: c });
  act(ctx, "firm.init", { name: "Example Sponsor LLC" });
  return ctx;
}

type Stage = { playbook: string; title: string; position: number; of: number; runState: string } | null;
type View = {
  id: string;
  state: string;
  outcome: string | null;
  outcomeRecorded: boolean;
  closedOn: string | null;
  stage: Stage;
  track: { count: number; items: { playbook: string; runState: string; counts: { total: number; done: number } }[] };
  decisions: { count: number; items: { n: number; decision: string; by: string; subject: string | null; playbook: string | null; note: string | null }[] };
  deadlines: { count: number; items: { due: string }[] };
  next: string | null;
};
type Decision = { n: number; date: string; decision: string; by: string; playbook: string | null; note: string | null; subject: string | null };
type Advanced = { deal: View; decision: Decision };
type ListItem = { id: string; state: string; stage: Stage; ready: number; counts: { total: number } | null; openDeadlines: number; nextDue: string | null };
type List<T> = { count: number; items: T[] };

const show = (ctx: Ctx, id = "deal-elm") => act<View>(ctx, "deal.show", { id });

function addElm(ctx: Ctx): View {
  return act<View>(ctx, "deal.add", { id: "deal-elm", label: "The warehouse on Elm", propertyType: "industrial" });
}

function finishA(ctx: Ctx) {
  act(ctx, "run.done", { playbook: "test-screen", step: "look", subject: "deal-elm" });
  act(ctx, "run.done", { playbook: "test-screen", step: "decide", subject: "deal-elm" }, ALEX);
}

function errorOf(run: () => unknown): { code: string; message: string; details: Record<string, unknown> } {
  try {
    run();
  } catch (err) {
    return err as { code: string; message: string; details: Record<string, unknown> };
  }
  throw new Error("expected a refusal");
}

describe("deal.add", () => {
  it("adds the subject as a deal and starts the first playbook on the track", () => {
    const ctx = firm();
    const view = addElm(ctx);
    expect(view).toMatchObject({ id: "deal-elm", state: "active", outcome: null, next: "pcre run next --subject deal-elm" });
    expect(view.stage).toEqual({ playbook: "test-screen", title: "Synthetic test-screen", position: 1, of: 3, runState: "open" });
    expect(view.track.items.map((t) => [t.playbook, t.runState])).toEqual([
      ["test-screen", "open"],
      ["test-offer", "not-started"],
      ["test-close", "not-started"],
    ]);
    const subjects = act<List<{ id: string; kind: string }>>(ctx, "subject.list");
    expect(subjects.items).toEqual([expect.objectContaining({ id: "deal-elm", kind: "deal" })]);
    const log = act<{ events: { action: string; process: string | null; to: string | null }[] }>(ctx, "firm.log").events.map((e) => e.action);
    expect(log).toEqual(["firm.init", "subject.add", "run.start", "deal.add"]);
  });

  it("refuses a duplicate id, an empty track and a first playbook not researched for the deal", () => {
    const ctx = firm();
    addElm(ctx);
    expect(refusal(() => addElm(ctx))).toBe("already-exists");

    const empty = firm(corpus(ASIDE, RAISE));
    expect(refusal(() => addElm(empty))).toBe("not-found");
    expect(refusal(() => act(empty, "deal.list"))).toBe("not-found");
    expect(act<List<unknown>>(empty, "subject.list").count).toBe(0);

    const fundOnly = firm(corpus(book("test-fund-screen", [step("x")], { ...ACQ, order: 1, written: { structure: ["fund"], jurisdiction: ["us-federal", "us-tx"] } })));
    expect(errorOf(() => addElm(fundOnly)).details.guard).toBe("playbook-is-written");
    expect(act<List<unknown>>(fundOnly, "subject.list").count).toBe(0);
    expect(act<View>(fundOnly, "deal.add", { id: "deal-oak", label: "The lot on Oak", structure: "fund" }).stage?.runState).toBe("open");
  });

  it("refuses deal commands on a subject that is not a deal", () => {
    const ctx = firm();
    act(ctx, "subject.add", { id: "offering-one", kind: "offering", label: "First offering" });
    expect(refusal(() => show(ctx, "offering-one"))).toBe("wrong-kind");
    expect(refusal(() => show(ctx, "deal-none"))).toBe("not-found");
  });
});

describe("the stage", () => {
  it("follows the runs, and waits on the finished playbook until a person goes on", () => {
    const ctx = firm();
    addElm(ctx);
    act(ctx, "run.done", { playbook: "test-screen", step: "look", subject: "deal-elm" });
    expect(show(ctx).stage).toMatchObject({ position: 1, runState: "open" });
    act(ctx, "run.done", { playbook: "test-screen", step: "decide", subject: "deal-elm" }, ALEX);
    const view = show(ctx);
    expect(view.stage).toMatchObject({ playbook: "test-screen", position: 1, runState: "complete" });
    expect(view.next).toBe('pcre deal advance deal-elm --by "<name>" --note "<why>"');
    // A step reopened puts the stage back to open.
    act(ctx, "run.reopen", { playbook: "test-screen", step: "decide", subject: "deal-elm", note: "Recheck the rent roll" });
    expect(show(ctx).stage).toMatchObject({ position: 1, runState: "open" });
  });
});

describe("deal.advance", () => {
  it("is a person's decision with a note, and waits for the stage to be complete", () => {
    const ctx = firm();
    addElm(ctx);
    expect(refusal(() => act(ctx, "deal.advance", { id: "deal-elm", note: "Fits the buy box" }))).toBe("person-required");
    expect(refusal(() => act(ctx, "deal.advance", { id: "deal-elm" }, ALEX))).toBe("note-required");
    const open = errorOf(() => act(ctx, "deal.advance", { id: "deal-elm", note: "Fits the buy box" }, ALEX));
    expect(open.code).toBe("guard-failed");
    expect(open.details).toMatchObject({ guard: "stage-complete", open: 2 });
    expect(open.message).toContain("2 open steps");
    expect(open.message).toContain("pcre run next test-screen --subject deal-elm");

    finishA(ctx);
    const r = act<Advanced>(ctx, "deal.advance", { id: "deal-elm", note: "Fits the buy box" }, ALEX);
    expect(r.decision).toEqual({
      n: 1,
      date: "2026-11-12",
      decision: 'Go on from "Synthetic test-screen" to "Synthetic test-offer"',
      by: "Alex Example",
      playbook: "test-screen",
      note: "Fits the buy box",
      subject: "deal-elm",
    });
    expect(r.deal.stage).toMatchObject({ playbook: "test-offer", position: 2, runState: "open" });
    expect(r.deal.decisions.count).toBe(1);
    const log = act<{ events: { action: string; process: string | null; from: string | null; to: string | null; note: string | null }[] }>(ctx, "firm.log").events;
    expect(log.at(-1)).toMatchObject({ action: "deal.advance", process: "deal", from: "active", to: "active", note: "Fits the buy box" });
  });

  it("says to start a first playbook that was never started", () => {
    const ctx = firm();
    act(ctx, "subject.add", { id: "deal-elm", kind: "deal", label: "The warehouse on Elm" });
    expect(show(ctx).next).toBe("pcre run start test-screen --subject deal-elm");
    const err = errorOf(() => act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX));
    expect(err.details.guard).toBe("stage-complete");
    expect(err.message).toContain("pcre run start test-screen --subject deal-elm");
  });

  it("on the last playbook points to deal complete", () => {
    const ctx = firm();
    addElm(ctx);
    finishA(ctx);
    act(ctx, "deal.advance", { id: "deal-elm", note: "Screen passed" }, ALEX);
    act(ctx, "run.done", { playbook: "test-offer", step: "draft", subject: "deal-elm" });
    act(ctx, "run.done", { playbook: "test-offer", step: "send", subject: "deal-elm" });
    act(ctx, "deal.advance", { id: "deal-elm", note: "Seller signed" }, ALEX);
    act(ctx, "run.done", { playbook: "test-close", step: "fund", subject: "deal-elm" });
    const view = show(ctx);
    expect(view.stage).toBeNull();
    expect(view.next).toBe("pcre deal complete deal-elm");
    const err = errorOf(() => act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX));
    expect(err.details.guard).toBe("next-playbook-written");
    expect(err.message).toContain("pcre deal complete deal-elm");
  });

  it("refuses when the next playbook is not researched for the deal", () => {
    const fundNext = book("test-fund-offer", [step("x")], { ...ACQ, order: 20, written: { structure: ["fund"], jurisdiction: ["us-federal", "us-tx"] } });
    const ctx = firm(corpus(A, fundNext));
    addElm(ctx);
    finishA(ctx);
    expect(errorOf(() => act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX)).details.guard).toBe("next-playbook-written");
    expect(act<List<unknown>>(ctx, "decision.list").count).toBe(0);
  });
});

describe("deal.complete, deal.drop and deal.reopen", () => {
  it("complete waits for every playbook, names the open ones, then closes the deal as bought", () => {
    const ctx = firm();
    addElm(ctx);
    const err = errorOf(() => act(ctx, "deal.complete", { id: "deal-elm" }));
    expect(err.code).toBe("guard-failed");
    expect(err.details.guard).toBe("track-complete");
    expect(err.message).toContain("Synthetic test-screen (open)");
    expect(err.message).toContain("Synthetic test-close (not-started)");

    finishA(ctx);
    act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX);
    act(ctx, "run.done", { playbook: "test-offer", step: "draft", subject: "deal-elm" });
    act(ctx, "run.done", { playbook: "test-offer", step: "send", subject: "deal-elm" });
    act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX);
    act(ctx, "run.done", { playbook: "test-close", step: "fund", subject: "deal-elm" });
    const done = act<View>(ctx, "deal.complete", { id: "deal-elm" });
    expect(done).toMatchObject({ state: "completed", outcome: "completed", closedOn: "2026-11-12", stage: null, next: null });
    expect(refusal(() => act(ctx, "deal.complete", { id: "deal-elm" }))).toBe("transition-refused");
  });

  it("drop is a person's decision at any stage, kept with its reason", () => {
    const ctx = firm();
    addElm(ctx);
    expect(refusal(() => act(ctx, "deal.drop", { id: "deal-elm", note: "Rent below market" }))).toBe("person-required");
    expect(refusal(() => act(ctx, "deal.drop", { id: "deal-elm" }, ALEX))).toBe("note-required");
    const r = act<Advanced>(ctx, "deal.drop", { id: "deal-elm", note: "Rent below market" }, ALEX);
    expect(r.decision).toMatchObject({ decision: 'Drop the deal at "Synthetic test-screen"', by: "Alex Example", playbook: "test-screen", note: "Rent below market", subject: "deal-elm" });
    expect(r.deal).toMatchObject({ state: "dropped", outcome: "dropped", closedOn: "2026-11-12", next: null });
    expect(refusal(() => act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX))).toBe("transition-refused");
    // A dropped deal's runs take no new work through the subject either.
    expect(refusal(() => act(ctx, "run.start", { playbook: "test-offer", subject: "deal-elm" }))).toBe("subject-closed");
  });

  it("drop after the last playbook says so", () => {
    const ctx = firm(corpus(C));
    addElm(ctx);
    act(ctx, "run.done", { playbook: "test-close", step: "fund", subject: "deal-elm" });
    expect(act<Advanced>(ctx, "deal.drop", { id: "deal-elm", note: "Lender pulled out" }, ALEX).decision.decision).toBe("Drop the deal after the last playbook");
  });

  it("reopen brings a dropped or completed deal back to active", () => {
    const ctx = firm();
    addElm(ctx);
    act(ctx, "deal.drop", { id: "deal-elm", note: "Seller went quiet" }, ALEX);
    expect(refusal(() => act(ctx, "deal.reopen", { id: "deal-elm" }))).toBe("note-required");
    const view = act<View>(ctx, "deal.reopen", { id: "deal-elm", note: "Seller came back" });
    expect(view).toMatchObject({ state: "active", outcome: null, closedOn: null });
    expect(view.stage).toMatchObject({ position: 1, runState: "open" });
    expect(refusal(() => act(ctx, "deal.reopen", { id: "deal-elm", note: "Again" }))).toBe("transition-refused");
  });

  it("reads a deal closed with no outcome as dropped, and says no outcome was recorded", () => {
    const ctx = firm();
    addElm(ctx);
    act(ctx, "subject.close", { id: "deal-elm", note: "Closed by hand" });
    const view = show(ctx);
    expect(view).toMatchObject({ state: "dropped", outcome: null, outcomeRecorded: false });
    const text = findAction("deal.show")?.text as ((v: View) => string) | undefined;
    expect(text?.(view)).toContain("no outcome was recorded");
  });
});

describe("deal.list", () => {
  it("shows active deals unless --all, with the stage, ready steps and open deadlines", () => {
    const ctx = firm();
    addElm(ctx);
    act(ctx, "deal.add", { id: "deal-oak", label: "The lot on Oak" });
    act(ctx, "deal.drop", { id: "deal-oak", note: "Outside the buy box" }, ALEX);
    act(ctx, "deadline.add", { title: "Option period ends", due: "2026-12-01", subject: "deal-elm" });
    act(ctx, "deadline.add", { title: "Earnest money due", due: "2026-11-20", subject: "deal-elm" });
    act(ctx, "deadline.add", { title: "Closing", due: "2026-12-30", subject: "deal-elm", id: "elm-closing" });
    act(ctx, "deadline.done", { id: "elm-closing" });
    act(ctx, "deadline.add", { title: "Firm report", due: "2026-11-15" });

    const active = act<List<ListItem>>(ctx, "deal.list");
    expect(active.items.map((d) => d.id)).toEqual(["deal-elm"]);
    expect(active.items[0]).toMatchObject({ state: "active", ready: 1, counts: { total: 2 }, openDeadlines: 2, nextDue: "2026-11-20" });
    expect(active.items[0]?.stage).toMatchObject({ position: 1, of: 3 });

    const all = act<List<ListItem>>(ctx, "deal.list", { all: true });
    expect(all.items.map((d) => [d.id, d.state])).toEqual([
      ["deal-elm", "active"],
      ["deal-oak", "dropped"],
    ]);
    expect(all.items[1]).toMatchObject({ stage: null, openDeadlines: 0 });
  });
});

describe("decisions", () => {
  it("decision.add is a person's: refused for the agent, checked against the catalog and the subjects", () => {
    const ctx = firm();
    addElm(ctx);
    const agent = errorOf(() => act(ctx, "decision.add", { decision: "Use the standard lease abstract" }));
    expect(agent.code).toBe("person-required");
    expect(agent.message).toContain("--by");
    expect(refusal(() => act(ctx, "decision.add", { decision: "Something", playbook: "no-such-playbook" }, ALEX))).toBe("not-found");
    expect(refusal(() => act(ctx, "decision.add", { decision: "Something", subject: "deal-none" }, ALEX))).toBe("not-found");
    const d = act<Decision>(ctx, "decision.add", { decision: "Order a phase one report", playbook: "test-screen", subject: "deal-elm", note: "Lender asks for it" }, ALEX);
    expect(d).toEqual({ n: 1, date: "2026-11-12", decision: "Order a phase one report", by: "Alex Example", playbook: "test-screen", note: "Lender asks for it", subject: "deal-elm" });
    expect(act<Decision>(ctx, "decision.add", { decision: "Keep the books monthly" }, ALEX)).toMatchObject({ n: 2, playbook: null, subject: null });
  });

  it("decision.list keeps file order and filters by subject and playbook", () => {
    const ctx = firm();
    addElm(ctx);
    act(ctx, "deal.add", { id: "deal-oak", label: "The lot on Oak" });
    act(ctx, "decision.add", { decision: "Firm-wide decision" }, ALEX);
    finishA(ctx);
    act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX);
    act(ctx, "deal.drop", { id: "deal-oak", note: "Too small" }, ALEX);
    const all = act<List<Decision>>(ctx, "decision.list");
    expect(all.items.map((d) => d.n)).toEqual([1, 2, 3]);
    expect(act<List<Decision>>(ctx, "decision.list", { subject: "deal-elm" }).items.map((d) => d.n)).toEqual([2]);
    expect(act<List<Decision>>(ctx, "decision.list", { playbook: "test-screen" }).items.map((d) => d.n)).toEqual([2, 3]);
    expect(act<List<Decision>>(ctx, "decision.list", { subject: "deal-oak", playbook: "test-screen" }).items.map((d) => d.subject)).toEqual(["deal-oak"]);
  });
});

describe("firm status and firm check", () => {
  it("status carries the deal summary; check passes after a full walk and reports an outcome with no closedOn", () => {
    const ctx = firm();
    addElm(ctx);
    act(ctx, "deal.add", { id: "deal-oak", label: "The lot on Oak" });
    finishA(ctx);
    act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX);
    act(ctx, "run.done", { playbook: "test-offer", step: "draft", subject: "deal-elm" });
    act(ctx, "run.done", { playbook: "test-offer", step: "send", subject: "deal-elm" });
    act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX);
    act(ctx, "run.done", { playbook: "test-close", step: "fund", subject: "deal-elm" });
    act(ctx, "deal.complete", { id: "deal-elm" });
    act(ctx, "deal.add", { id: "deal-pine", label: "The yard on Pine" });
    act(ctx, "deal.drop", { id: "deal-oak", note: "Too small" }, ALEX);

    const status = act<{ deals: unknown }>(ctx, "firm.status");
    expect(status.deals).toEqual({
      active: 1,
      completed: 1,
      dropped: 1,
      deals: [
        { id: "deal-elm", label: "The warehouse on Elm", state: "completed", stage: null, position: null, of: 3 },
        { id: "deal-oak", label: "The lot on Oak", state: "dropped", stage: null, position: null, of: 3 },
        { id: "deal-pine", label: "The yard on Pine", state: "active", stage: "Synthetic test-screen", position: 1, of: 3 },
      ],
    });
    expect(refusal(() => act(ctx, "firm.check"))).toBeNull();

    // A hand edit: an outcome with no closedOn, and a decision about a subject that is not there.
    const progress = JSON.parse(fs.readFileSync(ctx.store.file("progress.json"), "utf8"));
    progress.subjects["deal-pine"].outcome = "dropped";
    fs.writeFileSync(ctx.store.file("progress.json"), JSON.stringify(progress));
    const decisions = JSON.parse(fs.readFileSync(ctx.store.file("decisions.json"), "utf8"));
    decisions.items.push({ date: "2026-11-12", decision: "Go on with the lot on Ash", by: "Alex Example", playbook: null, note: null, subject: "deal-ash" });
    fs.writeFileSync(ctx.store.file("decisions.json"), JSON.stringify(decisions));
    const err = errorOf(() => act(ctx, "firm.check"));
    expect(err.code).toBe("firm-invalid");
    const problems = err.details.problems as string[];
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("deal-pine");
    expect(problems[1]).toContain("deal-ash");
    // The hand-edited deal reads as active: it has no closedOn.
    expect(show(ctx, "deal-pine").state).toBe("active");
  });

  it("the example firm, written before the engine, still passes firm check", () => {
    expect(refusal(() => act(exampleFirm(), "firm.check"))).toBeNull();
  });

  it("results survive a JSON round trip unchanged", () => {
    const ctx = firm();
    const results: unknown[] = [addElm(ctx), act(ctx, "deal.list"), show(ctx)];
    finishA(ctx);
    results.push(act(ctx, "deal.advance", { id: "deal-elm", note: "Go" }, ALEX));
    results.push(act(ctx, "decision.add", { decision: "Order the survey" }, ALEX), act(ctx, "decision.list"));
    results.push(act(ctx, "deal.drop", { id: "deal-elm", note: "Stop" }, ALEX), act(ctx, "deal.list", { all: true }), act(ctx, "firm.status"));
    for (const r of results) expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe("the real catalog", () => {
  type NextItems = { count: number; items: { playbook: string; id: string }[] };

  it("has an acquisition track in order, and a deal can be walked through all of it to completed", () => {
    const ctx = exampleFirm();
    const track = realCorpus()
      .playbooks.filter((p) => p.kind === "process" && p.phase === "acquire" && p.featured && p.depth === "full")
      .sort((a, b) => a.order - b.order);
    expect(track.length).toBeGreaterThan(0);

    const added = act<View>(ctx, "deal.add", { id: "deal-elm", label: "The warehouse on Elm" });
    expect(added.track.items.map((t) => t.playbook)).toEqual(track.map((p) => p.slug));
    const orders = track.map((p) => p.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(new Set(orders).size).toBe(orders.length);

    for (let position = 1; position <= track.length; position++) {
      expect(show(ctx).stage).toMatchObject({ position, runState: "open" });
      for (let guard = 0; guard < 200; guard++) {
        const next = act<NextItems>(ctx, "run.next", { subject: "deal-elm" });
        if (next.count === 0) break;
        for (const item of next.items) {
          act(ctx, "run.done", { playbook: item.playbook, step: item.id, subject: "deal-elm", proof: "deals/elm/notes.md" }, ALEX);
        }
      }
      if (position < track.length) act(ctx, "deal.advance", { id: "deal-elm", note: "Reviewed and approved" }, ALEX);
    }
    expect(show(ctx).stage).toBeNull();
    expect(act<View>(ctx, "deal.complete", { id: "deal-elm" }).state).toBe("completed");
    expect(act<List<Decision>>(ctx, "decision.list", { subject: "deal-elm" }).count).toBe(track.length - 1);
    expect(refusal(() => act(ctx, "firm.check"))).toBeNull();
  }, 60_000);
});
