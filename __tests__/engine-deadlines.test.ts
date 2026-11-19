import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeDeadlines, type DeadlinesInput } from "@/lib/calculators/deadlines";
import { toIcs, type IcsItem } from "@/lib/engine/ics";
import type { Ctx } from "@/lib/engine/index";
import { firmCalendar, firmProgress, type FirmDeadline } from "@/lib/schemas/firm";
import { act, exampleFirm, makeCtx, refusal, TODAY } from "./helpers/engine";

const empty: DeadlinesInput = {
  firstSaleDate: null,
  firstTexasSaleDate: null,
  exchangeTransferDate: null,
  returnDueDate: null,
  appraisalNoticeDate: null,
  protestYear: null,
  contractEffectiveDate: null,
  contractPeriods: [],
};

type View = FirmDeadline & { state: string; daysLeft: number };
type ListResult = { count: number; overdue: number; dueSoon: number; items: View[] };
type ComputeResult = { added: FirmDeadline[]; existing: FirmDeadline[]; trace: unknown[] };
type MoveResult = { deadline: View; from: string; next: string[] };

const roundTrips = (x: unknown) => expect(JSON.parse(JSON.stringify(x))).toEqual(x);
const calendarText = (ctx: Ctx) => fs.readFileSync(ctx.store.file("calendar.json"), "utf8");

function withSubject(ctx: Ctx, id: string): void {
  const progress = ctx.store.read("progress.json", firmProgress);
  progress.subjects = { [id]: { kind: "offering", label: "Example Fund I", openedOn: "2026-01-05", playbooks: {} } };
  ctx.store.write("progress.json", firmProgress, progress);
}

function problemsOf(run: () => unknown): string[] {
  try {
    run();
    return [];
  } catch (err) {
    return ((err as { details?: { problems?: string[] } }).details?.problems ?? []) as string[];
  }
}

describe("deadline.add", () => {
  it("makes an id from the title and the due date, and starts open", () => {
    const ctx = exampleFirm();
    const r = act<{ deadline: View; next: string[] }>(ctx, "deadline.add", { title: "Renew the registered agent", due: "2027-01-15" });
    expect(r.deadline).toMatchObject({ id: "renew-the-registered-agent-2027-01-15", source: "manual", needsReview: false, status: "open", state: "upcoming" });
    expect(r.next).toEqual(["deadline.done", "deadline.dismiss"]);
    roundTrips(r);
    const last = ctx.store.readLog().at(-1);
    expect(last).toMatchObject({ action: "deadline.add", process: "deadline", target: r.deadline.id, from: null, to: "open" });
  });

  it("refuses a duplicate id, an unknown rule, an unknown subject and a date that does not exist", () => {
    const ctx = exampleFirm();
    act(ctx, "deadline.add", { title: "Annual report", due: "2027-05-15" });
    expect(refusal(() => act(ctx, "deadline.add", { title: "Annual report", due: "2027-05-15" }))).toBe("already-exists");
    expect(refusal(() => act(ctx, "deadline.add", { title: "Something", due: "2027-05-15", rule: "us-fed.no-such-rule" }))).toBe("not-found");
    expect(refusal(() => act(ctx, "deadline.add", { title: "Something", due: "2027-05-15", subject: "example-fund-i" }))).toBe("not-found");
    expect(refusal(() => act(ctx, "deadline.add", { title: "Something", due: "2027-02-30" }))).toBe("invalid-input");
    withSubject(ctx, "example-fund-i");
    const r = act<{ deadline: View }>(ctx, "deadline.add", { title: "Something", due: "2027-05-15", subject: "example-fund-i", rule: "us-fed.reg-d.form-d-filing" });
    expect(r.deadline).toMatchObject({ subject: "example-fund-i", rule: "us-fed.reg-d.form-d-filing" });
  });
});

describe("deadline.compute", () => {
  it("adds what the calculator gives for a first sale date, flagged for review, and is idempotent", () => {
    const ctx = exampleFirm();
    const r = act<ComputeResult>(ctx, "deadline.compute", { firstSaleDate: "2026-03-02" });
    const expected = computeDeadlines({ ...empty, firstSaleDate: "2026-03-02" }).items;
    expect(r.added.map((d) => [d.id, d.due, d.rule, d.title])).toEqual(expected.map((i) => [`${i.id}-${i.date}`, i.date, i.ruleId, i.label]));
    expect(r.added[0]).toMatchObject({ id: "form-d-2026-03-17", source: "calculator", needsReview: true, rule: "us-fed.reg-d.form-d-filing" });
    expect(r.added[0]?.basis).toBe(expected[0]?.computedFrom);
    expect(r.existing).toEqual([]);
    roundTrips(r);

    const before = calendarText(ctx);
    const again = act<ComputeResult>(ctx, "deadline.compute", { firstSaleDate: "2026-03-02" });
    expect(again.added).toEqual([]);
    expect(again.existing.map((d) => d.id)).toEqual(["form-d-2026-03-17"]);
    expect(calendarText(ctx)).toBe(before);
  });

  it("says in the basis when a date moved, and why", () => {
    const ctx = exampleFirm();
    const r = act<ComputeResult>(ctx, "deadline.compute", { firstSaleDate: "2026-06-18" });
    expect(r.added[0]?.due).toBe("2026-07-06");
    expect(r.added[0]?.basis).toContain("moved from 2026-07-03 past");
  });

  it("takes the whole calculator input from JSON, which wins over the flags", () => {
    const ctx = exampleFirm();
    const input = {
      ...empty,
      contractEffectiveDate: "2026-12-01",
      contractPeriods: [{ label: "Feasibility period ends (per contract)", days: 45, roll: "none" }],
    };
    fs.writeFileSync(ctx.store.file("dates.json"), JSON.stringify(input));
    const r = act<ComputeResult>(ctx, "deadline.compute", { inputFile: "dates.json", firstSaleDate: "2026-03-02" });
    expect(r.added.map((d) => d.id)).toEqual(["contract-1-2027-01-15"]);
    expect(r.added[0]?.rule).toBeNull();
  });

  it("refuses when there is nothing to compute, and says which dates it needs", () => {
    const ctx = exampleFirm();
    let message = "";
    try {
      act(ctx, "deadline.compute", { contractEffectiveDate: "2026-12-01" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("--first-sale-date");
    expect(refusal(() => act(ctx, "deadline.compute", {}))).toBe("invalid-input");
    expect(ctx.store.exists("calendar.json")).toBe(false);
  });
});

describe("derived states", () => {
  it("are worked out from today at the boundaries, never stored", () => {
    const ctx = exampleFirm({ today: "2026-11-12" });
    const dates = { yesterday: "2026-11-11", today: "2026-11-12", in30: "2026-12-12", in31: "2026-12-13" };
    for (const [name, due] of Object.entries(dates)) act(ctx, "deadline.add", { title: `Due ${name}`, due, id: name.toLowerCase() });
    const r = act<ListResult>(ctx, "deadline.list");
    expect(r.items.map((v) => [v.id, v.state, v.daysLeft])).toEqual([
      ["yesterday", "overdue", -1],
      ["today", "due-soon", 0],
      ["in30", "due-soon", 30],
      ["in31", "upcoming", 31],
    ]);
    expect([r.count, r.overdue, r.dueSoon]).toEqual([4, 1, 2]);
    expect(calendarText(ctx)).not.toContain("overdue");

    const later = act<ListResult>({ ...ctx, today: "2026-12-14" }, "deadline.list");
    expect(later.items.every((v) => v.state === "overdue")).toBe(true);

    const within = act<ListResult>(ctx, "deadline.list", { within: 0 });
    expect(within.items.map((v) => v.id)).toEqual(["yesterday", "today"]);
    expect(act<ListResult>(ctx, "deadline.list", { within: 30 }).count).toBe(3);
  });
});

describe("done, dismiss and reopen", () => {
  it("go through the machine: a person dismisses with a reason, and reopen clears who closed it", () => {
    const ctx = exampleFirm();
    act(ctx, "deadline.add", { title: "File the annual report", due: "2027-05-15", id: "annual-report", note: "Due each year." });
    act(ctx, "deadline.add", { title: "Texas notice", due: "2026-12-01", id: "tx-notice" });

    const met = act<MoveResult>(ctx, "deadline.done", { id: "annual-report", note: "Filed online" }, { date: "2026-11-10" });
    expect(met.deadline).toMatchObject({ status: "done", state: "done", closedOn: "2026-11-10", by: "agent" });
    expect(met.deadline.note).toBe("Due each year.\nDone 2026-11-10 by agent: Filed online");
    expect(refusal(() => act(ctx, "deadline.done", { id: "annual-report" }))).toBe("transition-refused");

    expect(refusal(() => act(ctx, "deadline.dismiss", { id: "tx-notice", note: "No Texas investors" }))).toBe("person-required");
    expect(refusal(() => act(ctx, "deadline.dismiss", { id: "tx-notice" }, { by: "Alex Example" }))).toBe("note-required");
    const gone = act<MoveResult>(ctx, "deadline.dismiss", { id: "tx-notice", note: "No Texas investors" }, { by: "Alex Example" });
    expect(gone.deadline).toMatchObject({ status: "dismissed", by: "Alex Example", closedOn: TODAY });

    expect(refusal(() => act(ctx, "deadline.reopen", { id: "tx-notice" }))).toBe("note-required");
    const back = act<MoveResult>(ctx, "deadline.reopen", { id: "tx-notice", note: "A Texas investor signed" });
    expect(back.deadline).toMatchObject({ status: "open", closedOn: null, by: null });
    expect(refusal(() => act(ctx, "deadline.done", { id: "nope" }))).toBe("not-found");
    roundTrips(back);

    const all = act<ListResult>(ctx, "deadline.list", { status: "all" });
    expect(all.items.map((v) => v.state)).toEqual(["due-soon", "done"]);
    const log = ctx.store.readLog().filter((e) => e.process === "deadline").map((e) => `${e.action} ${e.from ?? ""}->${e.to}`);
    expect(log.slice(-3)).toEqual(["deadline.done open->done", "deadline.dismiss open->dismissed", "deadline.reopen dismissed->open"]);
  });
});

describe("deadline.export", () => {
  it("writes a calendar file inside the firm folder and refuses a path outside it", () => {
    const ctx = exampleFirm();
    act(ctx, "deadline.compute", { firstSaleDate: "2026-03-02" });
    const before = calendarText(ctx);
    const r = act<{ path: string; events: number }>(ctx, "deadline.export");
    expect(r).toEqual({ path: ctx.store.file("calendar.ics"), events: 1 });
    expect(calendarText(ctx)).toBe(before);
    const text = fs.readFileSync(r.path, "utf8");
    expect(text).toContain("UID:form-d-2026-03-17@promptedcre");
    expect(text).toContain("DTSTART;VALUE=DATE:20260317");
    expect(ctx.store.readLog().at(-1)).toMatchObject({ action: "deadline.export", target: "calendar.ics" });

    const nested = act<{ path: string }>(ctx, "deadline.export", { out: "exports/all.ics", status: "all" });
    expect(fs.existsSync(nested.path)).toBe(true);
    expect(refusal(() => act(ctx, "deadline.export", { out: "../outside.ics" }))).toBe("invalid-input");
    expect(refusal(() => act(ctx, "deadline.export", { out: path.join(os.tmpdir(), "outside.ics") }))).toBe("invalid-input");
  });
});

describe("toIcs", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");
  const base: IcsItem = { id: "form-d-2026-03-17", title: "Form D due", due: "2026-03-17", rule: "us-fed.reg-d.form-d-filing", basis: null, note: null, needsReview: true };
  const opts = { now, productId: "-//Example//Test//EN" };
  const octets = (s: string) => Buffer.byteLength(s, "utf8");

  it("writes the calendar envelope and all-day events, with CRLF after every line", () => {
    const text = toIcs([base], opts);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = text.split("\r\n");
    expect(lines.slice(0, 4)).toEqual(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Example//Test//EN", "CALSCALE:GREGORIAN"]);
    expect(lines).toContain("DTSTAMP:20261112T120000Z");
    expect(lines).toContain("DTSTART;VALUE=DATE:20260317");
    expect(lines).toContain("DTEND;VALUE=DATE:20260318");
    expect(toIcs([{ ...base, due: "2026-12-31" }], opts)).toContain("DTEND;VALUE=DATE:20270101");
    expect(text.replace(/\r\n /g, "")).toContain("DESCRIPTION:Rule: us-fed.reg-d.form-d-filing\\nCheck this date before relying on it.\r\n");
  });

  it("escapes commas, semicolons, backslashes and newlines in text", () => {
    const text = toIcs([{ ...base, title: "Pay, file; then\nrest \\ done", needsReview: false }], opts);
    expect(text).toContain("SUMMARY:Pay\\, file\\; then\\nrest \\\\ done\r\n");
  });

  it("folds a long line at 75 octets without splitting a multi-byte character", () => {
    // "SUMMARY:" is 8 octets; 66 more make 74, so the 2-octet é cannot fit on the first line.
    const title = `${"a".repeat(66)}é${"b".repeat(100)}`;
    const text = toIcs([{ ...base, title }], opts);
    const physical = text.split("\r\n");
    for (const l of physical) expect(octets(l)).toBeLessThanOrEqual(75);
    const start = physical.findIndex((l) => l.startsWith("SUMMARY:"));
    expect(physical[start]).toBe(`SUMMARY:${"a".repeat(66)}`);
    expect(physical[start + 1]?.startsWith(" é")).toBe(true);
    expect(text.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}\r\n`);
  });

  it("gives the same bytes for the same input, whatever order the items come in", () => {
    const other: IcsItem = { ...base, id: "texas-notice-2026-03-17", title: "Texas notice", rule: null, basis: "first sale + 15 days", note: "A note" };
    expect(toIcs([base, other], opts)).toBe(toIcs([other, base], opts));
    expect(toIcs([base, other], opts)).toBe(toIcs([base, other], { ...opts }));
  });
});

describe("the firm folder", () => {
  it("walks from an empty calendar to an exported file, shows in status and passes its check", () => {
    const ctx = makeCtx();
    act(ctx, "firm.init", { name: "Example Sponsor LLC" });
    expect(act<ListResult>(ctx, "deadline.list").count).toBe(0);
    expect(act<{ deadlines: { open: number } }>(ctx, "firm.status").deadlines.open).toBe(0);

    const computed = act<ComputeResult>(ctx, "deadline.compute", { firstSaleDate: "2026-03-02", firstTexasSaleDate: "2026-03-02" });
    expect(computed.added.map((d) => d.id)).toEqual(["form-d-2026-03-17", "texas-notice-2026-03-17"]);
    act(ctx, "deadline.add", { title: "Renew the registered agent", due: "2026-12-01" });
    act(ctx, "deadline.done", { id: "form-d-2026-03-17", note: "Filed" });
    act(ctx, "deadline.dismiss", { id: "texas-notice-2026-03-17", note: "No Texas investors" }, { by: "Alex Example" });

    const shown = act<MoveResult>(ctx, "deadline.show", { id: "renew-the-registered-agent-2026-12-01" });
    expect(shown.deadline.state).toBe("due-soon");

    const status = act<{ deadlines: { open: number; overdue: number; dueSoon: number; next: { id: string; daysLeft: number }[] } }>(ctx, "firm.status");
    expect(status.deadlines).toEqual({
      open: 1,
      overdue: 0,
      dueSoon: 1,
      next: [{ id: "renew-the-registered-agent-2026-12-01", title: "Renew the registered agent", due: "2026-12-01", daysLeft: 19, state: "due-soon" }],
    });
    roundTrips(status);

    const exported = act<{ path: string; events: number }>(ctx, "deadline.export", { status: "all" });
    expect(exported.events).toBe(3);
    const ics = fs.readFileSync(exported.path, "utf8");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("SUMMARY:Dismissed: Texas notice filing due");
    expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);

    // A rule id written into calendar.json by hand is caught by the check.
    const calendar = ctx.store.read("calendar.json", firmCalendar);
    calendar.items[0] = { ...calendar.items[0]!, rule: "us-fed.no-such-rule" };
    calendar.items.push({ ...calendar.items[1]!, status: "done", closedOn: null });
    fs.writeFileSync(ctx.store.file("calendar.json"), JSON.stringify(calendar));
    const problems = problemsOf(() => act(ctx, "firm.check"));
    expect(problems).toContain('calendar.json › form-d-2026-03-17: no rule "us-fed.no-such-rule" in the catalog');
    expect(problems).toContain("calendar.json › texas-notice-2026-03-17: the id is used by more than one deadline");
    expect(problems).toContain("calendar.json › texas-notice-2026-03-17: done but has no closedOn date");
  });
});
