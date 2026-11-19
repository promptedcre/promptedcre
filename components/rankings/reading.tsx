import type { ReactNode } from "react";
import { cx } from "@/components/ui";

// ReadingSection: one section of a long-form page set for reading (the methodology). A plain
// heading with air above it, an optional quiet note under the heading (what the section
// covers, a version), and a body at the 68-character measure in type-body. No number, no
// label above the heading, no rule under it.
export function ReadingSection({
  id,
  title,
  note,
  children,
  className,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx("scroll-mt-24", className)}>
      <h2 id={`${id}-title`} className="type-title-l m-0 text-text">
        {title}
      </h2>
      {note && <p className="type-body-s m-0 mt-2 text-faint">{note}</p>}
      <div className="type-body measure mt-6 flex flex-col gap-5 text-muted">{children}</div>
    </section>
  );
}
