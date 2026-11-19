import { motionFrom, viewVerdict, type Motion, type ViewVerdict } from "./decide";

// The page side of a sequence that every page with a sequence carries from the start:
// reading the reader's motion setting, watching the root come into view, hearing input
// inside it, and wiping a sequence's writes off the markup. Browser only (it is reached
// from the "use client" enhancer). It is kept small on purpose: reading the markup into a
// plan is lib/motion/read.ts, which arrives with GSAP when a sequence is about to play.
//
// What a sequence writes, and nothing else:
//   root       data-seq-state, data-inked, data-seq-live, data-seq-snap
//   step       data-inked
//   drawable   style --draw (through GSAP while it plays; by hand in a step-through)
// clearMarks() removes every step and drawable write, which is the finished drawing.

export type SeqElement = HTMLElement | SVGElement;

const REDUCED = "(prefers-reduced-motion: reduce)";

/** html[data-motion] as the layout's script set it; the media query when it is absent. */
export function readMotion(): Motion {
  const attribute = document.documentElement.getAttribute("data-motion");
  const prefers = typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches;
  return motionFrom(attribute, prefers);
}

/**
 * Calls back when the reader's motion preference changes while the page is open. The
 * call waits a turn, so the layout's own listener has put the new value on <html> first.
 */
export function onMotionChange(fn: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED);
  let timer = 0;
  const listener = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, 0);
  };
  query.addEventListener("change", listener);
  return () => {
    window.clearTimeout(timer);
    query.removeEventListener("change", listener);
  };
}

// ---------- The markup ----------

const isSeqElement = (el: Element): el is SeqElement => el instanceof HTMLElement || el instanceof SVGElement;

/** Whether `el` belongs to this root and not to a root nested inside it. */
export const owns = (root: Element, el: Element): boolean => el.closest("[data-seq]") === root;

function all(root: Element, selector: string): SeqElement[] {
  return [...root.querySelectorAll(selector)].filter((el): el is SeqElement => isSeqElement(el) && owns(root, el));
}

/** Every step of this root, shown or not. */
export const allSteps = (root: Element): SeqElement[] => all(root, "[data-seq-step]");

/** Every drawable of this root, the trace line included. */
export const allDraws = (root: Element): SeqElement[] => all(root, "[data-draw]");

/** Removes every write a sequence makes inside its root: each step inked, each stroke at its CSS default (drawn). */
export function clearMarks(root: Element): void {
  for (const step of allSteps(root)) step.removeAttribute("data-inked");
  for (const draw of allDraws(root)) draw.style.removeProperty("--draw");
}

// ---------- In view ----------

const viewportHeight = () => window.innerHeight || document.documentElement.clientHeight;

/** Whether any part of the element is in the viewport right now. */
export function isOnScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const w = window.innerWidth || document.documentElement.clientWidth;
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < viewportHeight() && r.right > 0 && r.left < w;
}

/** How much of the element is in the viewport right now, measured once. */
export function viewNow(el: Element): ViewVerdict {
  const r = el.getBoundingClientRect();
  const h = viewportHeight();
  const visible = Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0));
  return viewVerdict(r.height > 0 ? visible / r.height : 0, visible, h);
}

/**
 * Watches the root with an IntersectionObserver (no scroll listener, no ScrollTrigger).
 * `onView` hears "in" when half of the root is in view (or it fills half the viewport),
 * "out" when it has all but left, and "between" otherwise. `onNear` is called once, when
 * the root is within half a screen of the viewport: the moment to fetch what playing needs.
 */
export function watchView(root: Element, onView: (verdict: ViewVerdict) => void, onNear: () => void): () => void {
  if (typeof IntersectionObserver !== "function") {
    // No observer: say what is true now and stay quiet. Any input still ends the sequence.
    onNear();
    onView(viewNow(root));
    return () => {};
  }
  const view = new IntersectionObserver(
    (entries) => {
      const entry = entries.at(-1);
      if (entry) onView(entry.isIntersecting ? viewVerdict(entry.intersectionRatio, entry.intersectionRect.height, viewportHeight()) : "out");
    },
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  );
  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near.disconnect();
        onNear();
      }
    },
    { rootMargin: "50% 0px" },
  );
  view.observe(root);
  near.observe(root);
  return () => {
    view.disconnect();
    near.disconnect();
  };
}

// ---------- Input ----------

const inControls = (root: Element, target: EventTarget | null): boolean =>
  target instanceof Element && target.closest("[data-seq-controls], [data-seq-enhancer]") !== null && owns(root, target);

/**
 * Calls back on a click or tap, or a key press, inside the root but outside its controls.
 * A scroll gesture that starts on the drawing is not input: only a completed click counts.
 * `onFocus` hears keyboard focus arriving inside the root the same way.
 */
export function onInputInside(root: SeqElement, onInput: () => void, onFocus: () => void): () => void {
  const input = (e: Event) => {
    if (!inControls(root, e.target)) onInput();
  };
  const focus = (e: Event) => {
    if (!inControls(root, e.target)) onFocus();
  };
  root.addEventListener("click", input);
  root.addEventListener("keydown", input);
  root.addEventListener("focusin", focus);
  return () => {
    root.removeEventListener("click", input);
    root.removeEventListener("keydown", input);
    root.removeEventListener("focusin", focus);
  };
}
