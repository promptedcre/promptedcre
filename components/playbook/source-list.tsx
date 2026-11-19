import { Tag } from "@/components/chips";
import { Disclosure, Icon } from "@/components/ui";
import { ageInDays, STALE_DAYS } from "@/lib/content/semantic";
import type { Source } from "@/lib/schemas/common";

// SourceList: a record's sources as ruled rows, every row built the same way. Its title is
// the link to the source, with the arrow out at the row's end. Under the title, in one plain
// line: the publisher, the date it was opened ("check date" when that is old) and whether it
// is a primary source. A source that carries a quote says so at the end of that line, which
// then opens to the words quoted (and a #source-<id> link shows them too). No index numbers:
// on this page a number means a step.
//
// A long list is long on a phone, so below 768 px the rows after the first six sit behind
// one fold that says how many they are; from 768 px that fold is simply open.
//
// A record can carry thirty sources, so a row's layout is in the page's own rules
// (./page-styles, prefix src-), written once, not on every row; the type roles stay on the
// elements.

/** The rows a phone shows before the fold. Even, so the two-column list keeps its rows. */
const FIRST = 6;
/** The fewest rows worth folding away. */
const FOLD_AT_LEAST = 3;

// The date is part of a sentence, so it is set in the sentence's own face (a <time> keeps
// its figures tabular).
function Meta({ s, stale }: { s: Source; stale: boolean }) {
  return (
    <span className="src-m type-body-s">
      <span>
        {s.publisher.replace(/\.$/, "")}. Opened <time dateTime={s.accessed}>{s.accessed}</time>.{s.tier === "primary" && " Primary source."}
      </span>
      {stale && <Tag tone="warn">check date</Tag>}
    </span>
  );
}

function Row({ s, today }: { s: Source; today: Date }) {
  const stale = ageInDays(s.accessed, today) > STALE_DAYS;
  return (
    <li id={`source-${s.id}`} className="src">
      <a href={s.url} rel="noreferrer" className="src-a">
        <span className="src-t type-body-s font-medium">{s.title}</span>
        <Icon name="external" />
      </a>
      {s.quote ? (
        <Disclosure
          chevron="end"
          className="src-fold"
          bodyClassName="src-b"
          summary={
            <span className="src-l">
              <Meta s={s} stale={stale} />
              <span className="src-q type-label">Quote</span>
            </span>
          }
        >
          <q className="type-body-s">{s.quote}</q>
        </Disclosure>
      ) : (
        <p className="src-p">
          <Meta s={s} stale={stale} />
        </p>
      )}
    </li>
  );
}

export function SourceList({ sources, today }: { sources: Source[]; today: Date }) {
  const fold = sources.length - FIRST >= FOLD_AT_LEAST;
  const first = fold ? sources.slice(0, FIRST) : sources;
  const rest = fold ? sources.slice(FIRST) : [];
  return (
    <div className="border-t border-line-strong">
      <ol className="src-list">
        {first.map((s) => (
          <Row key={s.id} s={s} today={today} />
        ))}
      </ol>
      {rest.length > 0 && (
        <Disclosure
          openFrom="md"
          chevron="end"
          summaryClassName="src-more type-label"
          summary={
            <>
              {rest.length} more {rest.length === 1 ? "source" : "sources"}
            </>
          }
        >
          <ol start={FIRST + 1} className="src-list">
            {rest.map((s) => (
              <Row key={s.id} s={s} today={today} />
            ))}
          </ol>
        </Disclosure>
      )}
    </div>
  );
}
