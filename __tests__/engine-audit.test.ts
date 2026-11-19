import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/engine/index";
import { act, book, corpusWith, exampleFirm, realCorpus, refusal, step } from "./helpers/engine";

// Audit a firm, against synthetic audit playbooks so catalog text can change freely.

const PERSON = "Alex Example";
const ruleCard = realCorpus().rules[0];

// status (public record) -> on-file (agent) -> bank (human, no role)
//                        -> agreement (human, counsel)
// series applies to funds only, so the example firm (a syndication) never sees it.
const sample = book(
  "audit-sample",
  [
    step("status", { title: "Confirm the entity's status", approval: "standing", risk: "high", sources: ["state-records"], rules: ruleCard ? [ruleCard.id] : [] }),
    step("on-file", { title: "Match the name on file", after: ["status"], risk: "medium" }),
    step("agreement", { title: "Confirm the company agreement", mode: "human-offline", actor: "counsel", after: ["status"], risk: "medium" }),
    step("series", { title: "Check each series", after: ["status"], when: { structure: ["fund"] } }),
    step("bank", { title: "Check the bank accounts", mode: "human-online", after: ["on-file", "series"] }),
  ],
  {
    kind: "audit",
    title: "Synthetic entity audit",
    sources: [{ id: "state-records", url: "https://example.com/records", title: "Example state business records", publisher: "Example State", accessed: "2026-11-11", tier: "primary" }],
  },
);
const outline = book("audit-outline", [], { kind: "audit", depth: "outline", outlineSteps: ["A check still to be written"] });
const notAudit = book("process-sample", [step("one")]);

const firm = () => exampleFirm({ corpus: corpusWith(sample, outline, notAudit) });

type Score = { checks: number; clear: number; finding: number; unverified: number; unchecked: number; notApplicable: number; openFindings: { high: number; medium: number; low: number; total: number }; line: string };
type Finding = { id: string; check: string; severity: string; owner: string; status: string; closedOn: string | null; due: string | null };
type Recorded = { check: { outcome: string; evidence: string | null }; finding: Finding | null; score: Score; next: string[] };

const open = (ctx: Ctx) => act<{ audit: { id: string } }>(ctx, "audit.open", { playbook: "audit-sample" }).audit.id;
const rec = (ctx: Ctx, check: string, args: Record<string, unknown>, by?: string) => act<Recorded>(ctx, "audit.record", { check, ...args }, by ? { by } : {});
const score = (ctx: Ctx) => act<Score>(ctx, "audit.score");

function problemsOf(run: () => unknown): string[] {
  try {
    run();
    return [];
  } catch (err) {
    return ((err as { details?: { problems?: string[] } }).details?.problems ?? []) as string[];
  }
}

describe("audit.open", () => {
  it("refuses an outline, a playbook that is not an audit, and a second open audit of the same playbook", () => {
    const ctx = firm();
    expect(refusal(() => act(ctx, "audit.open", { playbook: "audit-outline" }))).toBe("guard-failed");
    expect(refusal(() => act(ctx, "audit.open", { playbook: "process-sample" }))).toBe("not-found");
    expect(refusal(() => act(ctx, "audit.open", { playbook: "no-such-audit" }))).toBe("not-found");
    expect(open(ctx)).toBe("audit-sample-2026-11-12");
    expect(refusal(() => act(ctx, "audit.open", { playbook: "audit-sample" }))).toBe("already-exists");
  });

  it("says the outline is listed but not written yet", () => {
    const ctx = firm();
    try {
      act(ctx, "audit.open", { playbook: "audit-outline" });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toMatch(/listed but not written yet/);
      expect((err as { details: { guard: string } }).details.guard).toBe("playbook-is-written");
    }
  });

  it("refuses to work with no audit, and names the command to open one", () => {
    const ctx = firm();
    try {
      act(ctx, "audit.next");
      expect.unreachable();
    } catch (err) {
      expect((err as { code: string }).code).toBe("not-found");
      expect((err as Error).message).toContain("pcre audit open");
    }
  });
});

describe("recording checks", () => {
  it("next follows dependencies and leaves out checks that do not apply", () => {
    const ctx = firm();
    open(ctx);
    const ids = () => act<{ items: { id: string }[] }>(ctx, "audit.next").items.map((i) => i.id);
    expect(ids()).toEqual(["status"]);
    expect(refusal(() => rec(ctx, "on-file", { outcome: "clear", evidence: "x" }))).toBe("guard-failed");
    expect(refusal(() => rec(ctx, "series", { outcome: "clear", evidence: "x" }))).toBe("not-found");
    act(ctx, "audit.approve-lookups", {}, { by: PERSON });
    rec(ctx, "status", { outcome: "clear", evidence: "state records, read 2026-11-12" });
    expect(ids()).toEqual(["on-file", "agreement"]);
    const next = act<{ items: { id: string; canAgentVerify: boolean; command: string; sources: { url: string }[] }[] }>(ctx, "audit.next").items;
    expect(next[1]).toMatchObject({ id: "agreement", canAgentVerify: false });
    expect(next[1]?.command).toContain('--by "<name>"');
  });

  it("an agent records a public-record check only after a person approves lookups; a person needs no approval", () => {
    const ctx = firm();
    open(ctx);
    expect(refusal(() => rec(ctx, "status", { outcome: "clear", evidence: "state records" }))).toBe("guard-failed");
    expect(refusal(() => rec(ctx, "status", { outcome: "finding", title: "Status not shown" }))).toBe("guard-failed");
    expect(refusal(() => act(ctx, "audit.approve-lookups"))).toBe("person-required");
    act(ctx, "audit.approve-lookups", {}, { by: PERSON });
    expect(refusal(() => act(ctx, "audit.approve-lookups", {}, { by: PERSON }))).toBe("already-exists");
    expect(rec(ctx, "status", { outcome: "clear", evidence: "state records" }).check.outcome).toBe("clear");
    expect(act<{ lookupsApprovedBy: string }>(ctx, "audit.show").lookupsApprovedBy).toBe(PERSON);

    const other = firm();
    open(other);
    expect(rec(other, "status", { outcome: "clear", evidence: "state records" }, PERSON).check.outcome).toBe("clear");
  });

  it("an agent cannot record a human check as clear, but can record it unverified; a person records it clear", () => {
    const ctx = firm();
    open(ctx);
    rec(ctx, "status", { outcome: "clear", evidence: "state records" }, PERSON);
    expect(refusal(() => rec(ctx, "agreement", { outcome: "clear", evidence: "signed copy" }))).toBe("guard-failed");
    expect(rec(ctx, "agreement", { outcome: "unverified", note: "No signed copy was found in the folder" }).check.outcome).toBe("unverified");
    expect(rec(ctx, "agreement", { outcome: "clear", evidence: "agreements/company-agreement.pdf" }, PERSON).check.outcome).toBe("clear");
  });

  it("clear needs evidence; unverified and not-applicable need a note", () => {
    const ctx = firm();
    open(ctx);
    expect(refusal(() => rec(ctx, "status", { outcome: "clear" }, PERSON))).toBe("evidence-required");
    expect(refusal(() => rec(ctx, "status", { outcome: "unverified" }))).toBe("note-required");
    expect(refusal(() => rec(ctx, "status", { outcome: "not-applicable" }))).toBe("note-required");
    expect(refusal(() => rec(ctx, "status", { outcome: "finding" }, PERSON))).toBe("title-required");
    expect(rec(ctx, "status", { outcome: "not-applicable", note: "Not formed in a state with a public record" }).check.outcome).toBe("not-applicable");
  });

  it("a finding takes its severity and owner from its step, and explicit ones win", () => {
    const ctx = firm();
    open(ctx);
    const f1 = rec(ctx, "status", { outcome: "finding", title: "Status shows forfeited" }, PERSON).finding;
    expect(f1).toMatchObject({ id: "f-1", check: "status", severity: "high", owner: "principal", status: "open", due: null });
    const f2 = rec(ctx, "agreement", { outcome: "finding", title: "Agreement is unsigned" }).finding;
    expect(f2).toMatchObject({ id: "f-2", severity: "medium", owner: "counsel" });
    const f3 = act<{ finding: Finding }>(ctx, "finding.add", { check: "agreement", title: "Agreement names a former member", severity: "low", owner: "cpa", due: "2026-12-01" }).finding;
    expect(f3).toMatchObject({ id: "f-3", check: "agreement", severity: "low", owner: "cpa", due: "2026-12-01" });
    expect(refusal(() => act(ctx, "finding.add", { check: "on-file", title: "Something" }))).toBe("wrong-state");
    expect(refusal(() => rec(ctx, "agreement", { outcome: "finding", title: "Again" }))).toBe("transition-refused");
    const listed = act<{ count: number; items: { checkTitle: string; audit: string }[] }>(ctx, "finding.list", { owner: "counsel" });
    expect(listed.count).toBe(1);
    expect(listed.items[0]).toMatchObject({ checkTitle: "Confirm the company agreement", audit: "audit-sample-2026-11-12" });
  });

  it("a check with an open finding is not recorded clear until the finding is fixed or accepted, and accepting is a person's", () => {
    const ctx = firm();
    open(ctx);
    rec(ctx, "status", { outcome: "finding", title: "Status shows forfeited" }, PERSON);
    expect(refusal(() => rec(ctx, "status", { outcome: "clear", evidence: "x" }, PERSON))).toBe("guard-failed");
    expect(refusal(() => rec(ctx, "status", { outcome: "unverified", note: "x" }))).toBe("guard-failed");
    expect(refusal(() => act(ctx, "finding.accept", { id: "f-1", note: "We will live with it" }))).toBe("person-required");
    expect(refusal(() => act(ctx, "finding.fix", { id: "f-1" }))).toBe("invalid-input");
    const fixed = act<{ finding: Finding }>(ctx, "finding.fix", { id: "f-1", note: "Reinstatement filed, see filings/reinstatement.pdf" }).finding;
    expect(fixed).toMatchObject({ status: "fixed", closedOn: "2026-11-12" });
    const again = act<{ finding: Finding }>(ctx, "finding.reopen", { id: "f-1", note: "The state has not posted it yet" }).finding;
    expect(again).toMatchObject({ status: "open", closedOn: null });
    act(ctx, "finding.accept", { id: "f-1", note: "Accepted until the state posts it" }, { by: PERSON });
    expect(rec(ctx, "status", { outcome: "clear", evidence: "state records, read 2026-11-20" }, PERSON).check.outcome).toBe("clear");
  });
});

describe("the score", () => {
  it("counts from the records, and unverified never counts as clear", () => {
    const ctx = firm();
    open(ctx);
    expect(score(ctx)).toMatchObject({ checks: 4, clear: 0, unchecked: 4, line: "0 of 4 checks clear · 4 not checked yet" });
    rec(ctx, "status", { outcome: "clear", evidence: "state records" }, PERSON);
    rec(ctx, "agreement", { outcome: "unverified", note: "No signed copy found" });
    expect(score(ctx)).toMatchObject({ clear: 1, unverified: 1, unchecked: 2, line: "1 of 4 checks clear · 1 unverified · 2 not checked yet" });
    rec(ctx, "on-file", { outcome: "finding", title: "Name differs at the bank", severity: "low" });
    rec(ctx, "bank", { outcome: "not-applicable", note: "The firm has no bank account yet" });
    const s = score(ctx);
    expect(s).toMatchObject({ checks: 3, clear: 1, finding: 1, unverified: 1, unchecked: 0, notApplicable: 1, openFindings: { high: 0, medium: 0, low: 1, total: 1 } });
    expect(s.line).toBe("1 of 3 checks clear · 1 finding · 1 unverified");
  });
});

describe("a full audit", () => {
  it("walks from open to closed, writes its report, shows in status, passes the firm check, and reopens", () => {
    const ctx = firm();
    const id = open(ctx);
    act(ctx, "audit.approve-lookups", {}, { by: PERSON });
    rec(ctx, "status", { outcome: "clear", evidence: "state records, read 2026-11-12" });
    rec(ctx, "on-file", { outcome: "finding", title: "Name differs at the bank", detail: "The bank lists an earlier name.", due: "2026-12-15" });
    rec(ctx, "agreement", { outcome: "finding", title: "Agreement is unsigned" });
    expect(refusal(() => act(ctx, "audit.close"))).toBe("guard-failed");
    expect(act<{ complete: boolean }>(ctx, "audit.next").complete).toBe(false);
    rec(ctx, "bank", { outcome: "unverified", note: "Statements were not shared" });
    expect(act<{ complete: boolean; count: number }>(ctx, "audit.next")).toMatchObject({ complete: true, count: 0 });

    const report = act<{ files: { kind: string; owner: string | null; path: string }[]; sheets: number }>(ctx, "audit.report");
    expect(report.files.map((f) => path.basename(f.path)).sort()).toEqual(["findings.md", "sheet-counsel.md", "sheet-principal.md"]);
    const findings = fs.readFileSync(ctx.store.file(`audit/${id}/findings.md`), "utf8");
    expect(findings).toContain("Synthetic entity audit");
    expect(findings).toContain("1 of 4 checks clear · 2 findings · 1 unverified");
    expect(findings).toContain("| f-1 | medium | Name differs at the bank | principal | 2026-12-15 | open |");
    expect(findings).toContain("https://example.com/records");
    expect(findings.trim().endsWith("Not legal, tax or investment advice. Each check lists its sources, or says it rests on common practice.")).toBe(true);
    const counsel = fs.readFileSync(ctx.store.file(`audit/${id}/sheet-counsel.md`), "utf8");
    expect(counsel).toContain("Agreement is unsigned");
    expect(counsel).not.toContain("Name differs at the bank");
    const principal = fs.readFileSync(ctx.store.file(`audit/${id}/sheet-principal.md`), "utf8");
    expect(principal).toContain("The bank lists an earlier name.");
    expect(principal).toContain("Due: 2026-12-15");
    expect(principal.trim().endsWith("Each check lists its sources, or says it rests on common practice.")).toBe(true);

    const closed = act<{ state: string; closedOn: string }>(ctx, "audit.close");
    expect(closed).toMatchObject({ state: "closed", closedOn: "2026-11-12" });
    expect(refusal(() => rec(ctx, "bank", { outcome: "clear", evidence: "x" }, PERSON))).toBe("audit-closed");
    expect(act<{ items: { state: string }[] }>(ctx, "audit.list").items[0]).toMatchObject({ state: "closed" });
    act(ctx, "finding.fix", { id: "f-2", note: "Signed copy at agreements/signed.pdf" });

    const status = act<{ audits: { open: number; closed: number; openFindings: { total: number }; latest: { id: string; line: string } } }>(ctx, "firm.status");
    expect(status.audits).toMatchObject({ open: 0, closed: 1, openFindings: { total: 1 }, latest: { id, line: "1 of 4 checks clear · 2 findings · 1 unverified" } });
    expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);

    expect(refusal(() => act(ctx, "audit.reopen", {}))).toBe("invalid-input");
    expect(act<{ state: string }>(ctx, "audit.reopen", { note: "Bank statements arrived" }).state).toBe("open");
    rec(ctx, "bank", { outcome: "clear", evidence: "statements/2026-10.pdf" }, PERSON);
    expect(score(ctx).line).toBe("2 of 4 checks clear · 2 findings");

    const log = act<{ events: { action: string; process: string | null; target: string | null }[] }>(ctx, "firm.log", { last: 100 }).events;
    expect(log.some((e) => e.process === "finding" && e.target === `${id}/f-1`)).toBe(true);
    expect(log.filter((e) => e.action === "audit.report")).toHaveLength(1);
  });

  it("numbers a second audit of the same day, once the first is closed", () => {
    const ctx = firm();
    open(ctx);
    for (const [c, by] of [["status", PERSON], ["on-file", undefined], ["agreement", PERSON], ["bank", PERSON]] as const) rec(ctx, c, { outcome: "clear", evidence: "on file" }, by);
    act(ctx, "audit.close");
    expect(open(ctx)).toBe("audit-sample-2026-11-12-2");
    expect(act<{ id: string }>(ctx, "audit.show").id).toBe("audit-sample-2026-11-12-2");
  });
});

describe("firm.check on audits", () => {
  it("reports a check id the playbook does not have, a stray finding and a duplicate finding id", () => {
    const ctx = firm();
    const id = open(ctx);
    const file = JSON.parse(fs.readFileSync(ctx.store.file("audits.json"), "utf8"));
    file.audits[0].checks["no-such-check"] = { outcome: "clear", date: "2026-11-12", by: "agent", evidence: "x", note: null };
    const f = { id: "f-1", check: "nowhere", title: "A finding", detail: null, severity: "low", owner: "principal", due: null, status: "open", closedOn: null, note: null };
    file.audits[0].findings = [f, { ...f, check: "status" }];
    fs.writeFileSync(ctx.store.file("audits.json"), JSON.stringify(file));
    const problems = problemsOf(() => act(ctx, "firm.check"));
    expect(problems).toContain(`audits.json › ${id} › no-such-check: no such check in audit-sample`);
    expect(problems.some((p) => p.includes('its check "nowhere"'))).toBe(true);
    expect(problems.some((p) => p.includes("used more than once"))).toBe(true);
  });

  it("reports an audit whose playbook is missing or not an audit", () => {
    const ctx = firm();
    open(ctx);
    const file = JSON.parse(fs.readFileSync(ctx.store.file("audits.json"), "utf8"));
    file.audits.push({ ...file.audits[0], id: "x-1", playbook: "process-sample" }, { ...file.audits[0], id: "x-2", playbook: "gone-audit" });
    fs.writeFileSync(ctx.store.file("audits.json"), JSON.stringify(file));
    const problems = problemsOf(() => act(ctx, "firm.check"));
    expect(problems.some((p) => p.includes("x-1") && p.includes("not an audit"))).toBe(true);
    expect(problems.some((p) => p.includes("x-2") && p.includes("no playbook"))).toBe(true);
    expect(act<{ items: { id: string; score: string | null }[] }>(ctx, "audit.list").items.find((a) => a.id === "x-2")?.score).toBeNull();
  });
});

describe("results", () => {
  it("are plain JSON that survives a round trip unchanged", () => {
    const ctx = firm();
    const results: unknown[] = [act(ctx, "audit.open", { playbook: "audit-sample" })];
    results.push(act(ctx, "audit.approve-lookups", {}, { by: PERSON }));
    results.push(rec(ctx, "status", { outcome: "finding", title: "Status shows forfeited" }));
    for (const name of ["audit.list", "audit.show", "audit.next", "audit.score", "finding.list", "audit.report", "firm.status"]) results.push(act(ctx, name));
    results.push(act(ctx, "finding.list", { all: true, status: "open" }));
    for (const r of results) expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("have a readable text form for every audit and finding action", async () => {
    const { ACTIONS } = await import("@/lib/engine/index");
    for (const a of ACTIONS.filter((x) => x.name.startsWith("audit.") || x.name.startsWith("finding."))) expect(a.text, a.name).toBeTypeOf("function");
  });
});
