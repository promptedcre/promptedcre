import { choreographyFor, planTimeline, type MotionTokens, type RawStep } from "@/lib/motion";

// Where each stop of a scene's board sits in its timeline, so the stepper on /run (SceneStepper,
// run-enhance.tsx) can hold the board at it with the motion kit's own seq:seek event. Pure: the
// raw steps (as lib/motion/read.ts reads them off the board) and the page's motion tokens in,
// the stops out, from the same choreography ("scene", M3) and the same plan the kit plays.
//
// A stop is what one press of Next shows: the kit's own grouping (a connector, or what the
// agent tried, goes with the step after it). It is held one millisecond after its last change
// lands: the last of its steps has inked and its last stroke has been drawn, and the next stop
// has not begun (a row that follows another starts 140 ms after it, so it never has).

export type SceneStop = {
  /** The time, in ms, to hold the board at. */
  at: number;
  /** The steps this stop shows, as indexes into the raw steps (DOM order). */
  steps: number[];
};

export function sceneStops(raw: RawStep[], tokens: MotionTokens): SceneStop[] {
  const plan = planTimeline(choreographyFor("scene").resolve(raw, tokens));
  const planned = new Map(plan.steps.map((s) => [s.index, s]));
  return plan.stops.map((group) => {
    let at = 0;
    for (const index of group) {
      const step = planned.get(index);
      if (!step) continue;
      const drawn = step.draws.reduce((end, d) => Math.max(end, d.start + d.duration), step.start);
      at = Math.max(at, step.inkAt ?? step.start, drawn);
    }
    return { at: at + 1, steps: group };
  });
}

/** The stop a press moves to, from `at` (-1 before the first): one on or back, within the stops. */
export function nextStop(at: number, count: number, by: 1 | -1): number {
  if (count === 0) return -1;
  return Math.min(count - 1, Math.max(0, at + by));
}
