import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { CalendarSheet } from "@/components/run/calendar-sheet";
import { sceneDocuments } from "@/components/run/data";
import { getDemoRun } from "@/lib/demo/load";
import { demoRun, type DemoRun } from "@/lib/schemas/demo";
import { recordDemo } from "@/tools/demo-run";

// The home page shows content/demo/run.json. It is real engine output: this
// records it again and fails when the engine no longer prints the same thing.
// After an intended change to the engine or the catalog: npm run demo:record

const committed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "demo", "run.json"), "utf8")) as unknown;
let fresh: DemoRun;

beforeAll(async () => {
  fresh = await recordDemo();
}, 120_000);

describe("the recorded demo", () => {
  it("matches the engine: recording it again gives the committed file (npm run demo:record to refresh)", () => {
    expect(fresh).toEqual(committed);
  });

  it("validates against its schema, and the loader reads it", () => {
    expect(demoRun.safeParse(committed).success).toBe(true);
    expect(getDemoRun()).toEqual(committed);
  });

  it("has its five scenes in order, each command typed the way a person would", () => {
    expect(fresh.scenes.map((s) => s.id)).toEqual(["run", "audit", "deadlines", "deal", "audit-finished"]);
    for (const scene of fresh.scenes) {
      for (const step of scene.steps) {
        expect(step.command.startsWith("pcre ")).toBe(true);
        expect(step.by === null).toBe(!step.command.includes("--by "));
        expect(step.output.length, step.command).toBeGreaterThan(0);
      }
    }
  });

  it("shows a refusal in the run, audit and deal scenes", () => {
    for (const id of ["run", "audit", "deal"]) {
      const scene = fresh.scenes.find((s) => s.id === id);
      expect(scene?.steps.some((s) => s.exit === 1), id).toBe(true);
    }
    expect(fresh.scenes.flatMap((s) => s.steps).every((s) => s.exit === 0 || s.exit === 1)).toBe(true);
  });

  it("finishes the audit: every check answered, closed, and a sheet for more than one owner", () => {
    const scene = fresh.scenes.find((s) => s.id === "audit-finished");
    expect(scene).toBeDefined();
    if (!scene) return;
    expect(scene.steps.every((s) => s.exit === 0)).toBe(true);
    expect(scene.steps.at(-1)?.command).toBe("pcre audit close");
    const findings = scene.files.find((f) => f.path.endsWith("/findings.md"));
    expect(findings?.text).toBeDefined();
    expect(findings?.text).not.toContain("not checked yet");
    expect(findings?.text).toMatch(/: unverified, /);
    const sheets = scene.files.filter((f) => /\/sheet-[a-z]+\.md$/.test(f.path));
    expect(sheets.length).toBeGreaterThan(1);
    const report = scene.steps.find((s) => s.command === "pcre audit report");
    for (const file of scene.files) expect(report?.output).toContain(`firm/${file.path}`);
  });

  it("keeps the whole calendar file the deadlines scene exported, one event per date it printed", () => {
    const scene = fresh.scenes.find((s) => s.id === "deadlines");
    const ics = scene?.files.find((f) => f.path === "calendar.ics")?.text ?? "";
    const listed = scene?.steps.find((s) => s.command === "pcre deadline list")?.output ?? "";
    const dates = [...listed.matchAll(/^(\d{4}-\d{2}-\d{2}) {2}/gm)].map((m) => m[1]);
    expect(dates).toHaveLength(3);
    expect(ics.startsWith("BEGIN:VCALENDAR\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\n")).toBe(true);
    expect(ics).not.toContain("\r");
    expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(dates.length);
    expect(ics.match(/^END:VEVENT$/gm)).toHaveLength(dates.length);
    for (const d of dates) expect(ics).toContain(`DTSTART;VALUE=DATE:${(d ?? "").replace(/-/g, "")}`);
  });

  it("the run page's calendar sheet draws every date, with no row for events left out", () => {
    const scene = getDemoRun().scenes.find((s) => s.id === "deadlines");
    if (!scene) throw new Error("no deadlines scene");
    const cal = sceneDocuments(scene).find((d) => d.kind === "calendar");
    if (!cal || cal.kind !== "calendar") throw new Error("no calendar document");
    expect(cal.doc.written).toBe(3);
    expect(cal.doc.events).toHaveLength(3);
    const html = renderToStaticMarkup(createElement(CalendarSheet, { events: cal.doc.events, written: cal.doc.written }));
    expect(html.match(/<time /g)).toHaveLength(3);
    for (const e of cal.doc.events) expect(html).toMatch(new RegExp(`datetime="${e.date}"`, "i"));
    expect(html).not.toContain("in the file the engine wrote");
    expect(html).not.toContain("In the recording");
  });

  it("never shows a drive path or the temp folder", () => {
    const tmp = os.tmpdir();
    const texts = fresh.scenes.flatMap((s) => [...s.steps.map((t) => t.output), ...s.files.map((f) => f.text), ...s.files.map((f) => f.path)]);
    for (const text of texts) {
      expect(text).not.toMatch(/\b[A-Za-z]:[\\/]/);
      expect(text).not.toContain(tmp);
      expect(text).not.toContain("pcre-demo-");
      expect(text).not.toMatch(/\/(?:tmp|Users|home)\//);
    }
  });
});
