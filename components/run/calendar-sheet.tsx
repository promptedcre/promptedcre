import { useId } from "react";
import { Disclosure, TitleBlock, TitleCell } from "@/components/ui";
import type { CalendarEvent } from "@/lib/demo/findings";
import { DocSheet, breakAtSlash } from "./doc-parts";

// CalendarSheet: a calendar.ics (parseCalendar) drawn as one sheet: a ruled row per dated
// duty (the date, what is due) with how the date was worked out under it, and a title
// block that says what kind of file it is. Pure. `written` is how many events the engine
// said it wrote; if the events passed are fewer (an excerpt), the rest are drawn as one
// dashed row, the drawing set's mark for "not shown here". The recording keeps the whole
// file, so on the site nothing is missing and that row is not drawn.
//
// `digest` folds each date's working behind "How this date was worked out", for a page
// that shows the calendar after other sheets; without it the working is open.
// The engine marks a date it worked out with a line that starts "Check this date". The
// sheet says it once, in its head: for every date when the engine marked them all, or as
// a count, and then each marked row carries the words under its duty. Plain words, never
// a chip: a dashed chip is the site's mark for "outlined, not written yet".

type Field = { label: string | null; text: string };

// The engine writes the description as "Label: text" lines.
function fields(description: string | null): Field[] {
  if (!description) return [];
  return description
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => {
      const m = /^([A-Z][A-Za-z ]{1,40}): (.+)$/.exec(line);
      return m ? { label: m[1] ?? null, text: m[2] ?? "" } : { label: null, text: line };
    });
}

const isCheckLine = (f: Field) => f.label === null && /^Check this date/.test(f.text);

// `docLabel={false}` drops the sentence that says it is an example (see DocSheet).
export function CalendarSheet({
  events,
  written = null,
  file = "calendar.ics",
  digest = false,
  docLabel = true,
  className,
}: {
  events: CalendarEvent[];
  written?: number | null;
  file?: string;
  digest?: boolean;
  /** @deprecated The sheet is open at every width; `digest` folds each date's working. */
  fold?: boolean;
  docLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const missing = written !== null && written > events.length ? written - events.length : 0;
  const n = written ?? events.length;
  const flagged = events.filter((e) => fields(e.description).some(isCheckLine)).length;
  // Every date is marked: the head says so for all of them, and no row repeats it.
  const allFlagged = flagged > 0 && flagged === events.length;
  return (
    <DocSheet
      title="The filing calendar"
      titleId={`${id}-title`}
      note={
        <>
          {n} {n === 1 ? "dated duty" : "dated duties"}
          {flagged > 0 &&
            (allFlagged
              ? events.length === 1
                ? ". Check the date before relying on it."
                : ". Check each date before relying on it."
              : `. Check ${flagged} of the dates before relying on ${flagged === 1 ? "it" : "them"}.`)}
        </>
      }
      titleBlock={
        <TitleBlock label="Title block: the filing calendar" className="grid-cols-2 @[40rem]:grid-cols-4">
          <TitleCell label="Format" className="col-span-2">
            iCalendar, all-day events
          </TitleCell>
          {written !== null && <TitleCell label="Events written">{written}</TitleCell>}
          <TitleCell label="File" mono>
            {breakAtSlash(file)}
          </TitleCell>
          {missing > 0 && (
            <TitleCell label="In the recording" tone="muted" className="col-span-2">
              The first {events.length === 1 ? "event" : `${events.length} events`} in full
            </TitleCell>
          )}
        </TitleBlock>
      }
      docLabel={docLabel}
      className={className}
    >
      {sorted.length === 0 && missing === 0 && <p className="sheet-part type-body m-0 text-muted">No dated duties in the file.</p>}
      <ol className="m-0 list-none p-0">
        {sorted.map((ev, i) => {
          const fs = fields(ev.description);
          const check = fs.some(isCheckLine);
          const rest = fs.filter((f) => !isCheckLine(f));
          const working = (
            <>
              {rest.length > 0 && (
                <dl className="m-0 grid gap-3">
                  {rest.map((f, j) => (
                    <div key={j} className="grid gap-x-6 gap-y-1 @[44rem]:grid-cols-[11rem_minmax(0,1fr)]">
                      <dt className="type-label text-faint">{f.label ?? "Note"}</dt>
                      <dd className="type-body-s m-0 break-words text-muted">{f.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {ev.uid && <p className="type-data m-0 mt-3 break-all text-faint">{ev.uid}</p>}
            </>
          );
          const hasWorking = rest.length > 0 || ev.uid !== null;
          return (
            <li key={ev.uid ?? `${ev.date}-${i}`} className="sheet-part grid items-baseline gap-x-8 gap-y-2 @[44rem]:grid-cols-[7rem_minmax(0,1fr)] print:break-inside-avoid">
              <time dateTime={ev.date} className="type-data text-text">
                {ev.date}
              </time>
              <div className="min-w-0">
                <p className="type-title-s m-0 text-text">{ev.summary}</p>
                {check && !allFlagged && <p className="type-body-s m-0 mt-1 text-muted">Check this date before relying on it.</p>}
                {hasWorking &&
                  (digest ? (
                    // The fold's line is a touch target taller than its words: it borrows the row's own space under it.
                    <Disclosure size="sm" summary="How this date was worked out" className="-mb-2" summaryClassName="type-body-s text-muted" bodyClassName="pb-3 pt-1">
                      {working}
                    </Disclosure>
                  ) : (
                    <div className="mt-3">{working}</div>
                  ))}
              </div>
            </li>
          );
        })}
        {missing > 0 && (
          <li className="sheet-part type-body-s border-dashed text-muted">
            {missing} more {missing === 1 ? "event is" : "events are"} in the file the engine wrote. Only the first {events.length === 1 ? "is" : `${events.length} are`} shown here;{" "}
            <code className="type-data text-text">pcre deadline list</code> prints every date.
          </li>
        )}
      </ol>
    </DocSheet>
  );
}
