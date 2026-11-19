import type { EaseName, PlanInput, StepInput } from "./plan";
import type { MotionTokens } from "./tokens";

// The choreographies: how a sequence's steps become a plan. One generic rule ("ink the
// steps in DOM order": draw a step's strokes, then flip it from pencil to ink) and four
// named ones built on it, each a timing table keyed by the step's role, the value of its
// data-seq-step attribute. Pure: a list of raw steps and the tokens in, a PlanInput out.
// The numbers here are the timing tables docs/MOTION.md prints; __tests__/motion-plan.test.ts
// pins their totals. Times are milliseconds.

/** What starts a sequence: it comes half into view, or a person presses its Play control. */
export type SeqStart = "view" | "user";

/** One [data-draw] element of a step, as read from the page. */
export type RawDraw = {
  ms: number | null; // data-draw-ms
  ease?: EaseName | null; // data-draw-ease
};

/** One [data-seq-step] element, as read from the page. */
export type RawStep = {
  role: string; // the value of data-seq-step; "" when it has none
  draws: RawDraw[]; // its visible [data-draw] elements, in DOM order
  hold: number | null; // data-seq-hold
  drawMs: number | null; // data-seq-draw: every stroke of this step
  at: number | null; // data-seq-at: where the trace line stands when it reaches this step
};

export type Choreography = {
  name: string;
  start: SeqStart;
  /** Whether a reader who asked for less motion is offered Previous and Next. */
  stepThrough: boolean;
  /** How its controls name it: "Replay the handoff", "Play this scene". */
  label: string;
  resolve(steps: RawStep[], t: MotionTokens): PlanInput;
};

export type RoleTiming = {
  /** Each stroke of the step, unless the markup says otherwise. */
  draw: number;
  /** How its strokes ease; "out" when left out. */
  ease?: EaseName;
  ink: StepInput["ink"];
  settle: number;
  hold: number;
  advance: number | null;
};

function stepFrom(raw: RawStep, timing: RoleTiming, stop: number): StepInput {
  return {
    draws: raw.draws.map((d) => ({ ms: d.ms ?? raw.drawMs ?? timing.draw, ease: d.ease ?? timing.ease ?? "out" })),
    ink: timing.ink,
    settle: timing.settle,
    hold: raw.hold ?? timing.hold,
    advance: timing.advance,
    stop,
  };
}

/**
 * The stop each step belongs to in a step-through. A leading role (a connector) opens the
 * stop of the step after it; a trailing role (a detail) stays in the stop before it; every
 * other step is a stop of its own.
 */
export function assignStops(roles: readonly string[], leading: readonly string[], trailing: readonly string[] = []): number[] {
  let stop = -1;
  let opened = false; // a leading step has opened the stop the next plain step joins
  return roles.map((role) => {
    if (leading.includes(role)) {
      if (!opened) stop += 1;
      opened = true;
    } else if (trailing.includes(role) && stop >= 0 && !opened) {
      // stays in the stop before it
    } else if (opened) {
      opened = false;
    } else {
      stop += 1;
    }
    return stop;
  });
}

// ---------- The generic rule ----------

/** A plain step and a connector, for any sequence without a table of its own. */
export function stepsTiming(t: MotionTokens): Record<"step" | "connector", RoleTiming> {
  return {
    step: { draw: t.dur3, ink: "after", settle: t.dur2, hold: t.dur1, advance: null },
    // A connector draws straight into the step it leads to: it inks as its line arrives, and nothing waits for that.
    connector: { draw: t.dur3, ease: "inout", ink: "after", settle: 0, hold: 0, advance: null },
  };
}

const steps: Choreography = {
  name: "steps",
  start: "view",
  stepThrough: true,
  label: "the sequence",
  resolve(raw, t) {
    const timing = stepsTiming(t);
    const stops = assignStops(raw.map((s) => s.role), ["connector"]);
    return {
      lead: 300,
      tail: 0,
      steps: raw.map((s, i) => stepFrom(s, s.role === "connector" ? timing.connector : timing.step, stops[i] ?? i)),
    };
  },
};

// ---------- M1: the handoff ----------

export type HandoffRole = "own" | "reach" | "tried" | "refused" | "cross" | "person" | "record";

/**
 * The handoff, about five seconds with the pauses where a person reads:
 *   own      the agent's step inks, after its check stroke draws; a beat
 *   reach    the connector draws to the next step: the agent reaches the person's step
 *   tried    that step inks: the agent tries it
 *   refused  the cloud is drawn around it, then "Refused." and the reason set; a beat long
 *            enough to read the reason
 *   cross    the connector crosses the property line to the person's position
 *   person   the cut-corner mark inks
 *   record   the line to sign on is drawn and the record sets
 * A drawing may leave "tried" out; the refusal then inks the whole step after its cloud.
 */
export function handoffTiming(t: MotionTokens): Record<HandoffRole, RoleTiming> {
  return {
    own: { draw: t.dur3, ink: "after", settle: t.dur2, hold: 250, advance: null },
    reach: { draw: 400, ease: "inout", ink: "after", settle: 0, hold: 0, advance: null },
    tried: { draw: t.dur3, ink: "after", settle: t.dur2, hold: 150, advance: null },
    refused: { draw: t.dur4 * 1.5, ease: "inout", ink: "after", settle: t.dur2, hold: 1000, advance: null },
    cross: { draw: 450, ease: "inout", ink: "after", settle: 0, hold: 0, advance: null },
    person: { draw: t.dur3, ink: "after", settle: t.dur2, hold: 150, advance: null },
    record: { draw: t.dur3, ink: "after", settle: t.dur2, hold: 0, advance: null },
  };
}

const handoff: Choreography = {
  name: "handoff",
  start: "view",
  stepThrough: true,
  label: "the handoff",
  resolve(raw, t) {
    const table: Record<string, RoleTiming> = handoffTiming(t);
    const fallback = stepsTiming(t).step;
    // Three stops, the three positions: the agent's step; the refusal; the person's record.
    const stops = assignStops(raw.map((s) => s.role), ["reach", "tried", "cross"], ["record"]);
    return { lead: 300, tail: 0, steps: raw.map((s, i) => stepFrom(s, table[s.role] ?? fallback, stops[i] ?? i)) };
  },
};

// ---------- M2: the order-of-work trace ----------

export const TRACE = {
  lead: 200,
  /** The line's whole travel, shared between the stages by how far apart they sit. */
  travel: 1200,
  /** The shortest a stage's stroke may be, so a short hop is still seen. */
  minStroke: 60,
  /** The beat the line holds at a person's card, and the most all the beats may add up to. */
  hold: 300,
  holdBudget: 800,
} as const;

const trace: Choreography = {
  name: "trace",
  start: "view",
  stepThrough: true,
  label: "the order of work",
  resolve(raw, t) {
    const n = raw.length;
    const people = raw.filter((s) => s.role === "person").length;
    const hold = people > 0 ? Math.min(TRACE.hold, TRACE.holdBudget / people) : 0;
    let prev = 0;
    return {
      lead: TRACE.lead,
      tail: 0,
      steps: raw.map((s, i) => {
        // Where the line stands at this card: its data-seq-at, never behind the card before it;
        // evenly spaced when the markup gives none; the last card is the end of the line.
        const given = s.at ?? (i + 1) / n;
        const at = i === n - 1 ? 1 : Math.min(1, Math.max(prev, given));
        const person = s.role === "person";
        const stroke = at > prev ? Math.max(TRACE.minStroke, TRACE.travel * (at - prev)) : 0;
        const own = s.draws.map((d) => ({ ms: d.ms ?? s.drawMs ?? t.dur3, ease: d.ease ?? ("out" as const) }));
        const step: StepInput = {
          // A steady pen through the agent's cards; it eases to a stop at a person's card and at the end.
          draws: [{ ms: stroke, from: prev, to: at, ease: person || i === n - 1 ? "out" : "linear", target: "trace" }, ...own],
          ink: "after",
          settle: t.dur2,
          hold: s.hold ?? (person ? Math.max(0, hold - t.dur2) : 0),
          // The line does not wait for an agent's card to finish inking, unless the markup holds it there.
          advance: person || own.length > 0 || s.hold !== null ? null : stroke,
          stop: i,
        };
        prev = at;
        return step;
      }),
    };
  },
};

// ---------- M3: one scene of the run board ----------

export type SceneRole = "row" | "read" | "tried" | "refused" | "then";

/**
 * Rows ink in recorded order ("row"; "read" for a command that only reads). A refused row
 * is two steps: "tried" inks what the agent attempted, "refused" draws the cloud round it
 * and sets the refusal. "then" is the connector to the row where a person picks it up.
 */
export function sceneTiming(t: MotionTokens): Record<SceneRole, RoleTiming> {
  return {
    // Rows follow one another before the one above has finished inking.
    row: { draw: t.dur3, ink: "after", settle: t.dur2, hold: 0, advance: 140 },
    read: { draw: t.dur3, ink: "after", settle: t.dur2, hold: 0, advance: 90 },
    tried: { draw: t.dur3, ink: "after", settle: t.dur2, hold: 100, advance: null },
    refused: { draw: t.dur4, ease: "inout", ink: "after", settle: t.dur2, hold: 500, advance: null },
    then: { draw: t.dur3, ease: "inout", ink: "after", settle: 0, hold: 0, advance: null },
  };
}

const scene: Choreography = {
  name: "scene",
  start: "user",
  stepThrough: true,
  label: "this scene",
  resolve(raw, t) {
    const table: Record<string, RoleTiming> = sceneTiming(t);
    const stops = assignStops(raw.map((s) => s.role), ["then", "tried"]);
    return {
      lead: 150,
      tail: 0,
      steps: raw.map((s, i) => {
        const timing = table[s.role] ?? table.row ?? stepsTiming(t).step;
        const step = stepFrom(s, timing, stops[i] ?? i);
        // A row with a stroke of its own finishes it before the next row starts.
        return step.draws.length > 0 && s.role !== "then" ? { ...step, advance: null } : step;
      }),
    };
  },
};

// ---------- M4: the audit's score boxes ----------

export const SCORE = {
  /** The boxes ink by outcome, in this order; any other outcome follows, in DOM order. */
  order: ["clear", "finding", "unverified"],
  lead: 100,
  /** The whole sequence stays under this (DIRECTION: under 1.2 seconds). */
  budget: 1150,
  /** The most one box waits for the box before it. */
  stagger: 60,
  /** A box's stroke and fill. */
  box: 240,
} as const;

const score: Choreography = {
  name: "score",
  start: "view",
  stepThrough: false,
  label: "the score",
  resolve(raw, t) {
    const rank = (role: string) => {
      const i = (SCORE.order as readonly string[]).indexOf(role);
      return i === -1 ? SCORE.order.length : i;
    };
    const order = raw.map((_, i) => i).sort((a, b) => rank(raw[a]?.role ?? "") - rank(raw[b]?.role ?? "") || a - b);
    const ranks = [...new Set(order.map((i) => rank(raw[i]?.role ?? "")))];
    const beat = t.dur1; // between one outcome and the next
    const box = Math.max(SCORE.box, t.dur2);
    const room = SCORE.budget - SCORE.lead - box - (ranks.length - 1) * beat;
    const stagger = raw.length > 1 ? Math.min(SCORE.stagger, Math.max(0, room / (raw.length - 1))) : 0;
    const next = new Map<number, number>(); // step index -> the step that plays after it
    order.forEach((i, k) => {
      const after = order[k + 1];
      if (after !== undefined) next.set(i, after);
    });
    return {
      lead: SCORE.lead,
      tail: 0,
      order,
      steps: raw.map((s, i) => {
        const after = next.get(i);
        const lastOfOutcome = after !== undefined && rank(raw[after]?.role ?? "") !== rank(s.role);
        return {
          draws: s.draws.map((d) => ({ ms: d.ms ?? s.drawMs ?? box, ease: d.ease ?? ("out" as const) })),
          ink: "start",
          settle: t.dur2,
          hold: 0,
          advance: stagger + (lastOfOutcome ? beat : 0),
          stop: ranks.indexOf(rank(s.role)),
        };
      }),
    };
  },
};

// ---------- Lookup ----------

export const CHOREOGRAPHIES: Readonly<Record<string, Choreography>> = { steps, handoff, trace, scene, score };

/** The choreography a data-seq name asks for; the generic rule for any other name. */
export function choreographyFor(name: string): Choreography {
  return Object.hasOwn(CHOREOGRAPHIES, name) ? (CHOREOGRAPHIES[name] ?? steps) : steps;
}
