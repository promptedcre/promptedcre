"use client";

import { useEffect, useRef } from "react";

// CountUp: a computed figure that rolls up to its value once, the first time it is on screen
// (D224, the owner's "count up once"). The server's HTML is the final value, and so is what a
// screen reader, a reader without scripts, with reduced motion or on paper gets: only the
// visible digits move, in an aria-hidden copy, from zero to the value over DUR_MS. Nothing is
// ever shown that the page does not compute: the figure is `value`, rounded, with its `suffix`.

const DUR_MS = 900;

export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const shown = useRef<HTMLSpanElement>(null);
  // Whole numbers only, with an optional unit after them ("%"); props stay plain data, so a
  // server component can hand them over.
  const format = (n: number) => `${Math.round(n)}${suffix}`;
  const final = format(value);

  useEffect(() => {
    const el = shown.current;
    if (!el) return;
    const root = document.documentElement;
    if (root.getAttribute("data-motion") !== "full" || !("IntersectionObserver" in window)) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / DUR_MS);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = p >= 1 ? final : format(value * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        el.textContent = format(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = final;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- format depends only on value and suffix, both in final
  }, [value, final]);

  return (
    <span className={className}>
      <span ref={shown} aria-hidden="true" className="tabular-nums">
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
