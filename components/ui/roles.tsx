import type { ReactNode } from "react";
import type { StepMark } from "@/lib/compute/site-facts";
import type { StepMode } from "@/lib/schemas/playbook";
import { cx } from "./cx";

// Who does a step, as a mark letter: A agent, B agent in a browser, H a person
// online, O a person offline. Type-only imports, so client code can use these too.
export const MARK_ORDER: readonly StepMark[] = ["A", "B", "H", "O"];

const MODE_MARK: Record<StepMode, StepMark> = {
  agent: "A",
  "agent-browser": "B",
  "human-online": "H",
  "human-offline": "O",
};

export const ROLE_WORD: Record<StepMark, string> = {
  A: "agent",
  B: "agent in a browser",
  H: "person online",
  O: "person offline",
};

export const isAgentMark = (m: StepMark) => m === "A" || m === "B";

function toMark(mode: StepMode | StepMark): StepMark {
  return mode.length === 1 ? (mode as StepMark) : MODE_MARK[mode as StepMode];
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The role word for a step, as a label with its capital: "Person online". */
export function roleWord(mode: StepMode | StepMark): string {
  return capital(ROLE_WORD[toMark(mode)]);
}

// Counts for an aria-label or a dimension: how many marks are an agent's, how many a person's.
export function tallyMarks(marks: readonly StepMark[]) {
  const by: Record<StepMark, number> = { A: 0, B: 0, H: 0, O: 0 };
  for (const m of marks) by[m] += 1;
  return { total: marks.length, agent: by.A + by.B, person: by.H + by.O, by };
}

export function marksLabel(marks: readonly StepMark[], noun = "steps"): string {
  const t = tallyMarks(marks);
  return `${t.total} ${noun}: ${t.agent} for an agent, ${t.person} for a person`;
}

const MARK_SIZE = { sm: "", md: "mk--md", lg: "mk--lg" } as const;

// RoleMark: who does a step, as a mark and a word. The mark carries the color (green for an
// agent, amber for a person), is hatched for the browser and offline variants, and a person's
// mark has its top-right corner cut, so the meaning never rests on color. The word beside it is
// neutral ink, sentence case ("Person online"). Sizes: sm 12 px, md 14 px, lg 20 px; never
// smaller, because under 12 px the cut does not show. `showLabel={false}` keeps the word for a
// screen reader only. Inkable: `inked={false}` (or data-inked="false" on an ancestor) draws the
// mark in pencil. For many steps at once use Marks (a row) or Elevation (a drawing).
export function RoleMark({
  mode,
  label,
  showLabel = true,
  size = "md",
  inked = true,
  className,
}: {
  mode: StepMode | StepMark;
  label?: string;
  showLabel?: boolean;
  size?: keyof typeof MARK_SIZE;
  inked?: boolean;
  className?: string;
}) {
  const m = toMark(mode);
  const word = capital(label ?? ROLE_WORD[m]);
  return (
    <span className={cx("role", className)}>
      <i aria-hidden="true" data-ink="" data-inked={inked ? undefined : "false"} className={cx("mk", `mk-${m}`, MARK_SIZE[size])} />
      {showLabel ? word : <span className="sr-only">{word}</span>}
    </span>
  );
}

const LANE_MARK = { agent: "A", person: "H" } as const;
const LANE_WORD = { agent: "Your agent", person: "A person" } as const;

// LaneTag: whose lane a column, a card or a row is. The lane's mark and the lane word, and
// nothing else: position on the sheet says the rest. Never a colored side stripe. It sets
// data-lane, which hands --lane, --lane-mid and --lane-deep to anything inside it.
export function LaneTag({
  lane,
  mark,
  size = "md",
  children,
  className,
}: {
  lane: keyof typeof LANE_MARK;
  /** The exact mark, when the lane's step is a variant (B in a browser, O offline). */
  mark?: StepMark;
  size?: keyof typeof MARK_SIZE;
  children?: ReactNode;
  className?: string;
}) {
  const m = mark ?? LANE_MARK[lane];
  return (
    <span data-lane={lane} className={cx("lane-tag", className)}>
      <i aria-hidden="true" data-ink="" className={cx("mk", `mk-${m}`, MARK_SIZE[size])} />
      <span className="min-w-0">{children ?? LANE_WORD[lane]}</span>
    </span>
  );
}
