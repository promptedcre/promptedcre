"use client";

// Live charts (decision 96; the owner's BoardUI round, taken as ideas only: no BoardUI code
// and no package). Two pieces, used by the pure figures in figures.tsx:
//
//   - ChartFrame wraps one drawing. Its bars and areas grow in the first time it is seen, in
//     the order they are drawn. A readout names the value under the pointer (a tap on a
//     phone), and once the drawing has keyboard focus (one stop per drawing) the arrow keys
//     walk its values, Home and End jump, Escape hides the readout. The readout is for the
//     eye only: a screen reader reads the drawing's own text alternative, its `label`.
//   - LiveText is a computed figure. When an input changes it rolls from its old value to its
//     new one in under half a second (roll.ts says which figures can); with `enter` it is the
//     lead figure, which comes into focus counting up from zero the first time it is seen.
//
// Each moves once, and only on a screen with scripts on and full motion. The server's HTML is
// the worked example, finished, and that is what a reader gets with scripts off, with reduced
// motion (a new value then simply replaces the old) and on paper. A hidden "before" state lives
// only in CalcStyles, under html.js[data-motion="full"] on screens, and this file lifts it
// (data-seen) when the drawing is first in view. The bars that travel on an edit are the page's
// (motion.tsx). Plain Web Animations and requestAnimationFrame: no library.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cx } from "@/components/ui/cx";
import { cubicBezier, DEFAULT_TOKENS, parseBezier, parseTime } from "@/lib/motion/tokens";
import { rollBetween, rollUp, type Roll } from "./roll";

// A roll's first frame is written before the page is painted, so the new value never flashes.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

// How long a figure takes to roll to a new value, and to count up when it is first seen.
const ROLL_MS = 450;
const COUNT_MS = 900;

// Full motion, and the page's own motion started (the head script sets data-reveal-off when it
// did not, and then nothing is hidden, so nothing may be hidden now either).
function moving(): boolean {
  const html = document.documentElement;
  return html.getAttribute("data-motion") === "full" && !html.hasAttribute("data-reveal-off");
}

let curve: ((p: number) => number) | null = null;
// The site's --ease-out, read once from the page.
function eased(): (p: number) => number {
  curve ??= cubicBezier(parseBezier(getComputedStyle(document.documentElement).getPropertyValue("--ease-out")) ?? DEFAULT_TOKENS.easeOut);
  return curve;
}

// ---------- LiveText ----------

// React writes a figure as the element's only text node; a roll writes its frames into it.
function put(el: HTMLElement, text: string) {
  const node = el.firstChild;
  if (node && node === el.lastChild && node.nodeType === Node.TEXT_NODE) {
    if (node.nodeValue !== text) node.nodeValue = text;
  } else el.textContent = text;
}

// The rolls on screen, so a page about to print can finish them first.
const rolling = new Set<() => void>();
let printHooked = false;

// Rolls one figure; returns what stops it where it stands (the next roll starts from there).
function play(el: HTMLElement, roll: Roll, final: string, ms: number, shown: { current: string }): () => void {
  if (!printHooked) {
    printHooked = true;
    window.addEventListener("beforeprint", () => rolling.forEach((done) => done()));
  }
  const ease = eased();
  const start = performance.now();
  let frame = 0;
  const show = (text: string) => {
    put(el, text);
    shown.current = text;
  };
  function stop() {
    cancelAnimationFrame(frame);
    rolling.delete(done);
  }
  function done() {
    stop();
    show(final);
  }
  const tick = (now: number) => {
    const p = (now - start) / ms;
    if (p >= 1) return done();
    show(roll(ease(p)));
    frame = requestAnimationFrame(tick);
  };
  rolling.add(done);
  show(roll(0));
  frame = requestAnimationFrame(tick);
  return stop;
}

export function LiveText({ text, enter = false, className, style }: { text: string; enter?: boolean; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  // What the figure shows now: the last frame written, or its value.
  const shown = useRef(text);
  const stop = useRef<(() => void) | null>(null);
  const mounted = useRef(false);

  // A new value: React has written it; roll to it from what was on screen.
  useBeforePaint(() => {
    const el = ref.current;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    stop.current?.();
    stop.current = null;
    const from = shown.current;
    shown.current = text;
    // A lead figure not seen yet counts up from zero to whatever it then holds.
    if (!el || from === text || !moving() || (enter && !el.hasAttribute("data-seen"))) return;
    const roll = rollBetween(from, text);
    if (roll) stop.current = play(el, roll, text, ROLL_MS, shown);
  }, [text, enter]);

  // The lead figure: in focus and counting up from zero the first time half of it is on screen.
  useEffect(() => {
    const el = ref.current;
    const running = stop;
    if (!el) return;
    let io: IntersectionObserver | null = null;
    if (!enter) {
      // nothing to wait for
    } else if (!moving() || !("IntersectionObserver" in window)) {
      el.setAttribute("data-seen", "");
    } else {
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io?.disconnect();
          running.current?.();
          const final = shown.current;
          const roll = moving() ? rollUp(final) : null;
          if (roll) running.current = play(el, roll, final, COUNT_MS, shown);
          el.setAttribute("data-seen", "");
        },
        { threshold: 0.5 },
      );
      io.observe(el);
    }
    return () => {
      io?.disconnect();
      running.current?.();
    };
  }, [enter]);

  return (
    <span ref={ref} className={cx(enter && "calc-count", className) || undefined} style={style}>
      {text}
    </span>
  );
}

// ---------- ChartFrame ----------

const READ = "[data-read]";

// Each value a readout can name, in drawing order; one not laid out (a thinned label) is skipped.
function readables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(READ)].filter((n) => n.getClientRects().length > 0);
}

// What a readout points at: the value's own bars (not the lines that join them), or the value.
function boxOf(item: HTMLElement): DOMRect {
  const bars = item.matches("[data-bar]") ? [item] : [...item.querySelectorAll<HTMLElement>("[data-bar]:not(.dim-ext)")];
  const rects = (bars.length > 0 ? bars : [item]).map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0);
  if (rects.length === 0) return item.getBoundingClientRect();
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  return new DOMRect(left, top, Math.max(...rects.map((r) => r.right)) - left, Math.max(...rects.map((r) => r.bottom)) - top);
}

type Axis = "x" | "y" | "xy" | "grid";

// The value under the pointer, or the nearest one along the drawing's axis (a column chart
// answers anywhere above its columns; a grid only on a cell).
function nearest(root: HTMLElement, axis: Axis, x: number, y: number, target: EventTarget | null): HTMLElement | null {
  const hit = target instanceof Element ? target.closest<HTMLElement>(READ) : null;
  if (hit && root.contains(hit)) return hit;
  if (axis === "grid") return null;
  let best: HTMLElement | null = null;
  let far = Number.POSITIVE_INFINITY;
  for (const item of readables(root)) {
    const r = boxOf(item);
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const d = axis === "x" ? Math.abs(dx) : axis === "y" ? Math.abs(dy) : Math.hypot(dx, dy);
    if (d < far) {
      far = d;
      best = item;
    }
  }
  return best;
}

const start = (items: HTMLElement[]) => items.find((n) => n.hasAttribute("data-read-start")) ?? items[0];

// Where an arrow key goes from the value being read; undefined for a key that is not ours.
function step(items: HTMLElement[], axis: Axis, cur: HTMLElement | null, key: string): HTMLElement | undefined {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return undefined;
  if (!cur) return start(items);
  if (axis === "grid") {
    const at = (n: HTMLElement) => [Number(n.dataset.readRow), Number(n.dataset.readCol)];
    const [r = 0, c = 0] = at(cur);
    const cell = (row: number, col: number) => items.find((n) => at(n)[0] === row && at(n)[1] === col);
    const row = items.filter((n) => at(n)[0] === r);
    const to: Record<string, HTMLElement | undefined> = {
      ArrowUp: cell(r - 1, c),
      ArrowDown: cell(r + 1, c),
      ArrowLeft: cell(r, c - 1),
      ArrowRight: cell(r, c + 1),
      Home: row[0],
      End: row.at(-1),
    };
    return to[key] ?? cur;
  }
  const i = items.indexOf(cur);
  if (key === "Home") return items[0];
  if (key === "End") return items.at(-1);
  const next = key === "ArrowRight" || key === "ArrowDown" ? i + 1 : i - 1;
  return items[Math.max(0, Math.min(items.length - 1, next))];
}

// Puts the readout over what it names, inside the drawing's own width, and under it when the
// sheet has no room above.
function place(root: HTMLElement, tip: HTMLElement, item: HTMLElement) {
  const frame = root.getBoundingClientRect();
  const box = boxOf(item);
  const sheet = (root.closest(".sheet") ?? root).getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.max(0, Math.min(box.left - frame.left + box.width / 2 - w / 2, frame.width - w));
  let top = box.top - frame.top - h - 8;
  if (frame.top + top < sheet.top + 4) top = box.bottom - frame.top + 8;
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

// What a drawing's bars and areas do when it is first seen, by data-grow: "x" grows from its
// left edge, "up" from its foot (a bar above the line), "down" from its head (a bar below
// it), "pop" arrives (a dated key), "tint" fills (a shaded cell).
function framesFor(el: HTMLElement): Keyframe[] | null {
  switch (el.dataset.grow) {
    case "x":
      return [{ transform: "scaleX(0)" }, { transform: "none" }];
    case "up":
      return [{ transform: `translateY(${el.offsetHeight}px) scaleY(0)` }, { transform: "none" }];
    case "down":
      return [{ transform: "scaleY(0)" }, { transform: "none" }];
    case "pop":
      return [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }];
    case "tint":
      return [{ backgroundColor: "transparent" }, { backgroundColor: getComputedStyle(el).backgroundColor }];
    default:
      return null;
  }
}

// The drawing is seen: lift the hidden state and grow each part from it, in drawing order
// (data-grow-at, when given, is a part's place in that order), all of it within about a second.
function grow(root: HTMLElement) {
  root.setAttribute("data-seen", "");
  if (!moving()) return;
  const parts = [...root.querySelectorAll<HTMLElement>("[data-grow]")];
  const order = parts.map((p, i) => (p.dataset.growAt === undefined ? i : Number(p.dataset.growAt) || 0));
  const last = Math.max(0, ...order);
  const apart = last > 0 ? Math.min(70, 480 / last) : 0;
  const css = getComputedStyle(document.documentElement);
  const easing = css.getPropertyValue("--ease-out").trim() || "ease-out";
  const duration = parseTime(css.getPropertyValue("--dur-4")) ?? DEFAULT_TOKENS.dur4;
  parts.forEach((p, i) => {
    const keyframes = framesFor(p);
    // fill backwards: a part waiting its turn holds its first frame, so nothing shows early
    if (keyframes) p.animate(keyframes, { duration, delay: 60 + (order[i] ?? 0) * apart, easing, fill: "backwards" });
  });
}

const noSubscribe = () => () => {};
// False in the server's HTML and while it hydrates, true after: the keyboard stop exists only
// where the script that answers it does.
const useHydrated = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

export function ChartFrame({
  label,
  role = "img",
  axis = "x",
  className,
  style,
  children,
}: {
  // the drawing's text alternative: what a screen reader reads in its place
  label: string;
  // "group" keeps what is inside readable (a table); "img" reads the label instead
  role?: "img" | "group";
  // how the pointer finds the nearest value, and how the arrow keys walk them
  axis?: Axis;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const on = useRef<HTMLElement | null>(null);
  const outside = useRef<(() => void) | null>(null);
  const tapped = useRef(false);
  const hydrated = useHydrated();

  const show = (item: HTMLElement | null) => {
    const el = root.current;
    const t = tip.current;
    if (!el || !t) return;
    if (on.current && on.current !== item) on.current.removeAttribute("data-on");
    on.current = item;
    if (!item) {
      t.removeAttribute("data-show");
      return;
    }
    item.setAttribute("data-on", "");
    const [what, value] = [t.children[0], t.children[1]];
    if (what) what.textContent = item.dataset.read ?? "";
    if (value) value.textContent = item.dataset.readValue ?? "";
    t.setAttribute("data-show", "");
    place(el, t, item);
  };

  const disarm = () => {
    outside.current?.();
    outside.current = null;
  };

  // The bars grow in the first time a third of the drawing is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!moving() || !("IntersectionObserver" in window)) {
      el.setAttribute("data-seen", "");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        grow(el);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // An edit redraws the values: the readout follows the one it names, or goes.
  useEffect(() => {
    const item = on.current;
    if (!item) return;
    show(root.current?.contains(item) ? item : null);
  });

  useEffect(() => () => outside.current?.(), []);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = root.current;
    if (!el || e.pointerType === "touch" || !el.hasAttribute("data-seen")) return;
    const item = nearest(el, axis, e.clientX, e.clientY, e.target);
    if (item !== on.current) show(item);
  };

  // A tap (not a scroll that starts on the drawing) names a value and keeps it named until a
  // tap elsewhere. A mouse needs no tap: hovering names it.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    tapped.current = e.pointerType !== "mouse";
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = root.current;
    if (!el || !tapped.current || !el.hasAttribute("data-seen")) return;
    show(nearest(el, axis, e.clientX, e.clientY, e.target));
    if (outside.current) return;
    const away = (ev: Event) => {
      if (ev.target instanceof Node && el.contains(ev.target)) return;
      show(null);
      disarm();
    };
    document.addEventListener("pointerdown", away, true);
    outside.current = () => document.removeEventListener("pointerdown", away, true);
  };

  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" && document.activeElement !== root.current) show(null);
  };

  // Keyboard focus (not a click) starts on the first value, or the one marked to start on.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const el = root.current;
    if (!el || e.target !== el) return;
    let keyboard = true;
    try {
      keyboard = el.matches(":focus-visible");
    } catch {
      // a browser without :focus-visible: treat focus as the keyboard's
    }
    if (keyboard && !on.current) show(start(readables(el)) ?? null);
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target !== root.current) return;
    show(null);
    disarm();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = root.current;
    if (!el || e.target !== el) return;
    if (e.key === "Escape") {
      if (!on.current) return;
      e.preventDefault();
      show(null);
      return;
    }
    const items = readables(el);
    const cur = on.current && items.includes(on.current) ? on.current : null;
    const next = step(items, axis, cur, e.key);
    if (next === undefined) return;
    e.preventDefault();
    show(next);
  };

  return (
    <div
      ref={root}
      data-bars=""
      role={role}
      aria-label={label}
      tabIndex={hydrated ? 0 : undefined}
      className={cx("calc-chart", className)}
      style={style}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {children}
      <span ref={tip} aria-hidden="true" className="calc-tip print:hidden">
        <span className="type-label text-muted" />
        <span className="type-data text-text" />
      </span>
    </div>
  );
}
