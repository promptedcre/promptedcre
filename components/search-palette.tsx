"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

// One request to show the palette. `n` counts them, so asking twice is two requests;
// `query` is what the field starts with ("" keeps whatever was typed last).
export type PaletteRequest = { n: number; query: string };

// The last part of an address as words: "/playbooks/form-d-filing" is "form d filing".
function wordsOfPath(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).at(-1) ?? "";
  let text = last;
  try {
    text = decodeURIComponent(last);
  } catch {
    // a malformed escape: search for it as written
  }
  return text.replace(/[-_+.]+/g, " ").trim();
}

// SearchPalette: search from any page, at no cost to the page until it is asked for. This
// file is all that loads with a page: two listeners. The dialog itself, the ranking code and
// the index arrive the first time search is opened (components/search-palette-dialog.tsx),
// so none of them is in any page's first-load JavaScript.
//
// It opens from any element marked data-search-open (the header's Search control, which
// stays a plain link to /search with scripts off) and with Ctrl+K or Cmd+K. An opener
// marked data-search-open="path" starts the field with the words of the current address
// (the not-found page does, so "search for what I asked for" is one press). If the dialog's
// code cannot be fetched, the opener falls back to what it is without scripts: the search page.
export function SearchPalette() {
  const [Dialog, setDialog] = useState<ComponentType<{ request: PaletteRequest }> | null>(null);
  const [request, setRequest] = useState<PaletteRequest | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    const ask = (query: string) => {
      setRequest((r) => ({ n: (r?.n ?? 0) + 1, query }));
      if (asked.current) return;
      asked.current = true;
      import("./search-palette-dialog")
        .then((m) => setDialog(() => m.SearchPaletteDialog))
        .catch(() => {
          asked.current = false;
          window.location.assign(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
        });
    };
    // A plain click on an opener (caught before the link navigates).
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const opener = e.target instanceof Element ? e.target.closest("[data-search-open]") : null;
      if (!opener) return;
      e.preventDefault();
      ask(opener.getAttribute("data-search-open") === "path" ? wordsOfPath(window.location.pathname) : "");
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ask("");
      }
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return Dialog && request ? <Dialog request={request} /> : null;
}
