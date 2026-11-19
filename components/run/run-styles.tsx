// The recorded run's own rules: what the type roles and Tailwind utilities cannot say
// cleanly, for markup that repeats many times on a page (a board row, a line of engine
// output, a finding). CSS modules do not work in this repository (the Turbopack rule reads
// every .css file as global CSS), so the rules live here, rendered by a server component:
// React hoists a <style> with an href and a precedence and keeps one copy. They sit in
// @layer components, so a utility on the same element still wins; where a rule here has to
// beat a drafting class from app/globals.css (the same layer) it uses two class names.
//
// Render <RunStyles /> once on a page that draws the board or a document sheet (/run and
// /audit do). The score figure brings its own, smaller block (score-figure.tsx), because
// the home page draws it without the rest.
//
// Prefixes: rb- the board, eo- the engine's output, rd- a document sheet. A finding (rd-f)
// reads the same at every width: what was found, then who fixes it and by when as one
// line, then what a miss can cost; only the id and the severity move beside it when the
// list is at least 40rem wide.
// The board is a size container: it draws two lanes when it is at least 40rem wide,
// wherever it sits, and one column below that. In one column there are no lanes to head,
// so the head is only the line the play control sits on, and it is not drawn at all where
// there is no control (scripts off, the compact board).
//
// On paper the board prints as it is drawn, in two lanes on Letter and A4, without the
// engine's command under each row: the page that prints it says where those are. A row, a
// title block and a sheet's last line are never cut by a page; a title block is not tied to
// the board above it, because a browser that cannot find a place to break inside a grid
// moves the whole board to the next page and leaves this one empty. A band of reads stops
// one pixel short of the sheet's edges: where backgrounds are not printed the browser
// paints a band's fill white, and a band that reached the edge covered the sheet's border.
//
// Stepping (rs-step, SceneStepper in run-enhance.tsx; decision 95): with full motion,
// Previous step and Next step hold the board at a stop. The steps that change ink or go back
// to pencil on the kit's ink transition; while a stop is held (data-seq-state="paused") a
// stroke eases to its new length (--draw is a registered number); and the stop's row is
// marked as the current one (data-rs-current), with a soft fill and a hairline that fade in.
// With reduced motion the stepper is not drawn (the kit's own step-through changes state at
// once) and nothing here eases; with scripts off and on paper it is not drawn at all.

const CSS = `@layer components {
:root:not(.js) .js-only{display:none}

.rb{container:rb / inline-size;min-width:0}
.rb-head{display:none}
html.js .rb-head--ctl{display:flex;justify-content:flex-end;border-bottom:1px solid var(--line-strong);padding:.25rem 1rem}
.rb-head-end{display:contents}
.rb-lane{display:none}
html.js .rb-head .seq-slot{display:flex;min-height:2.75rem;align-items:center}
.rb-body{position:relative;padding-inline:1rem}
.rb .rb-pline{display:none}
.rb-grid{position:relative;display:grid;grid-template-columns:minmax(0,1fr);margin:0;padding:0;list-style:none}
.rb-item{position:relative;min-width:0;border-top:1px solid var(--line);padding-block:1rem;scroll-margin-top:1rem}
.rb-item:first-child,.rb-reads:first-child,.rb-item--picks{border-top:0}
.rb-item--joined{padding-bottom:3.25rem}
.rb-item--picks{padding-top:.25rem}
.rb-reads{min-width:0;margin-inline:-1rem;border-top:1px solid var(--line);padding-inline:1rem;background-color:var(--bg-raised)}
.rb-later{border-top:1px solid var(--line);padding-top:.75rem;color:var(--text-faint)}
.rb-later+.rb-item,.rb-later+.rb-reads{border-top:0}
.rb-read{scroll-margin-top:1rem}
.rb-read+.rb-read{border-top:1px solid var(--line)}
.rb-read-line{display:flex;min-width:0;align-items:baseline;gap:.75rem}
.rb-read-n{flex:none;width:1.25rem;color:var(--text-faint)}
.rb-read-t{min-width:0;flex:1 1 auto;color:var(--text-muted)}
.rb-read-t b{font-weight:inherit;color:var(--text)}
.rb-read-more{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.rb-read-body{padding:0 0 1rem 2rem}
.rb-row{position:relative;min-width:0;padding-left:2rem}
.rb-n{position:absolute;left:0;top:0;color:var(--text-faint)}
.rb-row--refused>.rb-n{top:1.25rem}
.rb-t{margin:.25rem 0 0;color:var(--text)}
.rb-out{display:flex;align-items:flex-start;gap:.5rem;margin:.25rem 0 0}
.rb-g{flex:none;width:1rem;height:1rem;margin-top:.1875rem;color:var(--lane,var(--accent));transition:color var(--dur-2) var(--ease-out)}
.rb-g--box{display:inline-grid;place-items:center}
.rb-g--finding{color:var(--warn)}
.rb-g--refused{color:var(--danger)}
.rb-cap{margin:.25rem 0 0;max-width:34rem;color:var(--text-muted)}
.rb-meta{margin:.375rem 0 0;color:var(--text-faint)}
.rb-meta>span{color:var(--text-muted);overflow-wrap:anywhere}
.rb-link{margin:.375rem 0 0;color:var(--text-muted)}
.rb-fold{margin-top:.25rem}
.rb .rb-fold>summary{color:var(--text-muted)}
.rb .rb-fold>summary,.rb-read-t,.rb-link,.rb-link a,.rb-meta,.rb-meta>span{transition:color var(--dur-2) var(--ease-out)}
@media (hover:hover){.rb .rb-fold>summary:hover,.rb .rb-fold>summary:hover .rb-read-t{color:var(--text)}}
.rb-item:target>.rb-row,.rb-read:target{outline:1px solid var(--accent);outline-offset:.375rem}

.rs-step{display:none}
html.js .rs-step{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.5rem}
html[data-motion="reduced"] .rs-step{display:none}
.rs-step-at{min-width:6.5rem;padding:0 .25rem;color:var(--text-muted);font-variant-numeric:tabular-nums}
.rb :is(.rb-item,.rb-read){transition:background-color var(--dur-2) var(--ease-out),box-shadow var(--dur-2) var(--ease-out)}
.rb [data-rs-current]{border-radius:var(--radius-control);background-color:var(--fill-hover);box-shadow:0 0 0 1px var(--accent)}
.rb[data-seq-state="paused"] [data-draw]{transition:--draw var(--dur-3) var(--ease-in-out)}
html[data-motion="reduced"] .rb :is(.rb-item,.rb-read),html[data-motion="reduced"] .rb [data-draw]{transition:none}

.rb-then{position:absolute;left:2rem;bottom:.5rem;display:flex;align-items:center;gap:.5rem;height:2.25rem;color:var(--human)}
.rb-then-track{position:relative;flex:none;width:1rem;height:100%}
.rb-then-ink,.rb-then-pencil{position:absolute;inset:0}
.rb-then-ink::before,.rb-then-pencil::before{content:"";position:absolute;left:50%;top:0;bottom:.375rem;border-left:1.5px solid currentColor;translate:-50% 0}
.rb-then-pencil{color:var(--text-faint);opacity:0;transition:opacity var(--dur-2) var(--ease-out)}
.rb-then-pencil::before{border-left-width:1px;border-left-style:dashed}
.rb-then-ink>.icon{position:absolute;left:50%;bottom:-.25rem;translate:-50% 0}
.rb-then-x{display:none}
.rb-then-word{color:var(--text)}
@media screen{
[data-inked="false"] .rb-then-pencil{opacity:1}
.rb .rev-cloud:has([data-seq-draws="around"][data-inked="false"])>.cloud-pencil{opacity:.7}
:is(.rb[data-inked="false"],.rb [data-inked="false"]) :is(.rb-fold>summary,.rb-link,.rb-link a,.rb-meta,.rb-meta>span,.rb-g){color:var(--text-faint)}
}
@media print{
html.js .rb-head--ctl{display:none}
.rs-step{display:none !important}
.rb [data-rs-current]{background-color:transparent;box-shadow:none}
.rb-item,.rb-reads,.sheet-tb,.sheet-foot{break-inside:avoid}
.sheet-foot{break-before:avoid}
.sheet-head,.rb-head{break-after:avoid}
.rb-reads{margin-inline:calc(1px - 1rem)}
.rb-read .disclosure>summary{min-height:2rem}
.rb-item .rb-fold,.rb-read-body,.rb-read-more{display:none !important}
.rb-item:target>.rb-row,.rb-read:target{outline:0}
}

@container rb (min-width:40rem){
.rb-head,html.js .rb-head--ctl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:5rem;align-items:center;justify-content:normal;border-bottom:1px solid var(--line-strong);padding:.25rem 1.5rem}
.rb-head-end{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0 1.5rem;min-width:0}
.rb-lane{display:inline-flex;min-height:2.75rem;align-items:center}
html.js .rb-head .seq-slot{flex:none;min-height:0}
.rb-body{padding-inline:1.5rem}
.rb .rb-pline{position:absolute;inset-block:0;left:50%;display:flex;translate:-50% 0}
.rb-item{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:5rem;grid-row:var(--r);grid-column:1;pointer-events:none}
.rb-item>*{pointer-events:auto}
.rb-item>.rb-row{grid-column:1}
.rb-item[data-lane="person"]>.rb-row{grid-column:2}
.rb-item--joined{padding-bottom:1rem}
.rb-item--picks{border-top:1px solid var(--line);padding-top:1rem}
.rb-item--picks>.rb-row{margin-top:1.25rem}
.rb-reads{grid-row:var(--r);grid-column:1;margin-inline:-1.5rem;padding-inline:1.5rem}
@media print{.rb-reads{margin-inline:calc(1px - 1.5rem)}}
.rb-later{grid-row:var(--r);grid-column:1}
.rb-read-more{position:static;width:auto;height:auto;overflow:visible;clip-path:none;flex:none;color:var(--text-faint)}
.rb-then{left:calc(50% - 2.5rem);top:2.5rem;bottom:auto;display:block;width:4.375rem;height:1rem}
.rb-then-track{position:absolute;inset:0;width:auto;height:auto}
.rb-then-y{display:none}
.rb-then-x{display:block}
.rb-then-ink::before,.rb-then-pencil::before{left:0;right:.375rem;top:50%;bottom:auto;border-left:0;border-top:1.5px solid currentColor;translate:0 -50%}
.rb-then-pencil::before{border-top-width:1px;border-top-style:dashed}
.rb-then-ink>.icon{left:auto;right:-.25rem;top:50%;bottom:auto;translate:0 -50%}
.rb-then-word{position:absolute;left:2.5rem;top:50%;translate:-50% -50%;padding:0 .25rem;background:var(--dim-surface,var(--bg))}
}

.eo{min-width:0;padding:.75rem 1rem;background-color:var(--bg-inset);color:var(--text-muted)}
.eo-who{margin:0 0 .5rem;color:var(--text-faint)}
.eo-cmd{color:var(--text);overflow-wrap:anywhere}
.eo-cmd::before{content:"$ ";content:"$ " / "";color:var(--text-faint)}
.eo-l{white-space:pre-wrap;overflow-wrap:anywhere;padding-left:calc((var(--h,0) + 2)*1ch);text-indent:calc((var(--h,0) + 2)*-1ch)}
.eo-h2{--h:2}
.eo-h4{--h:4}
.eo-h6{--h:6}
.nb{white-space:nowrap}

.rd{container:rd / inline-size}
.rd-cv{content-visibility:auto;contain-intrinsic-size:auto 40rem}
.rd-result{display:grid;grid-template-columns:minmax(0,1fr)}
.rd-score{min-width:0;padding:1.25rem 1rem}
.rd-findings{container:rdf / inline-size;min-width:0;border-top:1px solid var(--line);padding:1rem}
.rd-fl{margin:0;padding:0;list-style:none}
.rd-f{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;grid-template-areas:"id sev . status" "what what what what" "who who who who" "stake stake stake stake";align-items:center;gap:.375rem .75rem;border-top:1px solid var(--line);padding-block:.875rem}
.rd-f:last-child{padding-bottom:0}
.rd-f-id{grid-area:id;color:var(--text-faint)}
.rd-f-sev{grid-area:sev;display:flex}
.rd-f-what{grid-area:what;margin:0;color:var(--text)}
.rd-f-what--done{color:var(--text-muted);text-decoration:line-through;text-decoration-color:var(--text-faint)}
.rd-f-who{grid-area:who;display:flex;flex-wrap:wrap;align-items:center;gap:.125rem .75rem;margin:0;color:var(--text-muted)}
.rd-f-status{grid-area:status;display:flex;justify-self:end}
.rd-f-stake{grid-area:stake}
.rd-c{display:grid;grid-template-columns:1.5rem minmax(0,1fr);gap:.5rem .75rem;border-top:1px solid var(--line);padding-block:.75rem}
.rd-c-o{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .75rem;margin:0}
.rd-c-b{grid-column-start:2;min-width:0}
@container rd (min-width:44rem){
.rd-c{grid-template-columns:1.5rem 12rem minmax(0,1fr)}
.rd-c-o{flex-direction:column;align-items:flex-start}
.rd-c-b{grid-column-start:3}
}
.rd-src{margin:0;padding:0;list-style:none}
.rd-src>li{min-width:0;break-inside:avoid}
.rd-src>li+li{margin-top:.75rem}
.rd-src>li>span{display:block;margin-top:.25rem}
.rd-src--cols{margin-bottom:-.75rem}
.rd-src--cols>li,.rd-src--cols>li+li{margin-top:0;margin-bottom:.75rem}
@container rd (min-width:52rem){.rd-src--cols{columns:2;column-gap:2rem}}
@media print{.rd-f{break-inside:avoid}.rd-findings>h4{break-after:avoid}.rd-src>li>a[href^="http"]+span{display:none}}
@container rd (min-width:60rem){
.rd-result{grid-template-columns:22rem minmax(0,1fr)}
.rd-score{padding:1.5rem}
.rd-score>.sf{position:sticky;top:calc(var(--header-h) + 1rem)}
.rd-findings{border-top:0;border-left:1px solid var(--line);padding:1.5rem}
}
@container rdf (min-width:40rem){
.rd-f{grid-template-columns:2.25rem 6rem minmax(0,1fr) auto;grid-template-areas:"id sev what status" ". . who who" ". . stake stake";align-items:start;column-gap:1rem}
.rd-f-id,.rd-f-sev,.rd-f-status{display:flex;min-height:1.6rem;align-items:center}
}
}`;

export function RunStyles() {
  return (
    <style href="run-sheet" precedence="default">
      {CSS}
    </style>
  );
}
