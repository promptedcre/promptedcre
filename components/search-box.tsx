"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Tag } from "@/components/chips";
import { Highlight, KIND_PLURAL, groupHits, hitMeta, hostOf, indexLine, isExternal, kindLabel, loadSearchIndex } from "@/components/library/search-shared";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { nearestTitles, searchIndex, type SearchDoc, type SearchHit, type SearchKind } from "@/lib/search/index";

const PER_GROUP = 8;
const NEAREST = 5;

// The field filters in the browser, so with scripts off it could only take words and lose
// them. It is not drawn then: a note stands in its place and the list of everything follows.
const CSS = `@layer components {
html:not(.js) .sb-form{display:none}
}`;

// One hit as a ruled row: its title (the link), a quiet line where it helps (an outside
// document's site, a rule card's id), and two lines of its summary. A record written in full
// is in the text ink; an outline is muted and says "Outline" in the dashed chip the site
// uses for "not yet". `kind` names the hit's kind where a list mixes them.
function HitRow({ h, query, kind = false }: { h: SearchHit; query: string; kind?: boolean }) {
  const external = isExternal(h.url);
  const meta = hitMeta(h);
  // The title's block padding (taken back by the margin) makes the link a 44 px target.
  const cls = cx("type-title-s -my-3 inline-block py-3 no-underline hover:underline", h.outline ? "text-muted" : "text-text");
  return (
    <li className="border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {external ? (
          <a href={h.url} rel="noreferrer" className={cls}>
            <Highlight text={h.title} query={query} />
            <Icon name="external" className="ml-1.5 align-middle text-faint" />
            <span className="sr-only"> (opens {hostOf(h.url)})</span>
          </a>
        ) : (
          <Link href={h.url} className={cls}>
            <Highlight text={h.title} query={query} />
          </Link>
        )}
        {h.outline && <Tag dashed>Outline</Tag>}
        {kind && <Tag>{kindLabel(h.kind)}</Tag>}
      </div>
      {meta && <p className="type-data m-0 mt-1 break-all text-faint">{meta}</p>}
      <p className="type-body-s measure m-0 mt-1 line-clamp-2 text-muted">
        <Highlight text={h.summary} query={query} />
      </p>
    </li>
  );
}

// A kind's count beside its name: a figure in the reading face, lined up as tabular numerals.
// A screen reader hears what is counted ("Calculators, 1 result").
function Count({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cx("tabular-nums text-faint", className)}>
      <span className="sr-only">, </span>
      {n}
      <span className="sr-only"> {n === 1 ? "result" : "results"}</span>
    </span>
  );
}

// Reports ?q= each time it changes. Renders nothing.
function QuerySync({ onQuery }: { onQuery: (q: string) => void }) {
  const q = useSearchParams().get("q") ?? "";
  useEffect(() => {
    onQuery(q);
  }, [q, onQuery]);
  return null;
}

// SearchBox: the /search page's field and its results. The field is one form block, as wide
// as the rows under it: a blank to type in (the dashed rule, which stays dashed while you
// type) beside what was counted (the solid cell), with one focus ring, on the block. Before a
// query it shows its children (the server-rendered list of everything). With a query it
// shows the hits grouped by kind, best first, written records before outlines, eight per kind
// with "show all". A query that matches nothing is never a blank page: it says so, lists the
// nearest titles when any are near, and keeps the list of everything under it. The query is
// kept in ?q= so a search can be linked. `indexed` is the count line computed on the server
// ("340 records in 8 kinds"), shown until the index itself has loaded. With scripts off the
// field is not drawn (it could not answer): a note says so where the field would be, and the
// list of everything is the page.
export function SearchBox({ indexed, children }: { indexed: string; children: ReactNode }) {
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Partial<Record<SearchKind, boolean>>>({});
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef(false);
  const current = useRef(query);
  useEffect(() => {
    current.current = query;
  });

  useEffect(() => {
    loadSearchIndex()
      .then(setDocs)
      .catch(() => setFailed(true));
    // A reader with a keyboard came to type: the field takes focus. On a touch screen it
    // does not, so the keyboard never covers the page before it is asked for.
    if (window.matchMedia("(pointer: fine)").matches && !window.location.hash) input.current?.focus({ preventScroll: true });
  }, []);

  // The URL's ?q= when it changes from outside the field: the first load, the search palette or a
  // link sending a new query to this same page, back and forward. Its own edits come back
  // trimmed, and are left alone so a trailing space can be typed.
  const fromUrl = useCallback((q: string) => {
    if (q === current.current.trim()) return;
    typed.current = false;
    setQuery(q);
    setOpen({});
  }, []);

  // keep ?q= in step with what the reader types, without adding history entries
  useEffect(() => {
    if (!typed.current) return;
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
  }, [query]);

  const q = query.trim();
  const groups = useMemo(() => {
    if (!docs || !q) return [];
    return groupHits(searchIndex(docs, q, undefined, docs.length), undefined, true);
  }, [docs, q]);
  const hitCount = groups.reduce((n, g) => n + g.total, 0);
  const searching = q.length > 0;
  const none = searching && docs !== null && hitCount === 0;
  const near = useMemo(() => (none && docs ? nearestTitles(docs, q, NEAREST) : []), [none, docs, q]);

  const change = (value: string) => {
    typed.current = true;
    setQuery(value);
  };
  const clear = () => {
    change("");
    setOpen({});
    input.current?.focus();
  };

  const status = failed
    ? "The index did not load. Everything is listed below."
    : !searching
      ? docs
        ? indexLine(docs)
        : indexed
      : docs === null
        ? "Loading the index"
        : none
          ? "No match"
          : `${hitCount} ${hitCount === 1 ? "result" : "results"} in ${groups.length} ${groups.length === 1 ? "kind" : "kinds"}`;

  return (
    <div>
      {/* reads the URL on the client only, so the rest of the box is still prerendered */}
      <Suspense fallback={null}>
        <QuerySync onQuery={fromUrl} />
      </Suspense>
      <style href="search-box" precedence="default">
        {CSS}
      </style>
      <noscript>
        <Callout title="Scripts are off, so this page cannot search.">Everything in the index is listed below.</Callout>
      </noscript>
      <form role="search" action="/search" onSubmit={(e) => e.preventDefault()} className="sb-form">
        <label htmlFor="q" className="sr-only">
          Search the catalog
        </label>
        {/* The field drops its own outline; the block draws the one ring, on its own border. */}
        <div className="grid overflow-clip rounded-control border border-line-strong bg-raised has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-1 has-[input:focus-visible]:outline-accent-strong md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3 py-3 pl-4 pr-2">
            <Icon name="search" size={20} className="text-faint" />
            <input
              ref={input}
              id="q"
              name="q"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={200}
              value={query}
              onChange={(e) => change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  clear();
                }
              }}
              placeholder="capital call, waterfall"
              aria-describedby="q-status"
              className="type-lede h-10 min-w-0 flex-1 border-0 border-b border-dashed border-line-bold bg-transparent text-text outline-none placeholder:text-faint"
            />
            <button
              type="button"
              onClick={clear}
              aria-label="Clear the search"
              className={cx("btn btn--quiet w-11 flex-none px-0", !query && "invisible")}
              tabIndex={query ? 0 : -1}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <p id="q-status" className="type-body-s m-0 flex items-center border-t border-line px-4 py-3 tabular-nums text-muted md:border-l md:border-t-0 md:py-0" aria-live="polite">
            {status}
          </p>
        </div>
      </form>

      {searching && docs !== null && !none && (
        <div className="mt-10">
          {groups.length > 1 && (
            <nav aria-label="Results by kind" className="mb-8">
              <ul className="type-body-s m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0">
                {groups.map((g) => (
                  <li key={g.kind}>
                    <a href={`#hits-${g.kind}`} className="link link--muted inline-flex min-h-11 items-center gap-2 md:min-h-0">
                      {KIND_PLURAL[g.kind]}
                      <Count n={g.total} />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {groups.map((g) => {
            const all = open[g.kind] === true;
            const shown = all ? g.hits : g.hits.slice(0, PER_GROUP);
            return (
              <section key={g.kind} aria-labelledby={`hits-${g.kind}-title`} id={`hits-${g.kind}`} className="mt-12 first:mt-0">
                <h2 id={`hits-${g.kind}-title`} className="type-title-m m-0 flex items-baseline justify-between gap-4 border-b border-line-strong pb-3 text-text">
                  {KIND_PLURAL[g.kind]}
                  <Count n={g.total} className="type-body-s" />
                </h2>
                <ol className="m-0 list-none p-0">
                  {shown.map((h) => (
                    <HitRow key={`${h.kind}:${h.id}`} h={h} query={q} />
                  ))}
                </ol>
                {g.total > PER_GROUP && (
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.kind]: !all }))} aria-expanded={all} className="btn btn--secondary btn--sm mt-4">
                    {all ? `Show the first ${PER_GROUP}` : `Show all ${g.total} ${KIND_PLURAL[g.kind].toLowerCase()}`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {none && (
        <section aria-labelledby="none-title" className="mt-10">
          <h2 id="none-title" className="type-title-m m-0 break-words text-text">
            Nothing matches “{q}”.
          </h2>
          <p className="type-body measure m-0 mt-2 text-muted">
            Search matches whole words. Check the spelling, try fewer words, or open a kind in the list below.
          </p>
          <p className="m-0 mt-4">
            <button type="button" onClick={clear} className="btn btn--secondary">
              Clear the search
            </button>
          </p>
          {near.length > 0 && (
            <>
              <h3 className="type-title-s m-0 mt-10 border-b border-line-strong pb-3 text-text">Nearest titles</h3>
              <ol className="m-0 list-none p-0">
                {near.map((h) => (
                  <HitRow key={`${h.kind}:${h.id}`} h={h} query="" kind />
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      {/* Everything, by kind: before a query, and under one that matched nothing. */}
      {(!searching || docs === null || none) && children}
    </div>
  );
}
