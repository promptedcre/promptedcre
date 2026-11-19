import { Tag } from "@/components/chips";
import { Stamp, cx } from "@/components/ui";

// RankNumeral: a vendor's place in its market as a plain tabular numeral, the way a schedule
// numbers its rows. No circle: the number carries the order. A vendor with no rank (untested,
// stale, or a market not published yet) shows a faint dash and says "not ranked" to a screen
// reader.
export function RankNumeral({ rank, className }: { rank: number | null; className?: string }) {
  if (rank === null) {
    return (
      <span className={cx("type-title-s tabular-nums text-faint", className)}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">not ranked</span>
      </span>
    );
  }
  return (
    <span className={cx("type-title-s tabular-nums text-text", className)}>
      <span className="sr-only">rank </span>
      {rank}
    </span>
  );
}

export type MarketReview = { date: string } | null;

// ReviewStamp: a market's review status, in the one review color. A stamp is earned, so only a
// market a practitioner has read gets one, with its date; the rest say "not yet reviewed" in a
// flat dashed chip. `compact` says the same as a chip, for a row in a list, where a stamp on
// every row would shout. Both say "Practitioner-reviewed", the methodology's own word.
export function ReviewStamp({ review, compact = false, className }: { review: MarketReview; compact?: boolean; className?: string }) {
  if (!review) {
    return (
      <span className={className}>
        <Tag dashed>not yet reviewed</Tag>
      </span>
    );
  }
  if (compact) {
    return (
      <span className={className}>
        <Tag tone="accent" dot title="Review status">
          Practitioner-reviewed{" "}
          <time dateTime={review.date} className="type-data text-muted">
            {review.date}
          </time>
        </Tag>
      </span>
    );
  }
  return <Stamp word="Practitioner-reviewed" date={review.date} className={className} />;
}

// PublishLine: whether a market's scores are published, said in neutral ink, the same words on
// the index and on the market page. A market publishes when the judge agrees with at least
// GOLDEN_TO_PUBLISH of the cells checked by hand (lib/rankings/state); the line says how far
// it is.
export function PublishLine({
  published,
  matches,
  cells,
  className,
}: {
  published: boolean;
  matches: number;
  cells: number;
  className?: string;
}) {
  return (
    <p className={cx("type-body-s m-0 text-muted", className)}>
      {published ? (
        <>
          Published: the judge matched <span className="tabular-nums text-text">{matches}</span> of{" "}
          <span className="tabular-nums">{cells}</span> <span className="whitespace-nowrap">hand-checked</span> cells.
        </>
      ) : cells > 0 ? (
        <>
          Not published yet: the judge matches <span className="tabular-nums text-text">{matches}</span> of{" "}
          <span className="tabular-nums">{cells}</span> <span className="whitespace-nowrap">hand-checked</span> cells.
        </>
      ) : (
        <>Not published yet.</>
      )}
    </p>
  );
}
