import type { SeqStart } from "./choreographies";

// The decisions a sequence makes, as pure functions of what is true on the page, so each
// one is tested without a browser: whether it may play by itself, whether it may be put
// in pencil first, and whether it is in view enough to run.

export type Motion = "full" | "reduced";

/** A root's data-seq-state. Absent (null) is the server's HTML: the finished drawing. */
export type SeqState = "penciled" | "playing" | "paused" | "stepping" | "done" | null;

/** html[data-motion] when the layout's script set it; the media query when it did not. */
export function motionFrom(attribute: string | null | undefined, prefersReduced: boolean): Motion {
  if (attribute === "full" || attribute === "reduced") return attribute;
  return prefersReduced ? "reduced" : "full";
}

export function stateFrom(attribute: string | null | undefined): SeqState {
  return attribute === "penciled" || attribute === "playing" || attribute === "paused" || attribute === "stepping" || attribute === "done" ? attribute : null;
}

export type StartFacts = {
  /** Scripts run. False only for a reader with scripts off, who never reaches this code; it is here so the rule is whole. */
  scripts: boolean;
  motion: Motion;
  start: SeqStart;
  /** As found when the enhancer mounts: "penciled" when the root's pre-paint script ran with full motion. */
  state: SeqState;
  /** The enhancer is hydrating HTML the browser may already have painted, rather than mounting on a client-side navigation before the first paint. */
  hydrating: boolean;
  /** Any part of the root is in the viewport right now. */
  inView: boolean;
};

export type StartDecision = {
  /**
   * auto: plays once when it comes half into view. manual: waits for its Play control.
   * still: reduced motion, the finished drawing and at most a step-through.
   * seen: the finished drawing is already on screen (or it has played); it never plays by itself, Replay is offered.
   * off: nothing runs.
   */
  mode: "auto" | "manual" | "still" | "seen" | "off";
  /** Put the root in pencil now. Only ever true where nobody has seen it inked. */
  pencil: boolean;
};

/**
 * The rule for the start of a sequence.
 *
 * A drawing a reader is looking at never changes under them. So a sequence is put in
 * pencil only (a) by its pre-paint script, before the browser has drawn it, (b) on a
 * client-side navigation, in a layout effect before the first paint of the new page, or
 * (c) while no part of it is in the viewport. Anywhere else it stays as the server drew
 * it, finished, and waits for Replay.
 */
export function decideStart(f: StartFacts): StartDecision {
  if (!f.scripts) return { mode: "off", pencil: false };
  if (f.motion === "reduced") return { mode: "still", pencil: false };
  if (f.start === "user") return { mode: "manual", pencil: false };
  // Already inked this page view: it played, a reader's input ended it, or the pre-paint script's own timer gave up on us.
  if (f.state === "done") return { mode: "seen", pencil: false };
  // In pencil already (the pre-paint script, or an earlier mount of this enhancer).
  if (f.state !== null) return { mode: "auto", pencil: false };
  // Server HTML, finished, and the pre-paint script did not put it in pencil: this is a
  // client-side navigation (inline scripts do not run there; nothing is painted yet), or
  // the script was blocked and the browser may have painted the drawing in ink.
  if (!f.hydrating) return { mode: "auto", pencil: true };
  if (!f.inView) return { mode: "auto", pencil: true };
  return { mode: "seen", pencil: false };
}

/** Whether a sequence plays by itself: scripts on, full motion, started by coming into view, and not yet seen inked. */
export function shouldAutoPlay(f: StartFacts): boolean {
  return decideStart(f).mode === "auto";
}

// ---------- In view ----------

export const VIEW = {
  /** Start, or carry on, when half of the root is in view, or the root fills half of the viewport (a root taller than the screen). */
  enter: 0.5,
  /** Pause below this. The gap between the two keeps a root on the edge from stuttering. */
  leave: 0.2,
} as const;

export type ViewVerdict = "in" | "between" | "out";

/**
 * @param ratio how much of the root is visible, 0 to 1
 * @param visible the visible height in px
 * @param viewport the viewport's height in px
 */
export function viewVerdict(ratio: number, visible: number, viewport: number): ViewVerdict {
  const fill = viewport > 0 ? visible / viewport : 0;
  if (ratio >= VIEW.enter || fill >= VIEW.enter) return "in";
  if (ratio < VIEW.leave && fill < VIEW.leave) return "out";
  return "between";
}
