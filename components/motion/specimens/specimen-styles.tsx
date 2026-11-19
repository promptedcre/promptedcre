// The specimens' own rules (prefix sp-): the stand-in devices on /styleguide/motion. They
// are not the site's primitives: the role mark, the revision cloud and the property line
// drawn here stand in for the ones in components/ui, and exist so the motion kit can be
// seen on recorded data. Each device shows the contract a real one keeps:
//   - its finished look needs no attribute;
//   - its penciled look hangs off [data-inked="false"] on itself or an ancestor;
//   - what it draws in ink follows --draw (0 not drawn, 1 drawn);
//   - where a drawn line should show in pencil first, the pencil line is a second element
//     under the ink, and the ink is drawn over it, the way a drawing is inked. Two ways to
//     show it: while the step is in pencil (.sp-pencil, keyed on data-inked), or until the
//     ink has covered it (the cloud, worked out from --draw, so it needs no step above it).

const DASH_DOT = "var(--accent) 0 22px,transparent 22px 28px,var(--accent) 28px 31px,transparent 31px 37px";

const CSS = `@layer components {
.sp-sheet{--dim-surface:var(--bg-raised)}
.sp-pos{position:relative;min-width:0;padding:1.125rem 1.25rem}

.sp-pencil{opacity:0;transition:opacity var(--seq-dur) var(--seq-ease)}
[data-inked="false"] .sp-pencil{opacity:.85}

.sp-mark{flex:none;width:14px;height:18px;overflow:visible}
.sp-mark path{fill:currentColor;stroke:currentColor;stroke-width:1.5;transition:fill var(--seq-dur) var(--seq-ease),stroke var(--seq-dur) var(--seq-ease)}
.sp-mark--agent{color:var(--agent)}
.sp-mark--person{color:var(--human)}
[data-inked="false"] .sp-mark path{fill:transparent;stroke:var(--text-faint);stroke-dasharray:2.5 2}

.sp-check{flex:none;width:16px;height:16px;margin-top:.15em;color:var(--agent)}
.sp-check path{fill:none;stroke:currentColor;stroke-width:1.75}
.sp-check path.sp-pencil{stroke:var(--text-faint);stroke-width:1;stroke-dasharray:1.5 1.5}

.sp-cloud{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;color:var(--danger)}
.sp-cloud-body{x:6px;y:6px;width:calc(100% - 12px);height:calc(100% - 12px)}
.sp-cloud-lobes{x:12px;y:12px;width:calc(100% - 24px);height:calc(100% - 24px);fill:none;stroke-width:20px;stroke-linecap:round;stroke-dasharray:0 16}
.sp-cloud-cut.sp-cloud-body{x:7.4px;y:7.4px;width:calc(100% - 14.8px);height:calc(100% - 14.8px)}
.sp-cloud-cut.sp-cloud-lobes{stroke-width:17.2px}
.sp-cloud-pen{x:6px;y:6px;width:calc(100% - 12px);height:calc(100% - 12px);fill:none;stroke-width:16px;stroke-dasharray:1 2;stroke-dashoffset:calc(1 - var(--draw,1))}
.sp-cloud-ink{fill:currentColor}
.sp-cloud-pencil{fill:var(--text-faint);opacity:calc(clamp(0,(1 - var(--draw,1))*1000,1)*.55)}

.sp-conn{position:relative;display:flex;align-items:center;gap:.5rem;height:2.5rem;padding-left:1.25rem}
.sp-conn-track{position:relative;flex:none;width:14px;height:100%}
.sp-conn-line{position:absolute;inset:0}
.sp-conn-line[data-draw]{clip-path:inset(0 0 calc((1 - var(--draw,1))*100%) 0)}
.sp-conn-line::before{content:"";position:absolute;left:50%;top:0;bottom:6px;border-left:1.5px solid currentColor;transform:translateX(-50%)}
.sp-conn-line>svg{position:absolute;left:50%;bottom:0;width:7px;height:10px;transform:translateX(-50%) rotate(90deg)}
.sp-conn-line.sp-pencil{color:var(--text-faint)}
.sp-conn-line.sp-pencil::before{border-left-width:1px;border-left-style:dashed}
.sp-conn-line.sp-pencil>svg path{fill:none;stroke:currentColor;stroke-width:1}
.sp-conn-word{position:relative;padding:0 .25rem;background:var(--dim-surface,var(--bg))}
.sp-pline{position:absolute;left:0;right:0;top:50%;height:1.5px;background:repeating-linear-gradient(90deg,${DASH_DOT});-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sp-key-line{display:inline-block;flex:none;width:37px;height:1.5px;background:repeating-linear-gradient(90deg,${DASH_DOT});-webkit-print-color-adjust:exact;print-color-adjust:exact}

.sp-under{display:block;border-top:1px dashed transparent;transition:border-color var(--seq-dur) var(--seq-ease)}
[data-inked="false"] .sp-under{border-top-color:var(--text-faint)}
.sp-under>[data-draw]{display:block;margin-top:-1px;border-top:1px solid var(--line-strong)}
.sp-under--sign{margin:.75rem 0 .5rem}
.sp-under--sign>[data-draw]{border-top-color:var(--human)}

.sp-handoff{--sp-pad:1.25rem;position:relative;display:grid;grid-template-columns:minmax(0,1fr);margin:0;padding:var(--sp-pad) .5rem;list-style:none;overflow:hidden}
@media (min-width:768px){
.sp-handoff{grid-template-columns:minmax(0,1fr) 3.5rem minmax(0,1.08fr) 4.5rem minmax(0,1fr);align-items:start;padding:var(--sp-pad) 1rem}
.sp-handoff>.sp-conn{display:block;align-self:stretch;height:auto;min-height:4rem;padding:0}
.sp-handoff>.sp-conn>.sp-conn-track{position:absolute;left:0;right:0;top:1.25rem;width:auto;height:14px}
.sp-handoff>.sp-conn .sp-conn-line[data-draw]{clip-path:inset(0 calc((1 - var(--draw,1))*100%) 0 0)}
.sp-handoff>.sp-conn .sp-conn-line::before{left:0;right:6px;top:50%;bottom:auto;border-left:0;border-top:1.5px solid currentColor;transform:translateY(-50%)}
.sp-handoff>.sp-conn .sp-conn-line.sp-pencil::before{border-top-width:1px;border-top-style:dashed}
.sp-handoff>.sp-conn .sp-conn-line>svg{left:auto;right:0;top:50%;bottom:auto;transform:translateY(-50%)}
.sp-handoff>.sp-conn>.sp-conn-word{position:absolute;left:50%;top:0;transform:translateX(-50%)}
.sp-handoff>.sp-conn>.sp-pline{left:50%;right:auto;top:calc(-1*var(--sp-pad));bottom:calc(-1*var(--sp-pad));width:1.5px;height:auto;background:repeating-linear-gradient(180deg,${DASH_DOT})}
}

.sp-score{display:grid;gap:6px;margin:0;padding:0;list-style:none}
.sp-box{position:relative;display:block;height:2.5rem;color:var(--accent-ink)}
.sp-box::before,.sp-box::after{content:"";position:absolute;inset:0;transition:opacity var(--seq-dur) var(--seq-ease)}
.sp-box::before{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sp-box::after{outline:1px dashed var(--text-faint);outline-offset:-1px;opacity:0}
.sp-box--clear::before{background:var(--accent)}
.sp-box--finding::before{background:var(--danger)}
.sp-box--unverified::before{background:repeating-linear-gradient(135deg,var(--accent) 0 1.5px,transparent 1.5px 5px);box-shadow:inset 0 0 0 1px var(--accent)}
.sp-box--not-applicable::before,.sp-box--not-checked::before{box-shadow:inset 0 0 0 1px var(--line-bold)}
[data-inked="false"] .sp-box::before{opacity:0}
[data-inked="false"] .sp-box::after{opacity:1}
.sp-box>svg{position:absolute;inset:0;width:16px;height:16px;margin:auto}
.sp-box>svg path{fill:none;stroke:currentColor;stroke-width:2}
.sp-box--key{display:inline-block;flex:none;width:18px;height:18px}
.sp-box--key>svg{width:12px;height:12px}

.sp-rows{margin:0;padding:0;list-style:none;border-bottom:1px solid var(--line-strong)}

.sp-trace-wrap{position:relative}
.sp-trace-list{display:grid;grid-auto-rows:1fr;margin:0;padding:0 0 0 2rem;list-style:none}
.sp-trace{position:absolute;left:.5rem;top:0;bottom:0;border-left:1.5px solid var(--accent)}
.sp-trace.sp-pencil{border-left:1px dashed var(--text-faint)}
[data-seq-state="penciled"] .sp-trace.sp-pencil,[data-seq-state="playing"] .sp-trace.sp-pencil,[data-seq-state="paused"] .sp-trace.sp-pencil,[data-seq-state="stepping"] .sp-trace.sp-pencil{opacity:.85}
.sp-trace-row{position:relative;display:flex;align-items:center;gap:.75rem;min-width:0;padding:.75rem 0;border-bottom:1px solid var(--line)}
.sp-trace-row::before{content:"";position:absolute;left:-1.5rem;bottom:-1px;width:1rem;border-top:1px solid var(--line-strong)}
}`;

export function SpecimenStyles() {
  return (
    <style href="motion-specimens" precedence="default">
      {CSS}
    </style>
  );
}
