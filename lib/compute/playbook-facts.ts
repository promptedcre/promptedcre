import { STRUCTURES, type Structure } from "../schemas/common";
import { ACTORS, LICENSED, type Playbook, type Step, type StepMode } from "../schemas/playbook";
import { paragraphs, parseInline } from "../text";
import { formatHours, formatMinutes } from "./duration";
import { computeMetrics, isAgentStep } from "./metrics";
import { applicableSteps, applies, DEFAULT_VARIANT, isResearched, type Variant } from "./variant";

// The facts a playbook page shows at a glance. Every figure is counted from the
// step data for one variant; nothing here is typed in by hand.

export type StepRef = { id: string; title: string; n: number };

export type Gate = StepRef & { signature: boolean; irreversible: boolean; hardToUndo: boolean };

export type StepCost = { stepId: string; stepTitle: string; text: string; n: number };

export type PlaybookFacts = {
  researched: boolean; // false for an outline or an unwritten variant: every count is then 0
  steps: number;
  agent: number;
  person: number;
  signatures: number; // approval "signature"
  everyRunApprovals: number; // approval "every-run"
  standingApprovals: number; // approval "standing"
  irreversible: number;
  hardToUndo: number;
  licensed: Array<{ kind: string; count: number }>;
  actors: Array<{ actor: string; count: number }>; // steps that name an actor
  costs: StepCost[]; // steps that carry a cost, in step order
  rules: number; // distinct rule ids cited
  sources: number; // distinct source ids cited by the steps, their cost and their durations
  calculators: string[]; // distinct calculator slugs, in order of first use
  handoffs: number; // places in step order where the work passes between agent and person
  firstPersonStep: StepRef | null;
  gates: Gate[]; // steps with a signature, irreversible or hard-to-undo flag
};

// Counts sorted largest first; ties keep the schema's own order.
function tally(values: string[], order: readonly string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

function citedSources(step: Step): string[] {
  const ids = [...step.sources];
  if (step.cost) ids.push(step.cost.sourceId);
  if (step.effort?.sourceId) ids.push(step.effort.sourceId);
  if (step.elapsed?.sourceId) ids.push(step.elapsed.sourceId);
  return ids;
}

// The steps a reader of this variant sees, numbered as the page numbers them.
// Matches computeMetrics: an outline or unresearched variant has no steps.
function visibleSteps(pb: Playbook, v: Variant): Step[] {
  return isResearched(pb, v) ? applicableSteps(pb, v) : [];
}

export function countHandoffs(steps: Step[]): number {
  let n = 0;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev && cur && isAgentStep(prev) !== isAgentStep(cur)) n += 1;
  }
  return n;
}

export function playbookFacts(pb: Playbook, v: Variant): PlaybookFacts {
  const researched = isResearched(pb, v);
  const steps = visibleSteps(pb, v);
  const agent = steps.filter(isAgentStep).length;

  const rules = new Set<string>();
  const sources = new Set<string>();
  const calculators: string[] = [];
  const costs: StepCost[] = [];
  const gates: Gate[] = [];
  let firstPersonStep: StepRef | null = null;

  steps.forEach((s, i) => {
    const n = i + 1;
    s.rules.forEach((r) => rules.add(r));
    citedSources(s).forEach((id) => sources.add(id));
    for (const c of s.calculators) if (!calculators.includes(c)) calculators.push(c);
    if (s.cost) costs.push({ stepId: s.id, stepTitle: s.title, text: s.cost.text, n });
    if (!firstPersonStep && !isAgentStep(s)) firstPersonStep = { id: s.id, title: s.title, n };
    const signature = s.approval === "signature";
    const irreversible = s.undo === "irreversible";
    const hardToUndo = s.undo === "hard-to-undo";
    if (signature || irreversible || hardToUndo) {
      gates.push({ id: s.id, title: s.title, n, signature, irreversible, hardToUndo });
    }
  });

  return {
    researched,
    steps: steps.length,
    agent,
    person: steps.length - agent,
    signatures: steps.filter((s) => s.approval === "signature").length,
    everyRunApprovals: steps.filter((s) => s.approval === "every-run").length,
    standingApprovals: steps.filter((s) => s.approval === "standing").length,
    irreversible: steps.filter((s) => s.undo === "irreversible").length,
    hardToUndo: steps.filter((s) => s.undo === "hard-to-undo").length,
    licensed: tally(
      steps.flatMap((s) => (s.licensed ? [s.licensed] : [])),
      LICENSED,
    ).map(({ key, count }) => ({ kind: key, count })),
    actors: tally(
      steps.flatMap((s) => (s.actor ? [s.actor] : [])),
      ACTORS,
    ).map(({ key, count }) => ({ actor: key, count })),
    costs,
    rules: rules.size,
    sources: sources.size,
    calculators,
    handoffs: countHandoffs(steps),
    firstPersonStep,
    gates,
  };
}

// Hands-on and calendar time for the steps in view, as ranges ("3–5 h", "2–4 d").
// A total is given only when every step in view carries that estimate: a sum over
// some of the steps would read as the whole and understate it, so it is null.
export type RecordTimes = { handsOn: string | null; calendar: string | null };

export function recordTimes(pb: Playbook, v: Variant): RecordTimes {
  const m = computeMetrics(pb, v);
  const e = m.effortMinutes;
  const c = m.elapsedHours;
  return {
    handsOn: e.complete ? formatMinutes(e.min, e.max) : null,
    calendar: c.complete ? formatHours(c.min, c.max) : null,
  };
}

// One value per structure, with the structures that share a value grouped, in
// STRUCTURES order. A page draws a value once when every structure agrees, and
// otherwise once per group (marked data-s="fund jv"), so a variant is rendered
// only where it differs. `key` decides when two values are the same. `among`
// limits the structures to those an element already shows in (a step row that
// applies to the fund alone needs no number for the other two).
export type StructureGroup<T> = { structures: Structure[]; value: T };

export function groupByStructure<T>(
  value: (s: Structure) => T,
  key: (v: T) => string = (v) => JSON.stringify(v) ?? "",
  among: readonly Structure[] = STRUCTURES,
): StructureGroup<T>[] {
  const out: StructureGroup<T>[] = [];
  const at = new Map<string, number>();
  for (const s of STRUCTURES.filter((x) => among.includes(x))) {
    const v = value(s);
    const k = key(v);
    const i = at.get(k);
    const group = i === undefined ? undefined : out[i];
    if (group) group.structures.push(s);
    else {
      at.set(k, out.length);
      out.push({ structures: [s], value: v });
    }
  }
  return out;
}

export type DiffStep = { id: string; title: string; mode: StepMode };

export type VariantDifference = {
  structure: Exclude<Structure, "syndication">;
  adds: DiffStep[]; // apply in this structure and not in syndication
  drops: DiffStep[]; // apply in syndication and not in this structure
};

// For each researched structure other than syndication, the steps that differ from
// the syndication view, at the default property type and jurisdictions. Structures
// with no difference are left out, so a playbook whose steps carry no structure
// condition returns [].
export function variantDifferences(pb: Playbook): VariantDifference[] {
  if (pb.depth !== "full") return [];
  const base = { ...DEFAULT_VARIANT, structure: "syndication" as Structure };
  const ref = (s: Step): DiffStep => ({ id: s.id, title: s.title, mode: s.mode });
  const out: VariantDifference[] = [];
  for (const structure of STRUCTURES) {
    if (structure === "syndication" || !pb.written.structure.includes(structure)) continue;
    const view = { ...DEFAULT_VARIANT, structure };
    const adds = pb.steps.filter((s) => applies(s.when, view) && !applies(s.when, base)).map(ref);
    const drops = pb.steps.filter((s) => applies(s.when, base) && !applies(s.when, view)).map(ref);
    if (adds.length > 0 || drops.length > 0) out.push({ structure, adds, drops });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The first sentence of an instruction, for the line under a step's title.

// Abbreviations that never end a sentence, whatever follows them.
const ABBREVIATIONS = new Set([
  "e.g", "i.e", "cf", "vs", "approx", "est",
  "Inc", "Corp", "Co", "Ltd", "Bros",
  "Mr", "Mrs", "Ms", "Dr", "Jr", "Sr", "St", "Prof",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec",
  "Tex", "Del", "Bus", "Orgs", "Gov", "Govt", "Prop", "Civ", "Prac", "Rem", "Ann", "Admin",
  "Rev", "Proc", "Reg", "Regs", "Stat", "Fed", "Treas", "Ins", "Ct", "App",
]);

// Abbreviations that do not end a sentence when a number follows ("No. 5", "Sec. 12").
const BEFORE_NUMBER = new Set(["No", "Nos", "no", "Sec", "Secs", "sec", "Art", "art", "Ch", "ch", "Para", "para", "p", "pp", "Vol", "vol", "Pub", "Pt", "pt"]);

const OPENERS: Record<string, string> = { "(": ")", "[": "]", "“": "”" };
const CLOSERS = new Set([")", "]", "”"]);

// Plain text of the first paragraph: markup reduced to its words, whitespace collapsed.
export function plainText(text: string): string {
  const first = paragraphs(text)[0] ?? "";
  return parseInline(first)
    .map((p) => p.v)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// The word that ends at index i (exclusive), without leading brackets or quotes.
function wordBefore(text: string, i: number): string {
  let a = i;
  while (a > 0 && !/\s/.test(text[a - 1] ?? "")) a -= 1;
  return text.slice(a, i).replace(/^[("“'‘[]+/, "");
}

function isAbbreviation(word: string, next: string): boolean {
  if (word === "") return false;
  if (ABBREVIATIONS.has(word)) return true;
  if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(word)) return true; // U.S, C.F.R, e.g, i.e
  if (BEFORE_NUMBER.has(word) && /^[0-9§]/.test(next)) return true;
  return false;
}

// Where the first sentence ends (exclusive), or the text's length.
function sentenceEnd(text: string): number {
  const open: string[] = []; // closers awaited, innermost last
  let straight = false; // inside a straight double quote
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (c in OPENERS) {
      open.push(OPENERS[c] ?? "");
      continue;
    }
    if (CLOSERS.has(c)) {
      if (open[open.length - 1] === c) open.pop();
      continue;
    }
    if (c === '"') {
      straight = !straight;
      continue;
    }
    if (c !== "." && c !== "?" && c !== "!") continue;

    // Walk past more terminators ("?!", "...") and closers the terminator sits inside.
    let j = i + 1;
    while (j < text.length && /[.?!]/.test(text[j] ?? "")) j += 1;
    const pending = [...open];
    let quote = straight;
    for (;;) {
      const d = text[j];
      if (d !== undefined && CLOSERS.has(d) && pending[pending.length - 1] === d) {
        pending.pop();
        j += 1;
      } else if (d === '"' && quote) {
        quote = false;
        j += 1;
      } else break;
    }
    if (pending.length > 0 || quote) continue; // never cut inside brackets or quotes
    if (j >= text.length) return j;
    if (!/\s/.test(text[j] ?? "")) continue; // 1.5, 49.452, example.test
    const rest = text.slice(j).trimStart();
    if (!/^[A-Z0-9"“(\[§]/.test(rest)) continue; // a lowercase word: the sentence goes on
    if (c === "." && j === i + 1 && isAbbreviation(wordBefore(text, i), rest)) continue;
    return j;
  }
  return text.length;
}

// The whole first sentence, never cut: a step row lets it wrap.
export function firstSentence(text: string): string {
  const plain = plainText(text);
  return plain.slice(0, sentenceEnd(plain)).trim();
}
