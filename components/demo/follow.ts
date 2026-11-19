// The rules ChatFollow (./chat-follow.tsx) keeps when it scrolls the chat's window, as pure
// functions, so they are tested without a browser (__tests__/demo-llc.test.ts). Nothing here
// reads the page.

/** What one batch of the motion kit's writes says, as ChatFollow read it. */
export type FollowFacts = {
  /** The run started again: the root went back to pencil, or the first message took its pencil (a replay, a still). */
  restart: boolean;
  /** The root's data-seq-state became "done". */
  finished: boolean;
  /** The kit marked that end as one it was asked for (data-seq-snap): by input, by focus before the run began, by printing. */
  snapped: boolean;
  /** A click or a key press inside the drawing, outside its controls, came just before. */
  recentInput: boolean;
  /** The window is following the run: the reader has not scrolled it back. */
  follow: boolean;
  /** The furthest message that inked in this batch, as an index into the window's steps; -1 for none. */
  inked: number;
  /** How many steps the window holds. */
  steps: number;
};

export type FollowMove =
  | { to: "none" }
  | { to: "top" }
  | { to: "end" }
  /** Bring a step into view; `fromTop` when the window is going back to the top in the same turn. */
  | { to: "step"; index: number; fromTop: boolean };

/**
 * What the window does after a batch of writes, and whether it follows from then on:
 *   - the run ends: to the end when the reader ended it with a click or a key press, or when
 *     it played out while the window was following; otherwise it stays;
 *   - the run starts again: it follows again, from the top;
 *   - a message inks while it follows: the step after it comes into view (the last step
 *     stays in view).
 */
export function followMove(f: FollowFacts): { move: FollowMove; follow: boolean } {
  if (f.finished) {
    const byReader = f.snapped && f.recentInput;
    return { move: byReader || (!f.snapped && f.follow) ? { to: "end" } : { to: "none" }, follow: f.follow };
  }
  const follow = f.restart || f.follow;
  if (follow && f.inked >= 0 && f.steps > 0) {
    return { move: { to: "step", index: Math.min(f.inked + 1, f.steps - 1), fromTop: f.restart }, follow };
  }
  return { move: f.restart ? { to: "top" } : { to: "none" }, follow };
}

/**
 * Where the window scrolls to bring a box into view, in the window's content coordinates:
 * its bottom when it is below the window (never so far that its top leaves), its top when it
 * is above. Null when it is in view already. `from` is the window's scroll position, `view`
 * its height, `margin` the room kept around the box.
 */
export function revealTop(box: { top: number; bottom: number }, from: number, view: number, margin = 16): number | null {
  if (box.bottom + margin > from + view) return Math.max(0, Math.min(box.top - margin, box.bottom + margin - view));
  if (box.top - margin < from) return Math.max(0, box.top - margin);
  return null;
}

/** A scroll back by the reader: a wheel turned up, or a finger drawn down more than 8 px. */
export const scrollsBack = (deltaY: number) => deltaY < 0;
export const dragsBack = (fromY: number, toY: number) => toY - fromY > 8;
