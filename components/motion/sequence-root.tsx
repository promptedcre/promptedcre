import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { choreographyFor, type SeqStart } from "@/lib/motion/choreographies";
import { PrePaintScript, SequenceEnhancer } from "./sequence-enhancer";
import { SequenceStyles } from "./sequence-styles";

// SequenceRoot: wraps a drawing so it can be inked in sequence. A server component. Its
// children are ordinary server-rendered markup, the finished drawing, and with scripts off
// that is all there is. docs/MOTION.md is the contract for what goes inside.
//
// It renders, in this order: the pre-paint script (only for a sequence that plays by
// itself), the children, and the enhancer's own element. So the root's first and last
// child are not the builder's: lay the drawing out in an element of your own inside the
// root rather than styling the root's direct children by position.

type RootTag = "div" | "figure" | "section" | "article" | "ol" | "ul";

type SequenceRootProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /**
   * The choreography, and the root's data-seq: "handoff" (M1), "trace" (M2), "scene" (M3),
   * "score" (M4), or "steps" for the generic rule. Any other name plays as "steps".
   */
  name: string;
  /** The root's element. A div unless the drawing is a figure, a list and so on. */
  as?: RootTag;
  /**
   * "view": plays once when half of it is in view. "user": waits for its Play control.
   * Each choreography has its own default ("scene" is "user", the others "view").
   */
  start?: SeqStart;
  /** What the controls call it: "Replay the handoff", "Play this scene". Lower case, with its article. */
  label?: string;
  /** Offer Previous and Next to a reader who asked for less motion. Each choreography has its own default. */
  stepThrough?: boolean;
  children: ReactNode;
};

export function SequenceRoot({ name, as = "div", start, label, stepThrough, children, ...rest }: SequenceRootProps) {
  const Tag: ElementType = as;
  const choreography = choreographyFor(name);
  const begins = start ?? choreography.start;
  return (
    // The pre-paint script and the enhancer write data-seq-state and data-inked on this
    // element before and after hydration; React is told not to mind.
    <Tag {...rest} data-seq={name} data-seq-start={begins} suppressHydrationWarning>
      <SequenceStyles />
      {begins === "view" && <PrePaintScript />}
      {children}
      <SequenceEnhancer label={label ?? choreography.label} stepThrough={stepThrough ?? choreography.stepThrough} />
    </Tag>
  );
}

// SequenceControls: where the sequence's controls go (Replay, and Pause while it plays;
// Play for a sequence a person starts; Previous and Next under reduced motion). Put one
// anywhere inside a SequenceRoot. With none, the controls render at the end of the root.
// Empty, and not displayed, until the enhancer has something to offer; never shown in print.
export function SequenceControls({ className }: { className?: string }) {
  return <span data-seq-controls="" className={className ? `seq-slot ${className}` : "seq-slot"} />;
}
