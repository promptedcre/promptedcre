import type { SeqStart } from "./choreographies";
import { decideStart, stateFrom, type Motion, type SeqState, type ViewVerdict } from "./decide";
import { clearMarks, isOnScreen, onInputInside, onMotionChange, readMotion, viewNow, watchView, type SeqElement } from "./dom";
import { loadGsap, loadPlayback, withTimeout } from "./loader";
import type { Stepper } from "./playback";
import type { Player } from "./player";

// One sequence's life on a page, as a small store the enhancer component reads with
// useSyncExternalStore. Browser only, and all a page with a sequence carries from the
// start: it decides whether the sequence plays, keeps the root's attributes true to its
// phase, pauses it off screen, ends it on any input inside the root, and offers a
// step-through to a reader who asked for less motion. What playing needs (GSAP, and
// lib/motion/playback.ts: the markup reader, the choreographies, the plan, the timeline)
// it fetches through lib/motion/loader.ts when the sequence is about to play. If that
// does not arrive, the root goes to its finished state and stays there.
//
// A page can drive a sequence without importing anything, by dispatching on the root:
//   seq:play   start, or start again        seq:pause   hold
//   seq:end    go to the finished drawing   seq:seek    detail: ms, hold a still at that time
// and can listen for seq:phase (detail: the Phase), which bubbles.

/** How long a sequence that is due to play waits for its code before it gives up and shows the finished drawing. */
export const LOAD_TIMEOUT_MS = 5000;

export type Phase =
  | "server" // not attached: the server's HTML
  | "still" // reduced motion: the finished drawing, no playback
  | "stepping" // reduced motion: a reader is stepping through
  | "idle" // started by a person, not played yet: the finished drawing
  | "waiting" // in pencil until it comes half into view
  | "playing" // also while its code is on the way
  | "paused" // by a person, or held at a still
  | "done" // the finished drawing: it played, input ended it, or it was already on screen
  | "failed"; // its code did not arrive: the finished drawing, no controls

export type SequenceUi = {
  phase: Phase;
  start: SeqStart;
  /** Where the controls render: the page's own [data-seq-controls], the enhancer's own place, or nowhere yet. */
  slot: Element | "self" | null;
  stepThrough: boolean;
  /** In a step-through: the stop shown, counted from 1, and how many there are. */
  step: number;
  stops: number;
};

export type SequenceStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SequenceUi;
  getServerSnapshot(): SequenceUi;
  /** Takes over the root that holds `marker`. Returns the function that lets go of it. */
  attach(marker: Element, options: { hydrating: boolean; stepThrough: boolean }): () => void;
  /** Fetch the playing code now: a person is about to press Play. */
  warm(): void;
  play(): void;
  pause(): void;
  resume(): void;
  end(): void;
  stepStart(): void;
  stepPrev(): void;
  stepNext(): void;
};

type Actions = Pick<SequenceStore, "warm" | "play" | "pause" | "resume" | "end" | "stepStart" | "stepPrev" | "stepNext">;

const SERVER_UI: SequenceUi = { phase: "server", start: "view", slot: null, stepThrough: false, step: 0, stops: 0 };

const noop = () => {};

export function createSequenceStore(): SequenceStore {
  let ui = SERVER_UI;
  let actions: Actions | null = null;
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<SequenceUi>) => {
    ui = { ...ui, ...patch };
    for (const listener of listeners) listener();
  };

  function attach(marker: Element, options: { hydrating: boolean; stepThrough: boolean }): () => void {
    const found = marker.closest("[data-seq]");
    if (!(found instanceof HTMLElement || found instanceof SVGElement)) return noop;
    const root: SeqElement = found;
    // SequenceRoot always writes data-seq-start; a root written by hand plays on view.
    const start: SeqStart = root.getAttribute("data-seq-start") === "user" ? "user" : "view";

    let attached = true;
    let motion: Motion = readMotion();
    let phase: Phase = "server";
    let run = 0; // every start gets a number; a start whose number is stale does nothing
    let player: Player | null = null;
    let stepper: Stepper | null = null;
    let stop = 0;
    let userPaused = false;
    let view: ViewVerdict = viewNow(root);

    const setState = (state: Exclude<SeqState, null>) => root.setAttribute("data-seq-state", state);
    const setPhase = (next: Phase, patch: Partial<SequenceUi> = {}) => {
      phase = next;
      emit({ ...patch, phase: next });
      root.dispatchEvent(new CustomEvent<Phase>("seq:phase", { detail: next, bubbles: true }));
    };
    const killPlayer = () => {
      player?.kill();
      player = null;
    };

    // In pencil as a whole: the root says so, nothing inside is marked.
    const toPenciled = () => {
      killPlayer();
      clearMarks(root);
      root.removeAttribute("data-seq-snap");
      root.setAttribute("data-inked", "false");
      setState("penciled");
    };
    // The finished drawing: exactly the server's markup again, plus data-seq-state="done".
    const toFinished = (snap: boolean) => {
      killPlayer();
      clearMarks(root);
      root.removeAttribute("data-inked");
      if (snap) {
        // No ink transition on the way: the reader asked for the end, not for a faster fade.
        root.setAttribute("data-seq-snap", "");
        requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-seq-snap")));
      } else {
        root.removeAttribute("data-seq-snap");
      }
      setState("done");
    };

    // ---------- Playing ----------

    // Fetch the playing code, build the timeline from the markup, and start it (or hold a
    // still at `seekTo`). Until the code is here the root stays in pencil as a whole.
    const begin = (seekTo: number | null) => {
      const token = ++run;
      userPaused = seekTo !== null;
      setPhase(userPaused ? "paused" : "playing");
      withTimeout(Promise.all([loadGsap(), loadPlayback()]), LOAD_TIMEOUT_MS).then(
        ([gsap, playback]) => {
          if (!attached || token !== run) return;
          const built = playback.preparePlayback(gsap, root, () => {
            if (!attached || token !== run) return;
            toFinished(false);
            setPhase("done");
          });
          if (!built) {
            toFinished(false);
            setPhase("done");
            return;
          }
          // preparePlayback has handed the pencil to the steps; the root lets go of it in the same turn.
          player = built;
          root.removeAttribute("data-inked");
          setState(userPaused ? "paused" : "playing");
          if (seekTo !== null) built.seek(seekTo);
          else if (!userPaused && view !== "out") built.play();
        },
        () => {
          if (!attached || token !== run) return;
          toFinished(false);
          setPhase("failed");
        },
      );
    };

    // A reader who asked for less motion never needs GSAP: a step-through is attributes alone.
    const warm = () => {
      if (motion === "full") void loadGsap().catch(noop);
      void loadPlayback().catch(noop);
    };
    const resume = () => {
      if (phase !== "paused") return;
      userPaused = false;
      if (player) {
        setState("playing");
        if (view !== "out") player.resume();
      }
      setPhase("playing");
    };
    const play = () => {
      if (motion !== "full" || phase === "playing" || phase === "server") return;
      if (phase === "paused") return resume();
      toPenciled();
      begin(null);
    };
    const pause = () => {
      if (phase !== "playing") return;
      userPaused = true;
      if (player) {
        player.pause();
        setState("paused");
      }
      setPhase("paused");
    };
    const end = () => {
      if (phase !== "waiting" && phase !== "playing" && phase !== "paused") return;
      run += 1;
      toFinished(true);
      setPhase("done");
    };
    const seek = (ms: number) => {
      if (motion !== "full" || phase === "server") return;
      if (player) {
        userPaused = true;
        player.seek(ms);
        setState("paused");
        setPhase("paused");
        return;
      }
      toPenciled();
      begin(ms);
    };

    // ---------- Stepping through (reduced motion) ----------

    const stepShow = (count: number) => {
      if (!stepper) return;
      stop = count;
      setState("stepping");
      stepper.show(count);
      setPhase("stepping", { step: count, stops: stepper.stops });
    };
    const stepStart = () => {
      if (phase !== "still") return;
      const token = ++run;
      loadPlayback().then((playback) => {
        if (!attached || token !== run || phase !== "still") return;
        stepper = playback.prepareStepper(root);
        if (stepper) stepShow(1);
      }, noop);
    };
    const stepMove = (by: number) => {
      if (phase !== "stepping" || !stepper) return;
      const next = Math.min(stepper.stops, Math.max(1, stop + by));
      if (next !== stop) stepShow(next);
    };
    const stepExit = () => {
      stepper = null;
      stop = 0;
      toFinished(true);
      setPhase("still", { step: 0, stops: 0 });
    };

    // ---------- What the page tells it ----------

    const onView = (verdict: ViewVerdict) => {
      view = verdict;
      if (verdict === "in") {
        if (phase === "waiting") begin(null);
        else if (phase === "playing" && !userPaused) player?.resume();
      } else if (verdict === "out" && phase === "playing") {
        player?.pause();
      }
    };
    const onNear = () => {
      if (phase === "waiting") warm();
    };
    const onMotion = () => {
      // The reader changed their motion setting while the page was open. html[data-motion],
      // where the layout set one, still has the last word (readMotion).
      const resolved = readMotion();
      if (resolved === motion) return;
      motion = resolved;
      run += 1;
      if (motion === "reduced") {
        if (phase !== "still" && phase !== "stepping") {
          toFinished(true);
          setPhase("still", { step: 0, stops: 0 });
        }
      } else if (phase === "still" || phase === "stepping") {
        if (phase === "stepping") stepExit();
        setPhase(start === "user" ? "idle" : "done");
      }
    };
    const onPrint = () => {
      if (phase === "stepping") stepExit();
      else end();
    };
    const onSeek = (e: Event) => seek(e instanceof CustomEvent && typeof e.detail === "number" ? e.detail : 0);

    // ---------- Taking over ----------

    // The state the root arrives in: "penciled" when its pre-paint script ran with full
    // motion, none when it is the server's finished HTML. lib/motion/decide.ts has the rule.
    const arrived = stateFrom(root.getAttribute("data-seq-state"));
    const decision = decideStart({ scripts: true, motion, start, state: arrived, hydrating: options.hydrating, inView: isOnScreen(root) });
    // Claim the root: the pre-paint script's timer leaves a claimed root alone.
    root.setAttribute("data-seq-live", "");
    const slotEl = [...root.querySelectorAll("[data-seq-controls]")].find((el) => el.closest("[data-seq]") === root);
    const base: Partial<SequenceUi> = { start, slot: slotEl ?? "self", stepThrough: options.stepThrough, step: 0, stops: 0 };
    if (decision.mode === "auto") {
      if (decision.pencil || arrived !== "penciled") toPenciled();
      setPhase("waiting", base);
    } else {
      // Every other mode shows the finished drawing. A root left in pencil (a reader who
      // turned motion down after the page loaded) is inked without ceremony.
      if (arrived !== null && arrived !== "done") toFinished(true);
      setPhase(decision.mode === "manual" ? "idle" : decision.mode === "still" ? "still" : "done", base);
    }

    actions = { warm, play, pause, resume, end, stepStart, stepPrev: () => stepMove(-1), stepNext: () => stepMove(1) };
    const stopView = motion === "full" ? watchView(root, onView, onNear) : noop;
    const stopInput = onInputInside(root, end, () => {
      // Keyboard focus has landed in a drawing that is still in pencil: do not make the reader wait for a scroll.
      if (phase === "waiting") end();
    });
    const stopMotion = onMotionChange(onMotion);
    window.addEventListener("beforeprint", onPrint);
    root.addEventListener("seq:play", play);
    root.addEventListener("seq:pause", pause);
    root.addEventListener("seq:end", end);
    root.addEventListener("seq:seek", onSeek);

    return () => {
      attached = false;
      run += 1;
      stopView();
      stopInput();
      stopMotion();
      window.removeEventListener("beforeprint", onPrint);
      root.removeEventListener("seq:play", play);
      root.removeEventListener("seq:pause", pause);
      root.removeEventListener("seq:end", end);
      root.removeEventListener("seq:seek", onSeek);
      // Leave the root as the next enhancer should find it: an auto sequence that has not
      // finished goes back to pencil as a whole (it will play for whoever mounts next, which
      // in development is this same component, mounted twice); anything else is finished.
      if (phase === "waiting" || (start === "view" && (phase === "playing" || phase === "paused"))) toPenciled();
      else if (phase === "playing" || phase === "paused" || phase === "stepping") toFinished(true);
      killPlayer();
      root.removeAttribute("data-seq-live");
      actions = null;
      ui = SERVER_UI;
    };
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => ui,
    getServerSnapshot: () => SERVER_UI,
    attach,
    warm: () => actions?.warm(),
    play: () => actions?.play(),
    pause: () => actions?.pause(),
    resume: () => actions?.resume(),
    end: () => actions?.end(),
    stepStart: () => actions?.stepStart(),
    stepPrev: () => actions?.stepPrev(),
    stepNext: () => actions?.stepNext(),
  };
}
