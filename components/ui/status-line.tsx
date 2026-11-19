import Link from "next/link";
import type { SiteFacts } from "@/lib/compute/site-facts";
import { Container } from "./container";
import { CountsLine } from "./counts-line";
import { cx } from "./cx";

// The status sentence is said once per page. The ledger on /playbooks (#where-it-stands, the
// anchor this line links to) already says every part of it, so on the page that holds the
// ledger this region is not there a second time: the whole section goes, its heading with it,
// so nothing is left for a screen reader to land on. The wrapper keeps its place, so the
// footer keeps its distance. Where a browser has no :has(), the row simply shows.
const CSS = `@layer components {
body:has(#where-it-stands) .status-line{display:none}
}`;

// StatusLine: one quiet row of real counts above the footer on every page. The layout renders
// it once from siteFacts(getCorpus()); a page should not render a second one. On the left it
// says the catalog's one sentence (CountsLine) and the one agent share the site prints
// (siteFacts share.syndication, linked to the ledger that explains it); on the right, the
// coverage and the date counted. It does not say whether the connector is live: a page states
// availability once, in its own head, and this row would be a second time. One voice: the
// reading face throughout, figures included, so a number never changes typeface inside the
// sentence. The two halves stack on a narrow screen. `className` places the wrapper (the
// layout's margin above it); the section inside is the region, and what print hides.
export function StatusLine({
  facts,
  computedOn,
  className,
}: {
  facts: SiteFacts;
  computedOn: string;
  className?: string;
}) {
  const view = facts.share.syndication;
  return (
    <div className={cx("w-full print:hidden", className)}>
      <style href="status-line" precedence="default">
        {CSS}
      </style>
      <Container>
        <section aria-labelledby="status-line-h" className="status-line">
          <h2 id="status-line-h" className="sr-only">
            Where the catalog stands
          </h2>
          <div className="type-body-s flex flex-wrap items-baseline justify-between gap-x-10 gap-y-1 border-t border-line-strong py-4 text-muted">
            <p className="m-0 min-w-0">
              <CountsLine catalog={facts.catalog} />
              {view.pct !== null && (
                <>
                  {" "}
                  {/* The block padding does not move a line; on a phone it makes the link a 44 px target. */}
                  <Link href="/playbooks#where-it-stands" className="link link--muted py-3 md:py-0">
                    An agent can do {view.pct}% of the {view.total} written steps
                  </Link>
                  .
                </>
              )}
            </p>
            <p className="m-0 text-faint">
              {facts.coverage.label}
              {" · "}
              <span className="whitespace-nowrap">
                Counted <time dateTime={computedOn}>{computedOn}</time>
              </span>
            </p>
          </div>
        </section>
      </Container>
    </div>
  );
}
