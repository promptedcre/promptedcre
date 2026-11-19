import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunBoard } from "@/components/run/run-board";
import { RunStyles } from "@/components/run/run-styles";
import { SceneSwitch } from "@/components/run/scene-switch";
import { nextStop, sceneStops } from "@/components/run/stepping";
import { getDemoRun } from "@/lib/demo/load";
import { choreographyFor, planTimeline, DEFAULT_TOKENS, type RawStep } from "@/lib/motion";

// Stepping through a scene of the recorded run on /run (decision 95, "smoother stepping"):
// Previous step and Next step hold the board at each stop through the motion kit's own
// seq:seek event, so the stop times here must land each stop's changes and none of the next.
// The browser half (SceneStepper, SceneSync) is not run here.

const raw = (role: string, draws = 0): RawStep => ({ role, draws: Array.from({ length: draws }, () => ({ ms: null })), hold: null, drawMs: null, at: null });

describe("the stops of a scene's board", () => {
  // A scene as the board marks it: two rows, what the agent tried and the refusal that draws
  // its cloud, the connector to the person's row, and the person's row.
  const steps = [raw("row"), raw("row"), raw("tried"), raw("refused", 1), raw("then", 1), raw("row")];
  const plan = planTimeline(choreographyFor("scene").resolve(steps, DEFAULT_TOKENS));
  const stops = sceneStops(steps, DEFAULT_TOKENS);

  it("groups the steps the way the kit's own step-through does", () => {
    expect(stops.map((s) => s.steps)).toEqual(plan.stops);
    expect(stops.map((s) => s.steps)).toEqual([[0], [1], [2, 3], [4, 5]]);
  });

  it("holds each stop just after its last change has landed, before anything of the next stop changes", () => {
    const planned = new Map(plan.steps.map((s) => [s.index, s]));
    stops.forEach((stop, i) => {
      for (const index of stop.steps) {
        const step = planned.get(index);
        if (!step) throw new Error(`no step ${index}`);
        expect(stop.at).toBeGreaterThan(step.inkAt ?? step.start);
        for (const d of step.draws) expect(stop.at).toBeGreaterThanOrEqual(d.start + d.duration);
      }
      const next = stops[i + 1];
      if (!next) return;
      const firstChange = Math.min(...next.steps.map((index) => planned.get(index)?.start ?? Number.POSITIVE_INFINITY));
      expect(stop.at, `stop ${i + 1}`).toBeLessThan(firstChange);
    });
  });

  it("moves one stop on or back and never past either end", () => {
    expect(nextStop(-1, 4, 1)).toBe(0);
    expect(nextStop(0, 4, 1)).toBe(1);
    expect(nextStop(3, 4, 1)).toBe(3);
    expect(nextStop(2, 4, -1)).toBe(1);
    expect(nextStop(0, 4, -1)).toBe(0);
    expect(nextStop(-1, 0, 1)).toBe(-1);
  });
});

describe("the stepper on the board", () => {
  const run = getDemoRun();

  it("sits beside the board's own control, in a second controls slot, so pressing it never ends the sequence", () => {
    for (const scene of run.scenes) {
      const html = renderToStaticMarkup(createElement(RunBoard, { scene: scene.id }));
      expect(html, scene.id).toMatch(
        /<span data-seq-controls="" class="seq-slot"><\/span><span data-seq-controls="" class="rs-step" role="group" aria-label="Step through this scene"><button[^>]*>Previous step<\/button><button[^>]*>Next step<\/button><span class="rs-step-at type-label" role="status"><\/span><\/span>/,
      );
    }
  });

  it("eases each move with full motion, marks the current stop, and is not drawn with reduced motion, without scripts or on paper", () => {
    const css = renderToStaticMarkup(createElement(RunStyles));
    expect(css).toContain(".rs-step{display:none}");
    expect(css).toContain("html.js .rs-step{display:inline-flex;");
    expect(css).toContain('html[data-motion="reduced"] .rs-step{display:none}');
    expect(css).toContain(".rs-step{display:none !important}");
    expect(css).toContain('.rb[data-seq-state="paused"] [data-draw]{transition:--draw var(--dur-3) var(--ease-in-out)}');
    expect(css).toContain(".rb [data-rs-current]{border-radius:var(--radius-control);background-color:var(--fill-hover);box-shadow:0 0 0 1px var(--accent)}");
    expect(css).toContain('html[data-motion="reduced"] .rb :is(.rb-item,.rb-read),html[data-motion="reduced"] .rb [data-draw]{transition:none}');
  });

  it("fades a scene in when it is switched to, once, and never with reduced motion", () => {
    // The panels are children, passed as createElement's third argument.
    const props = { tabs: [{ id: "one", title: "One", note: "1 step" }, { id: "two", title: "Two", note: "2 steps" }], label: "Scenes" } as ComponentProps<typeof SceneSwitch>;
    const html = renderToStaticMarkup(createElement(SceneSwitch, props, null));
    expect(html).toContain("html.js .rs-panel[data-rs-enter]{animation:rs-enter var(--dur-3) var(--ease-out)}");
    expect(html).toContain("@media (prefers-reduced-motion:reduce){html.js .rs-panel[data-rs-enter]{animation:none}}");
    expect(html).toContain('html[data-motion="reduced"] .rs-panel[data-rs-enter]{animation:none}');
    expect(html).toContain("@keyframes rs-enter{from{opacity:0}}");
    // Nothing in the server's markup is marked to fade: the first scene painted never does.
    expect(html).not.toContain(" data-rs-enter=");
  });
});
