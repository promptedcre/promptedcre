import type { StepMark } from "../compute/site-facts";
import type { Playbook } from "../schemas/playbook";
import type { DemoRun, DemoScene, DemoStep } from "../schemas/demo";

// The recorded run (content/demo/run.json) as a board: one row per recorded
// command, in the words an operator uses. A command that names a playbook step
// or an audit check takes that step's or check's own title from the catalog,
// looked up by id; a command that names none takes a short fixed label below.
// Pure: pass the run and the catalog's playbooks. A name that does not resolve
// throws, so a renamed step fails the build and the test instead of rendering
// blank. Every value comes from the recording or the catalog; the only words
// written here are the fixed labels and the outcome lines, which say what the
// engine recorded and nothing more.

type BoardLane = "agent" | "person";

type OutcomeKind = "done" | "refused" | "clear" | "finding" | "unverified" | "approved" | "fixed" | "read";

// A row that a refused row points to, or the refused row a person's row picks up.
type BoardLink = {
  scene: string;
  sceneTitle: string;
  n: number;
  anchor: string;
  sameScene: boolean;
  whoInSentence: string; // who acted on the linked row, inside a sentence: "your agent", "Alex Example", "counsel"
};

export type BoardRow = {
  n: number; // 1-based, in the scene
  anchor: string; // the row's element id on /run
  lane: BoardLane;
  read: boolean; // the command only reads (a list, a status, a score): drawn as a thin row between the lanes
  mark: StepMark; // A, B (agent in a browser), H, O (a person offline), from the step's mode when it names one
  who: string; // "Your agent", or the person as recorded: "Alex Example", "The CPA", "Counsel"
  title: string;
  outcome: { kind: OutcomeKind; line: string };
  reason: string | null; // why the engine refused, in plain words; set on every refused row it recognizes
  result: string | null; // a read row's one-line result, where the output has one (the score)
  caption: string | null;
  path: { label: string; value: string } | null; // the proof, evidence or file the command names
  then: BoardLink | null; // on a refused row: where a person (or the approval) picks it up
  picksUp: BoardLink | null; // on a person's row: the refused row it completes
  command: string;
  output: string;
  exit: number;
};

export type BoardScene = { id: string; title: string; summary: string; rows: BoardRow[] };

const AGENT_WHO = "Your agent";

// The row's element id on /run: "run-step-5".
function boardAnchor(sceneId: string, n: number): string {
  return `${sceneId}-step-${n}`;
}

// ---------- The fixed labels ----------
// Work is named as the task, like a step's own title ("Set up the firm folder");
// the outcome line says what happened. A read is named as what was done.
const WORK_LABEL: Record<string, string> = {
  "firm init": "Set up the firm folder",
  "audit approve-lookups": "Approve public-record lookups",
  "audit report": "Write the audit report",
  "audit close": "Close the audit",
  "deadline compute": "Work out the filing dates",
  "deadline export": "Write the calendar file",
  "deal add": "Add a deal",
  "deal advance": "Move the deal to its next stage",
};

const READ_LABEL: Record<string, string> = {
  "firm status": "Read the firm's status",
  "run next": "Listed what is ready",
  "audit next": "Listed the checks that are ready",
  "audit score": "Counted the score",
  "deadline list": "Listed the open deadlines",
  "deal show": "Showed the deal's stages",
  "decision list": "Listed the decisions on record",
};

// Commands that name a step, a check, an audit or a finding: their title comes from the catalog.
const NAMED = new Set(["run done", "audit open", "audit record", "finding fix"]);

// Who a role is, in words: "cpa" reads "the CPA" in a sentence and "The CPA" as a name.
const ROLE_PHRASE: Record<string, string> = { cpa: "the CPA", counsel: "counsel", principal: "the principal" };
const ROLES = new Set(["principal", "counsel", "cpa", "lender", "title", "consultant", "investor", "broker", "agency"]);

function rolePhrase(role: string): string {
  return ROLE_PHRASE[role] ?? `the ${role}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Alex Example" stays a name; a role passed with --by reads as one ("The CPA", "Counsel").
function personWho(by: string): string {
  return ROLES.has(by) ? capitalize(rolePhrase(by)) : by;
}

// Inside a sentence a role stays lower case: "Recorded clear by counsel".
function inSentence(by: string | null): string {
  if (by === null) return "your agent";
  return ROLES.has(by) ? rolePhrase(by) : by;
}

// ---------- Reading a recorded command ----------
type Parsed = { key: string; args: string[]; flags: Record<string, string | true> };

function parseCommand(command: string): Parsed {
  const tokens = [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => ({ text: m[1] ?? m[2] ?? "", quoted: m[1] !== undefined }));
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (!t.quoted && t.text.startsWith("--")) {
      const next = tokens[i + 1];
      if (next && (next.quoted || !next.text.startsWith("--"))) {
        flags[t.text.slice(2)] = next.text;
        i += 1;
      } else flags[t.text.slice(2)] = true;
    } else words.push(t.text);
  }
  const [group = "", verb = "", ...args] = words;
  return { key: `${group} ${verb}`, args, flags };
}

function flag(p: Parsed, name: string): string | null {
  const v = p.flags[name];
  return typeof v === "string" ? v : null;
}

function count(output: string, re: RegExp): number | null {
  const m = re.exec(output);
  return m ? Number(m[1]) : null;
}

const LOOKS_LIKE_PATH = /^[\w.-]+(?:\/[\w.-]+)+$/;

// ---------- The catalog lookups ----------
type Subject = { playbook: Playbook; stepId: string | null };

function findPlaybook(playbooks: Playbook[], slug: string, where: string): Playbook {
  const pb = playbooks.find((p) => p.slug === slug);
  if (!pb) throw new Error(`${where}: the recording names playbook "${slug}", which is not in the catalog. Re-record with "npm run demo:record" or restore the playbook.`);
  return pb;
}

function stepOf(subject: Subject, where: string) {
  const step = subject.playbook.steps.find((s) => s.id === subject.stepId);
  if (!step) {
    throw new Error(
      `${where}: "${subject.playbook.slug}" has no step "${subject.stepId}". Re-record with "npm run demo:record" or restore the step.`,
    );
  }
  return step;
}

// ---------- The board ----------
// What the board needs to link a refusal to the row that picks it up; kept off the row.
type Meta = { subjectKey: string | null; refusal: "person-step" | "lookup" | "person-check" | "deal" | null; deal: string | null };
type Draft = { row: BoardRow; meta: Meta };

export function buildBoard(run: DemoRun, playbooks: Playbook[]): BoardScene[] {
  let audit: Playbook | null = null; // the audit opened most recently in the recording
  const findingCheck = new Map<string, string>(); // f-1 -> the check it was opened on
  const drafts: { scene: DemoScene; rows: Draft[] }[] = [];

  for (const scene of run.scenes) {
    const rows: Draft[] = scene.steps.map((step, i) => {
      const n = i + 1;
      const where = `content/demo/run.json, scene "${scene.id}", step ${n} (${step.command})`;
      const p = parseCommand(step.command);
      if (!NAMED.has(p.key) && !(p.key in WORK_LABEL) && !(p.key in READ_LABEL)) {
        throw new Error(`${where}: "pcre ${p.key}" has no plain label on the board. Add one to lib/demo/board.ts.`);
      }
      if (p.key === "audit open") audit = findPlaybook(playbooks, p.args[0] ?? "", where);
      const draft = draftRow(scene, step, n, p, where, playbooks, audit, findingCheck);
      const opened = /^(\S+): finding\s+\(opened (f-\d+),/m.exec(step.output);
      if (opened?.[1] && opened[2] && audit) findingCheck.set(opened[2], `${audit.slug}/${opened[1]}`);
      return draft;
    });
    drafts.push({ scene, rows });
  }

  // A refused row and the row where a person picks it up, in this scene or a later one.
  const flat = drafts.flatMap(({ scene, rows }) => rows.map(({ row, meta }) => ({ scene, row, meta })));
  const link = (scene: DemoScene, row: BoardRow, from: DemoScene): BoardLink => ({
    scene: scene.id,
    sceneTitle: scene.title,
    n: row.n,
    anchor: row.anchor,
    sameScene: scene.id === from.id,
    whoInSentence: inSentence(scene.steps[row.n - 1]?.by ?? null),
  });
  flat.forEach(({ scene, row, meta }, i) => {
    if (row.exit !== 1) return;
    const later = flat.slice(i + 1).filter((x) => x.row.lane === "person" && x.row.exit === 0);
    let found: (typeof flat)[number] | undefined;
    if (meta.refusal === "lookup") found = later.find((x) => x.scene.id === scene.id && x.row.command.startsWith("pcre audit approve-lookups"));
    else if (meta.refusal === "deal") found = later.find((x) => x.meta.deal === meta.deal && x.row.command.startsWith("pcre deal advance"));
    else if (meta.subjectKey) found = later.find((x) => x.meta.subjectKey === meta.subjectKey);
    if (!found) return;
    row.then = link(found.scene, found.row, scene);
    found.row.picksUp = link(scene, row, found.scene);
  });

  return drafts.map(({ scene, rows }) => ({ id: scene.id, title: scene.title, summary: scene.summary, rows: rows.map((d) => d.row) }));
}

function draftRow(
  scene: DemoScene,
  step: DemoStep,
  n: number,
  p: Parsed,
  where: string,
  playbooks: Playbook[],
  audit: Playbook | null,
  findingCheck: Map<string, string>,
): Draft {
  const lane: BoardLane = step.by === null ? "agent" : "person";
  const who = step.by === null ? AGENT_WHO : personWho(step.by);
  const refused = step.exit === 1;
  const read = p.key in READ_LABEL;
  let title = WORK_LABEL[p.key] ?? READ_LABEL[p.key] ?? "";
  let mark: StepMark = lane === "agent" ? "A" : "H";
  let subjectKey: string | null = null;
  let actorRole: string | null = null;
  let path: BoardRow["path"] = null;
  let deal: string | null = null;

  const takeStep = (playbook: Playbook, stepId: string) => {
    const s = stepOf({ playbook, stepId }, where);
    title = s.title;
    subjectKey = `${playbook.slug}/${s.id}`;
    actorRole = s.actor ?? null;
    const m: StepMark = s.mode === "agent" ? "A" : s.mode === "agent-browser" ? "B" : s.mode === "human-online" ? "H" : "O";
    if ((lane === "agent") === (m === "A" || m === "B")) mark = m;
  };
  const needAudit = (): Playbook => {
    if (!audit) throw new Error(`${where}: an audit check is named before any "pcre audit open" in the recording.`);
    return audit;
  };

  if (p.key === "run done") {
    takeStep(findPlaybook(playbooks, p.args[0] ?? "", where), p.args[1] ?? "");
  } else if (p.key === "audit open") {
    title = needAudit().title;
  } else if (p.key === "audit record") {
    takeStep(needAudit(), p.args[0] ?? "");
  } else if (p.key === "finding fix") {
    const key = findingCheck.get(p.args[0] ?? "");
    if (!key) throw new Error(`${where}: finding "${p.args[0]}" was not opened earlier in the recording.`);
    const [slug = "", stepId = ""] = key.split("/");
    takeStep(findPlaybook(playbooks, slug, where), stepId);
  } else if (p.key === "deal add" || p.key === "deal advance") {
    deal = p.args[0] ?? null;
    const label = flag(p, "label");
    if (p.key === "deal add" && label) title = `${title}: ${label}`;
  }

  // What happened, in one line.
  let kind: OutcomeKind = read ? "read" : "done";
  let line = read ? title : "Done";
  const by = step.by === null ? "" : ` by ${inSentence(step.by)}`;
  if (refused) {
    kind = "refused";
    line = "Refused";
  } else if (p.key === "run done") {
    const proof = flag(p, "proof");
    if (proof) path = { label: "Proof", value: proof };
    line = `Done${by}${proof ? ", proof recorded" : ""}`;
  } else if (p.key === "audit open") {
    const checks = count(step.output, /: (\d+) checks?\./);
    line = checks === null ? "Opened" : `Opened, ${checks} checks to work through`;
  } else if (p.key === "audit record") {
    const outcome = flag(p, "outcome");
    const evidence = flag(p, "evidence");
    if (evidence) path = { label: "Evidence", value: evidence };
    if (outcome === "clear") {
      kind = "clear";
      line = `Recorded clear${by}${evidence && !by ? ", with evidence" : ""}`;
    } else if (outcome === "finding") {
      kind = "finding";
      const opened = /\(opened f-\d+, \w+, ([\w-]+) fixes it\)/.exec(step.output);
      const owner = opened?.[1] ?? flag(p, "owner");
      const due = flag(p, "due");
      line = `Finding: ${owner ? rolePhrase(owner) : "a person"} to fix${due ? ` by ${due}` : ""}`;
    } else if (outcome === "unverified") {
      kind = "unverified";
      line = "Recorded as unverified";
    } else {
      throw new Error(`${where}: an audit record with outcome "${String(outcome)}" has no outcome line on the board.`);
    }
  } else if (p.key === "audit approve-lookups") {
    kind = "approved";
    line = `Approved${by}, once for the whole audit`;
  } else if (p.key === "finding fix") {
    kind = "fixed";
    const note = flag(p, "note");
    if (note && LOOKS_LIKE_PATH.test(note)) path = { label: "Proof", value: note };
    line = `Finding fixed${by}${path ? ", proof recorded" : ""}`;
  } else if (p.key === "audit report") {
    const files = step.output.match(/^\s+firm\/\S+$/gm)?.length ?? 0;
    line = files ? `Done, ${files === 1 ? "1 file" : `${files} files`} written` : "Done";
  } else if (p.key === "audit close") {
    line = "Closed";
  } else if (p.key === "deadline compute") {
    const added = count(step.output, /^Added (\d+)/m);
    line = added === null ? "Done" : `Done, ${added === 1 ? "1 date" : `${added} dates`} added`;
  } else if (p.key === "deadline export") {
    const m = /^Wrote (\d+) events? to (\S+)$/m.exec(step.output);
    if (m?.[2]) path = { label: "File", value: m[2] };
    line = m ? `Done, ${m[1]} events written` : "Done";
  } else if (!read && by) {
    line = `Done${by}`;
  }

  // Why the engine refused, from what it printed.
  let reason: string | null = null;
  let refusal: Meta["refusal"] = null;
  if (refused) {
    if (/is a step a person does/.test(step.output)) {
      refusal = "person-step";
      reason = `A person's step: ${actorRole ? rolePhrase(actorRole) : "a person"} records it.`;
    } else if (/reads a public record/.test(step.output)) {
      refusal = "lookup";
      reason = "A public-record lookup: a person approves lookups first, once for the audit.";
    } else if (/is a human check/.test(step.output)) {
      refusal = "person-check";
      reason = `A person's check: ${actorRole ? rolePhrase(actorRole) : "a person"} records it as clear.`;
    } else if (/only a person can advance/i.test(step.output)) {
      refusal = "deal";
      reason = "Moving a deal on is a person's decision.";
    }
  }

  // A read's one-line result, where it has one: the score, without the audit's id.
  const result = p.key === "audit score" ? (/^\S+: (.+)$/m.exec(step.output)?.[1] ?? null) : null;

  return {
    row: {
      n,
      anchor: boardAnchor(scene.id, n),
      lane,
      read,
      mark,
      who,
      title,
      outcome: { kind, line },
      reason,
      result,
      caption: step.caption,
      path,
      then: null,
      picksUp: null,
      command: step.command,
      output: step.output,
      exit: step.exit,
    },
    meta: { subjectKey, refusal, deal },
  };
}

// The rows as the board draws them: each piece of work on its own, and the reads
// that follow one another gathered into one thin band between the lanes.
type BoardItem = { kind: "work"; row: BoardRow } | { kind: "reads"; rows: BoardRow[] };

export function boardItems(rows: BoardRow[]): BoardItem[] {
  const items: BoardItem[] = [];
  for (const row of rows) {
    const last = items.at(-1);
    if (!row.read) items.push({ kind: "work", row });
    else if (last?.kind === "reads") last.rows.push(row);
    else items.push({ kind: "reads", rows: [row] });
  }
  return items;
}
