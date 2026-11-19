import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/components/ui";
import { SceneSync } from "./run-enhance";

// SceneSwitch: one scene of the recorded run at a time. The tabs are plain links to each
// scene's id, and CSS shows the scene that is the URL's target (or holds it: a row anchor
// such as #audit-step-5 opens its scene), else the first. Links rather than radios, so
// that every way in agrees with scripts off: a tab, a "then" link to a later scene, a link
// from another page, the back button. Pass each scene as a child
// <section id={tab.id} className={SCENE_PANEL}>, in the tabs' order. Without :has()
// support every scene is drawn, one after another.
//
// The tabs are the index tabs of the sheets under them: the current one stands on the
// sheet's paper, under a rule that slides to it (from 768 px, where the tabs are one row).
// Which tab is current is also said to assistive technology: SceneSync (a few lines of
// script) sets aria-current on load and on every hash change. It also marks a scene that
// is switched to (data-rs-enter), which fades in once (decision 95): never the first scene
// painted, never a jump to a row of the scene already shown, never with reduced motion,
// and with scripts off nothing is marked, so the scenes switch as before.
//
// On paper there is nothing to switch: every scene prints, each on a page of its own, and
// the tabs are not drawn.
//
// A tab's note (its scene's counts) is drawn from 768 px, where the tabs are one row. What a
// tab cannot say at a width, the scene's own sheet head says: see SceneNote.

export const SCENE_PANEL = "rs-panel";

export type SceneTab = { id: string; title: string; note: ReactNode };

// SceneNote: the note in a scene's sheet head, which says what the tabs above it do not.
// From 768 px a tab carries its scene's counts, so the head says where the scene sits
// ("Scene 2 of 5"). Narrower, the current tab says that and has no room for the counts, so
// the head carries them, in the tab's own words. On paper there are no tabs: it says both.
// Nothing is said twice at any width, on a screen or to a screen reader.
export function SceneNote({ n, of, note }: { n: number; of: number; note: ReactNode }) {
  return (
    <>
      <span className="rs-at">{`Scene ${n} of ${of}`}</span>
      <span className="rs-sep"> · </span>
      <span className="rs-sum">{note}</span>
    </>
  );
}

function css(ids: string[]): string {
  const anyTarget = ".rs-panel:target,.rs-panel :target";
  const holds = (id: string) => `.rs-root:has(#${id}:target,#${id} :target)`;
  const current = [`.rs-root:not(:has(${anyTarget})) .rs-tab:first-child>a`, ...ids.map((id) => `${holds(id)} .rs-tab>a[href="#${id}"]`)];
  return `@layer components {
.rs-root:not(:has(${anyTarget})) .rs-panels>.rs-panel:not(:first-child),
.rs-root:has(${anyTarget}) .rs-panels>.rs-panel:not(:target):not(:has(:target)){display:none}
${ids.map((id, i) => `${holds(id)}{--rs-i:${i}}`).join("\n")}
.rs-tabs{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin:0;padding:1px 1px 0;list-style:none;background-color:var(--line-strong);border-radius:var(--radius-box) var(--radius-box) 0 0;overflow:clip}
@media screen{.rs-panel>.sheet:first-child{border-start-start-radius:0;border-start-end-radius:0}}
.rs-tab{min-width:0;background-color:var(--bg)}
.rs-tab:last-child:nth-child(odd){grid-column:1 / -1}
.rs-tab>a{position:relative;display:flex;height:100%;min-height:2.75rem;align-items:baseline;gap:.5rem;padding:.75rem;color:var(--text-muted);text-decoration:none;transition:background-color var(--dur-1) var(--ease-out),color var(--dur-1) var(--ease-out)}
.rs-tab>a:focus-visible{outline-offset:-2px}
.rs-n{flex:none;color:var(--text-faint);font-variant-numeric:tabular-nums}
.rs-note{display:none;margin-top:.125rem;color:var(--text-faint)}
@media (hover:hover){.rs-tab>a:hover{background-color:var(--bg-raised);color:var(--text)}}
${current.join(",\n")}{background-color:var(--bg-raised);color:var(--text)}
${current.map((s) => `${s}::before`).join(",\n")}{content:"";position:absolute;inset:0 0 auto;height:2px;background-color:var(--accent-strong)}
@media (min-width:768px){
.rs-tabs{grid-template-columns:repeat(var(--rs-n),minmax(0,1fr))}
.rs-tab:last-child:nth-child(odd){grid-column:auto}
.rs-tab>a{padding:.75rem 1rem}
.rs-note{display:block}
.rs-tabs::after{content:"";position:absolute;left:0;top:0;width:calc(100% / var(--rs-n));height:2px;background-color:var(--accent-strong);translate:calc(var(--rs-i,0) * 100%) 0;transition:translate var(--dur-2) var(--ease-out)}
${current.map((s) => `${s}::before`).join(",\n")}{inset:auto 0 -1px;height:1px;background-color:var(--bg-raised)}
}
html.js .rs-panel[data-rs-enter]{animation:rs-enter var(--dur-3) var(--ease-out)}
@media (prefers-reduced-motion:reduce){html.js .rs-panel[data-rs-enter]{animation:none}}
html[data-motion="reduced"] .rs-panel[data-rs-enter]{animation:none}
@media screen and (max-width:767.98px){.rs-at,.rs-sep{display:none}}
@media screen and (min-width:768px){.rs-sep,.rs-sum{display:none}}
@media print{
.rs-tabs{display:none}
.rs-root .rs-panels>.rs-panel{display:block !important}
.rs-panel+.rs-panel{break-before:page}
}
}
@keyframes rs-enter{from{opacity:0}}`;
}

export function SceneSwitch({ tabs, label, children, className }: { tabs: SceneTab[]; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("rs-root min-w-0", className)} style={{ "--rs-n": tabs.length } as CSSProperties}>
      <style href={`run-scenes-${tabs.map((t) => t.id).join("-")}`} precedence="default">
        {css(tabs.map((t) => t.id))}
      </style>
      <SceneSync />
      <nav aria-label={label}>
        <ol className="rs-tabs">
          {tabs.map((t, i) => (
            <li key={t.id} className="rs-tab">
              <a href={`#${t.id}`}>
                <span className="rs-n type-body-s" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="type-body-s block text-balance font-semibold">{t.title}</span>
                  <span className="rs-note type-note">{t.note}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="rs-panels">{children}</div>
    </div>
  );
}
