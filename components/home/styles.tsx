// The home page's own rules (prefix hm-), rendered once by the page (React hoists a <style>
// with an href and a precedence into <head>). CSS modules do not work in this repository, and
// the rules sit in @layer components so a Tailwind utility on the same element still wins.
//
// Only what utilities cannot say is here (D218): the hero's spacing, the headline's last word,
// the host strip, the connect box's tabs (radios and :has(), so they work with scripts off),
// and the two lists' rows, which line up in columns from 768 px and read as two lines on a
// phone.
//
// The headline's last word (hl-power, decision 128) is the drawing set's own motion, penciled
// then inked (docs/MOTION.md): as the page opens it is drawn in pencil, an ink front sweeps it
// left to right while the drafting blue and the agent's green flow through it, the pencil
// fades under the ink, and the word settles with a small lift. Once, about 1.7 seconds, never
// again on that page. The word's own text stays in the h1 (transparent at rest); the ink is
// the same word laid over it as generated content that screen readers skip. With scripts off
// or reduced motion it is the finished word; in print and forced colors, plain ink.

const CSS = `@layer components {
.hm-hero{padding-block:2.5rem 0}
@media (min-width:768px){.hm-hero{padding-block:4.5rem 0}}

.hl-power{position:relative;display:inline-block;white-space:nowrap;color:transparent}
.hl-power::after{content:attr(data-ink);content:attr(data-ink) / "";position:absolute;inset:0;white-space:nowrap;pointer-events:none;background-image:linear-gradient(90deg,var(--accent-strong),var(--agent),var(--accent-strong),var(--agent));background-size:300% 100%;background-position:0 0;-webkit-background-clip:text;background-clip:text;color:transparent}
@media screen{
html.js[data-motion="full"] .hl-power{animation:hl-pencil 1.7s var(--ease-out) .25s both,hl-lift .5s var(--ease-out) 1.5s both}
html.js[data-motion="full"] .hl-power::after{-webkit-mask-image:linear-gradient(90deg,var(--text) 42%,transparent 58%);mask-image:linear-gradient(90deg,var(--text) 42%,transparent 58%);-webkit-mask-size:260% 100%;mask-size:260% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;animation:hl-ink 1.05s var(--ease-in-out) .55s both,hl-flow 1.6s var(--ease-out) .55s both}
}
@keyframes hl-pencil{0%{color:transparent;filter:blur(6px)}18%{color:var(--text-faint);filter:blur(0)}75%{color:var(--text-faint)}100%{color:transparent}}
@keyframes hl-ink{from{-webkit-mask-position:100% 0;mask-position:100% 0}to{-webkit-mask-position:0 0;mask-position:0 0}}
@keyframes hl-flow{from{background-position:100% 0}to{background-position:0 0}}
@keyframes hl-lift{0%,100%{transform:none}45%{transform:translateY(-.04em) scale(1.02)}}
@media print{.hl-power{color:inherit}.hl-power::after{content:none}}
@media (forced-colors:active){.hl-power{color:inherit}.hl-power::after{content:none}}

.hm-hosts{display:flex;flex-wrap:wrap;align-items:center;column-gap:1.5rem;row-gap:.25rem}
.hm-host-list{display:flex;flex-wrap:wrap;align-items:center;column-gap:1.25rem;row-gap:0;margin:0;padding:0;list-style:none}
.hm-host{display:inline-flex;align-items:center;gap:.5rem;min-height:2.75rem;color:var(--text);text-decoration:none}
@media (min-width:768px){.hm-host{min-height:2rem}}
@media (hover:hover){.hm-host:hover{text-decoration:underline;text-decoration-thickness:var(--underline-thickness);text-underline-offset:var(--underline-offset)}}

.hm-box{position:relative;max-width:48rem;overflow:clip;border:1px solid var(--line-strong);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box)}
@media screen{html.js[data-motion="full"] .hm-box[data-swept]::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(100deg,transparent 40%,color-mix(in oklab,var(--accent) 22%,transparent) 50%,transparent 60%);background-size:300% 100%;animation:hm-sweep 1s var(--ease-out) both}}
@keyframes hm-sweep{from{background-position:100% 0}to{background-position:0 0}}
.hm-tabs{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem 1rem;margin:0;padding:.625rem .75rem;border:0;border-bottom:1px solid var(--line)}
.hm-pills{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-radius:2rem;background:var(--bg-inset);padding:.25rem}
.hm-pill{position:absolute;top:.25rem;bottom:.25rem;left:.25rem;width:calc((100% - .5rem)/3);border-radius:2rem;background:var(--bg-raised);box-shadow:var(--shadow-box);transition:translate var(--dur-2) var(--ease-out)}
.hm-box:has(input[value="code"]:checked) .hm-pill{translate:100% 0}
.hm-box:has(input[value="mcp"]:checked) .hm-pill{translate:200% 0}
.hm-tab{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:0 .875rem;border-radius:2rem;color:var(--text-muted);cursor:pointer;white-space:nowrap;transition:color var(--dur-1) var(--ease-out)}
@media (min-width:768px){.hm-tab{min-height:2.25rem}}
.hm-tab>input{position:absolute;width:1px;height:1px;margin:0;opacity:0;pointer-events:none}
.hm-tab:has(input:checked){color:var(--text)}
.hm-tab:has(input:focus-visible){outline:var(--focus-ring);outline-offset:2px}
@media (hover:hover){.hm-tab:hover{color:var(--text)}}
.hm-box-chip{display:flex;align-items:center;min-height:2.75rem}

.hm-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;margin:0;padding:0;list-style:none}
@media (min-width:1024px){.hm-stats{grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}}
.hm-stat{display:flex;flex-direction:column;gap:.25rem;height:100%;padding:1rem 1.125rem;border:1px solid var(--line-strong);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box);color:var(--text);text-decoration:none;transition:translate var(--dur-2) var(--ease-out),border-color var(--dur-1) var(--ease-out)}
@media (hover:hover){.hm-stat:hover{translate:0 -2px;border-color:var(--line-bold)}}
.hm-stat:focus-visible{outline:var(--focus-ring);outline-offset:2px}
.hm-way{display:none}
.hm-box:has(input[value="prompt"]:checked) .hm-way[data-way="prompt"],
.hm-box:has(input[value="code"]:checked) .hm-way[data-way="code"],
.hm-box:has(input[value="mcp"]:checked) .hm-way[data-way="mcp"]{display:block}
.hm-way>div{background:transparent}
.hm-after{display:flex;flex-wrap:wrap;column-gap:2rem;row-gap:0}

.hm-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;column-gap:2rem;row-gap:.5rem}
.hm-head>.min-w-0{flex:1 1 32rem;max-width:var(--measure)}
.hm-all{white-space:nowrap}

.hm-cols{display:none}
.hm-rows{margin:0;padding:0;list-style:none;border-top:1px solid var(--line-strong)}
.hm-row{display:grid;grid-template-columns:2rem minmax(0,1fr);column-gap:.75rem;row-gap:.375rem;align-items:baseline;padding-block:.875rem;border-bottom:1px solid var(--line)}
@media (hover:hover){.hm-row{transition:background-color var(--dur-1) var(--ease-out)}.hm-row:hover{background-color:var(--bg-panel)}}
.hm-n{grid-column:1}
.hm-n--dot{align-self:center;justify-self:start;width:.375rem;height:.375rem;background:var(--line-bold)}
.hm-title{grid-column:2;min-width:0;color:var(--text);text-decoration:none}
@media (hover:hover){.hm-title:hover{text-decoration:underline;text-decoration-thickness:var(--underline-thickness);text-underline-offset:var(--underline-offset)}}
.hm-meta{grid-column:2;display:flex;flex-wrap:wrap;align-items:center;column-gap:1rem;row-gap:.375rem}
.hm-share-cell{display:inline-flex;align-items:center;gap:.5rem}
.hm-bar{position:relative;display:inline-block;flex:none;width:4rem;height:.5rem;background:var(--bg-tile);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hm-bar>span{position:absolute;inset-block:0;left:0;width:var(--pct);background:var(--agent)}
.hm-soft{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.375rem}
.hm-soft-link{display:inline-flex;align-items:center;justify-content:center;min-width:2.75rem;min-height:2.75rem;margin:-.75rem 0}
@media (min-width:768px){.hm-soft-link{min-width:1.5rem;min-height:1.5rem;margin:0}}

@media (min-width:768px){
.hm-cols,.hm-row{grid-template-columns:2.5rem minmax(0,1fr) 7rem 9.5rem 9rem}
.hm-cols--sc,.hm-row--sc{grid-template-columns:2.5rem minmax(0,1fr) 11rem 9.5rem}
.hm-cols{display:grid;column-gap:1rem;padding-bottom:.5rem}
.hm-cols>:first-child{grid-column:2}
.hm-row{column-gap:1rem;align-items:center;padding-block:.75rem}
.hm-meta{display:contents}
}
}`;

export function HomeStyles() {
  return (
    <style href="home-page" precedence="default">
      {CSS}
    </style>
  );
}
