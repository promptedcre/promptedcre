// The record page's own rules, in one <style> React hoists to the head once. They sit in
// @layer components, so a Tailwind utility on the same element still wins, and they set
// layout, ink and state only: every size comes from a type role on the element itself
// (type-title-s, type-body, type-body-s, type-label, type-data). The marks, the fold and
// its chevron, the hatching and the cut corner are the foundation's (app/globals.css,
// components/ui); nothing here redraws one. Paddings, margins and gaps are steps of the
// 4 px scale; the few other lengths place a mark on a line of text.
//
// Prefixes: pb- the page and its head, si- the list of steps above the cards, st- a step
// card, bd- the order-of-work board, src- a row of the source list; and one single class,
// .ref-link (a link in a list of references).
//
// Where a rule must beat a foundation rule of the same weight (.disclosure > summary,
// .pline) it names both classes, so the order the two stylesheets load in never matters.

// Scripts-on controls (copy, print, open all) are in the server HTML, so nothing shifts when
// they wake; with scripts off (<html> has no .js class) they are not shown at all, and what
// stands in for one (.pb-nojs: the sentence the run button copies) shows instead.
//
// A row that is the page's #target (a rule, a source). The foundation's fold shows such a
// row's body whether it is open or not, which is how a #hash opens a row with scripts off.
// Two rules keep that honest on this page. Until scripts have opened the row, its chevron
// points the way an open row's does. And once the reader has closed it (OpenTarget marks the
// fold data-shut), the body goes back to what a closed fold is, so the row a link brought
// them to can be closed like any other. A step card is a target too, but its fold is not its
// own child, so a link to a step opens nothing (components/step-list.tsx).
const PAGE = `html:not(.js) .pb-js{display:none}
.js .pb-nojs{display:none}
.pb-key{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1.5rem;margin:0;padding:0;list-style:none}
.pb-steps-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.75rem 2rem;padding-bottom:1rem}
@supports selector(::details-content){
#pb-root :target>.disclosure:not([data-shut])>summary .disclosure-chevron{rotate:90deg}
#pb-root :target>.disclosure[data-shut]:not([open])::details-content{display:block;content-visibility:hidden}
}`;

// The list of steps above the cards (./step-index): one link per step, its number, its mark
// and its title, then the page's other sections. On a phone it is a fold under a hairline
// ("16 steps · Jump to a step") whose rows keep a finger's height; from 768 px the fold is
// simply open (the foundation's openFrom="md") and the list runs down as many columns of at
// least 16rem as fit, three at most, each line a line of text tall, except on a touch screen
// that wide. A row never breaks across two columns.
//
// The step being read (./step-tracker, scripts on) is the link with aria-current="step": it
// takes the selected fill, and its number the text ink. The fill fades from one row to the
// next. With scripts off nothing is marked.
const INDEX = `.si{border-top:1px solid var(--line)}
.si-now{display:flex;min-width:0;flex-wrap:wrap;align-items:baseline;gap:.25rem .75rem}
.si-list{margin:0;padding:0;list-style:none}
.si-list>li{break-inside:avoid}
.si-a{display:grid;grid-template-columns:1.5rem .75rem minmax(0,1fr);column-gap:.5rem;align-items:start;min-height:2.75rem;padding:.75rem .5rem;border-radius:var(--radius-control);color:var(--text-muted);text-decoration:none;transition:background-color var(--dur-2) var(--ease-out),color var(--dur-2) var(--ease-out)}
.si-a[aria-current]{background:var(--bg-panel);color:var(--text)}
.si-a[aria-current] .si-n{color:var(--text)}
.si-n{line-height:1.3125rem;color:var(--text-faint);transition:color var(--dur-2) var(--ease-out)}
.si-a .mk{margin-top:.28125rem}
.si-k{margin:1rem 0 0;padding-inline:.5rem;color:var(--text-faint)}
.si-more{display:flex;flex-wrap:wrap;gap:0 1.5rem;margin:.75rem 0 0;border-top:1px solid var(--line);padding:.25rem .5rem .5rem;list-style:none}
.si-more a{display:inline-flex;min-height:2.75rem;align-items:center}
@media (hover:hover){.si-a:hover{background:var(--bg-raised);color:var(--text)}.si-a:hover .si-n{color:var(--text)}}
@media (min-width:768px){
.si{padding-top:.75rem}
.si-list{columns:3 16rem;column-gap:2rem}
.si-a{min-height:0;padding:.25rem .5rem}
.si-more a{min-height:0;padding-block:.25rem}
}
@media (min-width:768px) and (pointer:coarse){
.si-a{min-height:2.75rem;padding-block:.75rem}
.si-more a{min-height:2.75rem}
}`;

// Where the reader is (./step-tracker): the list sits above the cards and scrolls away, so
// while a card is being read one slim bar under the site header names it ("Step 5 of 12",
// its mark, its title) with a link back to the list. The pin is sticky inside the steps
// section and takes no height, so the bar lies over the top of the screen and moves nothing;
// it fades in once the pin has stuck and a card crosses the reading line (data-on), and out
// when none does. Scripts on only: with scripts off it is not drawn, and it never prints. A
// card's own jump margin keeps its top clear of the bar.
const TRACK = `html:not(.js) .si-pin{display:none}
.si-pin{position:sticky;top:var(--header-h);z-index:20;height:0}
.si-bar{position:absolute;top:0;inset-inline:-1.25rem;display:flex;min-width:0;align-items:center;gap:.75rem;min-height:2.75rem;border-bottom:1px solid var(--line-strong);background:var(--bg);padding:.25rem 1.25rem;opacity:0;visibility:hidden;transition:opacity var(--dur-2) var(--ease-out),visibility var(--dur-2)}
.si-bar[data-on]{opacity:1;visibility:visible}
.si-bar-n{flex:none;color:var(--text)}
.si-bar-t{min-width:0;flex:1 1 auto;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--text-muted)}
.si-bar-a{display:inline-flex;flex:none;min-height:2.75rem;align-items:center}
@media (min-width:768px){.si-bar{inset-inline:-2.5rem;padding-inline:2.5rem}.si-bar-a{min-height:0}}
@media (min-width:1024px){.si-bar{inset-inline:-3.5rem;padding-inline:3.5rem}}`;

// A step card (components/step-list.tsx): a ruled block of the column, never a box. The
// strong rule above it sets it apart from the one before, and one more closes the list.
// Under the number and title: who does it and what it asks, then the fold, then the ranked
// software. Under 640 px the card takes the full width of the column; from 640 px everything
// under the title hangs under it.
//
// The fold's summary is the step's first sentence with "Details" and the chevron on the line
// under it, so the sentence is what a reader clicks: the summary is a two-column grid whose
// label is unwrapped (display: contents), the sentence spanning the first row. Open, the
// sentence gives way to the whole instruction in the body; nothing above the summary moves.
// The ranked software sits under the fold, so it is the card's last line whether the fold is
// open or not.
//
// Opening and closing are one smooth change of height (D224, the owner's "Smooth + tracking"):
// where the browser can size to content (interpolate-size), the body grows from nothing (the
// foundation's fold animates ::details-content) while the sentence above it folds away, in the
// same time and curve, and the reverse on closing, so the card's height moves once and never
// jumps. The sentence keeps its row with no height when open, so "Details" stays where it was.
// A browser without interpolate-size opens and closes at once, the sentence still fading; a
// reader who asked for less motion gets both at once (the foundation sets every transition to
// zero).
//
// On paper every fold prints open (the foundation's print rules), the summary goes, a
// person's step ends with a line to sign and one to date, and a step's sources print by
// title only: the page's source list prints each address once. That one rule is !important
// because the rule it answers, in app/globals.css, is unlayered.
//
// A link in a list of references (.ref-link) is one line of text. Where the pointer is a
// finger its hit area reaches 12 px above and below the words, and links that follow one
// another are set that much further apart, so each is a 44 px target and none overlaps.
const STEPS = `.st-cards{margin:0;padding:0;list-style:none;border-bottom:1px solid var(--line-strong)}
.st{position:relative;border-top:1px solid var(--line-strong);padding:1.5rem 0 1.75rem;scroll-margin-top:3rem}
.st-h{display:grid;grid-template-columns:1.75rem minmax(0,1fr);column-gap:.5rem;align-items:baseline;margin:0}
.st-n{color:var(--text-faint)}
.st-t{min-width:0;color:var(--text)}
.st-in{display:grid;grid-template-columns:minmax(0,1fr);gap:.75rem;margin-top:.75rem}
.st-by{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:.25rem 1rem}
.st-who{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.25rem .5rem}
.st-act{color:var(--text-muted)}
.disclosure.st-fold>summary{display:grid;grid-template-columns:auto minmax(0,1fr);align-content:center;align-items:center;gap:0 .5rem}
.st-fold>summary>.disclosure-label{display:contents}
.st-p{order:-1;grid-column:1 / -1;min-width:0;max-width:var(--measure);margin-bottom:.5rem;overflow:clip;color:var(--text);transition:block-size calc(var(--dur-3) * .75) var(--ease-out),margin-bottom calc(var(--dur-3) * .75) var(--ease-out),opacity calc(var(--dur-3) * .75) var(--ease-out),visibility calc(var(--dur-3) * .75)}
.st-dt{color:var(--text-muted);transition:color var(--dur-1) var(--ease-out)}
.st-fold[open]>summary .st-p{block-size:0;margin-bottom:0;opacity:0;visibility:hidden;transition-duration:var(--dur-3)}
@supports (interpolate-size:allow-keywords){.st-fold{interpolate-size:allow-keywords}}
@media (hover:hover){.st-fold>summary:hover .st-dt{color:var(--text)}}
.st-body{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem;padding:.5rem 0;container-type:inline-size}
.st-facts{display:flex;flex-wrap:wrap;gap:.75rem 2rem;margin:0;border-block:1px solid var(--line);padding:.75rem 0}
.st-facts>div{min-width:0;max-width:100%}
.st-facts dt{color:var(--text-faint)}
.st-facts dd{margin:.25rem 0 0;color:var(--text)}
.st-x{color:var(--text-faint)}
.st-refs{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem 3rem}
.st-list{display:grid;gap:.5rem;margin:.5rem 0 0;padding:0;list-style:none}
.st-sign{display:none}
.st-sw{display:flex;min-width:0;flex-wrap:wrap;align-items:baseline;gap:.5rem 1rem;border-top:1px solid var(--line);padding-top:.75rem}
.st-sw-k{color:var(--text-faint)}
.st-vs{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:.5rem 1.5rem;margin:0;padding:0;list-style:none}
.st-v{display:inline-flex;min-width:0;align-items:center;gap:.5rem}
@container (min-width:42rem){.st-refs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (pointer:coarse){
.ref-link{position:relative;display:inline-block}
.ref-link::after{content:"";position:absolute;inset:-.75rem 0}
.st-list>li:not(:has(.st-x))+li{margin-top:1rem}
}
@media (min-width:640px){
.st-h{grid-template-columns:2rem minmax(0,1fr);column-gap:.75rem}
.st-in{padding-left:2.75rem}
}
@media print{
.st-cards{border-bottom:0}
.st{padding:.75rem 0 1rem}
.st-h{break-inside:avoid;break-after:avoid}
.st-in{gap:.5rem;margin-top:.25rem}
.disclosure.st-fold>summary{display:none}
.st-body{gap:.75rem;padding:0 0 .5rem}
.st-facts{break-inside:avoid}
.st-sign{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:1.5rem;margin:1.5rem 0 0;color:var(--text-faint);break-inside:avoid}
.st-sign>span{border-top:1px solid var(--text);padding-top:.25rem}
.st-list a[href^="http"]::after{content:none !important}
}`;

// The order-of-work board, inside the page's one Sheet. Stages read down; from 768 px the
// agent's lane sits beside a person's with the property line between them, and below that
// each stage stacks its cards. A card is a mark, a number and a title on the sheet's paper,
// never a box inside the sheet.
//
// The line on the board is the longest chain (M2 traces it). It has a node in every stage,
// on the first line of the stage and on the side of the lane the chain's step is in: in the
// stage gutter for the agent's lane, just past the property line for a person's (data-side).
// From one node to the next it is one run: straight down where the chain stays on a side,
// and where it changes hands (data-turn) down to the rule under the stage, along that rule
// across the property line, and down to the next node. Below 768 px the lanes stack, so
// both sides share the gutter and every run is straight.
// --bd-xa and --bd-xp are the two sides' places, --bd-x this stage's and --bd-nx the next
// stage's; --bd-y is the first line of a stage. The person's side is half the board plus
// the property line's column, so it needs no measuring.
//
// The list of stages carries data-seq-trace, so the kit sets --draw on it and every stage
// inherits it. A stage's run starts at --bd-a along the whole line and is --bd-s of it (the
// markup sets both, and data-seq-at to the same start): --bd-p is how much of this run is
// drawn, and a run that turns spends a quarter of it going down, most of it crossing and the
// last tenth arriving. So a stage sits at a known place on the line whatever height its
// cards wrap to. The dashed pencil line under the ink shows only while a sequence is
// waiting, playing or being stepped through. A run is drawn above the stages (z-index), or
// the rule of the stage below would cover the part of the line that lies along it; a node is
// drawn above the runs.
//
// A step on the chain has its mark framed in the line's ink (data-chain): the frame is on
// the mark's own wrapper, so no mark is redrawn, and in pencil it is the pencil's grey.
//
// The sheet's head: where the sequence will offer a control (scripts on, full motion), the
// hint beside the title is as tall as that control, and it gives its place to the control
// when there is one. So the head is the same height before, while and after the line is
// traced, and nothing under it moves.
const BOARD = `.js[data-motion="full"] .bd-hint{display:flex;min-height:2.75rem;align-items:center}
.js .bd-hint:has(+ .seq-slot:not(:empty)){display:none}
.bd{display:grid;grid-template-columns:1.5rem minmax(0,1fr)}
.bd-heads,.pline.bd-pl{display:none}
.bd-stages{display:grid;grid-template-columns:subgrid;grid-column:1 / -1;margin:0;padding:0;list-style:none}
.bd-st{--bd-xa:0rem;--bd-xp:0rem;--bd-x:var(--bd-xa);--bd-nx:var(--bd-xa);--bd-y:1.3125rem;--bd-p:clamp(0,calc((var(--draw,1) - var(--bd-a,0)) / var(--bd-s,1)),1);position:relative;display:grid;grid-template-columns:subgrid;grid-column:1 / -1;row-gap:.5rem;border-top:1px solid var(--line);padding:1rem 0 1.5rem}
.bd-st[data-side="person"]{--bd-x:var(--bd-xp)}
.bd-st[data-turn="person"]{--bd-nx:var(--bd-xp)}
.bd-st:first-child{border-top:0}
.bd-sn{grid-column:2;margin:0;color:var(--text-muted)}
.bd-node{position:absolute;z-index:2;left:var(--bd-x);top:var(--bd-y);width:.5rem;height:.5rem;background:var(--accent)}
.bd-run{position:absolute;z-index:1;pointer-events:none}
.bd-run::before,.bd-run::after{content:"";position:absolute;inset:0}
.bd-run::before{background:var(--accent)}
.bd-run::after{opacity:0;transition:opacity var(--dur-2) var(--ease-out)}
.bd-run--down{left:calc(var(--bd-x) + .25rem - 1px);top:calc(var(--bd-y) + .25rem);width:2px;height:calc(100% + 1px)}
.bd-run--down::before{transform-origin:top;transform:scaleY(var(--bd-p))}
.bd-run--down::after,.bd-run--drop::after{border-left:1px dashed var(--text-faint)}
.bd-run--across,.bd-run--drop{display:none}
[data-seq-state="penciled"] .bd-run::after,[data-seq-state="playing"] .bd-run::after,[data-seq-state="paused"] .bd-run::after,[data-seq-state="stepping"] .bd-run::after{opacity:.8}
.bd-lane{display:grid;grid-column:2;gap:.25rem;margin:0 -.5rem;padding:0;list-style:none}
.bd-lane:empty{display:none}
.bd-card{display:block;padding:.5rem;color:var(--text);text-decoration:none;transition:background-color var(--dur-1) var(--ease-out)}
.bd-hd{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .5rem}
.bd-card[data-chain] .bd-hd>.role,.bd-key-chain>i{outline:1.5px solid var(--accent);outline-offset:2px}
.bd-card[data-chain] .bd-hd>.role{transition:outline-color var(--dur-2) var(--ease-out)}
.bd-who{color:var(--text-muted)}
.bd-gs{display:inline-flex;align-items:center;gap:.5rem;margin-left:auto}
.bd-ti{display:block;margin-top:.25rem;color:var(--text)}
.bd-w{display:block;margin-top:.25rem;color:var(--text-faint)}
.bd-key-chain{display:inline-flex;align-items:center;gap:.5rem;white-space:nowrap}
.bd-key-chain>i{display:block;width:.75rem;height:.75rem;margin-inline:.25rem;background:var(--line-bold)}
@media screen{[data-inked="false"] .bd-card[data-chain] .bd-hd>.role{outline-color:var(--text-faint)}}
@media (hover:hover){.bd-card:hover{background:var(--bg-panel)}}
@media (min-width:768px){
.bd{grid-template-columns:6rem minmax(0,1fr) 3.5rem minmax(0,1fr)}
.bd-heads{display:grid;grid-template-columns:subgrid;grid-column:1 / -1;grid-row:1;border-bottom:1px solid var(--line-strong)}
.bd-heads>*{padding:0 .5rem .75rem}
.bd-heads>:first-child{grid-column:2}
.bd-heads>:last-child{grid-column:4}
.pline.bd-pl{display:flex;grid-column:3;grid-row:1 / span 2;justify-self:start;width:2rem}
.bd-stages{grid-row:2}
.bd-st{--bd-xa:4.5rem;--bd-xp:calc(50% + 3.25rem);--bd-y:2.3125rem;padding:1.5rem 0}
.bd-sn{grid-column:1;grid-row:1;padding-top:.5rem}
.bd-lane{grid-template-columns:repeat(auto-fill,minmax(12.5rem,1fr));gap:.5rem 1rem;align-content:start;margin:0}
.bd-la{grid-column:2;grid-row:1}
.bd-lp{grid-column:4;grid-row:1}
.bd-st[data-turn] .bd-run--down{bottom:-2px;height:auto}
.bd-st[data-turn] .bd-run--down::before{transform:scaleY(clamp(0,calc(var(--bd-p) / .25),1))}
.bd-run--across{display:block;left:calc(4.75rem - 1px);right:calc(50% - 3.5rem - 1px);top:100%;height:2px}
.bd-run--across::before{transform-origin:left;transform:scaleX(clamp(0,calc((var(--bd-p) - .25) / .65),1))}
.bd-st[data-turn="agent"] .bd-run--across::before{transform-origin:right}
.bd-run--across::after{border-top:1px dashed var(--text-faint)}
.bd-run--drop{display:block;left:calc(var(--bd-nx) + .25rem - 1px);top:100%;width:2px;height:calc(var(--bd-y) + .25rem + 1px)}
.bd-run--drop::before{transform-origin:top;transform:scaleY(clamp(0,calc((var(--bd-p) - .9) / .1),1))}
}`;

// A row of the source list (./source-list): the title is the link, with the arrow out at its
// end; under it the line of facts. The link is as tall as a finger needs, and the line under
// it is pulled up against the title. A source that carries a quote has that line as its
// fold's summary, set from the top, with the word "Quote" and the chevron at its end (both
// take the text ink under the pointer); from 768 px the summary is as tall as its text, so
// rows with and without a quote keep one height. Two columns from 1024 px. The fold that
// holds the rows after the first six on a phone is a ruled row like the rest.
// On paper a row is its title, its address under it and its facts, and stays whole; the list
// is plain blocks there, so it starts on the page the section's heading is on and breaks
// between rows.
const SOURCES = `.src-list{display:grid;gap:0 3rem;margin:0;padding:0;list-style:none}
.src{min-width:0;border-bottom:1px solid var(--line)}
.src-a{display:flex;align-items:flex-start;gap:.75rem;margin-bottom:-.5rem;padding:.75rem 0;color:var(--text);text-decoration:none}
.src-t{min-width:0;flex:1 1 0%}
.src-a>.icon{margin-top:.125rem;color:var(--text-faint);transition:color var(--dur-1) var(--ease-out)}
.src-m{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:.25rem .5rem;color:var(--text-faint)}
.src-m time{white-space:nowrap}
.src-p{margin:0;padding-bottom:.75rem}
.disclosure.src-fold>summary{align-items:flex-start;gap:.75rem;padding-bottom:.75rem}
.src-fold>summary .disclosure-chevron{margin-top:.125rem}
.src-l{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem}
.src-q{flex:none;color:var(--text-muted);transition:color var(--dur-1) var(--ease-out)}
.src-b{padding-bottom:.75rem}
.src-b>q{display:block;max-width:var(--measure);color:var(--text-muted)}
.src-more{border-bottom:1px solid var(--line)}
@media (hover:hover){
.src-a:hover>.src-t{text-decoration-line:underline;text-decoration-thickness:var(--underline-thickness)}
.src-a:hover>.icon,.src-fold>summary:hover .src-q{color:var(--text)}
}
@media (min-width:768px){.disclosure.src-fold>summary{min-height:0}}
@media (min-width:1024px){.src-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media print{
.src-list{display:block}
.src{break-inside:avoid}
.src-a{display:block;margin-bottom:0;padding-bottom:.25rem}
.src-t{display:block}
.src-a>.icon,.src-q,.disclosure>summary.src-more{display:none}
.disclosure.src-fold>summary{min-height:0;padding-bottom:.25rem}
}`;

const CSS = `@layer components {
${[PAGE, INDEX, TRACK, STEPS, BOARD, SOURCES].join("\n")}
}`;

export function PageStyles() {
  return (
    <style href="pb-page" precedence="default">
      {CSS}
    </style>
  );
}
