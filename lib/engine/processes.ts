import type { ProcessDef, Transition, Who } from "./machine";

// Every process the engine runs, as data. This file is the one place states and
// transitions are defined: the process modules read it, the process map and the
// command help are written from it, and a test checks each definition is sound.

type Opts = { note?: boolean; guards?: readonly string[]; automatic?: boolean };

function move(action: string, from: readonly string[], to: string, who: Who, what: string, opts: Opts = {}): Transition {
  return { action, from, to, who, what, needsNote: opts.note ?? false, guards: opts.guards ?? [], automatic: opts.automatic ?? false };
}

// What each named guard means. A process module implements the check; the
// wording here is what a person or an agent reads when a move is refused.
export const GUARDS = {
  "playbook-is-written": "The playbook is written at full depth. An outline has no steps to run.",
  "predecessors-resolved": "Every step this one comes after is done, skipped or not applicable.",
  "person-for-human-step":
    "A step marked human is recorded in a person's name, never the agent's. The agent hands it over and records it once the person says it is done; the name is its word, not proof.",
  "approval-recorded":
    "A step that needs approval names the person who approved it: each time for every-run, once per run for standing. A signature step is recorded in the signer's name. The agent asks first and gives a name only after that person says yes.",
  "every-step-resolved": "Every step that applies is done, skipped or not applicable.",
  "earlier-checks-recorded": "Every check this one comes after has an outcome.",
  "person-for-human-check":
    "A human check is recorded as clear only in a person's name, once that person says it is clear. An agent may record it as a finding or as unverified.",
  "lookups-approved":
    "Before an agent records a check that reads a public record, a lookup approval for this audit is recorded in a person's name, once that person says yes.",
  "no-open-findings": "The check has no open finding. Fix or accept the finding first.",
  "every-check-recorded": "Every check that applies has an outcome.",
  "stage-complete": "The deal's current acquisition playbook is complete: every step that applies is done, skipped or not applicable.",
  "next-playbook-written": "The next acquisition playbook is written at full depth for this deal's structure.",
  "track-complete": "Every acquisition playbook in the track is complete for this deal.",
} as const;

export type GuardId = keyof typeof GUARDS;

const run: ProcessDef = {
  id: "run",
  name: "Playbook run",
  what: "One playbook worked through for the firm, or for one of its subjects (a deal, an offering, an investor).",
  record: "progress.json: playbooks.<playbook>, or subjects.<subject>.playbooks.<playbook>",
  initial: "not-started",
  kind: "derived",
  states: {
    "not-started": "No run of this playbook exists yet.",
    open: "Started. At least one step that applies is still to do or blocked.",
    complete: "Every step that applies is done, skipped or not applicable.",
  },
  transitions: [
    move("start", ["not-started"], "open", "either", "Open a run of a playbook.", { guards: ["playbook-is-written"] }),
    move("approve", ["open"], "open", "person", "Give the one approval that covers this run's steps marked standing."),
    move("complete", ["open"], "complete", "either", "The last open step is resolved.", { automatic: true, guards: ["every-step-resolved"] }),
    move("resume", ["complete"], "open", "either", "A step is reopened.", { automatic: true }),
  ],
};

const step: ProcessDef = {
  id: "step",
  name: "Step",
  what: "One step of a run.",
  record: "progress.json: the run's steps.<step>",
  initial: "todo",
  kind: "stored",
  states: {
    todo: "Not done yet.",
    done: "Done, with the date, who did it and where the proof is.",
    blocked: "Waiting on someone or something; the note says what.",
    skipped: "A person chose not to do it; the note says why.",
    "not-applicable": "It does not fit this firm; the note says why.",
  },
  transitions: [
    move("done", ["todo", "blocked"], "done", "either", "Record the step as done.", {
      guards: ["predecessors-resolved", "person-for-human-step", "approval-recorded"],
    }),
    move("block", ["todo"], "blocked", "either", "Mark the step as waiting on someone or something.", { note: true }),
    move("unblock", ["blocked"], "todo", "either", "The wait is over; the step can be done."),
    move("skip", ["todo", "blocked"], "skipped", "person", "Decide not to do the step.", { note: true }),
    move("not-applicable", ["todo", "blocked"], "not-applicable", "either", "Record that the step does not fit this firm.", { note: true }),
    move("reopen", ["done", "skipped", "not-applicable"], "todo", "either", "Put the step back to do.", { note: true }),
  ],
};

const subject: ProcessDef = {
  id: "subject",
  name: "Subject",
  what: "Something the firm runs playbooks for more than once: a deal, an offering, an investor, a property.",
  record: "progress.json: subjects.<subject>",
  initial: "open",
  kind: "stored",
  states: {
    open: "Active. Runs can be started and worked for it.",
    closed: "Finished or dropped. Its runs stay on record.",
  },
  transitions: [
    move("close", ["open"], "closed", "either", "Close the subject: the deal closed or died, the offering ended.", { note: true }),
    move("reopen", ["closed"], "open", "either", "Open it again.", { note: true }),
  ],
};

const audit: ProcessDef = {
  id: "audit",
  name: "Audit",
  what: "One pass through an audit playbook's checks, for a firm that already exists.",
  record: "audits.json: audits[]",
  initial: "open",
  kind: "stored",
  states: {
    open: "Checks are being recorded.",
    closed: "Every check that applies has an outcome. Findings may still be open.",
  },
  transitions: [
    move("approve-lookups", ["open"], "open", "person", "Approve read-only lookups of public records for this audit. Asked once."),
    move("close", ["open"], "closed", "either", "Close the audit.", { guards: ["every-check-recorded"] }),
    move("reopen", ["closed"], "open", "either", "Open the audit again to re-check something.", { note: true }),
  ],
};

const OUTCOME_GUARDS = ["earlier-checks-recorded", "lookups-approved"] as const;

const check: ProcessDef = {
  id: "check",
  name: "Check",
  what: "One check of an audit. A check records what is true; it never fixes anything.",
  record: "audits.json: the audit's checks.<check>",
  initial: "unchecked",
  kind: "stored",
  states: {
    unchecked: "Not looked at yet.",
    clear: "Verified, with where the proof is.",
    finding: "Something is wrong or missing. A finding is opened for it.",
    unverified: "Could not be confirmed. It never counts as clear.",
    "not-applicable": "It does not fit this firm; the note says why.",
  },
  transitions: [
    move("clear", ["unchecked", "unverified", "finding", "not-applicable"], "clear", "either", "Record the check as verified.", {
      guards: [...OUTCOME_GUARDS, "person-for-human-check", "no-open-findings"],
    }),
    move("finding", ["unchecked", "clear", "unverified", "not-applicable"], "finding", "either", "Record that something is wrong or missing.", {
      guards: OUTCOME_GUARDS,
    }),
    move("unverified", ["unchecked", "clear", "finding", "not-applicable"], "unverified", "either", "Record that it could not be confirmed, and why.", {
      note: true,
      guards: ["earlier-checks-recorded", "no-open-findings"],
    }),
    move("not-applicable", ["unchecked", "clear", "finding", "unverified"], "not-applicable", "either", "Record that the check does not fit this firm.", {
      note: true,
      guards: ["no-open-findings"],
    }),
  ],
};

const finding: ProcessDef = {
  id: "finding",
  name: "Finding",
  what: "One thing an audit found wrong or missing, with who fixes it and by when.",
  record: "audits.json: the audit's findings[]",
  initial: "open",
  kind: "stored",
  states: {
    open: "Not fixed yet.",
    fixed: "Fixed; the note says where the proof is.",
    accepted: "A person chose to live with it; the note says why.",
  },
  transitions: [
    move("fix", ["open"], "fixed", "either", "Record that it is fixed, and where the proof is.", { note: true }),
    move("accept", ["open"], "accepted", "person", "Accept the risk instead of fixing it.", { note: true }),
    move("reopen", ["fixed", "accepted"], "open", "either", "Open it again.", { note: true }),
  ],
};

const deadline: ProcessDef = {
  id: "deadline",
  name: "Deadline",
  what: "One dated duty. Overdue, due soon and upcoming are worked out from the date each time; they are not stored.",
  record: "calendar.json: items[]",
  initial: "open",
  kind: "stored",
  states: {
    open: "Still to be met.",
    done: "Met; the record says when and by whom.",
    dismissed: "A person decided it does not apply; the note says why.",
  },
  transitions: [
    move("done", ["open"], "done", "either", "Record that the duty was met."),
    move("dismiss", ["open"], "dismissed", "person", "Decide the deadline does not apply.", { note: true }),
    move("reopen", ["done", "dismissed"], "open", "either", "Open it again.", { note: true }),
  ],
};

const deal: ProcessDef = {
  id: "deal",
  name: "Deal",
  what: "A deal moving through the acquisition playbooks in order. A deal is a subject of kind deal. Its stage is the first acquisition playbook it has not finished, worked out from its runs each time.",
  record: "progress.json: subjects.<deal> (closedOn and outcome); decisions.json holds each decision to go on or to drop",
  initial: "active",
  kind: "stored",
  states: {
    active: "Being worked. Its stage is the first acquisition playbook not yet complete.",
    completed: "Bought: every acquisition playbook is complete and the deal is closed.",
    dropped: "A person decided not to go on; the decision and the reason are on record.",
  },
  transitions: [
    move("advance", ["active"], "active", "person", "Decide to go on: record the decision and start the next acquisition playbook.", {
      note: true,
      guards: ["stage-complete", "next-playbook-written"],
    }),
    move("drop", ["active"], "dropped", "person", "Decide not to go on, at any stage.", { note: true }),
    move("complete", ["active"], "completed", "either", "Close the deal as bought.", { guards: ["track-complete"] }),
    move("reopen", ["completed", "dropped"], "active", "either", "Open the deal again.", { note: true }),
  ],
};

export const PROCESSES = { run, step, subject, audit, check, finding, deadline, deal } as const;
export type ProcessId = keyof typeof PROCESSES;

// The processes an operator runs, each made of one or more of the machines above.
export const WORKFLOWS = [
  {
    id: "run-a-playbook",
    name: "Run a playbook",
    what: "Work a playbook step by step for the firm or for one deal: see what is next, who does it, what needs approval, and record each step with its proof.",
    machines: ["run", "step", "subject"],
    commands: ["run", "subject"],
    guide: "docs/guides/run-a-playbook.md",
  },
  {
    id: "audit-a-firm",
    name: "Audit a firm",
    what: "Check a firm that already exists against an audit playbook: record each check as clear, a finding or unverified, then get the score, the findings and a sheet for each person who has something to fix.",
    machines: ["audit", "check", "finding"],
    commands: ["audit", "finding"],
    guide: "docs/guides/audit-a-firm.md",
  },
  {
    id: "track-deadlines",
    name: "Track deadlines",
    what: "Keep the firm's dated duties in one calendar: add them by hand or from the deadline calculator, see what is overdue or due soon, and export a calendar file.",
    machines: ["deadline"],
    commands: ["deadline"],
    guide: "docs/guides/track-deadlines.md",
  },
  {
    id: "move-a-deal",
    name: "Move a deal from screen to close",
    what: "Take one deal through the acquisition playbooks in order: see every deal's stage, record each decision to go on or to drop, and start the next playbook when a person says go.",
    machines: ["deal"],
    commands: ["deal", "decision"],
    guide: "docs/guides/move-a-deal.md",
  },
] as const satisfies readonly { id: string; name: string; what: string; machines: readonly ProcessId[]; commands: readonly string[]; guide: string }[];

export type WorkflowId = (typeof WORKFLOWS)[number]["id"];
