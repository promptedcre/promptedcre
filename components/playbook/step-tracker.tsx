"use client";

import { useEffect, useRef, useState } from "react";
import { RoleMark } from "@/components/ui/roles";
import { VARIANT_EVENT } from "@/components/ui/variant-sync";
import type { StepMark } from "@/lib/compute/site-facts";

type Now = { label: string; title: string; mark: StepMark | null };

const MARKS: readonly string[] = ["A", "B", "H", "O"];

// The reading line: a card is the one being read while it crosses the line a quarter of the
// way down the screen (a band one hundredth of the screen tall there), below the header and
// the bar.
const BAND = "-25% 0px -74% 0px";

// After "All steps", how long the mark stays on the step the reader left while the page
// scrolls back past the other cards to the list.
const HOLD_MS = 1600;

// StepTracker: the one script behind "where am I" on a record's page (D224, the owner's
// "Smooth + tracking"). It renders the bar that names the step being read and runs one
// IntersectionObserver over the step cards (components/step-list.tsx):
//   - the card crossing the reading line is the step being read; its link in the list of
//     steps (./step-index) carries aria-current="step", which the list draws as its highlight;
//   - while a card crosses the line and the bar's pin has stuck under the site header (the list
//     above has scrolled away), the bar says which ("Step 5 of 12", its mark, its title), with
//     a link back to the list; when no card crosses the line, the bar fades out and the mark
//     goes, so the list marks nothing while the reader is above or below the steps;
//   - "All steps" keeps the mark on the step the reader left, so the list shows where they were.
// The pin sits right above the first card, so before it sticks the bar would lie over that
// card: it shows only once the pin's top is below the list's (one measure per frame while the
// page scrolls). The numbers follow the structure switch: a card's number is its place among
// the cards laid out now. With scripts off it never runs: no mark, and the bar is not drawn
// (./page-styles).
export function StepTracker({ listId, indexId, topId, noun }: { listId: string; indexId: string; topId: string; noun: string }) {
  const [now, setNow] = useState<Now | null>(null);
  const [reading, setReading] = useState(false);
  const [stuck, setStuck] = useState(false);
  const back = useRef<HTMLAnchorElement>(null);
  const pin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = document.getElementById(listId);
    const index = document.getElementById(indexId);
    if (!list || !index || typeof IntersectionObserver !== "function") return;
    const cards = Array.from(list.querySelectorAll<HTMLElement>("li.st[id^='step-']"));
    const links = Array.from(index.querySelectorAll<HTMLAnchorElement>("a.si-a"));
    const inBand = new Set<Element>();
    let current: HTMLElement | null = null;
    let holdUntil = 0;
    let timer = 0;

    // A numbered card's place among the numbered cards laid out now; a card outside the
    // default view carries its jurisdiction instead, as it does on the page.
    const describe = (card: HTMLElement): Now => {
      const title = card.querySelector(".st-t")?.textContent ?? "";
      const letter = card.dataset.mark ?? "";
      const mark = MARKS.includes(letter) ? (letter as StepMark) : null;
      if (!card.hasAttribute("data-s")) return { label: card.querySelector(".st-n > [aria-hidden]")?.textContent ?? "", title, mark };
      const shown = cards.filter((c) => c.hasAttribute("data-s") && c.getClientRects().length > 0);
      const at = shown.indexOf(card);
      // A card the structure switch has just hidden has no place; the observer moves the mark on.
      return { label: at >= 0 ? `${noun} ${at + 1} of ${shown.length}` : "", title, mark };
    };

    const markStep = (card: HTMLElement | null) => {
      current = card;
      const href = card ? `#${card.id}` : null;
      for (const a of links) {
        if (href !== null && a.getAttribute("href") === href) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
      }
      setNow(card ? describe(card) : null);
    };

    // fromObserver: a card has just left the line; with none on it, the mark goes. Called when a
    // hold ends instead, an empty line keeps the mark (the reader is at the list they jumped to).
    const update = (fromObserver: boolean) => {
      if (Date.now() < holdUntil) return;
      const first = cards.find((c) => inBand.has(c)) ?? null;
      setReading(first !== null);
      if (first) {
        if (first !== current) markStep(first);
      } else if (fromObserver && current) markStep(null);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target);
          else inBand.delete(e.target);
        }
        update(true);
      },
      { rootMargin: BAND },
    );
    for (const c of cards) io.observe(c);

    // Has the pin stuck under the header? Unstuck, it sits where the list starts; stuck, below it.
    const holder = pin.current;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (holder) setStuck(holder.getBoundingClientRect().top > list.getBoundingClientRect().top + 1);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    // The structure switch changes which cards show, and so the numbers.
    const refresh = () => {
      if (current) setNow(describe(current));
      schedule();
    };
    const onBack = () => {
      holdUntil = Date.now() + HOLD_MS;
      setReading(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => update(false), HOLD_MS + 50);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener(VARIANT_EVENT, refresh);
    const link = back.current;
    link?.addEventListener("click", onBack);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener(VARIANT_EVENT, refresh);
      link?.removeEventListener("click", onBack);
      for (const a of links) a.removeAttribute("aria-current");
    };
  }, [listId, indexId, noun]);

  const nouns = `${noun.toLowerCase()}s`;
  return (
    <div ref={pin} className="si-pin print:hidden">
      <nav aria-label={`Where you are in the ${nouns}`} className="si-bar" data-on={reading && stuck && now ? "" : undefined}>
        {now?.mark && <RoleMark mode={now.mark} showLabel={false} size="sm" />}
        <span className="si-bar-n type-label tabular-nums">{now?.label}</span>
        <span className="si-bar-t type-body-s">{now?.title}</span>
        <a ref={back} href={`#${topId}`} className="si-bar-a link link--muted type-body-s">
          All {nouns}
        </a>
      </nav>
    </div>
  );
}
