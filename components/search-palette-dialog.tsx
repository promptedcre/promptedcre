"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Tag } from "@/components/chips";
import {
  Highlight,
  KIND_ONE,
  KIND_PAGE,
  KIND_PLURAL,
  groupHits,
  hitMeta,
  indexLine,
  isExternal,
  kindCount,
  kindLabel,
  loadSearchIndex,
} from "@/components/library/search-shared";
import { cx } from "@/components/ui/cx";
import { Icon, type IconName } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { SEARCH_KINDS, nearestTitles, searchIndex, type SearchDoc, type SearchHit, type SearchKind } from "@/lib/search/index";
import type { PaletteRequest } from "./search-palette";

const PER_GROUP = 5;
const NEAREST = 5;

type Option = { key: string; href: string; name: string; title: ReactNode; sub: ReactNode; outline: boolean; lead: ReactNode };
type Section = { key: string; label: string; count: string | null; options: Option[] };

// Each kind's glyph in the palette (D224, the owner's command palette); a vendor shows its own
// icon instead (Logo, lib/logos.ts). Decoration only: the row's words name the kind.
const KIND_ICON: Record<SearchKind, IconName> = {
  playbook: "steps",
  situation: "bolt",
  calculator: "calculator",
  rule: "scale",
  artifact: "file",
  document: "file",
  market: "grid",
  vendor: "grid",
};

function Lead({ icon, children }: { icon?: IconName; children?: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-control border border-line bg-inset text-muted">
      {children ?? (icon ? <Icon name={icon} /> : null)}
    </span>
  );
}

// What an empty box offers first: the pages a newcomer comes for, before browsing by kind.
const QUICK: ReadonlyArray<{ href: string; title: string; sub: string; icon: IconName }> = [
  { href: "/connect", title: "Connect your agent", sub: "Add PromptedCRE to your AI agent", icon: "plug" },
  { href: "/#demo", title: "Watch an agent form an LLC", sub: "A recorded run on a fictional firm", icon: "play" },
  { href: "/audit", title: "Audit a firm", sub: "Eleven checks of an entity's standing", icon: "check" },
  { href: "/rankings", title: "Software rankings", sub: "How well an agent can operate each product", icon: "grid" },
];

function quickSection(): Section {
  return {
    key: "quick",
    label: "Quick links",
    count: null,
    options: QUICK.map((q) => ({ key: `quick:${q.href}`, href: q.href, name: q.title, title: q.title, sub: q.sub, outline: false, lead: <Lead icon={q.icon} /> })),
  };
}

// The dialog's own rules: how it opens and closes (docs/MOTION.md, M6). It rises 8 px and
// fades in over --dur-2, and leaves a quarter faster; the scrim fades with it. Where a browser
// cannot transition a dialog's display, it simply appears. Reduced motion lands at once.
const CSS = `@layer components {
.sp-dialog{opacity:0;translate:0 .5rem;transition:opacity calc(var(--dur-2)*.75) var(--ease-out),translate calc(var(--dur-2)*.75) var(--ease-out),overlay calc(var(--dur-2)*.75) allow-discrete,display calc(var(--dur-2)*.75) allow-discrete}
.sp-dialog[open]{opacity:1;translate:0 0;transition-duration:var(--dur-2)}
.sp-dialog::backdrop{background:var(--scrim);opacity:0;transition:opacity calc(var(--dur-2)*.75) var(--ease-out),overlay calc(var(--dur-2)*.75) allow-discrete,display calc(var(--dur-2)*.75) allow-discrete}
.sp-dialog[open]::backdrop{opacity:1;transition-duration:var(--dur-2)}
@starting-style{
.sp-dialog[open]{opacity:0;translate:0 .5rem}
.sp-dialog[open]::backdrop{opacity:0}
}
@media (prefers-reduced-motion:reduce){
.sp-dialog,.sp-dialog::backdrop{transition-duration:0s}
}
}`;

// The way to browse: the pages that list each kind, with what the index counts in them. Two
// kinds that share a page (the software markets and the vendors listed in them) share a row.
// Shown before a query, and under a query that found nothing and has nothing near it.
function browseSection(docs: readonly SearchDoc[]): Section {
  const pages = new Map<string, { label: string; parts: string[] }>();
  for (const kind of SEARCH_KINDS) {
    const of = docs.filter((d) => d.kind === kind);
    if (of.length === 0) continue;
    const outlined = of.filter((d) => d.outline).length;
    // Every part names what it counts ("32 playbooks and audits written, 42 outlined"), so a
    // row under a page's name never passes one kind off as another.
    const part = outlined > 0 ? `${kindCount(kind, of.length - outlined)} written, ${outlined} outlined` : kindCount(kind, of.length);
    const page = KIND_PAGE[kind];
    const entry = pages.get(page.href) ?? { label: page.label, parts: [] };
    entry.parts.push(part);
    pages.set(page.href, entry);
  }
  return {
    key: "browse",
    label: "Browse by kind",
    count: null,
    options: [...pages].map(([href, p]) => {
      const kind = SEARCH_KINDS.find((k) => KIND_PAGE[k].href === href) ?? "playbook";
      return { key: href, href, name: p.label, title: p.label, sub: p.parts.join(", "), outline: false, lead: <Lead icon={KIND_ICON[kind]} /> };
    }),
  };
}

function hitOption(h: SearchHit, query: string, mixed = false): Option {
  const meta = hitMeta(h);
  return {
    key: `${h.kind}:${h.id}`,
    href: h.url,
    name: `${h.title}, ${KIND_ONE[h.kind]}${h.outline ? ", outline" : ""}`,
    title: <Highlight text={h.title} query={query} />,
    sub: (
      <>
        {mixed ? `${kindLabel(h.kind)} · ` : meta ? `${meta} · ` : ""}
        {h.summary}
      </>
    ),
    outline: h.outline === true,
    // A vendor's id in the index is "<market>/<vendor>"; its icon goes by the vendor's own id.
    lead: h.kind === "vendor" ? (
      <Lead>
        <Logo id={h.id.split("/").at(-1) ?? h.id} name={h.title} size="md" />
      </Lead>
    ) : (
      <Lead icon={KIND_ICON[h.kind]} />
    ),
  };
}

// SearchPaletteDialog: the search palette itself. It loads /search-index.json the first time
// it opens, filters as you type, groups hits by kind (written records before outlines), moves
// with the arrow keys, opens a hit with Enter, and closes with Escape, returning focus to
// whatever opened it. Before a query it lists the pages that hold each kind; a query that
// matches nothing lists the nearest titles, or, with nothing near, those pages again: the
// list is never empty once the index has loaded. Built on the native <dialog> as a combobox
// with a grouped listbox. components/search-palette.tsx loads this file on demand and hands
// it each request to open.
export function SearchPaletteDialog({ request }: { request: PaletteRequest }) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState(request.query);
  // The chosen option's place in the list. "auto" is the list's own choice: the best hit or
  // the nearest title, and nothing where the list is only the way to browse (before a query,
  // or under one that found nothing), so Enter never opens a page the reader did not pick.
  const [active, setActive] = useState<number | "auto">("auto");
  // A new request that brings words (the not-found page's) starts the field with them.
  const [seen, setSeen] = useState(request.n);
  if (seen !== request.n) {
    setSeen(request.n);
    if (request.query) {
      setQuery(request.query);
      setActive("auto");
    }
  }
  const uid = useId().replace(/:/g, "");
  const ids = { list: `${uid}-list`, status: `${uid}-status`, hint: `${uid}-hint` };
  const optionId = (i: number) => `${uid}-opt-${i}`;

  // Each request opens the dialog; Ctrl+K while it is open closes it. A request is handled
  // once, however often the effect runs.
  const handled = useRef(0);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d || handled.current === request.n) return;
    handled.current = request.n;
    if (d.open) {
      if (!request.query) d.close();
      return;
    }
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    d.showModal();
    loadSearchIndex()
      .then((loaded) => {
        setDocs(loaded);
        setFailed(false);
      })
      .catch(() => setFailed(true));
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [request]);

  // The dialog's own close event (Escape, a hit followed, the close button): return focus.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => {
      const back = returnTo.current;
      returnTo.current = null;
      if (back && back.isConnected) back.focus();
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  const close = () => dialogRef.current?.close();

  // A followed link changes the route: close if still open.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    dialogRef.current?.close();
  }, [pathname]);

  const q = query.trim();
  // What the list is: the way to browse (no query yet), the hits, the nearest titles when
  // nothing matched, or the way to browse again when nothing is even near.
  const { sections, total, list } = useMemo<{ sections: Section[]; total: number; list: "browse" | "hits" | "near" | "none" }>(() => {
    if (!docs) return { sections: [], total: 0, list: "browse" };
    if (!q) return { sections: [quickSection(), browseSection(docs)], total: 0, list: "browse" };
    // every hit is scored so each group's count is complete; only the best few are shown
    const groups = groupHits(searchIndex(docs, q, SEARCH_KINDS, docs.length), PER_GROUP, true);
    if (groups.length > 0) {
      return {
        sections: groups.map((g) => ({
          key: g.kind,
          label: KIND_PLURAL[g.kind],
          count: g.total > g.hits.length ? `${g.hits.length} of ${g.total}` : String(g.total),
          options: g.hits.map((h) => hitOption(h, q)),
        })),
        total: groups.reduce((n, g) => n + g.total, 0),
        list: "hits",
      };
    }
    const nearest = nearestTitles(docs, q, NEAREST);
    if (nearest.length > 0) {
      return { sections: [{ key: "near", label: "Nearest titles", count: null, options: nearest.map((h) => hitOption(h, "", true)) }], total: 0, list: "near" };
    }
    return { sections: [browseSection(docs)], total: 0, list: "none" };
  }, [docs, q]);
  const flat = useMemo(() => sections.flatMap((s) => s.options), [sections]);
  // the index of each section's first option in `flat`
  const starts = useMemo(() => sections.map((_, si) => sections.slice(0, si).reduce((n, s) => n + s.options.length, 0)), [sections]);
  const first = list === "hits" || list === "near" ? 0 : -1;
  const current = flat.length === 0 ? -1 : active === "auto" ? first : Math.min(active, flat.length - 1);
  const searchPage = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
  // Under the list: every result of this query on the search page, or, with no result to
  // show, the page that lists everything.
  const more = total > 0 ? { href: searchPage, label: "All results on the search page" } : { href: "/search", label: "Browse everything" };

  // keep the active option in view
  useEffect(() => {
    if (current < 0) return;
    document.getElementById(`${uid}-opt-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current, uid]);

  const follow = (o: Option) => {
    close();
    if (isExternal(o.href)) window.location.assign(o.href);
    else router.push(o.href);
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (flat.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(current < 0 ? (step > 0 ? 0 : flat.length - 1) : (current + step + flat.length) % flat.length);
    } else if (e.key === "Home" && e.ctrlKey) {
      setActive(0);
    } else if (e.key === "End" && e.ctrlKey) {
      setActive(Math.max(0, flat.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = flat[current];
      if (o) follow(o);
      else if (q) {
        close();
        router.push(searchPage);
      }
    }
  };

  const status = failed
    ? "The index did not load. The search page lists everything."
    : docs === null
      ? "Loading the index"
      : !q
        ? `${indexLine(docs)}. Type to search, or browse by kind.`
        : total > 0
          ? `${total} ${total === 1 ? "result" : "results"}`
          : list === "near"
            ? `Nothing matches “${q}”. These titles are the nearest.`
            : `Nothing matches “${q}”. Search matches whole words. Browse by kind instead.`;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search the catalog"
      onClick={(e) => {
        // a click on the backdrop (the dialog element itself, outside its panel) closes it
        if (e.target === dialogRef.current) close();
      }}
      className="sp-dialog m-0 mx-auto mt-2 max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none overflow-hidden rounded-box border border-line-strong bg-raised p-0 text-text shadow-[0_1.5rem_4rem_var(--shadow)] open:flex open:flex-col sm:mt-[10vh] sm:max-h-[80vh] sm:w-[44rem]"
    >
      <style href="search-palette" precedence="default">
        {CSS}
      </style>
      {/* the field drops its own outline, so its row draws the one focus ring */}
      <div className="flex flex-none items-center gap-3 border-b border-line-strong pl-4 pr-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-accent-strong">
        <Icon name="search" size={20} className="text-faint" />
        <label htmlFor={`${uid}-q`} className="sr-only">
          Search playbooks, calculators, rules, artifacts, documents and software vendors
        </label>
        <input
          ref={inputRef}
          id={`${uid}-q`}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={ids.list}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          aria-describedby={`${ids.status} ${ids.hint}`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={200}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive("auto");
          }}
          onKeyDown={onInputKey}
          placeholder="capital call, waterfall"
          className="type-lede h-14 min-w-0 flex-1 border-0 bg-transparent text-text outline-none placeholder:text-faint"
        />
        <button type="button" onClick={close} className="btn btn--quiet w-11 flex-none px-0">
          <Icon name="close" size={20} />
          <span className="sr-only">Close search</span>
        </button>
      </div>

      <p id={ids.status} className="type-body-s m-0 flex-none break-words px-4 pt-3 tabular-nums text-faint" aria-live="polite">
        {status}
      </p>

      <div
        id={ids.list}
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 [scrollbar-color:var(--line-bold)_var(--bg-raised)]"
      >
        {sections.map((s, si) => (
          <div key={s.key} role="group" aria-labelledby={`${uid}-g-${s.key}`}>
            <p id={`${uid}-g-${s.key}`} className="type-label m-0 flex items-baseline justify-between gap-4 px-2 pb-1 pt-4 text-faint" role="presentation">
              <span>{s.label}</span>
              {s.count && <span className="tabular-nums">{s.count}</span>}
            </p>
            {s.options.map((o, j) => {
              const i = (starts[si] ?? 0) + j;
              const on = i === current;
              const cls = cx(
                "grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-control px-2 py-2 no-underline transition-colors",
                on ? "bg-panel" : "hover:bg-panel",
              );
              const inner = (
                <>
                  {o.lead}
                  {/* A title is what the reader chooses by, so a long one wraps; the line under it is cut. */}
                  <span className="min-w-0">
                    <span className={cx("type-body block break-words", o.outline ? "text-muted" : "text-text")}>{o.title}</span>
                    <span className="type-body-s block truncate text-muted">{o.sub}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {o.outline && <Tag dashed>Outline</Tag>}
                    <Icon name={isExternal(o.href) ? "external" : "arrow-right"} className={cx("text-accent-strong", on ? "opacity-100" : "opacity-0")} />
                  </span>
                </>
              );
              const row = {
                id: optionId(i),
                role: "option" as const,
                "aria-selected": on,
                "aria-label": o.name,
                tabIndex: -1,
                className: cls,
                onClick: close,
                onMouseMove: () => {
                  if (!on) setActive(i);
                },
              };
              return isExternal(o.href) ? (
                <a key={o.key} href={o.href} rel="noreferrer" {...row}>
                  {inner}
                </a>
              ) : (
                <Link key={o.key} href={o.href} {...row}>
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div id={ids.hint} className="type-body-s flex flex-none flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line-strong px-4 py-2 text-faint">
        <span className="hidden items-center gap-2 sm:inline-flex">
          <kbd className="inline-flex items-center gap-1 rounded-chip border border-line px-1.5 font-sans text-muted">
            <Icon name="arrow-up" label="Up arrow" />
            <Icon name="arrow-down" label="Down arrow" />
          </kbd>
          to move
          <kbd className="rounded-chip border border-line px-1.5 font-sans text-muted">Enter</kbd>
          to open
          <kbd className="rounded-chip border border-line px-1.5 font-sans text-muted">Esc</kbd>
          to close
        </span>
        <Link href={more.href} onClick={close} className="link link--accent inline-flex min-h-11 items-center sm:min-h-0">
          {more.label}
        </Link>
      </div>
    </dialog>
  );
}
