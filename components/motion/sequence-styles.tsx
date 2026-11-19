// The CSS every sequence shares, rendered once per page by SequenceRoot (React hoists a
// <style> with an href and a precedence into <head> and keeps one copy however many roots
// ask). CSS modules do not work in this repository (components/run/run-styles.tsx says
// why), and the rules sit in @layer components so a Tailwind utility on the same element
// still wins.
//
// CSS owns appearance; lib/motion owns time. Everything a sequence passes through is said
// here (or in a device's own rules, app/globals.css) with attributes and one custom
// property, and with no attribute at all an element is in its finished state:
//   [data-draw]        draws itself from --draw, 0 (not drawn) to 1 (drawn; the default)
//   [data-ink]         is in pencil while it or an ancestor carries data-inked="false"
//   [data-seq-state]   on the root: penciled, playing, paused, stepping, done
//
// What is here:
//   1. Two generic drawables: a wipe from the left (data-draw="x") and from the top
//      (data-draw="y"), for a ruled line. The third, an SVG stroke (data-draw and
//      pathLength="1"), is defined with the drawing devices in app/globals.css.
//   2. The generic inkables: data-ink="text" (pencil is the faint ink, which still passes
//      4.5:1) and data-ink="mark" (pencil is the theme's: --pencil-mark-opacity and
//      --pencil-mark-filter in app/globals.css. On Night the mark at 45% strength; on Paper
//      a graphite grey at full strength, because a paler ink on white paper drops under 3:1).
//      A device with a penciled look of its own carries a bare data-ink and is left alone.
//   3. The state rules: before a sequence plays, and for the steps a step-through has not
//      reached, a step's drawables are not drawn (the ones inside it, and the one around
//      it when the step claims it with data-seq-draws="around"; that rule stands alone
//      because it needs :has()). A drawable no step draws is never touched: it is part of
//      the sheet, not of the sequence.
//   4. Reduced motion, the snap to the end, and the controls' layout.
// The declarations marked !important are state rules that must beat a color or opacity
// utility on the same element (without it a builder's text-agent-text would silently stay
// in ink) and any default --draw wherever it is declared. They are held to screens, so
// paper always gets the finished drawing.

const CSS = `@layer components {
[data-seq]{--seq-dur:var(--dur-2, 0.2s);--seq-ease:var(--ease-out,cubic-bezier(0.16,1,0.3,1))}

:where([data-draw="x"]){clip-path:inset(0 calc((1 - var(--draw,1))*100%) 0 0)}
:where([data-draw="y"]){clip-path:inset(0 0 calc((1 - var(--draw,1))*100%) 0)}

:where([data-ink="text"],[data-ink="mark"]){transition:color var(--seq-dur) var(--seq-ease),opacity var(--seq-dur) var(--seq-ease),filter var(--seq-dur) var(--seq-ease)}
:where([data-inked="false"]) :where([data-ink="text"],[data-ink="mark"]){transition-duration:calc(var(--seq-dur)*.75)}

@media screen{
[data-seq-state="penciled"] [data-seq-step] [data-draw],
[data-seq-state="penciled"] [data-seq-step][data-draw],
[data-seq-state="penciled"] [data-seq-trace],
[data-seq-state="stepping"] [data-inked="false"] [data-draw],
[data-seq-state="stepping"] [data-draw][data-inked="false"]{--draw:0 !important}
[data-seq-state="penciled"] [data-draw]:has([data-seq-draws="around"]),
[data-seq-state="stepping"] [data-draw]:has([data-seq-draws="around"][data-inked="false"]){--draw:0 !important}
[data-inked="false"] [data-ink="text"],[data-ink="text"][data-inked="false"]{color:var(--text-faint) !important}
[data-inked="false"] [data-ink="mark"],[data-ink="mark"][data-inked="false"]{opacity:var(--pencil-mark-opacity,.45) !important;filter:var(--pencil-mark-filter,none)}
}

html[data-motion="reduced"] [data-seq] [data-ink],html[data-motion="reduced"] [data-seq] [data-ink] *{transition:opacity var(--dur-1,120ms) linear}
@media (prefers-reduced-motion:reduce){[data-seq] [data-ink],[data-seq] [data-ink] *{transition:opacity var(--dur-1,120ms) linear}}
[data-seq-snap] [data-ink],[data-seq-snap] [data-ink] *,[data-seq-snap] [data-seq-step] *{transition:none !important}

.seq-slot:empty{display:none}
.seq-controls{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.seq-status{padding:0 .25rem;color:var(--text-muted);font-variant-numeric:tabular-nums}
@media print{.seq-slot{display:none !important}}
}`;

export function SequenceStyles() {
  return (
    <style href="motion-sequence" precedence="default">
      {CSS}
    </style>
  );
}
