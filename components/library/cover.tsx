import type { ReactNode } from "react";
import { Icon, cx } from "@/components/ui";

// DateSpan: one date, or "from to to" that breaks only between the dates. The dates are mono
// (type-data); the word between them stays in the text face.
export function DateSpan({ from, to }: { from: string | null | undefined; to: string | null | undefined }) {
  if (!from || !to) {
    const one = from ?? to;
    return one ? <time dateTime={one} className="type-data whitespace-nowrap">{one}</time> : null;
  }
  if (from === to)
    return (
      <time dateTime={to} className="type-data whitespace-nowrap">
        {to}
      </time>
    );
  return (
    <>
      <span className="whitespace-nowrap">
        <time dateTime={from} className="type-data">
          {from}
        </time>{" "}
        to
      </span>{" "}
      <time dateTime={to} className="type-data whitespace-nowrap">
        {to}
      </time>
    </>
  );
}

export type JumpItem = { href: string; label: ReactNode; note?: ReactNode; js?: string };

// JumpLinks: the in-page links under a library page's head, said as links: a "Jump to" lead-in
// and a down arrow after each name (these move you down the page, unlike the quiet
// cross-reference links in the tables). `lead` "md" shows the lead-in only from 768 px, for a
// list that sits in a "Jump to a subject" fold on a phone. `js` carries data-js for the rule
// filter, which hides a subject's link when the jurisdiction empties it.
export function JumpLinks({ items, lead = "always", className }: { items: readonly JumpItem[]; lead?: "always" | "md"; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-baseline gap-x-6 gap-y-1", className)}>
      <span className={cx("type-label text-faint", lead === "md" ? "hidden md:inline" : "max-md:w-full")}>Jump to</span>
      <ul className={cx("type-body-s m-0 flex list-none flex-wrap gap-x-6 p-0 max-md:gap-x-5", lead === "md" && "max-md:flex-col")}>
        {items.map((it) => (
          <li key={it.href} data-js={it.js}>
            <a href={it.href} className="lb-jump">
              <span>{it.label}</span>
              {it.note != null && <span className="tabular-nums text-faint">{it.note}</span>}
              <Icon name="arrow-down" className="lb-jump-i" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// GroupHead: the head of one run of rows (a subject, a phase): the name as a heading with its
// count beside it in faint ink, the way the catalog lists head their phases. No rule here: the
// rows' own top rule follows. More air above (the section's padding) than below (mb-3).
export function GroupHead({
  id,
  title,
  note,
  level = 2,
  className,
}: {
  id: string;
  title: ReactNode;
  note?: ReactNode;
  level?: 2 | 3;
  className?: string;
}) {
  const H = `h${level}` as const;
  return (
    <div className={cx("mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1", className)}>
      <H id={id} className="type-title-m m-0 text-text">
        {title}
      </H>
      {note && <p className="type-body-s m-0 tabular-nums text-faint">{note}</p>}
    </div>
  );
}
