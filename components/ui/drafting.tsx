import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

// The drawing-set notation. Each device has one meaning and one definition (app/globals.css):
// a dimension line measures, the property line divides the agent's side from the person's, a
// stamp means a person reviewed it, the revision cloud circles the one thing the engine refused.
//
// Motion contract (docs/MOTION.md). A drawable device carries data-draw and draws itself by
// --draw: 0 not drawn, 1 fully drawn, 1 by default. An inkable device carries data-ink and
// is "penciled" while it or an ancestor carries data-inked="false". With no attribute and no
// script the device is finished and inked.

// SheetHeader: a section's heading and nothing above it. The title is an h2 (type-title-l) or
// an h3 (type-title-m); a quiet note or a control may sit to its right. No label over the
// title and no rule under it. Not for a page's h1: use PageHead.
export function SheetHeader({
  title,
  note,
  id,
  level = 2,
  flush = false,
  children,
  className,
}: {
  /** @deprecated A label above a heading is not drawn any more. Say it in the title, the breadcrumb or the note. */
  label?: string;
  title: ReactNode;
  /** @deprecated The heading's size follows its level: an h2 is type-title-l, an h3 type-title-m. */
  size?: "l" | "m";
  note?: ReactNode;
  id?: string;
  level?: 2 | 3;
  flush?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const H = `h${level}` as const;
  return (
    <header
      id={id}
      className={cx("flex flex-wrap items-end justify-between gap-x-10 gap-y-3", !flush && "mb-6 md:mb-8", className)}
    >
      <H className={cx("measure m-0 min-w-0 text-text", level === 2 ? "type-title-l" : "type-title-m")}>{title}</H>
      {(note || children) && (
        <div className="flex min-w-0 flex-col items-start gap-3 md:items-end md:text-right">
          {children}
          {note && <p className="type-body-s m-0 text-faint">{note}</p>}
        </div>
      )}
    </header>
  );
}

// DimensionLine: a hairline with tick ends and a figure that breaks the line; horizontal or
// vertical. Only over a number counted or computed from the catalog, never as a divider.
// Drawable: --draw draws the line from its start. Inside a surface that is not the ground or a
// Sheet, set --dim-surface to that surface.
export function DimensionLine({
  children,
  orientation = "h",
  placement = "above",
  className,
  style,
}: {
  children: ReactNode;
  orientation?: "h" | "v";
  placement?: "above" | "below";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-draw=""
      className={cx("dim", orientation === "v" && "dim--v", orientation === "h" && placement === "below" && "dim--below", className)}
      style={style}
    >
      <i className="dim-tick" aria-hidden="true" />
      <i className="dim-tick" aria-hidden="true" />
      <span className="dim-label">{children}</span>
    </div>
  );
}

// PropertyLine: the dash-dot line between the agent's side and the person's, or between the
// operator's machine and the hosted site. A vertical line folds flat below 768 px unless fold
// is false. Drawable: --draw draws it from its start. Not a generic divider: use a rule.
export function PropertyLine({
  orientation = "h",
  label,
  fold = true,
  className,
  style,
}: {
  orientation?: "h" | "v";
  label?: string;
  fold?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation === "v" ? "vertical" : "horizontal"}
      aria-label={label}
      data-draw=""
      className={cx("pline", orientation === "h" ? "pline--h" : "pline--v", orientation === "v" && fold && "pline--fold", className)}
      style={style}
    >
      {label && (
        <span aria-hidden="true" className="pline-label">
          {label}
        </span>
      )}
    </div>
  );
}

// Stamp: a person (a practitioner or an attorney) reviewed this, on this date. A word over its
// date in a ruled box, flat, in the one review color (the drafting blue): the same in a list,
// a ledger and a record's head. Never decorative, never without its date, never a lane color.
// Every other status (tested, documented, not live, AI-drafted, outline) is a Tag.
// Inkable: `inked={false}` draws it in pencil, as does data-inked="false" on an ancestor.
export function Stamp({
  word,
  date,
  datePrefix,
  inked = true,
  className,
}: {
  word: string;
  date: string;
  datePrefix?: string;
  /** @deprecated A review has one color. The tone is ignored. */
  tone?: "agent" | "accent" | "human" | "danger";
  inked?: boolean;
  className?: string;
}) {
  return (
    <span data-ink="" data-inked={inked ? undefined : "false"} className={cx("stamp", className)}>
      <span className="stamp-word">{word}</span>
      <span className="stamp-date">
        {datePrefix ? `${datePrefix} ` : ""}
        <time dateTime={date}>{date}</time>
      </span>
    </span>
  );
}

// RefusedBadge: the revision triangle with the step's number, wherever the engine refused a
// step. Decoration beside the word "Refused."; it is hidden from a screen reader.
export function RefusedBadge({ n, className }: { n: string | number; className?: string }) {
  return (
    <span aria-hidden="true" data-ink="" className={cx("refused-badge", className)}>
      <svg viewBox="0 0 26 23">
        <path d="M13 1.75 24.25 21.25H1.75Z" />
      </svg>
      <b>{n}</b>
    </span>
  );
}

// RevisionCloud: the red scalloped outline around the one thing the engine refused, with its
// refused badge when `delta` is given. Only for a refusal, and one per view, so it keeps its
// force. It is drawn from the --danger token, so it prints. Drawable: --draw draws it clockwise
// from the top left (`draw` sets it for a still specimen; a sequence tweens it). While --draw is
// below 1 the same outline shows in pencil under the ink (it reads --draw only, not data-inked).
// data-* and aria-* props pass through to the root.
export function RevisionCloud({
  children,
  delta,
  label,
  draw,
  className,
  style,
  ...attrs
}: {
  children: ReactNode;
  delta?: string | number;
  label?: string;
  /** 0 to 1: how much of the outline is drawn. Left out, it is whole. */
  draw?: number;
  className?: string;
  style?: CSSProperties;
  /** data-* and aria-* pass through to the root (data-seq-step, data-seq-draws, a data-draw value). */
  [attr: `data-${string}` | `aria-${string}`]: string | number | boolean | undefined;
}) {
  const drawn = draw === undefined ? style : ({ ...style, "--draw": draw } as CSSProperties);
  return (
    <div data-draw="" {...attrs} className={cx("rev-cloud", className)} style={drawn}>
      <i className="cloud-pencil" aria-hidden="true" />
      <i className="cloud-ink" aria-hidden="true" />
      {label && <span className="sr-only">{label}: </span>}
      {children}
      {delta !== undefined && <RefusedBadge n={delta} className="rev-delta" />}
    </div>
  );
}

export type OutcomeKind = "done" | "refused" | "clear" | "finding" | "unverified" | "approved" | "fixed" | "read";

// Outcome: the line that says what happened to a step ("Done, proof recorded", "Refused. A
// person's step"). Neutral ink, except a refusal (its first word, in the redline) and a
// finding. Inkable: in pencil it is quiet and still readable.
export function Outcome({
  kind,
  children,
  as: Tag = "p",
  className,
}: {
  kind: OutcomeKind;
  children: ReactNode;
  as?: "p" | "span" | "div";
  className?: string;
}) {
  return (
    <Tag data-ink="" data-outcome={kind} className={cx("outcome", className)}>
      {children}
    </Tag>
  );
}
