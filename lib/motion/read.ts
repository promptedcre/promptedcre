import type { RawStep } from "./choreographies";
import { allSteps, owns, type SeqElement } from "./dom";
import type { EaseName } from "./plan";
import { tokensFrom, type MotionTokens } from "./tokens";

// Reading the markup contract (docs/MOTION.md) off a root: its steps, what each draws, the
// hints on them, and the page's motion tokens. Browser only, and not needed until a
// sequence is about to play or be stepped through: it arrives with lib/motion/playback.ts.

export type StepDom = { el: SeqElement; draws: SeqElement[] };

/** The steps a timeline plays: the visible ones, in DOM order, with what each draws. */
export type SeqDom = { steps: StepDom[]; raw: RawStep[]; trace: SeqElement | null };

/** The motion tokens as the page declares them, read off the root. */
export function readTokens(root: Element): MotionTokens {
  const style = getComputedStyle(root);
  return tokensFrom((name) => style.getPropertyValue(name));
}

const isSeqElement = (el: Element): el is SeqElement => el instanceof HTMLElement || el instanceof SVGElement;

// An element laid out on the page: not display:none, and not inside something that is.
const isShown = (el: Element): boolean => el.getClientRects().length > 0;

const numberAttr = (el: Element, name: string): number | null => {
  const value = el.getAttribute(name);
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const easeAttr = (el: Element): EaseName | null => {
  const value = el.getAttribute("data-draw-ease");
  return value === "out" || value === "inout" || value === "linear" ? value : null;
};

function traceOf(root: Element): SeqElement | null {
  const el = [...root.querySelectorAll("[data-seq-trace]")].find((t) => owns(root, t) && isShown(t));
  return el && isSeqElement(el) ? el : null;
}

/**
 * What a step draws, in order: the drawable around it, when the step claims one
 * (data-seq-draws="around": the nearest ancestor with data-draw, such as a revision cloud
 * that wraps the step it circles); itself, when it is a drawable; and the drawables inside
 * it. Never the trace line.
 */
function drawsOf(root: Element, step: SeqElement): SeqElement[] {
  const around = step.getAttribute("data-seq-draws") === "around" ? step.parentElement?.closest("[data-draw]") : null;
  const inside = [...step.querySelectorAll("[data-draw]")];
  const all = [...(around ? [around] : []), ...(step.hasAttribute("data-draw") ? [step] : []), ...inside];
  return all.filter((el): el is SeqElement => isSeqElement(el) && owns(root, el) && !el.hasAttribute("data-seq-trace") && isShown(el));
}

/**
 * The root as the choreographies read it. A step that is not laid out (the other half of
 * a responsive pair, a variant the page hides) takes no part and takes no time.
 */
export function readSequence(root: Element): SeqDom {
  const steps: StepDom[] = [];
  const raw: RawStep[] = [];
  for (const el of allSteps(root)) {
    if (!isShown(el)) continue;
    const draws = drawsOf(root, el);
    steps.push({ el, draws });
    raw.push({
      role: (el.getAttribute("data-seq-step") ?? "").trim(),
      draws: draws.map((d) => ({ ms: numberAttr(d, "data-draw-ms"), ease: easeAttr(d) })),
      hold: numberAttr(el, "data-seq-hold"),
      drawMs: numberAttr(el, "data-seq-draw"),
      at: numberAttr(el, "data-seq-at"),
    });
  }
  return { steps, raw, trace: traceOf(root) };
}
