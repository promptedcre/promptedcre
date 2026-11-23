import { z } from "zod";
import { isAgentStep, nearestPredecessors } from "../compute/metrics";
import { applicableSteps, isResearched, type Variant } from "../compute/variant";
import { isoDate } from "../schemas/common";
import { PHASE_LABEL } from "../labels";
import { CHECK_OUTCOMES, FINDING_OWNERS, FINDING_STATUSES, SEVERITIES, type Audit, type CheckOutcome, type FirmAudits, type Finding } from "../schemas/firm";
import { PHASES_NOT_AUDITED, readsPublicRecord, type Playbook, type Step } from "../schemas/playbook";
import { defineAction, findPlaybook, logEvent, readAudits, readProfile, readProgress, runsOf, variantFor, writeAudits, type AnyAction, type Ctx } from "./actions";
import { actorLabel, EngineError, isPerson, transition } from "./machine";
import { PROCESSES } from "./processes";

// Audit a firm: the `audit`, `check` and `finding` machines (lib/engine/processes.ts).
// An audit is one pass through an audit playbook's checks. A check records what
// is true; it never fixes anything. Everything lives in audits.json, and the
// score is counted from those records each time, never stored.

type Outcome = CheckOutcome | "unchecked";
type Owner = (typeof FINDING_OWNERS)[number];
type Severity = (typeof SEVERITIES)[number];
type OpenCounts = { high: number; medium: number; low: number; total: number };

const FOOTER = "Not legal, tax or investment advice. Each check lists its sources, or says it rests on common practice.";
const HUMAN_MODES = new Set(["human-online", "human-offline"]);

const auditArg = z.string().min(1).optional().describe("the audit's id; default: the latest open audit, else the latest audit");

// ---- Reading an audit against its playbook ----

type Scope = { audit: Audit; playbook: Playbook; variant: Variant; steps: Step[] };

// The audit machine's state is kept as closedOn, so it can never disagree with it.
function stateOf(audit: Audit): "open" | "closed" {
  return audit.closedOn ? "closed" : "open";
}

function outcomeOf(audit: Audit, checkId: string): Outcome {
  return audit.checks[checkId]?.outcome ?? "unchecked";
}

function scopeOf(ctx: Ctx, audit: Audit): Scope {
  const playbook = findPlaybook(ctx, audit.playbook, ["audit"]);
  const variant = variantFor(ctx, audit.subject ?? null);
  return { audit, playbook, variant, steps: applicableSteps(playbook, variant) };
}

function isHumanStep(s: Step): boolean {
  return HUMAN_MODES.has(s.mode);
}

// Who records the check: the agent for an agent step, otherwise the step's role.
function whoFor(s: Step): string {
  return isAgentStep(s) ? "agent" : (s.actor ?? "principal");
}

// Who fixes a finding by default: the role behind a human step, else the principal.
function defaultOwner(s: Step): Owner {
  return isHumanStep(s) ? (s.actor ?? "principal") : "principal";
}

// A standing approval on an audit step marks a check that reads a public record.
// The rule lives beside the step schema so the site's audit page reads the same one.
const needsLookups = readsPublicRecord;

function rulesFor(ctx: Ctx, s: Step): { id: string; title: string | null; url: string | null }[] {
  return s.rules.map((id) => {
    const card = ctx.corpus.rules.find((r) => r.id === id);
    return { id, title: card?.title ?? null, url: card?.citation.url ?? null };
  });
}

function sourcesFor(pb: Playbook, s: Step): { title: string; url: string }[] {
  return s.sources.flatMap((id) => {
    const src = pb.sources.find((x) => x.id === id);
    return src ? [{ title: src.title, url: src.url }] : [];
  });
}

// Earlier checks, inside the variant, that have no outcome yet.
function waitingOn(scope: Scope, s: Step): string[] {
  return nearestPredecessors(scope.playbook, s, scope.variant).filter((p) => outcomeOf(scope.audit, p) === "unchecked");
}

function readyIds(scope: Scope): string[] {
  return scope.steps.filter((s) => outcomeOf(scope.audit, s.id) === "unchecked" && waitingOn(scope, s).length === 0).map((s) => s.id);
}

function openCounts(findings: Finding[]): OpenCounts {
  const open = findings.filter((f) => f.status === "open");
  const of = (sev: Severity) => open.filter((f) => f.severity === sev).length;
  return { high: of("high"), medium: of("medium"), low: of("low"), total: open.length };
}

// ---- The score: a fixed rule over the records ----

export type AuditScore = {
  checks: number;
  clear: number;
  finding: number;
  unverified: number;
  unchecked: number;
  notApplicable: number;
  openFindings: OpenCounts;
  covers: string;
  // What this score says nothing about: the other audits, written or only listed, and
  // the parts of a firm's life no audit covers yet. A score is never read without it.
  notCovered: string[];
  line: string;
};

function notCovered(ctx: Ctx, playbook: Playbook): string[] {
  const others = ctx.corpus.playbooks.filter((p) => p.kind === "audit" && p.slug !== playbook.slug);
  const separate = others.filter((p) => p.depth === "full").map((p) => `${p.title} (a separate audit)`);
  const unwritten = others.filter((p) => p.depth !== "full").map((p) => `${p.title} (listed, not written yet)`);
  return [...separate, ...unwritten, ...PHASES_NOT_AUDITED.map((phase) => `${PHASE_LABEL[phase]} (no audit yet)`)];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function scoreOf(ctx: Ctx, scope: Scope): AuditScore {
  const counts = { clear: 0, finding: 0, unverified: 0, unchecked: 0, notApplicable: 0 };
  for (const s of scope.steps) {
    const o = outcomeOf(scope.audit, s.id);
    if (o === "not-applicable") counts.notApplicable += 1;
    else counts[o] += 1;
  }
  // Only clear counts as clear: unverified and unchecked stay in the denominator.
  const checks = scope.steps.length - counts.notApplicable;
  const parts = [
    `${counts.clear} of ${plural(checks, "check", "checks")} clear`,
    counts.finding > 0 ? plural(counts.finding, "finding", "findings") : null,
    counts.unverified > 0 ? `${counts.unverified} unverified` : null,
    counts.unchecked > 0 ? `${counts.unchecked} not checked yet` : null,
  ].filter((p): p is string => p !== null);
  return {
    checks,
    ...counts,
    openFindings: openCounts(scope.audit.findings),
    covers: scope.playbook.title,
    notCovered: notCovered(ctx, scope.playbook),
    line: parts.join(" · "),
  };
}

// The score when the playbook can be found; null when it cannot (firm check says why).
function tryScore(ctx: Ctx, audit: Audit): AuditScore | null {
  try {
    return scoreOf(ctx, scopeOf(ctx, audit));
  } catch (err) {
    if (err instanceof EngineError) return null;
    throw err;
  }
}

// ---- Finding the audit and the check to work on ----

// Most recently opened first: by date, then by position in the file.
function byRecency(audits: Audit[]): Audit[] {
  return audits
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.openedOn === y.a.openedOn ? y.i - x.i : x.a.openedOn < y.a.openedOn ? 1 : -1))
    .map((x) => x.a);
}

function currentAudit(file: FirmAudits, id?: string): Audit {
  if (id) {
    const found = file.audits.find((a) => a.id === id);
    if (!found) {
      throw new EngineError("not-found", `No audit "${id}". See them with "pcre audit list".`, { audit: id, audits: file.audits.map((a) => a.id) });
    }
    return found;
  }
  const recent = byRecency(file.audits);
  const pick = recent.find((a) => stateOf(a) === "open") ?? recent[0];
  if (!pick) {
    throw new EngineError("not-found", 'No audit yet. Open one with "pcre audit open <audit-playbook>", for example "pcre audit open audit-entity-standing".', {
      audits: [],
    });
  }
  return pick;
}

function stepOf(scope: Scope, checkId: string): Step {
  const s = scope.steps.find((x) => x.id === checkId);
  if (s) return s;
  const exists = scope.playbook.steps.some((x) => x.id === checkId);
  throw new EngineError(
    "not-found",
    exists
      ? `Check "${checkId}" does not apply to this firm (${scope.variant.structure}), so it is not part of this audit.`
      : `"${scope.playbook.title}" has no check "${checkId}". See the checks with "pcre audit show --audit ${scope.audit.id}".`,
    { audit: scope.audit.id, check: checkId, checks: scope.steps.map((x) => x.id) },
  );
}

function requireOpen(audit: Audit, doing: string): void {
  if (stateOf(audit) === "closed") {
    throw new EngineError("audit-closed", `Audit ${audit.id} is closed. To ${doing}, reopen it first: pcre audit reopen --audit ${audit.id} --note "<why>"`, {
      audit: audit.id,
    });
  }
}

function findingIn(audit: Audit, id: string): Finding {
  const f = audit.findings.find((x) => x.id === id);
  if (!f) {
    throw new EngineError("not-found", `Audit ${audit.id} has no finding "${id}". See them with "pcre finding list --audit ${audit.id}".`, {
      audit: audit.id,
      finding: id,
      findings: audit.findings.map((x) => x.id),
    });
  }
  return f;
}

function nextFindingId(audit: Audit): string {
  const max = Math.max(0, ...audit.findings.map((f) => Number(/^f-(\d+)$/.exec(f.id)?.[1] ?? 0)));
  return `f-${max + 1}`;
}

// Guard lookups-approved: an agent recording what a public record says needs
// a person's one approval for this audit first.
function checkLookups(ctx: Ctx, scope: Scope, s: Step): void {
  if (!isPerson(ctx.actor) && needsLookups(s) && !scope.audit.lookupsApprovedBy) {
    throw new EngineError(
      "guard-failed",
      `Check "${s.id}" reads a public record. Before an agent records it, a person approves lookups for this audit, once: ask them and wait. Once they say yes, record it in their name: pcre audit approve-lookups --audit ${scope.audit.id} --by "<name>"`,
      { guard: "lookups-approved", audit: scope.audit.id, check: s.id },
    );
  }
}

type FindingInput = { title: string; detail?: string; severity?: Severity; owner?: Owner; due?: string; note?: string };

function newFinding(audit: Audit, s: Step, input: FindingInput): Finding {
  return {
    id: nextFindingId(audit),
    check: s.id,
    title: input.title,
    detail: input.detail ?? null,
    severity: input.severity ?? s.risk,
    owner: input.owner ?? defaultOwner(s),
    due: input.due ?? null,
    status: "open",
    closedOn: null,
    note: input.note ?? null,
  };
}

function recordCommand(auditId: string, s: Step): string {
  const by = isAgentStep(s) ? "" : ' --by "<name>"';
  return `pcre audit record ${s.id} --audit ${auditId} --outcome clear --evidence "<where the proof is>"${by}`;
}

function auditRow(ctx: Ctx, a: Audit) {
  const pb = ctx.corpus.playbooks.find((p) => p.slug === a.playbook);
  return {
    id: a.id,
    playbook: a.playbook,
    title: pb?.title ?? null,
    subject: a.subject ?? null,
    state: stateOf(a),
    openedOn: a.openedOn,
    closedOn: a.closedOn,
    score: tryScore(ctx, a)?.line ?? null,
  };
}

// ---- Actions ----

const openAudit = defineAction({
  name: "audit.open",
  summary: "Open an audit of the firm (or of one subject) against an audit playbook.",
  process: "audit",
  mutates: true,
  input: z
    .object({
      playbook: z.string().min(1).describe("the audit playbook's slug, such as audit-entity-standing"),
      subject: z.string().min(1).optional().describe("a subject id, to audit one deal or offering instead of the firm"),
    })
    .strict(),
  positional: ["playbook"],
  run(ctx, args) {
    const other = ctx.corpus.playbooks.find((p) => p.slug === args.playbook && p.kind !== "audit");
    if (other) {
      const audits = ctx.corpus.playbooks.filter((p) => p.kind === "audit").map((p) => p.slug);
      throw new EngineError("not-found", `"${args.playbook}" is a ${other.kind} playbook, not an audit. Audit playbooks: ${audits.join(", ") || "none yet"}.`, {
        slug: args.playbook,
        audits,
      });
    }
    const pb = findPlaybook(ctx, args.playbook, ["audit"]);
    const subject = args.subject ?? null;
    if (subject) runsOf(readProgress(ctx), subject); // refuses, with what to do, when the subject is not there
    const variant = variantFor(ctx, subject);
    if (!isResearched(pb, variant)) {
      const why =
        pb.depth !== "full"
          ? `"${pb.title}" is listed but not written yet: it is an outline, with no checks to record.`
          : `"${pb.title}" is not written for ${variant.structure} in ${variant.jurisdictions.join(" and ")} yet.`;
      throw new EngineError("guard-failed", `${why} Nothing was opened.`, { guard: "playbook-is-written", playbook: pb.slug });
    }
    const file = readAudits(ctx);
    const clash = file.audits.find((a) => a.playbook === pb.slug && (a.subject ?? null) === subject && stateOf(a) === "open");
    if (clash) {
      throw new EngineError("already-exists", `Audit ${clash.id} of this playbook is already open. Work it with "pcre audit next --audit ${clash.id}", or close it first.`, {
        audit: clash.id,
      });
    }
    const base = `${pb.slug}-${ctx.date}`;
    let id = base;
    for (let n = 2; file.audits.some((a) => a.id === id); n++) id = `${base}-${n}`;
    const audit: Audit = { id, playbook: pb.slug, subject, openedOn: ctx.date, closedOn: null, lookupsApprovedBy: null, lookupsApprovedOn: null, checks: {}, findings: [] };
    file.audits.push(audit);
    writeAudits(ctx, file);
    logEvent(ctx, { action: "audit.open", process: "audit", target: id, from: null, to: "open" });
    const scope = scopeOf(ctx, audit);
    const lookups = scope.steps.filter(needsLookups).length;
    return {
      audit,
      checks: scope.steps.length,
      readPublicRecords: lookups,
      next: lookups > 0 ? `pcre audit approve-lookups --audit ${id} --by "<name>"` : `pcre audit next --audit ${id}`,
    };
  },
  text: (r) =>
    [
      `Opened audit ${r.audit.id}: ${r.checks} checks.`,
      r.readPublicRecords > 0
        ? `${r.readPublicRecords === 1 ? "1 check reads a public record" : `${r.readPublicRecords} checks read public records`}; a person approves lookups once.`
        : "No check reads a public record.",
      `Next: ${r.next}`,
    ].join("\n"),
});

const list = defineAction({
  name: "audit.list",
  summary: "Every audit of the firm, open and closed, most recent first, with its score.",
  process: "audit",
  mutates: false,
  input: z.object({}).strict(),
  run(ctx) {
    const items = byRecency(readAudits(ctx).audits).map((a) => auditRow(ctx, a));
    return { count: items.length, items };
  },
  text: (r) =>
    r.count === 0 ? 'No audits yet. Open one with "pcre audit open <audit-playbook>".' : r.items.map((a) => `${a.id}  ${a.state}  ${a.score ?? "cannot score: playbook missing"}`).join("\n"),
});

const show = defineAction({
  name: "audit.show",
  summary: "One audit in full: every check that applies, its outcome and evidence, and its findings.",
  process: "audit",
  mutates: false,
  input: z.object({ audit: auditArg }).strict(),
  run(ctx, args) {
    const audit = currentAudit(readAudits(ctx), args.audit);
    const scope = scopeOf(ctx, audit);
    const checks = scope.steps.map((s, i) => {
      const rec = audit.checks[s.id];
      return {
        n: i + 1,
        id: s.id,
        title: s.title,
        who: whoFor(s),
        mode: s.mode,
        needsLookupApproval: needsLookups(s),
        outcome: outcomeOf(audit, s.id),
        date: rec?.date ?? null,
        by: rec?.by ?? null,
        evidence: rec?.evidence ?? null,
        note: rec?.note ?? null,
        findings: audit.findings.filter((f) => f.check === s.id),
      };
    });
    return {
      id: audit.id,
      playbook: audit.playbook,
      title: scope.playbook.title,
      subject: audit.subject ?? null,
      state: stateOf(audit),
      openedOn: audit.openedOn,
      closedOn: audit.closedOn,
      lookupsApproved: audit.lookupsApprovedBy !== null,
      lookupsApprovedBy: audit.lookupsApprovedBy,
      lookupsApprovedOn: audit.lookupsApprovedOn,
      score: scoreOf(ctx, scope),
      checks,
    };
  },
  text: (r) =>
    [
      `${r.id} (${r.state}): ${r.title}`,
      r.score.line,
      `Lookups: ${r.lookupsApproved ? `approved by ${r.lookupsApprovedBy}` : "not approved yet"}`,
      ...r.checks.map((c) => `  ${String(c.n).padStart(2)}. ${c.outcome.padEnd(14)} ${c.id}${c.findings.length > 0 ? `  (${c.findings.map((f) => f.id).join(", ")})` : ""}`),
    ].join("\n"),
});

const approveLookups = defineAction({
  name: "audit.approve-lookups",
  summary: "A person approves read-only lookups of public records for this audit. Asked once.",
  process: "audit",
  mutates: true,
  input: z.object({ audit: auditArg }).strict(),
  run(ctx, args) {
    const file = readAudits(ctx);
    const audit = currentAudit(file, args.audit);
    const from = stateOf(audit);
    const move = transition(PROCESSES.audit, from, "approve-lookups", ctx.actor);
    if (audit.lookupsApprovedBy) {
      throw new EngineError("already-exists", `Lookups for ${audit.id} were already approved by ${audit.lookupsApprovedBy} on ${audit.lookupsApprovedOn ?? "an unrecorded date"}.`, {
        audit: audit.id,
      });
    }
    audit.lookupsApprovedBy = actorLabel(ctx.actor);
    audit.lookupsApprovedOn = ctx.date;
    writeAudits(ctx, file);
    logEvent(ctx, { action: "audit.approve-lookups", process: "audit", target: audit.id, from, to: move.to });
    return { audit: audit.id, lookupsApprovedBy: audit.lookupsApprovedBy, lookupsApprovedOn: audit.lookupsApprovedOn, next: `pcre audit next --audit ${audit.id}` };
  },
  text: (r) => `Lookups approved for ${r.audit} by ${r.lookupsApprovedBy}.\nNext: ${r.next}`,
});

const next = defineAction({
  name: "audit.next",
  summary: "The checks ready to record now: no outcome yet, and every earlier check recorded.",
  process: "check",
  mutates: false,
  input: z.object({ audit: auditArg }).strict(),
  run(ctx, args) {
    const audit = currentAudit(readAudits(ctx), args.audit);
    const scope = scopeOf(ctx, audit);
    const ready = new Set(readyIds(scope));
    const items = scope.steps
      .filter((s) => ready.has(s.id))
      .map((s) => ({
        id: s.id,
        title: s.title,
        who: whoFor(s),
        mode: s.mode,
        canAgentVerify: isAgentStep(s),
        needsLookupApproval: needsLookups(s),
        lookupsApproved: audit.lookupsApprovedBy !== null,
        instruction: s.instruction,
        rules: rulesFor(ctx, s).map((r) => ({ id: r.id, title: r.title })),
        sources: sourcesFor(scope.playbook, s),
        command: recordCommand(audit.id, s),
      }));
    const complete = scope.steps.every((s) => outcomeOf(audit, s.id) !== "unchecked");
    return { audit: audit.id, state: stateOf(audit), complete, count: items.length, items };
  },
  text: (r) =>
    r.complete
      ? `Every check in ${r.audit} has an outcome. Next: pcre audit report --audit ${r.audit}, then pcre audit close --audit ${r.audit}`
      : r.items
          .map(
            (c) =>
              `${c.id}: ${c.title}\n  ${c.canAgentVerify ? "an agent can verify it" : `a person (${c.who}) records it clear`}${c.needsLookupApproval && !c.lookupsApproved ? " · lookups need approval first" : ""}\n  ${c.command}`,
          )
          .join("\n"),
});

const record = defineAction({
  name: "audit.record",
  summary: "Record a check's outcome: clear (with evidence), finding (opens one), unverified or not-applicable (with a note).",
  process: "check",
  mutates: true,
  input: z
    .object({
      check: z.string().min(1).describe("the check's id"),
      outcome: z.enum(CHECK_OUTCOMES).describe("what is true"),
      audit: auditArg,
      evidence: z.string().min(1).optional().describe("where the proof is: the record and the date it was read, or a file path"),
      note: z.string().min(1).optional().describe("why; required for unverified and not-applicable"),
      title: z.string().min(3).optional().describe("for a finding: what is wrong or missing, in a line"),
      detail: z.string().min(1).optional().describe("for a finding: more about it"),
      severity: z.enum(SEVERITIES).optional().describe("for a finding; default: the check's risk"),
      owner: z.enum(FINDING_OWNERS).optional().describe("for a finding: who fixes it; default: the check's role, or principal"),
      due: isoDate.optional().describe("for a finding: when it should be fixed"),
    })
    .strict(),
  positional: ["check"],
  run(ctx, args) {
    const file = readAudits(ctx);
    const audit = currentAudit(file, args.audit);
    requireOpen(audit, "record a check");
    const scope = scopeOf(ctx, audit);
    const s = stepOf(scope, args.check);
    const waiting = waitingOn(scope, s);
    if (waiting.length > 0) {
      throw new EngineError("guard-failed", `Record the earlier check(s) first: ${waiting.join(", ")}. See "pcre audit next --audit ${audit.id}".`, {
        guard: "earlier-checks-recorded",
        waiting,
      });
    }
    const outcome = args.outcome;
    if (outcome === "clear" || outcome === "finding") checkLookups(ctx, scope, s);
    if (outcome === "clear" && !isPerson(ctx.actor) && isHumanStep(s)) {
      throw new EngineError(
        "guard-failed",
        `Check "${s.id}" is a human check: only a person can call it clear. The agent may record it as unverified (with a note saying why) or as a finding. Or ask the person to check it, and once they say it is clear, record it in their name with --by "<name>".`,
        { guard: "person-for-human-check", check: s.id, who: whoFor(s) },
      );
    }
    const openHere = audit.findings.filter((f) => f.check === s.id && f.status === "open").map((f) => f.id);
    if (outcome !== "finding" && openHere.length > 0) {
      throw new EngineError(
        "guard-failed",
        `Check "${s.id}" has open finding(s): ${openHere.join(", ")}. Fix or accept each first: pcre finding fix <id> --note "<where the proof is>", or a person runs pcre finding accept <id> --note "<why>".`,
        { guard: "no-open-findings", findings: openHere },
      );
    }
    const from = outcomeOf(audit, s.id);
    try {
      transition(PROCESSES.check, from, outcome, ctx.actor, args.note);
    } catch (err) {
      if (err instanceof EngineError && err.code === "transition-refused" && outcome === "finding") {
        throw new EngineError("transition-refused", `Check "${s.id}" is already a finding. Add another with: pcre finding add ${s.id} --audit ${audit.id} --title "<what>"`, err.details);
      }
      throw err;
    }
    if (outcome === "clear" && !args.evidence) {
      throw new EngineError("evidence-required", 'A clear check says where the proof is: add --evidence "<the record and the date it was read, or a file path>".', { check: s.id });
    }
    if (outcome === "finding" && !args.title) {
      throw new EngineError("title-required", 'A finding needs a one-line title: add --title "<what is wrong or missing>".', { check: s.id });
    }
    audit.checks[s.id] = { outcome, date: ctx.date, by: actorLabel(ctx.actor), evidence: args.evidence ?? null, note: args.note ?? null };
    const finding = args.title && outcome === "finding" ? newFinding(audit, s, { title: args.title, detail: args.detail, severity: args.severity, owner: args.owner, due: args.due }) : null;
    if (finding) audit.findings.push(finding);
    writeAudits(ctx, file);
    logEvent(ctx, { action: "audit.record", process: "check", target: `${audit.id}/${s.id}`, from, to: outcome, note: args.note ?? null });
    if (finding) logEvent(ctx, { action: "audit.record", process: "finding", target: `${audit.id}/${finding.id}`, from: null, to: "open", note: finding.title });
    return { audit: audit.id, check: { id: s.id, ...audit.checks[s.id] }, finding, score: scoreOf(ctx, scope), next: readyIds(scope) };
  },
  text: (r) =>
    [
      `${r.check.id}: ${r.check.outcome}${r.finding ? `  (opened ${r.finding.id}, ${r.finding.severity}, ${r.finding.owner} fixes it)` : ""}`,
      r.score.line,
      r.next.length > 0 ? `Ready now: ${r.next.join(", ")}` : "Nothing else is ready now.",
    ].join("\n"),
});

const addFinding = defineAction({
  name: "finding.add",
  summary: "Add one more finding to a check already recorded as a finding.",
  process: "finding",
  mutates: true,
  input: z
    .object({
      check: z.string().min(1).describe("the check's id"),
      title: z.string().min(3).describe("what is wrong or missing, in a line"),
      audit: auditArg,
      detail: z.string().min(1).optional().describe("more about it"),
      severity: z.enum(SEVERITIES).optional().describe("default: the check's risk"),
      owner: z.enum(FINDING_OWNERS).optional().describe("who fixes it; default: the check's role, or principal"),
      due: isoDate.optional().describe("when it should be fixed"),
      note: z.string().min(1).optional().describe("anything else worth keeping"),
    })
    .strict(),
  positional: ["check"],
  run(ctx, args) {
    const file = readAudits(ctx);
    const audit = currentAudit(file, args.audit);
    requireOpen(audit, "add a finding");
    const scope = scopeOf(ctx, audit);
    const s = stepOf(scope, args.check);
    const outcome = outcomeOf(audit, s.id);
    if (outcome !== "finding") {
      throw new EngineError(
        "wrong-state",
        `Check "${s.id}" is ${outcome}, not a finding. Record it as one first: pcre audit record ${s.id} --audit ${audit.id} --outcome finding --title "<what>"`,
        { check: s.id, outcome },
      );
    }
    checkLookups(ctx, scope, s);
    const finding = newFinding(audit, s, args);
    audit.findings.push(finding);
    writeAudits(ctx, file);
    logEvent(ctx, { action: "finding.add", process: "finding", target: `${audit.id}/${finding.id}`, from: null, to: "open", note: finding.title });
    return { audit: audit.id, finding, score: scoreOf(ctx, scope) };
  },
  text: (r) => `Opened ${r.finding.id} on ${r.finding.check}: ${r.finding.title} (${r.finding.severity}, ${r.finding.owner} fixes it)\n${r.score.line}`,
});

const listFindings = defineAction({
  name: "finding.list",
  summary: "The current audit's findings, or every audit's with --all, filtered by status or owner.",
  process: "finding",
  mutates: false,
  input: z
    .object({
      audit: auditArg,
      all: z.boolean().optional().describe("every audit's findings"),
      status: z.enum(FINDING_STATUSES).optional().describe("only findings in this state"),
      owner: z.enum(FINDING_OWNERS).optional().describe("only findings this role fixes"),
    })
    .strict(),
  run(ctx, args) {
    const file = readAudits(ctx);
    // A firm with no audit yet has no findings: that is an empty list, not a refusal.
    const audits = args.all || (file.audits.length === 0 && !args.audit) ? file.audits : [currentAudit(file, args.audit)];
    const items = audits.flatMap((a) => {
      const pb = ctx.corpus.playbooks.find((p) => p.slug === a.playbook);
      return a.findings
        .filter((f) => (!args.status || f.status === args.status) && (!args.owner || f.owner === args.owner))
        .map((f) => ({ audit: a.id, ...f, checkTitle: pb?.steps.find((s) => s.id === f.check)?.title ?? null }));
    });
    return { count: items.length, items };
  },
  text: (r) => (r.count === 0 ? "No findings." : r.items.map((f) => `${f.audit}/${f.id}  ${f.status.padEnd(8)} ${f.severity.padEnd(6)} ${f.owner.padEnd(10)} ${f.title}`).join("\n")),
});

function findingMove(action: "fix" | "accept" | "reopen", summary: string): AnyAction {
  const name = `finding.${action}`;
  return defineAction({
    name,
    summary,
    process: "finding",
    mutates: true,
    input: z
      .object({
        id: z.string().min(1).describe("the finding's id, such as f-1"),
        note: z.string().min(1).describe(action === "accept" ? "why the risk is accepted" : action === "fix" ? "where the proof of the fix is" : "why it is open again"),
        audit: auditArg,
      })
      .strict(),
    positional: ["id"],
    run(ctx, args) {
      const file = readAudits(ctx);
      const audit = currentAudit(file, args.audit);
      const f = findingIn(audit, args.id);
      const from = f.status;
      const move = transition(PROCESSES.finding, from, action, ctx.actor, args.note);
      f.status = move.to as Finding["status"];
      f.closedOn = action === "reopen" ? null : ctx.date;
      // Keep what was written when the finding was opened; add this move under it.
      const entry = `${action === "fix" ? "Fixed" : action === "accept" ? "Accepted" : "Reopened"} ${ctx.date} by ${actorLabel(ctx.actor)}: ${args.note}`;
      f.note = f.note ? `${f.note}\n${entry}` : entry;
      writeAudits(ctx, file);
      logEvent(ctx, { action: name, process: "finding", target: `${audit.id}/${f.id}`, from, to: f.status, note: args.note });
      return { audit: audit.id, finding: f, openFindings: openCounts(audit.findings) };
    },
    text: (r) => `${r.audit}/${r.finding.id}: ${r.finding.status}${r.finding.closedOn ? ` on ${r.finding.closedOn}` : ""}\n${plural(r.openFindings.total, "open finding", "open findings")} left in this audit.`,
  });
}

const score = defineAction({
  name: "audit.score",
  summary: "The audit's score, counted from the records by a fixed rule. Unverified never counts as clear.",
  process: "audit",
  mutates: false,
  input: z.object({ audit: auditArg }).strict(),
  run(ctx, args) {
    const audit = currentAudit(readAudits(ctx), args.audit);
    return { audit: audit.id, ...scoreOf(ctx, scopeOf(ctx, audit)) };
  },
  text: (r) =>
    `${r.audit}: ${r.line}\nOpen findings: ${r.openFindings.total} (${r.openFindings.high} high, ${r.openFindings.medium} medium, ${r.openFindings.low} low)\nCovers: ${r.covers}\nNot covered: ${r.notCovered.join("; ")}`,
});

// ---- The report ----

const cell = (s: string | null) => (s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function linksFor(ctx: Ctx, pb: Playbook, s: Step): string[] {
  return [...rulesFor(ctx, s).map((r) => (r.url ? `[${r.title ?? r.id}](${r.url})` : `rule card ${r.id}`)), ...sourcesFor(pb, s).map((x) => `[${x.title}](${x.url})`)];
}

function findingsFile(ctx: Ctx, scope: Scope, sc: AuditScore, firmName: string): string {
  const { audit, playbook } = scope;
  const lines = [
    `# ${playbook.title}`,
    "",
    `Audit ${audit.id} of ${audit.subject ? `subject ${audit.subject} of ` : ""}${firmName}. Opened ${audit.openedOn}; ${audit.closedOn ? `closed ${audit.closedOn}` : "still open"}. Written ${ctx.date}.`,
    "",
    `**Score:** ${sc.line}`,
    "",
    "## Findings",
    "",
  ];
  if (audit.findings.length === 0) lines.push("No findings.");
  else {
    lines.push("| id | severity | what | who fixes it | due | status |", "|---|---|---|---|---|---|");
    for (const f of audit.findings) lines.push(`| ${f.id} | ${f.severity} | ${cell(f.title)} | ${f.owner} | ${f.due ?? "not set"} | ${f.status} |`);
  }
  lines.push("", "## Checks", "");
  scope.steps.forEach((s, i) => {
    const rec = audit.checks[s.id];
    const outcome = outcomeOf(audit, s.id);
    lines.push(`${i + 1}. **${s.title}** (\`${s.id}\`): ${outcome === "unchecked" ? "not checked yet" : outcome}${rec ? `, ${rec.date}, by ${rec.by}` : ""}`);
    if (rec?.evidence) lines.push(`   Evidence: ${rec.evidence}`);
    if (rec?.note) lines.push(`   Note: ${rec.note}`);
    const links = linksFor(ctx, playbook, s);
    lines.push(`   Sources: ${links.length > 0 ? links.join(" · ") : "none listed for this check"}`);
  });
  lines.push("", FOOTER, "");
  return lines.join("\n");
}

function ownerSheet(ctx: Ctx, scope: Scope, owner: Owner, findings: Finding[], firmName: string): string {
  const lines = [
    `# Open findings for the ${owner}`,
    "",
    `From audit ${scope.audit.id} (${scope.playbook.title}) of ${firmName}, written ${ctx.date}. ${plural(findings.length, "finding is", "findings are")} yours to fix.`,
  ];
  for (const f of findings) {
    const s = scope.playbook.steps.find((x) => x.id === f.check);
    lines.push("", `## ${f.id}: ${f.title} (${f.severity})`, "", `What was found: ${f.detail ?? f.title}`, "");
    lines.push(`From the check: ${s ? `${s.title} (\`${s.id}\`)` : f.check}`, "");
    const links = s ? linksFor(ctx, scope.playbook, s) : [];
    lines.push(links.length > 0 ? "Rules and sources behind it:" : "Rules and sources behind it: none listed for this check.", ...links.map((l) => `- ${l}`));
    lines.push("", `Due: ${f.due ?? "no date set"}`);
  }
  lines.push("", FOOTER, "");
  return lines.join("\n");
}

const report = defineAction({
  name: "audit.report",
  summary: "Write the findings file, and one sheet for each role with open findings, into audit/<audit-id>/ in the firm folder. Changes no record.",
  process: "audit",
  mutates: true,
  input: z.object({ audit: auditArg }).strict(),
  run(ctx, args) {
    const audit = currentAudit(readAudits(ctx), args.audit);
    const scope = scopeOf(ctx, audit);
    const sc = scoreOf(ctx, scope);
    const firmName = readProfile(ctx).name ?? "the firm";
    const dir = `audit/${audit.id}`;
    const files: { kind: "findings" | "sheet"; owner: Owner | null; path: string }[] = [
      { kind: "findings", owner: null, path: ctx.store.writeText(`${dir}/findings.md`, findingsFile(ctx, scope, sc, firmName)) },
    ];
    const open = audit.findings.filter((f) => f.status === "open");
    const owners = FINDING_OWNERS.filter((o) => open.some((f) => f.owner === o));
    for (const owner of owners) {
      const sheet = ownerSheet(ctx, scope, owner, open.filter((f) => f.owner === owner), firmName);
      files.push({ kind: "sheet", owner, path: ctx.store.writeText(`${dir}/sheet-${owner}.md`, sheet) });
    }
    logEvent(ctx, { action: "audit.report", process: null, target: audit.id, note: `wrote ${files.length} file(s) to ${dir}` });
    return { audit: audit.id, dir: ctx.store.file(dir), files, findings: audit.findings.length, openFindings: open.length, sheets: owners.length, score: sc.line };
  },
  text: (r) => [`Wrote ${r.files.length} file(s) for ${r.audit}:`, ...r.files.map((f) => `  ${f.path}`), r.score].join("\n"),
});

const close = defineAction({
  name: "audit.close",
  summary: "Close the audit once every check that applies has an outcome. Findings may stay open.",
  process: "audit",
  mutates: true,
  input: z.object({ audit: auditArg }).strict(),
  run(ctx, args) {
    const file = readAudits(ctx);
    const audit = currentAudit(file, args.audit);
    const scope = scopeOf(ctx, audit);
    const unchecked = scope.steps.filter((s) => outcomeOf(audit, s.id) === "unchecked").map((s) => s.id);
    if (unchecked.length > 0) {
      throw new EngineError("guard-failed", `Not every check has an outcome yet. Still unchecked: ${unchecked.join(", ")}. See "pcre audit next --audit ${audit.id}".`, {
        guard: "every-check-recorded",
        unchecked,
      });
    }
    const from = stateOf(audit);
    const move = transition(PROCESSES.audit, from, "close", ctx.actor);
    audit.closedOn = ctx.date;
    writeAudits(ctx, file);
    logEvent(ctx, { action: "audit.close", process: "audit", target: audit.id, from, to: move.to });
    return { audit: audit.id, state: stateOf(audit), closedOn: audit.closedOn, score: scoreOf(ctx, scope) };
  },
  text: (r) => `Closed ${r.audit} on ${r.closedOn}.\n${r.score.line}\n${plural(r.score.openFindings.total, "open finding stays", "open findings stay")} on record.`,
});

const reopen = defineAction({
  name: "audit.reopen",
  summary: "Open a closed audit again to re-check something.",
  process: "audit",
  mutates: true,
  input: z.object({ note: z.string().min(1).describe("why it is opened again"), audit: auditArg }).strict(),
  run(ctx, args) {
    const file = readAudits(ctx);
    const audit = currentAudit(file, args.audit);
    const from = stateOf(audit);
    const move = transition(PROCESSES.audit, from, "reopen", ctx.actor, args.note);
    audit.closedOn = null;
    writeAudits(ctx, file);
    logEvent(ctx, { action: "audit.reopen", process: "audit", target: audit.id, from, to: move.to, note: args.note });
    return { audit: audit.id, state: stateOf(audit), next: `pcre audit next --audit ${audit.id}` };
  },
  text: (r) => `Reopened ${r.audit}.\nNext: ${r.next}`,
});

export const auditActions: AnyAction[] = [
  openAudit,
  list,
  show,
  approveLookups,
  next,
  record,
  score,
  report,
  close,
  reopen,
  addFinding,
  listFindings,
  findingMove("fix", "Record that a finding is fixed, and where the proof is."),
  findingMove("accept", "A person accepts a finding's risk instead of fixing it, and says why."),
  findingMove("reopen", "Open a fixed or accepted finding again."),
];

// What `pcre firm status` shows for audits.
export function auditSummary(ctx: Ctx): { open: number; closed: number; openFindings: OpenCounts; latest: { id: string; line: string | null } | null } {
  const audits = readAudits(ctx).audits;
  const latest = byRecency(audits)[0];
  return {
    open: audits.filter((a) => stateOf(a) === "open").length,
    closed: audits.filter((a) => stateOf(a) === "closed").length,
    openFindings: openCounts(audits.flatMap((a) => a.findings)),
    latest: latest ? { id: latest.id, line: tryScore(ctx, latest)?.line ?? null } : null,
  };
}

// Problems `pcre firm check` reports for audit records beyond their schema.
export function auditProblems(ctx: Ctx): string[] {
  const out: string[] = [];
  for (const a of readAudits(ctx).audits) {
    const where = `audits.json › ${a.id}`;
    const pb = ctx.corpus.playbooks.find((p) => p.slug === a.playbook);
    if (!pb) {
      out.push(`${where}: no playbook "${a.playbook}"`);
      continue;
    }
    if (pb.kind !== "audit") {
      out.push(`${where}: "${a.playbook}" is a ${pb.kind} playbook, not an audit`);
      continue;
    }
    const ids = new Set(pb.steps.map((s) => s.id));
    for (const c of Object.keys(a.checks)) if (!ids.has(c)) out.push(`${where} › ${c}: no such check in ${a.playbook}`);
    const seen = new Set<string>();
    for (const f of a.findings) {
      if (!ids.has(f.check)) out.push(`${where} › ${f.id}: its check "${f.check}" is not in ${a.playbook}`);
      if (seen.has(f.id)) out.push(`${where} › ${f.id}: the finding id is used more than once`);
      seen.add(f.id);
    }
  }
  return out;
}
