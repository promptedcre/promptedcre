// Records the formation run the home page shows as a chat:
//
//   npm run demo:record-llc      rewrites content/demo/form-llc.json
//
// A fictional firm that is not formed yet goes through "Form the sponsor entity" in the
// syndication view (Federal and Texas). Every command goes through the real command line
// (cli/run.ts) in process, in a fresh firm folder in the temp directory, with the clock and
// the time zone pinned, so the file is the same on every run (recordScenes in
// tools/demo-run.ts). __tests__/demo-llc.test.ts records it again and fails when the result
// differs from the committed file.
//
// The firm starts from "firm init --name", not "--example": the example firm, Example
// Sponsor LLC, is already formed (content/example-firm/firm.json), and the recording on /run
// shows it later in its life. A firm folder made with a name alone holds that name and
// nothing else: the entity's type, state and status start as unknown. Every name, path and
// figure below is made up, except two services: at the owner's word (D225) the fictional
// person lines up the registered agent and files the certificate through ZenBusiness, and
// opens the entity's bank account at Mercury, both real products listed in the rankings, and
// those three proofs name them. No one paid for that.
import fs from "node:fs";
import path from "node:path";
import type { DemoRun } from "../lib/schemas/demo";
import { calendarFile, demoJson, recordScenes, type Pin, type SceneScript } from "./demo-run";

export const LLC_OUT = path.join("content", "demo", "form-llc.json");

// 2026-11-17, 9:30 in the morning in Texas, where the firm is formed.
const PIN: Pin = { recordedOn: "2026-11-17", now: "2026-11-17T15:30:00.000Z", tz: "America/Chicago" };

const PB = "form-sponsor-entity";
const FIRM = "Example Industrial LLC";
const PERSON = "Alex Example";

const SCENES: SceneScript[] = [
  {
    id: "form-llc",
    title: "Form the LLC",
    summary:
      "The agent forms a Texas LLC for a fictional firm, one step at a time. The engine stops it where a person must approve or sign, and the first filing dates go on a calendar.",
    lines: [
      {
        args: ["firm", "init", "--name", FIRM],
        caption: `A firm folder is created on the operator's own machine for ${FIRM}, a fictional firm not formed yet. Only its name is known; the entity's facts start empty.`,
      },
      {
        args: ["run", "start", PB],
        caption: "The agent starts the formation playbook. Read for a syndication sponsor in Texas, 12 of its 16 steps apply.",
      },
      {
        args: ["run", "done", PB, "choose-state-and-entity-type", "--by", "counsel", "--proof", "drafts/entity-choice-memo.pdf"],
        caption: "The first step is counsel's: the state and the entity type. Counsel recorded it under its own name, with where the memo is.",
      },
      {
        args: ["run", "done", PB, "check-name-texas", "--proof", "drafts/name-check-results.pdf"],
        caption: "The agent tried the name check, a step it does in a browser. The step needs the run's standing approval, and no one had given it, so the engine refused.",
      },
      {
        args: ["run", "approve", PB, "--by", PERSON],
        caption: `${PERSON} gave the run's standing approval, once. It covers the name check.`,
      },
      {
        args: ["run", "done", PB, "check-name-texas", "--proof", "drafts/name-check-results.pdf"],
        caption: "With the approval on record, the agent checked the name and recorded where the search results are.",
      },
      {
        args: ["run", "done", PB, "line-up-registered-agent", "--by", PERSON, "--proof", "drafts/zenbusiness-registered-agent-consent.pdf"],
        caption: `${PERSON} lined up ZenBusiness as the registered agent, a person's step, and recorded where its written consent is.`,
      },
      {
        args: ["run", "done", PB, "draft-certificate", "--proof", "drafts/certificate-of-formation-draft.pdf"],
        caption: "The agent drafted the certificate of formation and recorded where the draft is.",
      },
      {
        args: ["run", "done", PB, "file-texas-certificate"],
        caption: "The agent tried to record the filing. Signing and filing the certificate is a person's step, so the engine refused and told the agent to hand it over.",
      },
      {
        args: ["run", "done", PB, "file-texas-certificate", "--by", PERSON, "--proof", "drafts/zenbusiness-filing-confirmation.pdf"],
        caption: `${PERSON} signed the certificate and filed it through ZenBusiness, then recorded the step under their own name, with where the filing confirmation is.`,
      },
      {
        args: ["run", "done", PB, "sign-company-agreement", "--by", PERSON, "--proof", "drafts/company-agreement-signed.pdf"],
        caption: `${PERSON} recorded the signed company agreement, another step a person signs.`,
      },
      {
        args: ["run", "done", PB, "confirm-boi-status", "--proof", "drafts/fincen-boi-page.pdf"],
        caption: "The agent confirmed that no beneficial ownership report is due and recorded where the page it read is saved.",
      },
      {
        args: ["run", "done", PB, "prepare-ein-answers", "--proof", "drafts/ein-application-answers.pdf"],
        caption: "The agent prepared the answers for the EIN application and recorded where they are.",
      },
      {
        args: ["run", "done", PB, "apply-for-ein", "--by", PERSON, "--proof", "drafts/ein-confirmation-letter.pdf"],
        caption: `${PERSON} applied for the EIN online. The record holds only where the confirmation letter is kept, never the number.`,
      },
      {
        args: ["run", "done", PB, "complete-franchise-questionnaire", "--by", PERSON, "--proof", "drafts/franchise-questionnaire-confirmation.pdf"],
        caption: `${PERSON} completed the Comptroller's franchise tax questionnaire and recorded where the confirmation is.`,
      },
      {
        args: ["deadline", "compute", "--franchise-report-year", "2027", "--franchise-report-through", "2029"],
        caption:
          "The engine worked out three years of Texas franchise tax report dates from the rule, the first report in 2027, each flagged for a person to check. May 15, 2027 is a Saturday, so that date moves to the Monday.",
      },
      {
        args: ["deadline", "export"],
        caption: "The dates were written to a calendar file that any calendar app can import.",
      },
      {
        args: ["run", "done", PB, "calendar-annual-filings", "--proof", "calendar.ics"],
        caption: "The agent recorded the calendar step, with the calendar file it had just written as the proof.",
      },
      {
        args: ["run", "done", PB, "open-bank-account", "--by", PERSON, "--proof", "drafts/mercury-account-confirmation.pdf"],
        caption: `${PERSON} opened the entity's account at Mercury, the last step and one a person signs. Every step that applies is done, and the run is complete.`,
      },
    ],
    // The calendar the run exported, whole.
    files: (firmDir) => [calendarFile(firmDir)],
  },
];

export function recordLlcDemo(): Promise<DemoRun> {
  return recordScenes(SCENES, PIN);
}

if (/demo-llc\.ts$/.test(process.argv[1] ?? "")) {
  void (async () => {
    const repoRoot = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
    process.chdir(repoRoot);
    const run = await recordLlcDemo();
    const out = path.join(repoRoot, LLC_OUT);
    const next = demoJson(run);
    const before = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, next, "utf8");
    const steps = run.scenes.reduce((n, s) => n + s.steps.length, 0);
    console.log(`${before === next ? "OK  unchanged" : "OK  written"}: ${LLC_OUT.split(path.sep).join("/")} (${steps} commands)`);
  })().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
