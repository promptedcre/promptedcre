# Motion: the contract for page builders

How to make a drawing playable. The kit is `lib/motion` (logic) and `components/motion`
(the wrapper and its controls). `/styleguide/motion` plays every sequence on the recorded
run. The rules the kit keeps are restated at the end as a checklist.

```tsx
import { SequenceRoot, SequenceControls } from "@/components/motion";
```

That import is all a page needs. Both are server components. Importing them adds no GSAP
to the page.

## The idea

- **The server's HTML is the finished drawing.** With scripts off, with reduced motion, or
  if the animation code fails to arrive, that is what the reader gets, complete and still.
- **CSS owns appearance. GSAP owns time.** Every state a sequence passes through is said in
  CSS with attributes and one custom property. GSAP only tweens that property and flips
  those attributes on a timeline.
- **Penciled, then inked.** A sequence never hides a drawing to replay it. Before it plays
  the drawing is in pencil (reduced weight and contrast, words still at 4.5:1). Playing
  inks it: strokes are drawn, marks fill, the cloud is drawn round the refused step.
- **No attribute means finished.** A device with no `data-inked` on it or above it is
  inked. A drawable with no `--draw` set is drawn.

## Make a drawing playable

1. Wrap the finished drawing in `SequenceRoot` and name its choreography.
2. Put `data-seq-step` on each thing that happens, in the order it happens (DOM order).
3. Inside a step, mark what goes from pencil to ink with `data-ink`, and what is drawn with
   `data-draw`. The devices in `components/ui` already carry these.
4. Put `<SequenceControls />` where the controls should sit.

```tsx
<SequenceRoot as="figure" name="handoff" className="...">
  <ol>
    <li data-seq-step="own">
      <RoleMark mode="A" /> {/* carries data-ink */}
      <h3 data-ink="text">{own.title}</h3>
      <Icon name="check" draw /> {/* carries data-draw */}
      <Outcome kind="done">{own.outcome.line}</Outcome> {/* carries data-ink */}
    </li>
    <li data-seq-step="reach" aria-hidden="true">{/* the connector: a data-draw line */}</li>
    <li data-seq-step="refused">
      <RevisionCloud>{/* carries data-draw; everything inside inks after it is drawn */}</RevisionCloud>
    </li>
    <li data-seq-step="cross" aria-hidden="true">{/* the connector across the property line */}</li>
    <li>
      <div data-seq-step="person">{/* the cut-corner mark, the title */}</div>
      <div data-seq-step="record">{/* the line to sign on (data-draw), the record (data-ink) */}</div>
    </li>
  </ol>
  <figcaption>
    A recorded run of the engine on {firm}, a fictional firm, {recordedOn}.
    <SequenceControls />
  </figcaption>
</SequenceRoot>
```

`components/motion/specimens/` has a working example of each choreography.

### `SequenceRoot` props

| Prop | What it does |
|---|---|
| `name` | The choreography, and the root's `data-seq`: `handoff`, `trace`, `scene`, `score`, or `steps` for the generic rule. Any other name plays as `steps`. |
| `as` | The root's element: `div` (default), `figure`, `section`, `article`, `ol`, `ul`. |
| `start` | `"view"`: plays once when half of it is in view. `"user"`: waits for its Play control. Default: `scene` is `"user"`, the others `"view"`. |
| `label` | What the controls call it, lower case with its article: "the handoff" gives "Replay the handoff". Each choreography has a default. |
| `stepThrough` | Offer Previous and Next under reduced motion. Default: on, except `score`. |
| anything else | Passed to the root element (`className`, `id`, `aria-label`, `style`). |

The root renders three things you did not write: the pre-paint script as its first child
(only when `start` is `"view"`), your children, and the enhancer's own element as its last
child. So do not style the root's direct children by position (`:first-child`, `space-y-*`):
lay the drawing out in an element of your own inside the root.

## The attributes

### You write

| Attribute | On | Meaning |
|---|---|---|
| `data-seq-step` | a step | One thing that happens. Steps play in DOM order. Its value, when it has one, is the step's role in a named choreography (`data-seq-step="refused"`). Steps are flat: never a step inside a step. |
| `data-ink` | an inkable | It goes from pencil to ink with its step. Bare: the device has a penciled look of its own (every `components/ui` device). `data-ink="text"`: generic words, pencil is `--text-faint`. `data-ink="mark"`: a generic graphic, pencil is set by the theme (`--pencil-mark-opacity` and `--pencil-mark-filter`: dimmed on Night, a mid grey on Paper). |
| `data-draw` | a drawable | The ink draws it, following `--draw`. Bare: the device draws itself (the cloud, an `Icon` with `draw`, an SVG stroke with `pathLength="1"`). `data-draw="x"`: a wipe from the left. `data-draw="y"`: a wipe from the top. |
| `data-seq-hold="ms"` | a step | A reading pause after this step has inked, instead of its role's. |
| `data-seq-draw="ms"` | a step | How long each of this step's strokes takes, instead of its role's. |
| `data-draw-ms="ms"` | a drawable | How long this one stroke takes. |
| `data-draw-ease` | a drawable | `out`, `inout` or `linear`, instead of its role's. |
| `data-seq-draws="around"` | a step | This step also draws the nearest drawable that contains it. For a cloud that wraps the step it circles, when something inside must ink before the cloud is drawn. |
| `data-seq-trace` | one drawable | The single line a `trace` sequence draws stage by stage. It sits outside the steps. |
| `data-seq-at="0..1"` | a step of a `trace` | How far along the trace line this step sits (0 its start, 1 its end). Left out, the steps are taken as evenly spaced. |

`<SequenceControls />` renders `<span data-seq-controls>`: the slot the controls go into.

### The kit writes (do not write these, but you may style from them)

| Attribute | On | Meaning |
|---|---|---|
| `data-seq`, `data-seq-start` | the root | From `name` and `start`. |
| `data-seq-state` | the root | `penciled` (waiting to play), `playing`, `paused`, `stepping` (a reduced-motion step-through), `done`. Absent: the server's HTML, finished. |
| `data-inked="false"` | the root, then each step | In pencil. Before a sequence plays the root carries it; as it starts each step carries its own, and the timeline flips them to `"true"` in turn. Afterwards none is left. |
| `data-seq-live` | the root | An enhancer has taken over this root. |
| `data-seq-snap` | the root | For two frames after a reader ends the sequence: no ink transition on the way to the end. |
| `style="--draw: n"` | a drawable | Written by GSAP while it plays, removed when it ends. |

When a sequence ends (played, ended by input, or failed) every one of these writes inside
the root is removed. The markup is the server's again, plus `data-seq-state="done"`.

## The custom properties

| Property | Meaning |
|---|---|
| `--draw` | 0 (not drawn) to 1 (drawn). The default is 1. A drawable reads it; only the kit sets it. |
| `--dur-1` `--dur-2` `--dur-3` `--dur-4` | 120, 200, 320, 600 ms. The kit reads them from the page when it builds a timeline, so a stroke and a CSS transition run on one clock. |
| `--ease-out`, `--ease-in-out` | The two curves. The kit eases its strokes on these exact curves. |
| `--seq-dur`, `--seq-ease` | Set on every root: `--dur-2` and `--ease-out`. Use them for an ink transition inside a sequence. |

## Devices

A **drawable** is anything that can show itself partly drawn. Three ready ones:

- An SVG stroke: put `pathLength="1"` and `data-draw` on the shape (or `data-draw` on its
  `svg`). `app/globals.css` turns `--draw` into a dash.
- `data-draw="x"` or `data-draw="y"` on a ruled line: a wipe (a `clip-path`).
- The `components/ui` devices that draw: `RevisionCloud`, `PropertyLine`, `DimensionLine`,
  `Icon` with `draw`.

An **inkable** is anything with a penciled look. `RoleMark`, `Outcome`, `Stamp` and
`RefusedBadge` have their own, under `[data-inked="false"]` in `app/globals.css`. For plain
words use `data-ink="text"`.

To add a device of your own:

- Its finished look needs no attribute.
- Its penciled look hangs off `[data-inked="false"]` on itself or an ancestor, and changes
  nothing about its size. Pencil must not move the layout.
- What it draws follows `--draw`.
- If the line should show in pencil before it is inked, draw the pencil line as a second
  element under the ink and show it only until the ink covers it. The specimen cloud does
  this from `--draw` alone:
  `opacity: calc(clamp(0, (1 - var(--draw, 1)) * 1000, 1) * 0.55)`.

Where things sit matters:

- A drawable **inside a step** is drawn in that step's turn. Before the sequence plays it
  is not drawn.
- A drawable **outside every step** is never touched. Put a line that is simply part of the
  sheet (the property line, a dimension line) there.
- An inkable outside every step is in pencil before the sequence plays and inks, with
  everything else outside the steps, the moment it starts. Put a key or a legend outside
  the root if it should not take part at all.
- A step that is not laid out (`display: none`, the other half of a responsive pair) takes
  no part and no time.

## The choreographies

Every choreography is the generic rule with a timing table: for each step, draw its
drawables one after another, flip it from pencil to ink, wait for the ink to settle
(`--dur-2`), hold if the step holds, then go on. Times below are at the default tokens.
`lib/motion/choreographies.ts` is the source; `__tests__/motion-plan.test.ts` pins the totals.

Short strokes ease out (`--ease-out`). Long strokes, the cloud and the connectors, ease in
and out (`--ease-in-out`): an exponential ease-out draws nine tenths of a long stroke in its
first third, and the redline would appear instead of being drawn.

### `steps`: the generic rule

For any list. Starts on view. A beat of 300 ms in pencil first.

| `data-seq-step` | Each stroke | Then | Hold |
|---|---|---|---|
| (none) | 320 ms, ease out | inks, 200 ms | 120 ms |
| `connector` | 320 ms, ease in and out | inks as its line arrives | none: the next step starts at once |

Five steps with one stroke each: 3,380 ms.

### `handoff` (M1): the one authored sequence

Starts on view. About five seconds. A beat of 300 ms in pencil first.

| `data-seq-step` | What happens | Stroke | Ink | Hold |
|---|---|---|---|---|
| `own` | The agent's step: its check draws, then the step inks. | 320 ms | 200 ms | 250 ms |
| `reach` | The connector to the next step: the agent reaches the person's step. | 400 ms, in and out | on arrival | none |
| `tried` | That step inks: the agent tries it. Optional. | (320 ms) | 200 ms | 150 ms |
| `refused` | The cloud is drawn round it, then "Refused." and the reason ink. | 900 ms, in and out | 200 ms | 1,000 ms, to read the reason |
| `cross` | The connector crosses the property line to the person's position. | 450 ms, in and out | on arrival | none |
| `person` | The cut-corner mark inks. | (320 ms) | 200 ms | 150 ms |
| `record` | The line to sign on is drawn; the record inks. | 320 ms | 200 ms | none |

With the specimen's markup (one stroke each for `own`, `reach`, `refused`, `cross` and
`record`): 5,240 ms. Without `tried`: 4,890 ms. A step-through has three stops: the
agent's step; the refusal; the person's record.

`tried` and `refused` are two steps on one position. With `RevisionCloud`, which wraps what
it circles, either make the wrapper's parent the one `refused` step (the cloud is drawn,
then everything inside inks), or put `tried` and `refused` inside the cloud and give
`refused` `data-seq-draws="around"` (the scene specimen does this). In the second
arrangement a cloud whose pencil outline is keyed on an ancestor's `data-inked` loses that
outline when the sequence starts, because no step sits above the cloud; a pencil outline
worked out from `--draw`, as the specimen cloud's is, does not have that gap.

### `trace` (M2): the order of work

Starts on view. One line, `data-seq-trace`, is drawn along the longest chain; each step is a
card on it and inks as the line reaches it. A beat of 200 ms first.

| `data-seq-step` | The line | Then |
|---|---|---|
| `agent` (or none) | steady, straight through | the card inks while the line goes on |
| `person` | eases to a stop at the card | the card inks and the line holds: 300 ms in all, less when more than two people sign, so the holds never add up to more than 800 ms |

The line's whole travel is 1,200 ms, shared between the cards by how far apart they sit
(`data-seq-at`). The last card is always the end of the line. Seven stages, four of them a
person's (the recorded playbook): 2.4 seconds. With no person on the chain: 1,600 ms.

### `scene` (M3): one scene of the run board

Starts only from its control ("Play this scene"). A beat of 150 ms first.

| `data-seq-step` | What happens | Stroke | Ink | Then |
|---|---|---|---|---|
| `row` (or none) | A row of work inks. | 320 ms each, if it has any | 200 ms | the next row starts 140 ms after this one, or when this one's strokes are done |
| `read` | A command that only reads. | (320 ms) | 200 ms | the next starts 90 ms after |
| `tried` | What the agent attempted inks. | (320 ms) | 200 ms | 100 ms |
| `refused` | The cloud is drawn, the refusal inks. | 600 ms, in and out | 200 ms | holds 500 ms |
| `then` | The connector to the row where a person picks it up. | 320 ms, in and out | on arrival | none |

The first scene of the recording, as the specimen marks it up: 3,630 ms.

### `score` (M4): the audit's boxes

Starts on view. Under 1.2 seconds, however many checks. The figure beside the boxes is not
part of the sequence; since D227 it counts up once on its own (`CountUp`), the owner's
decision 94.

Each box is a step whose `data-seq-step` is its outcome. The boxes ink by outcome, not in
DOM order: `clear`, then `finding`, then `unverified`, then anything else. A box fills as
its stroke starts (240 ms). Boxes follow one another at most 60 ms apart, less when there
are many; a 120 ms beat separates one outcome from the next. A beat of 100 ms first.
Eleven boxes, seven clear, three findings, one unverified: 1,110 ms. No step-through by
default. For plain DOM order, use `steps`.

M5 (calculators) and M6 (copy, folds, switches) are CSS and do not use this kit.

### M5: the calculators' live charts (decision 96)

Not this kit: plain Web Animations and `requestAnimationFrame` in `components/calc/live.tsx`
(`ChartFrame`, `LiveText`) and `components/calc/motion.tsx`, with their CSS in
`components/calc/styles.tsx`. Each happens once, on a screen, with scripts on and full motion.

| When | What moves |
|---|---|
| A drawing is first a third in view | Its bars grow from their own start (a split bar and the tiers from the left, a cash-flow column from the line, a date's stem from the axis and its key after it), in drawing order, 600 ms each and at most 70 ms apart; the sensitivity grid's shading fills outward from the cell of your inputs. |
| The lead figure is first half in view | It comes into focus (a blur-in, 520 ms) counting up from zero (900 ms). A figure with no number in it ("none", a date) only comes into focus. |
| An input changes and the result reads | Each figure on the figures sheet rolls from what is on screen to its new value in 450 ms and lands on the computed string exactly (`components/calc/roll.ts`); a figure whose words change, a date and a bare count change at once. The bars travel to their new measures and the changed lines of the working are tinted, as before. |
| The pointer is over a drawing, or it has keyboard focus | A readout names the value and its label. One tab stop per drawing: the arrow keys walk its values, Home and End jump, Escape hides it. On a phone a tap names a value until a tap elsewhere. The readout is for the eye; a screen reader reads the drawing's text alternative, its label. |

The server's HTML is the worked example, finished. A hidden state exists only under
`html.js[data-motion="full"]:not([data-reveal-off])` on a screen, until `live.tsx` marks the
drawing `data-seen`. Scripts off, reduced motion (a new value replaces the old at once) and
print get the finished drawing; `__tests__/calc-live.test.ts` holds the stylesheet to that.

## What a reader gets

| Reader | What happens |
|---|---|
| Scripts off | The finished drawing. No controls. Nothing in the kit runs. |
| Reduced motion | The finished drawing, never in pencil, no GSAP fetched. Where `stepThrough` is on: "Step through the handoff", then Previous step and Next step, each a change of state with an opacity change of 120 ms at most. |
| Full motion, `start="view"` | In pencil from the first paint. Plays once when half of it is in view (or it fills half the viewport). Pause while it plays, Replay after. |
| Full motion, `start="user"` | The finished drawing until "Play this scene". |
| Printing | The finished drawing, whatever state it was in. |
| The animation code does not arrive in 5 seconds | The finished drawing. No controls. |

**The rule for putting a drawing in pencil.** A drawing a reader is looking at never changes
under them. So a sequence is put in pencil only:

1. by its pre-paint script, a few inline lines that are the root's first child and run as
   the parser opens the root, before any of it is painted (when `html[data-motion]` is
   `full`); or
2. on a client-side navigation, where inline scripts do not run, by the enhancer in a layout
   effect, before the new page is first painted; or
3. while no part of it is in the viewport.

If none of these holds (the script was blocked and the drawing is already on screen in
ink), it stays finished and offers Replay. The pre-paint script also keeps a timer: if no
enhancer has claimed the root after 6 seconds, it inks the drawing itself.
`lib/motion/decide.ts` states the rule as a function; `lib/motion/prepaint.ts` is the script.

**Once per page view.** A sequence that has played, or been ended, does not play again by
itself. Leaving the page and coming back is a new page view.

**Off screen.** It pauses when less than a fifth of it is in view and carries on when half
is. An IntersectionObserver does this; there is no scroll listener and no ScrollTrigger.

**Input.** A click or tap, or a key press, inside the root and outside its controls ends the
sequence at once. A scroll gesture that starts on the drawing does not. Keyboard focus
arriving in a drawing that is still waiting in pencil ends it too.

## Controls

One button whose job follows the sequence, so focus stays on it: Pause, Resume, "Replay
the handoff" (or "Play this scene" for a sequence a person starts). Under reduced motion:
"Step through ...", then Previous step, Next step and "Step 2 of 3". They use the site's
outlined button at 44 px. They render into `<SequenceControls />`, or at the end of the
root when there is none, and never in print.

A page can drive a sequence without importing anything, by dispatching on the root:

| Event | Effect |
|---|---|
| `seq:play` | Start, or start again. |
| `seq:pause` | Hold. |
| `seq:end` | Go to the finished drawing. |
| `seq:seek`, `detail` in ms | Hold a still at that time. |

The root emits `seq:phase` (it bubbles) with `detail` one of `waiting`, `playing`,
`paused`, `done`, `failed`, `idle`, `still`, `stepping`.

## Cost

- A page with no sequence: nothing.
- A page with a sequence, at first load: the enhancer, about 4 KB gzipped (esbuild's
  measure on 2026-11-14; a Next build may differ a little), and about 0.7 KB of inline
  script per auto-playing root.
- When a sequence nears the viewport or is asked to play: GSAP's core and CSS plugin, and
  the kit's playing code (`lib/motion/playback.ts`, about 3.5 KB gzipped), each in a chunk
  of its own, fetched once per page view.
- Under reduced motion GSAP is never fetched. A step-through fetches the playing code only.

`lib/motion/loader.ts` is the only file that may import `gsap` or `@gsap/react`, and only
with `import()`. `__tests__/motion-imports.test.ts` fails when any file in `app/`,
`components/` or `lib/` breaks that, when a server component can reach the kit's browser
code, or when the enhancer's first-load graph grows. The loader also offers `loadDrawSVG()`
and `loadGsapReact()`; the kit uses neither.

## How to test

```
VITEST_MAX_WORKERS=1 npx vitest run __tests__/motion-plan.test.ts __tests__/motion-decide.test.ts __tests__/motion-imports.test.ts
```

Then look, with `tools/shot.mjs` and one jobs file. Motion is reduced by default in that
tool; add `"motion": true` to see a sequence. To hold a sequence at a moment, dispatch
`seq:seek` from `--eval`:

```js
(async () => {
  const root = document.querySelector('[data-seq="handoff"]');
  const until = async (test) => { while (!test()) await new Promise((r) => setTimeout(r, 50)); };
  await until(() => root.hasAttribute("data-seq-live"));
  await new Promise((r) => setTimeout(r, 900)); // in development React mounts every effect twice, a moment apart
  root.dispatchEvent(new CustomEvent("seq:seek", { detail: 2350 }));
  await until(() => root.getAttribute("data-seq-state") === "paused");
  await new Promise((r) => setTimeout(r, 450)); // let the ink transitions settle
})()
```

Look at, for every drawing you make playable:

- the start (`seq:seek` 0: the whole drawing in pencil, nothing missing), a moment in the
  middle, and the end (`seq:end`);
- 390 px wide (`"mobile": true`) as well as 1440;
- scripts off (`"nojs": true`): finished, no controls;
- reduced motion (the tool's default): finished, and the step-through if it has one;
- print (`"mode": "pdf"`): finished;
- by keyboard: the control is reachable, Pause becomes Resume without losing focus.

## The rules

The design direction's rules for motion. Check each before you call a sequence done.

- [ ] It replays only what the recorded run holds and invents no step. The one chat on the
      site (D218, the owner's chat replay on the home page) is the recorded run of
      `content/demo/form-llc.json` set as messages: every message is worded from a recorded
      command, its output or its caption, and its first message is the site's own sentence.
- [ ] The server HTML is the finished state. Scripts off, reduced motion or a failed load
      leave the page complete and still.
- [ ] Nothing on screen at load disappears or jumps. The only entrance is pencil to ink.
- [ ] Pencil keeps words at 4.5:1 and changes no size.
- [ ] GSAP is in no first-load chunk. Nothing but `lib/motion/loader.ts` imports it.
- [ ] No ScrollTrigger. An IntersectionObserver starts and pauses it.
- [ ] A sequence over two seconds has Replay; one that plays by itself has Pause.
      Keyboard reachable, 44 px, labelled.
- [ ] It plays once per visit to the page, pauses off screen, and any input ends it.
- [ ] Reduced motion: no auto-play and no travel. A step-through changes state with an
      opacity change of 120 ms at most.
- [ ] Easing is the tokens': no bounce, no elastic.
- [ ] One focal sequence on a page (the formation chat on the home page, D218). Supporting motion only where it
      explains state or relationship.
- [ ] None of the refused effects: a typewriter or a staged chat that is not the recorded run,
      animated or parallax grids, dimension lines drawing themselves on scroll, pulsing chips,
      any loop. Allowed since the owner's BoardUI round (D224), each once and never for
      reduced motion, scripts off or print: a blur-in reveal per section (`data-reveal`,
      `components/motion/page-motion.tsx`), a computed figure counting up once (`CountUp`),
      a bar filling and icons arriving in turn inside a reveal, the home headline's last word
      passing once through the structures and resting, a soft highlight or a 2 px lift on hover,
      the page fading in on arrival, the theme switch's circle and the copy notice.

## Files

| File | What it holds |
|---|---|
| `components/motion/sequence-root.tsx` | `SequenceRoot`, `SequenceControls` (server). |
| `components/motion/sequence-enhancer.tsx` | The client enhancer and its controls; the pre-paint script element. |
| `components/motion/sequence-styles.tsx` | The CSS every sequence shares, once per page, in `@layer components`. |
| `components/motion/specimens/` | Stand-in drawings for `/styleguide/motion`. Not for use on real pages. |
| `lib/motion/choreographies.ts` | The timing tables. Pure. |
| `lib/motion/plan.ts` | Step descriptors in, a timeline plan out. Pure. |
| `lib/motion/decide.ts` | Whether to play, whether to pencil, whether it is in view. Pure. |
| `lib/motion/tokens.ts` | The motion tokens as numbers and curves. Pure. |
| `lib/motion/prepaint.ts` | The pre-paint script, as text. Pure. |
| `lib/motion/controller.ts`, `dom.ts` | One sequence's life on a page. Browser, first load. |
| `lib/motion/loader.ts` | The only door for GSAP and the playing code. Browser. |
| `lib/motion/playback.ts`, `read.ts`, `player.ts` | Markup to timeline. Browser, on demand. |
