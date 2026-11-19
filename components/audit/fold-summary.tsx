import type { ReactNode } from "react";
import { Icon, cx } from "@/components/ui";

// FoldSummary: the one-line summary of a native <details>: the chevron from the icon set,
// which turns when the fold opens, and the line, at least 44 px tall so it is easy to hit.
// It opens with scripts off, and find-in-page opens it too. Kept for the pages that still
// write their own <details> (/connect); new code uses <Disclosure> from components/ui,
// which is this and the fold in one.
export function FoldSummary({ children, note, className }: { children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <summary className={cx("flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2", className)}>
      <span className="type-body-s inline-flex min-w-0 items-center gap-2.5 font-medium text-text">
        <Icon name="chevron-right" className="chev text-faint transition-transform" />
        <span className="min-w-0">{children}</span>
      </span>
      {note && <span className="type-label text-faint">{note}</span>}
    </summary>
  );
}
