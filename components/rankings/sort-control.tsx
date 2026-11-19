"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";

// SortControl (D224, the owner's "full table sortable"): two pill buttons that put a market's
// full table in score order or in name order, with a highlight that slides to the chosen one.
// Score order is the server's own (the rank order), so a reader without scripts gets that
// table and no control: html:not(.js) hides it (the rule is in BarStyles, with the rks-
// classes). It moves the table's own rows, which carry data-order (their place in the server's
// order) and data-name, and changes nothing else. The header of the column the table is sorted
// on carries aria-sort, and a polite status line says the new order.

type Order = "score" | "name";

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const SAID: Record<Order, string> = { score: "Sorted by score, highest first.", name: "Sorted by name, A to Z." };

export function SortControl({ target, className }: { target: string; className?: string }) {
  const [order, setOrder] = useState<Order>("score");
  const [said, setSaid] = useState("");
  const labelId = `${target}-sort`;

  function sort(next: Order) {
    if (next === order) return;
    const body = document.getElementById(target);
    if (body) {
      const rows = Array.from(body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.order !== undefined);
      const place = (el: HTMLElement) => Number(el.dataset.order);
      rows.sort(next === "name" ? (a, b) => collator.compare(a.dataset.name ?? "", b.dataset.name ?? "") || place(a) - place(b) : (a, b) => place(a) - place(b));
      body.append(...rows);
      body.closest("table")?.querySelectorAll<HTMLElement>("th[data-sort]").forEach((th) => {
        if (th.dataset.sort === next) th.setAttribute("aria-sort", next === "name" ? "ascending" : "descending");
        else th.removeAttribute("aria-sort");
      });
    }
    setOrder(next);
    setSaid(SAID[next]);
  }

  return (
    <div className={cx("rks", className)} data-order={order} role="group" aria-labelledby={labelId}>
      <span id={labelId} className="type-label text-muted">
        Sort by
      </span>
      <span className="rks-pills">
        <span aria-hidden="true" className="rks-hl" />
        <button type="button" className="rks-btn type-label" aria-pressed={order === "score"} onClick={() => sort("score")}>
          Score
        </button>
        <button type="button" className="rks-btn type-label" aria-pressed={order === "name"} onClick={() => sort("name")}>
          Name
        </button>
      </span>
      <span className="sr-only" role="status">
        {said}
      </span>
    </div>
  );
}
