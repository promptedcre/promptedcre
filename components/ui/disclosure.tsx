import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

// Disclosure: the one fold. A native <details> with one chevron from the icon set, so it opens
// with scripts off, opens for find-in-page, and prints open. The chevron turns when it opens;
// where the browser can size to content (::details-content) the body opens over --dur-3 and
// closes a quarter faster. The summary is at least 44 px tall where it is tapped.
//
//   chevron   "start" (default) before the summary; "end" after it, for a row or a question
//   size      "sm" lets the summary drop to 32 px from 768 px, for a quiet inline fold
//   openFrom  "md": a fold on a phone, simply open (no summary) from 768 px
//   name      folds that share a name open one at a time
//   id        a link to #id shows the body with scripts off
//
// It replaces the six fold and chevron implementations around the site; do not draw another.
export function Disclosure({
  summary,
  children,
  open = false,
  id,
  name,
  chevron = "start",
  size = "md",
  openFrom,
  className,
  summaryClassName,
  bodyClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  id?: string;
  name?: string;
  chevron?: "start" | "end";
  size?: "md" | "sm";
  openFrom?: "md";
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <details
      id={id}
      name={name}
      open={open || undefined}
      className={cx(
        "disclosure",
        chevron === "end" && "disclosure--end",
        size === "sm" && "disclosure--sm",
        openFrom === "md" && "disclosure--open-md",
        className,
      )}
    >
      <summary className={summaryClassName}>
        <Icon name="chevron-right" className="disclosure-chevron" />
        <span className="disclosure-label">{summary}</span>
      </summary>
      <div className={bodyClassName}>{children}</div>
    </details>
  );
}
