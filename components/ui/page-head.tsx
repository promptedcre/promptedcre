import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

// PageHead: the head of every page except the home cover. A breadcrumb, the h1 (type-page),
// one lede (type-lede), the page's actions, and one quiet line of counted facts. No label
// above the title, no frame, and short on purpose: the thing the page is for (a list, the
// steps, a calculator) starts on the first screen at 1440 x 900 and within two screens on a
// phone. `aside` is a right-hand slot from 1024 px, at most 25rem wide (a prompt, a small
// figure, a status); under 1024 px it sits below the text. Every fact is computed, never typed
// in; a fact whose value is null or empty is left out, so an unknown never shows as a
// placeholder.
//
// The facts are one line under a hairline: a label in faint ink, its value in the text color,
// wrapping on a narrow screen. One fact may be the page's `lead`: first, its value before its
// label and a step heavier ("5 of 12" "steps an agent can do"), in the same neutral ink.
export type PageCrumb = { href?: string; label: string };
export type PageFact = {
  label: string;
  value: ReactNode;
  /** @deprecated Facts are neutral ink: color belongs to a mark, not to words. Only "muted" still reads. */
  tone?: "default" | "agent" | "human" | "accent" | "danger" | "muted";
  /** A measured figure, an id or a date: set in Plex Mono. */
  mono?: boolean;
  /** Layout only, on the fact's item. */
  className?: string;
  /** The page's one lead fact: first, its value before its label. One per head. */
  lead?: boolean;
};

function FactLine({ facts, label }: { facts: PageFact[]; label: string }) {
  const lead = facts.find((f) => f.lead);
  const rest = facts.filter((f) => f !== lead);
  return (
    <dl aria-label={label} className="m-0 mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-t border-line pt-4">
      {lead && (
        <div className={cx("flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1", lead.className)}>
          <dt className="type-body-s order-2 text-muted">{lead.label}</dt>
          <dd className={cx("order-1 m-0 tabular-nums text-text", lead.mono ? "type-data" : "type-title-s")}>{lead.value}</dd>
        </div>
      )}
      {rest.map((f) => (
        <div key={f.label} className={cx("flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1", f.className)}>
          <dt className="type-body-s text-faint">{f.label}</dt>
          <dd className={cx("m-0", f.mono ? "type-data" : "type-body-s", f.tone === "muted" ? "text-muted" : "text-text")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHead({
  title,
  id,
  crumbs,
  lede,
  actions,
  aside,
  facts,
  factsLabel = "At a glance",
  children,
  headingLevel = 1,
  className,
}: {
  title: ReactNode;
  id?: string; // the h1's id, for aria-labelledby on the page's first section
  headingLevel?: 1 | 2; // 2 only where a page shows a head as a specimen (the styleguide)
  /** @deprecated A label above the title is not drawn any more. Say it in the breadcrumb, the lede or a fact. */
  eyebrow?: ReactNode;
  crumbs?: PageCrumb[];
  lede?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  facts?: PageFact[];
  factsLabel?: string;
  children?: ReactNode; // anything that belongs to the head and sits under the facts (a switch, a filter)
  className?: string;
}) {
  const shown = (facts ?? []).filter((f) => f.value !== null && f.value !== undefined && f.value !== "");
  const H = `h${headingLevel}` as const;
  return (
    <header className={cx("pt-8 md:pt-12", className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="type-body-s m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-muted">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-x-2">
                {i > 0 && (
                  <span aria-hidden="true" className="text-faint">
                    /
                  </span>
                )}
                {c.href ? (
                  <Link href={c.href} className="text-muted no-underline hover:text-text hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="break-words text-faint">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className={aside ? "grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start" : undefined}>
        <div className="min-w-0">
          <H id={id} className="type-page m-0 max-w-[20em] break-words text-text">
            {title}
          </H>
          {lede && <p className="type-lede measure m-0 mt-4">{lede}</p>}
          {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>
      {shown.length > 0 && <FactLine facts={shown} label={factsLabel} />}
      {children}
    </header>
  );
}
