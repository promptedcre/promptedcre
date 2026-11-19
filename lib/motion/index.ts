// lib/motion: the motion kit's logic. docs/MOTION.md is the contract for page builders.
//
// This barrel holds the pure parts only (no DOM, no GSAP), so a server component, a test
// or a tool can import it. The browser parts are imported by path, and only from
// "use client" modules.
//   With the page (the enhancer's first load, about 4 KB gzipped):
//     ./controller  one sequence's life on a page (the enhancer's store)
//     ./dom         motion setting, in-view and input helpers, wiping a sequence's writes
//     ./loader      the one place GSAP is imported, always with import()
//   On demand, through the loader, when a sequence is about to play or be stepped through:
//     ./playback    the markup as a timeline, or as a thing to step through
//     ./read        reading a root's steps, drawables and tokens
//     ./player      a plan as a GSAP timeline
// To make a drawing playable, a page uses components/motion (SequenceRoot), not this.

export { DEFAULT_TOKENS, cubicBezier, parseBezier, parseTime, tokensFrom, type Bezier, type MotionTokens } from "./tokens";
export {
  planTimeline,
  traceAt,
  type DrawInput,
  type EaseName,
  type PlanInput,
  type PlannedDraw,
  type PlannedStep,
  type StepInput,
  type TimelinePlan,
} from "./plan";
export {
  CHOREOGRAPHIES,
  SCORE,
  TRACE,
  assignStops,
  choreographyFor,
  handoffTiming,
  sceneTiming,
  stepsTiming,
  type Choreography,
  type HandoffRole,
  type RawDraw,
  type RawStep,
  type RoleTiming,
  type SceneRole,
  type SeqStart,
} from "./choreographies";
export {
  VIEW,
  decideStart,
  motionFrom,
  shouldAutoPlay,
  stateFrom,
  viewVerdict,
  type Motion,
  type SeqState,
  type StartDecision,
  type StartFacts,
  type ViewVerdict,
} from "./decide";
export { PREPAINT_FAILSAFE_MS, PREPAINT_SCRIPT } from "./prepaint";
