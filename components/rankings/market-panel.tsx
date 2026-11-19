import Link from "next/link";
import { Arrow, cx } from "@/components/ui";
import { GOLDEN_CELLS, GOLDEN_TO_PUBLISH } from "@/lib/rankings/state";
import { TopBars } from "./bars";
import { PublishLine, ReviewStamp } from "./status";
import type { MarketSummary } from "./summary";

// MarketRow: one market as a row of the rankings index, a ruled list, not a panel. Left: the
// market's name (the link in), what it covers, what was judged and how far its publishing has
// got, and its review state in the one review color. Right: the top three as score bars (each
// with its icon, its figure counting up and its group scores on hover or focus: TopBars), and
// the way to the full table. Every value comes from the summary. The page renders BarStyles once.
export function MarketRow({ summary, className }: { summary: MarketSummary; className?: string }) {
  const { view, review, listed, judged, ranked } = summary;
  const href = `/rankings/${view.market.id}`;
  const c = view.calibration;
  const titleId = `market-${view.market.id}`;
  return (
    <li
      aria-labelledby={titleId}
      className={cx("grid gap-x-12 gap-y-6 border-b border-line py-8 md:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]", className)}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="type-title-m m-0 text-text">
          <Link
            href={href}
            className="underline decoration-transparent underline-offset-4 hover:decoration-accent max-lg:flex max-lg:min-h-11 max-lg:items-center"
          >
            {view.market.name}
          </Link>
        </h2>
        <p className="type-body m-0 mt-2 max-w-[56ch] text-muted">{view.market.what}</p>
        <p className="type-body-s m-0 mt-4 text-muted">
          <span className="tabular-nums text-text">{view.stories.length}</span> tasks ·{" "}
          <span className="tabular-nums text-text">{judged.length}</span> of <span className="tabular-nums">{listed.length}</span> vendors judged
        </p>
        <PublishLine published={view.published} matches={c.matches} cells={c.cells} className="mt-1" />
        <ReviewStamp review={review} compact className="mt-4 block" />
      </div>

      <div className="min-w-0">
        {/* Each bar row's link stretches over the row, so the row is the target (at least 48 px). */}
        {view.published && ranked.length > 0 ? (
          <TopBars summary={summary} />
        ) : (
          <p className="type-body-s m-0 border-t border-dashed border-line-bold pt-3 text-muted">
            Scores appear once the judge matches {GOLDEN_TO_PUBLISH} of {GOLDEN_CELLS} hand-checked cells.
          </p>
        )}
        <Link
          href={href}
          className="link link--accent type-body-s group mt-4 inline-flex min-h-11 items-center gap-2 md:min-h-0"
        >
          {view.published ? "See all" : "See the"} {listed.length} vendors<span className="sr-only"> in {view.market.name}</span>
          <Arrow className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </div>
    </li>
  );
}
