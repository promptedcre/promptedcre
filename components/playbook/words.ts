import { STRUCTURE_LABEL } from "@/lib/labels";
import { STRUCTURES, type Structure } from "@/lib/schemas/common";
import type { StepMode } from "@/lib/schemas/playbook";

// Plain words for the playbook page. Labels only: every count they wrap is
// computed elsewhere.

// "JV only", "Fund · JV only": what a page says of a written record that is not written for
// every structure, in the words a step's own "only" tag uses. Give it the structures the
// record is written for. null when that is all of them, and when it is none (an outline).
export function onlyLabel(written: readonly Structure[]): string | null {
  const names = STRUCTURES.filter((s) => written.includes(s)).map((s) => STRUCTURE_LABEL[s]);
  return names.length === 0 || names.length === STRUCTURES.length ? null : `${names.join(" · ")} only`;
}

export const ACTOR_WORD: Record<string, string> = {
  principal: "principal",
  counsel: "counsel",
  cpa: "CPA",
  lender: "lender",
  title: "title company",
  consultant: "consultant",
  investor: "investor",
  broker: "broker",
  agency: "agency",
};

export const LICENSED_WORD: Record<string, string> = {
  attorney: "attorney",
  cpa: "CPA",
  surveyor: "surveyor",
  "environmental-professional": "environmental professional",
  appraiser: "appraiser",
  engineer: "engineer",
};

export const APPROVAL_WORD: Record<string, string> = {
  none: "none",
  standing: "standing approval",
  "every-run": "approved each run",
  signature: "signature",
};

export const UNDO_WORD: Record<string, string> = {
  reversible: "reversible",
  "hard-to-undo": "hard to undo",
  irreversible: "irreversible",
};

export const isAgentMode = (mode: StepMode) => mode === "agent" || mode === "agent-browser";

// Who does a step, as a short phrase: "agent", "agent in a browser",
// "principal", "counsel, offline". A person's step names its actor when it has one.
export function whoWord(mode: StepMode, actor: string | null | undefined): string {
  if (mode === "agent") return "agent";
  if (mode === "agent-browser") return "agent in a browser";
  const who = actor ? (ACTOR_WORD[actor] ?? actor) : "person";
  return mode === "human-offline" ? `${who}, offline` : who;
}

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** A count as a word up to ten ("no", "one" ... "ten"), then as digits. */
export function countWord(n: number): string {
  return SMALL[n] ?? String(n);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${countWord(n)} ${n === 1 ? one : many}`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** A word or phrase with its capital, for a label that starts a line ("Hard to undo"). */
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A jurisdiction as the short mark a step carries where it has no number: "us-de" is "DE",
// "us-tx" is "TX", and the federal one is "US".
export function jurisdictionCode(id: string): string {
  const code = id.replace(/^us-/, "");
  return code === "federal" ? "US" : code.toUpperCase();
}

// A title set for display: a short token stays on the line with the word it
// belongs to ("Form D", "Phase I", "Rule 506(d)", "1031 exchange"), joined by a
// non-breaking space, so a large headline never breaks between them.
export function displayTitle(title: string): string {
  return title
    .replace(/\b(Form|Phase|Rule|Regulation|Schedule|Section|Item|Part|Exhibit|Article) (?=[A-Z0-9])/g, "$1 ")
    .replace(/\b(\d{3,}) (?=[a-z])/g, "$1 ");
}

// "A, B and C"
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
