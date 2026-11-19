// The calculators' results, drawn: a lead figure, ruled cells of computed values,
// dimensioned bars, limit bars, an elevation of cash flows, a sensitivity grid and a dated
// schedule. Pure (no hooks, no file system), so the server and the client calculators draw
// with the same pieces. Every figure is fed a result from a function in lib/calculators;
// nothing is typed in. Each drawing stands in a ChartFrame (live.tsx) whose label is its text
// alternative: a screen reader reads that sentence in place of the drawing.
//
// Every bar that measures something is closed by a dimension line with its label, and
// nothing else gets one. A bar carries data-bar (its name inside the drawing, which carries
// data-bars): that is all the page's motion needs to move it from an old measure to a new
// one (components/calc/motion.tsx). What comes alive (decision 96) is marked here and moved
// by live.tsx: data-grow on a part that grows in when the drawing is first seen, data-read and
// data-read-value on a value the readout can name (both computed from the same result), and
// LiveText on a figure that rolls to its new value after an edit.

import type { CSSProperties, ReactNode } from "react";
import type { Deadline } from "@/lib/calculators/deadlines";
import { pct, usd } from "@/lib/calculators/trace";
import { cx } from "@/components/ui/cx";
import { DimensionLine } from "@/components/ui/drafting";
import { Icon } from "@/components/ui/icon";
import { SheetPart } from "@/components/ui/sheet";
import { Figured } from "./figured";
import { longDate, monthLabel, niceTicks, shortUsd } from "./format";
import { ChartFrame, LiveText } from "./live";

// ---------- fills ----------

export type Fill = "solid" | "tint" | "light" | "outline";

const FILL: Record<Fill, string> = {
  solid: "calc-fill-solid",
  tint: "calc-fill-tint",
  light: "calc-fill-light",
  outline: "calc-fill-outline",
};

function Swatch({ fill, className }: { fill: Fill; className?: string }) {
  return <i aria-hidden="true" className={cx("inline-block size-3 flex-none", FILL[fill], className)} />;
}

// A dimension line over a span. With a label it is the foundation's DimensionLine; a span
// too short to hold one keeps the line and its ticks (the same .dim rules) without it. The
// label's figure is set in the data face; a word that says what was measured ("distributed",
// "years held") is set as a word.
function Dim({ label, below = false, className, style }: { label?: string; below?: boolean; className?: string; style?: CSSProperties }) {
  if (label !== undefined) {
    return (
      <DimensionLine placement={below ? "below" : "above"} className={className} style={style}>
        <Figured text={label} ground="data" />
      </DimensionLine>
    );
  }
  return (
    <div data-draw="" className={cx("dim", below && "dim--below", className)} style={style}>
      <i className="dim-tick" />
      <i className="dim-tick" />
    </div>
  );
}

const pctOf = (v: number, total: number) => (total > 0 ? Math.max(0, Math.min(100, (v / total) * 100)) : 0);

// ---------- the parts of the figures sheet ----------

// A drawing's small title, with a quiet note beside it (what a fill means, what it is measured at).
export function FigureLabel({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="type-label m-0 text-text">{children}</p>
      {note && <p className="type-body-s m-0 text-faint">{note}</p>}
    </div>
  );
}

// What each fill of a drawing stands for, shown with the fill itself, so the key reads the
// same on night and on paper.
export function FillKey({ items }: { items: Array<[Fill, string]> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map(([fill, word]) => (
        <span key={word} className="inline-flex items-center gap-2">
          <Swatch fill={fill} />
          {word}
        </span>
      ))}
    </span>
  );
}

// One drawing on the figures sheet: a ruled part, on the drafting grid, with its title.
export function Drawing({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <SheetPart grid>
      <FigureLabel note={note}>{title}</FigureLabel>
      {children}
    </SheetPart>
  );
}

// Words on the figures sheet: notes the result carries, a caution, a line that says what
// the figures leave out. Plain paper, no grid.
export function Words({ title, note, children }: { title?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <SheetPart>
      {title && <FigureLabel note={note}>{title}</FigureLabel>}
      <div className="type-body-s space-y-2 text-muted [&_p]:m-0">{children}</div>
    </SheetPart>
  );
}

// A caution among the words: the risk mark, and what it says. The mark carries the color.
export function Caution({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      <Icon name="risk" className="mt-1 text-danger" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export type Headline = { label: string; value: string; sub?: string };

// The one lead figure: the answer's number, as large as its column allows. It counts up from
// zero the first time it is seen, and rolls to each new value (LiveText).
export function LeadFigure({ lead, className }: { lead: Headline; className?: string }) {
  // type-figure, never wider than its column: about 0.64 em a character at this width.
  const fit = `min(clamp(3.5rem, 6vw, 6rem), ${(156 / Math.max(lead.value.length, 4)).toFixed(1)}cqi)`;
  return (
    <div className={cx("calc-lead", className)}>
      <p className="type-label m-0 text-faint">{lead.label}</p>
      <p className="type-figure m-0 mt-2 text-text" style={{ fontSize: fit }}>
        <LiveText text={lead.value} enter />
      </p>
      {lead.sub && <p className="type-body-s m-0 mt-3 text-muted">{lead.sub}</p>}
    </div>
  );
}

// Computed values in ruled cells: a label over a figure. Solid cells (no dashed line): a
// reader cannot type here. An odd last cell runs the full width.
export function FigureCells({ cells, className }: { cells: Headline[]; cols?: 2 | 3; className?: string }) {
  if (cells.length === 0) return null;
  return (
    <dl className={cx("calc-stats", className)}>
      {cells.map((h) => (
        <div key={h.label}>
          <dt className="type-label text-faint">{h.label}</dt>
          <dd className="type-title-s mt-1 tabular-nums text-text">
            <LiveText text={h.value} />
          </dd>
          {h.sub && <dd className="type-body-s mt-0.5 text-faint">{h.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

// A titled band of computed cells on the figures sheet, edge to edge.
export function CellsPart({ title, note, cells, children }: { title: ReactNode; note?: ReactNode; cells: Headline[]; children?: ReactNode }) {
  return (
    <SheetPart className="p-0">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <FigureLabel note={note}>{title}</FigureLabel>
      </div>
      <FigureCells cells={cells} />
      {children && <div className="type-body-s space-y-2 border-t border-line px-4 py-4 text-muted md:px-6 [&_p]:m-0">{children}</div>}
    </SheetPart>
  );
}

// The lead figure and its neighbours as one block: what the worked-example previews draw.
export function HeadlineFigures({ lead, rest, className }: { lead: Headline; rest: Headline[]; compact?: boolean; cols?: 2 | 3; className?: string }) {
  return (
    <div className={cx("grid gap-y-6", className)}>
      <LeadFigure lead={lead} />
      <FigureCells cells={rest} />
    </div>
  );
}

// ---------- SplitBar: one total split into parts, dimensioned ----------

export type SplitSegment = { key: string; label: string; value: number; fill: Fill };

export function SplitBar({
  segments,
  total,
  totalLabel,
  title,
  minLabelPct = 14,
  className,
}: {
  segments: SplitSegment[];
  total: number;
  totalLabel: string;
  title: string;
  minLabelPct?: number;
  className?: string;
}) {
  const parts = segments.filter((s) => s.value > 0);
  const alt = `${title}: ${parts.map((s) => `${s.label} ${usd(s.value, false)}`).join(", ")}; ${totalLabel} ${usd(total, false)}.`;
  // Each part takes its share of the width; the gaps between parts come off all of them alike.
  const share = (s: SplitSegment): CSSProperties => ({ flex: `${s.value} 1 0%`, minWidth: 2 });
  return (
    <figure className={cx("m-0", className)}>
      <ChartFrame label={alt} axis="x">
        <div className="flex gap-0.5">
          {parts.map((s) => (
            <Dim key={s.key} style={share(s)} label={pctOf(s.value, total) >= minLabelPct ? shortUsd(s.value) : undefined} />
          ))}
        </div>
        <div className="flex h-11 gap-0.5 sm:h-12">
          {parts.map((s) => (
            <div
              key={s.key}
              data-bar={`${title}:${s.key}`}
              data-grow="x"
              data-read={s.label}
              data-read-value={`${usd(s.value, false)} · ${pct(s.value / total, 1)} of ${usd(total, false)}`}
              className={cx("h-full", FILL[s.fill])}
              style={share(s)}
            />
          ))}
        </div>
        <Dim below label={`${usd(total, false)} ${totalLabel}`} />
      </ChartFrame>
      <ul className="m-0 mt-5 grid list-none gap-x-6 gap-y-3 p-0 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
        {parts.map((s) => (
          <li key={s.key} className="flex min-w-0 items-start gap-2.5">
            <Swatch fill={s.fill} className="mt-1" />
            <span className="min-w-0">
              <span className="type-body-s block text-muted">{s.label}</span>
              <span className="type-data block text-text">
                <LiveText text={usd(s.value, false)} />
                <LiveText text={pct(s.value / total, 1)} className="ml-2 text-faint" />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---------- WaterfallLadder: each tier's cash, stepping down, investor and promote parts ----------

export type LadderTier = { label: string; total: number; investors: number; promote: number };

export function WaterfallLadder({ tiers, total, className }: { tiers: LadderTier[]; total: number; className?: string }) {
  const rows = tiers.filter((t) => t.total > 0);
  const placed = rows.map((t, i) => {
    const at = rows.slice(0, i).reduce((s, x) => s + x.total, 0);
    const width = Math.max(pctOf(t.total, total), 0.6);
    return { ...t, left: pctOf(at, total), width, split: width * (t.total > 0 ? t.investors / t.total : 1) };
  });
  const alt = `Cash by tier, in order: ${rows.map((t) => `${t.label}, ${usd(t.total, false)}: ${usd(t.investors, false)} to investors and ${usd(t.promote, false)} promote`).join("; ")}.`;
  return (
    <figure className={cx("m-0", className)}>
      {/* Each tier fills from where the one above it ended, the investors' part and then the promote. */}
      <ChartFrame label={alt} axis="y">
        <ol className="m-0 list-none p-0">
          {placed.map((t, i) => (
            <li
              key={t.label}
              className="relative pb-3"
              data-read={`${i + 1}. ${t.label}`}
              data-read-value={`${usd(t.total, false)} · ${usd(t.investors, false)} to investors${t.promote > 0 ? ` · ${usd(t.promote, false)} promote` : ""}`}
            >
              {/* The drop line from the tier above lands on this tier's start. It passes behind
                  the tier's name and its total: each is knocked out of the line, never struck through. */}
              {i > 0 && <span data-bar={`drop:${i}`} className="dim-ext top-0 bottom-9" style={{ left: `calc(${t.left}% - 0.5px)` }} />}
              <span className="flex items-baseline justify-between gap-x-4 pt-3">
                <span className="type-body-s relative z-10 flex min-w-0 gap-2.5 bg-[var(--dim-surface,var(--bg))] pr-2 text-muted">
                  <span className="type-data text-faint">{i + 1}</span>
                  <span className="min-w-0">{t.label}</span>
                </span>
                <span className="type-data relative z-10 flex-none bg-[var(--dim-surface,var(--bg))] pl-2 text-right text-text">
                  <LiveText text={usd(t.total, false)} />
                  {t.promote > 0 && <span className="type-note block text-faint sm:ml-2 sm:inline">{shortUsd(t.promote)} promote</span>}
                </span>
              </span>
              <span className="relative mt-2 block h-6 border-y border-line">
                <span
                  data-bar={`tier:${i}:in`}
                  data-grow="x"
                  data-grow-at={i}
                  className="calc-fill-solid absolute inset-y-0"
                  style={{ left: `${t.left}%`, width: `${t.split}%` }}
                />
                {t.promote > 0 && (
                  <span
                    data-bar={`tier:${i}:pr`}
                    data-grow="x"
                    data-grow-at={i + 0.5}
                    className="calc-fill-light absolute inset-y-0"
                    style={{ left: `${t.left + t.split}%`, width: `${t.width - t.split}%` }}
                  />
                )}
                {i < placed.length - 1 && <span data-bar={`fall:${i}`} className="dim-ext top-full h-3" style={{ left: `calc(${t.left + t.width}% - 0.5px)` }} />}
              </span>
            </li>
          ))}
        </ol>
      </ChartFrame>
      <div aria-hidden="true">
        <Dim below label={`${usd(total, false)} in all`} />
      </div>
    </figure>
  );
}

// ---------- LimitBars: the loan each limit allows, the binding one solid ----------

export type LimitBar = { key: string; label: string; detail: string; amount: number; binding: boolean };

export function LimitBars({ limits, loan, compact = false, className }: { limits: LimitBar[]; loan: number; compact?: boolean; className?: string }) {
  const finite = limits.map((l) => l.amount).filter((a) => Number.isFinite(a));
  const ticks = niceTicks(Math.max(...finite, loan, 1), compact ? 3 : 4);
  const axis = Math.max(ticks.at(-1) ?? 1, ...finite);
  const at = (v: number) => (Number.isFinite(v) ? pctOf(v, axis) : 100);
  const binding = limits.find((l) => l.binding);
  const alt = `${limits.map((l) => `${l.label} allows ${Number.isFinite(l.amount) ? usd(l.amount, false) : "any loan"}`).join("; ")}. The largest loan that meets every limit is ${usd(loan, false)}${binding ? `, set by ${binding.label.toLowerCase()}` : ""}.`;
  const loanLabel = `Loan ${shortUsd(loan)}`;
  // A short span cannot hold its label centred: it would run out past the
  // figure's left edge. Then the label sits just right of the extension line.
  const outside = at(loan) < 35;
  return (
    <figure className={cx("m-0", className)}>
      <ChartFrame label={alt} axis="y" className="relative">
        <div style={{ width: `${at(loan)}%` }}>
          {/* "safe center": a label wider than its span starts at the span's left
              edge instead of running out past the figure (a narrow phone). */}
          <Dim label={outside ? undefined : loanLabel} style={{ justifyContent: "safe center" }} />
        </div>
        {outside && (
          <span className="dim-label" style={{ position: "absolute", top: 0, left: `${at(loan)}%` }}>
            <Figured text={loanLabel} ground="data" />
          </span>
        )}
        <span data-bar="loan-line" className="dim-ext top-5 bottom-8 z-10" style={{ left: `calc(${at(loan)}% - 0.5px)` }} />
        <ol className={cx("m-0 list-none p-0", compact ? "mt-1 space-y-3" : "mt-2 space-y-4")}>
          {limits.map((l) => (
            <li
              key={l.key}
              data-read={l.label}
              data-read-value={`${Number.isFinite(l.amount) ? usd(l.amount, false) : "no limit"} · ${l.detail}${l.binding ? " · binds" : ""}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="type-body-s relative z-20 min-w-0 bg-[var(--dim-surface,var(--bg))] pr-2">
                  <span className={l.binding ? "text-text" : "text-muted"}>{l.label}</span>
                  <span className={cx("type-note text-faint", compact ? "ml-2 hidden sm:inline" : "block sm:ml-2 sm:inline")}>{l.detail}</span>
                </span>
                <span className="relative z-20 flex-none bg-[var(--dim-surface,var(--bg))] pl-2">
                  {l.binding && <span className="type-label mr-2 text-text">Binds</span>}
                  {/* an amount is a figure; a limit that allows any loan says so in words */}
                  <LiveText
                    text={Number.isFinite(l.amount) ? (compact ? shortUsd(l.amount) : usd(l.amount, false)) : "no limit"}
                    className={cx(Number.isFinite(l.amount) ? "type-data" : "type-body-s", l.binding ? "text-text" : "text-muted")}
                  />
                </span>
              </span>
              <span className={cx("relative mt-1 block", compact ? "h-4" : "h-5")}>
                <span
                  data-bar={`limit:${l.key}`}
                  data-grow="x"
                  className={cx("absolute inset-y-0 left-0", l.binding ? FILL.solid : FILL.outline)}
                  style={{ width: `${at(l.amount)}%` }}
                />
              </span>
            </li>
          ))}
        </ol>
        <div className="relative mt-3 h-7 border-t border-line-bold">
          {ticks.map((t) => (
            <span
              key={t}
              className={cx("type-note absolute top-0 tabular-nums text-faint", t === 0 ? "" : at(t) > 92 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: `${at(t)}%` }}
            >
              <span className="mx-auto block h-1.5 w-px bg-line-bold" />
              {t === 0 ? "$0" : shortUsd(t)}
            </span>
          ))}
        </div>
      </ChartFrame>
    </figure>
  );
}

// ---------- CashFlowElevation: money in below the line, money back above ----------

// `span` names what the axis measures end to end ("5 years held"): the dimension line that closes the drawing.
export function CashFlowElevation({ flows, title, span: spanLabel, className }: { flows: number[]; title: string; span?: string; className?: string }) {
  const up = Math.max(0, ...flows);
  const down = Math.max(0, ...flows.map((f) => -f));
  const span = up + down || 1;
  const H = 200;
  const pad = 22;
  const base = pad + (up / span) * H; // the zero line, from the top
  const height = pad * 2 + H;
  const many = flows.length > 12;
  // Where the labels would collide they are thinned: a narrow drawing with more than six
  // bars prints the first and last amounts; a long run of years is ticked every fifth.
  const crowded = flows.length > 6;
  return (
    <figure className={cx("@container m-0", className)}>
      {/* Money back rises from the line and money in drops from it, year by year; the readout
          names each year's amount, where the labels on the drawing are thinned too. */}
      <ChartFrame label={`${title}, by year: ${flows.map((f, t) => `year ${t} ${usd(f, false)}`).join(", ")}.`} axis="x">
        <div className="relative" style={{ height }}>
          <span className="absolute inset-x-0 h-px bg-line-bold" style={{ top: base }} />
          <div className="absolute inset-0 flex">
            {flows.map((f, t) => {
              const h = Math.max((Math.abs(f) / span) * H, 1);
              const ends = t === 0 || t === flows.length - 1;
              return (
                <div key={t} className="calc-col relative min-w-0 flex-1" data-read={`Year ${t}`} data-read-value={usd(f, false)}>
                  <span
                    data-bar={`flow:${t}`}
                    data-grow={f >= 0 ? "up" : "down"}
                    className={cx("absolute left-1/2 w-[46%] max-w-12 -translate-x-1/2", f >= 0 ? FILL.solid : FILL.outline)}
                    style={{ top: f >= 0 ? base - h : base + 1, height: h }}
                  />
                  {(ends || !many) && (
                    <LiveText
                      text={shortUsd(f)}
                      className={cx("type-note absolute left-1/2 -translate-x-1/2 whitespace-nowrap tabular-nums text-muted", !ends && crowded && "hidden @lg:block")}
                      style={{ top: f >= 0 ? base - h - 20 : base + h + 4 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex border-t border-line pt-1.5">
          {flows.map((_, t) => (
            <span key={t} className="type-note min-w-0 flex-1 text-center tabular-nums text-faint">
              {many && t % 5 !== 0 && t !== flows.length - 1 ? "" : t === 0 ? "Yr 0" : t}
            </span>
          ))}
        </div>
        {/* from the middle of the first year's bar to the middle of the last */}
        {spanLabel && flows.length > 1 && <Dim below label={spanLabel} style={{ marginInline: `${50 / flows.length}%` }} />}
      </ChartFrame>
    </figure>
  );
}

// ---------- SensitivityGrid: the two-way table, drawn ----------

export function SensitivityGrid({
  rows,
  cols,
  values,
  base,
  rowLabel,
  colLabel,
  caption,
}: {
  rows: number[];
  cols: number[];
  values: Array<Array<number | null>>;
  base: [number, number];
  rowLabel: string;
  colLabel: string;
  caption: string;
}) {
  const flat = values.flat().filter((v): v is number => v !== null);
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const shade = (v: number) => (hi > lo ? 4 + ((v - lo) / (hi - lo)) * 22 : 10);
  // The grid stays a table a screen reader walks by its headers; the readout and the arrow
  // keys are for the eye. Its shading fills outward from your inputs' cell.
  return (
    <ChartFrame label={caption} role="group" axis="grid" className="min-w-0">
      <table className="type-data w-full table-fixed border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[24%] border-b border-line-strong pb-2 text-left align-bottom font-normal">
              <span className="type-note block text-faint">
                <span className="flex items-center gap-1">
                  {rowLabel} <Icon name="arrow-down" />
                </span>
                <span className="flex items-center gap-1">
                  {colLabel} <Icon name="arrow-right" />
                </span>
              </span>
            </th>
            {cols.map((c, j) => (
              <th key={c} scope="col" className={cx("border-b border-line-strong pb-2 text-right font-medium", j === base[1] ? "text-text" : "text-faint")}>
                {pct(c, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r}>
              <th scope="row" className={cx("border-b border-line py-2.5 pr-2 text-left font-medium", i === base[0] ? "text-text" : "text-faint")}>
                {pct(r)}
              </th>
              {cols.map((c, j) => {
                const v = values[i]?.[j] ?? null;
                const isBase = i === base[0] && j === base[1];
                return (
                  <td
                    key={c}
                    data-read={`${rowLabel} ${pct(r)} · ${colLabel.toLowerCase()} ${pct(c, 1)}`}
                    data-read-value={`${v === null ? "none" : pct(v, 1)}${isBase ? " · your inputs" : ""}`}
                    data-read-row={i}
                    data-read-col={j}
                    data-read-start={isBase ? "" : undefined}
                    data-grow={v !== null ? "tint" : undefined}
                    data-grow-at={Math.max(Math.abs(i - base[0]), Math.abs(j - base[1]))}
                    className={cx(
                      "border-b border-l border-line px-1.5 py-2.5 text-right text-text sm:px-2.5",
                      v !== null && "calc-shade",
                      isBase && "outline outline-2 -outline-offset-2 outline-accent-strong",
                    )}
                    style={v !== null ? ({ "--calc-shade": `${shade(v)}%` } as CSSProperties) : undefined}
                  >
                    {v === null ? <span className="type-body-s text-faint">none</span> : <LiveText text={pct(v, 1)} />}
                    {isBase && <span className="sr-only"> (your inputs)</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  );
}

// ---------- Deadlines: a timeline and a schedule ----------

type DatedItem = Pick<Deadline, "id" | "label" | "date" | "rolledFrom">;

function monthStarts(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy ?? 2000;
  let m = fm ?? 1;
  while (y < (ty ?? y) || (y === ty && m <= (tm ?? m))) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

// The number that keys a date on the timeline to its row in the schedule. On the timeline it
// is also what the readout names (`read`) and it arrives after its stem (`at`).
function DateKey({ n, className, style, read }: { n: number; className?: string; style?: CSSProperties; read?: { what: string; value: string; at: number } }) {
  return (
    <span
      className={cx("type-data grid h-6 min-w-6 place-items-center border border-accent bg-[var(--dim-surface,var(--bg))] px-1 text-text", className)}
      style={style}
      data-read={read?.what}
      data-read-value={read?.value}
      data-grow={read ? "pop" : undefined}
      data-grow-at={read?.at}
    >
      {n}
    </span>
  );
}

// A dated axis from the first month to the last, one numbered key per date.
// Keys that would touch drop to another lane; a moved date shows where it moved from.
export function DeadlineTimeline({ items, className }: { items: DatedItem[]; className?: string }) {
  if (items.length === 0) return null;
  const dates = items.flatMap((i) => [i.date, i.rolledFrom ?? i.date]).sort();
  const months = monthStarts(dates[0] ?? "", dates.at(-1) ?? "");
  const start = dayNo(months[0] ?? "");
  const lastMonth = months.at(-1) ?? "";
  const [ly, lm] = lastMonth.split("-").map(Number);
  const end = dayNo(lm === 12 ? `${(ly ?? 0) + 1}-01-01` : `${ly}-${String((lm ?? 0) + 1).padStart(2, "0")}-01`);
  const x = (iso: string) => ((dayNo(iso) - start) / (end - start)) * 100;
  const lanes: number[] = [];
  const placed = items.map((it, i) => {
    const pos = x(it.date);
    let lane = 0;
    while (lanes[lane] !== undefined && pos - (lanes[lane] ?? 0) < 8.5) lane += 1;
    lanes[lane] = pos;
    return { ...it, n: i + 1, pos, from: it.rolledFrom ? x(it.rolledFrom) : null, lane };
  });
  const laneCount = Math.max(1, ...placed.map((p) => p.lane + 1));
  // Month labels are thinned where they would collide: about six across the axis.
  const step = Math.max(1, Math.ceil(months.length / 6));
  // The last month is always labelled, so the last date falls inside the
  // labelled range; a stepped label too close to it gives way. Near the right
  // edge the last label ends at the edge instead of running past it.
  const lastIdx = months.length - 1;
  const lastX = x(months[lastIdx] ?? "");
  const labelled = (m: string, i: number) => i === lastIdx || (i % step === 0 && x(m) < lastX - 20);
  const endAligned = lastIdx > 0 && lastX > 82;
  return (
    <figure className={cx("m-0", className)}>
      {/* Each date's stem rises from the axis and its key arrives on it, in date order; a moved
          date's line runs from where it fell to where it moved. */}
      <ChartFrame label={`Timeline of the ${items.length} dates, numbered as in the schedule.`} axis="xy" className="relative" style={{ height: laneCount * 32 + 42 }}>
        {placed.map((p, k) => (
          <span key={p.id}>
            <span data-grow="up" data-grow-at={k} className="absolute w-px bg-line-bold" style={{ left: `${p.pos}%`, top: p.lane * 32 + 24, bottom: 32 }} />
            {p.from !== null && (
              <span
                data-grow="x"
                data-grow-at={k}
                className="absolute h-px bg-accent"
                style={{ left: `${p.from}%`, width: `${Math.max(p.pos - p.from, 0.4)}%`, bottom: 32 }}
              />
            )}
            <DateKey
              n={p.n}
              className="absolute -translate-x-1/2"
              style={{ left: `${p.pos}%`, top: p.lane * 32 }}
              read={{ what: `${p.n}. ${p.label}`, value: p.rolledFrom ? `${p.date} · moved from ${p.rolledFrom}` : p.date, at: k + 0.5 }}
            />
          </span>
        ))}
        <span className="absolute inset-x-0 h-px bg-line-bold" style={{ bottom: 32 }} />
        {months.map((m, i) => (
          <span key={m} className="absolute" style={{ left: `${x(m)}%`, bottom: 0, height: 36 }}>
            <span className="absolute left-0 top-0 h-2 w-px bg-line-bold" />
            {labelled(m, i) && !(i === lastIdx && endAligned) && <span className="type-note absolute left-1 top-3 whitespace-nowrap tabular-nums text-faint">{monthLabel(m)}</span>}
          </span>
        ))}
        <span className="absolute right-0 h-2 w-px bg-line-bold" style={{ bottom: 28 }} />
        {endAligned && (
          <span className="absolute right-0" style={{ bottom: 0, height: 36 }}>
            <span className="type-note absolute right-0 top-3 whitespace-nowrap tabular-nums text-faint">{monthLabel(months[lastIdx] ?? "")}</span>
          </span>
        )}
      </ChartFrame>
    </figure>
  );
}

// A date a person should check before relying on it: the hatched square the site uses for
// "unverified", and the word.
export function ReviewMark() {
  return (
    <span className="type-label inline-flex items-center gap-2 whitespace-nowrap text-text">
      <i aria-hidden="true" className="hatch-unverified inline-block size-3 flex-none" />
      Review
    </span>
  );
}

// The dates as a schedule: its key, the date, what is due, where it moved from, its
// note and its rule (the working is the trace's). `compact` keeps one line a date.
export function DeadlineSchedule({
  items,
  ruleTitles = {},
  ruleHref = (id) => `#rule-${id}`,
  compact = false,
  className,
}: {
  items: Deadline[];
  ruleTitles?: Record<string, string>;
  ruleHref?: (id: string) => string;
  compact?: boolean;
  className?: string;
}) {
  // When every date is flagged the calculator says so once above the schedule, so no row repeats it.
  const markEach = !items.every((d) => d.needsReview);
  return (
    <ol className={cx("m-0 list-none border-t border-line-strong p-0", className)}>
      {items.map((d, i) => (
        <li
          key={d.id}
          className={cx(
            "grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-line last:border-b-0",
            compact ? "py-3 sm:grid-cols-[2rem_9.5rem_minmax(0,1fr)_auto] sm:items-baseline" : "py-4 sm:grid-cols-[2rem_8.5rem_minmax(0,1fr)] sm:gap-x-4",
          )}
        >
          <span aria-hidden="true">
            <DateKey n={i + 1} className="inline-grid" />
          </span>
          {compact ? (
            <span className="min-w-0 whitespace-nowrap">
              <time dateTime={d.date} className="type-data text-text">
                {d.date}
              </time>
              <span className="type-body-s ml-2 text-faint">{d.weekday.slice(0, 3)}</span>
            </span>
          ) : (
            <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 sm:block">
              <time dateTime={d.date} className="type-title-s tabular-nums text-text sm:block">
                {d.date}
              </time>
              <span className="type-body-s text-faint sm:block" title={longDate(d.date)}>
                {d.weekday}
              </span>
              {d.needsReview && markEach && (
                <span className="sm:mt-2 sm:block">
                  <ReviewMark />
                </span>
              )}
              {d.needsReview && !markEach && <span className="sr-only">Flagged for review.</span>}
            </p>
          )}
          <div className={cx("col-start-2 min-w-0", compact ? "sm:col-start-3 sm:row-start-1" : "mt-1 sm:col-start-3 sm:row-start-1 sm:mt-0")}>
            <p className={cx("m-0 text-text", compact ? "type-body-s" : "type-title-s")}>
              {d.label}
              {d.needsReview && compact && <span className="sr-only"> (flagged for review)</span>}
            </p>
            {!compact && (
              <>
                {d.rolledFrom && (
                  <p className="type-body-s m-0 mt-1 flex items-center gap-2 text-muted">
                    <Icon name="arrow-right" className="text-accent" />
                    <span>
                      Moved from <span className="type-data">{d.rolledFrom}</span>.
                    </span>
                  </p>
                )}
                {d.note && <p className="type-body-s measure m-0 mt-2 text-muted">{d.note}</p>}
                {d.ruleId && (
                  <p className="type-body-s m-0 mt-2 text-faint">
                    Rule:{" "}
                    <a href={ruleHref(d.ruleId)} className="link link--muted">
                      {ruleTitles[d.ruleId] ?? d.ruleId}
                    </a>
                  </p>
                )}
              </>
            )}
          </div>
          {compact && d.rolledFrom && <span className="type-note col-start-2 text-faint sm:col-start-4 sm:row-start-1">moved from {d.rolledFrom.slice(5)}</span>}
        </li>
      ))}
    </ol>
  );
}
