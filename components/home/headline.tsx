"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/site";

// The home page's h1 (D224, the owner's "cycle the last word"): the owner's line, whose last
// word passes once through the three structures the library is written for and comes back to
// rest on "firm". It never loops. From 768 px the word stands on its own line, so a longer
// word never reflows the lines above it; on a phone, with reduced motion or with scripts off
// it does not move at all, and the server's HTML is the owner's line as written. The h1's
// accessible name is the line itself, whatever word is on screen.

const WORDS = ["firm", "syndication", "fund", "joint venture", "firm"] as const;
const FIRST_MS = 1600;
const HOLD_MS = 1400;

export function Headline({ id }: { id: string }) {
  const [i, setI] = useState(0);
  const tail = " firm.";
  const cycles = site.tagline.endsWith(tail);
  const lead = cycles ? site.tagline.slice(0, -tail.length) : site.tagline;

  useEffect(() => {
    if (!cycles) return;
    const root = document.documentElement;
    if (root.getAttribute("data-motion") !== "full") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    let n = 0;
    let timer = window.setTimeout(function next() {
      n += 1;
      setI(n);
      if (n < WORDS.length - 1) timer = window.setTimeout(next, HOLD_MS);
    }, FIRST_MS);
    return () => window.clearTimeout(timer);
  }, [cycles]);

  return (
    <h1 id={id} aria-label={site.tagline} className="type-hero max-[367px]:type-page m-0 max-w-5xl text-balance text-text">
      <span aria-hidden="true">{lead}</span>
      {cycles && (
        <span aria-hidden="true" className="hl-word">
          {" "}
          <span key={i} className="hl-word-in">
            {WORDS[i]}
          </span>
          .
        </span>
      )}
    </h1>
  );
}
