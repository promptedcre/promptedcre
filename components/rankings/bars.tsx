import Link from "next/link";
import type { CSSProperties } from "react";
import { Tag } from "@/components/chips";
import { CountUp, Logo, cx } from "@/components/ui";
import { storyKey, type StoryGroupKey } from "./labels";
import type { MarketSummary, RankedRow } from "./summary";

// Score bars (D224, the owner's "animated bars"): one row per vendor with its icon, its name
// (a link over the whole row), its score as a figure and the score drawn on a 0 to 100 bar,
// the same measured scale as ScoreBar: a hairline closed by 45-degree ticks, the score filled
// in agent green. The index draws a market's top three this way (TopBars); a market page draws
// every listed vendor (ScoreChart), the scored ones in rank order, then the ones with no score.
//
// Motion, once and only where the reader allows it: the list comes into focus when it enters
// the screen (data-reveal), each bar fills from 0 one after another (fill-on-reveal, delayed by
// the row's --i) and each figure counts up to its value (CountUp). The server's HTML is the
// finished chart, so with scripts off, reduced motion or on paper the bars are full and the
// figures final (the hidden "before" states live only under html.js[data-motion="full"] in
// app/globals.css).
//
// Pointing at a row, or tabbing to its link, shows a small card with the vendor's group scores
// (agent access, openness, market tasks: Score.groups from lib/scoring/score.ts). The card sits
// on the row's own bar, just past the fill (it moves left when there is no room), so it never
// covers another row. It is a picture: the same words reach a screen reader through the link's
// description. A vendor with no score (untested, stale) gets no bar, no figure and no card:
// its state chip and the reason, in the table's words.
//
// The classes (rkb- the rows, rkc- the chart card, rks- the sort control) are in BarStyles,
// which a page renders once.

export const BARS_CSS = `@layer components {
.rkb-frame{margin-inline:-.5rem}
.rkb-list{margin:0;padding:0;list-style:none}
.rkb{position:relative;display:grid;grid-template-columns:1.5rem minmax(0,1fr) auto;column-gap:.75rem;row-gap:.125rem;align-items:center;padding:.5rem;border-bottom:1px solid var(--line)}
.rkb-rank{grid-column:1;grid-row:1}
.rkb-link{grid-column:2;grid-row:1}
.rkb-score{grid-column:3;grid-row:1;text-align:right}
.rkb-track,.rkb-state{grid-column:2 / -1;grid-row:2}
.rkb-track{position:relative;height:1.5rem;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rkb-state{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .75rem;min-width:0}
.rkb-line{position:absolute;inset-inline:0;top:50%;height:1px;background-color:var(--line-bold)}
.rkb-end{position:absolute;top:50%;width:1px;height:.5rem;background-color:var(--text-faint);translate:0 -50%;rotate:45deg}
.rkb-end--0{left:0}
.rkb-end--100{right:0}
.rkb-fill{position:absolute;left:0;top:50%;width:var(--pct);height:.375rem;translate:0 -50%;background-color:var(--agent)}
.rkb-pop{position:absolute;inset:0;display:flex;align-items:center;opacity:0;visibility:hidden;transition:opacity var(--dur-1) var(--ease-out),visibility 0s linear var(--dur-1)}
.rkb-gap{flex:0 1 calc(var(--pct) + .5rem);min-width:0}
.rkb-card{display:flex;flex:none;flex-wrap:wrap;gap:0 .75rem;max-width:100%;padding:.125rem .5rem;border:1px solid var(--line-strong);border-radius:var(--radius-control);background-color:var(--bg-raised);box-shadow:var(--shadow-box);color:var(--text-muted)}
.rkb-card>span{white-space:nowrap}
.rkb--go:has(.rkb-link:focus-visible) .rkb-pop{opacity:1;visibility:visible;transition-delay:0s}
@media (hover:hover){
.rkb--go{transition:background-color var(--dur-1) var(--ease-out)}
.rkb--go:hover{background-color:var(--bg-panel)}
.rkb--go:hover .rkb-pop{opacity:1;visibility:visible;transition-delay:0s}
}
.rkb--axis{border-bottom-color:var(--line-strong);padding-block:.25rem}
.rkb-axis{grid-column:2 / -1;grid-row:1;position:relative;height:1.125rem}
.rkb-tick{position:absolute;top:0;translate:-50% 0;color:var(--text-faint)}
.rkb-tick:first-child{translate:0 0}
.rkb-tick:last-child{translate:-100% 0}
@media (min-width:768px){
.rkb-chart .rkb{grid-template-columns:1.5rem minmax(9rem,16rem) minmax(0,1fr) 2.75rem;row-gap:0}
.rkb-chart .rkb-track,.rkb-chart .rkb-axis{grid-column:3;grid-row:1}
.rkb-chart .rkb-state{grid-column:3 / -1;grid-row:1}
.rkb-chart .rkb-score{grid-column:4}
.rkb-chart .rkb-track{height:1.75rem}
}
html.js[data-motion="full"] .rkb .fill-on-reveal{transition-delay:calc(160ms + min(var(--i, 0), 8) * 50ms)}
.rkc{border:1px solid var(--line-strong);border-radius:var(--radius-box);background-color:var(--bg-raised);box-shadow:var(--shadow-box);padding:1rem}
.rkc .rkb-list>.rkb:last-child{border-bottom:0}
.rkc-stat{display:grid;gap:.125rem;margin:0 0 1rem}
@media (min-width:768px){.rkc{padding:1.25rem 1.5rem}}
.rks{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem}
html:not(.js) .rks{display:none}
.rks-pills{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-radius:2rem;background-color:var(--bg-inset);padding:.25rem}
.rks-hl{position:absolute;top:.25rem;bottom:.25rem;left:.25rem;width:calc((100% - .5rem) / 2);border-radius:2rem;background-color:var(--bg-raised);box-shadow:var(--shadow-box);transition:translate var(--dur-2) var(--ease-out)}
.rks[data-order="name"] .rks-hl{translate:100% 0}
.rks-btn{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:0 1rem;border:0;border-radius:2rem;background:none;color:var(--text-muted);cursor:pointer;white-space:nowrap;transition:color var(--dur-1) var(--ease-out)}
.rks-btn[aria-pressed="true"]{color:var(--text)}
@media (hover:hover){.rks-btn:hover{color:var(--text)}}
@media (min-width:768px){.rks-btn{min-height:2.25rem}}
}`;

/** The rules for score bars, the chart card and the sort control. Render once per page. */
export function BarStyles() {
  return (
    <style href="rankings-bars" precedence="default">
      {BARS_CSS}
    </style>
  );
}

type GroupScore = { label: string; score: number | null };

const groupsOf = (row: RankedRow, keys: StoryGroupKey[]): GroupScore[] => keys.map((g) => ({ label: g.label, score: row.result.groups[g.group] }));

/** "Group scores: agent access 75, openness 45, market tasks 83." A group with no applicable task is "not applicable". */
export function groupSentence(groups: GroupScore[]): string {
  return `Group scores: ${groups.map((g) => `${g.label.toLowerCase()} ${g.score ?? "not applicable"}`).join(", ")}.`;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

// One vendor as a bar row. `i` is its place among the bars, for the fill's turn.
function BarRow({ row, marketId, keys, i }: { row: RankedRow; marketId: string; keys: StoryGroupKey[]; i: number }) {
  const href = `/rankings/${marketId}/${row.vendor.id}`;
  const score = row.result.score;
  const logo = <Logo id={row.vendor.id} name={row.vendor.name} size="md" government={row.vendor.kind === "government"} />;
  const linkClass =
    "rkb-link type-body inline-flex min-w-0 items-center gap-2 underline decoration-transparent underline-offset-4 before:absolute before:inset-0 hover:decoration-accent";

  // No score: no bar, no figure, no card. The chip and the reason say why, as the table does.
  if (row.rank === null || score === null) {
    return (
      <li className="rkb rkb--go" data-vendor={row.vendor.id}>
        <span className="rkb-rank type-body-s tabular-nums text-faint">
          <span aria-hidden="true">–</span>
          <span className="sr-only">not ranked</span>
        </span>
        <Link href={href} className={cx(linkClass, "text-muted")}>
          {logo}
          {row.vendor.name}
        </Link>
        <span className="rkb-state">
          <Tag dashed>{row.status === "stale" ? "stale" : "untested"}</Tag>
          {row.reason && <span className="type-body-s text-muted">Not scored: {row.reason}.</span>}
        </span>
      </li>
    );
  }

  const groups = groupsOf(row, keys);
  const descId = `rkb-${marketId}-${row.vendor.id}`;
  return (
    <li className="rkb rkb--go" data-vendor={row.vendor.id} style={{ "--pct": `${clamp(score)}%`, "--i": i } as CSSProperties}>
      <span className="rkb-rank type-body-s tabular-nums text-faint">
        <span className="sr-only">rank </span>
        {row.rank}
      </span>
      <Link href={href} aria-describedby={descId} className={cx(linkClass, "text-text")}>
        {logo}
        {row.vendor.name}
      </Link>
      <span className="rkb-score type-title-s text-text">
        <CountUp value={score} />
        <span className="sr-only"> of 100</span>
      </span>
      <span className="rkb-track" aria-hidden="true">
        <span className="rkb-line" />
        <span className="rkb-fill fill-on-reveal" />
        <span className="rkb-end rkb-end--0" />
        <span className="rkb-end rkb-end--100" />
        <span className="rkb-pop print:hidden">
          <span className="rkb-gap" />
          <span className="rkb-card type-note">
            {groups.map((g) => (
              <span key={g.label}>
                {g.label} <span className="tabular-nums text-text">{g.score ?? "not applicable"}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
      <span id={descId} hidden>
        {groupSentence(groups)}
      </span>
    </li>
  );
}

/** A market's top scores as bars, for its row on the rankings index. Render only for a published market. */
export function TopBars({ summary, top = 3, className }: { summary: MarketSummary; top?: number; className?: string }) {
  const { view, ranked } = summary;
  const keys = storyKey(view.stories);
  const lead = ranked.slice(0, top);
  return (
    <ol
      data-reveal=""
      className={cx("rkb-frame rkb-list border-t border-line-strong", className)}
      aria-label={`Top ${lead.length} in ${view.market.name}, by score out of 100`}
    >
      {lead.map((r, i) => (
        <BarRow key={r.vendor.id} row={r} marketId={view.market.id} keys={keys} i={i} />
      ))}
    </ol>
  );
}

const AXIS = [0, 25, 50, 75, 100];

const nameList = (names: string[]) => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * One market's scores as a chart card: the best score as its headline, a 0 to 100 axis, then a
 * bar for every scored vendor in rank order and a row for each listed vendor with no score.
 * Renders nothing until the market publishes.
 */
export function ScoreChart({ summary, className }: { summary: MarketSummary; className?: string }) {
  const { view, ranked, listed } = summary;
  const best = ranked[0]?.result.score ?? null;
  if (!view.published || best === null) return null;
  const keys = storyKey(view.stories);
  const unscored = listed.filter((r) => r.rank === null);
  const leaders = ranked.filter((r) => r.result.score === best).map((r) => r.vendor.name);
  return (
    <div data-reveal="" className={cx("rkc", className)}>
      <p className="rkc-stat">
        <span className="type-label text-muted">Best score here</span>
        <CountUp value={best} className="type-title-l text-text" />
        <span className="type-body-s text-muted">{nameList(leaders)}, out of 100</span>
      </p>
      <div className="rkb-frame rkb-chart">
        <div className="rkb rkb--axis" aria-hidden="true">
          <span className="rkb-axis">
            {AXIS.map((t) => (
              <span key={t} className="rkb-tick type-note tabular-nums" style={{ left: `${t}%` }}>
                {t}
              </span>
            ))}
          </span>
        </div>
        <ol
          className="rkb-list"
          aria-label={`${view.market.name}: ${ranked.length} vendors by score out of 100${unscored.length > 0 ? `, then ${unscored.length} not scored` : ""}`}
        >
          {ranked.map((r, i) => (
            <BarRow key={r.vendor.id} row={r} marketId={view.market.id} keys={keys} i={i} />
          ))}
          {unscored.map((r) => (
            <BarRow key={r.vendor.id} row={r} marketId={view.market.id} keys={keys} i={0} />
          ))}
        </ol>
      </div>
    </div>
  );
}
