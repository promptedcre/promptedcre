"use client";

// What moves on a calculator page when an edit gives a new result (M5 in docs/MOTION.md):
//   - every bar ([data-bar]) travels from where it was to where it now measures, in the
//     order the bars are drawn, 240 ms each and 40 ms apart;
//   - a line of the working ([data-line]) whose value changed is tinted, and the tint
//     fades over 600 ms;
//   - the answer held at the foot of the screen ([data-pulse]) is tinted once.
// The figures themselves roll to their new values beside it (LiveText in live.tsx). On load
// the first result is there, finished, in the server's HTML; the one entrance is live.tsx's:
// the first time a drawing is seen its bars grow in and the lead figure counts up, once. A
// reader who asks for less motion gets the new measures at once and a still mark on the
// changed lines, which stays until the next result (the working then says what the mark
// means: see .calc-changed).
//
// Plain Web Animations: no library. The old positions are read just before React changes
// the page (getSnapshotBeforeUpdate), so a bar caught mid-travel starts from where it is.

import { Component, createRef, type ReactNode } from "react";

type Box = { x: number; y: number; w: number; h: number };
type Snapshot = { bars: Map<string, Box>; lines: Map<string, string> };

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const TRAVEL_MS = 240;
const APART_MS = 40;
const MAX_STEPS = 8;
const FADE_MS = 600;

const reduced = () =>
  typeof window !== "undefined" &&
  (document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// A bar's box inside its own drawing, so a drawing that moved down the page has not "moved" its bars.
function boxOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const f = (el.closest("[data-bars]") ?? el.parentElement ?? el).getBoundingClientRect();
  return { x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height };
}

// "label" for the first line with that label, "label#2" for the next: lines keep their identity when one is added above.
function lineKeys(els: HTMLElement[]): string[] {
  const seen = new Map<string, number>();
  return els.map((el) => {
    const label = el.dataset.line ?? "";
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label}#${n}`;
  });
}

function measure(root: HTMLElement): Snapshot {
  const bars = new Map<string, Box>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-bar]")) bars.set(el.dataset.bar ?? "", boxOf(el));
  const lines = new Map<string, string>();
  const els = [...root.querySelectorAll<HTMLElement>("[data-line]")];
  lineKeys(els).forEach((k, i) => lines.set(k, els[i]?.dataset.value ?? ""));
  return { bars, lines };
}

function play(root: HTMLElement, before: Snapshot) {
  const still = reduced();
  if (!still) {
    let step = 0;
    for (const el of root.querySelectorAll<HTMLElement>("[data-bar]")) {
      for (const a of el.getAnimations()) a.cancel();
      const was = before.bars.get(el.dataset.bar ?? "");
      const now = boxOf(el);
      const delay = Math.min(step, MAX_STEPS) * APART_MS;
      if (!was) {
        // a bar that was not drawn before (a new tier, a new year) arrives in ink
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TRAVEL_MS, delay, easing: EASE, fill: "backwards" });
        step += 1;
        continue;
      }
      if (now.w < 0.5 || now.h < 0.5) continue;
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      const sx = was.w / now.w;
      const sy = was.h / now.h;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: "none" }], { duration: TRAVEL_MS, delay, easing: EASE, fill: "backwards" });
      step += 1;
    }
    const tint = getComputedStyle(root).getPropertyValue("--selection").trim();
    for (const el of root.querySelectorAll<HTMLElement>("[data-pulse]")) {
      if (el.offsetParent === null || !tint) continue;
      el.animate([{ backgroundColor: tint }, {}], { duration: TRAVEL_MS, easing: "ease-out" });
    }
  }
  const els = [...root.querySelectorAll<HTMLElement>("[data-line]")];
  const lineTint = getComputedStyle(root).getPropertyValue("--selection").trim();
  lineKeys(els).forEach((k, i) => {
    const el = els[i];
    if (!el) return;
    const changed = before.lines.get(k) !== (el.dataset.value ?? "");
    // the still mark: on the lines this result changed, off the lines the one before it did
    if (still && changed) el.dataset.changed = "";
    else delete el.dataset.changed;
    if (!still && changed && lineTint) el.animate([{ backgroundColor: lineTint }, { backgroundColor: "transparent" }], { duration: FADE_MS, easing: "ease-out" });
  });
}

// Moves: wraps a calculator's page. `stamp` names the result on screen; it changes only
// when a new result that reads replaces the old one, and that is the only time anything moves.
export class Moves extends Component<{ stamp: string; children: ReactNode }, object, Snapshot | null> {
  root = createRef<HTMLDivElement>();

  getSnapshotBeforeUpdate(prev: { stamp: string }): Snapshot | null {
    const el = this.root.current;
    return el && prev.stamp !== this.props.stamp ? measure(el) : null;
  }

  componentDidUpdate(_props: unknown, _state: unknown, before: Snapshot | null) {
    const el = this.root.current;
    if (el && before) play(el, before);
  }

  render() {
    return <div ref={this.root}>{this.props.children}</div>;
  }
}
