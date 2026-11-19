import { getDemoRun } from "@/lib/demo/load";
import { parseCalendar, parseFindings, parseSheet, type CalendarEvent, type ParsedFindings, type ParsedSheet } from "@/lib/demo/findings";
import type { DemoRun, DemoScene, DemoStep } from "@/lib/schemas/demo";

// The recorded run, read once and parsed into the documents the run page draws.
// Server only: getDemoRun() reads content/demo/run.json from disk. Every value
// here comes from the recording; nothing is typed in.

export type RunDocument =
  | { kind: "findings"; path: string; doc: ParsedFindings }
  | { kind: "sheet"; path: string; doc: ParsedSheet }
  | { kind: "calendar"; path: string; doc: RecordedCalendar };

// The calendar as recorded: the events in calendar.ics, and `written`, how many
// the engine said it wrote ("Wrote 3 events to ..."), or null when no step says so.
// The recording keeps the whole file, so every event is here. It is read as a
// possible excerpt all the same: a cut-off file (an older recording) still
// draws, with CalendarSheet's dashed row for the events it does not hold,
// instead of failing the page. __tests__/findings.test.ts parses it strictly.
export type RecordedCalendar = { events: CalendarEvent[]; written: number | null };

export type RecordedAudit = {
  recordedOn: string;
  firm: string;
  scene: DemoScene;
  findings: ParsedFindings;
  sheets: ParsedSheet[];
};

export function sceneDocuments(scene: DemoScene): RunDocument[] {
  const docs: RunDocument[] = [];
  for (const file of scene.files) {
    const name = file.path.split("/").at(-1) ?? file.path;
    if (name === "findings.md") docs.push({ kind: "findings", path: file.path, doc: parseFindings(file.text) });
    else if (/^sheet-[a-z-]+\.md$/.test(name)) docs.push({ kind: "sheet", path: file.path, doc: parseSheet(file.text) });
    else if (name.endsWith(".ics")) docs.push({ kind: "calendar", path: file.path, doc: { events: parseCalendar(file.text, { excerpt: true }), written: eventsWritten(scene.steps) } });
  }
  return docs;
}

function eventsWritten(steps: DemoStep[]): number | null {
  for (const s of steps) {
    const m = /^Wrote (\d+) events? to /m.exec(s.output);
    if (m) return Number(m[1]);
  }
  return null;
}

// The last audit in the recording that wrote a findings file (the finished audit),
// already parsed: the findings report and one sheet per person with an open finding.
// For the home page and the audit page.
export function getRecordedAudit(): RecordedAudit {
  const run = getDemoRun();
  for (const scene of [...run.scenes].reverse()) {
    const docs = sceneDocuments(scene);
    const findings = docs.find((d) => d.kind === "findings");
    if (findings && findings.kind === "findings") {
      const sheets = docs.flatMap((d) => (d.kind === "sheet" ? [d.doc] : []));
      return { recordedOn: run.recordedOn, firm: run.firm, scene, findings: findings.doc, sheets };
    }
  }
  throw new Error("The recorded run holds no audit findings file. Regenerate it with \"npm run demo:record\".");
}

// The recording's calendar file, parsed, with the count the engine said it wrote.
export function getRecordedCalendar(): RecordedCalendar | null {
  for (const scene of getDemoRun().scenes) {
    const cal = sceneDocuments(scene).find((d) => d.kind === "calendar");
    if (cal && cal.kind === "calendar") return cal.doc;
  }
  return null;
}

export type RunTotals = { scenes: number; commands: number; refused: number; byPeople: number; files: number };

export function runTotals(run: DemoRun): RunTotals {
  const steps = run.scenes.flatMap((s) => s.steps);
  return {
    scenes: run.scenes.length,
    commands: steps.length,
    refused: steps.filter((s) => s.exit === 1).length,
    byPeople: steps.filter((s) => s.by !== null).length,
    files: run.scenes.reduce((n, s) => n + s.files.length, 0),
  };
}
