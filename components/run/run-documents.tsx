import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { CalendarSheet } from "./calendar-sheet";
import type { RunDocument } from "./data";
import { FindingsReport } from "./findings-report";
import { OwnerSheet } from "./owner-sheet";

// RunDocuments: the files a scene wrote, each drawn as its own sheet at full width, in the
// order the engine wrote them. Pure: pass sceneDocuments(scene).
// checksCollapsed puts a findings report's checks behind a fold.
// sourcesAt, when given, leaves each check's rules and sources out of the findings report
// and prints that sentence instead: for a report whose list is drawn elsewhere on the page.
// docLabel={false} drops the sentence that says it is an example from every sheet, for a
// page that says once where the documents come from.
// Each sheet is skipped by the browser until it is near the screen (content-visibility):
// these sit behind a fold, and a scene can write a long report.

export function RunDocuments({
  docs,
  checksCollapsed = false,
  sourcesAt,
  docLabel = true,
  className,
}: {
  docs: RunDocument[];
  checksCollapsed?: boolean;
  sourcesAt?: ReactNode;
  /** @deprecated Every sheet is open at every width. */
  fold?: boolean;
  docLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("grid gap-6", className)}>
      {docs.map((d) =>
        d.kind === "findings" ? (
          <FindingsReport key={d.path} doc={d.doc} file={d.path} checksCollapsed={checksCollapsed} sources={!sourcesAt} sourcesAt={sourcesAt} docLabel={docLabel} className="rd-cv" />
        ) : d.kind === "calendar" ? (
          <CalendarSheet key={d.path} events={d.doc.events} written={d.doc.written} file={d.path} docLabel={docLabel} className="rd-cv" />
        ) : (
          <OwnerSheet key={d.path} doc={d.doc} file={d.path} docLabel={docLabel} className="rd-cv" />
        ),
      )}
    </div>
  );
}
