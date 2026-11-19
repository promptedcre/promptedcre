import type { ReactNode } from "react";
import { SheetHeader, cx } from "@/components/ui";

// SectionHead: a section's heading on the record page, with its one quiet note directly
// under it, so the two read as one unit at every width (beside the heading, the note sat
// 500 px and more away on a wide screen). The heading is the foundation's SheetHeader; this
// only places the note. `id` is the heading's id, for aria-labelledby and the links under the
// list of steps.
// On paper the heading and its note stay on the page their first row is on.
export function SectionHead({ id, title, note, className }: { id: string; title: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-6 md:mb-8 print:break-inside-avoid print:break-after-avoid", className)}>
      <SheetHeader id={id} title={title} flush />
      {note && <p className="type-body-s m-0 mt-2 text-faint">{note}</p>}
    </div>
  );
}
