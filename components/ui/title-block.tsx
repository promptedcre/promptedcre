import { Children, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";
import { RoleMark } from "./roles";

// TitleBlock: what a sheet is, in ruled cells: who drew it, who approves, when, what state.
// One per sheet. It is structure, never a box inside a box: only the rules between its cells
// are drawn. Put it in a Sheet's `titleBlock` slot and it becomes the sheet's bottom edge; on
// its own it is one ruled band. Fill it with TitleCell and ApprovalCells. Every value is true
// and computed; never a placeholder. Cells in one row share a label track and a value track,
// so when one label wraps to two lines every value in that row still starts on the same line.
// `cols` fixes the column count from 1024 px up; below that, and without it, cells wrap at
// about 150 px each.
export function TitleBlock({
  children,
  label,
  cols,
  className,
}: {
  children: ReactNode;
  label?: string;
  cols?: number;
  className?: string;
}) {
  return (
    <dl
      aria-label={label}
      className={cx("tblock tblock--rows", cols ? "lg:grid-cols-[repeat(var(--tb-cols),minmax(0,1fr))]" : undefined, className)}
      style={cols ? ({ "--tb-cols": cols } as CSSProperties) : undefined}
    >
      {children}
    </dl>
  );
}

type CellTone = "default" | "agent" | "human" | "accent" | "danger" | "muted";

// A state said in a cell: a small square carries the color, the words stay neutral ink.
const TONE_DOT: Partial<Record<CellTone, string>> = {
  agent: "bg-agent",
  human: "bg-human",
  accent: "bg-accent",
  danger: "bg-danger",
};

// Words and figures only: a value that brings its own mark (a gate glyph, a role mark) is left alone.
const isPlain = (node: ReactNode) => Children.toArray(node).every((c) => typeof c === "string" || typeof c === "number");

// TitleCell: one cell of a title block, a label (sentence case) over a value. `mono` sets the
// value in Plex Mono, for an id, a date or a count; `wide` spans two columns from 768 px. A
// `tone` draws a small square in that color before a plain value (the words stay neutral ink;
// a value with its own mark keeps that mark instead); "muted" quiets the value.
export function TitleCell({
  label,
  children,
  tone = "default",
  mono = false,
  wide = false,
  className,
}: {
  label: string;
  children: ReactNode;
  tone?: CellTone;
  mono?: boolean;
  wide?: boolean;
  className?: string;
}) {
  const dot = isPlain(children) ? TONE_DOT[tone] : undefined;
  return (
    <div className={cx(wide && "md:col-span-2", className)}>
      <dt className="tblock-label">{label}</dt>
      <dd className={cx("tblock-value", mono && "type-data", tone === "muted" && "text-muted")}>
        {dot ? (
          <span className="inline-flex items-baseline gap-2">
            <i aria-hidden="true" className={cx("tag-dot translate-y-px", dot)} />
            <span className="min-w-0">{children}</span>
          </span>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}

// Labels and values are sentence case: a role passed in lower case ("principal") starts with a capital.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ApprovalCells: "Drawn by" and "Approved by", the product's core idea in two cells, for a
// TitleBlock. Who drew it carries that role's mark (an agent's square, a person's cut corner).
// Use only where a person really signs, approves or decides. With no approval yet, it shows a
// line to sign.
export function ApprovalCells({
  drawnBy,
  approvedBy,
  signer,
}: {
  drawnBy: string;
  approvedBy?: { name: string; date?: string } | null;
  signer?: string;
}) {
  const agentDrew = drawnBy === "agent";
  return (
    <>
      <div>
        <dt className="tblock-label">Drawn by</dt>
        <dd className="tblock-value">
          <RoleMark mode={agentDrew ? "A" : "H"} label={drawnBy} size="sm" className="type-body-s whitespace-normal font-medium" />
        </dd>
      </div>
      <div>
        <dt className="tblock-label">Approved by</dt>
        <dd className="tblock-value">
          {approvedBy ? (
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <RoleMark mode="H" label={approvedBy.name} size="sm" className="type-body-s whitespace-normal font-medium" />
              {approvedBy.date && (
                <time dateTime={approvedBy.date} className="type-data text-muted">
                  {approvedBy.date}
                </time>
              )}
            </span>
          ) : (
            <>
              <span className="sigline" aria-hidden="true" />
              <span className="type-body-s mt-1 block text-faint">
                {signer ? `${cap(signer)} signs` : "A person signs"}
                <span className="sr-only">. Not signed yet.</span>
              </span>
            </>
          )}
        </dd>
      </div>
    </>
  );
}
