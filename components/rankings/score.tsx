import { cx } from "@/components/ui";

// Scores run 0 to 100 and are computed in lib/scoring/score.ts; nothing here invents one.
// A score is a number first. Where it gets a bar, the bar is a measured scale: a hairline from
// 0 to 100 closed at both ends by the dimension line's 45-degree ticks, the score filled in
// agent green, and the market's best score ticked in drafting blue, so a reader sees how far
// every product is from 100 and from the best in its market.

const clamp = (n: number) => Math.max(0, Math.min(100, n));

// BestTick: the market's best score on a scale, marked by shape as well as color: a 2 px
// upright with a short cap, like a T, in drafting blue. The neutral end ticks lean at 45
// degrees, so the two never read alike.
function BestTick({ pct, className }: { pct: number; className?: string }) {
  return (
    <span className={cx("absolute z-10 -translate-x-1/2", className)} style={{ left: `${pct}%` }}>
      <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-accent-strong" />
      <span className="absolute left-1/2 top-0 h-0.5 w-2 -translate-x-1/2 bg-accent-strong" />
    </span>
  );
}

// ScoreBar: the small measured scale for a row. Drawn only; the figure beside it is the value.
// The end ticks are drawn after the fill so the 0 end stays closed under a filled score.
// (DimensionLine's figure breaks its line, so a scale with a fill is composed here.)
export function ScoreBar({ score, best, size = "md", className }: { score: number; best?: number | null; size?: "sm" | "md"; className?: string }) {
  const pct = clamp(score);
  return (
    <span aria-hidden="true" className={cx("relative inline-block h-4 flex-none align-middle", size === "sm" ? "w-20" : "w-28", className)}>
      <span className="absolute inset-x-0 top-1/2 h-px bg-line-bold" />
      <span className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 bg-agent" style={{ width: `${pct}%` }} />
      <span className="absolute left-0 top-1 z-10 h-2 w-px rotate-45 bg-faint" />
      <span className="absolute right-0 top-1 z-10 h-2 w-px rotate-45 bg-faint" />
      {typeof best === "number" && <BestTick pct={clamp(best)} className="inset-y-0 w-2" />}
    </span>
  );
}

// ScoreReadout: the score as a figure, then its measured bar. The figure is read first.
export function ScoreReadout({
  score,
  best,
  size = "md",
  bar = true,
  figureClassName,
  className,
}: {
  score: number;
  best?: number | null;
  size?: "sm" | "md";
  bar?: boolean;
  // e.g. to left-align the figure where it starts a row instead of closing a column
  figureClassName?: string;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-3 whitespace-nowrap", className)}>
      <span className={cx("min-w-8 text-right tabular-nums text-text", size === "sm" ? "type-title-s" : "type-title-m", figureClassName)}>
        {score}
        <span className="sr-only"> of 100</span>
      </span>
      {bar && <ScoreBar score={score} best={best} size={size} />}
    </span>
  );
}

// ScoreScale: the full-width 0 to 100 scale for a vendor's sheet: the score filled, ticks every
// 25 with their figures, and the market's best score marked and named above the line. Inside a
// reveal (data-reveal) the fill grows from 0 once (fill-on-reveal, D230); the server's HTML is
// the full fill, so scripts off, less motion and paper get it in place.
export function ScoreScale({ score, best, className }: { score: number; best?: number | null; className?: string }) {
  const pct = clamp(score);
  const bestPct = typeof best === "number" ? clamp(best) : null;
  const isBest = bestPct !== null && best === score;
  return (
    <div className={cx("relative pb-6", bestPct !== null && "pt-6", className)}>
      {bestPct !== null && (
        <span
          className={cx(
            "type-note absolute top-0 whitespace-nowrap text-muted",
            bestPct > 70 ? "-translate-x-full" : bestPct > 15 ? "-translate-x-1/2" : "",
          )}
          style={{ left: `${bestPct}%` }}
        >
          {isBest ? "Best in this market" : <>Best in this market <span className="tabular-nums text-text">{best}</span></>}
        </span>
      )}
      <div aria-hidden="true" className="relative h-4">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line-bold" />
        <span className="fill-on-reveal absolute left-0 top-1/2 h-2.5 -translate-y-1/2 bg-agent" style={{ width: `${pct}%` }} />
        {bestPct !== null && <BestTick pct={bestPct} className="-top-1 h-6 w-2" />}
      </div>
      <div aria-hidden="true">
        {[0, 25, 50, 75, 100].map((t) => (
          <span key={t} className="absolute bottom-0" style={{ left: `${t}%` }}>
            <span className={cx("absolute bottom-6 h-2 w-px bg-faint", t === 100 && "-left-px")} />
            <span className={cx("type-note absolute bottom-0 tabular-nums text-faint", t === 0 ? "left-0" : t === 100 ? "right-0" : "-translate-x-1/2")}>{t}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
