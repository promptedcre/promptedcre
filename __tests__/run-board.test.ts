import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AuditPage from "@/app/audit/page";
import RunPage from "@/app/run/page";
import { CalendarSheet } from "@/components/run/calendar-sheet";
import { getRecordedAudit, getRecordedCalendar } from "@/components/run/data";
import { ownerPhrase } from "@/components/run/doc-parts";
import { FindingsReport, ScoreFigure, scoreArithmetic } from "@/components/run/findings-report";
import { OwnerSheet } from "@/components/run/owner-sheet";
import { RunBoard, RunBoardCompact } from "@/components/run/run-board";
import { RunStyles } from "@/components/run/run-styles";
import { getCorpus } from "@/lib/content/load";
import { boardItems, buildBoard, type BoardRow } from "@/lib/demo/board";
import { getDemoRun } from "@/lib/demo/load";
import type { Playbook } from "@/lib/schemas/playbook";
import { site } from "@/lib/site";

// The board on /run and the home cover reads the recorded run in plain words.
// Every title that names a step or a check is that step's own title in the
// catalog, so a renamed step fails here instead of drawing a blank row.

const run = getDemoRun();
const playbooks = getCorpus().playbooks;
const board = buildBoard(run, playbooks);
const rows = board.flatMap((s) => s.rows);
const row = (scene: string, n: number): BoardRow => {
  const r = board.find((s) => s.id === scene)?.rows[n - 1];
  if (!r) throw new Error(`no row ${scene} ${n}`);
  return r;
};

// The step and check ids a recorded command names, with the playbook they belong to.
function namedIds(): { slug: string; id: string; command: string }[] {
  const out: { slug: string; id: string; command: string }[] = [];
  let audit = "";
  const opened = new Map<string, string>();
  for (const scene of run.scenes) {
    for (const step of scene.steps) {
      const words = step.command.split(/\s+/);
      if (words[1] === "audit" && words[2] === "open") audit = words[3] ?? "";
      if (words[1] === "run" && words[2] === "done") out.push({ slug: words[3] ?? "", id: words[4] ?? "", command: step.command });
      if (words[1] === "audit" && words[2] === "record") out.push({ slug: audit, id: words[3] ?? "", command: step.command });
      if (words[1] === "finding" && words[2] === "fix") {
        const check = opened.get(words[3] ?? "");
        out.push({ slug: audit, id: check ?? "(never opened)", command: step.command });
      }
      const m = /^(\S+): finding\s+\(opened (f-\d+),/m.exec(step.output);
      if (m?.[1] && m[2]) opened.set(m[2], m[1]);
    }
  }
  return out;
}

describe("the run board", () => {
  it("makes one row of every recorded step, numbered in its scene", () => {
    expect(board.map((s) => s.id)).toEqual(run.scenes.map((s) => s.id));
    run.scenes.forEach((scene, i) => {
      const sceneRows = board[i]?.rows ?? [];
      expect(sceneRows).toHaveLength(scene.steps.length);
      sceneRows.forEach((r, j) => {
        const step = scene.steps[j];
        expect(r.n).toBe(j + 1);
        expect(r.command).toBe(step?.command);
        expect(r.output).toBe(step?.output);
        expect(r.caption).toBe(step?.caption);
        expect(r.lane).toBe(step?.by === null ? "agent" : "person");
        expect(r.title.length, r.command).toBeGreaterThan(3);
        expect(r.outcome.line.length, r.command).toBeGreaterThan(3);
      });
    });
    expect(new Set(rows.map((r) => r.anchor)).size).toBe(rows.length);
  });

  it("titles every named step and check with its own title in the catalog", () => {
    const named = namedIds();
    expect(named.length).toBeGreaterThan(10);
    for (const { slug, id, command } of named) {
      const pb = playbooks.find((p) => p.slug === slug);
      const step = pb?.steps.find((s) => s.id === id);
      expect(step, `${command} names ${slug}/${id}`).toBeDefined();
      const r = rows.find((x) => x.command === command);
      expect(r?.title, command).toBe(step?.title);
    }
    expect(row("run", 5).title).toBe("Set up Login.gov for each person who will file");
  });

  it("fails on a renamed step instead of drawing a blank row", () => {
    const renamed: Playbook[] = playbooks.map((p) =>
      p.slug === "file-form-d-and-state-notices" ? { ...p, steps: p.steps.map((s) => (s.id === "set-up-login-gov" ? { ...s, id: "set-up-login-gov-renamed" } : s)) } : p,
    );
    expect(() => buildBoard(run, renamed)).toThrow(/set-up-login-gov/);
    const noCheck: Playbook[] = playbooks.map((p) =>
      p.slug === "audit-entity-standing" ? { ...p, steps: p.steps.filter((s) => s.id !== "match-company-agreement") } : p,
    );
    expect(() => buildBoard(run, noCheck)).toThrow(/match-company-agreement/);
  });

  it("refuses exactly the steps the engine refused, each with a reason in words", () => {
    run.scenes.forEach((scene, i) => {
      const refused = (board[i]?.rows ?? []).filter((r) => r.outcome.kind === "refused").map((r) => r.n);
      const exit1 = scene.steps.flatMap((s, j) => (s.exit === 1 ? [j + 1] : []));
      expect(refused, scene.id).toEqual(exit1);
    });
    for (const r of rows) {
      if (r.outcome.kind === "refused") {
        expect(r.lane, r.command).toBe("agent");
        expect(r.reason, r.command).toBeTruthy();
      } else expect(r.reason).toBeNull();
    }
  });

  it("links each refusal to the row where a person picks it up", () => {
    expect(row("run", 5).then).toMatchObject({ scene: "run", n: 6, whoInSentence: "Alex Example", sameScene: true });
    expect(row("run", 6).picksUp).toMatchObject({ scene: "run", n: 5 });
    expect(row("audit", 3).then).toMatchObject({ scene: "audit", n: 4 });
    expect(row("audit", 7).then).toMatchObject({ scene: "audit-finished", n: 9, whoInSentence: "counsel", sameScene: false });
    expect(row("audit-finished", 9).who).toBe("Counsel");
    expect(row("audit-finished", 9).outcome.line).toBe("Recorded clear by counsel");
    expect(row("audit-finished", 9).picksUp).toMatchObject({ scene: "audit", n: 7 });
    // Nobody moved the deal on in the recording, so the refusal stands alone.
    expect(row("deal", 3).then).toBeNull();
    for (const r of rows) if (r.then) expect(rows.find((x) => x.anchor === r.then?.anchor)?.lane).toBe("person");
  });

  it("says what happened in the operator's words", () => {
    expect(row("run", 4).outcome).toEqual({ kind: "done", line: "Done, proof recorded" });
    expect(row("run", 4).path).toEqual({ label: "Proof", value: "drafts/bad-actor-questionnaires.pdf" });
    expect(row("run", 6).outcome.line).toBe("Done by Alex Example, proof recorded");
    expect(row("audit", 4).outcome).toEqual({ kind: "approved", line: "Approved by Alex Example, once for the whole audit" });
    expect(row("audit", 5).outcome).toEqual({ kind: "clear", line: "Recorded clear, with evidence" });
    expect(row("audit-finished", 3).outcome).toEqual({ kind: "finding", line: "Finding: the CPA to fix by 2026-12-15" });
    expect(row("audit-finished", 3).who).toBe("The CPA");
    expect(row("audit-finished", 6).outcome.line).toBe("Finding: counsel to fix by 2027-01-15");
    expect(row("audit-finished", 7).outcome.kind).toBe("unverified");
    expect(row("audit-finished", 12).title).toBe(row("audit", 6).title);
    expect(row("audit-finished", 12).outcome).toEqual({ kind: "fixed", line: "Finding fixed by Alex Example, proof recorded" });
    expect(row("audit-finished", 13).result).toBe("7 of 11 checks clear · 3 findings · 1 unverified");
    expect(row("deadlines", 3).path).toEqual({ label: "File", value: "firm/calendar.ics" });
  });

  it("draws every step on /run with its fold, and the refusals in the cloud", () => {
    for (const scene of run.scenes) {
      const html = renderToStaticMarkup(createElement(RunBoard, { scene: scene.id }));
      expect((html.match(/<details/g) ?? []).length, scene.id).toBe(scene.steps.length);
      expect((html.match(/class="rev-cloud/g) ?? []).length, scene.id).toBe(scene.steps.filter((s) => s.exit === 1).length);
      for (let n = 1; n <= scene.steps.length; n++) expect(html).toContain(`id="${scene.id}-step-${n}"`);
    }
  });

  it("marks the board as a sequence a person starts: every recorded step takes its turn, and nothing plays by itself", () => {
    run.scenes.forEach((scene, i) => {
      const html = renderToStaticMarkup(createElement(RunBoard, { scene: scene.id }));
      const count = (re: RegExp) => (html.match(re) ?? []).length;
      const sceneRows = board[i]?.rows ?? [];
      const refused = sceneRows.filter((r) => r.outcome.kind === "refused");
      // Started only from its control: the markup is the finished board, and no script pencils it first.
      expect(html, scene.id).toContain('data-seq="scene" data-seq-start="user"');
      expect(html, scene.id).not.toContain("<script");
      // One step per recorded row; a refused row is two: what the agent tried, then the refusal that draws the cloud.
      expect(count(/data-seq-step="read"/g), scene.id).toBe(sceneRows.filter((r) => r.read).length);
      expect(count(/data-seq-step="row"/g), scene.id).toBe(sceneRows.filter((r) => !r.read && r.outcome.kind !== "refused").length);
      expect(count(/data-seq-step="tried"/g), scene.id).toBe(refused.length);
      expect(count(/data-seq-step="refused" data-seq-draws="around"/g), scene.id).toBe(refused.length);
      // The connector is drawn only where a person's row picks the refusal up straight after it.
      expect(count(/data-seq-step="then"/g), scene.id).toBe(refused.filter((r) => r.then?.sameScene && r.then.n === r.n + 1).length);
    });
  });

  it("says whose step a row is with the lane's mark and word, on every piece of work", () => {
    run.scenes.forEach((scene, i) => {
      const html = renderToStaticMarkup(createElement(RunBoard, { scene: scene.id }));
      const work = (board[i]?.rows ?? []).filter((r) => !r.read);
      // One tag per piece of work, and one over each lane.
      expect((html.match(/class="lane-tag"/g) ?? []).length, scene.id).toBe(work.length + 2);
      for (const r of work) expect(html, `${scene.id} ${r.n}`).toContain(r.who);
    });
    expect(renderToStaticMarkup(createElement(RunBoard, { scene: "audit" }))).toContain("Your agent, in a browser");
  });

  it("numbers a refused step in its lane's number column, before its cloud, and draws no number inside a shape", () => {
    run.scenes.forEach((scene, i) => {
      const html = renderToStaticMarkup(createElement(RunBoard, { scene: scene.id }));
      for (const r of (board[i]?.rows ?? []).filter((x) => x.outcome.kind === "refused")) {
        // The row opens with the number every row has; the cloud comes after it, round the step alone.
        expect(html, `${scene.id} ${r.n}`).toMatch(
          new RegExp(`id="${r.anchor}"[^>]*><div class="rb-row rb-row--refused"><span class="rb-n type-data"><span class="sr-only">Step </span>${r.n}</span><div[^>]*class="rev-cloud`),
        );
      }
      expect(html, scene.id).not.toContain("refused-badge");
    });
  });

  it("says what happened to every piece of work with a glyph as well as a line", () => {
    run.scenes.forEach((scene, i) => {
      const html = renderToStaticMarkup(createElement(RunBoard, { scene: scene.id }));
      const count = (re: RegExp) => (html.match(re) ?? []).length;
      const work = (board[i]?.rows ?? []).filter((r) => !r.read);
      // An icon for each outcome but unverified, which takes the hatched box the score figure keys it with.
      expect(count(/class="icon rb-g[ "]/g) + count(/class="rb-g rb-g--box"/g), scene.id).toBe(work.length);
      expect(count(/class="rb-g rb-g--box"/g), scene.id).toBe(work.filter((r) => r.outcome.kind === "unverified").length);
      // A finding takes the cross and a refusal the risk triangle, each in its own ink.
      expect(count(/class="icon rb-g rb-g--finding"/g), scene.id).toBe(work.filter((r) => r.outcome.kind === "finding").length);
      expect(count(/class="icon rb-g rb-g--refused"/g), scene.id).toBe(work.filter((r) => r.outcome.kind === "refused").length);
    });
  });

  it("draws the compact board static, with its bar, its caption and the refusal in focus", () => {
    const html = renderToStaticMarkup(createElement(RunBoardCompact, { scene: "run", rows: [4, 5, 6] }));
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("data-seq");
    expect(html).toContain("3 of 7 steps shown");
    expect(html).toContain('href="/run#run"');
    expect(html).toContain(`A recorded run of the real engine, <time dateTime="${run.recordedOn}">${run.recordedOn}</time>. ${run.firm} is a fictional firm.`);
    expect((html.match(/class="rev-cloud/g) ?? []).length).toBe(1);
    const audit = renderToStaticMarkup(createElement(RunBoardCompact, { scene: "audit", rows: [3, 4, 5, { scene: "audit-finished", row: 13 }] }));
    expect(audit).toContain("3 of 9 steps shown");
    expect(audit).toContain("Later, in “Finish the audit”");
    expect(audit).toContain("7 of 11 checks clear · 3 findings · 1 unverified");
    expect(() => renderToStaticMarkup(createElement(RunBoardCompact, { scene: "run", rows: [99] }))).toThrow(/no step 99/);
  });

  it("gathers the reads that follow one another into one band", () => {
    const items = boardItems(board[0]?.rows ?? []);
    expect(items.map((it) => (it.kind === "work" ? it.row.n : it.rows.map((r) => r.n)))).toEqual([1, [2, 3], 4, 5, 6, [7]]);
    expect(rows.filter((r) => r.read).every((r) => r.lane === "agent" && r.outcome.kind === "read")).toBe(true);
  });
});

// The score of the finished audit, drawn wherever a page shows it (home, /audit, /run).
describe("the score figure", () => {
  const { findings } = getRecordedAudit();
  const html = renderToStaticMarkup(createElement(ScoreFigure, { doc: findings }));
  const count = (re: RegExp) => (html.match(re) ?? []).length;

  it("draws one box per check, each a step named by the check's own outcome", () => {
    expect(count(/data-seq-step="/g)).toBe(findings.checks.length);
    for (const outcome of new Set(findings.checks.map((c) => c.outcome))) {
      expect(count(new RegExp(`data-seq-step="${outcome}"`, "g")), outcome).toBe(findings.checks.filter((c) => c.outcome === outcome).length);
    }
    for (const c of findings.checks) expect(html).toContain(`Check ${c.n}, `);
  });

  it("leads with one figure, the checks that are clear, and spells the arithmetic under the boxes", () => {
    expect(count(/type-figure/g)).toBe(1);
    // The figure counts up once in view (CountUp, D227): the server's HTML is the figure, twice,
    // the copy that moves hidden from a screen reader and the one that is read.
    const clear = findings.score.clear;
    expect(html).toContain(`<span class="type-figure text-text"><span aria-hidden="true" class="tabular-nums">${clear}</span><span class="sr-only">${clear}</span></span>`);
    expect(html).toContain(`of ${findings.score.total} checks clear`);
    expect(html).toContain(scoreArithmetic(findings).sum);
    expect(html).toContain(`${findings.checks.length} checks`);
  });

  it("is a sequence that plays once in view, and is finished without a script", () => {
    expect(html).toContain('data-seq="score" data-seq-start="view"');
    // No element is penciled in the server's markup: with scripts off this is the whole figure.
    // (The rules and the pre-paint script name these attributes; no tag carries them.)
    expect(html).not.toMatch(/\sdata-inked=/);
    expect(html).not.toMatch(/\sdata-seq-state=/);
  });

  it("keeps a penciled box its own outcome, never the dashed outline of a check nobody answered", () => {
    // Under each drawn glyph is the same glyph in pencil, so a box in pencil still shows its check or its cross.
    const glyphed = findings.checks.filter((c) => c.outcome === "clear" || c.outcome === "finding").length;
    expect(glyphed).toBeGreaterThan(0);
    expect(count(/class="icon sf-pencil"/g)).toBe(glyphed);
    // The figure's own rules: pencil dims a box's fill and shows that glyph. No rule of the
    // pencil state removes the fill or draws a dashed line: dashed is the key's "not checked".
    const rules = /<style[^>]*score-figure[^>]*>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const penciled = [...rules.matchAll(/([^{}]*data-inked="false"[^{}]*)\{([^}]*)\}/g)].map((m) => m[2] ?? "");
    expect(penciled.length).toBeGreaterThan(1);
    expect(rules).toContain('[data-inked="false"] .sf-box[data-ink]::before{opacity:.3}');
    for (const declarations of penciled) {
      expect(declarations).not.toMatch(/opacity:0(?![.\d])/);
      expect(declarations).not.toContain("dashed");
    }
  });
});

// The files the run wrote, drawn as sheets (/audit, and the files fold of a scene on /run).
describe("the documents the run wrote", () => {
  const recorded = getRecordedAudit();
  const count = (hay: string, needle: string) => hay.split(needle).length - 1;

  it("says whose finding it is in the file's own terms, settled or open", () => {
    const html = renderToStaticMarkup(createElement(FindingsReport, { doc: recorded.findings }));
    const rows = recorded.findings.findings;
    // The recording holds both kinds, so both wordings are drawn.
    expect(rows.some((f) => f.status === "open")).toBe(true);
    expect(rows.some((f) => f.status !== "open")).toBe(true);
    for (const f of rows) {
      const who = ownerPhrase(f.owner);
      // The file gives who fixes a finding and where it stands; it does not say who settled it.
      const line = f.status === "open" ? `${who.charAt(0).toUpperCase()}${who.slice(1)} fixes it` : `Was ${who}&#x27;s to fix`;
      expect(html, f.id).toContain(line);
    }
    expect(html).not.toContain("Fixed by");
  });

  it("draws an owner's sheet down the page: the finding, its facts, then every source behind it", () => {
    // Text and attribute values as the server writes them into markup.
    const inMarkup = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
    expect(recorded.sheets.length).toBeGreaterThan(0);
    for (const sheet of recorded.sheets) {
      const html = renderToStaticMarkup(createElement(OwnerSheet, { doc: sheet }));
      for (const f of sheet.findings) {
        const at = (s: string) => html.indexOf(s);
        expect(at(inMarkup(f.title)), f.id).toBeGreaterThan(-1);
        expect(at("What was found"), f.id).toBeGreaterThan(at(inMarkup(f.title)));
        expect(at("Rules and sources behind it"), f.id).toBeGreaterThan(at("From the check"));
        for (const s of f.sources) expect(html, `${f.id} ${s.url}`).toContain(`href="${inMarkup(s.url)}"`);
        if (f.due) expect(html, f.id).toContain(`dateTime="${f.due}"`);
      }
      // Paper: the sheet is the page handed to its owner, kept on one page when it fits one
      // (so its facts are one row and its title block one band there); a finding's facts stay
      // together either way, and its sources are one list under the list's own rules.
      expect(html, sheet.owner).toMatch(/^<article[^>]*class="[^"]*print:break-inside-avoid/);
      expect(count(html, 'class="print:break-inside-avoid"'), sheet.owner).toBe(sheet.findings.length);
      expect(count(html, "print:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]"), sheet.owner).toBe(sheet.findings.length);
      expect(count(html, "print:grid-cols-6"), sheet.owner).toBe(1);
      expect(count(html, '<ul class="rd-src rd-src--cols">'), sheet.owner).toBe(sheet.findings.filter((f) => f.sources.length + f.ruleCards.length > 0).length);
    }
    // Those rules: no source is split between two columns or two pages, and the host under
    // an outside link is left off on paper, where the whole address is printed after the link.
    const rules = renderToStaticMarkup(createElement(RunStyles));
    expect(rules).toMatch(/\.rd-src>li\{[^}]*break-inside:avoid\}/);
    expect(rules).toMatch(/@media print\{[^@]*\.rd-src>li>a\[href\^="http"\]\+span\{display:none\}/);
  });

  it("says so in words when a sheet has nothing to list", () => {
    const words = (markup: string) => markup.replace(/<[^>]+>/g, "");
    const sheet = recorded.sheets[0];
    if (!sheet) throw new Error("no owner sheet in the recording");
    const none = words(renderToStaticMarkup(createElement(OwnerSheet, { doc: { ...sheet, findings: [] } })));
    expect(none).toContain("Nothing to fix");
    expect(none).toContain(`No finding is open for ${ownerPhrase(sheet.owner)}.`);
    const empty = words(renderToStaticMarkup(createElement(CalendarSheet, { events: [], written: 0 })));
    expect(empty).toContain("0 dated duties");
    expect(empty).toContain("No dated duties in the file.");
    expect(empty).not.toContain("before relying on");
  });

  it("says once to check the calendar's dates, and marks the rows only when some are unmarked", () => {
    const calendar = getRecordedCalendar();
    if (!calendar) throw new Error("no calendar in the recording");
    const flagged = (description: string | null) => /^Check this date/m.test(description ?? "");
    // As recorded the engine marked every date: the head says it for all of them, once.
    expect(calendar.events.every((e) => flagged(e.description))).toBe(true);
    const all = renderToStaticMarkup(createElement(CalendarSheet, { events: calendar.events, written: calendar.written, digest: true }));
    expect(count(all, "before relying on")).toBe(1);
    expect(all).toContain("Check each date before relying on it.");
    expect(all).not.toContain("tag--dashed");
    // With one date unmarked, the head counts the marked ones and each of them carries the engine's own words.
    const some = calendar.events.map((e, i) => (i === 0 ? { ...e, description: (e.description ?? "").replace(/\n?Check this date[^\n]*/, "") } : e));
    const part = renderToStaticMarkup(createElement(CalendarSheet, { events: some, written: calendar.written, digest: true }));
    const marked = some.filter((e) => flagged(e.description)).length;
    expect(marked).toBe(calendar.events.length - 1);
    expect(part).toContain(`Check ${marked} of the dates before relying on them.`);
    expect(count(part, "Check this date before relying on it.")).toBe(marked);
  });
});

// The two pages, as the server renders them: their hoisted rules and inline scripts are not what they say.
describe("the /run and /audit pages", () => {
  const page = (markup: string) => markup.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  const text = (markup: string) =>
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&rsquo;|’/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      // a tag before a full stop, a comma or a colon leaves no space there
      .replace(/ ([.,:;])/g, "$1");
  const count = (hay: string, needle: string) => hay.split(needle).length - 1;
  const runMarkup = renderToStaticMarkup(createElement(RunPage));
  const runHtml = page(runMarkup);
  const auditHtml = page(renderToStaticMarkup(createElement(AuditPage)));

  it("say what is not available once each, in one place, from the flags", () => {
    expect(count(text(runHtml), "not released yet")).toBe(site.engineReleased ? 0 : 1);
    expect(count(text(auditHtml), "not released yet")).toBe(site.engineReleased ? 0 : 1);
    expect(count(text(auditHtml), "Not live yet")).toBe(site.connectorLive ? 0 : 1);
    // On /audit the engine's state is said where its output first appears: before the first sheet.
    if (!site.engineReleased) expect(auditHtml.indexOf("not released yet")).toBeLessThan(auditHtml.indexOf('class="sheet'));
    // Both pages say the firm is fictional and the findings made up.
    expect(text(runHtml)).toContain(`a fictional firm, ${run.firm}`);
    expect(text(auditHtml)).toContain("on a fictional firm");
    expect(text(auditHtml)).toContain("The findings are made-up examples.");
  });

  it("counts the recording once in the head, in one wording, and each scene once at any width: on its tab, or in its sheet head", () => {
    const steps = run.scenes.flatMap((s) => s.steps);
    const words = text(runHtml);
    // (The lead fact's figure follows its label in the markup and is drawn before it.)
    expect(words).toContain(`steps the engine refused ${steps.filter((s) => s.exit === 1).length}`);
    expect(words).toContain(`Steps ${steps.length}`);
    expect(words).toContain(`Recorded by a person ${steps.filter((s) => s.by !== null).length}`);
    expect(words).not.toContain("Done by a person");
    expect(count(words, "Recorded by a person")).toBe(1);
    run.scenes.forEach((scene, i) => {
      const refused = scene.steps.filter((s) => s.exit === 1).length;
      const note = `${scene.steps.length} steps${refused ? ` · ${refused} refused` : ""}`;
      // The tab: its title, then its counts.
      expect(count(words, `${scene.title} ${note}`), scene.id).toBe(1);
      // The sheet head: where the scene sits, then the same counts. Paper prints both.
      expect(count(words, `${scene.title} Scene ${i + 1} of ${run.scenes.length} · ${note}`), scene.id).toBe(1);
    });
    // On a screen only one of the two is drawn: the tab's note from 768 px (where the head
    // says where the scene sits), the head's counts below it (where the tab's note is not drawn).
    expect(runMarkup).toContain(".rs-note{display:none;");
    expect(runMarkup).toMatch(/@media \(min-width:768px\)\{[^@]*\.rs-note\{display:block\}/);
    expect(runMarkup).toContain("@media screen and (max-width:767.98px){.rs-at,.rs-sep{display:none}}");
    expect(runMarkup).toContain("@media screen and (min-width:768px){.rs-sep,.rs-sum{display:none}}");
  });

  it("gives every scene's sheet a title block that names it: the firm, the date, its files and who ran its steps", () => {
    for (const scene of run.scenes) {
      const from = runHtml.indexOf(`aria-label="Title block: ${scene.title}"`);
      expect(from, scene.id).toBeGreaterThan(-1);
      const block = text(runHtml.slice(from, runHtml.indexOf("</dl>", from)));
      expect(block, scene.id).toContain(`${run.firm}, fictional`);
      expect(block, scene.id).toContain(run.recordedOn);
      if (scene.files.length === 0) expect(block, scene.id).toContain("Files written None");
      for (const f of scene.files) expect(block, `${scene.id} ${f.path}`).toContain(f.path.split("/").at(-1) ?? f.path);
      if (scene.steps.some((s) => s.by === null)) expect(block, scene.id).toContain("Your agent");
      for (const by of new Set(scene.steps.flatMap((s) => (s.by && /[A-Z]/.test(s.by) ? [s.by] : [])))) expect(block, `${scene.id} ${by}`).toContain(by);
      // The counts are the tab's to say: the title block does not repeat them.
      expect(block, scene.id).not.toMatch(/Steps \d|Refused by the engine/);
    }
  });

  it("prints every scene: nothing in the markup is left out of a scene's sheet but the fold a rule hides on paper", () => {
    for (const scene of run.scenes) expect(runHtml, scene.id).toContain(`id="${scene.id}" aria-labelledby="${scene.id}-title" class="rs-panel`);
    // The rule that shows one scene at a time on a screen shows them all on paper.
    expect(runMarkup).toMatch(/@media print\{[^@]*\.rs-root \.rs-panels>\.rs-panel\{display:block !important\}/);
    expect(text(runHtml)).toContain(`On paper: the ${run.scenes.length} scenes as boards.`);
  });
});
