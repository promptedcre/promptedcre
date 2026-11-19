import type { ReactNode } from "react";
import { Tag } from "@/components/chips";
import { onlyLabel } from "@/components/playbook/words";
import { MARK_ORDER, Marks, RoleMark, cx } from "@/components/ui";
import { REVIEW_LABEL, STRUCTURE_LABEL } from "@/lib/labels";
import { STRUCTURES, type Review, type Structure } from "@/lib/schemas/common";
import type { PlaybookKind } from "@/lib/schemas/playbook";
import type { BoardRecord } from "./data";

// The pieces of a row in CatalogList: the step marks, how many steps an agent can do ("8 of 14
// steps an agent can do", counts only, never a percentage), the review state, and the key line
// that explains the marks and the review states once, above the list. A person's review has one
// color everywhere it is said (the drafting blue, as on the stamp); AI-drafted is a dashed
// neutral outline. Neither lane color ever says a review state. Every structure is rendered;
// the nearest [data-structure] ancestor (a StructureSwitch root) picks the one in view.

export const STEP_NOUN: Record<PlaybookKind, [one: string, many: string]> = {
  process: ["step", "steps"],
  situation: ["step", "steps"],
  audit: ["check", "checks"],
};

const reviewed = (r: Review) => r !== "ai-drafted";

/**
 * The review square: filled in the review blue when a person reviewed the record, a dashed neutral outline when it is
 * AI-drafted. 8 px, so it never reads as a 12 px step mark beside it.
 */
export function ReviewSquare({ review, className }: { review: Review; className?: string }) {
  return (
    <i
      aria-hidden="true"
      className={cx("inline-block size-2 flex-none", reviewed(review) ? "bg-accent" : "border border-dashed border-faint", className)}
    />
  );
}

/**
 * The review state on a row: the square and its word, with no frame. A list repeats it on every written row, so it
 * stays quiet; the framed ReviewChip is for a record shown once. The key above the list uses this same mark.
 */
export function ReviewMark({ review, className }: { review: Review; className?: string }) {
  return (
    <span className={cx("type-label inline-flex items-baseline gap-2 whitespace-nowrap text-muted", className)}>
      <ReviewSquare review={review} />
      {REVIEW_LABEL[review]}
    </span>
  );
}

/** The latest sources-checked date among records, or null. ISO dates sort as text. */
function lastChecked(records: readonly { lastVerified?: string | null }[]): string | null {
  const dates = records.map((r) => r.lastVerified).filter((d): d is string => Boolean(d));
  return dates.length > 0 ? [...dates].sort().at(-1)! : null;
}

/**
 * The key for the review states, shown once above a list: each state as the rows show it (the same mark), with its
 * count. Counts come from the records given; a level with no records is left out, and AI-drafted carries the date its
 * sources were checked. `scope` names what the counts count ("Of the 23 written"), so they cannot be read as the
 * whole catalog's.
 */
export function ReviewLegend({
  records,
  scope,
  className,
}: {
  records: readonly { review: Review; lastVerified?: string | null }[];
  scope?: string;
  className?: string;
}) {
  const levels: Review[] = ["attorney-reviewed", "practitioner-reviewed", "ai-drafted"];
  const items = levels
    .map((review) => {
      const of = records.filter((r) => r.review === review);
      return { review, n: of.length, checked: review === "ai-drafted" ? lastChecked(of) : null };
    })
    .filter((i) => i.n > 0);
  return (
    <ul className={cx("type-label m-0 flex list-none flex-wrap items-baseline gap-x-6 gap-y-2 p-0 text-muted", className)}>
      {scope && <li className="text-faint">{scope}</li>}
      {items.map((i) => (
        <li key={i.review} className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <ReviewMark review={i.review} className="text-text" />
          <span className="tabular-nums text-text">{i.n}</span>
          {i.checked && (
            <span className="text-faint">
              sources checked{" "}
              <time dateTime={i.checked} className="type-data">
                {i.checked}
              </time>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The key for the step marks: each mark with its word, and the one sentence that makes the cut corner readable. */
export function MarksKey({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Who does a step"
      className={cx("type-label m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0 text-muted", className)}
    >
      {MARK_ORDER.map((m) => (
        <li key={m}>
          <RoleMark mode={m} size="sm" />
        </li>
      ))}
      <li className="text-faint">A person&rsquo;s step has a cut corner</li>
    </ul>
  );
}

/** One structure's figures, or all three behind data-s when no structure is fixed. */
export function PerStructure({ fixed, children }: { fixed?: Structure; children: (s: Structure) => ReactNode }) {
  if (fixed) return <>{children(fixed)}</>;
  return (
    <>
      {STRUCTURES.map((s) => (
        <span key={s} data-s={s} className="contents">
          {children(s)}
        </span>
      ))}
    </>
  );
}

/** The structures a written record has steps in: the ones it is written for, read from its figures. */
export const stepStructuresOf = (r: Pick<BoardRecord, "byStructure">): Structure[] => STRUCTURES.filter((s) => r.byStructure[s].total > 0);

/**
 * "8 of 14 steps an agent can do": a record's agent count in one structure, in words. Counts only, no percent.
 * A record with no steps in that structure is written for another: the row says which ("JV only") in a solid
 * neutral chip (Tag) where its count would be, so its place is never blank.
 */
export function AgentCount({ r, s, className }: { r: BoardRecord; s: Structure; className?: string }) {
  const v = r.byStructure[s];
  if (v.total === 0) {
    const only = onlyLabel(stepStructuresOf(r));
    return only ? (
      <span className={cx("whitespace-nowrap", className)}>
        <Tag>{only}</Tag>
      </span>
    ) : null;
  }
  return (
    <span className={cx("tabular-nums", className)}>
      <b className="font-medium text-text">{v.agent}</b> of {v.total} {STEP_NOUN[r.kind][v.total === 1 ? 0 : 1]} an agent can do
    </span>
  );
}

/** The record's step marks in one structure, labelled in words. */
export function RowMarks({ r, s, size = "sm" }: { r: BoardRecord; s: Structure; size?: "sm" | "md" }) {
  const v = r.byStructure[s];
  if (v.marks.length === 0) return null;
  const noun = STEP_NOUN[r.kind][1];
  return (
    <Marks
      size={size}
      marks={v.marks}
      label={`${v.total} ${noun}: an agent can do ${v.agent}, a person does ${v.total - v.agent} (${STRUCTURE_LABEL[s]})`}
    />
  );
}
