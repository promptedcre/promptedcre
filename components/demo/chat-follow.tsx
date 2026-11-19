"use client";

import { useEffect, useRef } from "react";
import { dragsBack, followMove, revealTop, scrollsBack } from "./follow";

// ChatFollow: while the formation chat plays, keeps the newest message in view by scrolling
// the chat's own window. Only that window moves: Element.scrollTo on it, never
// scrollIntoView, never the page, never focus. It reads what the motion kit writes
// (data-seq-state on the root, data-inked on each step) through one MutationObserver and
// writes nothing the kit owns, so the kit's contract (docs/MOTION.md) is untouched. The rules
// are ./follow.ts:
//
//   a message inks           the step after it is brought into view, its bottom first
//   the run starts again     the window goes back to the top and follows again (Replay)
//   the run plays out        the window lands at its end, if it was following
//   the reader ends it       with a click or a key press inside it: the window lands at its end
//                            (an end by focus arriving, or by printing, leaves it where it is)
//   the reader scrolls it    back, while it plays or is paused: it stops following, until the
//                            run starts again or is resumed
//
// Rendered as an empty marker inside the window, the way the kit's enhancer is. With scripts
// off it never runs, and with reduced motion the run never plays, so nothing moves: the
// reader scrolls the window, which is a labelled, focusable region (components/demo/llc-demo.tsx).

const INPUT_WINDOW = 1500; // ms: how recent a click or key press must be to count as ending the run

export function ChatFollow() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const scroller = marker.current?.parentElement;
    const root = scroller?.closest("[data-seq]");
    if (!scroller || !root || typeof MutationObserver !== "function") return;

    let follow = true;
    let lastInput = Number.NEGATIVE_INFINITY;
    let touchY: number | null = null;

    // The window's steps that are laid out: a step a phone does not lay out (a reading pause) takes no part.
    const steps = () => [...scroller.querySelectorAll("[data-seq-step]")].filter((el) => el.getClientRects().length > 0);
    const behavior = (): ScrollBehavior => (document.documentElement.getAttribute("data-motion") === "reduced" ? "auto" : "smooth");
    const scrollTo = (top: number) => {
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const next = Math.min(max, Math.max(0, Math.round(top)));
      if (Math.abs(next - scroller.scrollTop) > 1) scroller.scrollTo({ top: next, behavior: behavior() });
    };
    // A step's box in the window's scrolled content.
    const boxOf = (el: Element) => {
      const box = el.getBoundingClientRect();
      const top = box.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      return { top, bottom: top + box.height };
    };

    const observer = new MutationObserver((records) => {
      const list = steps();
      let restart = false;
      let finished = false;
      let inked = -1;
      for (const r of records) {
        const el = r.target;
        if (!(el instanceof Element) || r.attributeName === null) continue;
        const value = el.getAttribute(r.attributeName);
        if (el === root && r.attributeName === "data-seq-state") {
          if (value === "penciled") restart = true;
          if (value === "done") finished = true;
        } else if (r.attributeName === "data-inked") {
          if (value === "true") inked = Math.max(inked, list.indexOf(el));
          else if (value === "false" && r.oldValue !== "false" && el === list[0]) restart = true;
        }
      }
      const next = followMove({
        restart,
        finished,
        snapped: root.hasAttribute("data-seq-snap"),
        recentInput: performance.now() - lastInput < INPUT_WINDOW,
        follow,
        inked,
        steps: list.length,
      });
      follow = next.follow;
      const move = next.move;
      if (move.to === "end") scrollTo(scroller.scrollHeight);
      else if (move.to === "top") scrollTo(0);
      else if (move.to === "step") {
        const el = list[move.index];
        const from = move.fromTop ? 0 : scroller.scrollTop;
        const target = el ? revealTop(boxOf(el), from, scroller.clientHeight) : null;
        if (target !== null) scrollTo(target);
        else if (move.fromTop) scrollTo(0);
      }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["data-inked", "data-seq-state"] });

    // The reader takes the window over by scrolling it back while the run is going.
    const going = () => {
      const state = root.getAttribute("data-seq-state");
      return state === "playing" || state === "paused";
    };
    const onWheel = (e: WheelEvent) => {
      if (scrollsBack(e.deltaY) && going()) follow = false;
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY !== null && y !== undefined && dragsBack(touchY, y) && going()) follow = false;
    };
    // A run that is resumed, or starts, follows again.
    const onPhase = (e: Event) => {
      if (e instanceof CustomEvent && e.detail === "playing") follow = true;
    };
    // A click or a key press inside the drawing, outside its controls, is what ends a run early.
    const onInput = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-seq-controls]")) return;
      lastInput = performance.now();
    };
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: true });
    root.addEventListener("seq:phase", onPhase);
    root.addEventListener("click", onInput, true);
    root.addEventListener("keydown", onInput, true);
    return () => {
      observer.disconnect();
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("seq:phase", onPhase);
      root.removeEventListener("click", onInput, true);
      root.removeEventListener("keydown", onInput, true);
    };
  }, []);

  return <span ref={marker} hidden data-lc-follow="" />;
}
