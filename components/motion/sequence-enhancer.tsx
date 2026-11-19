"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createSequenceStore, type SequenceStore, type SequenceUi } from "@/lib/motion/controller";
import { PREPAINT_SCRIPT } from "@/lib/motion/prepaint";

// The client half of a sequence, mounted by SequenceRoot. It is small on purpose: it holds
// no GSAP and none of the code that builds a timeline (lib/motion/loader.ts fetches both
// when the sequence is about to play), draws nothing of the drawing itself (that is the
// server's markup), and renders only the controls. Everything it decides lives in
// lib/motion/controller.ts.

const never = () => () => {};
const onClient = () => false;
const onServer = () => true;

// The site's outlined button (app/globals.css .btn), held at 44 px at every width; seq-btn is only a hook.
const BUTTON = "btn btn--secondary min-h-11 seq-btn";

type Labels = {
  /** What the sequence is called in its controls: "the handoff", "this scene". */
  label: string;
};

// One button carries the key "primary" through every phase, so it stays the same element
// from Pause to Resume to Replay, and from "Step through" to "Next step": keyboard focus
// stays where the reader put it.
function Controls({ ui, store, label }: { ui: SequenceUi; store: SequenceStore } & Labels) {
  // A reader who asked for less motion: no playback. Where the steps are worth it, Previous and Next.
  if (ui.phase === "still") {
    if (!ui.stepThrough) return null;
    return (
      <span className="seq-controls">
        <button key="primary" type="button" className={BUTTON} onClick={store.stepStart} onPointerEnter={store.warm} onFocus={store.warm}>
          Step through {label}
        </button>
      </span>
    );
  }
  if (ui.phase === "stepping") {
    const first = ui.step <= 1;
    const last = ui.step >= ui.stops;
    return (
      <span className="seq-controls" role="group" aria-label={`Step through ${label}`}>
        <button key="previous" type="button" className={BUTTON} aria-disabled={first} onClick={first ? undefined : store.stepPrev}>
          Previous step
        </button>
        <button key="primary" type="button" className={BUTTON} aria-disabled={last} onClick={last ? undefined : store.stepNext}>
          Next step
        </button>
        <span key="status" className="seq-status type-label" role="status">
          Step {ui.step} of {ui.stops}
        </span>
      </span>
    );
  }

  // Full motion: the one button's job follows the sequence.
  const button =
    ui.phase === "playing"
      ? { text: "Pause", name: `Pause ${label}`, press: store.pause }
      : ui.phase === "paused"
        ? { text: "Resume", name: `Resume ${label}`, press: store.resume }
        : ui.phase === "done"
          ? { text: `Replay ${label}`, name: undefined, press: store.play }
          : ui.phase === "idle"
            ? { text: `Play ${label}`, name: undefined, press: store.play }
            : null;
  if (!button) return null;
  return (
    <span className="seq-controls">
      <button key="primary" type="button" className={BUTTON} aria-label={button.name} onClick={button.press} onPointerEnter={store.warm} onFocus={store.warm}>
        {button.text}
      </button>
    </span>
  );
}

export function SequenceEnhancer({ label, stepThrough }: Labels & { stepThrough: boolean }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [store] = useState(createSequenceStore);
  const ui = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  // True on the render that hydrates the server's HTML, false on a client-side navigation.
  // The first render's answer is the one that matters: has the browser had the chance to
  // paint this drawing in ink before we got here?
  const hydrating = useRef(useSyncExternalStore(never, onClient, onServer));

  // A layout effect, so that on a client-side navigation the drawing is in pencil before
  // the new page is first painted.
  useLayoutEffect(() => {
    if (!marker.current) return;
    return store.attach(marker.current, { hydrating: hydrating.current, stepThrough });
  }, [store, stepThrough]);

  // The slot is null on the server and until the store has taken over the root.
  const controls = <Controls ui={ui} store={store} label={label} />;
  return (
    <span ref={marker} data-seq-enhancer="" className="seq-slot">
      {ui.slot === "self" ? controls : null}
      {ui.slot !== null && ui.slot !== "self" ? createPortal(controls, ui.slot) : null}
    </span>
  );
}

// The pre-paint script (lib/motion/prepaint.ts), as the first child of the root. The
// type differs between server and client on purpose: the server's HTML carries a real
// script, which the parser runs before the root's content exists; on a client-side
// navigation React creates the element as inert text, where a real script would never run
// anyway and the enhancer's layout effect does the same job. (The pattern is Next's own:
// "Preventing flash before hydration" in node_modules/next/dist/docs.)
export function PrePaintScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }}
    />
  );
}
