"use client";

// The frame a schedule scrolls in. A table wider than the frame is cut at the frame's right
// edge, and a cut that falls between two columns looks like the end of the table. So while
// columns lie beyond the edge the frame says so twice: a ruled strip with a chevron stands
// on the cut (where the scrollbar itself is not drawn, as on a phone), and a line under the
// table names the columns that did not fit. Both are measured, never guessed: a table that
// fits gets neither, and is no longer a stop for the keyboard.
//
// With scripts off the frame still scrolls and its first column still holds; it is a
// focusable region then, the safe reading for a frame that may scroll.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { count } from "./format";

type Fit = {
  // the table is wider than the frame
  over: boolean;
  // columns lie beyond the right edge now, and no scrollbar is drawn to say so
  more: boolean;
  // the heads that do not fit with the table at rest
  hidden: string[];
};

const same = (a: Fit, b: Fit) => a.over === b.over && a.more === b.more && a.hidden.join("\n") === b.hidden.join("\n");

// One head by its name, two as "Paid and Ends at"; more than two, or a head with a comma of
// its own ("Operator, in all"), as "from A to Z", so the line never reads as a longer list.
function named(heads: string[]): string {
  const first = heads[0];
  const last = heads.at(-1);
  if (first === undefined || last === undefined) return "";
  if (heads.length === 1) return `: ${first}`;
  if (heads.length > 2 || heads.some((h) => h.includes(","))) return `, from ${first} to ${last}`;
  return `: ${first} and ${last}`;
}

export function ScrollFrame({ caption, wide = false, className, children }: { caption: string; wide?: boolean; className?: string; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const read = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      // a drawn scrollbar takes height from the frame; an overlaid one (a phone, a trackpad) takes none
      const bar = el.offsetHeight - el.clientHeight > 4;
      const next: Fit = {
        over,
        more: over && !bar && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
        hidden: over ? [...el.querySelectorAll<HTMLElement>("thead th")].filter((th) => th.offsetLeft + th.offsetWidth > el.clientWidth + 1).map((th) => th.textContent ?? "") : [],
      };
      setFit((was) => (was && same(was, next) ? was : next));
    };
    // the observer reports once as it starts, which is the first reading
    const watch = new ResizeObserver(read);
    watch.observe(el);
    if (el.firstElementChild) watch.observe(el.firstElementChild);
    el.addEventListener("scroll", read, { passive: true });
    return () => {
      watch.disconnect();
      el.removeEventListener("scroll", read);
    };
  }, []);

  // Until it is measured, and whenever it scrolls, the frame is a named region the keyboard can reach.
  const region = fit === null || fit.over ? ({ role: "region", "aria-label": caption, tabIndex: 0 } as const) : {};

  return (
    <div className={cx("calc-sched", className)}>
      <div className="calc-window" data-more={fit?.more ? "" : undefined}>
        <div ref={frame} className="calc-scroll" data-wide={wide ? "" : undefined} {...region}>
          {children}
        </div>
        <span aria-hidden="true" className="calc-more">
          <Icon name="chevron-right" />
        </span>
      </div>
      {fit?.over && fit.hidden.length > 0 && (
        <p aria-hidden="true" className="calc-over type-note">
          <Icon name="arrow-right" />
          <span>
            Scroll sideways for {count(fit.hidden.length, "more column")}
            {named(fit.hidden)}.
          </span>
        </p>
      )}
    </div>
  );
}
