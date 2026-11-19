// What follows the tool on a calculator page: schedules, and the working. Columns of ruled
// rows on plain ground, no boxes. Pure, so the client calculators and server pages share them.

import type { ReactNode } from "react";
import type { TraceLine } from "@/lib/calculators/trace";
import { cx } from "@/components/ui/cx";
import { SheetHeader } from "@/components/ui/drafting";
import { Figured } from "./figured";
import { count, figureFace, figureRuns } from "./format";
import { ScrollFrame } from "./scroll-frame";

// A value longer than this (a dated value: "Thursday, 2027-04-15") takes its own
// row under the label on a phone, so the label keeps the width.
const LONG_VALUE = 14;

const TRACE_COLS = "md:grid-cols-[1.5rem_minmax(0,16rem)_minmax(0,1fr)_minmax(8rem,auto)] md:gap-x-6";

// The working: every formula the calculator ran, in order, with its value. The numbers
// carry the order. A formula is set as it reads: its figures, operators and function calls
// in the data face, its words as words. Each line names itself (data-line) and its value, so
// the page can tint the lines an edit changed.
export function TraceView({ lines, tool, className }: { lines: TraceLine[]; tool?: string | null; className?: string }) {
  const stack = lines.some((l) => l.value.length > LONG_VALUE);
  return (
    <div className={cx("calc-trace min-w-0", className)}>
      <div aria-hidden="true" className={cx("type-label hidden pb-2 text-faint md:grid", TRACE_COLS)}>
        <span />
        <span>What</span>
        <span>Formula</span>
        <span className="text-right">Value</span>
      </div>
      <ol className="m-0 list-none border-y border-line-strong p-0">
        {lines.map((l, i) => (
          <li
            key={i}
            data-line={l.label}
            data-value={l.value}
            className={cx(
              "calc-line grid gap-x-3 gap-y-1 border-b border-line py-3 last:border-b-0 md:items-baseline",
              TRACE_COLS,
              stack ? "grid-cols-[1.5rem_minmax(0,1fr)]" : "grid-cols-[1.5rem_minmax(0,1fr)_auto]",
            )}
          >
            <span className="type-data text-faint">{i + 1}</span>
            <span className="type-body-s text-text">{l.label}</span>
            <span className={cx("type-body-s col-start-2 break-words text-muted md:col-start-3 md:col-end-4 md:row-start-1", stack ? "row-start-3" : "col-end-4 row-start-2")}>
              <Figured text={l.formula} counts="word" calls />
            </span>
            <span className={cx("type-body-s whitespace-nowrap text-text md:col-start-4 md:row-start-1 md:text-right", stack ? "col-start-2 row-start-2" : "col-start-3 row-start-1 text-right")}>
              <Figured text={l.value} />
            </span>
          </li>
        ))}
      </ol>
      {/* Shown only while a line carries the still mark (a reader who asks for less motion): see CalcStyles. */}
      <p className="calc-changed type-body-s m-0 mt-4 text-muted">
        <i aria-hidden="true" className="mr-2 inline-block size-3 border border-line-strong bg-panel align-baseline" />
        Marked: the lines your last edit changed.
      </p>
      {tool && (
        <p className="type-body-s m-0 mt-4 text-faint">
          For your agent: <code className="type-data text-muted">{tool}</code> returns these same {count(lines.length, "line")}.
        </p>
      )}
    </div>
  );
}

type Column = { head: string };

// A row head is set in the data face when it is a count or a year and nothing else.
const isCount = (v: ReactNode) => typeof v === "number" || (typeof v === "string" && /^[\d.,$%x()-]+$/.test(v));

// A cell of a schedule. Figures are set in the data face and words as words, also where one
// cell holds both ("2.68x on $100,000", "$455,089 interest only").
function Cell({ value }: { value: ReactNode }) {
  if (typeof value !== "string") return <td className={cx(typeof value === "number" ? "type-data" : "type-body-s", "text-text")}>{value}</td>;
  const face = figureFace(figureRuns(value));
  return <td className={cx(face === "data" ? "type-data" : "type-body-s", "text-text")}>{face === "mixed" ? <Figured text={value} /> : value}</td>;
}

// A schedule (a drawing's table): every column, on every screen. Where the columns do not
// fit, the table scrolls sideways inside its own frame and the first column holds, so a
// row is never read without its head; the frame then says so (ScrollFrame). `total` sets
// the last row off as the total.
export function Schedule({
  caption,
  columns,
  rows,
  total = false,
  className,
}: {
  caption: string;
  columns: Column[];
  rows: Array<Array<ReactNode>>;
  total?: boolean;
  className?: string;
}) {
  const body = total ? rows.slice(0, -1) : rows;
  const foot = total ? rows.at(-1) : undefined;
  const row = (r: Array<ReactNode>, i: number, strong: boolean) => (
    <tr key={i}>
      {r.map((v, j) =>
        j === 0 ? (
          <th key={j} scope="row" className={cx(isCount(v) ? "type-data" : "type-body-s", "font-normal", strong ? "text-text" : "text-muted")}>
            {v}
          </th>
        ) : (
          <Cell key={j} value={v} />
        ),
      )}
    </tr>
  );
  return (
    <ScrollFrame caption={caption} wide={columns.length > 4} className={className}>
      <table className="calc-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.head} scope="col" className="type-label">
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body.map((r, i) => row(r, i, false))}</tbody>
        {foot && <tfoot>{row(foot, 0, true)}</tfoot>}
      </table>
    </ScrollFrame>
  );
}

// What the page hands a calculator: the page head (PageHead, server-rendered and passed
// through as a prop), how the worked example was checked, in a few words, and the id an
// agent passes when the tool is the shared one.
export type SheetSlots = { head?: ReactNode; checked?: string | null; toolId?: string | null };

// A later section of a calculator page: a heading, a quiet note, and what it holds.
export function CalcSection({ id, title, note, children }: { id: string; title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="mt-16 md:mt-24">
      <SheetHeader id={`${id}-title`} title={title} note={note} />
      {children}
    </section>
  );
}

// A table's small title inside a section that holds more than one.
export function TableLabel({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 className="type-title-s m-0 text-text">{children}</h3>
      {note && <p className="type-body-s m-0 text-faint">{note}</p>}
    </div>
  );
}
