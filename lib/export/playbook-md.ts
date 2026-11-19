import { GATE_WORD, stepGates } from "@/components/ui/gate-glyph";
import { ROLE_WORD } from "@/components/ui/roles";
import { ACTOR_WORD, pad2 } from "@/components/playbook/words";
import { isAgentStep, nearestPredecessors } from "../compute/metrics";
import { MARK_OF } from "../compute/site-facts";
import { applicableSteps, applies, DEFAULT_VARIANT, openingVariant, type Variant } from "../compute/variant";
import { JURISDICTION_LABEL, PROPERTY_LABEL, REVIEW_LABEL, STRUCTURE_LABEL, URGENCY_LABEL } from "../labels";
import { STRUCTURES, type Condition, type Source, type Structure } from "../schemas/common";
import { readsPublicRecord, type Playbook, type Step } from "../schemas/playbook";
import type { Artifact, ReviewEntry, Rule } from "../schemas/records";

// A written record (a playbook, a situation or an audit) as one Markdown file, for an
// operator who pastes it into any AI chat with no connector. It is the default view:
// the syndication structure, an industrial property, Federal + Texas. A record with no
// step in the syndication view gets its file for the first structure it is written for
// and has a step in, and the file says so under Status. Pure: the page's address and the
// date are passed in, so a test and the route see the same text.
//
// The file reads in this order: the title; two lines telling the agent how to work it;
// what it is; its status; every step with who does it, its gates, its instruction, the
// proof to keep, what it waits on, its rules and its sources; the rule cards in full;
// the source list; one line saying where it came from. A step that changes with the
// structure says so where it sits. Nothing here is typed in: every word comes from the
// record, its rule cards or the labels the page uses.

export type PlaybookMdContext = {
  rules: Rule[]; // the catalog's rule cards; the file prints the ones its steps cite
  artifacts: Artifact[]; // names for what a step keeps as proof
  review: ReviewEntry | null; // the record's latest entry in the review ledger
  origin: string; // the site's address, such as https://www.promptedcre.com
  computedOn: string; // the date the file was computed, YYYY-MM-DD
};

// The default view. The view of one record's own file is playbookMdView(pb).
export const PLAYBOOK_MD_VIEW: Variant = DEFAULT_VARIANT;

// "syndication", "fund", "JV": a structure's name inside a sentence.
const structureWord = (s: Structure): string => (s === "jv" ? "JV" : STRUCTURE_LABEL[s].toLowerCase());

// The view a record's file is made for: the default view when the record is written for
// it, otherwise the first structure it is written for and has a step in (openingVariant).
// null when the record has no file: an outline, a record not written for Federal + Texas,
// or a record with no step in any structure it is written for.
export function playbookMdView(pb: Playbook): Variant | null {
  return openingVariant(pb);
}

// What the file says under Status when a record is written for fewer than every structure,
// or null. Built in one place, so the file and the reading copy cannot word it two ways.
export function writtenForLine(pb: Playbook): string | null {
  // "JV" is spelled out here once: the Status lines are where a reader learns which deal the file is for.
  const names = STRUCTURES.filter((s) => pb.written.structure.includes(s)).map((s) => (s === "jv" ? "joint venture (JV)" : structureWord(s)));
  const missing = STRUCTURES.filter((s) => !pb.written.structure.includes(s)).map((s) => `a ${structureWord(s)}`);
  if (names.length === 0 || missing.length === 0) return null;
  return `Written for the ${names.join(" and ")} structure${names.length > 1 ? "s" : ""} only. It has no steps for ${missing.join(" or ")}.`;
}

// The record's latest review in the ledger, the one the page stamps. null when no
// person has reviewed it: the record is then AI-drafted.
export function latestReview(reviews: ReviewEntry[], id: string): ReviewEntry | null {
  return reviews.filter((r) => r.kind === "playbook" && r.id === id).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

export function playbookMdPath(slug: string): string {
  return `/playbooks/${slug}/playbook.md`;
}

function who(step: Step): string {
  const role = ROLE_WORD[MARK_OF[step.mode]];
  const actor = step.actor ? (ACTOR_WORD[step.actor] ?? step.actor) : null;
  return !isAgentStep(step) && actor ? `${role}, ${actor}` : role;
}

// What an agent's step tells the agent to do before it starts, from the step's approval
// (CH02). A step with no approval is the agent's to do; one that needs a person's yes says
// so where the agent reads it, since a pasted file has no engine to refuse anything. In an
// audit a standing approval is the one lookup approval (readsPublicRecord). None of these
// says "Stop here": that line is a person's step.
export function agentStepLine(step: Step, audit: boolean): string {
  const noun = audit ? "check" : "step";
  switch (step.approval) {
    case "none":
      return `Do this ${noun}.`;
    case "standing":
      return audit && readsPublicRecord(step)
        ? "Ask first, once per audit: before you look anything up in a public record, ask me and wait for my yes, then note it."
        : `Ask first, once per run: if I have not yet said yes to this run's ${noun}s marked standing, ask me and wait, then note my yes.`;
    case "every-run":
    case "signature":
      return `Ask first: say what you are about to do, and wait for my yes. Ask again each time.`;
  }
}

// "the fund structure", "multifamily property", "Delaware": what a condition limits a step to.
function conditionWords(when: Condition | undefined): string {
  if (!when) return "";
  const parts: string[] = [];
  if (when.structure) parts.push(`the ${when.structure.map(structureWord).join(" or ")} structure`);
  if (when.propertyType) parts.push(`${when.propertyType.map((t) => PROPERTY_LABEL[t].toLowerCase()).join(" or ")} property`);
  if (when.jurisdiction) parts.push(when.jurisdiction.map((j) => JURISDICTION_LABEL[j]).join(" or "));
  return parts.join(", ");
}

const link = (title: string, url: string) => `[${title}](${url})`;

function sourceLine(s: Source): string {
  return `${link(s.title, s.url)}. ${s.publisher}, opened ${s.accessed}${s.tier === "primary" ? ", primary source" : ""}.`;
}

function ruleCard(r: Rule): string[] {
  return [
    `### ${r.title}`,
    "",
    `Rule \`${r.id}\` · ${JURISDICTION_LABEL[r.jurisdiction]}`,
    "",
    r.rule,
    "",
    `- Law: ${link(r.citation.authority, r.citation.url)}`,
    `- As of ${r.asOf}; sources checked ${r.lastVerified}; ${REVIEW_LABEL[r.review]}`,
    ...(r.changeWatch ? [`- Watch for: ${r.changeWatch}`] : []),
    `- Sources:`,
    ...r.sources.map((s) => `  - ${sourceLine(s)}`),
    "",
  ];
}

export function playbookMarkdown(pb: Playbook, ctx: PlaybookMdContext): string {
  const view = playbookMdView(pb);
  if (!view) {
    throw new Error(`${pb.slug} has no file: it is an outline, it is not written for the default coverage, or it has no step in a structure it is written for`);
  }

  const audit = pb.kind === "audit";
  const noun = audit ? "check" : "step";
  const Noun = audit ? "Check" : "Step";
  const steps = applicableSteps(pb, view);
  const number = new Map(steps.map((s, i) => [s.id, i + 1]));
  const sources = new Map(pb.sources.map((s) => [s.id, s]));
  const rules = new Map(ctx.rules.map((r) => [r.id, r]));
  const artifact = (id: string) => ctx.artifacts.find((a) => a.id === id)?.name ?? id;
  const agents = steps.filter(isAgentStep).length;
  const coverage = view.jurisdictions.map((j) => JURISDICTION_LABEL[j]).join(" + ");
  const written = new Set(pb.written.structure);
  const writtenLine = writtenForLine(pb);
  const address = `${ctx.origin}/playbooks/${pb.slug}`;

  // Steps outside this view, each told at the in-view step it follows (or before the first).
  const outside = new Map<string, Step[]>();
  let last = "";
  for (const s of pb.steps) {
    if (applies(s.when, view)) last = s.id;
    else outside.set(last, [...(outside.get(last) ?? []), s]);
  }
  const outsideNote = (s: Step, where: string) =>
    `Not in this view: for ${conditionWords(s.when)}, the ${noun} "${s.title}" (${who(s)}) comes ${where}.`;

  const out: string[] = [
    `# ${pb.title}`,
    "",
    `How to work this file: do each ${noun} marked "agent" yourself, unless the ${noun} says to ask first. At each ${noun} marked "person", stop, tell me what the person must do, and wait until I say it is done.`,
    `Keep my firm's files on my machine. Do not upload them anywhere.`,
    "",
    "## What it is",
    "",
    pb.summary,
    ...(audit ? ["", "Each check records what is true; it fixes nothing."] : []),
    ...(pb.situation ? ["", `When this happens (${URGENCY_LABEL[pb.situation.urgency]}): ${pb.situation.trigger}`] : []),
    "",
    "## Status",
    "",
    `- Review: ${ctx.review ? `${REVIEW_LABEL[ctx.review.level]} on ${ctx.review.date}` : REVIEW_LABEL["ai-drafted"]}`,
    ...(pb.lastVerified ? [`- Sources checked: ${pb.lastVerified}`] : []),
    `- Coverage: ${coverage}`,
    `- This file: the ${structureWord(view.structure)} structure, ${PROPERTY_LABEL[view.propertyType].toLowerCase()} property. ${steps.length} ${noun}s; an agent can do ${agents} of them.`,
    ...(writtenLine ? [`- ${writtenLine}`] : []),
    "",
    `## ${Noun}s`,
    "",
    ...(outside.get("") ?? []).flatMap((s) => [outsideNote(s, `before ${noun} 01`), ""]),
  ];

  for (const step of steps) {
    const n = number.get(step.id) ?? 0;
    const agent = isAgentStep(step);
    const gates = stepGates(step).map((g) => GATE_WORD[g].toLowerCase());
    const waits = nearestPredecessors(pb, step, view)
      .map((id) => number.get(id) ?? 0)
      .filter((x) => x > 0)
      .sort((a, b) => a - b);
    const onlyIn = step.when?.structure?.filter((s) => written.has(s));
    const typeNote = step.typeNotes?.[view.propertyType];
    const stepSources = step.sources.map((id) => sources.get(id)).filter((s): s is Source => Boolean(s));

    out.push(
      `### ${Noun} ${pad2(n)}. ${step.title}`,
      "",
      agent ? `Who: ${who(step)}. ${agentStepLine(step, audit)}` : `Who: ${who(step)}. Stop here: tell me what the person must do, and wait.`,
      ...(gates.length > 0 ? [`Gates: ${gates.join(", ")}.`] : []),
      ...(onlyIn && onlyIn.length < written.size
        ? [`Only in the ${onlyIn.map(structureWord).join(" and ")} structure${onlyIn.length > 1 ? "s" : ""}.`]
        : []),
      "",
      step.instruction.trim(),
      "",
      ...(typeNote ? [`For ${PROPERTY_LABEL[view.propertyType].toLowerCase()} property: ${typeNote}`, ""] : []),
      ...(step.produces.length > 0 ? [`- Proof to keep: ${step.produces.map(artifact).join(", ")}`] : []),
      `- Waits on: ${waits.length > 0 ? `${waits.length > 1 ? `${noun}s` : noun} ${waits.map(pad2).join(", ")}` : "nothing; it can start first"}`,
      ...(step.rules.length > 0
        ? [
            "- Rules:",
            ...step.rules.map((id) => {
              const r = rules.get(id);
              return r ? `  - ${r.title} (${r.citation.authority})` : `  - \`${id}\``;
            }),
          ]
        : []),
      ...(stepSources.length > 0
        ? ["- Sources:", ...stepSources.map((s) => `  - ${link(s.title, s.url)}`)]
        : ["- Sources: common practice, with no public source to cite"]),
      "",
      ...(outside.get(step.id) ?? []).flatMap((s) => [outsideNote(s, `after this ${noun}`), ""]),
    );
  }

  // Rule cards: federal first, then in the order the steps first cite them, as on the page.
  const firstCite = new Map<string, number>();
  steps.forEach((s, i) => s.rules.forEach((id) => firstCite.has(id) || firstCite.set(id, i)));
  const cited = [...firstCite.keys()]
    .map((id) => rules.get(id))
    .filter((r): r is Rule => Boolean(r))
    .sort(
      (a, b) =>
        Number(a.jurisdiction !== "us-federal") - Number(b.jurisdiction !== "us-federal") ||
        (firstCite.get(a.id) ?? 0) - (firstCite.get(b.id) ?? 0),
    );
  if (cited.length > 0) out.push("## Rule cards", "", ...cited.flatMap(ruleCard));

  if (pb.sources.length > 0) {
    out.push("## Sources", "", ...pb.sources.map((s, i) => `${i + 1}. ${sourceLine(s)}`), "");
  }

  out.push(
    "---",
    "",
    `From ${address}, computed ${ctx.computedOn}. Not legal advice: every ${noun} says where it comes from, a cited source or common practice.`,
    "",
  );
  return out.join("\n");
}

// The records that have a file: every written record that covers Federal + Texas and has a
// step in a structure it is written for, in the view playbookMdView gives it.
export function hasPlaybookMd(pb: Playbook): boolean {
  return playbookMdView(pb) !== null;
}
