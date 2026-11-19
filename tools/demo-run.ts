// Records a run of the engine on the fictional example firm, for the home page:
//
//   npm run demo:record      rewrites content/demo/run.json
//
// Every command goes through the real command line (cli/run.ts) in process,
// against a fresh firm folder in the temp directory, with the clock pinned so
// the output is the same on every run. __tests__/demo.test.ts records it again
// and fails when the result differs from the committed file.
// recordScenes() is the recorder itself; tools/demo-llc.ts records the formation
// run (content/demo/form-llc.json) with it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoRun, type DemoFile, type DemoRun, type DemoScene, type DemoStep } from "../lib/schemas/demo";

export const DEMO_OUT = path.join("content", "demo", "run.json");

// 2026-11-13, 9:30 in the morning in Texas, where the example firm is formed.
const RECORDED_ON = "2026-11-13";
const PINNED_NOW = "2026-11-13T15:30:00.000Z";
const PINNED_TZ = "America/Chicago";

// The day a recording is made under: the date it is labelled with, the instant the clock
// is held at, and the time zone the engine reads local dates in.
export type Pin = { recordedOn: string; now: string; tz: string };

type Line = { args: string[]; caption: string };
export type SceneScript = {
  id: string;
  title: string;
  summary: string;
  lines: Line[];
  // The files to show, read after the scene's last command; steps holds what
  // each command printed, with the firm folder written as "firm".
  files?: (firmDir: string, steps: DemoStep[]) => DemoFile[];
};

// Reads a file inside the firm folder by its path relative to it.
function firmFile(firmDir: string, rel: string): DemoFile {
  return { path: rel, text: fs.readFileSync(path.join(firmDir, ...rel.split("/")), "utf8") };
}

// The whole calendar file "deadline export" wrote, with its CRLF line ends written as "\n"
// so the recording reads the same on every machine.
export function calendarFile(firmDir: string): DemoFile {
  return { path: "calendar.ics", text: fs.readFileSync(path.join(firmDir, "calendar.ics"), "utf8").replace(/\r\n?/g, "\n") };
}

// The files the last "audit report" in a scene says it wrote, in its order.
function reportedFiles(firmDir: string, steps: DemoStep[]): DemoFile[] {
  const report = steps.filter((s) => s.command === "pcre audit report").at(-1);
  if (!report) throw new Error("the scene has no audit report");
  const paths = [...report.output.matchAll(/^ {2}firm\/(\S+)$/gm)].map((m) => m[1] ?? "");
  if (paths.length === 0) throw new Error("the audit report listed no files");
  return paths.map((rel) => firmFile(firmDir, rel));
}

const PLAYBOOK = "file-form-d-and-state-notices";
const AUDIT = "audit-entity-standing";

const SCENES: SceneScript[] = [
  {
    id: "run",
    title: "Run a playbook",
    summary: "The agent works through a filing playbook, and the engine stops it at the one step only a person can record.",
    lines: [
      { args: ["firm", "init", "--example"], caption: "A firm folder is created on the operator's own machine, holding the fictional Example Sponsor LLC." },
      { args: ["firm", "status"], caption: "One view of the firm: its open playbook, audits, deadlines and deals." },
      { args: ["run", "next"], caption: "The engine lists the steps that can be done now, who does each one, and the exact line to record it." },
      {
        args: ["run", "done", PLAYBOOK, "confirm-bad-actor-check", "--proof", "drafts/bad-actor-questionnaires.pdf"],
        caption: "The agent did a step that is its own to do and recorded where the proof is; the reply lists what is ready next.",
      },
      {
        args: ["run", "done", PLAYBOOK, "set-up-login-gov"],
        caption: "The agent tried a step that belongs to a person. The engine refused it and told the agent to hand it over.",
      },
      {
        args: ["run", "done", PLAYBOOK, "set-up-login-gov", "--by", "Alex Example", "--proof", "drafts/login-gov-account-screen.png"],
        caption: "Alex Example did the step and recorded it under their own name, with where the proof is.",
      },
      { args: ["run", "next"], caption: "Both steps are off the list, and what remains is ready for the agent." },
    ],
  },
  {
    id: "audit",
    title: "Audit a firm",
    summary: "The agent checks the firm's standing one item at a time, and each answer is backed by evidence or written up as a finding.",
    lines: [
      { args: ["audit", "open", AUDIT], caption: "An audit of the entity's standing is opened, with eleven checks to work through." },
      { args: ["audit", "next"], caption: "The engine lists the checks ready now and says which ones an agent can verify and which need a person." },
      {
        args: ["audit", "record", "confirm-state-status", "--outcome", "clear", "--evidence", "drafts/state-status-lookup.pdf"],
        caption: "The agent tried to record a public-record lookup before anyone approved lookups. The engine refused.",
      },
      { args: ["audit", "approve-lookups", "--by", "Alex Example"], caption: "Alex Example approved read-only lookups of public records, once for the whole audit." },
      {
        args: ["audit", "record", "confirm-state-status", "--outcome", "clear", "--evidence", "drafts/state-status-lookup.pdf"],
        caption: "With the approval on record, the same check is recorded as clear, with its evidence.",
      },
      {
        args: [
          "audit",
          "record",
          "match-company-agreement",
          "--outcome",
          "finding",
          "--title",
          "Only an unsigned draft of the company agreement is on file",
          "--detail",
          "Made-up example: drafts/company-agreement-draft.pdf has no signatures.",
        ],
        caption: "A check never fixes anything: the problem the agent found is written up as a finding, with who fixes it.",
      },
      {
        args: ["audit", "record", "confirm-counsel-client", "--outcome", "clear", "--evidence", "drafts/engagement-letter.pdf"],
        caption: "Only a person can sign off on this check, so the engine refused to let the agent mark it clear.",
      },
      { args: ["audit", "score"], caption: "The score is counted from the records: how much was verified, not a claim that the firm is compliant." },
      { args: ["audit", "report"], caption: "The report is written into the firm folder: a findings file, and a to-do sheet for the person who fixes the finding." },
    ],
    // Every file the report says it wrote, as the finished audit keeps them.
    files: reportedFiles,
  },
  {
    id: "deadlines",
    title: "Track deadlines",
    summary: "The engine works out the firm's filing dates from the rules and puts them on a calendar the operator can import.",
    lines: [
      {
        args: ["deadline", "compute", "--franchise-report-year", "2027", "--franchise-report-through", "2029"],
        caption: "Three years of state franchise tax report dates were worked out from the rule, each flagged for a person to check.",
      },
      { args: ["deadline", "list"], caption: "Every open deadline, with how many days are left, counted from today." },
      { args: ["deadline", "export"], caption: "The dates were written to a calendar file that any calendar app can import." },
    ],
    // The whole calendar file.
    files: (firmDir) => [calendarFile(firmDir)],
  },
  {
    id: "deal",
    title: "Move a deal",
    summary: "A deal moves through the acquisition playbooks, and only a person can decide to take it to the next stage.",
    lines: [
      {
        args: ["deal", "add", "deal-elm", "--label", "The warehouse on Elm"],
        caption: "A made-up deal is added, and its first playbook, screening it against the buy box, starts on its own.",
      },
      { args: ["deal", "show", "deal-elm"], caption: "The deal's six stages, from screening to closing, with where it stands now." },
      {
        args: ["deal", "advance", "deal-elm", "--note", "Fits the buy box"],
        caption: "The agent tried to move the deal forward. Going on is a person's decision, so the engine refused.",
      },
      { args: ["decision", "list"], caption: "The decision log keeps what people decided; the refused move added nothing to it." },
      { args: ["firm", "status"], caption: "The firm's whole picture after the session: the playbook, the audit, the deadlines and the deal." },
    ],
  },
  {
    id: "audit-finished",
    title: "Finish the audit",
    summary: "The audit is taken to the end, check by check, and closes with a report a partner or counsel can read.",
    lines: [
      { args: ["audit", "next"], caption: "Back to the open audit: the engine lists the checks still waiting and who can record each one." },
      {
        args: ["audit", "record", "confirm-registered-agent", "--outcome", "clear", "--evidence", "drafts/registered-agent-invoice.pdf", "--by", "Alex Example"],
        caption: "Alex Example confirmed the registered agent's service is paid and recorded it clear, with the invoice as proof.",
      },
      {
        args: [
          "audit",
          "record",
          "confirm-franchise-reports",
          "--outcome",
          "finding",
          "--title",
          "No Public Information Report on file for the 2025 report year",
          "--detail",
          "Made-up example: the filed copies hold the 2025 franchise tax report, but no Public Information Report for that year.",
          "--due",
          "2026-12-15",
          "--by",
          "cpa",
        ],
        caption: "The CPA found one information report missing from the filed copies. It became a finding the CPA owns, with a date to fix it by.",
      },
      {
        args: ["audit", "record", "match-legal-name", "--outcome", "clear", "--evidence", "drafts/legal-name-comparison.pdf"],
        caption: "The agent compared the legal name across the filing, bank, tax and investor records, and every one matched.",
      },
      {
        args: ["audit", "record", "check-amendments-and-former-names", "--outcome", "clear", "--evidence", "drafts/amendment-history.pdf"],
        caption: "The agent checked the firm's amendments against its other records and found nothing out of step.",
      },
      {
        args: [
          "audit",
          "record",
          "check-assumed-names",
          "--outcome",
          "finding",
          "--title",
          "An assumed name in use has no certificate on file",
          "--detail",
          "Made-up example: the website and letterhead say Example Sponsor Partners, and the firm's files hold no assumed name certificate for it.",
          "--owner",
          "counsel",
          "--due",
          "2027-01-15",
        ],
        caption: "The agent found a trade name in use with no certificate on file, and named counsel as the one to fix it, with a due date.",
      },
      {
        args: [
          "audit",
          "record",
          "check-bank-accounts",
          "--outcome",
          "unverified",
          "--note",
          "Made-up example: only one of the two bank statements was supplied, so the second account's title and EIN were not compared.",
        ],
        caption: "One bank statement never arrived, so the agent recorded the check as unverified and said what was missing.",
      },
      {
        args: ["audit", "record", "confirm-boi-status", "--outcome", "clear", "--evidence", "drafts/fincen-boi-page.pdf"],
        caption: "The agent read the federal beneficial ownership page and confirmed the firm still has no report to file.",
      },
      {
        args: ["audit", "record", "confirm-counsel-client", "--outcome", "clear", "--evidence", "drafts/engagement-letter.pdf", "--by", "counsel"],
        caption: "Counsel confirmed whom it represents and recorded the check itself, which the agent could not do earlier.",
      },
      {
        args: ["audit", "record", "build-filing-calendar", "--outcome", "clear", "--evidence", "calendar.ics"],
        caption: "The agent built the filing calendar from the checks above. That was the last check.",
      },
      { args: ["audit", "score"], caption: "Every check has an answer now. The score counts what was verified, what was found and what could not be confirmed." },
      {
        args: ["finding", "fix", "f-1", "--note", "drafts/company-agreement-signed.pdf", "--by", "Alex Example"],
        caption: "Alex Example had the company agreement signed and recorded the first finding as fixed, with where the signed copy is.",
      },
      { args: ["audit", "score"], caption: "The fixed finding is off the open list; the score still shows every check as it was found." },
      { args: ["audit", "report"], caption: "The report is written: a findings file for a partner or counsel, and a to-do sheet for each person with something to fix." },
      { args: ["audit", "close"], caption: "The audit is closed. The two open findings stay on record until their owners fix them." },
    ],
    files: reportedFiles,
  },
];

// Writes the words the way a person types them, quoting what has spaces.
function typed(args: readonly string[]): string {
  return ["pcre", ...args.map((a) => (a === "" || /[\s"'`$\\;&|<>()*?#]/.test(a) ? `"${a.replace(/(["\\$`])/g, "\\$1")}"` : a))].join(" ");
}

function byOf(args: readonly string[]): string | null {
  const i = args.indexOf("--by");
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Writes the temp firm folder as "firm", with forward slashes in the rest of a
// path inside it, so the recording reads the same on every machine.
function scrubber(firmDir: string): (text: string) => string {
  const forms = [...new Set([firmDir, fs.realpathSync.native(firmDir), fs.realpathSync(firmDir)])].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(?:${forms.map(escapeRegExp).join("|")})((?:[\\\\/][^\\s"'\`]*)?)`, "g");
  return (text) => text.replace(pattern, (_, rest: string) => `firm${rest.replace(/\\/g, "/")}`);
}

export function recordDemo(): Promise<DemoRun> {
  return recordScenes(SCENES, { recordedOn: RECORDED_ON, now: PINNED_NOW, tz: PINNED_TZ });
}

// Runs every line of every scene through the real command line, in one fresh firm folder in
// the temp directory, with the clock and the time zone held at `pin`. tools/demo-llc.ts
// records its run with this too.
export async function recordScenes(scripts: readonly SceneScript[], pin: Pin): Promise<DemoRun> {
  const { runCli } = await import("../cli/run");
  const repoRoot = process.cwd();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "pcre-demo-"));
  const firmDir = path.join(parent, "firm");
  const previousTz = process.env.TZ;
  process.env.TZ = pin.tz;
  try {
    const clock = () => new Date(pin.now);
    const scenes: DemoScene[] = [];
    let scrub: ((text: string) => string) | null = null;
    for (const script of scripts) {
      const steps: DemoStep[] = [];
      for (const line of script.lines) {
        let stdout = "";
        let stderr = "";
        const exit = await runCli(line.args, {
          cwd: parent,
          env: { PCRE_FIRM: firmDir },
          repoRoot,
          stdout: (t) => (stdout += t),
          stderr: (t) => (stderr += t),
          now: clock,
        });
        if (stdout && stderr) throw new Error(`${typed(line.args)} wrote to both streams`);
        scrub ??= fs.existsSync(firmDir) ? scrubber(firmDir) : null;
        const output = scrub ? scrub(stdout + stderr) : stdout + stderr;
        steps.push({ command: typed(line.args), by: byOf(line.args), exit, output, caption: line.caption });
      }
      const files = (script.files?.(firmDir, steps) ?? []).map((f) => ({ path: f.path, text: scrub ? scrub(f.text) : f.text }));
      scenes.push({ id: script.id, title: script.title, summary: script.summary, steps, files });
    }
    const profile = JSON.parse(fs.readFileSync(path.join(firmDir, "firm.json"), "utf8")) as { name?: unknown };
    return demoRun.parse({ recordedOn: pin.recordedOn, firm: String(profile.name), scenes });
  } finally {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

export function demoJson(run: DemoRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

if (/demo-run\.ts$/.test(process.argv[1] ?? "")) {
  void (async () => {
    const repoRoot = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
    process.chdir(repoRoot);
    const run = await recordDemo();
    const out = path.join(repoRoot, DEMO_OUT);
    const next = demoJson(run);
    const before = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, next, "utf8");
    const steps = run.scenes.reduce((n, s) => n + s.steps.length, 0);
    console.log(`${before === next ? "OK  unchanged" : "OK  written"}: ${DEMO_OUT.split(path.sep).join("/")} (${run.scenes.length} scenes, ${steps} commands)`);
  })().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
