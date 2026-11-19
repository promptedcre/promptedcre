// The formation session's own rules (prefix lc-), rendered once by LlcDemo (React hoists a
// <style> with an href and a precedence into <head> and keeps one copy). CSS modules do not
// work in this repository, and the rules sit in @layer components so a utility on the same
// element still wins. The role marks, the company icons and the brand mark are the
// foundation's; nothing here redraws one.
//
// The look is an agent app's chat, sleek rather than a terminal (the owner's word at the
// second checkpoint, after BoardUI's AI Chat and Agent Progress: ideas only, decision 78):
// plain type, the person's message in a bubble on the right, a person's reply in one on the
// left, each tool call a quiet row that opens, a refusal a soft warning, a service a pill,
// the task list a card of rings, and the app's message box under the chat as a picture.
//
// The session follows the motion contract (docs/MOTION.md, with the owner's agent style:
// decisions 82, 83, 86 and 101 in docs/DECISIONS.md; the soft depth is decision 81). The
// server's HTML is the finished session; with full motion it starts frosted and the generic
// rule plays it step by step. Every state below hangs off what the kit writes (data-inked,
// data-seq-state, --draw), so CSS owns appearance and the timeline owns time:
//   .lc-in        new lines: frosted (blurred, faint, 6 px low) while their step is in pencil,
//                 then they come into focus when it inks. Only on screens.
//   .lc-think     the thinking row: laid out only while the run is going (penciled, playing,
//                 paused) and only from 768 px; shown only while its own --draw is between 0
//                 and 1, its call's first stroke. The spinner turns once and the light passes
//                 over the label once, both worked out from that --draw: nothing loops, and a
//                 paused run holds them still. In the finished session it is not laid out.
//   .lc-pause     a reading pause after a refusal, laid out only from 768 px: on a phone the
//                 step takes no part and no time, so the beats are shorter there.
//   .lc-svc-chk   the check on a service, and on the connector: it lands (a wipe from the
//                 left, --draw eased, since --draw is the registered number of
//                 app/globals.css) a moment after its line comes into focus.
//   the task list each ring (.lc-chk), its check (.lc-chk > svg) and its line (.lc-row-title)
//                 are outside every step: a ring is empty and its line plain while the record
//                 of its step is in pencil (LlcRowRules, a :has() rule per row), then the ring
//                 fills with its lane's tint, the check is drawn and the line struck through.
// Frost and pencil change paint only (filter, opacity, color, a transform), never a size, so
// nothing moves the layout.
//
// The layout: the session window, its chat about one screen tall (min(36rem, 70vh);
// min(30rem, 62vh) under 768 px) and scrolling inside it (.lc-scroll: a focusable region with
// its focus ring drawn inside its edge), the message box under it; beside it from 1024 px the
// task list card, sticky. Below 1024 px the task list is a strip of numbered rings above the
// window, its lines kept for a screen reader. The result card is under both. On paper the
// chat is its full height, the message box is not drawn, nothing is sticky and nothing casts
// a shadow. Corners are the tokens' (app/globals.css): --radius-box for the window, the task
// card and the result card, --radius-control for a tool call, a hand-over and a warning,
// --radius-chip for a file; bubbles, pills and rings are round. The window and the cards lift
// on --shadow-box.

const CSS = `@layer components {
.lc-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;align-items:start}
@media (min-width:1024px){.lc-grid{grid-template-columns:minmax(0,1fr) minmax(0,20rem);gap:2rem}}
@media (min-width:1280px){.lc-grid{grid-template-columns:minmax(0,1fr) minmax(0,22rem);gap:2.5rem}}

.lc-win{display:flex;flex-direction:column;min-width:0;overflow:clip;border:1px solid var(--line);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box);--dim-surface:var(--bg-raised)}
.lc-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.25rem 1rem;border-bottom:1px solid var(--line);padding:.75rem 1rem}
.lc-scroll{height:min(30rem,62vh);height:min(30rem,62svh);overflow-x:hidden;overflow-y:auto}
.lc-scroll:focus-visible{outline:var(--focus-ring);outline-offset:-2px}
.lc-log{display:grid;gap:1.25rem;margin:0;padding:1.25rem 1rem;list-style:none;color:var(--text)}
@media (min-width:768px){.lc-bar{padding:.75rem 1.5rem}.lc-scroll{height:min(36rem,70vh);height:min(36rem,70svh)}.lc-log{padding:1.5rem}}

.lc-entry{display:grid;gap:.75rem;min-width:0}
.lc-step{position:relative;min-width:0}
.lc-in{display:grid;gap:.5rem;min-width:0;transition:filter var(--dur-3,320ms) var(--ease-out,ease-out),opacity var(--dur-3,320ms) var(--ease-out,ease-out),transform var(--dur-3,320ms) var(--ease-out,ease-out)}
.lc-say{margin:0;overflow-wrap:anywhere;color:var(--text)}

.lc-conn{display:flex;align-items:center;gap:.5rem;width:fit-content;max-width:100%;margin:0 auto;border:1px solid var(--line);border-radius:2rem;background:var(--bg-inset);padding:.25rem .875rem;color:var(--text-muted)}
.lc-conn>:not(:nth-child(2)){flex:none}
.lc-conn>:nth-child(2){min-width:0}
.lc-faint{color:var(--text-faint)}
@media (max-width:639.98px){.lc-conn .lc-faint{display:none}}

.lc-me{display:flex;justify-content:flex-end}
.lc-bubble{margin:0;max-width:min(30rem,88%);border-radius:1.125rem;padding:.625rem .875rem;overflow-wrap:anywhere}
.lc-bubble--me{border-bottom-right-radius:.375rem;background:var(--bg-panel);color:var(--text)}
.lc-them{display:grid;justify-items:start;gap:.25rem;min-width:0}
.lc-who{color:var(--text-faint)}
.lc-bubble--them{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;border-bottom-left-radius:.375rem;background:var(--bg-inset);color:var(--text)}

.lc-hand{display:flex;align-items:flex-start;gap:.625rem;border:1px solid var(--line);border-radius:var(--radius-control);background:var(--bg-raised);padding:.625rem .875rem;color:var(--text)}
.lc-hand-mark{flex:none;margin-top:.25rem}
.lc-hand-text{margin:0;min-width:0;overflow-wrap:anywhere}

.lc-file{display:inline-flex;align-items:center;gap:.375rem;min-width:0;max-width:100%;border:1px solid var(--line);border-radius:var(--radius-chip);background:var(--bg-raised);padding:.125rem .5rem;color:var(--text-muted)}
.lc-file>svg{flex:none}
.lc-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.lc-tool{min-width:0;border:1px solid var(--line);border-radius:var(--radius-control);background:var(--bg-raised)}
.lc-tool-sum{display:flex;align-items:center;gap:.5rem;min-width:0;min-height:2.25rem;padding:.375rem .75rem;cursor:pointer;list-style:none;color:var(--text-muted);transition:color var(--dur-1) var(--ease-out,ease-out)}
.lc-tool-sum::-webkit-details-marker{display:none}
.lc-tool-sum:focus-visible{outline:var(--focus-ring);outline-offset:-2px;border-radius:var(--radius-control)}
@media (hover:hover){.lc-tool-sum:hover{color:var(--text)}}
.lc-tool-ico{display:inline-grid;flex:none;place-items:center;width:1.125rem;height:1.125rem;border-radius:50%;background:var(--agent-deep);color:var(--agent-text)}
.lc-tool-ico>svg{width:.75rem;height:.75rem}
.lc-tool--err .lc-tool-ico{background:transparent;color:var(--danger);box-shadow:inset 0 0 0 1px var(--danger)}
.lc-tool-name{flex:none;color:var(--text)}
.lc-tool-say{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc-tool-chev{flex:none;color:var(--text-faint);transition:rotate var(--dur-2) var(--ease-out,ease-out)}
.lc-tool[open]>.lc-tool-sum .lc-tool-chev{rotate:180deg}
.lc-tool-body{display:grid;justify-items:start;gap:.5rem;border-top:1px solid var(--line);padding:.625rem .75rem .75rem}
.lc-args{display:grid;gap:.25rem;margin:0}
.lc-arg{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .5rem;min-width:0}
.lc-arg>dt{color:var(--text-faint)}
.lc-arg>dd{margin:0;min-width:0;overflow-wrap:anywhere}
.lc-val{color:var(--text-muted)}
.lc-res{display:grid;gap:.125rem;color:var(--text-muted)}
.lc-res-line{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}

.lc-warn{display:flex;align-items:flex-start;gap:.625rem;border-radius:var(--radius-control);background:var(--bg-inset);padding:.625rem .875rem;color:var(--text)}
.lc-warn-ico{flex:none;margin-top:.1875rem;color:var(--danger)}
.lc-warn-text{margin:0;min-width:0;overflow-wrap:anywhere}
.lc-warn b{color:var(--danger)}

.lc-svc{display:inline-flex;align-items:center;justify-self:start;gap:.5rem;margin:0;border:1px solid var(--line);border-radius:2rem;background:var(--bg-raised);padding:.25rem .75rem .25rem .375rem;color:var(--text)}
.lc-svc-chk{display:inline-flex;color:var(--agent-text);clip-path:inset(0 calc((1 - var(--draw,1))*100%) 0 0);transition:--draw var(--dur-3,320ms) var(--ease-out,ease-out) var(--dur-3,320ms)}

.lc-think{position:absolute;z-index:1;left:0;top:0;display:none;align-items:center;gap:.5rem;border-radius:2rem;padding:.25rem .75rem .25rem .5rem;background:var(--bg-inset);color:var(--text-muted);pointer-events:none;opacity:calc(min(1,var(--draw,1)*8)*min(1,(1 - var(--draw,1))*8))}
.lc-spin{flex:none;width:.875rem;height:.875rem;fill:none;stroke:var(--agent);stroke-width:2;stroke-linecap:round;stroke-dasharray:.7 .3;rotate:calc(var(--draw,1)*360deg)}
.lc-think-label{white-space:nowrap}
.lc-pause{display:none}

.lc-composer{display:flex;align-items:center;gap:.625rem;margin:0 .75rem .75rem;border:1px solid var(--line);border-radius:1.5rem;background:var(--bg-raised);padding:.375rem .375rem .375rem .875rem;color:var(--text-faint);user-select:none}
@media (min-width:768px){.lc-composer{margin:0 1.5rem 1.25rem}}
.lc-composer-ico{flex:none}
.lc-composer-ph{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc-composer-send{display:inline-grid;flex:none;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--bg-tile);color:var(--text-faint)}

.lc-side{min-width:0;order:-1;border-bottom:1px solid var(--line);padding:.5rem 0}
.lc-side-head{margin:0 0 .5rem}
.lc-side-view{display:none}
.lc-steps{display:grid;grid-template-columns:repeat(var(--lc-n,12),minmax(0,1fr));gap:.25rem;margin:0;padding:0;list-style:none}
.lc-row{display:grid;justify-items:center;gap:.25rem;min-width:0}
.lc-row-title{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.lc-chk{display:inline-grid;place-items:center;width:1.25rem;height:1.25rem;border:1.5px solid var(--lane-mid,var(--line-bold));border-radius:50%;background:var(--lane-deep,transparent);color:var(--lane,var(--accent));transition:background-color var(--dur-2) var(--ease-out,ease-out),border-color var(--dur-2) var(--ease-out,ease-out)}
.lc-chk>svg{width:.8125rem;height:.8125rem;transition:--draw var(--dur-3,320ms) var(--ease-out,ease-out)}
@media print,(min-width:1024px){
.lc-side{order:0;border:1px solid var(--line);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box);padding:1.25rem 1.25rem .75rem}
.lc-side-head{margin:0 0 .75rem}
.lc-side-view{display:block}
.lc-steps{grid-template-columns:minmax(0,1fr);gap:0}
.lc-row{grid-template-columns:auto minmax(0,1fr);justify-items:stretch;align-items:start;column-gap:.75rem;padding:.4375rem 0}
.lc-row-title{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto;white-space:normal;color:var(--text-faint);text-decoration-line:line-through;text-decoration-color:var(--text-faint);transition:color var(--dur-2) var(--ease-out,ease-out)}
.lc-chk{margin-top:.0625rem}
}
@media screen and (min-width:1024px){.lc-side{position:sticky;top:calc(var(--header-h) + 1.5rem)}}

.lc-result{position:relative;margin-top:1.5rem;border:1px solid var(--line-strong);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box);padding:1.25rem 1rem;transition:box-shadow var(--dur-4,600ms) var(--ease-out,ease-out)}
@media (min-width:768px){.lc-result{padding:1.5rem 2rem}}
.lc-result-in{display:grid;gap:1.5rem;min-width:0}
@media (min-width:1024px){.lc-result-in{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:3rem;align-items:start}}
.lc-dates{display:grid;grid-template-columns:repeat(var(--lc-dates,3),minmax(0,1fr));margin:.75rem 0 0;padding:0;list-style:none;border-top:1px solid var(--line-strong)}
.lc-dates>li{display:grid;align-content:start;gap:.125rem;min-width:0;padding:.75rem .5rem .75rem 0}
.lc-dates>li+li{border-left:1px solid var(--line);padding-left:.75rem}
.lc-date{display:grid;gap:.125rem}

.lc-cap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem 2rem;margin-top:1.5rem}
.lc-ctl{display:none}
html.js .lc-ctl{display:flex;justify-content:flex-start;min-width:12.5rem;min-height:2.75rem}
@media (min-width:768px){html.js .lc-ctl{justify-content:flex-end}}
@media print{html.js .lc-ctl{display:none}}
[data-seq-snap] :is(.lc-svc-chk,.lc-chk,.lc-chk>svg,.lc-row-title){transition:none}

@media screen{
[data-inked="false"] .lc-in{filter:blur(.3125rem);opacity:.28;transform:translateY(.375rem);transition-duration:0s}
[data-inked="false"] .lc-svc-chk,[data-inked="false"] .lc-chk>svg{--draw:0;transition-duration:0s;transition-delay:0s}
[data-inked="false"] .lc-chk{background-color:transparent;border-color:var(--line-bold);transition-duration:0s}
[data-inked="false"] .lc-row-title{color:var(--text);text-decoration-line:none;transition-duration:0s}
[data-inked="false"] .lc-result,.lc-result:has([data-seq-step="result"][data-inked="false"]){box-shadow:none;transition-duration:0s}
}
@media screen and (min-width:768px){
:is([data-seq-state="penciled"],[data-seq-state="playing"],[data-seq-state="paused"]) .lc-think{display:flex}
.lc-pause{display:block;height:0}
}
@media screen and (forced-colors:none){
.lc-think-label{background-image:linear-gradient(100deg,var(--text-muted) calc(var(--draw,1)*160% - 60%),var(--text) calc(var(--draw,1)*160% - 30%),var(--text-muted) calc(var(--draw,1)*160%));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
}
@media print{.lc-win{overflow:visible;box-shadow:none}.lc-scroll{height:auto;overflow:visible}.lc-result{box-shadow:none}}
@media print{.lc-composer{display:none}.lc-side{box-shadow:none}}
}`;

export function LlcStyles() {
  return (
    <style href="llc-demo" precedence="default">
      {CSS}
    </style>
  );
}

// One rule per row of the task list: while the record of a row's step is in pencil, the ring
// is empty and the line plain. `rows` is how many rows the list has; the block is shared by
// every session with that many.
export function LlcRowRules({ rows }: { rows: number }) {
  const ns = Array.from({ length: rows }, (_, i) => i + 1);
  const pending = (n: number) => `.lc-fig:has([data-lc-done="${n}"][data-inked="false"]) [data-lc-row="${n}"]`;
  const css = [
    "@layer components {",
    "@media screen{",
    `${ns.map((n) => `${pending(n)} .lc-chk>svg`).join(",\n")}{--draw:0;transition-duration:0s;transition-delay:0s}`,
    `${ns.map((n) => `${pending(n)} .lc-chk`).join(",\n")}{background-color:transparent;border-color:var(--line-bold);transition-duration:0s}`,
    `${ns.map((n) => `${pending(n)} .lc-row-title`).join(",\n")}{color:var(--text);text-decoration-line:none;transition-duration:0s}`,
    "}",
    "}",
  ].join("\n");
  return (
    <style href={`llc-rows-${rows}`} precedence="default">
      {css}
    </style>
  );
}
