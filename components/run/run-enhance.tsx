"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { tokensFrom, type RawStep } from "@/lib/motion";
import { nextStop, sceneStops, type SceneStop } from "./stepping";

// The small things on /run that need a script. All are enhancements: with scripts off the
// scenes still switch (links and :target, scene-switch.tsx), every fold still opens by
// itself, and each board is the finished drawing.

// The URL's fragment as an element id; "" when there is none or it does not decode.
function fragment(): string {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return "";
  }
}

// The mark the site's router leaves on a history entry it can come back to (__NA, in
// next/dist/client/components/app-router.js). The state is only ever copied whole, never read.
function isRouterState(state: unknown): boolean {
  return typeof state === "object" && state !== null && "__NA" in state;
}

// SceneSync: says which scene is the current one to assistive technology. CSS shows the
// scene the URL targets, but CSS cannot set ARIA, so on load and on every hash change this
// puts aria-current on the tab whose scene is shown and takes it off the others. Renders a
// hidden marker inside the SceneSwitch root, which is how it finds its tabs.
//
// It also mends two gaps between the browser's own jump to a fragment, which is what makes
// :target work, and the router:
//   1. A link from another page of the site, or Back onto this page, arrives without a
//      page load, and the browser then never marks the URL's fragment as the :target, so
//      the first scene would show instead of the one asked for. Going to the same address
//      again, in place, is a real jump to the fragment: it sets :target and adds nothing
//      to the history. It runs in a layout effect, so the right scene is the first one painted.
//   2. A history entry the browser makes for a tab or a "then" link carries none of the
//      router's state, and the router ignores Back and Forward onto an entry without it:
//      the address would change and the page would not. So the state this page arrived
//      with is put back on each such entry (same page, same state; only the fragment differs).
export function SceneSync() {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = marker.current?.closest(".rs-root");
    if (!root) return;
    let routerState: unknown = null;
    const keepRouterState = () => {
      const state: unknown = window.history.state;
      if (isRouterState(state)) routerState = state;
      else if (routerState !== null) window.history.replaceState(routerState, "", window.location.href);
    };
    keepRouterState();
    const asked = fragment();
    if (asked && document.getElementById(asked) && !document.querySelector(":target")) {
      window.location.replace(window.location.href);
      keepRouterState();
    }
    // The scene shown last, so a switch to another one (a tab, a "then" link, Back) can be
    // marked to fade in (data-rs-enter, scene-switch.tsx); the first one painted never is,
    // and a jump to a row inside the scene already shown is not a switch.
    let shown: HTMLElement | undefined;
    const sync = () => {
      const panels = [...root.querySelectorAll<HTMLElement>(":scope > .rs-panels > .rs-panel")];
      const id = fragment();
      const target = id ? document.getElementById(id) : null;
      const current = panels.find((p) => target !== null && (p === target || p.contains(target))) ?? panels[0];
      for (const tab of root.querySelectorAll<HTMLAnchorElement>(".rs-tab > a")) {
        if (current && tab.getAttribute("href") === `#${current.id}`) tab.setAttribute("aria-current", "true");
        else tab.removeAttribute("aria-current");
      }
      if (shown && current && current !== shown) {
        for (const p of panels) p.removeAttribute("data-rs-enter");
        current.setAttribute("data-rs-enter", "");
      }
      shown = current;
    };
    const onHashChange = () => {
      keepRouterState();
      sync();
    };
    sync();
    // Once more after this commit: on a first load the router may write its state after this effect.
    const late = window.setTimeout(keepRouterState, 0);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.clearTimeout(late);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);
  return <span ref={marker} hidden />;
}

// OpenCommands: opens (or closes again) the engine's command under every step of one
// scene, so the whole scene can be read as the engine printed it without opening each
// fold. It acts on the folds of the scene it sits in. Hidden while scripts are off
// (.js-only), where each fold opens on its own.
export function OpenCommands({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const scene = e.currentTarget.closest(".rs-panel");
    if (!scene) return;
    const next = !open;
    for (const fold of scene.querySelectorAll<HTMLDetailsElement>("details.rb-fold")) fold.open = next;
    setOpen(next);
  };
  return (
    <Button variant="secondary" size="sm" aria-expanded={open} onClick={toggle} className="js-only print:hidden">
      {open ? "Close" : "Open"} all {count} {count === 1 ? "command" : "commands"}
    </Button>
  );
}

// ---------- Stepping through a board ----------

// The board's steps and what each draws, read off the markup by the rules the motion kit
// reads it by (docs/MOTION.md; lib/motion/read.ts, which only the kit's own on-demand code
// may import): every [data-seq-step] of this root that is laid out, in DOM order; for each,
// the drawable around it when it claims one, itself when it is one, and the ones inside it.
function readBoard(root: Element): { els: Element[]; raw: RawStep[] } {
  const owns = (el: Element) => el.closest("[data-seq]") === root;
  const laidOut = (el: Element) => el.getClientRects().length > 0;
  const num = (el: Element, name: string) => {
    const value = el.getAttribute(name);
    if (value === null || value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const ease = (el: Element) => {
    const value = el.getAttribute("data-draw-ease");
    return value === "out" || value === "inout" || value === "linear" ? value : null;
  };
  const els = [...root.querySelectorAll("[data-seq-step]")].filter((el) => owns(el) && laidOut(el));
  const raw = els.map((el): RawStep => {
    const around = el.getAttribute("data-seq-draws") === "around" ? el.parentElement?.closest("[data-draw]") : null;
    const draws = [...(around ? [around] : []), ...(el.hasAttribute("data-draw") ? [el] : []), ...el.querySelectorAll("[data-draw]")].filter(
      (d) => owns(d) && !d.hasAttribute("data-seq-trace") && laidOut(d),
    );
    return {
      role: (el.getAttribute("data-seq-step") ?? "").trim(),
      draws: draws.map((d) => ({ ms: num(d, "data-draw-ms"), ease: ease(d) })),
      hold: num(el, "data-seq-hold"),
      drawMs: num(el, "data-seq-draw"),
      at: num(el, "data-seq-at"),
    };
  });
  return { els, raw };
}

// SceneStepper: Previous step and Next step for one scene's board, with full motion (a reader
// who asked for less motion gets the kit's own step-through, which changes state at once). A
// press holds the board at the next or the previous stop through the kit's own seq:seek
// event: the timeline moves there, each step that changes goes from pencil to ink or back on
// the kit's ink transition, a stroke eases to its new length (run-styles.tsx), and the stop's
// row is marked as the current one (data-rs-current). The board keeps its layout. Next on the
// last stop finishes the board (seq:end); Play or Resume plays on from where it stands. Its
// buttons sit in a second [data-seq-controls] of the root, so pressing them does not end the
// sequence the way a click on the drawing does. Hidden while scripts are off, with reduced
// motion and on paper (.rs-step).
export function SceneStepper() {
  const marker = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState(-1);
  const [count, setCount] = useState(0);

  const rootOf = () => marker.current?.closest("[data-seq]") ?? null;
  const mark = (root: Element, els: Element[], stop: SceneStop | undefined) => {
    for (const el of root.querySelectorAll("[data-rs-current]")) el.removeAttribute("data-rs-current");
    if (!stop) return;
    for (const i of stop.steps) els[i]?.closest(".rb-item, .rb-read")?.setAttribute("data-rs-current", "");
  };

  useEffect(() => {
    const root = rootOf();
    if (!root) return;
    // When the board plays on, finishes or is taken back to its start, no stop is held.
    const onPhase = (e: Event) => {
      if (!(e instanceof CustomEvent) || e.detail === "paused") return;
      for (const el of root.querySelectorAll("[data-rs-current]")) el.removeAttribute("data-rs-current");
      if (e.detail !== "stepping" && e.detail !== "still") setAt(-1);
    };
    root.addEventListener("seq:phase", onPhase);
    return () => root.removeEventListener("seq:phase", onPhase);
  }, []);

  const go = (by: 1 | -1) => {
    const root = rootOf();
    if (!root) return;
    const { els, raw } = readBoard(root);
    const style = getComputedStyle(root);
    const stops = sceneStops(raw, tokensFrom((name) => style.getPropertyValue(name)));
    setCount(stops.length);
    if (by === 1 && at >= stops.length - 1) {
      root.dispatchEvent(new CustomEvent("seq:end"));
      mark(root, els, undefined);
      setAt(-1);
      return;
    }
    const i = nextStop(at, stops.length, by);
    const stop = stops[i];
    if (!stop) return;
    root.dispatchEvent(new CustomEvent("seq:seek", { detail: stop.at }));
    mark(root, els, stop);
    setAt(i);
  };

  return (
    <span ref={marker} data-seq-controls="" className="rs-step" role="group" aria-label="Step through this scene">
      <Button variant="secondary" size="sm" aria-disabled={at <= 0} onClick={at <= 0 ? undefined : () => go(-1)}>
        Previous step
      </Button>
      <Button variant="secondary" size="sm" onClick={() => go(1)}>
        Next step
      </Button>
      <span className="rs-step-at type-label" role="status">
        {at >= 0 && count > 0 ? `Step ${at + 1} of ${count}` : ""}
      </span>
    </span>
  );
}
