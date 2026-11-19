import { useId, type ReactNode } from "react";
import type { StepMark } from "@/lib/compute/site-facts";
import { cx } from "./cx";
import { MARK_ORDER, ROLE_WORD, RoleMark, isAgentMark, marksLabel, tallyMarks } from "./roles";

export type MarkGroup = { label: string; marks: StepMark[] };

// Marks: one mark per step, in step order, at row scale (tables, rows, a door preview). Each is a
// 12 px square (sm) or a 14 px one (md): never thinner, so a person's cut corner shows.
// Not for more than about 30 steps or a headline figure: use Elevation, which is dimensioned.
export function Marks({
  marks,
  label,
  size = "md",
  className,
}: {
  marks: readonly StepMark[];
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label ?? marksLabel(marks)}
      className={cx("inline-flex flex-wrap items-center gap-0.5 align-middle", className)}
    >
      {marks.map((m, i) => (
        <i key={i} data-ink="" className={cx("mk", `mk-${m}`, size === "md" && "mk--md")} />
      ))}
    </span>
  );
}

const PITCH = 6; // one step, in drawing units
const BAR = 4.4; // the mark inside its pitch

// A person's step has its top-right corner cut, as the row marks do (.mk-H, .mk-O in
// app/globals.css): on a cell, and on a bar in the drawing (in drawing units: half the bar
// across, 8 of 100 down).
const CELL_CUT = { clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)" } as const;
function cutBar(x: number, y: number, h: number): string {
  const r = x + BAR;
  return `${x},${y} ${r - BAR / 2},${y} ${r},${y + 8} ${r},${y + h} ${x},${y + h}`;
}
const GROUP_GAP = 3 * PITCH;
const sortMarks = (m: readonly StepMark[]) => [...m].sort((a, b) => MARK_ORDER.indexOf(a) - MARK_ORDER.indexOf(b));
const pct = (x: number, w: number) => `${((x / w) * 100).toFixed(3)}%`;

function niceStep(n: number): number {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500]) if (n / s <= 6) return s;
  return 1000;
}

type Span = { from: number; to: number; label: ReactNode; low?: boolean };

// Elevation: every step drawn as one mark, colored by who does it and hatched for the browser and offline
// variants, dimensioned with a scale bar. "lg" for many steps (sorted by who does them, or grouped);
// "md" for one playbook in step order. Every number on it is counted from the marks it is given.
export function Elevation({
  marks,
  groups,
  size = "lg",
  sort = false,
  caption,
  note,
  legend = true,
  label,
  noun = "steps",
  barClassName,
  className,
}: {
  marks?: readonly StepMark[];
  groups?: readonly MarkGroup[];
  size?: "lg" | "md";
  sort?: boolean;
  caption?: ReactNode;
  note?: ReactNode;
  legend?: boolean;
  label?: string;
  noun?: string;
  // Classes for the bar strip of an "lg" elevation, so a page can set its height without reaching into the
  // markup. A breakpoint height (lg:h-[44px]) overrides the default from there up; a plain h-* replaces it.
  barClassName?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const list: MarkGroup[] = (groups ?? [{ label: "", marks: [...(marks ?? [])] }]).map((g) => ({
    label: g.label,
    marks: sort ? sortMarks(g.marks) : [...g.marks],
  }));
  const all = list.flatMap((g) => g.marks);
  const t = tallyMarks(all);
  const aria = label ?? marksLabel(all, noun);

  return (
    <figure className={cx("m-0 min-w-0", className)}>
      {(caption || note) && (
        <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
          {caption && <span className="type-label text-faint [&_b]:text-text">{caption}</span>}
          {note && <span className="type-label text-faint">{note}</span>}
        </figcaption>
      )}
      {size === "md" ? (
        <CellRow marks={all} aria={aria} total={t} noun={noun} />
      ) : (
        <Strip groups={list} sorted={sort} aria={aria} uid={uid} barClassName={barClassName} />
      )}
      {legend && t.total > 0 && (
        <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-6 gap-y-2.5 p-0">
          {MARK_ORDER.filter((m) => t.by[m] > 0).map((m) => (
            <li key={m} className="inline-flex items-center gap-2">
              <RoleMark mode={m} size="sm" />
              <span className="type-data text-muted">{t.by[m]}</span>
            </li>
          ))}
          {t.person > 0 && <li className="type-label text-faint">A person&rsquo;s step has a cut corner</li>}
        </ul>
      )}
    </figure>
  );
}

// One playbook, in step order: a cell per step with its number.
function CellRow({
  marks,
  aria,
  total,
  noun,
}: {
  marks: StepMark[];
  aria: string;
  total: ReturnType<typeof tallyMarks>;
  noun: string;
}) {
  const numbersOnPhone = marks.length <= 14;
  return (
    <div role="img" aria-label={aria}>
      <div aria-hidden="true">
        <div className="dim">
          <i className="dim-tick" />
          <i className="dim-tick" />
          <span className="dim-label">
            {total.total} {noun} · <b className="font-medium text-text">{total.agent}</b> agent ·{" "}
            <b className="font-medium text-text">{total.person}</b> person
          </span>
        </div>
        <div className="mt-1.5 flex gap-0.5">
          {marks.map((m, i) => (
            <div
              key={i}
              className={cx(
                "relative h-11 min-w-0 flex-1 sm:h-14",
                m === "A" && "bg-agent",
                m === "H" && "bg-human",
                m === "B" && "hatch-agent",
                m === "O" && "hatch-human",
              )}
              style={isAgentMark(m) ? undefined : CELL_CUT}
            >
              <span
                className={cx(
                  "type-note absolute bottom-1 left-1 font-mono leading-none",
                  numbersOnPhone ? "block" : "hidden sm:block",
                  m === "A" || m === "H" ? "text-accent-ink" : "bg-bg px-0.5 py-px text-text",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Many steps: one thin mark each, dimensioned above and below, over a scale bar.
function Strip({
  groups,
  sorted,
  aria,
  uid,
  barClassName,
}: {
  groups: MarkGroup[];
  sorted: boolean;
  aria: string;
  uid: string;
  barClassName?: string;
}) {
  // Lay the marks out in drawing units; a gap separates groups.
  const starts: number[] = [];
  let x = 0;
  groups.forEach((g, i) => {
    if (i > 0) x += GROUP_GAP;
    starts.push(x);
    x += g.marks.length * PITCH;
  });
  const W = Math.max(x, PITCH);
  const N = groups.reduce((n, g) => n + g.marks.length, 0);
  // Where the k-th mark (0-based, across groups) starts; k = N is the far end.
  const xOf = (k: number) => {
    if (N === 0) return 0;
    if (k >= N) return W;
    let left = k;
    for (let i = 0; i < groups.length; i++) {
      const len = groups[i]!.marks.length;
      if (left < len) return starts[i]! + left * PITCH;
      left -= len;
    }
    return W;
  };

  const rects: Record<StepMark, number[]> = { A: [], B: [], H: [], O: [] };
  groups.forEach((g, gi) => g.marks.forEach((m, i) => rects[m].push(starts[gi]! + i * PITCH + (PITCH - BAR) / 2)));

  const single = groups.length === 1;
  const t = tallyMarks(groups.flatMap((g) => g.marks));
  const top: Span[] = [];
  const bottom: Span[] = [];
  if (single && sorted) {
    if (t.agent > 0)
      top.push({ from: 0, to: xOf(t.agent), label: <><b className="font-medium text-text">{t.agent}</b> agent</> });
    if (t.person > 0)
      top.push({ from: xOf(t.agent), to: W, label: <><b className="font-medium text-text">{t.person}</b> person</> });
    let k = 0;
    for (const m of MARK_ORDER) {
      const n = t.by[m];
      if (n === 0) continue;
      const from = xOf(k);
      const to = xOf(k + n);
      bottom.push({
        from,
        to,
        low: (to - from) / W < 0.085,
        label: (
          <>
            <b className="font-medium text-text">{n}</b>
            <em className="not-italic text-faint max-sm:hidden"> {m === "A" ? "agent" : m === "O" ? "offline" : m === "B" ? "in a browser" : ROLE_WORD[m]}</em>
          </>
        ),
      });
      k += n;
    }
  } else if (!single) {
    groups.forEach((g, i) => {
      if (g.marks.length === 0) return;
      top.push({
        from: starts[i]!,
        to: starts[i]! + g.marks.length * PITCH,
        label: (
          <>
            <em className="not-italic text-faint max-sm:hidden">{g.label} </em>
            <b className="font-medium text-text">{g.marks.length}</b>
          </>
        ),
      });
    });
  } else {
    top.push({ from: 0, to: W, label: <><b className="font-medium text-text">{N}</b> steps</> });
  }

  // The scale bar: 0, round steps, and the total. With no marks it is one tick at 0.
  const step = niceStep(N);
  const ticks: number[] = [0];
  for (let v = step; v < N - step * 0.45; v += step) ticks.push(v);
  if (N > 0) ticks.push(N);

  // A narrow span at either end keeps its label inside the drawing: it is set flush with the span's
  // outer end instead of centered, so it cannot run past the edge of the page.
  const anchor = (s: Span, i: number, n: number) =>
    (s.to - s.from) / W >= 0.2 || n === 1 ? undefined : i === n - 1 ? "justify-end" : i === 0 ? "justify-start" : undefined;

  const edges = [...new Set([...top, ...bottom].flatMap((s) => [s.from, s.to]))];
  const anyLow = bottom.some((s) => s.low);
  const hb = `hb-${uid}`;
  const ho = `ho-${uid}`;

  return (
    <div role="img" aria-label={aria}>
      <div aria-hidden="true" className="relative">
        {edges.map((e) => (
          <i key={e} className="dim-ext" style={{ left: pct(e, W), top: 8, bottom: bottom.length ? 24 : 34 }} />
        ))}
        {top.length > 0 && (
          <div className="relative h-[30px]">
            {top.map((s, i) => (
              <div key={i} className={cx("dim absolute top-0", anchor(s, i, top.length))} style={{ left: pct(s.from, W), width: pct(s.to - s.from, W) }}>
                <i className="dim-tick" />
                <i className="dim-tick" />
                <span className="dim-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        <div
          className={cx(
            "relative my-2 border-y border-line-bold",
            !/(^|\s)h-/.test(barClassName ?? "") && "h-[clamp(56px,6vw,88px)]",
            barClassName,
          )}
        >
          <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="block size-full">
            <defs>
              <pattern id={hb} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="1.25" height="4" style={{ fill: "var(--agent)" }} />
              </pattern>
              <pattern id={ho} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="1.25" height="4" style={{ fill: "var(--human)" }} />
              </pattern>
            </defs>
            <g style={{ fill: "var(--agent)" }}>
              {rects.A.map((rx) => (
                <rect key={rx} x={rx} y={0} width={BAR} height={100} />
              ))}
            </g>
            <g style={{ fill: `url(#${hb})`, stroke: "var(--agent)", strokeWidth: 0.8 }}>
              {rects.B.map((rx) => (
                <rect key={rx} x={rx} y={0.4} width={BAR} height={99.2} />
              ))}
            </g>
            <g style={{ fill: "var(--human)" }}>
              {rects.H.map((rx) => (
                <polygon key={rx} points={cutBar(rx, 0, 100)} />
              ))}
            </g>
            <g style={{ fill: `url(#${ho})`, stroke: "var(--human)", strokeWidth: 0.8 }}>
              {rects.O.map((rx) => (
                <polygon key={rx} points={cutBar(rx, 0.4, 99.2)} />
              ))}
            </g>
          </svg>
        </div>
        {bottom.length > 0 && (
          <div className={cx("relative", anyLow ? "h-[58px]" : "h-[36px]")}>
            {bottom.map((s, i) => (
              <div
                key={i}
                className={cx("dim dim--below absolute top-0", s.low && "dim--low", anchor(s, i, bottom.length))}
                style={{ left: pct(s.from, W), width: pct(s.to - s.from, W) }}
              >
                <i className="dim-tick" />
                <i className="dim-tick" />
                <span className="dim-label max-sm:px-1">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="relative mt-1.5 h-7 border-t border-line-strong">
          {ticks.map((v, i) => {
            const first = i === 0;
            const last = i === ticks.length - 1;
            return (
              <span
                key={v}
                className="type-note absolute top-0 pt-2 font-mono text-faint"
                style={{
                  left: pct(xOf(v), W),
                  transform: first ? "none" : last ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                <i
                  className="absolute top-0 h-1.5 border-l border-line-bold"
                  style={first ? { left: 0 } : last ? { right: 0 } : { left: "50%" }}
                />
                {v}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
