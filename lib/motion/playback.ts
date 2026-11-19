import { choreographyFor } from "./choreographies";
import { allSteps, type SeqElement } from "./dom";
import type { Gsap } from "./loader";
import { planTimeline, traceAt } from "./plan";
import { buildTimeline, type Player } from "./player";
import { readSequence, readTokens } from "./read";

// Everything a sequence needs once it is going to play, or to be stepped through: reading
// the markup, the choreographies, the plan, the timeline. None of it is in a page's first
// load: lib/motion/loader.ts fetches this module (loadPlayback) alongside GSAP when a
// sequence nears the viewport or is asked to play, and by itself when a reader who asked
// for less motion presses "Step through". Browser only.

const choreographyOf = (root: Element) => choreographyFor(root.getAttribute("data-seq") ?? "");

/**
 * Makes the root ready to play: reads its steps, plans them, hands the pencil from the
 * root to each step (data-inked="false"), and builds the timeline, paused at its start.
 * The caller then takes data-inked off the root, in the same turn, so nothing is seen to
 * change. Null when the root has no step that is laid out: there is nothing to play.
 */
export function preparePlayback(gsap: Gsap, root: SeqElement, onComplete: () => void): Player | null {
  const dom = readSequence(root);
  if (dom.steps.length === 0) return null;
  const tokens = readTokens(root);
  const plan = planTimeline(choreographyOf(root).resolve(dom.raw, tokens));
  for (const step of allSteps(root)) step.setAttribute("data-inked", "false");
  return buildTimeline(gsap, plan, dom, tokens, onComplete);
}

export type Stepper = {
  /** How many stops the sequence has. */
  stops: number;
  /** Shows the drawing as it stands after `count` stops: those inked, the rest in pencil. No GSAP, no travel. */
  show(count: number): void;
};

/** The same plan as a thing to step through, for a reader who asked for less motion. Null when there is nothing to step. */
export function prepareStepper(root: SeqElement): Stepper | null {
  const dom = readSequence(root);
  if (dom.steps.length === 0) return null;
  const plan = planTimeline(choreographyOf(root).resolve(dom.raw, readTokens(root)));
  return {
    stops: plan.stops.length,
    show(count) {
      plan.stops.forEach((group, g) => {
        for (const index of group) {
          const el = dom.steps[index]?.el;
          if (!el) continue;
          if (g < count) el.removeAttribute("data-inked");
          else el.setAttribute("data-inked", "false");
        }
      });
      // The trace line stands where the last stop shown left it.
      const at = traceAt(plan, count - 1);
      if (dom.trace && at !== null) dom.trace.style.setProperty("--draw", String(at));
    },
  };
}
