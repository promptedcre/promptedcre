import { cx } from "@/components/ui";
import { terms } from "@/lib/site";

// TermsList: the terms an agent reads on /install, in /llms.txt and from the connector, as a
// ruled list for a person (CH04). Every word comes from terms() in lib/site.ts.
export function TermsList({ className }: { className?: string }) {
  return (
    <ul className={cx("m-0 list-none border-t border-line p-0", className)}>
      {terms().map((line) => (
        // The rule runs the list's full width; the words keep the reading measure.
        <li key={line} className="border-b border-line py-3">
          <span className="type-body-s measure block text-text">{line}</span>
        </li>
      ))}
    </ul>
  );
}
