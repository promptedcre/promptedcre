// The pre-paint script: the few lines that put an auto-playing sequence in pencil before the
// browser draws it, so a drawing that is on screen at load starts penciled and is never
// seen to change before it plays.
//
// It is written into the server HTML as the first child of the root (so it runs as the
// parser opens the root, before the root's content exists), and does three things when
// motion is full:
//   1. data-seq-state="penciled" on the root (drawables read --draw: 0 from the CSS);
//   2. data-inked="false" on the root (everything inkable inside is in pencil);
//   3. a timer: if no enhancer has claimed the root (data-seq-live) when it fires, the
//      script that would play it never arrived, so the root goes to its finished state.
// With reduced motion, or with scripts off, it changes nothing: the server HTML is the
// finished drawing. It touches the root only, never the content inside it, so React
// hydrates the content without a mismatch; the root itself carries suppressHydrationWarning.
//
// lib/motion/decide.ts states the same rule as a function (decideStart); the enhancer
// applies it on a client-side navigation, where an inline script does not run.
// __tests__/motion-decide.test.ts runs this very string against a stand-in document.

/** How long the pre-paint script waits for the enhancer before it inks the drawing itself. */
export const PREPAINT_FAILSAFE_MS = 6000;

export const PREPAINT_SCRIPT =
  "(function(){try{" +
  'var s=document.currentScript,r=s&&s.parentElement;' +
  'if(!r||!r.hasAttribute("data-seq")||r.getAttribute("data-seq-state"))return;' +
  'var m=document.documentElement.getAttribute("data-motion");' +
  'if(m!=="full"&&m!=="reduced")m=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches?"reduced":"full";' +
  'if(m!=="full")return;' +
  'r.setAttribute("data-seq-state","penciled");r.setAttribute("data-inked","false");' +
  'setTimeout(function(){if(!r.hasAttribute("data-seq-live")&&r.getAttribute("data-seq-state")==="penciled"){r.setAttribute("data-seq-state","done");r.removeAttribute("data-inked")}},' +
  PREPAINT_FAILSAFE_MS +
  ")}catch(e){}})()";
