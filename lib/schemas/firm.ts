import { z } from "zod";
import { isoDate, jurisdiction, propertyType, ruleId, slug, structure } from "./common";
import { ACTORS } from "./playbook";

// The local firm file an agent keeps on the operator's own machine. Unknown is
// null, never a guess. It records where secrets live, never the secrets.
// Fields added after the first practitioner run are optional, so a file
// written before them still validates (D69).

export const firmProfile = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).nullable().describe("legal name of the firm's entity"),
    entity: z
      .object({
        type: z
          .enum(["llc", "series-llc", "lp", "corporation", "other"])
          .nullable()
          .describe("entity type of the firm; series-llc when its certificate of formation provides for series"),
        state: z.string().regex(/^[A-Z]{2}$/, "expected a two-letter state code").nullable().describe("state of formation, e.g. TX"),
        status: z
          .enum(["not-started", "filed", "formed", "forfeited", "terminated"])
          .nullable()
          .describe(
            "not-started; filed (sent to the state, not yet accepted); formed (the state accepted it); forfeited (the state forfeited its existence or its right to do business); terminated (its existence has ended)",
          ),
        formedOn: isoDate.nullable().describe("date the state accepted the filing"),
        fileNumber: z.string().min(1).nullable().optional().describe("the state's file number for the entity, from its filing evidence; a public record, not a tax id"),
        formerNames: z.array(z.string().min(1)).optional().describe("earlier legal names, oldest first, if the entity was renamed"),
        management: z.enum(["member-managed", "manager-managed"]).nullable().optional().describe("as the certificate of formation states it"),
        taxClassification: z
          .enum(["disregarded", "partnership", "s-corporation", "c-corporation"])
          .nullable()
          .optional()
          .describe("federal tax classification, as the CPA confirms it"),
        registeredAgent: z
          .object({
            name: z.string().min(1).nullable().describe("the agent named in the state's records"),
            office: z.string().min(1).nullable().describe("the registered office street address on file"),
            consent: z.string().min(1).nullable().describe("how the agent consented and where that consent is kept"),
            confirmedOn: isoDate.nullable().describe("last date the agent and office were checked against the state's records"),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict(),
    structure: structure.nullable(),
    propertyTypes: z.array(propertyType),
    jurisdictions: z.array(jurisdiction),
    principals: z.array(z.object({ name: z.string().min(1), role: z.string().min(1) }).strict()),
    series: z
      .array(
        z
          .object({
            name: z.string().min(1).describe("the series' name, as designated or as planned"),
            designatedOn: isoDate.nullable().describe("date the designation took effect; null until it has"),
            note: z.string().nullable(),
          })
          .strict(),
      )
      .optional()
      .describe("for a series LLC: each series, designated or planned"),
  })
  .strict();

export const firmDecisions = z
  .object({
    schemaVersion: z.literal(1),
    items: z.array(
      z
        .object({
          date: isoDate.nullable().describe("date of the decision; null when unknown, with what is known in the note"),
          decision: z.string().min(3),
          by: z.string().min(1),
          playbook: slug.nullable(),
          note: z.string().nullable(),
          subject: slug.nullable().optional().describe("the deal, offering or investor the decision is about, when it is about one"),
        })
        .strict(),
    ),
  })
  .strict();

export type FirmDecisions = z.infer<typeof firmDecisions>;

export const STEP_STATUSES = ["todo", "done", "skipped", "blocked", "not-applicable"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

const stepStatus = z
  .enum(STEP_STATUSES)
  .describe("todo; done; skipped (chosen not to do it); blocked (waiting on someone or something); not-applicable (does not fit this firm; say why in the note)");
const statusDate = isoDate.nullable().describe("for done, the date it was done; otherwise the date the status was set; null when unknown");
const who = z.string().min(1).describe('"agent", or the name or role of the person');

// One step's state. The last three fields were added with the engine and are
// optional, so a file written before them still validates.
const stepState = z
  .object({
    status: stepStatus,
    date: statusDate,
    note: z.string().nullable(),
    by: who.nullable().optional().describe("who did or recorded it"),
    proof: z.string().min(1).nullable().optional().describe("where the evidence is: a file path, a web address or a short description"),
    approvedBy: z.string().min(1).nullable().optional().describe("the person who approved it, for a step that needs approval"),
  })
  .strict();

// One run of one playbook: its steps, plus the approval a person gives once for
// the run's steps marked `standing`.
const playbookProgress = z
  .object({
    steps: z.record(slug, stepState),
    startedOn: isoDate.nullable().optional(),
    standingApproval: z
      .object({ by: z.string().min(1), date: isoDate })
      .strict()
      .nullable()
      .optional()
      .describe("a person's one-time approval for this run's steps marked standing"),
  })
  .strict();

export const SUBJECT_KINDS = ["deal", "offering", "investor", "property", "other"] as const;
export const SUBJECT_OUTCOMES = ["completed", "dropped"] as const;

// A subject is something the firm runs playbooks for more than once: a deal, an
// offering, an investor. Each carries its own runs, in the same shape as the
// firm's own.
const subject = z
  .object({
    kind: z.enum(SUBJECT_KINDS),
    label: z.string().min(1).describe("the firm's own name for it"),
    structure: structure.nullable().optional().describe("overrides the firm's structure for this subject's runs"),
    propertyType: propertyType.nullable().optional(),
    openedOn: isoDate.nullable(),
    closedOn: isoDate.nullable().optional(),
    outcome: z.enum(SUBJECT_OUTCOMES).nullable().optional().describe("how a closed subject ended: completed (the deal was bought, the offering closed) or dropped"),
    note: z.string().nullable().optional(),
    playbooks: z.record(slug, playbookProgress),
  })
  .strict();

export const firmProgress = z
  .object({
    schemaVersion: z.literal(1),
    playbooks: z.record(slug, playbookProgress),
    subjects: z.record(slug, subject).optional().describe("runs that belong to one deal, offering, investor or property"),
    other: z
      .array(
        z
          .object({
            task: z.string().min(3),
            status: stepStatus,
            date: statusDate,
            playbook: slug.nullable().describe("the playbook it relates to, if any"),
            note: z.string().nullable(),
          })
          .strict(),
      )
      .optional()
      .describe("work that is not a step in any playbook"),
  })
  .strict();

export const firmArtifacts = z
  .object({
    schemaVersion: z.literal(1),
    items: z.array(
      z
        .object({
          artifact: slug.describe("an artifact id from get_artifact when one fits, otherwise a short slug of your own"),
          path: z.string().min(1).nullable().describe("where the document is; null when it exists but its location is unknown"),
          date: isoDate.nullable(),
          note: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

// ---- Records the engine adds. Each file is optional: a firm folder without it is valid. ----

export const CHECK_OUTCOMES = ["clear", "finding", "unverified", "not-applicable"] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];
export const FINDING_STATUSES = ["open", "fixed", "accepted"] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;
// Who fixes a finding: a person in one of the playbooks' roles, or the agent.
export const FINDING_OWNERS = [...ACTORS, "agent"] as const;

const auditCheck = z
  .object({
    outcome: z.enum(CHECK_OUTCOMES).describe("clear; finding (something is wrong or missing); unverified (could not be confirmed, which never counts as clear); not-applicable"),
    date: isoDate.describe("the date it was checked"),
    by: who,
    evidence: z.string().min(1).nullable().describe("where the proof is: the public record and the date it was read, or the document's path"),
    note: z.string().nullable(),
  })
  .strict();

const finding = z
  .object({
    id: slug.describe("f-1, f-2 and so on, unique within the audit"),
    check: slug.describe("the check that produced it"),
    title: z.string().min(3),
    detail: z.string().nullable(),
    severity: z.enum(SEVERITIES),
    owner: z.enum(FINDING_OWNERS).describe("who fixes it"),
    due: isoDate.nullable(),
    status: z.enum(FINDING_STATUSES).describe("open; fixed; accepted (a person chose to live with it and said why)"),
    closedOn: isoDate.nullable(),
    note: z.string().nullable(),
  })
  .strict();

const audit = z
  .object({
    id: slug.describe("the audit playbook's slug plus the date it was opened"),
    playbook: slug,
    subject: slug.nullable().optional().describe("a subject id from progress.json; null or absent for the firm itself"),
    openedOn: isoDate,
    closedOn: isoDate.nullable(),
    lookupsApprovedBy: z.string().min(1).nullable().describe("the person who approved read-only public-record lookups for this audit; asked once"),
    lookupsApprovedOn: isoDate.nullable(),
    checks: z.record(slug, auditCheck),
    findings: z.array(finding),
  })
  .strict();

export const firmAudits = z.object({ schemaVersion: z.literal(1), audits: z.array(audit) }).strict();

export const DEADLINE_STATUSES = ["open", "done", "dismissed"] as const;
export const DEADLINE_SOURCES = ["calculator", "audit", "playbook", "manual"] as const;

const deadline = z
  .object({
    id: slug,
    title: z.string().min(3),
    due: isoDate,
    rule: ruleId.nullable().describe("the rule card the date comes from, when there is one"),
    source: z.enum(DEADLINE_SOURCES),
    basis: z.string().nullable().describe("how the date was worked out, in plain words"),
    needsReview: z.boolean().describe("true for every computed date: a person checks it before relying on it"),
    subject: slug.nullable().optional(),
    status: z.enum(DEADLINE_STATUSES).describe("open; done; dismissed (a person decided it does not apply and said why)"),
    closedOn: isoDate.nullable(),
    by: who.nullable().describe("who closed it"),
    note: z.string().nullable(),
  })
  .strict();

export const firmCalendar = z.object({ schemaVersion: z.literal(1), items: z.array(deadline) }).strict();

// One line of log.jsonl: every change the engine makes to the folder, in order.
export const firmLogEvent = z
  .object({
    at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, "expected an ISO date and time"),
    by: who,
    action: z.string().min(1).describe("the engine action, such as run.done"),
    process: z.string().nullable().describe("the state machine it moved, when it moved one"),
    target: z.string().nullable().describe("what changed: playbook/step, audit/check, a finding or a deadline id"),
    from: z.string().nullable(),
    to: z.string().nullable(),
    note: z.string().nullable(),
  })
  .strict();

export type FirmProfile = z.infer<typeof firmProfile>;
export type FirmProgress = z.infer<typeof firmProgress>;
export type PlaybookProgress = z.infer<typeof playbookProgress>;
export type StepState = z.infer<typeof stepState>;
export type FirmSubject = z.infer<typeof subject>;
export type FirmAudits = z.infer<typeof firmAudits>;
export type Audit = z.infer<typeof audit>;
export type AuditCheck = z.infer<typeof auditCheck>;
export type Finding = z.infer<typeof finding>;
export type FirmCalendar = z.infer<typeof firmCalendar>;
export type FirmDeadline = z.infer<typeof deadline>;
export type FirmLogEvent = z.infer<typeof firmLogEvent>;

// Strings that look like tax IDs, social security numbers or account numbers.
const EIN: [RegExp, string] = [/\b\d{2}-\d{7}\b/, "looks like an EIN"];
const SSN: [RegExp, string] = [/\b\d{3}-\d{2}-\d{4}\b/, "looks like a social security number"];
const ACCOUNT: [RegExp, string] = [/\b\d{9,17}\b/, "looks like an account or routing number"];

// Public identifiers shaped like account numbers: a state file number, an SEC
// accession number or a CIK. Labeled in text, or in the field made for them,
// they are not flagged. Anything shaped like a tax id is, whatever its label.
const PUBLIC_ID_IN_TEXT = /\b(?:(?:file|filing)\s*(?:no\.?|number|#)|accession(?:\s*(?:no\.?|number|#))?|cik(?:\s*(?:no\.?|number|#))?)\s*:?\s*[\d-]+/gi;
const PUBLIC_ID_KEYS = new Set(["fileNumber"]);

// Returns a message per string value that looks like a secret.
export function findSecrets(value: unknown, path: string[] = []): string[] {
  if (typeof value === "string") {
    const patterns = PUBLIC_ID_KEYS.has(path.at(-1) ?? "") ? [EIN, SSN] : [EIN, SSN, ACCOUNT];
    const text = value.replace(PUBLIC_ID_IN_TEXT, (m) => (EIN[0].test(m) || SSN[0].test(m) ? m : " "));
    for (const [pattern, label] of patterns) {
      if (pattern.test(text)) {
        return [`${path.join(".") || "(root)"}: ${label}; record where it lives, not the value`];
      }
    }
    return [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => findSecrets(v, [...path, `[${i}]`]));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => findSecrets(v, [...path, k]));
  }
  return [];
}
