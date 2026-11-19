// CalcStyles: the rules a calculator page draws with (prefix calc-), in one <style> React
// hoists to the head once. The calculator page renders it; the calculators themselves do
// not. Everything sits in @layer components, so a Tailwind utility on the same element
// still wins. Type is never set here: every word carries a type-* role in the markup.
//
// The page has three kinds of surface. The figures are a Sheet (components/ui): the one
// drawing on the page. The inputs are a form of ruled cells: a dashed line under a value
// is a blank to fill in, a cell without one is computed. Everything after the tool
// (schedules, the working, the method) is a column of ruled rows on plain ground.

// Exported for __tests__/calc-live.test.ts, which holds every hidden "before" state to full motion on a screen.
export const CALC_CSS = `@layer components {
/* ----- The tool. One column in task order on a phone: the answer, the form, the figures.
   From 1024 px the answer and the figures stand left and the form right, and hold in
   view while the form scrolls: from their top while they fit the window, from their foot
   when they are taller than it. The page's script writes their height (--calc-h); without
   it the far limit below never comes and nothing holds. ----- */
.calc-tool{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem}
/* In one column the figures are drawn after the form but written before it. Where the
   browser can, the keyboard follows the drawn order (the form, then the figures' links). */
@media (max-width:1023.98px){.calc-tool{reading-flow:grid-order}}
.calc-result{display:contents}
.calc-answer{order:1;min-width:0}
.calc-form{order:2;min-width:0}
.calc-figures{order:3;min-width:0}
/* The last result that read, held while an input does not: dimmed, with its first ink still
   4.5:1 on the ground and on a sheet, at night and on paper. */
.calc-answer,.calc-held,.calc-after{transition:opacity var(--dur-2) var(--ease-out)}
.calc-tool[data-stale] .calc-answer,.calc-tool[data-stale] .calc-held,.calc-after[data-stale]{opacity:.65}
@media (min-width:1024px){
.calc-tool{grid-template-columns:minmax(0,1fr) minmax(0,26.5rem);align-items:start;gap:0 3rem}
.calc-result{display:block;min-width:0;position:sticky;top:min(calc(var(--header-h) + 1.5rem),calc(100vh - var(--calc-h,1000000px) - 1.5rem))}
.calc-answer{margin-bottom:1.5rem}
}

/* The list of what to fix arrives over the feedback duration; it never slides. */
.calc-fix{transition:opacity var(--dur-1) var(--ease-out)}
@starting-style{.calc-fix{opacity:0}}

/* ----- The figures sheet ----- */
.calc-lead{container-type:inline-size}
.calc-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin:0;border-top:1px solid var(--line);background:var(--line)}
.calc-stats>div{min-width:0;background:var(--bg-raised);padding:.75rem 1rem .875rem}
.calc-stats>div:last-child:nth-child(odd){grid-column:span 2}
.calc-stats dd{margin:0}
@media (min-width:768px){.calc-stats>div{padding-inline:1.5rem}}
.calc-fill-solid{background-color:var(--accent)}
.calc-fill-tint{background-color:var(--selection);box-shadow:inset 0 0 0 1px var(--accent)}
.calc-fill-light{background-color:var(--text)}
.calc-fill-outline{box-shadow:inset 0 0 0 1.5px var(--accent)}
[data-bar]{transform-origin:0 0}

/* ----- Live charts (decision 96; components/calc/live.tsx). The first time a drawing is seen
   its bars and areas grow in, and the lead figure comes into focus counting up from zero; an
   edit rolls each figure to its new value. Every hidden "before" state below sits under
   html.js[data-motion="full"] on a screen, and goes with data-reveal-off (the head script's word
   that the page's own motion never started): with scripts off, with reduced motion and on paper
   the drawing is finished. ----- */
@media screen{
html.js[data-motion="full"]:not([data-reveal-off]) .calc-chart:not([data-seen]) :is([data-grow="x"],[data-grow="up"],[data-grow="down"]){transform:scale(0)}
html.js[data-motion="full"]:not([data-reveal-off]) .calc-chart:not([data-seen]) [data-grow="pop"]{opacity:0}
html.js[data-motion="full"]:not([data-reveal-off]) .calc-chart:not([data-seen]) [data-grow="tint"]{background-color:transparent}
html.js[data-motion="full"]:not([data-reveal-off]) .calc-count:not([data-seen]){opacity:0;filter:blur(6px)}
html.js[data-motion="full"] .calc-count{transition:opacity 520ms var(--ease-out),filter 520ms var(--ease-out)}
html.js[data-motion="full"] .calc-tip[data-show]{animation:calc-tip-in var(--dur-1) var(--ease-out)}
}
@keyframes calc-tip-in{from{opacity:0}}
[data-grow]{transform-origin:0 0}
[data-grow="pop"]{transform-origin:50% 50%}
.calc-count{display:inline-block}
/* A shaded cell of the sensitivity grid: its share of the accent, set on the cell. */
.calc-shade{background-color:color-mix(in srgb,var(--accent) var(--calc-shade,0%),transparent)}
/* The readout: one quiet box over the value it names, inside the drawing's own width. */
.calc-chart{position:relative}
.calc-tip{position:absolute;left:0;top:0;z-index:30;display:none;flex-direction:column;width:max-content;max-width:min(18rem,100%);border:1px solid var(--line-strong);border-radius:var(--radius-control);background-color:var(--bg-raised);padding:.375rem .625rem;box-shadow:var(--shadow-box);pointer-events:none}
.calc-tip[data-show]{display:flex}
/* The value being read: its bars, or the value itself, outlined in the text's ink; a column of
   cash flows also stands on the selected surface. No ink changes, so every word keeps its
   contrast under the pointer. */
.calc-chart [data-on][data-bar],.calc-chart [data-on] [data-bar]:not(.dim-ext),.calc-chart [data-on]:not(:has([data-bar])){outline:2px solid var(--text);outline-offset:1px}
.calc-chart td[data-on]{outline-offset:-2px}
.calc-chart .calc-col[data-on]{background-color:var(--bg-panel)}

/* ----- The form: one bordered block of ruled cells ----- */
/* The head is the title and the reset on one row; where they do not fit side by side the
   reset takes its own row, from the left. Under it, one line says whose inputs these are. */
.calc-panel{--dim-surface:var(--bg-raised);min-width:0;border:1px solid var(--line-strong);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box);overflow:clip}
.calc-panel-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0 1rem;min-height:2.75rem;padding:.25rem 1rem}
.calc-panel-note{margin:0;border-top:1px solid var(--line);padding:.5rem 1rem;color:var(--text-faint)}
/* While an input does not read, the answer above the form is the last one that read. Where
   the form stands between the answer and its figures, its state line says so; from 1024 px
   the list of fixes stands under the answer and this line keeps to the inputs. */
.calc-state-held{display:none}
.calc-state-held>svg{flex:none;color:var(--danger)}
@media (max-width:1023.98px){
.calc-panel[data-stale] .calc-state{display:none}
.calc-panel[data-stale] .calc-state-held{display:flex;align-items:flex-start;gap:.375rem;color:var(--text-muted)}
}
.calc-group{border-top:1px solid var(--line-strong)}
.calc-group-head,.calc-group.disclosure>summary{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0 .75rem;min-height:2.75rem;padding:.125rem 1rem;background:var(--bg-panel);color:var(--text)}
.calc-group.disclosure>summary{justify-content:flex-start}
.calc-group-note{margin:0;border-top:1px solid var(--line);padding:.5rem 1rem;color:var(--text-faint)}
/* The rules between cells are each cell's own hairline, drawn into the 1 px gap and cut off
   at the block's edge. So a half-width cell left alone on a row stands beside plain paper,
   not beside a dark hole. */
.calc-cells{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;overflow:clip;border-top:1px solid var(--line);background:var(--bg-raised)}
.calc-cell{min-width:0;box-shadow:0 0 0 1px var(--line);background:var(--bg-raised);padding:.625rem 1rem .75rem}
.calc-cell--wide{grid-column:span 2}
.calc-set{display:grid;grid-column:span 2;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px}
.calc-row{display:flex;grid-column:span 2;align-items:center;justify-content:space-between;gap:.75rem;min-height:2.75rem;box-shadow:0 0 0 1px var(--line);background:var(--bg-raised);padding:.125rem 1rem;color:var(--text-muted)}
@media (max-width:639.98px){.calc-cell--wide-phone{grid-column:span 2}}

/* The blank: a dashed line under a value you can type over. Under the pointer and with
   the caret in it, the blank is a field; a value that does not read is underlined in red
   and says why in a sentence. Never a stripe down the side. */
.calc-entry{display:flex;align-items:baseline;gap:.375rem;min-width:0;min-height:2.75rem;margin:.125rem -.5rem 0;padding:.5625rem .5rem .375rem;border-bottom:1px dashed var(--line-bold);cursor:text;transition:background-color var(--dur-1) var(--ease-out),border-color var(--dur-1) var(--ease-out)}
.calc-entry :is(input,select){min-width:0;border:0;border-radius:0;padding:0;background:transparent;color:var(--text);outline:none}
.calc-entry input::placeholder{color:var(--text-faint);opacity:1}
.calc-entry :is(input[type="date"],select){flex:1 1 auto;width:100%}
.calc-entry select{appearance:none;cursor:pointer;text-overflow:ellipsis}
.calc-entry option{background:var(--bg-raised);color:var(--text)}
.calc-entry--pick{position:relative;align-items:center;cursor:pointer}
.calc-entry--pick>select{padding-right:1.5rem}
.calc-entry--pick>svg{position:absolute;right:.5rem;top:50%;translate:0 -50%;color:var(--text-faint);pointer-events:none}
/* An optional blank left blank says "optional" and nothing else: its dollar sign and unit
   come back with the caret, so the line never reads "$ optional /SF/yr". */
.calc-entry[data-blank]:not(:focus-within)>.calc-affix{display:none}
@media (hover:hover){.calc-entry:hover{background-color:var(--bg-panel);border-bottom-color:var(--accent)}}
.calc-entry:focus-within{background-color:var(--bg-inset);border-bottom-style:solid;border-bottom-color:var(--accent-strong);outline:var(--focus-ring);outline-offset:0}
.calc-entry[data-invalid]{border-bottom:2px solid var(--danger);padding-bottom:.3125rem}
.calc-check{display:flex;align-items:center;gap:.75rem;min-height:2.75rem;cursor:pointer;color:var(--text)}
.calc-check>input{flex:none;width:1.125rem;height:1.125rem;margin:0}
.calc-say{display:flex;align-items:flex-start;gap:.375rem;margin:.375rem 0 0;color:var(--text)}
.calc-say>svg{flex:none;margin-top:.1875rem;color:var(--danger)}
.calc-hint{margin:.375rem 0 0;color:var(--text-faint)}
.calc-echo{margin:.375rem 0 0;color:var(--text-muted)}
/* The answer held at the foot of the screen while the form is on it. */
.calc-bar{position:sticky;bottom:0;z-index:20;padding-top:.75rem}
/* Drawn only while the answer itself is off screen (the page's script says when). */
.calc-bar[data-off]{visibility:hidden}
.calc-bar>p{display:flex;align-items:baseline;gap:.75rem;margin:0;border:1px solid var(--line-bold);border-radius:var(--radius-control);background-color:var(--bg-panel);padding:.625rem 1rem;box-shadow:var(--shadow-box)}

/* ----- A schedule: a table that scrolls sideways inside its own frame, its first column
   held. While columns lie beyond the frame's right edge, a ruled strip with a chevron
   stands on the cut and a line under the table names what did not fit (the page's script
   measures both; a table that fits gets neither). ----- */
.calc-sched{min-width:0}
.calc-window{position:relative;min-width:0}
.calc-scroll{min-width:0;overflow-x:auto;border-block:1px solid var(--line-strong)}
.calc-more{display:none;position:absolute;top:1px;bottom:1px;right:0;width:1.25rem;justify-content:flex-end;padding-top:.6875rem;border-left:1px solid var(--line-strong);background:var(--dim-surface,var(--bg));color:var(--text-muted);pointer-events:none}
.calc-window[data-more]>.calc-more{display:flex}
.calc-over{display:flex;align-items:flex-start;gap:.375rem;margin:.5rem 0 0;color:var(--text-faint)}
.calc-over>svg{flex:none}
.calc-table{width:100%;border-collapse:separate;border-spacing:0}
.calc-table :is(th,td){border-bottom:1px solid var(--line);padding:.625rem .75rem;text-align:right;vertical-align:baseline;white-space:nowrap}
.calc-table thead th{border-bottom-color:var(--line-strong);vertical-align:bottom;white-space:normal;color:var(--text-faint)}
.calc-table tbody tr:last-child>*{border-bottom:0}
.calc-table tbody:has(+tfoot) tr:last-child>*{border-bottom:1px solid var(--line-strong)}
.calc-table tfoot>tr>*{border-bottom:0}
.calc-table :is(th,td):first-child{position:sticky;left:0;z-index:1;min-width:4.5rem;max-width:13rem;background:var(--dim-surface,var(--bg));padding-left:0;text-align:left;white-space:normal}
.calc-table :is(th,td):last-child{padding-right:0}
.calc-scroll[data-wide] .calc-table :is(th,td):first-child{box-shadow:1px 0 0 var(--line)}
.calc-scroll[data-wide] .calc-table :is(th,td):last-child{padding-right:.75rem}

/* ----- The working. A line the last edit changed is tinted, and the tint fades (the page's
   script). A reader who asks for less motion gets a still mark instead: the changed lines
   stand on the selected surface until the next edit, and a line under the working says
   what the mark means. ----- */
.calc-line[data-changed]{background-color:var(--bg-panel)}
.calc-changed{display:none}
.calc-trace:has(.calc-line[data-changed]) .calc-changed{display:block}

/* ----- On paper: nothing scrolls and nothing holds. A schedule prints whole: its cells
   stand closer, and a wide one (more than four columns) is drawn a step smaller, so
   eleven columns fit a letter page with no date or amount broken across lines. What
   only a screen needs is left off. ----- */
@media print{
.calc-scroll{overflow:visible}
.calc-table :is(th,td){padding-inline:.3125rem}
.calc-table :is(th,td):first-child{position:static}
.calc-scroll[data-wide] .calc-table{zoom:.9}
.calc-window[data-more]>.calc-more,.calc-over,.calc-trace:has(.calc-line[data-changed]) .calc-changed{display:none}
.calc-line[data-changed]{background-color:transparent}
}
}`;

export function CalcStyles() {
  return (
    <style href="calc-page" precedence="default">
      {CALC_CSS}
    </style>
  );
}
