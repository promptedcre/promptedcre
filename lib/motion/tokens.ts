// The motion tokens as numbers. CSS owns them (app/globals.css :root: --dur-1 to --dur-4,
// --ease-out, --ease-in-out); lib/motion reads them from the page when a sequence is built,
// so a timeline and a CSS transition always run on the same clock and the same curve.
// The defaults below are DIRECTION section 6's values, used only where there is no page to
// read (tests, the server) or a token is missing. Pure: no DOM here.

export type Bezier = readonly [x1: number, y1: number, x2: number, y2: number];

export type MotionTokens = {
  dur1: number; // ms, feedback
  dur2: number; // ms, state: the pencil-to-ink change
  dur3: number; // ms, layout: a short stroke
  dur4: number; // ms, authored
  easeOut: Bezier;
  easeInOut: Bezier;
};

export const DEFAULT_TOKENS: MotionTokens = {
  dur1: 120,
  dur2: 200,
  dur3: 320,
  dur4: 600,
  easeOut: [0.16, 1, 0.3, 1],
  easeInOut: [0.65, 0, 0.35, 1],
};

/** "120ms" or "0.2s" as milliseconds; null when it is neither. */
export function parseTime(value: string | null | undefined): number | null {
  const m = /^\s*(\d*\.?\d+)(ms|s)\s*$/i.exec(value ?? "");
  if (!m) return null;
  const n = Number(m[1]) * ((m[2] ?? "").toLowerCase() === "s" ? 1000 : 1);
  return Number.isFinite(n) ? n : null;
}

/** "cubic-bezier(0.16, 1, 0.3, 1)" as its four numbers; null when it is anything else. */
export function parseBezier(value: string | null | undefined): Bezier | null {
  const m = /^\s*cubic-bezier\(([^)]*)\)\s*$/i.exec(value ?? "");
  if (!m) return null;
  const parts = (m[1] ?? "").split(",").map((p) => Number(p.trim()));
  const [x1, y1, x2, y2] = parts;
  if (parts.length !== 4 || x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  if (parts.some((n) => !Number.isFinite(n))) return null;
  // The x values are times: outside 0 to 1 the curve is not a function of time.
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
  return [x1, y1, x2, y2];
}

/** The tokens, given a way to read a custom property ("--dur-2") as text. Missing ones keep their default. */
export function tokensFrom(read: (name: string) => string | null | undefined): MotionTokens {
  const d = DEFAULT_TOKENS;
  return {
    dur1: parseTime(read("--dur-1")) ?? d.dur1,
    dur2: parseTime(read("--dur-2")) ?? d.dur2,
    dur3: parseTime(read("--dur-3")) ?? d.dur3,
    dur4: parseTime(read("--dur-4")) ?? d.dur4,
    easeOut: parseBezier(read("--ease-out")) ?? d.easeOut,
    easeInOut: parseBezier(read("--ease-in-out")) ?? d.easeInOut,
  };
}

/**
 * A CSS cubic-bezier() as a function of progress (0 to 1), so a GSAP tween eases on the
 * very curve the tokens name. Newton's method on x(t), bisection when the slope is flat.
 */
export function cubicBezier([x1, y1, x2, y2]: Bezier): (progress: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeAt = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solve = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = xAt(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const slope = slopeAt(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= err / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
      if (xAt(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (progress: number) => {
    if (!(progress > 0)) return 0;
    if (progress >= 1) return 1;
    return yAt(solve(progress));
  };
}
