import type { Playbook } from "../schemas/playbook";
import type { Source } from "../schemas/common";
import type { Corpus } from "./load";

// Cross-record rules zod cannot express. Errors fail the build; warnings print.

export type CheckResult = { errors: string[]; warnings: string[] };

export const STALE_DAYS = 180;
export const MAX_QUOTE_WORDS = 25;
export const MAX_INSTRUCTION_WORDS = 150;
export const MAX_RULE_WORDS = 110;

const HUMAN_MODES = new Set(["human-online", "human-offline"]);
const EFFORT_UNITS = new Set(["minutes", "hours"]);
const ELAPSED_UNITS = new Set(["hours", "business-days", "days", "weeks"]);

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function ageInDays(isoDate: string, today: Date): number {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((now - then) / 86_400_000);
}

function checkSources(where: string, sources: Source[], today: Date, out: CheckResult): void {
  const ids = new Set<string>();
  for (const s of sources) {
    if (ids.has(s.id)) out.errors.push(`${where}: duplicate source id "${s.id}"`);
    ids.add(s.id);
    if (s.quote && wordCount(s.quote) > MAX_QUOTE_WORDS) {
      out.errors.push(`${where}: source "${s.id}" quotes more than ${MAX_QUOTE_WORDS} words`);
    }
    const age = ageInDays(s.accessed, today);
    if (age < 0) out.errors.push(`${where}: source "${s.id}" has an access date in the future`);
    else if (age > STALE_DAYS) out.warnings.push(`${where}: source "${s.id}" was last opened ${age} days ago`);
  }
}

function checkPlaybook(pb: Playbook, c: Corpus, today: Date, out: CheckResult): void {
  const where = `playbook ${pb.id}`;
  const playbookIds = new Set(c.playbooks.map((p) => p.id));
  const artifactIds = new Set(c.artifacts.map((a) => a.id));
  const ruleIds = new Set(c.rules.map((r) => r.id));
  const calcIds = new Set(c.calculators.map((x) => x.id));
  const marketIds = new Set(c.markets.map((m) => m.id));

  if (pb.id !== pb.slug) out.errors.push(`${where}: id and slug must match`);
  if (pb.kind === "situation" && !pb.situation) out.errors.push(`${where}: a situation needs a trigger and urgency`);
  if (pb.kind !== "situation" && pb.situation) out.errors.push(`${where}: only situations carry a trigger`);
  for (const r of pb.requires) {
    if (r === pb.id) out.errors.push(`${where}: requires itself`);
    else if (!playbookIds.has(r)) out.errors.push(`${where}: requires unknown playbook "${r}"`);
  }
  for (const a of [...pb.consumes, ...pb.produces]) {
    if (!artifactIds.has(a)) out.errors.push(`${where}: unknown artifact "${a}"`);
  }
  if ((pb.summary.match(/[.!?](\s|$)/g) ?? []).length > 2) {
    out.warnings.push(`${where}: summary runs past two sentences`);
  }

  if (pb.depth === "outline") {
    // outlines carry a title, a summary and at most step titles; steps belong to full depth
    if (pb.steps.length > 0) out.errors.push(`${where}: outline playbooks carry step titles only, not steps`);
    return;
  }
  if (pb.outlineSteps.length > 0) out.errors.push(`${where}: full playbooks use steps, not outline step titles`);

  if (pb.steps.length === 0) out.errors.push(`${where}: full depth needs steps`);
  if (!pb.lastVerified) out.errors.push(`${where}: full depth needs lastVerified`);
  else if (ageInDays(pb.lastVerified, today) < 0) out.errors.push(`${where}: lastVerified is in the future`);
  if (pb.written.structure.length === 0 || pb.written.jurisdiction.length === 0) {
    out.errors.push(`${where}: full depth must say which structures and jurisdictions were written`);
  }

  checkSources(where, pb.sources, today, out);
  const sourceById = new Map(pb.sources.map((s) => [s.id, s]));
  const seen = new Set<string>();

  for (const step of pb.steps) {
    const at = `${where} › step ${step.id}`;
    if (seen.has(step.id)) out.errors.push(`${at}: duplicate step id`);
    for (const p of step.after) {
      if (p === step.id) out.errors.push(`${at}: comes after itself`);
      else if (!pb.steps.some((s) => s.id === p)) out.errors.push(`${at}: comes after unknown step "${p}"`);
      else if (!seen.has(p)) out.errors.push(`${at}: comes after "${p}", which is listed later; list steps in dependency order`);
    }
    seen.add(step.id);

    for (const s of step.when?.structure ?? []) {
      if (!pb.written.structure.includes(s)) out.errors.push(`${at}: applies to ${s}, which this playbook has not researched`);
    }
    for (const r of step.rules) if (!ruleIds.has(r)) out.errors.push(`${at}: unknown rule "${r}"`);
    for (const x of step.calculators) if (!calcIds.has(x)) out.errors.push(`${at}: unknown calculator "${x}"`);
    if (step.market && !marketIds.has(step.market)) out.errors.push(`${at}: unknown market "${step.market}"`);
    for (const a of [...step.consumes, ...step.produces]) {
      if (!artifactIds.has(a)) out.errors.push(`${at}: unknown artifact "${a}"`);
    }

    const human = HUMAN_MODES.has(step.mode);
    if (human && !step.actor) out.errors.push(`${at}: a human step names its actor`);
    if (!human && step.licensed) out.errors.push(`${at}: licensed work is a human step`);
    if (!human && step.approval === "signature") out.errors.push(`${at}: signatures are always human`);

    if (step.basis === "cited") {
      if (step.sources.length === 0) out.errors.push(`${at}: cited steps list at least one source`);
      const resolved = step.sources.map((id) => sourceById.get(id));
      step.sources.forEach((id, i) => {
        if (!resolved[i]) out.errors.push(`${at}: unknown source "${id}"`);
      });
      if (resolved.length > 0 && !resolved.some((s) => s?.tier === "primary")) {
        out.errors.push(`${at}: cited steps need at least one primary source`);
      }
    }

    if (step.effort && !EFFORT_UNITS.has(step.effort.unit)) {
      out.errors.push(`${at}: hands-on effort is measured in minutes or hours`);
    }
    if (step.elapsed && !ELAPSED_UNITS.has(step.elapsed.unit)) {
      out.errors.push(`${at}: calendar time is measured in hours, business days, days or weeks`);
    }
    for (const [label, d] of [["effort", step.effort], ["elapsed", step.elapsed]] as const) {
      if (!d) continue;
      if (d.basis === "cited") {
        if (!d.sourceId) out.errors.push(`${at}: a cited ${label} names its source`);
        else if (!sourceById.has(d.sourceId)) out.errors.push(`${at}: ${label} cites unknown source "${d.sourceId}"`);
      }
    }
    if (step.cost && !sourceById.has(step.cost.sourceId)) {
      out.errors.push(`${at}: cost cites unknown source "${step.cost.sourceId}"`);
    }

    const words = wordCount(step.instruction);
    if (words > MAX_INSTRUCTION_WORDS) out.errors.push(`${at}: instruction is ${words} words (limit ${MAX_INSTRUCTION_WORDS})`);
  }
}

export function checkCorpus(c: Corpus, today: Date = new Date()): CheckResult {
  const out: CheckResult = { errors: [], warnings: [] };
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) out.errors.push(`duplicate ${label} id "${id}"`);
      seen.add(id);
    }
  };
  unique("playbook", c.playbooks.map((p) => p.id));
  unique("playbook order", c.playbooks.filter((p) => p.kind === "process").map((p) => String(p.order)));
  unique("audit order", c.playbooks.filter((p) => p.kind === "audit").map((p) => String(p.order)));
  unique("rule", c.rules.map((r) => r.id));
  unique("artifact", c.artifacts.map((a) => a.id));
  unique("calculator", c.calculators.map((x) => x.id));
  unique("market", c.markets.map((m) => m.id));
  unique("document", c.documents.map((d) => d.id));

  for (const pb of c.playbooks) checkPlaybook(pb, c, today, out);

  for (const r of c.rules) {
    const where = `rule ${r.id}`;
    const words = wordCount(r.rule);
    if (words > MAX_RULE_WORDS) out.errors.push(`${where}: rule text is ${words} words (limit ${MAX_RULE_WORDS})`);
    if (!r.sources.some((s) => s.tier === "primary")) out.errors.push(`${where}: needs at least one primary source`);
    if (ageInDays(r.lastVerified, today) < 0) out.errors.push(`${where}: lastVerified is in the future`);
    checkSources(where, r.sources, today, out);
  }

  const ruleIds = new Set(c.rules.map((r) => r.id));
  for (const calc of c.calculators) {
    for (const r of calc.rules) if (!ruleIds.has(r)) out.errors.push(`calculator ${calc.id}: unknown rule "${r}"`);
    if (calc.status === "live" && calc.method.length === 0) out.errors.push(`calculator ${calc.id}: a live calculator explains its method`);
  }

  for (const d of c.documents) {
    const age = ageInDays(d.lastChecked, today);
    if (age > STALE_DAYS) out.warnings.push(`document ${d.id}: last checked ${age} days ago`);
  }

  checkReviews(c, today, out);
  return out;
}

// A review chip above "AI-drafted" moves only with a dated approval in content/reviews.json.
function checkReviews(c: Corpus, today: Date, out: CheckResult): void {
  const levels = new Map<string, string>();
  for (const p of c.playbooks) levels.set(`playbook:${p.id}`, p.review);
  for (const r of c.rules) levels.set(`rule:${r.id}`, r.review);
  const approved = new Map<string, string>();
  for (const e of c.reviews) {
    const key = `${e.kind}:${e.id}`;
    const where = `reviews.json › ${key}`;
    if (approved.has(key)) out.errors.push(`${where}: listed twice; keep one entry per record`);
    approved.set(key, e.level);
    if (ageInDays(e.date, today) < 0) out.errors.push(`${where}: approval date is in the future`);
    if (e.kind === "market") continue; // markets are checked with the rankings
    const level = levels.get(key);
    if (level === undefined) out.errors.push(`${where}: no such ${e.kind}`);
    else if (level !== e.level) out.errors.push(`${where}: approved as ${e.level} but the record says ${level}`);
  }
  for (const [key, level] of levels) {
    if (level !== "ai-drafted" && approved.get(key) !== level) {
      out.errors.push(`${key}: marked ${level} with no matching approval in content/reviews.json`);
    }
  }
}
