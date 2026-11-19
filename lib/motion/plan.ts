// The timeline plan: a list of step descriptors in, the time of every stroke and every
// pencil-to-ink change out. Pure arithmetic in milliseconds, so it is tested without a
// browser and without GSAP; lib/motion/player.ts turns a plan into a GSAP timeline, and the
// step-through control (reduced motion) reads the same plan's stops.

/**
 * How a stroke eases. "out" is the --ease-out token: right for a short stroke (a check, a
 * rule). "inout" is the --ease-in-out token: for a long stroke (a cloud, a connector), which
 * an exponential ease-out would draw nine tenths of in its first third, so that it appears
 * rather than being drawn. "linear" is a steady pen, for a line that passes through.
 */
export type EaseName = "out" | "inout" | "linear";

/** One thing a step draws: a [data-draw] element of its own, or the shared trace line. */
export type DrawInput = {
  ms: number;
  /** --draw at the start and the end of the stroke. 0 to 1 by default. */
  from?: number;
  to?: number;
  ease?: EaseName;
  /** "own": the step's nth drawable. "trace": the root's one [data-seq-trace] element. */
  target?: "own" | "trace";
};

export type StepInput = {
  /** Drawn one after another, in this order. */
  draws: DrawInput[];
  /** When the step's data-inked flips: after its strokes, as they start, or never. */
  ink: "after" | "start" | "none";
  /** How long the ink change takes on screen (--dur-2). The next step waits for it. */
  settle: number;
  /** A reading pause after the ink has settled. */
  hold: number;
  /** Set to overlap: the next step starts this long after this one starts, whatever this one still has to do. */
  advance: number | null;
  /** Which stop the step belongs to when a person steps through instead of watching. */
  stop: number;
};

export type PlanInput = {
  /** A beat before the first step, so the penciled drawing is seen. */
  lead: number;
  /** Time added after the last change. */
  tail: number;
  steps: StepInput[];
  /** The order the steps play in, as indexes into `steps`. DOM order when left out. */
  order?: number[];
};

export type PlannedDraw = {
  step: number;
  /** For "own": the index among the step's drawables. Always 0 for "trace". */
  draw: number;
  target: "own" | "trace";
  start: number;
  duration: number;
  from: number;
  to: number;
  ease: EaseName;
};

export type PlannedStep = {
  /** Index into the input's steps (the DOM order). */
  index: number;
  start: number;
  /** When data-inked flips; null for a step that inks nothing. */
  inkAt: number | null;
  /** When the step has drawn, inked and settled. */
  settled: number;
  /** `settled` plus the step's hold: when the next step starts, unless this one overlaps. */
  end: number;
  draws: PlannedDraw[];
};

export type TimelinePlan = {
  /** In play order. */
  steps: PlannedStep[];
  /** The whole sequence, lead and tail included. */
  total: number;
  /** Step indexes grouped into stops, in play order, for the step-through control. */
  stops: number[][];
};

const ms = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
const unit = (n: number | undefined, fallback: number): number => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback);

/** The play order: `order` when it is a full permutation of the steps, DOM order otherwise. */
function playOrder(input: PlanInput): number[] {
  const n = input.steps.length;
  const dom = Array.from({ length: n }, (_, i) => i);
  const { order } = input;
  if (!order || order.length !== n) return dom;
  const seen = new Set(order);
  if (seen.size !== n || order.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) return dom;
  return order;
}

export function planTimeline(input: PlanInput): TimelinePlan {
  const order = playOrder(input);
  const steps: PlannedStep[] = [];
  const stops = new Map<number, number[]>();
  let cursor = ms(input.lead);
  let last = cursor;

  for (const index of order) {
    const step = input.steps[index];
    if (!step) continue;
    const start = cursor;
    let t = start;
    let own = 0;
    const draws: PlannedDraw[] = step.draws.map((d) => {
      const target = d.target ?? "own";
      const planned: PlannedDraw = {
        step: index,
        draw: target === "own" ? own++ : 0,
        target,
        start: t,
        duration: ms(d.ms),
        from: unit(d.from, 0),
        to: unit(d.to, 1),
        ease: d.ease ?? "out",
      };
      t += planned.duration;
      return planned;
    });
    const drawn = t;
    const inkAt = step.ink === "none" ? null : step.ink === "start" ? start : drawn;
    const settled = Math.max(drawn, inkAt === null ? start : inkAt + ms(step.settle));
    const end = settled + ms(step.hold);
    steps.push({ index, start, inkAt, settled, end, draws });
    last = Math.max(last, settled);
    cursor = step.advance === null ? end : start + ms(step.advance);
    const group = stops.get(step.stop);
    if (group) group.push(index);
    else stops.set(step.stop, [index]);
  }

  return {
    steps,
    // The hold after the last step is nobody's reading time: the sequence ends when the last change has settled.
    total: last + ms(input.tail),
    stops: [...stops.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group),
  };
}

/**
 * Where the shared trace line stands at a stop of the step-through: the `to` of the last
 * trace stroke among the stops up to and including `stop` (0-based). Null when the plan
 * has no trace.
 */
export function traceAt(plan: TimelinePlan, stop: number): number | null {
  const shown = new Set(plan.stops.slice(0, stop + 1).flat());
  let at: number | null = null;
  let any = false;
  for (const step of plan.steps) {
    for (const d of step.draws) {
      if (d.target !== "trace") continue;
      any = true;
      if (shown.has(step.index)) at = Math.max(at ?? 0, d.to);
    }
  }
  return any ? (at ?? 0) : null;
}
