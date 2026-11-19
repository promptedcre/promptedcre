"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { titleWords } from "./title-words";

// ListSearch: the box over a catalog list that keeps only the rows whose titles match what is
// typed (D224, the owner's "Pills + search"). Each row carries data-row and its title's words
// in data-title (titleKey, ./title-words.ts, written by components/catalog/list.tsx); a row
// that does not hold every word typed is marked data-miss, the
// list root is marked data-q while anything is typed, and the list's own rules hide what
// misses and open the folded outlines so a match among them shows. A group left with nothing
// in view is marked data-none and hidden too, counted after the filters above have done their
// part. One polite line says how many are shown. Escape or the clear button empties it.
//
// It needs scripts: with scripts off it is not drawn (.cl-js) and nothing is filtered. It is in
// the server HTML, so nothing moves when scripts arrive.
export function ListSearch({ rootId, noun }: { rootId: string; noun: string }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<number | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const id = `${rootId}-q`;

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const want = titleWords(query);
    const on = want.length > 0;
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-row]"));
    const groups = Array.from(root.querySelectorAll<HTMLElement>("section[data-g]"));
    const folds = Array.from(root.querySelectorAll<HTMLDetailsElement>("details.cl-fold"));
    for (const r of rows) r.toggleAttribute("data-miss", on && !want.every((w) => (r.dataset.title ?? "").includes(w)));
    root.toggleAttribute("data-q", on);
    // The outlines are folded: open them while a query is typed, and close again the ones this opened.
    const opened: HTMLDetailsElement[] = [];
    if (on) {
      for (const d of folds) {
        if (!d.open) {
          d.open = true;
          opened.push(d);
        }
      }
    }
    // What is in view now, after the written/outlined and group filters: a group with no row in
    // view goes, and the line says how many rows are left.
    const count = () => {
      for (const g of groups) g.removeAttribute("data-none");
      const visible = rows.filter((r) => r.getClientRects().length > 0);
      if (on) for (const g of groups) if (!visible.some((r) => g.contains(r))) g.setAttribute("data-none", "");
      setShown(on ? visible.length : null);
    };
    count();
    root.addEventListener("change", count);
    return () => {
      root.removeEventListener("change", count);
      for (const d of opened) d.open = false;
    };
  }, [query, rootId]);

  // Leaving the page with a query typed leaves nothing behind on the rows.
  useEffect(
    () => () => {
      const root = document.getElementById(rootId);
      if (!root) return;
      root.removeAttribute("data-q");
      for (const el of root.querySelectorAll("[data-miss],[data-none]")) {
        el.removeAttribute("data-miss");
        el.removeAttribute("data-none");
      }
    },
    [rootId],
  );

  const status = shown === null ? "" : shown === 0 ? "None match" : `${shown} shown`;
  return (
    <div className="cl-js min-w-0 md:w-80">
      <label htmlFor={id} className="sr-only">
        Filter the {noun} by title
      </label>
      {/* The field drops its own outline; the block draws the one ring, on its own border. */}
      <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-control border border-line-strong bg-raised pl-3 pr-1 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent-strong md:min-h-9">
        <Icon name="search" className="flex-none text-faint" />
        <input
          ref={field}
          id={id}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={80}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Filter by title"
          aria-describedby={`${id}-status`}
          className="type-body-s h-8 min-w-0 flex-1 border-0 border-b border-dashed border-line-bold bg-transparent text-text outline-none placeholder:text-faint"
        />
        <span id={`${id}-status`} aria-live="polite" className={cx("type-body-s flex-none whitespace-nowrap tabular-nums", shown === 0 ? "text-text" : "text-faint")}>
          {status}
        </span>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            field.current?.focus();
          }}
          aria-label="Clear the filter"
          tabIndex={query ? 0 : -1}
          className={cx("btn btn--quiet btn--sm w-9 flex-none px-0", !query && "invisible")}
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
