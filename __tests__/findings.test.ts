import { describe, expect, it } from "vitest";
import { parseCalendar, parseFindings, parseSheet, type ParsedFindings } from "@/lib/demo/findings";
import { getDemoRun } from "@/lib/demo/load";
import type { DemoScene } from "@/lib/schemas/demo";

// The parsers read the files the engine writes, so the site can draw them.
// They run here against the real recording (content/demo/run.json); a change
// in the engine's format makes them throw, and these tests fail.

const run = getDemoRun();

function scene(id: string): DemoScene {
  const found = run.scenes.find((s) => s.id === id);
  if (!found) throw new Error(`the recording has no scene "${id}"`);
  return found;
}

function file(id: string, suffix: string): string {
  const found = scene(id).files.find((f) => f.path.endsWith(suffix));
  if (!found) throw new Error(`scene "${id}" has no file ending in "${suffix}"`);
  return found.text;
}

const outcomes = (p: ParsedFindings) => p.checks.map((c) => c.outcome);
const countOf = (p: ParsedFindings, o: string) => p.checks.filter((c) => c.outcome === o).length;

describe("parseFindings on the finished audit", () => {
  const parsed = parseFindings(file("audit-finished", "/findings.md"));

  it("reads the header", () => {
    expect(parsed.title).toBe("Audit the entity's standing");
    expect(parsed.auditId).toMatch(/^audit-entity-standing-\d{4}-\d{2}-\d{2}$/);
    expect(parsed.firm).toBe(run.firm);
    expect(parsed.subject).toBeNull();
    expect(parsed.opened).toBe(run.recordedOn);
    expect(parsed.written).toBe(run.recordedOn);
    expect(["still open", `closed ${run.recordedOn}`]).toContain(parsed.stateNote);
  });

  it("parses 11 checks: 7 clear, 3 findings, 1 unverified, none left unchecked", () => {
    expect(parsed.checks).toHaveLength(11);
    expect(parsed.checks.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(countOf(parsed, "clear")).toBe(7);
    expect(countOf(parsed, "finding")).toBe(3);
    expect(countOf(parsed, "unverified")).toBe(1);
    expect(countOf(parsed, "not-checked")).toBe(0);
    expect(parsed.score).toMatchObject({ clear: 7, findings: 3, unverified: 1, notChecked: 0, notApplicable: 0, total: 11 });
    expect(parsed.score.line).toBe("7 of 11 checks clear · 3 findings · 1 unverified");
  });

  it("keeps who recorded each check, its evidence, its note and its sources", () => {
    for (const c of parsed.checks) {
      expect(c.date, c.id).toBe(run.recordedOn);
      expect(c.by, c.id).not.toBeNull();
      if (c.outcome === "clear") expect(c.evidence, c.id).not.toBeNull();
      for (const s of c.sources) expect(s.url, c.id).toMatch(/^https:\/\//);
    }
    const unverified = parsed.checks.find((c) => c.outcome === "unverified");
    expect(unverified?.note).toMatch(/^Made-up example: /);
    expect(unverified?.evidence).toBeNull();
    expect(parsed.checks.filter((c) => c.sources.length === 0)).toHaveLength(1);
    expect(parsed.checks.every((c) => c.ruleCards.length === 0)).toBe(true);
    // A source title can hold parentheses and colons; it is read whole.
    expect(parsed.checks[0]?.sources.some((s) => s.title.startsWith("CPA API Documentation (") && s.title.endsWith("officers)"))).toBe(true);
  });

  it("reads the findings table: f-1 fixed, and two open findings owned by cpa and counsel", () => {
    expect(parsed.findings.map((f) => [f.id, f.status, f.owner])).toEqual([
      ["f-1", "fixed", "principal"],
      ["f-2", "open", "cpa"],
      ["f-3", "open", "counsel"],
    ]);
    expect(parsed.findings[0]?.due).toBeNull();
    for (const f of parsed.findings.slice(1)) expect(f.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads the footer", () => {
    expect(parsed.footer).toBe("Not legal, tax or investment advice. Each check lists its sources, or says it rests on common practice.");
  });
});

describe("parseFindings on the unfinished audit", () => {
  const parsed = parseFindings(file("audit", "/findings.md"));

  it("parses 1 clear, 1 finding and 9 not checked", () => {
    expect(parsed.checks).toHaveLength(11);
    expect(countOf(parsed, "clear")).toBe(1);
    expect(countOf(parsed, "finding")).toBe(1);
    expect(countOf(parsed, "not-checked")).toBe(9);
    expect(parsed.score).toMatchObject({ clear: 1, findings: 1, unverified: 0, notChecked: 9, total: 11 });
    for (const c of parsed.checks.filter((x) => x.outcome === "not-checked")) {
      expect([c.date, c.by, c.evidence, c.note]).toEqual([null, null, null, null]);
    }
    expect(parsed.findings.map((f) => [f.id, f.status])).toEqual([["f-1", "open"]]);
    expect(parsed.stateNote).toBe("still open");
    expect(outcomes(parsed)[0]).toBe("clear");
  });
});

describe("parseSheet", () => {
  const finished = parseFindings(file("audit-finished", "/findings.md"));
  const sheets = scene("audit-finished").files.filter((f) => /\/sheet-[a-z]+\.md$/.test(f.path));

  it("finds a sheet for each owner with an open finding", () => {
    const owners = [...new Set(finished.findings.filter((f) => f.status === "open").map((f) => f.owner))].sort();
    expect(sheets.map((s) => parseSheet(s.text).owner).sort()).toEqual(owners);
  });

  it("lists the open finding for its owner, with everything the writer prints", () => {
    for (const s of sheets) {
      const sheet = parseSheet(s.text);
      expect(s.path).toBe(`audit/${finished.auditId}/sheet-${sheet.owner}.md`);
      expect(sheet.auditId).toBe(finished.auditId);
      expect(sheet.playbookTitle).toBe(finished.title);
      expect(sheet.firm).toBe(run.firm);
      expect(sheet.written).toBe(run.recordedOn);
      const mine = finished.findings.filter((f) => f.status === "open" && f.owner === sheet.owner);
      expect(sheet.findings.map((f) => f.id)).toEqual(mine.map((f) => f.id));
      for (const f of sheet.findings) {
        const row = finished.findings.find((r) => r.id === f.id);
        expect(f.title).toBe(row?.what);
        expect(f.severity).toBe(row?.severity);
        expect(f.due).toBe(row?.due);
        expect(f.found).toMatch(/^Made-up example: /);
        // The check it came from is in the findings file, as a finding, with the same sources.
        const check = finished.checks.find((c) => c.id === f.check.id);
        expect(check?.outcome).toBe("finding");
        expect(f.check.title).toBe(check?.title);
        expect(f.sources).toEqual(check?.sources);
        expect(f.sources.length).toBeGreaterThan(0);
      }
      expect(sheet.footer).toBe(finished.footer);
    }
  });
});

describe("parseCalendar", () => {
  const deadlines = scene("deadlines");
  const listed = deadlines.steps.find((s) => s.command === "pcre deadline list")?.output ?? "";
  const printedDates = [...listed.matchAll(/^(\d{4}-\d{2}-\d{2}) {2}/gm)].map((m) => m[1]);
  // The recording keeps the whole calendar.ics the engine wrote.
  const recorded = file("deadlines", "calendar.ics");

  it("the deadlines scene printed three dates, and said it wrote three events", () => {
    expect(deadlines.steps[0]?.command).toMatch(/^pcre deadline compute /);
    expect(printedDates).toHaveLength(3);
    const exported = deadlines.steps.find((s) => s.command === "pcre deadline export")?.output ?? "";
    expect(exported).toMatch(/^Wrote 3 events to /m);
  });

  it("the recorded calendar file is whole, and yields the three dates the deadlines scene printed", () => {
    expect(recorded).toMatch(/^BEGIN:VCALENDAR\n/);
    expect(recorded).toMatch(/\nEND:VCALENDAR\n$/);
    const events = parseCalendar(recorded);
    expect(events.map((e) => e.date)).toEqual(printedDates);
    for (const e of events) {
      expect(e.uid).toBe(`texas-franchise-report-${e.date}@promptedcre`);
      expect(e.summary).toMatch(/^Texas franchise tax report and Public Information Report due \(\d{4}\)$/);
      expect(listed).toContain(`${e.date}  `);
      expect(listed).toContain(e.summary);
    }
  });

  it("unfolds folded lines and unescapes text", () => {
    const first = parseCalendar(recorded)[0];
    expect(first?.description).toContain("weekends and holidays, and extensions)\nHow the date was worked out: May 15, 2027; moved from");
    expect(first?.description?.split("\n").at(-1)).toBe("Check this date before relying on it.");
    expect(first?.description).not.toMatch(/\\[,;n\\]/);
  });

  it("reads an excerpt only when asked, leaving out the event cut off before its end", () => {
    const excerpt = `${recorded.split("\n").slice(0, 30).join("\n")}\n`;
    expect(() => parseCalendar(excerpt)).toThrow(/calendar line \d+: expected "END:VEVENT"/);
    const events = parseCalendar(excerpt, { excerpt: true });
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThan(printedDates.length);
    expect(events).toEqual(parseCalendar(recorded).slice(0, events.length));
  });
});

describe("malformed input throws, naming the line", () => {
  const findings = file("audit-finished", "/findings.md");
  const sheet = scene("audit-finished").files.find((f) => f.path.endsWith("/sheet-cpa.md"))?.text ?? "";
  const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x@promptedcre\r\nDTSTART;VALUE=DATE:20270517\r\nSUMMARY:A\\, b\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

  it("rejects a findings file whose score disagrees with its checks", () => {
    expect(() => parseFindings(findings.replace("7 of 11 checks clear", "8 of 11 checks clear"))).toThrow(/findings\.md line 5: .*clear: the checks give 7, the score line says 8/);
    expect(() => parseFindings(findings.replace(" · 1 unverified", ""))).toThrow(/line 5: .*unverified/);
  });

  it("rejects a changed header, table row, check line or outcome", () => {
    expect(() => parseFindings(findings.replace("Audit audit-", "Audited audit-"))).toThrow(/findings\.md line 3: expected/);
    expect(() => parseFindings(findings.replace("| f-2 | high |", "| f-2 | severe |"))).toThrow(/findings\.md line 12: expected a severity/);
    expect(() => parseFindings(findings.replace("2. **Confirm the registered", "3. **Confirm the registered"))).toThrow(/expected check number 2/);
    expect(() => parseFindings(findings.replace("): unverified, ", "): unsure, "))).toThrow(/expected an outcome/);
    expect(() => parseFindings(findings.replace("   Sources: none listed", "   Source: none listed"))).toThrow(/findings\.md line \d+: expected/);
    expect(() => parseFindings(findings.replace(/\n$/, ""))).toThrow(/does not end with a newline/);
    expect(() => parseFindings("")).toThrow(/findings\.md/);
  });

  it("rejects a sheet with a wrong count, owner or link", () => {
    expect(() => parseSheet(sheet.replace("1 finding is", "2 findings are"))).toThrow(/sheet line 3: expected 2 finding\(s\)/);
    expect(() => parseSheet(sheet.replace("for the cpa", "for the auditor"))).toThrow(/sheet line 1: expected an owner/);
    expect(() => parseSheet(sheet.replace("- [Texas franchise tax: who", "- Texas franchise tax: who"))).toThrow(/sheet line \d+: expected "- \[title\]\(url\)"/);
    expect(() => parseSheet(sheet.replace("Due: 2026-12-15", "Due: soon"))).toThrow(/sheet line \d+: expected "Due:/);
  });

  it("reads a minimal calendar, and rejects broken ones", () => {
    expect(parseCalendar(ics)).toEqual([{ uid: "x@promptedcre", summary: "A, b", date: "2027-05-17", description: null }]);
    expect(() => parseCalendar(ics.replace("BEGIN:VCALENDAR", "BEGIN:CALENDAR"))).toThrow(/calendar line 1: expected "BEGIN:VCALENDAR"/);
    expect(() => parseCalendar(ics.replace(";VALUE=DATE:20270517", ":20270517T090000Z"))).toThrow(/calendar line 4: expected an all-day date/);
    expect(() => parseCalendar(ics.replace("SUMMARY:A\\, b", "SUMMARY:A\\x"))).toThrow(/calendar line 5: .*not a text escape/);
    expect(() => parseCalendar(ics.replace("SUMMARY:A\\, b\r\n", ""))).toThrow(/calendar line 2: .*no SUMMARY/);
    expect(() => parseCalendar(ics.replace("END:VCALENDAR\r\n", ""))).toThrow(/calendar line 6: expected "END:VCALENDAR"/);
    expect(() => parseCalendar(ics.replace("UID:", "UID"))).toThrow(/calendar line 3: expected "NAME/);
    expect(() => parseCalendar(` folded\r\n${ics}`)).toThrow(/calendar line 1: a folded continuation/);
  });
});
