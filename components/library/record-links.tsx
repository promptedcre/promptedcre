import Link from "next/link";
import { Disclosure, cx } from "@/components/ui";
import type { RecordLink } from "./data";

const KIND_WORD = { process: null, situation: "scenario", audit: "audit" } as const;

// One record as a quiet link (.lb-q in LibraryStyles): text ink, underlined on hover and focus.
// An outlined record is muted ink with a dashed underline, and says so to a screen reader.
function One({ r }: { r: RecordLink }) {
  return (
    <li>
      <Link href={`/playbooks/${r.slug}`} className={cx("lb-q", !r.written && "lb-q--o")}>
        {r.title}
        {!r.written && <span className="sr-only"> (outlined)</span>}
      </Link>
      {KIND_WORD[r.kind] && <span className="ml-2 text-faint">{KIND_WORD[r.kind]}</span>}
    </li>
  );
}

// RecordLinks: the records that make or use something, as a short list of links. Past `show`
// the rest sit behind the one fold ("13 more"), which opens with scripts off and prints open.
export function RecordLinks({
  records,
  empty,
  show = 3,
  className,
}: {
  records: readonly RecordLink[];
  /** What to say when no record is listed. */
  empty: string;
  show?: number;
  className?: string;
}) {
  if (records.length === 0) return <p className={cx("type-body-s m-0 text-faint", className)}>{empty}</p>;
  const fold = records.length > show + 1;
  const head = fold ? records.slice(0, show) : records;
  const rest = fold ? records.slice(show) : [];
  return (
    <div className={cx("type-body-s min-w-0", className)}>
      <ul className="lb-xl">
        {head.map((r) => (
          <One key={r.slug} r={r} />
        ))}
      </ul>
      {rest.length > 0 && (
        <Disclosure size="sm" className="mt-1" summaryClassName="text-muted" summary={<span className="tabular-nums">{rest.length} more</span>}>
          <ul className="lb-xl pb-1">
            {rest.map((r) => (
              <One key={r.slug} r={r} />
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
