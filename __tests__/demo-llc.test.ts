import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { getLlcDemo, type LlcDemoData } from "@/components/demo/data";
import { dragsBack, followMove, revealTop, scrollsBack, type FollowFacts } from "@/components/demo/follow";
import { BEATS, LlcDemo, beatsFor, chatBeats, thinkingLabel } from "@/components/demo/llc-demo";
import { getStepSoftwareFile, stepKey, stepSoftware } from "@/components/rankings/step-software";
import { applicableSteps, DEFAULT_VARIANT } from "@/lib/compute/variant";
import { getCorpus } from "@/lib/content/load";
import { buildLlcChat, getLlcRun, type LlcEntry } from "@/lib/demo/llc";
import { findAction, toolName } from "@/lib/engine/index";
import { LOCAL_SERVER, localTools } from "@/lib/engine/local";
import { choreographyFor } from "@/lib/motion/choreographies";
import { planTimeline } from "@/lib/motion/plan";
import { DEFAULT_TOKENS } from "@/lib/motion/tokens";
import { demoRun, type DemoRun, type DemoStep } from "@/lib/schemas/demo";
import { setupPrompt, site } from "@/lib/site";
import { recordLlcDemo } from "@/tools/demo-llc";
import { demoJson } from "@/tools/demo-run";

// The home page's agent session shows content/demo/form-llc.json: a real run of the engine on
// a fictional firm that is not formed yet. This records it again and fails when the engine no
// longer prints the same thing. After an intended change to the engine or the catalog:
// npm run demo:record-llc

const FILE = path.join(process.cwd(), "content", "demo", "form-llc.json");
const committedText = fs.readFileSync(FILE, "utf8");
const committed = JSON.parse(committedText) as unknown;
let fresh: DemoRun;

const playbooks = getCorpus().playbooks;
const formation = playbooks.find((p) => p.slug === "form-sponsor-entity");
if (!formation) throw new Error("the catalog has no form-sponsor-entity");
const view = applicableSteps(formation, DEFAULT_VARIANT);

const words = (s: DemoStep) => [...s.command.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? "");
const flagOf = (s: DemoStep, name: string) => {
  const w = words(s);
  const i = w.indexOf(`--${name}`);
  return i >= 0 ? (w[i + 1] ?? null) : null;
};
const stepOf = (s: DemoStep) => (s.command.startsWith("pcre run done ") ? (words(s)[4] ?? null) : null);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

beforeAll(async () => {
  fresh = await recordLlcDemo();
}, 120_000);

describe("the recorded formation run", () => {
  it("matches the engine: recording it again gives the committed file, byte for byte (npm run demo:record-llc to refresh)", () => {
    expect(fresh).toEqual(committed);
    expect(demoJson(fresh)).toBe(committedText.replace(/\r\n/g, "\n"));
  });

  it("validates against its schema, and the loader reads it", () => {
    expect(demoRun.safeParse(committed).success).toBe(true);
    expect(getLlcRun()).toEqual(committed);
  });

  it("starts from a firm folder that holds a name and nothing else, not the example firm", () => {
    const [scene] = fresh.scenes;
    expect(fresh.scenes).toHaveLength(1);
    const first = scene?.steps[0];
    expect(first?.command).toBe(`pcre firm init --name "${fresh.firm}"`);
    expect(fresh.firm).toMatch(/\bExample\b/);
    expect(fresh.firm).not.toBe("Example Sponsor LLC");
    for (const s of scene?.steps ?? []) expect(s.command).not.toContain("--example");
  });

  it("reads the playbook in the syndication view, Federal and Texas, where every step it names applies", () => {
    const steps = fresh.scenes[0]?.steps ?? [];
    const start = steps.find((s) => s.command === "pcre run start form-sponsor-entity");
    expect(start?.output).toContain(`(syndication · industrial · us-federal, us-tx): ${view.length} steps apply.`);
    for (const s of steps) {
      const id = stepOf(s);
      if (id) expect(view.map((v) => v.id), s.command).toContain(id);
    }
  });

  it("refuses the agent at a person's step, and the person records it under their own name with a proof", () => {
    const steps = fresh.scenes[0]?.steps ?? [];
    const refused = steps.filter((s) => s.exit === 1);
    expect(refused.length).toBeGreaterThan(0);
    const personal = refused.filter((s) => {
      const step = view.find((v) => v.id === stepOf(s));
      return step?.mode === "human-online" || step?.mode === "human-offline";
    });
    expect(personal.length).toBeGreaterThan(0);
    for (const r of personal) {
      expect(r.by).toBeNull();
      expect(r.output).toMatch(/is a step a person does/);
      const later = steps.slice(steps.indexOf(r) + 1).find((s) => stepOf(s) === stepOf(r));
      expect(later?.exit).toBe(0);
      expect(later?.by).toBe("Alex Example");
      expect(flagOf(later as DemoStep, "proof")).toMatch(/^drafts\//);
    }
    expect(steps.every((s) => s.exit === 0 || s.exit === 1)).toBe(true);
  });

  it("resolves every step of the view, each done with a proof, none marked not applicable, and the run completes", () => {
    const steps = fresh.scenes[0]?.steps ?? [];
    for (const v of view) {
      const done = steps.find((s) => stepOf(s) === v.id && s.exit === 0);
      expect(done, v.id).toBeDefined();
      expect(flagOf(done as DemoStep, "proof"), v.id).toBeTruthy();
    }
    expect(steps.some((s) => / run (not-applicable|skip) /.test(s.command))).toBe(false);
    expect(steps.at(-1)?.output).toContain(`form-sponsor-entity is complete: ${view.length} done of ${view.length}`);
  });

  it("names the services the owner chose in the person's own records: ZenBusiness for the registered agent and the filing, Mercury for the bank", () => {
    const steps = fresh.scenes[0]?.steps ?? [];
    const record = (id: string) => steps.find((s) => stepOf(s) === id && s.exit === 0 && s.by !== null);
    expect(flagOf(record("line-up-registered-agent") as DemoStep, "proof")).toBe("drafts/zenbusiness-registered-agent-consent.pdf");
    expect(record("line-up-registered-agent")?.caption).toContain("ZenBusiness as the registered agent");
    expect(flagOf(record("file-texas-certificate") as DemoStep, "proof")).toBe("drafts/zenbusiness-filing-confirmation.pdf");
    expect(record("file-texas-certificate")?.caption).toContain("filed it through ZenBusiness");
    expect(flagOf(record("open-bank-account") as DemoStep, "proof")).toBe("drafts/mercury-account-confirmation.pdf");
    expect(record("open-bank-account")?.caption).toContain("at Mercury");
    // No other command names a service.
    const named = steps.filter((s) => /zenbusiness|mercury/i.test(s.command));
    expect(named).toHaveLength(3);
  });

  it("files every agent's proof under drafts/, except the calendar step, whose proof is the file the engine exported", () => {
    const steps = fresh.scenes[0]?.steps ?? [];
    for (const s of steps.filter((x) => x.by === null && stepOf(x) && x.exit === 0)) {
      const proof = flagOf(s, "proof") ?? "";
      if (stepOf(s) === "calendar-annual-filings") expect(proof).toBe("calendar.ics");
      else expect(proof, s.command).toMatch(/^drafts\/[\w.-]+$/);
    }
  });

  it("works out the first franchise tax report dates and exports them; the calendar file holds each one", () => {
    const steps = fresh.scenes[0]?.steps ?? [];
    const compute = steps.find((s) => s.command.startsWith("pcre deadline compute "));
    const added = [...(compute?.output ?? "").matchAll(/^ {2}\+ (\d{4}-\d{2}-\d{2}) {2}/gm)].map((m) => m[1] ?? "");
    expect(added).toEqual(["2027-05-17", "2028-05-15", "2029-05-15"]);
    expect(steps.find((s) => s.command === "pcre deadline export")?.output).toContain(`Wrote ${added.length} events to firm/calendar.ics`);
    const ics = fresh.scenes[0]?.files.find((f) => f.path === "calendar.ics")?.text ?? "";
    expect(ics.startsWith("BEGIN:VCALENDAR\n")).toBe(true);
    expect(ics).not.toContain("\r");
    expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(added.length);
    for (const d of added) expect(ics).toContain(`DTSTART;VALUE=DATE:${d.replace(/-/g, "")}`);
  });

  it("names only made-up people and a made-up firm, and carries no number shaped like a tax id", () => {
    const steps = fresh.scenes[0]?.steps ?? [];
    expect([...new Set(steps.map((s) => s.by).filter((b) => b !== null))].sort()).toEqual(["Alex Example", "counsel"]);
    for (const text of [...steps.map((s) => s.command + s.output), ...(fresh.scenes[0]?.files ?? []).map((f) => f.text)]) {
      expect(text).not.toMatch(/\b\d{2}-\d{7}\b/);
      expect(text).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
    }
  });

  it("gives every command a caption", () => {
    for (const s of fresh.scenes[0]?.steps ?? []) expect(s.caption?.length ?? 0, s.command).toBeGreaterThan(20);
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

describe("the agent session built from it", () => {
  const data: LlcDemoData = getLlcDemo();
  const lines = getLlcRun().scenes[0]?.steps ?? [];
  const lineOf = (e: LlcEntry): DemoStep => {
    const l = lines[e.line];
    if (!l) throw new Error(`no line ${e.line}`);
    return l;
  };

  it("makes one entry of every recorded command, in order, and opens with the sentence a person pastes", () => {
    expect(data.entries.map((e) => e.line)).toEqual(lines.map((_, i) => i));
    expect(data.prompt).toBe(setupPrompt());
    expect(data.lines.map((l) => l.command)).toEqual(lines.map((l) => l.command));
    expect(data.server).toEqual({ name: LOCAL_SERVER.name, version: LOCAL_SERVER.version });
  });

  it("calls each command by the name of the engine's own tool, with the arguments the record gives it", () => {
    const served = new Set(localTools().map((t) => t.name));
    for (const e of data.entries) {
      const line = lineOf(e);
      const w = words(line);
      const action = findAction(`${w[1]}.${w[2]}`);
      if (!action) throw new Error(`no action for ${line.command}`);
      expect(e.call.tool).toBe(toolName(action));
      expect(served.has(e.call.tool), e.call.tool).toBe(true);
      const arg = (name: string) => e.call.args.find((a) => a.name === name)?.value;
      if (stepOf(line)) expect(arg("step")).toBe(stepOf(line));
      if (line.by) expect(arg("by")).toBe(line.by);
      const proof = flagOf(line, "proof");
      if (proof) expect(arg("proof")).toBe(proof);
    }
    expect([...new Set(data.entries.map((e) => e.call.tool))].sort()).toEqual(["deadline_compute", "deadline_export", "firm_init", "run_approve", "run_done", "run_start"]);
  });

  it("puts the engine's own words under each call: its printed lines, and a refusal's message up to the command it suggests", () => {
    for (const e of data.entries) {
      const out = lineOf(e).output;
      for (const r of e.result) {
        if (e.refused) {
          expect(out.startsWith(r.slice(0, -1))).toBe(true);
          continue;
        }
        for (const part of r.split(" · ")) expect(out, `${lineOf(e).command}: ${part}`).toContain(part.replace(/^complete: /, ""));
      }
    }
    const refused = data.entries.filter((e) => e.refused);
    expect(refused.map((e) => e.result[0])).toEqual([
      `"check-name-texas" is covered by the run's standing approval, and none is recorded yet. Ask a person once for this run, and wait. Once they say yes, record it in their name.`,
      `"file-texas-certificate" is a step a person does (human-online, principal). Prepare it, then hand it to them: say what to do and where, and wait. Once they say it is done, record it in their name.`,
    ]);
  });

  it("hands a person's step over in plain words, and brings back that person's report as the record has it", () => {
    for (const e of data.entries.filter((x) => x.who.lane === "person")) {
      const line = lineOf(e);
      expect(e.ask, line.command).toBeTruthy();
      expect(e.ask).toContain(`Over to ${line.by}.`);
      if (stepOf(line)) {
        expect(e.ask).toContain(`Step ${e.step} is a person's step: ${e.title}.`);
        expect(e.reply).toBe(`done, proof ${flagOf(line, "proof")}`);
      } else expect(e.reply).toBe("approved");
    }
    for (const e of data.entries.filter((x) => x.who.lane === "agent")) {
      expect(e.ask).toBeNull();
      expect(e.reply).toBeNull();
    }
  });

  it("lists the view's steps as the agent's tasks, in order, each checked off by the entry that records it", () => {
    expect(data.steps.map((s) => s.id)).toEqual(view.map((v) => v.id));
    for (const s of data.steps) {
      expect(s.doneAt, s.id).not.toBeNull();
      const line = lines[s.doneAt ?? -1];
      expect(line && stepOf(line)).toBe(s.id);
      expect(line?.exit).toBe(0);
    }
  });

  it("shows a service only where the record names it: ZenBusiness on the registered agent and the filing, Mercury on the bank account", () => {
    const map = getStepSoftwareFile().steps;
    const withService = data.entries.filter((e) => e.service !== null);
    expect(withService.map((e) => [data.steps[(e.step ?? 0) - 1]?.id, e.service?.id])).toEqual([
      ["line-up-registered-agent", "zenbusiness"],
      ["file-texas-certificate", "zenbusiness"],
      ["open-bank-account", "mercury"],
    ]);
    for (const e of withService) {
      const step = view[(e.step ?? 0) - 1];
      if (!step?.market || !e.service) throw new Error("no market");
      expect(map[stepKey(formation.id, step.id)]).toContain(e.service.id);
      const listed = stepSoftware(formation.id, step.id, step.market, Number.POSITIVE_INFINITY);
      expect(listed?.vendors.find((v) => v.id === e.service?.id)).toEqual(e.service);
      expect(flagOf(lineOf(e), "proof")?.split("/").at(-1)?.startsWith(`${e.service.id}-`)).toBe(true);
    }
    // ZenBusiness is listed in the market and not judged yet; Mercury has a score.
    expect(withService[0]?.service?.score).toBeNull();
    expect(typeof withService[2]?.service?.score).toBe("number");
  });

  it("ends on the firm formed and the first filing dates the run put on the calendar", () => {
    const r = data.result;
    expect(r.firm).toBe(data.firm);
    expect([r.done, r.total]).toEqual([view.length, view.length]);
    expect(r.formation).toMatchObject({ title: "Sign and file the Texas certificate of formation", by: "Alex Example", date: data.recordedOn });
    expect(r.dates.map((d) => d.date)).toEqual(["2027-05-17", "2028-05-15", "2029-05-15"]);
    expect(r.dates[0]?.moved).toEqual({ from: "2027-05-15", weekday: "Saturday" });
    expect(r.dates.every((d) => d.check)).toBe(true);
    expect(r.calendar).toEqual({ path: "firm/calendar.ics", events: 3 });
  });

  it("fails loudly on a refusal it has no words for, instead of making some up", () => {
    const run = structuredClone(getLlcRun());
    const step = run.scenes[0]?.steps.find((s) => s.exit === 1);
    if (!step) throw new Error("no refusal");
    step.output = "Something the engine never said.\n";
    expect(() => buildLlcChat(run, playbooks, () => null)).toThrow(/does not know how to say/);
  });

  it("hands the engine's release state to the page, and never says it itself", () => {
    expect(data.engineReleased).toBe(site.engineReleased);
    const html = renderToStaticMarkup(createElement(LlcDemo, { data }));
    expect(html).not.toMatch(/not released/i);
  });
});

describe("the session as drawn", () => {
  const data = getLlcDemo();
  const html = renderToStaticMarkup(createElement(LlcDemo, { data }));
  const beats = chatBeats(data);
  const window = html.slice(html.indexOf('class="lc-scroll"'), html.indexOf("data-lc-follow"));

  it("is one figure on the generic rule, starting in view, with a caption that says it is a recorded run shown as an agent session", () => {
    expect(html).toMatch(/<figure[^>]* data-seq="chat"[^>]* data-seq-start="view"/);
    expect(html.match(/<figure/g)).toHaveLength(1);
    expect(choreographyFor("chat").name).toBe("steps");
    expect(html).toContain(`A recorded run of the engine on ${data.firm}, a fictional firm, shown as an agent session, <time dateTime="${data.recordedOn}">`);
    expect(html).toContain("ZenBusiness and Mercury are real services named in the record");
    expect(html).toContain("data-seq-controls");
  });

  it("opens on the engine's connector, connected, with the brand mark and a check, then the sentence a person pastes", () => {
    expect(window).toMatch(/<p class="lc-conn lc-in"><svg[^>]*viewBox="0 0 22 22"[\s\S]*?<\/svg><span>PromptedCRE connected <span class="lc-faint">promptedcre-local<\/span><\/span><span class="lc-svc-chk"><svg/);
    expect(window).toContain(`<span class="sr-only">You: </span>${data.prompt}`);
    expect(window.indexOf("PromptedCRE connected")).toBeLessThan(window.indexOf(data.prompt));
  });

  it("writes each call as a row an agent app would show: the engine's tool, opened on its arguments and the engine's result, in plain type", () => {
    expect(window).toContain('<ol class="lc-log type-body-s">');
    expect(window).not.toContain("type-code");
    expect(window.match(/<details class="lc-tool[^"]*"><summary class="lc-tool-sum">/g)).toHaveLength(data.entries.length);
    for (const e of data.entries) {
      expect(window, e.call.tool).toContain(`<span class="lc-tool-name">${e.call.tool}</span>`);
      for (const a of e.call.args)
        expect(window).toContain(`<dt>${a.name}</dt><dd class="lc-val type-data">${esc(typeof a.value === "string" ? JSON.stringify(a.value) : String(a.value))}</dd>`);
      for (const r of e.result) expect(window).toContain(esc(r));
      // The row's own line is the first line of the result (or that the engine refused it).
      if (!e.refused) expect(window).toContain(`<span class="lc-tool-say">${esc(e.result[0] ?? "")}</span>`);
    }
  });

  it("draws a refusal as a soft warning in the engine's words, the danger ink on its icon and its first word, and draws no cloud, badge, sign line or signature glyph in the window", () => {
    expect(window.match(/<div class="lc-warn"><svg[^>]*class="[^"]*lc-warn-ico[^"]*"[\s\S]*?<\/svg><p class="lc-warn-text"><b>Refused\. <\/b>/g)).toHaveLength(2);
    expect(window.match(/<details class="lc-tool lc-tool--err">/g)).toHaveLength(2);
    expect(html).toContain(".lc-warn-ico{flex:none;margin-top:.1875rem;color:var(--danger)}");
    expect(html).toContain(".lc-warn b{color:var(--danger)}");
    for (const absent of ["rev-cloud", "refused-badge", "sigline", "Signature", "lc-elbow", "lc-trunk"]) expect(html, absent).not.toContain(absent);
  });

  it("hands a person's step over on a card, then shows that person's reply with the proof the record names, as a file", () => {
    for (const e of data.entries.filter((x) => x.who.lane === "person")) {
      const ask = window.indexOf(`<p class="lc-hand-text">${esc(e.ask ?? "")}</p>`);
      const who = window.indexOf(`<span class="lc-who">${esc(e.who.name)}</span>`, ask);
      expect(ask, e.title).toBeGreaterThan(-1);
      expect(who, e.title).toBeGreaterThan(ask);
      const word = (e.reply ?? "").split(",")[0] ?? "";
      expect(window.indexOf(`<span>${word.charAt(0).toUpperCase()}${word.slice(1)}</span>`, who), e.title).toBeGreaterThan(who);
      if (e.proof) {
        expect(e.reply).toBe(`done, proof ${e.proof}`);
        expect(window.indexOf(`<span class="lc-file" title="${esc(e.proof)}">`, who), e.title).toBeGreaterThan(who);
      }
    }
  });

  it("shows each service with its own icon and its name, and a check that lands when the step is recorded done", () => {
    for (const e of data.entries.filter((x) => x.service)) {
      const v = e.service;
      if (!v) continue;
      expect(window).toContain(`src="/logos/${v.id}.png"`);
      expect(window).toContain(`<span class="lc-svc-name">${v.name}</span><span class="lc-svc-chk">`);
    }
    expect(window.match(/<p class="lc-svc lc-in">/g)).toHaveLength(data.entries.filter((e) => e.service).length);
    // The check waits for its line to come into focus, then lands; it is empty while the line is in pencil.
    expect(html).toMatch(/\.lc-svc-chk\{[^}]*clip-path:inset\(0 calc\(\(1 - var\(--draw,1\)\)\*100%\) 0 0\);transition:--draw var\(--dur-3,320ms\) var\(--ease-out,ease-out\) var\(--dur-3,320ms\)\}/);
    expect(html).toContain('[data-inked="false"] .lc-svc-chk,[data-inked="false"] .lc-chk>svg{--draw:0;transition-duration:0s;transition-delay:0s}');
  });

  it("keeps a task list beside it: a ring per step, filled and checked and its line struck through when the step's record arrives", () => {
    expect(html.match(/<span class="lc-chk"><svg/g)).toHaveLength(data.steps.length);
    for (const s of data.steps) {
      expect(html).toContain(`<span class="sr-only">Step ${s.n}: </span>${esc(s.title)}`);
      expect(html.match(new RegExp(` data-lc-row="${s.n}"`, "g")), s.id).toHaveLength(1);
      expect(html.match(new RegExp(` data-lc-done="${s.n}"`, "g")), s.id).toHaveLength(1);
      expect(html).toContain(`.lc-fig:has([data-lc-done="${s.n}"][data-inked="false"]) [data-lc-row="${s.n}"] .lc-chk>svg`);
      expect(html).toContain(`.lc-fig:has([data-lc-done="${s.n}"][data-inked="false"]) [data-lc-row="${s.n}"] .lc-chk,`.replace(/,$/, s.n < data.steps.length ? "," : "{"));
      expect(html).toContain(`.lc-fig:has([data-lc-done="${s.n}"][data-inked="false"]) [data-lc-row="${s.n}"] .lc-row-title`);
    }
    expect(html).toMatch(/\.lc-row-title\{position:static;[^}]*color:var\(--text-faint\);text-decoration-line:line-through/);
    expect(html).toContain('[data-inked="false"] .lc-row-title{color:var(--text);text-decoration-line:none;transition-duration:0s}');
  });

  it("puts a thinking row before each of the agent's own calls, a spinner and the step and the count, with no clock", () => {
    const agent = data.entries.filter((e) => e.who.lane === "agent");
    const rows = [...html.matchAll(/<div aria-hidden="true" data-draw="" data-draw-ms="(\d+)" data-draw-ease="linear" class="lc-think">([\s\S]*?)<\/div>/g)];
    expect(rows).toHaveLength(agent.length);
    rows.forEach((r, i) => {
      const e = agent[i];
      if (!e) throw new Error(`no agent entry ${i}`);
      expect(Number(r[1])).toBe(BEATS.think);
      expect(r[2]).toContain('<svg viewBox="0 0 16 16" focusable="false" class="lc-spin">');
      expect(r[2]).toContain(`<span class="lc-think-label">${thinkingLabel(e.step, data.steps.length)}</span>`);
      expect(r[2]).not.toMatch(/\d+(?:\.\d+)?\s?(?:s|sec|seconds?|ms)\b/);
    });
    expect(thinkingLabel(4, 12)).toBe("Working on step 4 of 12");
    expect(thinkingLabel(null, 12)).toBe("Working");
    expect(html).toMatch(/\.lc-think\{position:absolute;[^}]*display:none;[^}]*opacity:calc\(min\(1,var\(--draw,1\)\*8\)\*min\(1,\(1 - var\(--draw,1\)\)\*8\)\)\}/);
    expect(html).toContain('@media screen and (min-width:768px){\n:is([data-seq-state="penciled"],[data-seq-state="playing"],[data-seq-state="paused"]) .lc-think{display:flex}');
    // The spinner turns once and the light passes once, from that one stroke: nothing loops.
    expect(html).toContain(".lc-spin{flex:none;width:.875rem;height:.875rem;fill:none;stroke:var(--agent);stroke-width:2;stroke-linecap:round;stroke-dasharray:.7 .3;rotate:calc(var(--draw,1)*360deg)}");
    expect(html).not.toMatch(/@keyframes|animation:/);
  });

  it("brings each new line into focus: frosted while its step is in pencil, on screens only", () => {
    expect(html).toMatch(/@media screen\{\n\[data-inked="false"\] \.lc-in\{filter:blur\([^)]+\);opacity:[\d.]+;transform:translateY\([^)]+\)/);
    expect(window.match(/<div class="lc-in">/g)?.length ?? 0).toBeGreaterThanOrEqual(data.entries.length);
  });

  it("keeps the session in a window of its own height that scrolls: a labelled region a keyboard can reach, full height on paper", () => {
    expect(html).toMatch(/<div role="region" tabindex="0" aria-label="[^"]*scrolls[^"]*" class="lc-scroll">/i);
    expect(html).toMatch(/class="lc-scroll">[\s\S]*<span hidden="" data-lc-follow=""><\/span><\/div>/);
    expect(html).toContain(".lc-scroll{height:min(30rem,62vh);height:min(30rem,62svh);overflow-x:hidden;overflow-y:auto");
    expect(html).toContain(".lc-scroll{height:min(36rem,70vh);height:min(36rem,70svh)}");
    expect(html).toContain(".lc-scroll:focus-visible{outline:var(--focus-ring)");
    expect(html).toContain("@media print{.lc-win{overflow:visible;box-shadow:none}.lc-scroll{height:auto;overflow:visible}.lc-result{box-shadow:none}}");
  });

  it("rounds the boxes with the corner tokens and lifts the window, the task card and the result card on the shadow token; bubbles, pills and rings are round", () => {
    expect(html).toMatch(/\.lc-win\{[^}]*border-radius:var\(--radius-box\)[^}]*box-shadow:var\(--shadow-box\)/);
    expect(html).toMatch(/\.lc-result\{[^}]*border-radius:var\(--radius-box\)[^}]*box-shadow:var\(--shadow-box\)/);
    expect(html).toMatch(/\.lc-side\{order:0;[^}]*border-radius:var\(--radius-box\)[^}]*box-shadow:var\(--shadow-box\)/);
    expect(html).toMatch(/\.lc-tool\{[^}]*border-radius:var\(--radius-control\)/);
    expect(html).toMatch(/\.lc-file\{[^}]*border-radius:var\(--radius-chip\)/);
    expect(html).toMatch(/\.lc-bubble\{[^}]*border-radius:1\.125rem/);
    expect(html).toMatch(/\.lc-svc\{[^}]*border-radius:2rem/);
    expect(html).toMatch(/\.lc-chk\{[^}]*border-radius:50%/);
    expect(html).toContain('.lc-result:has([data-seq-step="result"][data-inked="false"]){box-shadow:none');
  });

  it("draws the app's message box under the chat as a picture: hidden from a screen reader, nothing to type into or focus, not on paper", () => {
    expect(html).toMatch(/<div aria-hidden="true" class="lc-composer">/);
    const box = html.slice(html.indexOf('class="lc-composer"'), html.indexOf("</div>", html.indexOf('class="lc-composer"')));
    expect(box).not.toMatch(/<(?:input|textarea|button|a)\b|tabindex|contenteditable/i);
    expect(html).toContain("@media print{.lc-composer{display:none}");
  });

  it("marks one sequence step per beat", () => {
    expect(html.match(/ data-seq-step="/g)).toHaveLength(beats.length);
    expect(html.match(/class="lc-pause"/g)).toHaveLength(beats.filter((b) => b.role === "pause").length);
    for (const b of beats.filter((x) => x.wide)) expect(b.role).toBe("pause");
    for (const b of beats) for (const d of b.draws.filter((x) => x.wide)) expect(d.ms).toBe(BEATS.think);
  });

  it("plays within its budget, shorter on a phone, and pauses longest at the refusal of the step a person signs", () => {
    const total = (wide: boolean) => {
      const raw = beatsFor(beats, wide).map((b) => ({ role: b.role, draws: b.draws.map((d) => ({ ms: d.ms, ease: d.ease })), hold: b.hold, drawMs: null, at: null }));
      return planTimeline(choreographyFor("chat").resolve(raw, DEFAULT_TOKENS)).total;
    };
    const wide = total(true);
    const phone = total(false);
    expect(wide).toBeGreaterThan(10_000);
    expect(wide).toBeLessThan(17_000);
    expect(phone).toBeLessThan(12_000);
    expect(wide - phone).toBeGreaterThan(4_000);
    const pauseAfter = (key: string) => {
      const i = beats.findIndex((b) => b.key === key);
      const next = beats[i + 1];
      return (beats[i]?.hold ?? 0) + (next?.role === "pause" ? 200 + next.hold : 0);
    };
    const refusals = beats.filter((b) => b.role === "refused").map((b) => pauseAfter(b.key));
    expect(refusals).toHaveLength(2);
    expect(refusals[1]).toBe(BEATS.gate + 200 + BEATS.gateWide);
    expect(Math.max(...refusals)).toBe(refusals[1]);
    expect(Math.max(...beats.filter((b) => b.role !== "refused").map((b) => b.hold))).toBeLessThan(BEATS.gate);
  });
});

// ChatFollow (components/demo/chat-follow.tsx) applies these rules to the window it scrolls;
// the browser half (the MutationObserver, scrollTo) is not run here.
describe("how the session's window follows the run", () => {
  const facts = (over: Partial<FollowFacts> = {}): FollowFacts => ({
    restart: false,
    finished: false,
    snapped: false,
    recentInput: false,
    follow: true,
    inked: -1,
    steps: 26,
    ...over,
  });

  it("brings the step after the one that inked into view, and keeps the last one in view", () => {
    expect(followMove(facts({ inked: 4 })).move).toEqual({ to: "step", index: 5, fromTop: false });
    expect(followMove(facts({ inked: 25 })).move).toEqual({ to: "step", index: 25, fromTop: false });
    expect(followMove(facts()).move).toEqual({ to: "none" });
  });

  it("stops following once the reader scrolls it back, and follows again from the top when the run starts again", () => {
    expect(followMove(facts({ follow: false, inked: 4 }))).toEqual({ move: { to: "none" }, follow: false });
    expect(followMove(facts({ follow: false, restart: true }))).toEqual({ move: { to: "top" }, follow: true });
    expect(followMove(facts({ follow: false, restart: true, inked: 6 })).move).toEqual({ to: "step", index: 7, fromTop: true });
    expect(scrollsBack(-40)).toBe(true);
    expect(scrollsBack(40)).toBe(false);
    expect(dragsBack(100, 120)).toBe(true);
    expect(dragsBack(120, 100)).toBe(false);
    expect(dragsBack(100, 104)).toBe(false);
  });

  it("lands at the end when the run plays out or the reader ends it with a click or a key, and stays put otherwise", () => {
    expect(followMove(facts({ finished: true })).move).toEqual({ to: "end" });
    expect(followMove(facts({ finished: true, follow: false })).move).toEqual({ to: "none" });
    expect(followMove(facts({ finished: true, snapped: true, recentInput: true, follow: false })).move).toEqual({ to: "end" });
    // An end the reader did not ask for with a click or a key: focus arriving before the run began, printing.
    expect(followMove(facts({ finished: true, snapped: true })).move).toEqual({ to: "none" });
  });

  it("scrolls only as far as it must: a box's bottom into view, never past its top, and not at all when it is in view", () => {
    expect(revealTop({ top: 700, bottom: 780 }, 0, 576)).toBe(220);
    expect(revealTop({ top: 100, bottom: 900 }, 0, 576)).toBe(84);
    expect(revealTop({ top: 40, bottom: 120 }, 300, 576)).toBe(24);
    expect(revealTop({ top: 320, bottom: 400 }, 300, 576)).toBeNull();
    expect(revealTop({ top: 4, bottom: 60 }, 30, 576)).toBe(0);
  });
});
