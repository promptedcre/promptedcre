import type { SiteFacts } from "@/lib/compute/site-facts";
import { cx } from "./cx";

// CountsLine: the catalog's one sentence, from siteFacts(corpus).catalog.line:
// "19 written in full: 12 playbooks, 6 situations and 1 audit. 76 more are outlined." The words
// are the sentence itself, so every page that counts the catalog says it the same way. Only
// the figures are set apart, and only by ink: the text color, in the same face as the words
// (a figure inside a sentence is never mono), lined up as tabular numerals. Inline: put it
// in a sentence or a line of its own.
export function CountsLine({ catalog, className }: { catalog: SiteFacts["catalog"]; className?: string }) {
  // split() with one capturing group puts the figures at the odd indexes
  return (
    <span className={cx("tabular-nums text-muted", className)}>
      {catalog.line.split(/(\d+)/).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-text">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}
