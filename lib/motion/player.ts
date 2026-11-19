import type { SeqElement } from "./dom";
import type { Gsap } from "./loader";
import type { TimelinePlan } from "./plan";
import type { SeqDom } from "./read";
import { cubicBezier, type MotionTokens } from "./tokens";

// A plan as a GSAP timeline. GSAP owns time and nothing else: it tweens one custom
// property (--draw, 0 to 1) on a drawable and flips one attribute (data-inked) on a step.
// What a drawable or a step looks like at any value is CSS's business. GSAP is handed in
// (lib/motion/loader.ts fetched it); this file imports only its types.

export type Player = {
  play(): void;
  pause(): void;
  resume(): void;
  /** Holds the timeline at a time in ms: a still of the sequence, for a screenshot or a test. */
  seek(ms: number): void;
  kill(): void;
  /** The whole timeline in ms. */
  duration: number;
};

export function buildTimeline(gsap: Gsap, plan: TimelinePlan, dom: SeqDom, tokens: MotionTokens, onComplete: () => void): Player {
  // The page's own curves, so a stroke and a CSS transition ease alike. "none" is GSAP's linear.
  const eases = { out: cubicBezier(tokens.easeOut), inout: cubicBezier(tokens.easeInOut), linear: "none" } as const;
  const timeline = gsap.timeline({ paused: true, onComplete });
  const started = new Set<SeqElement>();

  for (const step of plan.steps) {
    const stepDom = dom.steps[step.index];
    if (!stepDom) continue;
    for (const d of step.draws) {
      const target = d.target === "trace" ? dom.trace : stepDom.draws[d.draw];
      if (!target) continue;
      // The first stroke on an element renders its start at once, so nothing is drawn before its turn.
      const first = !started.has(target);
      started.add(target);
      timeline.fromTo(
        target,
        { "--draw": d.from },
        { "--draw": d.to, duration: d.duration / 1000, ease: eases[d.ease], immediateRender: first },
        d.start / 1000,
      );
    }
    if (step.inkAt !== null) {
      timeline.set(stepDom.el, { attr: { "data-inked": "true" }, immediateRender: false }, step.inkAt / 1000);
    }
  }

  // The plan's end is when the last ink change has settled on screen, which is later than GSAP's last tween.
  const pad = plan.total / 1000 - timeline.duration();
  if (pad > 0) timeline.to({}, { duration: pad }, timeline.duration());

  return {
    play: () => void timeline.play(),
    pause: () => void timeline.pause(),
    resume: () => void timeline.resume(),
    seek: (ms) => void timeline.pause(Math.min(Math.max(0, ms / 1000), timeline.duration())),
    kill: () => void timeline.kill(),
    duration: timeline.duration() * 1000,
  };
}
