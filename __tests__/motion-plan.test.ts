import { describe, expect, it } from "vitest";
import { CHOREOGRAPHIES, SCORE, TRACE, assignStops, choreographyFor, handoffTiming, type RawStep } from "@/lib/motion/choreographies";
import { planTimeline, traceAt, type StepInput } from "@/lib/motion/plan";
import { DEFAULT_TOKENS, cubicBezier, parseBezier, parseTime, tokensFrom } from "@/lib/motion/tokens";

// The pure half of the motion kit: a list of step descriptors in, a timeline plan out
// (order, durations, holds, total length), and the named choreographies' timing tables.
// docs/MOTION.md prints the totals asserted here; change one and change the other.

const T = DEFAULT_TOKENS;

const step = (over: Partial<StepInput> = {}): StepInput => ({ draws: [], ink: "after", settle: 200, hold: 0, advance: null, stop: 0, ...over });

const raw = (role: string, draws = 0, over: Partial<RawStep> = {}): RawStep => ({
  role,
  draws: Array.from({ length: draws }, () => ({ ms: null })),
  hold: null,
  drawMs: null,
  at: null,
  ...over,
});

const planOf = (name: string, steps: RawStep[]) => planTimeline(choreographyFor(name).resolve(steps, T));

describe("planTimeline", () => {
  it("plays the steps in DOM order: each draws its strokes one after another, inks, settles and holds before the next starts", () => {
    const plan = planTimeline({
      lead: 100,
      tail: 0,
      steps: [step({ draws: [{ ms: 300 }, { ms: 100 }], hold: 50, stop: 0 }), step({ stop: 1 })],
    });
    expect(plan.steps.map((s) => s.index)).toEqual([0, 1]);
    const [a, b] = plan.steps;
    expect(a).toMatchObject({ start: 100, inkAt: 500, settled: 700, end: 750 });
    expect(a?.draws.map((d) => [d.draw, d.start, d.duration, d.from, d.to, d.ease, d.target])).toEqual([
      [0, 100, 300, 0, 1, "out", "own"],
      [1, 400, 100, 0, 1, "out", "own"],
    ]);
    expect(b).toMatchObject({ start: 750, inkAt: 750, settled: 950, end: 950, draws: [] });
    expect(plan.total).toBe(950);
    expect(plan.stops).toEqual([[0], [1]]);
  });

  it("inks a connector as its line starts, and is done when the line is", () => {
    const plan = planTimeline({ lead: 0, tail: 0, steps: [step({ draws: [{ ms: 450 }], ink: "start", settle: 0 }), step()] });
    expect(plan.steps[0]).toMatchObject({ start: 0, inkAt: 0, settled: 450, end: 450 });
    expect(plan.steps[1]?.start).toBe(450);
  });

  it("leaves a step that inks nothing without an ink time", () => {
    const plan = planTimeline({ lead: 0, tail: 0, steps: [step({ draws: [{ ms: 120 }], ink: "none" })] });
    expect(plan.steps[0]).toMatchObject({ inkAt: null, settled: 120 });
    expect(plan.total).toBe(120);
  });

  it("overlaps steps that advance before they have settled, and still ends when the last change has settled", () => {
    const plan = planTimeline({ lead: 0, tail: 0, steps: [step({ advance: 60 }), step({ advance: 60 }), step({ advance: 60 })] });
    expect(plan.steps.map((s) => s.start)).toEqual([0, 60, 120]);
    expect(plan.total).toBe(320);
  });

  it("does not count the hold after the last step, and adds the tail", () => {
    const plan = planTimeline({ lead: 50, tail: 30, steps: [step({ hold: 900 })] });
    expect(plan.steps[0]?.end).toBe(1150);
    expect(plan.total).toBe(280);
    expect(planTimeline({ lead: 50, tail: 30, steps: [] }).total).toBe(80);
  });

  it("follows a given play order and ignores one that is not a permutation of the steps", () => {
    const steps = [step({ stop: 1 }), step({ stop: 0 }), step({ stop: 1 })];
    const plan = planTimeline({ lead: 0, tail: 0, steps, order: [1, 0, 2] });
    expect(plan.steps.map((s) => s.index)).toEqual([1, 0, 2]);
    expect(plan.steps.map((s) => s.start)).toEqual([0, 200, 400]);
    expect(plan.stops).toEqual([[1], [0, 2]]);
    for (const order of [[0, 1], [0, 0, 1], [0, 1, 3], [0.5, 1, 2]]) {
      expect(planTimeline({ lead: 0, tail: 0, steps, order }).steps.map((s) => s.index)).toEqual([0, 1, 2]);
    }
  });

  it("treats a negative or broken time as none, and keeps --draw between 0 and 1", () => {
    const plan = planTimeline({
      lead: -5,
      tail: Number.NaN,
      steps: [step({ draws: [{ ms: -100, from: -1, to: 4 }, { ms: Number.POSITIVE_INFINITY }], settle: -1, hold: -1 })],
    });
    expect(plan.steps[0]).toMatchObject({ start: 0, inkAt: 0, settled: 0, end: 0 });
    expect(plan.steps[0]?.draws.map((d) => [d.duration, d.from, d.to])).toEqual([
      [0, 0, 1],
      [0, 0, 1],
    ]);
    expect(plan.total).toBe(0);
  });

  it("numbers a step's own strokes apart from the trace line", () => {
    const plan = planTimeline({
      lead: 0,
      tail: 0,
      steps: [step({ draws: [{ ms: 100, target: "trace", to: 0.5, ease: "linear" }, { ms: 50 }, { ms: 50 }] })],
    });
    expect(plan.steps[0]?.draws.map((d) => [d.target, d.draw, d.start])).toEqual([
      ["trace", 0, 0],
      ["own", 0, 100],
      ["own", 1, 150],
    ]);
  });

  it("says where the trace line stands at each stop of a step-through", () => {
    const plan = planTimeline({
      lead: 0,
      tail: 0,
      steps: [0.25, 0.5, 1].map((to, i) => step({ stop: i, draws: [{ ms: 100, target: "trace", from: i === 0 ? 0 : [0.25, 0.5][i - 1], to }] })),
    });
    expect([0, 1, 2].map((stop) => traceAt(plan, stop))).toEqual([0.25, 0.5, 1]);
    expect(traceAt(plan, -1)).toBe(0);
    expect(traceAt(planTimeline({ lead: 0, tail: 0, steps: [step()] }), 0)).toBeNull();
  });
});

describe("the choreographies", () => {
  it("knows the four named sequences and plays any other name by the generic rule", () => {
    expect(Object.keys(CHOREOGRAPHIES).sort()).toEqual(["handoff", "scene", "score", "steps", "trace"]);
    expect(choreographyFor("handoff").name).toBe("handoff");
    for (const name of ["", "anything-else", "toString", "constructor"]) expect(choreographyFor(name).name).toBe("steps");
  });

  it("starts a scene only when a person asks, and every other sequence when it comes into view", () => {
    expect(choreographyFor("scene").start).toBe("user");
    for (const name of ["handoff", "trace", "score", "steps"]) expect(choreographyFor(name).start).toBe("view");
  });

  it("groups connectors with the step they lead to, and a trailing detail with the step before it", () => {
    expect(assignStops(["own", "reach", "tried", "refused", "cross", "person", "record"], ["reach", "tried", "cross"], ["record"])).toEqual([0, 1, 1, 1, 2, 2, 2]);
    expect(assignStops(["own", "reach", "refused", "cross", "person", "record"], ["reach", "tried", "cross"], ["record"])).toEqual([0, 1, 1, 2, 2, 2]);
    expect(assignStops(["a", "b", "c"], ["then"])).toEqual([0, 1, 2]);
    expect(assignStops(["then", "then", "a"], ["then"])).toEqual([0, 0, 0]);
    expect(assignStops(["record", "a"], [], ["record"])).toEqual([0, 1]);
  });

  // The handoff specimen's markup: the agent's step and its check; the connector; the
  // step the agent tries; its refusal and the cloud; the connector across the property
  // line; the person's mark; the record and the line it is signed on.
  const handoff = [raw("own", 1), raw("reach", 1), raw("tried"), raw("refused", 1), raw("cross", 1), raw("person"), raw("record", 1)];

  it("M1, the handoff: about five seconds, with the pauses where a person reads", () => {
    const plan = planOf("handoff", handoff);
    const [own, reach, tried, refused, cross, person, record] = plan.steps;
    expect(plan.steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // A beat of pencil, then the agent's check draws and its step inks.
    expect(own).toMatchObject({ start: 300, inkAt: 620, settled: 820, end: 1070 });
    // The agent reaches the person's step, and tries it.
    expect(reach).toMatchObject({ start: 1070, inkAt: 1470, end: 1470 });
    expect(tried).toMatchObject({ start: 1470, inkAt: 1470, settled: 1670, end: 1820 });
    // The cloud is drawn around it (the longest stroke), then "Refused." sets.
    expect(refused?.draws[0]).toMatchObject({ start: 1820, duration: 900 });
    expect(refused).toMatchObject({ inkAt: 2720, settled: 2920, end: 3920 });
    // The connector crosses to the person's position; the mark inks; the record sets.
    expect(cross).toMatchObject({ start: 3920, inkAt: 4370, end: 4370 });
    expect(person).toMatchObject({ start: 4370, inkAt: 4370, end: 4720 });
    expect(record).toMatchObject({ start: 4720, inkAt: 5040, settled: 5240 });
    expect(plan.total).toBe(5240);
    expect(plan.total).toBeGreaterThan(4500);
    expect(plan.total).toBeLessThan(5500);
    // The reason stays on screen for at least a second before anything else moves.
    expect((cross?.start ?? 0) - (refused?.settled ?? 0)).toBeGreaterThanOrEqual(1000);
    // Three stops for a reader who steps through: the three positions.
    expect(plan.stops).toEqual([[0], [1, 2, 3], [4, 5, 6]]);
  });

  it("M1 draws its long strokes at a pen's pace and its short ones with a flick", () => {
    const plan = planOf("handoff", handoff);
    const ease = (i: number) => plan.steps[i]?.draws[0]?.ease;
    // The cloud and the two connectors ease in and out; the check and the line to sign on ease out.
    expect([0, 1, 3, 4, 6].map(ease)).toEqual(["out", "inout", "inout", "inout", "out"]);
    // The markup can say otherwise, stroke by stroke.
    const steady = planOf("handoff", [raw("refused", 1, { draws: [{ ms: null, ease: "linear" }] })]);
    expect(steady.steps[0]?.draws[0]).toMatchObject({ duration: 900, ease: "linear" });
  });

  it("M1 without the step the agent tries: the refusal inks the whole position after its cloud", () => {
    const plan = planOf("handoff", [raw("own", 1), raw("reach", 1), raw("refused", 1), raw("cross", 1), raw("person"), raw("record", 1)]);
    expect(plan.stops).toEqual([[0], [1, 2], [3, 4, 5]]);
    expect(plan.total).toBe(5240 - 350);
  });

  it("M1 follows the tokens: the ink change is --dur-2, a short stroke --dur-3, the cloud one and a half --dur-4", () => {
    const table = handoffTiming({ ...T, dur2: 100, dur3: 200, dur4: 400 });
    expect(table.own).toMatchObject({ draw: 200, settle: 100 });
    expect(table.refused.draw).toBe(600);
    // A connector inks as its line arrives, and nothing waits for it to settle.
    expect(table.reach).toMatchObject({ ink: "after", settle: 0, hold: 0 });
    expect(table.cross).toMatchObject({ ink: "after", settle: 0, hold: 0 });
  });

  it("lets the markup hold a beat or lengthen a stroke", () => {
    const plan = planOf("handoff", [raw("own", 1, { hold: 1000 }), raw("refused", 2, { drawMs: 400, draws: [{ ms: null }, { ms: 50 }] })]);
    expect(plan.steps[0]?.end).toBe(300 + 320 + 200 + 1000);
    expect(plan.steps[1]?.draws.map((d) => d.duration)).toEqual([400, 50]);
  });

  it("the generic rule: each step's strokes, its ink, a short beat, then the next", () => {
    const plan = planOf("steps", [raw("", 1), raw("", 1), raw("", 1), raw("", 1), raw("", 1)]);
    expect(plan.steps.map((s) => s.start)).toEqual([300, 940, 1580, 2220, 2860]);
    expect(plan.total).toBe(300 + 5 * (T.dur3 + T.dur2) + 4 * T.dur1);
    expect(plan.stops).toEqual([[0], [1], [2], [3], [4]]);
    // A connector draws straight into the step it leads to and shares its stop.
    const joined = planOf("steps", [raw(""), raw("connector", 1), raw("")]);
    expect(joined.steps[1]).toMatchObject({ inkAt: (joined.steps[1]?.start ?? 0) + T.dur3, end: (joined.steps[1]?.start ?? 0) + T.dur3 });
    expect(joined.stops).toEqual([[0], [1, 2]]);
  });

  // The recorded audit's eleven checks, by outcome: clear draws a check, a finding a slash, unverified is hatched.
  const outcomes = ["clear", "clear", "finding", "clear", "finding", "clear", "finding", "unverified", "clear", "clear", "clear"];
  const boxes = outcomes.map((o) => raw(o, o === "unverified" ? 0 : 1));

  it("M4, the score: the boxes ink by outcome (clear, finding, unverified), in under 1.2 seconds", () => {
    const plan = planOf("score", boxes);
    expect(plan.steps.map((s) => s.index)).toEqual([0, 1, 3, 5, 8, 9, 10, 2, 4, 6, 7]);
    expect(plan.stops).toEqual([[0, 1, 3, 5, 8, 9, 10], [2, 4, 6], [7]]);
    expect(plan.total).toBeLessThan(1200);
    expect(plan.total).toBeCloseTo(1110, 5);
    // Each box fills as its stroke starts; the boxes follow one another without waiting.
    for (const s of plan.steps) expect(s.inkAt).toBe(s.start);
    const starts = plan.steps.map((s) => s.start);
    expect(starts[0]).toBe(SCORE.lead);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1] ?? 0);
    // A beat between one outcome and the next.
    const gap = (i: number) => (starts[i] ?? 0) - (starts[i - 1] ?? 0);
    expect(gap(7) - gap(6)).toBeCloseTo(T.dur1, 5);
    expect(gap(10) - gap(9)).toBeCloseTo(T.dur1, 5);
  });

  it("M4 stays under 1.2 seconds however many checks an audit has, and puts any other outcome last", () => {
    for (let n = 1; n <= 80; n++) {
      const many = Array.from({ length: n }, (_, i) => raw(outcomes[i % outcomes.length] ?? "clear", 1));
      expect(planOf("score", many).total).toBeLessThan(1200);
    }
    const plan = planOf("score", [raw("not-checked"), raw("unverified"), raw("clear", 1), raw("not-applicable")]);
    expect(plan.steps.map((s) => s.index)).toEqual([2, 1, 0, 3]);
    expect(plan.stops).toEqual([[2], [1], [0, 3]]);
  });

  // The longest chain of the recorded playbook: one agent's step, four people's, two agent's.
  const chain = ["agent", "person", "person", "person", "person", "agent", "agent"].map((role) => raw(role));

  it("M2, the trace: one line drawn stage by stage, holding a beat at each person's card", () => {
    const plan = planOf("trace", chain);
    const strokes = plan.steps.map((s) => s.draws[0]);
    // One continuous line: each stroke starts where the one before stopped, and the last reaches the end.
    expect(strokes.every((d) => d?.target === "trace")).toBe(true);
    expect(strokes[0]?.from).toBe(0);
    for (let i = 1; i < strokes.length; i++) expect(strokes[i]?.from).toBe(strokes[i - 1]?.to);
    expect(strokes.at(-1)?.to).toBe(1);
    expect(strokes.reduce((sum, d) => sum + (d?.duration ?? 0), 0)).toBeCloseTo(TRACE.travel, 5);
    // A steady pen past the agent's cards; it eases to a stop at a person's card and at the end.
    expect(strokes.map((d) => d?.ease)).toEqual(["linear", "out", "out", "out", "out", "linear", "out"]);
    // The card inks as the line reaches it.
    plan.steps.forEach((s, i) => expect(s.inkAt).toBeCloseTo((strokes[i]?.start ?? 0) + (strokes[i]?.duration ?? 0), 5));
    // The line waits at a person's card and not at an agent's.
    const wait = (i: number) => (plan.steps[i + 1]?.start ?? 0) - (plan.steps[i]?.inkAt ?? 0);
    expect(wait(0)).toBeCloseTo(0, 5);
    expect(wait(5)).toBeCloseTo(0, 5);
    for (const i of [1, 2, 3, 4]) expect(wait(i)).toBeCloseTo(TRACE.holdBudget / 4, 5);
    // About 2.2 seconds: 2.4 with four people on the chain, 1.6 with none.
    expect(plan.total).toBeCloseTo(2400, 5);
    expect(planOf("trace", chain.map(() => raw("agent"))).total).toBeCloseTo(1600, 5);
    expect(plan.stops).toHaveLength(7);
  });

  it("M2 takes each card's place on the line from the markup, never lets the line run backwards, and holds 300 ms when few people sign", () => {
    const plan = planOf("trace", [raw("agent", 0, { at: 0.5 }), raw("person", 0, { at: 0.2 }), raw("agent", 0, { at: 0.7 })]);
    expect(plan.steps.map((s) => [s.draws[0]?.from, s.draws[0]?.to])).toEqual([
      [0, 0.5],
      [0.5, 0.5],
      [0.5, 1],
    ]);
    expect(plan.steps[1]?.draws[0]?.duration).toBe(0);
    expect((plan.steps[2]?.start ?? 0) - (plan.steps[1]?.inkAt ?? 0)).toBe(TRACE.hold);
  });

  it("M3, a scene: rows follow one another, a refusal draws its cloud and holds, the connector leads to the person's row", () => {
    // The first scene of the recording: work, two reads, work, the step the agent tries,
    // its refusal, the connector, the person's row, a read.
    const rows = [raw("row", 1), raw("read"), raw("read"), raw("row", 1), raw("tried"), raw("refused", 1), raw("then", 1), raw("row"), raw("read")];
    const plan = planOf("scene", rows);
    const [first, read, , , tried, refused, then, person] = plan.steps;
    expect(first?.start).toBe(150);
    // A row with a stroke of its own finishes before the next; a read does not hold the one after it up.
    expect(read?.start).toBe(first?.end);
    expect((plan.steps[2]?.start ?? 0) - (read?.start ?? 0)).toBe(90);
    // What the agent tried inks first; then the cloud is drawn round it, at a pen's pace.
    expect(refused?.start).toBe((tried?.settled ?? 0) + 100);
    expect(refused?.draws[0]).toMatchObject({ duration: T.dur4, ease: "inout" });
    expect((then?.start ?? 0) - (refused?.settled ?? 0)).toBe(500);
    expect(then?.inkAt).toBe((then?.start ?? 0) + T.dur3);
    expect(person?.start).toBe((then?.start ?? 0) + T.dur3);
    expect(plan.stops).toEqual([[0], [1], [2], [3], [4, 5], [6, 7], [8]]);
    expect(plan.total).toBe(3630);
  });
});

describe("the motion tokens", () => {
  it("reads a duration in ms or s", () => {
    expect(parseTime("120ms")).toBe(120);
    expect(parseTime(" 0.2s ")).toBe(200);
    expect(parseTime(".6S")).toBe(600);
    for (const bad of ["", "fast", "120", "-1s", null, undefined]) expect(parseTime(bad)).toBeNull();
  });

  it("reads a cubic-bezier and refuses one that is not a curve in time", () => {
    expect(parseBezier("cubic-bezier(0.16, 1, 0.3, 1)")).toEqual([0.16, 1, 0.3, 1]);
    expect(parseBezier(" cubic-bezier(.65,0,.35,1) ")).toEqual([0.65, 0, 0.35, 1]);
    for (const bad of ["ease-out", "cubic-bezier(1, 2, 3)", "cubic-bezier(1.2, 0, 0.3, 1)", "cubic-bezier(a, b, c, d)", null]) expect(parseBezier(bad)).toBeNull();
  });

  it("takes each token from the page and keeps the default for one that is missing", () => {
    const page: Record<string, string> = { "--dur-2": " 250ms", "--ease-out": "cubic-bezier(0.2, 0.8, 0.2, 1)", "--dur-4": "nonsense" };
    expect(tokensFrom((name) => page[name])).toEqual({ ...T, dur2: 250, easeOut: [0.2, 0.8, 0.2, 1] });
    expect(tokensFrom(() => "")).toEqual(T);
  });

  it("eases on the very curve the token names", () => {
    const ease = cubicBezier(T.easeOut);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
    // An exponential ease-out: most of the way there in the first quarter, never past the end, never backwards.
    expect(ease(0.25)).toBeGreaterThan(0.75);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const y = ease(i / 100);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeLessThanOrEqual(1.000001);
      prev = y;
    }
    // A straight line is a straight line.
    const linear = cubicBezier([0, 0, 1, 1]);
    for (const x of [0.1, 0.37, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 4);
  });
});
