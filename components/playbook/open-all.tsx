"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { VARIANT_EVENT } from "@/components/ui/variant-sync";

// Opens the row a link points to (#rule-..., #source-...), on load, when the hash changes and
// when a link names the row the address already holds. A row's fold is its own child; a step
// card's is not (components/step-list.tsx), so a link to a step lands on the card as it is.
// Renders nothing. With scripts off the foundation's fold shows a targeted row's body by itself.
//
// That same foundation rule keeps a targeted row's body showing whether the fold is open or
// not, so a reader could not close the row a link had just brought them to. A targeted row
// the reader closes is therefore marked data-shut, and the page's own rules (./page-styles)
// let `open` alone decide for a marked row.
export function OpenTarget() {
  useEffect(() => {
    const open = () => {
      let id = "";
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return; // an address that is not valid text names no row
      }
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      let moved = false;
      // A row inside a closed fold (a source past the first six, on a phone) is not laid out
      // until that fold is open.
      for (let fold = el.parentElement?.closest("details"); fold; fold = fold.parentElement?.closest("details")) {
        if (!fold.open) {
          fold.open = true;
          moved = true;
        }
      }
      const details = el.matches("details") ? el : el.querySelector(":scope > details");
      if (details instanceof HTMLDetailsElement && !details.open) {
        details.open = true;
        moved = true;
      }
      if (moved) el.scrollIntoView({ block: "start" });
    };
    // toggle does not bubble, so it is heard on its way down.
    const onToggle = (e: Event) => {
      const fold = e.target;
      if (fold instanceof HTMLDetailsElement && !fold.open && fold.matches(":target, :target > details")) fold.setAttribute("data-shut", "");
    };
    // A link to the row the address already names changes no hash, so nothing else hears it.
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href^='#']") : null;
      if (link && link.getAttribute("href") === window.location.hash) window.setTimeout(open, 0);
    };
    open();
    window.addEventListener("hashchange", open);
    document.addEventListener("toggle", onToggle, true);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", open);
      document.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}

// The step cards' folds in view: the ones laid out, so a card the structure switch hides is not counted.
function stepRows(targetId: string): HTMLDetailsElement[] {
  const list = document.getElementById(targetId);
  return list ? Array.from(list.querySelectorAll<HTMLDetailsElement>("details.st-fold")).filter((d) => d.getClientRects().length > 0) : [];
}

const allOpen = (rows: HTMLDetailsElement[]) => rows.length > 0 && rows.every((d) => d.open);

// OpenAll: opens or closes the "Details" fold of every step card inside the element with
// `targetId` ("Open all details"). What it offers is read from the folds themselves, so it
// says "Close all" once the reader has opened the last one by hand, and "Open all" again as
// soon as one is closed. A progressive extra: it needs scripts, so with scripts off it is not
// shown (pb-js) and each card still opens on its own.
export function OpenAll({ targetId, noun = "steps" }: { targetId: string; noun?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const list = document.getElementById(targetId);
    if (!list) return;
    const sync = () => setOpen(allOpen(stepRows(targetId)));
    // Once the page has settled: a #hash may already have opened a row.
    const frame = window.requestAnimationFrame(sync);
    // toggle does not bubble, so it is heard on its way down. The structure switch (and a
    // step back to another choice of it) changes which rows are in view without opening or
    // closing one.
    list.addEventListener("toggle", sync, true);
    window.addEventListener(VARIANT_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      list.removeEventListener("toggle", sync, true);
      window.removeEventListener(VARIANT_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [targetId]);

  const toggle = () => {
    const rows = stepRows(targetId);
    const next = !allOpen(rows);
    for (const d of rows) d.open = next;
    setOpen(next);
  };
  return (
    <Button variant="secondary" size="sm" onClick={toggle} aria-controls={targetId} className="pb-js print:hidden">
      <Icon name={open ? "minus" : "plus"} />
      {open ? `Close all ${noun}` : `Open all ${noun}`}
    </Button>
  );
}

// PrintButton: the browser's print dialog, where "Save as PDF" is one of the printers. The
// page's print rules turn it into a plain document with every step open and a line to sign
// under each step a person does. It sits with the record's actions in its head
// (RecordActions), set as a small link beside "Download the file": a finger's height on a
// phone, a line of text from 768 px. It needs scripts (pb-js); the browser's own Print
// command gives the same document.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="pb-js link link--muted type-body-s inline-flex min-h-11 cursor-pointer items-center md:min-h-0 print:hidden"
    >
      Print or save as PDF
    </button>
  );
}
