import Link from "next/link";
import { Disclosure, Icon, TextLink, cx } from "@/components/ui";
import type { SearchDoc } from "@/lib/search/index";
import { KIND_PAGE, KIND_PLURAL, groupHits, hostOf, isExternal } from "./search-shared";

type Entry = Pick<SearchDoc, "kind" | "id" | "title" | "url" | "outline">;

// One record as a plain link. A written record is in the text ink; an outline is muted. The
// link is 44 px tall where it is tapped and sets its own block padding, so rows never sit
// on a rule.
function Item({ h }: { h: Entry }) {
  const cls = cx(
    "type-body-s inline-flex min-h-11 items-center py-1 no-underline hover:underline md:min-h-0",
    h.outline ? "text-muted" : "text-text",
  );
  return (
    <li className="break-inside-avoid">
      {isExternal(h.url) ? (
        <a href={h.url} rel="noreferrer" className={cls}>
          <span>
            {h.title}
            <Icon name="external" className="ml-1.5 align-middle text-faint" />
            <span className="sr-only"> (opens {hostOf(h.url)})</span>
          </span>
        </a>
      ) : (
        <Link href={h.url} className={cls}>
          {h.title}
        </Link>
      )}
    </li>
  );
}

const COLUMNS = "m-0 list-none columns-1 gap-x-10 p-0 sm:columns-2 lg:columns-3";

// SearchBrowse: everything in the search index as one ruled list of kinds. Each kind is a
// fold (the foundation's Disclosure, a native <details>): closed, the page is eight rows a
// reader can take in at once; open, it lists every title of that kind in columns, written
// records first and outlines under their own label, with a link to the kind's own page.
// It is what /search shows before a query and under a query that matched nothing, and it
// is the whole page with scripts off (components/search-box.tsx says so in the field's
// place): the folds open without them, and a link to #all-<kind> shows that kind's titles.
// A kind counted in two parts (written, outlined) sets its count under its name on a phone,
// where the two would not share a line; a single figure stays on the right.
export function SearchBrowse({ docs, className }: { docs: readonly SearchDoc[]; className?: string }) {
  const groups = groupHits(docs.map((d) => ({ kind: d.kind, id: d.id, title: d.title, url: d.url, summary: d.summary, outline: d.outline, score: 0 })));
  return (
    <section aria-labelledby="browse-title" className={cx("min-w-0", className)}>
      <h2 id="browse-title" className="type-title-l m-0 text-text">
        Browse everything
      </h2>
      <p className="type-body measure m-0 mt-2 text-muted">Every record in the index, by kind. Open a kind for its titles, or go to its own page.</p>
      <div className="mt-6 border-t border-line-strong">
        {groups.map((g) => {
          const written = g.hits.filter((h) => !h.outline);
          const outlined = g.hits.filter((h) => h.outline);
          const page = KIND_PAGE[g.kind];
          return (
            <Disclosure
              key={g.kind}
              id={`all-${g.kind}`}
              className="border-b border-line"
              summaryClassName="py-2"
              bodyClassName="pb-8 pt-1"
              summary={
                <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="type-title-s text-text">{KIND_PLURAL[g.kind]}</span>
                  {outlined.length > 0 ? (
                    <span className="type-body-s basis-full tabular-nums text-faint sm:basis-auto">{`${written.length} written, ${outlined.length} outlined`}</span>
                  ) : (
                    <span className="type-body-s tabular-nums text-faint">{g.total}</span>
                  )}
                </span>
              }
            >
              <ul className={COLUMNS}>
                {written.map((h) => (
                  <Item key={`${h.kind}:${h.id}`} h={h} />
                ))}
              </ul>
              {outlined.length > 0 && (
                <>
                  <p className="type-label m-0 mb-1 mt-6 text-faint">Outlined, not written yet</p>
                  <ul className={COLUMNS}>
                    {outlined.map((h) => (
                      <Item key={`${h.kind}:${h.id}`} h={h} />
                    ))}
                  </ul>
                </>
              )}
              <p className="type-body-s m-0 mt-6">
                <TextLink href={page.href} tone="accent">
                  See them on the {page.label} page
                </TextLink>
              </p>
            </Disclosure>
          );
        })}
      </div>
    </section>
  );
}
