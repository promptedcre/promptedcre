import { describe, expect, it } from "vitest";
import { VIEW, decideStart, motionFrom, shouldAutoPlay, stateFrom, viewVerdict, type Motion, type SeqState, type StartFacts } from "@/lib/motion/decide";
import { PREPAINT_FAILSAFE_MS, PREPAINT_SCRIPT } from "@/lib/motion/prepaint";

// The decisions a sequence makes before anything moves: does it play by itself, may it be
// put in pencil, is it in view. And the pre-paint script itself, run here against a
// stand-in document, so the string that ships is the string that is tested.

const facts = (over: Partial<StartFacts> = {}): StartFacts => ({
  scripts: true,
  motion: "full",
  start: "view",
  state: null,
  hydrating: true,
  inView: true,
  ...over,
});

const MOTIONS: Motion[] = ["full", "reduced"];
const STATES: SeqState[] = [null, "penciled", "playing", "paused", "stepping", "done"];
const BOOLS = [true, false];

function everyCase(): StartFacts[] {
  const all: StartFacts[] = [];
  for (const scripts of BOOLS)
    for (const motion of MOTIONS)
      for (const start of ["view", "user"] as const)
        for (const state of STATES) for (const hydrating of BOOLS) for (const inView of BOOLS) all.push({ scripts, motion, start, state, hydrating, inView });
  return all;
}

describe("should this sequence play by itself", () => {
  it("plays when scripts run, motion is full, it starts on view and the pre-paint script put it in pencil", () => {
    expect(decideStart(facts({ state: "penciled" }))).toEqual({ mode: "auto", pencil: false });
    expect(shouldAutoPlay(facts({ state: "penciled", inView: false }))).toBe(true);
  });

  it("never runs with scripts off", () => {
    for (const f of everyCase().filter((x) => !x.scripts)) expect(decideStart(f)).toEqual({ mode: "off", pencil: false });
  });

  it("never plays, and is never put in pencil, for a reader who asked for less motion", () => {
    for (const f of everyCase().filter((x) => x.scripts && x.motion === "reduced")) {
      expect(decideStart(f)).toEqual({ mode: "still", pencil: false });
      expect(shouldAutoPlay(f)).toBe(false);
    }
  });

  it("waits for its control when a person starts it", () => {
    for (const f of everyCase().filter((x) => x.scripts && x.motion === "full" && x.start === "user")) {
      expect(decideStart(f)).toEqual({ mode: "manual", pencil: false });
    }
  });

  it("plays once per page view: a sequence that is done is not played again", () => {
    for (const hydrating of BOOLS) for (const inView of BOOLS) expect(decideStart(facts({ state: "done", hydrating, inView }))).toEqual({ mode: "seen", pencil: false });
  });

  it("is put in pencil on a client-side navigation, before the new page is first painted", () => {
    expect(decideStart(facts({ hydrating: false, inView: true }))).toEqual({ mode: "auto", pencil: true });
    expect(decideStart(facts({ hydrating: false, inView: false }))).toEqual({ mode: "auto", pencil: true });
  });

  it("is left finished when the browser may already have painted it in ink and it is on screen", () => {
    // The page was hydrated, the pre-paint script did not run (state is still null), and the drawing is in view.
    expect(decideStart(facts({ hydrating: true, inView: true }))).toEqual({ mode: "seen", pencil: false });
    // Off screen, nobody is looking: pencil it now and play it when it arrives.
    expect(decideStart(facts({ hydrating: true, inView: false }))).toEqual({ mode: "auto", pencil: true });
  });

  it("only ever pencils a drawing nobody can have seen in ink", () => {
    for (const f of everyCase()) {
      const d = decideStart(f);
      if (!d.pencil) continue;
      expect(d.mode).toBe("auto");
      expect(f).toMatchObject({ scripts: true, motion: "full", start: "view", state: null });
      expect(!f.hydrating || !f.inView).toBe(true);
    }
  });

  it("agrees with itself: it plays by itself exactly when the mode is auto", () => {
    for (const f of everyCase()) expect(shouldAutoPlay(f)).toBe(decideStart(f).mode === "auto");
  });
});

describe("reading the page", () => {
  it("takes html[data-motion] as the layout set it, and the media query when it is missing", () => {
    expect(motionFrom("full", true)).toBe("full");
    expect(motionFrom("reduced", false)).toBe("reduced");
    expect(motionFrom(null, true)).toBe("reduced");
    expect(motionFrom(null, false)).toBe("full");
    expect(motionFrom("nonsense", true)).toBe("reduced");
    expect(motionFrom(undefined, false)).toBe("full");
  });

  it("reads a root's state, and takes anything else for the server's finished HTML", () => {
    for (const s of ["penciled", "playing", "paused", "stepping", "done"]) expect(stateFrom(s)).toBe(s);
    for (const s of [null, undefined, "", "inked", "true"]) expect(stateFrom(s)).toBeNull();
  });
});

describe("in view", () => {
  it("is in when half of the root shows", () => {
    expect(viewVerdict(0.5, 200, 900)).toBe("in");
    expect(viewVerdict(1, 400, 900)).toBe("in");
    expect(viewVerdict(0.49, 196, 900)).toBe("between");
  });

  it("is in when a root taller than the screen fills half of the viewport", () => {
    // A root 2400 px tall on an 844 px phone: half of it can never show at once.
    expect(viewVerdict(422 / 2400, 422, 844)).toBe("in");
    expect(viewVerdict(300 / 2400, 300, 844)).toBe("between");
  });

  it("is out only when it has all but left, so a root on the edge does not stutter", () => {
    expect(viewVerdict(0.19, 80, 900)).toBe("out");
    expect(viewVerdict(0, 0, 900)).toBe("out");
    expect(viewVerdict(0.3, 120, 900)).toBe("between");
    expect(viewVerdict(0.1, 0.1 * 2400, 844)).toBe("between");
    expect(VIEW.leave).toBeLessThan(VIEW.enter);
  });

  it("does not divide by a viewport that has no height", () => {
    expect(viewVerdict(0.6, 10, 0)).toBe("in");
    expect(viewVerdict(0, 10, 0)).toBe("out");
  });
});

// ---------- The pre-paint script, as shipped ----------

type Timer = { fn: () => void; ms: number };

function runPrePaint(page: { motion?: string | null; prefersReduced?: boolean; attributes?: Record<string, string>; matchMedia?: boolean; root?: boolean }) {
  const attributes = new Map(Object.entries({ "data-seq": "handoff", ...page.attributes }));
  const root = {
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
  const timers: Timer[] = [];
  const document = {
    currentScript: page.root === false ? null : { parentElement: root },
    documentElement: { getAttribute: (name: string) => (name === "data-motion" ? (page.motion ?? null) : null) },
  };
  const window = page.matchMedia === false ? {} : { matchMedia: () => ({ matches: page.prefersReduced ?? false }) };
  const setTimeout = (fn: () => void, ms: number) => timers.push({ fn, ms });
  new Function("document", "window", "setTimeout", PREPAINT_SCRIPT)(document, window, setTimeout);
  return { attributes, timers };
}

describe("the pre-paint script", () => {
  it("puts the root, and only the root, in pencil when motion is full", () => {
    const { attributes, timers } = runPrePaint({ motion: "full" });
    expect(Object.fromEntries(attributes)).toEqual({ "data-seq": "handoff", "data-seq-state": "penciled", "data-inked": "false" });
    expect(timers.map((t) => t.ms)).toEqual([PREPAINT_FAILSAFE_MS]);
  });

  it("changes nothing for a reader who asked for less motion", () => {
    for (const page of [{ motion: "reduced" }, { motion: "reduced", prefersReduced: false }, { motion: null, prefersReduced: true }]) {
      const { attributes, timers } = runPrePaint(page);
      expect(Object.fromEntries(attributes)).toEqual({ "data-seq": "handoff" });
      expect(timers).toHaveLength(0);
    }
  });

  it("falls back to the media query when the layout's script has not set data-motion", () => {
    expect(runPrePaint({ motion: null, prefersReduced: false }).attributes.get("data-seq-state")).toBe("penciled");
    expect(runPrePaint({ motion: "nonsense", prefersReduced: true }).attributes.has("data-seq-state")).toBe(false);
    // The attribute wins over the media query, as it does everywhere else.
    expect(runPrePaint({ motion: "full", prefersReduced: true }).attributes.get("data-seq-state")).toBe("penciled");
    // No matchMedia at all: full motion.
    expect(runPrePaint({ motion: null, matchMedia: false }).attributes.get("data-seq-state")).toBe("penciled");
  });

  it("inks the drawing itself when no enhancer has claimed the root by the time its timer fires", () => {
    const { attributes, timers } = runPrePaint({ motion: "full" });
    timers[0]?.fn();
    expect(Object.fromEntries(attributes)).toEqual({ "data-seq": "handoff", "data-seq-state": "done" });
  });

  it("leaves a root alone once an enhancer has claimed it, or once it is no longer in pencil", () => {
    const claimed = runPrePaint({ motion: "full" });
    claimed.attributes.set("data-seq-live", "");
    claimed.timers[0]?.fn();
    expect(claimed.attributes.get("data-seq-state")).toBe("penciled");
    expect(claimed.attributes.get("data-inked")).toBe("false");

    const played = runPrePaint({ motion: "full" });
    played.attributes.set("data-seq-state", "playing");
    played.timers[0]?.fn();
    expect(played.attributes.get("data-seq-state")).toBe("playing");
  });

  it("does nothing to a root that already has a state, to an element that is not a root, or without a script element", () => {
    expect(Object.fromEntries(runPrePaint({ motion: "full", attributes: { "data-seq-state": "done" } }).attributes)).toEqual({ "data-seq": "handoff", "data-seq-state": "done" });
    // An element with no data-seq: the script was pasted somewhere it does not belong.
    const bare = new Map<string, string>();
    const document = {
      currentScript: { parentElement: { hasAttribute: (n: string) => bare.has(n), getAttribute: (n: string) => bare.get(n) ?? null, setAttribute: (n: string, v: string) => void bare.set(n, v), removeAttribute: () => {} } },
      documentElement: { getAttribute: () => "full" },
    };
    new Function("document", "window", "setTimeout", PREPAINT_SCRIPT)(document, {}, () => 0);
    expect(bare.size).toBe(0);
    expect(() => runPrePaint({ motion: "full", root: false })).not.toThrow();
  });

  it("makes the choice decideStart makes for a page nobody has seen yet", () => {
    for (const motion of MOTIONS) {
      const scripted = runPrePaint({ motion }).attributes.get("data-seq-state") === "penciled";
      expect(scripted).toBe(decideStart(facts({ motion, state: null, hydrating: false })).pencil);
    }
  });

  it("is one self-contained expression with no markup in it", () => {
    expect(PREPAINT_SCRIPT.startsWith("(function(){")).toBe(true);
    expect(PREPAINT_SCRIPT.endsWith("})()")).toBe(true);
    expect(PREPAINT_SCRIPT).not.toMatch(/<\/?script|<!--/i);
  });
});
