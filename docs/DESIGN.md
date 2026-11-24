# Building with the design system

The root `DESIGN.md` says what the system is: its tokens, roles, surfaces, devices and
rules. This file says how to build with it in this repository: where styles go, each
primitive's props, how themes switch, and the checks to run. Motion has its own contract,
`docs/MOTION.md`.

The code is the reference. Tokens and component classes are in `app/globals.css`; the
primitives are in `components/ui/` (exported from `@/components/ui`) and
`components/chips.tsx`; `/styleguide` draws every primitive with real data and
`/styleguide/motion` plays every sequence. Start there before building a page.

## 1. How styles are written

CSS modules do not work here. `next.config.ts` sends every `*.css` file through the
Tailwind loader as global CSS, so a `.module.css` file comes out with unhashed class names
and an empty class map. Do this instead, in order of preference:

1. **Tailwind utilities on the element**, using the token colors and the type roles
   (section 3). Spacing uses Tailwind's steps 1, 2, 3, 4, 6, 8, 12, 16, 24 and 32 (the 4 px
   scale); no arbitrary `p-[7px]`, no arbitrary `text-[..px]`, weight, width or tracking.
2. **A primitive from `components/ui`**, or a component class from `app/globals.css`
   (section 4) when no primitive fits. Ask for a new primitive rather than redrawing a
   mark, a fold, a chevron or an icon locally.
3. **A component's own rules** that utilities cannot say (`:has()` chains, rules across
   elements, a container query): a `<style>` element with an `href` and a `precedence`,
   rendered by a server component, with every class under a short prefix, and the CSS
   string starting with `@layer components {`. React hoists the element to the head and
   keeps one copy per `href`.

```tsx
const CSS = `@layer components {
.xy-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.75rem}
}`;
export function XyStyles() {
  return <style href="xy" precedence="default">{CSS}</style>;
}
```

Why `@layer components`: unlayered rules beat layered ones whatever their specificity, so
an unlayered rule could never be undone with a utility. Inside the layer a utility on the
same element still wins. Where a component rule must beat a drafting class from
`app/globals.css` (the same layer), name two classes. The design lint fails on a
`<style precedence>` whose string does not start with `@layer`.

React dedupes the hoisted element, but the RSC payload still carries the CSS once for
every render. When markup repeats (rule cards, step rows, schedule rows), the page renders
the style once and the repeated component does not. The blocks that follow this pattern,
each with its prefixes in its header comment:

| Block | File | Prefixes |
|---|---|---|
| `PageStyles` | `components/playbook/page-styles.tsx` | `pb-`, `si-` (the list of steps), `st-` (a step card), `bd-`, `src-` and others |
| `FoldStyles` | `components/playbook/fold.tsx` | `rc-` (rule cards) |
| `LibraryStyles` | `components/library/styles.tsx` | `lb-` |
| `RunStyles` | `components/run/run-styles.tsx` | `rb-` board, `eo-` engine output, `rd-` document sheet |
| `HomeStyles` | `components/home/styles.tsx` | `hm-`, `hl-` (the headline's inked word) |
| `PlansStyles` | `components/plans/styles.tsx` | `pl-` (the plan cards) |
| `BarStyles` | `components/rankings/bars.tsx` | `rkb-` bar rows, `rkc-` chart card, `rks-` sort control |
| `SegmentedStyles` | `components/catalog/filter.tsx` | the pill switchers of the catalog lists and /rules |
| `VendorStyles` | `components/rankings/vendor-parts.tsx` | `vd-` (a vendor page's site pill, cards, rings and wells) |
| `LlcStyles` | `components/demo/llc-styles.tsx` | `lc-` (the agent-session demo) |
| `CalcStyles` | `components/calc/styles.tsx` | `calc-` |

`components/site-header.tsx` (`sh-`), `components/connect/connect-setup.tsx` (`cn-`),
`components/variant-switch.tsx` (`vsw-`) and `components/ui/status-line.tsx` render their
own small blocks.

**Surfaces under a broken line.** A dimension label, a property-line label and the refused
badge paint `--dim-surface` behind themselves so they break their line. It defaults to
`var(--bg)`. `Sheet` sets it to its paper and `Terminal` to the well; anywhere else that
is not the ground, set it yourself: `style={{ "--dim-surface": "var(--bg-inset)" } as CSSProperties}`.

## 2. Tokens

Every color is declared once per theme, as hex with the OKLCH it was computed from in a
comment beside it: Night in the first `:root` block of `app/globals.css`, Paper in
`@utility theme-paper`. Both blocks declare the same names. To retune a color, change the
OKLCH, recompute the hex, and keep both.

Tailwind color names (from `@theme inline`):

| Token | Utility suffix |
|---|---|
| `--bg`, `--bg-raised`, `--bg-inset`, `--bg-panel`, `--bg-tile` | `bg`, `raised`, `inset`, `panel`, `tile` |
| `--fill-hover`, `--selection`, `--scrim` | `fill-hover`, `selection`, `scrim` |
| `--line`, `--line-strong`, `--line-bold` | `line`, `line-strong`, `line-bold` |
| `--text`, `--text-muted`, `--text-faint` | `text`, `muted`, `faint` |
| `--accent`, `--accent-strong`, `--accent-ink` | `accent`, `accent-strong`, `accent-ink` |
| `--agent`, `--agent-text`, `--agent-mid`, `--agent-deep` | same names |
| `--human`, `--human-text`, `--human-mid`, `--human-deep` | same names |
| `--danger`, `--warn` | same names |

So `bg-raised`, `border-line-strong`, `text-muted`, `text-faint`, `bg-agent`. `--human-ink`,
`--shadow`, `--grid-minor`, `--grid-major`, `--dim-line` and `--dim-ext` have no utility:
use `var(--name)`. Ink on an amber fill: `bg-human` sets `--accent-ink` to `--human-ink`,
so `text-accent-ink` on or inside it reads.

The same `:root` block also holds what no theme changes: `--ease-out`, `--ease-in-out`,
`--dur-1` to `--dur-4`, `--space-1` to `--space-10`, `--header-h` (3.5rem, 3.75rem from
768 px), `--measure` (68ch), `--underline-offset`, `--underline-thickness`, `--focus-ring`
and `--hatch`. `@property --draw` (a number, inherited, initial value 1) is the drawing
progress the motion kit tweens.

**Adding a token.** Add it to both theme blocks with its OKLCH comment, map it in
`@theme inline` if a utility needs it, and add it to the right list in
`__tests__/tokens.test.ts` so its contrast is asserted. A color written anywhere else
fails the design lint (`color-literal`). The only places a color is written out are the
two theme blocks, the print remap, and the browser's theme color in `app/layout.tsx` and
`app/manifest.ts` (each `--bg`, checked by the tokens test).

## 3. Type roles

| Utility | Use |
|---|---|
| `type-hero` | The home h1 only |
| `type-page` | Every other h1 |
| `type-title-l` | h2 |
| `type-title-m` | h3, a sheet's title |
| `type-title-s` | Row and step titles, h4 |
| `type-lede` | One per page head; sets muted ink |
| `type-body` | Prose; pair with `measure` |
| `type-body-s` | Secondary rows, table cells, captions |
| `type-label` | Controls, table heads, chips, keys; sentence case, write the capital |
| `type-note` | The 12 px floor: chart ticks, fine print |
| `type-figure` | One lead figure per sheet at most |
| `type-code` | Prompts and commands (Plex Mono 400) |
| `type-data` | Dimension labels, ids, dates in a table (Plex Mono 500, tabular) |
| `measure` | The 68ch prose column |

Sizes and settings are in the root `DESIGN.md`. They are utilities, so each takes
responsive variants, and a single-property utility on the same element (a color,
`text-balance`) still wins. Do not add a weight, width or tracking on top: the role sets
all three.

**Retired aliases.** These still work so unconverted files keep rendering, and are removed
at the end of the rebuild. Do not write new uses; the design lint reports each one
(`type-legacy-alias`).

| Alias | Now draws |
|---|---|
| `display-xl` | `type-hero` |
| `display-page` | `type-page` |
| `display-l`, `display-m` | `type-title-l` |
| `display-s` | `type-title-s` |
| `lede` | the lede's size and leading, with no color |
| `figure` | `type-figure` |
| `ann`, `eyebrow` | `type-label` (no mono, no capitals) |

**Mono.** Plex Mono ships at 400 and 500 only (`app/layout.tsx` imports those two files;
`font-synthesis: style` on `body` keeps a heavier request from being faked). Use it only
through `type-code`, `type-data` or `TextLink mono`, for prompts, commands, paths, ids and
measured figures. Digits inside a sentence are Archivo with `tabular-nums`.

**Archivo** loads through `next/font/local` from the fontsource files (three subsets, one
family name, the Latin file preloaded). Five `"Archivo Fallback"` faces in
`app/globals.css` scale local Arial per weight and width range so a line breaks in the
same place before and after the web font arrives.

## 4. Component classes

Plain classes inside `@layer components` in `app/globals.css`. Each is drawn by a
primitive; reach for the class only when no primitive fits.

| Class | What it draws |
|---|---|
| `.sheet`, `.sheet-head`, `.sheet-title`, `.sheet-note`, `.sheet-body`, `.sheet-part`, `.sheet-tb`, `.sheet-foot` | The sheet and its parts (`Sheet`, `SheetPart`). `.sheet .sheet` loses its border |
| `.sheet-grid` | The drafting grid, 120 px over 24 px. The only place the grid is drawn |
| `.tblock`, `.tblock--rows`, `.tblock-label`, `.tblock-value` | Title-block cells (`TitleBlock`, `TitleCell`) |
| `.sigline` | The line a person signs on, with its cross; highlighted on Paper |
| `.hatch`, `.hatch-agent`, `.hatch-human`, `.hatch-unverified` | Hatching from `--hatch`, in the element's own color |
| `.cut-corner`, `.cut-corner-ruled` | A person's cut corner (`--cut`; the ruled one also draws the edge, `--cut-line`) |
| `.mk` with `.mk-A`, `.mk-B`, `.mk-H`, `.mk-O`, `.mk--md`, `.mk--lg` | Role marks: 12, 14 and 20 px. `.mk` alone draws the agent's green; `mk-A` is applied but has no rule of its own |
| `.role`, `.lane-tag`, `[data-lane]` | A mark and its word; a lane's mark and word; the lane's inks |
| `.icon` | The icon set's 1.5 px square-capped stroke |
| `.disclosure`, `.disclosure--end`, `.disclosure--sm`, `.disclosure--open-md`, `.disclosure-chevron`, `.disclosure-label` | The one fold (`Disclosure`) |
| `.refused-badge`, `.rev-cloud`, `.cloud-ink`, `.cloud-pencil`, `.rev-delta` | The refused badge and the revision cloud |
| `.dim`, `.dim-tick`, `.dim-label`, `.dim--below`, `.dim--low`, `.dim--v`, `.dim-ext` | Dimension lines |
| `.pline`, `.pline--h`, `.pline--v`, `.pline--fold`, `.pline-label` | The property line |
| `.stamp`, `.stamp-word`, `.stamp-date` | The review stamp |
| `.outcome` with `[data-outcome]` | What happened to a step |
| `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--quiet`, `.btn--sm` | Buttons |
| `.link`, `.link--accent`, `.link--muted`, `.link--mono` | Links in running text |
| `.tag`, `.tag--{muted,accent,agent,human,danger,warn}`, `.tag--dashed`, `.tag-dot` | Chips |
| `.callout`, `.callout--{agent,person,warn,risk}`, `.callout-icon`, `.callout-title`, `.callout-body` | A note: an icon and its words |
| `.theme-toggle`, `.theme-toggle-faces`, `.theme-sheet` | The theme switch |
| `.wordmark`, `.monogram`, `.monogram--{sm,md,lg}`, `.monogram--active` | The brand's own lettering |
| `details[open] .chev` | Deprecated: the old chevron, for folds not yet moved to `Disclosure` |

## 5. The primitives

Everything here is pure (no file system, no request data), so client components may
import the barrel. Every primitive takes `className`, for layout only. Each file's header
comment is its full contract.

### Layout and type

| Component | Props | Example |
|---|---|---|
| `Container` | `children`, `as?` (div, section, header, footer, article, nav, aside), `id?` | `<Container as="section">...</Container>` |
| `Band` | `children`, `tone?` (plain, raised, ruled; default ruled), `contained?` (default true), `id?`, `label?` | `<Band tone="ruled" label="Where it stands">...</Band>` |
| `PageHead` | `title`, `id?`, `headingLevel?` (1, or 2 for a specimen), `crumbs?` (`{ href?, label }[]`), `lede?`, `actions?`, `aside?`, `facts?` (`{ label, value, mono?, lead?, className? }[]`), `factsLabel?` (default "At a glance"), `children?` | `<PageHead title="Rules" crumbs={[{ href: "/", label: "Home" }, { label: "Rules" }]} lede="..." facts={facts} />` |
| `Heading` | `level` (1 to 4), `size?` (hero, page, l, m, s; xl is the old name for hero), `children`, `id?` | `<Heading level={2}>Questions</Heading>` |
| `Lede` | `children` | `<Lede>Your AI agent does the steps it can.</Lede>` |
| `SheetHeader` | `title`, `note?`, `id?`, `level?` (2, 3), `flush?`, `children?` (right slot) | `<SheetHeader title="Sources" note="..." />` |

`PageHead`: a fact whose value is null, undefined or empty is left out. One fact may be
`lead` (first, value before label, type-title-s). Fact `tone` is deprecated: only `"muted"`
still reads. `eyebrow` is deprecated and not drawn. `aside` sits right of the text from
1024 px, at most 25rem wide. `SheetHeader`'s `label` and `size` are deprecated and
ignored; its h2 is type-title-l and its h3 type-title-m. `Eyebrow` is deprecated: it draws
one plain muted line; move its words into the heading, the lede or the facts and delete
the call. The design lint reports every `Eyebrow`, `PageHead eyebrow=` and
`SheetHeader label=` as a kicker.

### Actions and links

| Component | Props | Example |
|---|---|---|
| `Button` | `variant?` (primary, secondary, quiet), `size?` (md, sm), `arrow?` (default false), `children`, native button props (`type` defaults to button) | `<Button variant="secondary" onClick={copy}>Copy the sentence</Button>` |
| `ButtonLink` | `href`, `variant?`, `size?`, `arrow?` (default true), `children`, `aria-label?`, `aria-current?` ("page") | `<ButtonLink href="/run">Watch a recorded run</ButtonLink>` |
| `TextLink` | `href`, `children`, `tone?` (text, accent, muted), `mono?` | `<TextLink href="/rules">rule cards</TextLink>` |
| `Arrow` | none | `<Arrow />` |

An `http(s)` href renders a plain `<a rel="noreferrer">`; anything else is a Next `Link`.
Every size is at least 44 px tall under 768 px; from 768 px md is 40 px and sm 32 px.

### Icons, folds, notes

| Component | Props | Example |
|---|---|---|
| `Icon` | `name` (an `IconName`), `size?` (16, 20), `label?`, `draw?` | `<Icon name="copy" />` |
| `Disclosure` | `summary`, `children`, `open?`, `id?`, `name?`, `chevron?` (start, end), `size?` (md, sm), `openFrom?` ("md"), `summaryClassName?`, `bodyClassName?` | `<Disclosure summary="The engine's command" chevron="end">...</Disclosure>` |
| `Callout` | `children`, `icon?` (an `IconName` or an element; default info), `tone?` (note, agent, person, warn, risk), `title?` | `<Callout tone="risk" icon="risk" title="High risk">...</Callout>` |

`ICON_NAMES` lists the set: arrow-right, arrow-left, arrow-down, arrow-up, chevron-right,
chevron-left, chevron-down, chevron-up, plus, minus, close, check, copy, search, menu,
print, download, external, file, calendar, risk, info, play, pause, replay. An icon is
decoration (`aria-hidden`) unless it has a `label`. `draw` makes it a drawable whose
strokes follow `--draw`. A `Disclosure` with an `id` shows its body when the page's hash
targets it, with scripts off; folds that share a `name` open one at a time; `openFrom="md"`
is a fold on a phone and simply open from 768 px.

### Sheets and title blocks

| Component | Props | Example |
|---|---|---|
| `Sheet` | `children`, `as?` (section, article, figure, div), `title?`, `titleId?`, `level?` (2, 3, 4; default 3), `note?`, `actions?`, `grid?`, `flush?`, `titleBlock?`, `footer?`, `id?`, `label?`, `labelledBy?`, `bodyClassName?`, `style?` | `<Sheet as="figure" title="Order of work" grid titleBlock={<TitleBlock>...</TitleBlock>}>...</Sheet>` |
| `SheetPart` | `children`, `as?` (div, section, li), `grid?` | `<Sheet flush><SheetPart>...</SheetPart><SheetPart>...</SheetPart></Sheet>` |
| `TitleBlock` | `children`, `label?`, `cols?` | `<TitleBlock label="Document" cols={4}>...</TitleBlock>` |
| `TitleCell` | `label`, `children`, `tone?` (default, agent, human, accent, danger, muted), `mono?`, `wide?` | `<TitleCell label="Status" tone="human">Not live yet</TitleCell>` |
| `ApprovalCells` | `drawnBy`, `approvedBy?` (`{ name, date? }` or null), `signer?` | `<ApprovalCells drawnBy="agent" approvedBy={null} signer="principal" />` |

`TitleBlock` renders a `<dl>`. `cols` fixes the column count from 1024 px; otherwise cells
wrap at about 150 px. A `TitleCell` tone draws a small square before a plain value (the
words stay neutral); a value that brings its own mark keeps it. `wide` spans two columns
from 768 px. `ApprovalCells` draws the role mark for who drew it (`drawnBy="agent"` gives
the agent's square, anything else the person's cut corner); unsigned it shows the sign
line and "A person signs" (or "<Signer> signs").

### Notation

| Component | Props | Example |
|---|---|---|
| `RoleMark` | `mode` (a step mode or a mark letter A, B, H, O), `label?`, `showLabel?` (default true), `size?` (sm 12, md 14, lg 20; default md), `inked?` | `<RoleMark mode="human-online" />` |
| `Marks` | `marks`, `label?`, `size?` (sm, md) | `<Marks marks={pb.marks} />` |
| `Elevation` | `marks?` or `groups?` (`{ label, marks }[]`), `size?` (lg, md), `sort?`, `caption?`, `note?`, `legend?` (default true), `label?`, `noun?` (default "steps"), `barClassName?` | `<Elevation marks={marks} size="md" />` |
| `LaneTag` | `lane` (agent, person), `mark?`, `size?`, `children?` | `<LaneTag lane="person" mark="O" />` |
| `GateGlyph` | `kind` (signature, irreversible, hard-to-undo), `showLabel?` (default true) | `<GateGlyph kind="signature" />` |
| `GatePath` | `kind` | `<svg viewBox="0 0 16 16"><GatePath kind="irreversible" /></svg>` |
| `DimensionLine` | `children`, `orientation?` (h, v), `placement?` (above, below), `style?` | `<DimensionLine>{agentCount} agent steps</DimensionLine>` |
| `PropertyLine` | `orientation?` (h, v), `label?`, `fold?` (default true), `style?` | `<PropertyLine orientation="v" label="Your machine / the hosted site" />` |
| `RevisionCloud` | `children`, `delta?`, `label?`, `draw?` (0 to 1), `style?`, `data-*` and `aria-*` pass through | `<RevisionCloud delta={row.n} label="Refused">...</RevisionCloud>` |
| `RefusedBadge` | `n` | `<RefusedBadge n={4} />` |
| `Stamp` | `word`, `date`, `datePrefix?`, `inked?` | `<Stamp word="Practitioner" datePrefix="reviewed" date={review.date} />` |
| `Outcome` | `kind` (done, refused, clear, finding, unverified, approved, fixed, read), `children`, `as?` (p, span, div) | `<Outcome kind="refused"><b>Refused.</b> A person's step.</Outcome>` |

Helpers from the barrel: `ROLE_WORD` (the four words), `roleWord(mode)` (with its
capital), `MARK_ORDER`, `isAgentMark`, `tallyMarks`, `marksLabel(marks, noun?)`,
`GATE_WORD`, `stepGates(step)`. Who does a step is always said in `ROLE_WORD`'s four
words; a person's step may add the role after them ("Person online", then "principal"),
never in place of them. `Stamp`'s `tone` is deprecated and ignored: a review has one
color. For a refusal, put the first word of an `Outcome` in `<b>`.

### Engine output, brand, status

| Component | Props | Example |
|---|---|---|
| `Terminal` | `children`, `title?`, `note?`, `label?` | `<Terminal title="The engine">...</Terminal>` |
| `TermLine` | `kind` (command, output, refused), `children`, `actor?`, `delta?`, `note?` (default "Refused") | `<TermLine kind="command" actor="agent">{line.command}</TermLine>` |
| `Monogram` | `children` (two letters), `size?` (sm, md, lg), `active?` | `<Monogram active>CC</Monogram>` |
| `Wordmark` | none (from `components/ui/wordmark.tsx`, not the barrel) | header and footer only |
| `StatusLine` | `facts` (SiteFacts), `computedOn` | rendered by the layout only |
| `CountsLine` | `catalog` (`SiteFacts["catalog"]`) | `<CountsLine catalog={facts.catalog} />` |
| `ThemeToggle` | none | rendered by the site header |
| `PrintFolds` | none | rendered by the layout once |

Only real output from `getDemoRun()` or the engine goes in a `Terminal`. `TermLine
kind="output"` given a string hangs wrapped lines 2ch in and tints `(agent)` and the actor
names; `kind="refused"` wraps the line in a `RevisionCloud`. `VariantSync` is used only
through `VariantSwitch` (`components/variant-switch.tsx`: `rootId`, `param`, `attr`,
`options`, `label`) and `StructureSwitch`.

### Chips (`components/chips.tsx`)

| Component | Props | Example |
|---|---|---|
| `Tag` | `children`, `tone?` (muted, accent, agent, human, danger, warn), `title?`, `dashed?`, `dot?` | `<Tag tone="human" dashed dot>Not live yet</Tag>` |
| `ReviewChip` | `review` | `<ReviewChip review={pb.review} />` |

A chip whose text starts in lower case is given its capital. Solid for a fact, `dashed`
for "not yet", `danger` for the redline (act within hours), `warn` for a finding (act
within days). `NotLiveChip` (`components/connect/connector-status.tsx`) is the amber
dashed "Not live yet" chip and renders nothing once `site.connectorLive` is true.

## 6. Themes

- **Paper first (D218).** Every visitor starts on Paper, whatever the system asks for; Night
  is on the toggle. The tokens still declare Night first (the `:root` block) and Paper over it.
- **Paper** is `@utility theme-paper`, written once and applied in three places:
  `:root:where(:not([data-theme="night"]))`, `:root:where([data-theme="paper"])`, and the
  print remap. `:where()` keeps the two theme rules at the weight of `:root`, so the print
  remap still wins on paper. Night needs no rule of its own: it is what is left when the
  visitor chose it.
- **The head script** (`BOOT` in `app/layout.tsx`) runs before the first paint. It adds
  `class="js"` to `<html>`, sets `data-motion="full"` or `"reduced"` (and keeps it in step
  if the setting changes), and sets `data-theme` to `paper` or `night` from
  `localStorage["pcre-theme"]` if the visitor chose one. With scripts off none of the
  three is present and the page is Paper.
- **The toggle** (`components/ui/theme-toggle.tsx`) names the theme it turns to. Both
  names are in the markup and `--show-on-night` / `--show-on-paper` show the right one, so
  nothing shifts when React arrives. Turning back to Paper clears the saved choice. With
  scripts off it is not drawn (`html:not(.js) .theme-toggle`). While the theme changes,
  `data-theme-turning` on `<html>` turns transitions off so every color lands at once.
- **The browser's theme color** is written out in `app/layout.tsx` (`GROUND.paper`) and
  `app/manifest.ts` (Paper's). The tokens test fails if either drifts from `--bg`.
- **Something drawn in one theme only** sets `visibility: var(--show-on-night)` or
  `var(--show-on-paper)`. The highlighter over the sign line is `--highlight`
  (transparent on Night).
- To look at Paper, pass `--scheme light` to `tools/shot.mjs` (or `"scheme": "light"` in a job).

## 7. Floors that hold everywhere

**Scripts off.** Pages render on the server and read in full with scripts off. A client
component is used only where the browser must act: switch sync, copy buttons, "Open all"
and print, the search palette, the theme toggle, the calculators. Variants are all
rendered and CSS picks one (radios and `:has()`, section 8). Motion starts from the
finished, visible state. Check with `--nojs`.

**The 12 px floor.** No text under 12 px: `type-note` (0.75rem) is the smallest role. The
tokens test reads every `font-size` and `font` in `app/globals.css` and fails under 12 px;
the design lint fails on any size under 12 px in the code (`tiny-text`). The old
exception for chart ticks is gone. (The Open Graph image is a picture, not page text, and
its route is exempt from the lint.)

**Contrast and color.** AA on every surface in both themes (the tokens test). No meaning by
color alone: a person's mark has its corner cut, a variant is hatched, "not yet" is
dashed, high risk carries the risk triangle.

**Keyboard and touch.** One focus ring, always visible: `--focus-ring` (2 px
`--accent-strong`), 2 px offset, from the base layer. A control that draws its own ring
uses `outline-none` and gets one ring, not two. Every control is at least 44 px tall on a
phone. One h1 per page, headings in order (the search palette lives in the header before
the h1, so its heading is rendered only while it is open). No horizontal page scroll at
390 or 1440 px. Long engine slugs may break after each slash.

**Reduced motion.** CSS transitions are set to zero; a scripted sequence does not play.

## 8. Patterns that hold across pages

**Every number is computed.** A number on a page comes from one of these, at build:
`siteFacts(getCorpus())` in `lib/compute/site-facts.ts` (counts, agent share and step marks
per structure, phases, coverage, review); `getDemoRun()` in `lib/demo/load.ts` (the
recorded run, `content/demo/run.json`); `HOSTS` in `lib/hosts.ts`; `lib/site.ts` (name, the
two doors, `connectorLive`, `engineReleased`, `repoUrl`); `getRankings()` and
`marketView()`; the functions in `lib/calculators/` with their worked examples. A
decoration never claims something: a dimension, a stamp or a title-block value is always
true and computed. Unknown is `null` in data and "not estimated" or "not researched" on
the page.

**One number system.** The only share of what an agent can do printed outside a single
record's page is `siteFacts(corpus).share.syndication`, and wherever it is shown it links
to `/playbooks#where-it-stands`, the ledger that explains every count. A page about one
record prints that record's own share. A list page gives plain counts with their unit,
never a second percentage, with one exception (D218): a row that stands for one record (the
home page's journey and scenarios) may print that record's own share, with its count beside
it for anyone who reads it out ("5 of 12 steps an agent can do"). The catalog's one sentence is `siteFacts(corpus).catalog.line`,
drawn by `CountsLine`. `REVIEW_LABEL` (`lib/labels.ts`) says "AI-drafted"; a page that
shows it for a record pairs it with the date its sources were checked.

**Honest state once.** What is not done yet is said once per page, as a legend or the
ledger, and the status line carries the real counts on every page. "Not live yet" appears
once per page, never on every prompt box, and the status line does not say it. Every such
line follows `site.connectorLive` and `site.engineReleased`: never hard-code either state,
and never write a sentence that only makes sense in the other state. No page promises
enforcement a visitor cannot have: the engine's refusal is shown as the engine's, and
while it is unreleased the page says so once.

**The stamp has one meaning.** A person (a practitioner or an attorney) reviewed this
record, on this date. It is drawn the same way everywhere, in the review blue, with its
date from `content/reviews.json`. Every other status (tested, documented, not live,
AI-drafted, outline) is a `Tag` or plain words.

**Company icons (D218, replacing "No logos").** A host or vendor shows its own icon through
`Logo` (`components/ui/logo.tsx`), always beside its name in text, or, in a dense row, as a
link whose accessible name and title are the name. Every icon is a file the company's own
site served, kept whole at its own colors in `public/logos/`, with where and when it was
fetched and its hash in `lib/logos.ts` (`__tests__/logos.test.ts` checks the hashes). A
vendor with no icon on file gets a letter tile of ours; a government source gets one neutral
glyph of ours (`agency`), never a seal. Icons in dark ink sit on the light `--logo-ground`
tile so they read on Night. The footer says once that names and marks belong to their owners
and that no vendor pays to be listed. No new host is added outside `lib/hosts.ts`.

**Radios and `:has()`.** A switch that changes what a page shows (the structure and
property-type switches, the doors and host tiles on /connect, the catalog filters) is a
set of radios in a labelled fieldset with a `<style>` of `:has()` rules scoped to its own
root, so it works with scripts off. A small client enhancer keeps the choice in the URL.
Focus is drawn on the option with `:has(input:focus-visible)`. A switch does not print.

**A record written for fewer than three structures.** A record may be written for one or
two structures only (`written.structure`; today `negotiate-jv-agreement`, for a joint
venture, D214). Its page shows only the structures it has steps in
(`writtenStructures(pb)` in `lib/compute/variant.ts`, in the catalog's order). The root's
`data-structure` is `openingStructure(pb)`, the first of them; the structure switch offers
only those structures, so its first radio, checked by default, and `VariantSync`'s fallback
name the same one; with one structure there is no switch, and the foundation's rule for a
root without one shows that view alone. The line of facts in the head says which
structures it is for ("JV only", `onlyLabel` in `components/playbook/words.ts`), once.
Elsewhere the record carries the same words in a solid `Tag` (a fact, not "not yet", so
never dashed): in the chain of what comes before and after, in place of the count on its
`/playbooks` row in a view it has no steps in, and beside its title on an outline's
neighbour row, which counts it in its own opening view. The ledger says how many written records each view's
steps come from. The headline share stays the syndication view, so such a record's steps
are not in it. `__tests__/written-structures-pages.test.ts` holds all of this on made-up
records.

**Copy.** The user is an "operator", never a "sponsor" (catalog titles and the example
firm's name are data and stay as written). Plain names, sentence case, short sentences,
no sheet codes, no hype, no emoji. Controls name their action. Not legal advice; every
step says where it comes from: a cited source or common practice.

## 9. Print

A printed page, or one saved as PDF, is a plain document. The `@media print` block at the
end of `app/globals.css` applies Paper, then sets every surface to white, removes the
grid, keeps `--accent-ink` dark and lifts `--agent` so ink reads on a mark whether or not
its fill prints. It drops the skip link, the site header and footer, the status line, the
dialog and the theme toggle; forces `--draw` to 1 and hides the cloud's pencil, so every
drawing prints finished; prints the address after an outside link; and opens every fold
(`details::details-content` where the browser has it, `PrintFolds` where it does not). Mark
what is only for the screen with `print:hidden` (switches, filters, prompt boxes, the list
of steps, the software line, drawings) and what is only for paper with `hidden print:block`. On paper the page
is about 700 px wide, so the phone layout prints. The playbook page is the one it is tuned
on: every step open, in order, and a line to sign and one to date on each person's step
(`.st-sign` in `components/playbook/page-styles.tsx`). The `.sl-*` print rules still in
`app/globals.css` belong to the old step list, which no component draws now. Check with
`"mode": "pdf"` in a shot job.

## 10. Adding a page

1. Create the route under `app/`. Wrap its content in one `Container` (the layout already
   renders the header, `<main id="main">`, the status line and the footer).
2. Open with `PageHead` (the home cover is the only page without one). No label above the
   title. The thing the page is for starts on the first screen at 1440 by 900.
3. Pick each section's surface: a drawing is a `Sheet` (grid allowed, one title block), a
   reading section is a column of ruled rows on plain ground, inputs are a form of ruled
   cells. Never a bordered box inside another.
4. Use the type roles and the primitives. If you need rules utilities cannot say, add one
   `<style href precedence>` block under a new prefix, starting `@layer components`.
5. Every figure comes from section 8's sources. Every statement of state follows the flags.
6. Add the page to `FOOTER_GROUPS` in `components/site-footer.tsx`, and to `PAGE_ROUTES` in
   `app/sitemap.ts` if it is a page a reader lands on. The header's five sections are
   `nav` in `lib/site.ts`; its phone menu lists the footer pages those leave out.
7. Run the design lint on your files, the tests your change touches, and look at the page
   with `tools/shot.mjs` at 1440 and 390, with `--nojs`, in Paper and in print.

## 11. The design lint

`tools/design-lint.mjs` reads source text (it does not run Tailwind or React) and checks the
design contract. Plain Node, no dependencies.

```
npm run design:lint                        every .ts, .tsx and .css under app/ and components/
npm run design:lint -- components/home     only these files or folders
node tools/design-lint.mjs --strict        exit 1 while any error remains
node tools/design-lint.mjs --strict-all    exit 1 while any error or legacy finding remains
node tools/design-lint.mjs --json          findings and summary as JSON
node tools/design-lint.mjs --rule kicker   one rule (repeat or comma-separate for more)
node tools/design-lint.mjs --summary-only  the summary tables without the findings
```

Severities: **error** is a ban; **legacy** is allowed until the rebuild ends; **check** is
a heuristic and a person decides.

| Rule | Severity | Fails on |
|---|---|---|
| `type-arbitrary-size` | error | `text-[..]` sizes, px `font-size` or `font` outside a role utility, px or bare `fontSize` in style objects |
| `type-arbitrary-weight` | error | `font-[N]`, `font-stretch-*`, `tracking-[..]`: the role sets them |
| `type-legacy-alias` | legacy | a retired alias (`display-*`, `lede`, `figure`, `ann`, `eyebrow`) in a class list |
| `kicker` | error | `<Eyebrow>`, `PageHead eyebrow=`, `SheetHeader label=` |
| `side-stripe` | error | a left or right border, or an inset shadow, of 2 px or more |
| `color-literal` | error | a hex, `rgb()`, `hsl()`, `oklch()` or a Tailwind palette color outside the theme blocks and the print block |
| `white-hover` | error | `hover:bg-white` |
| `round-number` | check | `rounded-full` around a number or on a fixed square; a 50% radius on a square in CSS |
| `tiny-text` | error | any text size under 12 px |
| `arbitrary-space` | error | `p-[..]`, `m-[..]`, `gap-[..]`, `space-x-[..]` with a length |
| `body-grid` | error | a grid-like `linear-gradient` outside `.sheet-grid` |
| `blur-chrome` | error | `backdrop-blur` or a `backdrop-filter` blur |
| `glyph-icon` | check | a text glyph (`+`, `›`, `»`, `×`, a diamond, a triangle) standing alone as an icon |
| `unlayered-style` | error | a `<style precedence>` whose CSS does not start with `@layer` |
| `mono-on-words` | check | `font-mono` on plain words |
| `lint-directive` | error | a broken disable comment |

Image routes (`opengraph-image`, `twitter-image`, `icon`, `apple-icon`) and
`app/manifest.ts` are exempt: tokens cannot reach them. To silence one finding, put a
directive with a reason on the line before it; the summary counts them:

```
// design-lint-disable-next-line color-literal -- the browser reads these before any CSS
```

`__tests__/design-lint.test.ts` tests the lint itself.

## 12. Tests that pin the system

```
VITEST_MAX_WORKERS=1 npx vitest run __tests__/tokens.test.ts __tests__/design-lint.test.ts
```

`__tests__/tokens.test.ts` checks, for Night and for Paper: every token declared once as hex
with its OKLCH beside it; every ink set as words at 4.5:1 on every surface and over the
grid; reading inks at 4.5:1 on the agent and person tints; `text-faint` at 6:1 on the
ground and a sheet; the grid faint; the ink on every filled control or mark at 4.5:1;
selection, marks, outlines and the focus ring; the surface ladder; the scrim and the one
shadow; warn apart from amber and the redline; the cloud's pencil at 3:1. Across themes:
the same names, the color schemes, Paper written once and applied three times, the pencil
tokens, the highlighter, the ground colors in the layout and manifest, and the theme key.
For print: Paper first, only eight overrides, ink at AA and marks at 3:1 on paper. And the
motion and frame tokens, every type role and alias, the grid only in `.sheet-grid`, and no
type under 12 px. When you add a surface, an ink or a theme token, add it to the test too.
The motion tests are listed in `docs/MOTION.md`.

## 13. Looking at your work

`tools/shot.mjs` takes screenshots through Chrome's DevTools protocol. It needs Google
Chrome or Microsoft Edge (or `CHROME_PATH`) and a running site:

```bash
node tools/shot.mjs --url http://127.0.0.1:3000/run --out C:/shots/run.png
node tools/shot.mjs --url http://127.0.0.1:3000/ --out C:/shots/home.png --mobile
node tools/shot.mjs --url http://127.0.0.1:3000/ --out C:/shots/home.png --mode tiles
node tools/shot.mjs --url http://127.0.0.1:3000/ --out C:/shots/home.png --scheme light
node tools/shot.mjs --url http://127.0.0.1:3000/run --out C:/shots/run.pdf --mode pdf
node tools/shot.mjs --jobs C:/shots/jobs.json
```

It prints, for each page, the files written, the document height, horizontal overflow in
px (0 is the only pass), console errors and failed requests. Motion is reduced unless you
pass `--motion`; `--nojs` loads a page with scripts off; `--media print` lays the page out
with its print styles. Look at the PNGs; keep them outside the repository.

**Start a browser only through that tool, and batch the shots.** On Windows a browser
started on a brand-new profile tests the signed-in account once with an empty password,
which counts as a failed sign-in; ten in ten minutes lock the account. The tool seeds each
throwaway profile so that does not happen (`seedOsCheck`). Never bypass that guard, never
copy the tool, never write another script that starts Chrome or Edge, and never start a
browser any other way. Put a round of shots in one `--jobs` file so the browser starts once.

## 14. Motion

`docs/MOTION.md` is the contract: `SequenceRoot` and `SequenceControls` from
`@/components/motion`, the `data-seq-step`, `data-ink` and `data-draw` attributes, the
choreographies (M1 handoff, M2 trace, M3 scene, M4 score), what each reader gets, the
controls and the cost. The devices in `components/ui` already carry `data-ink` or
`data-draw`: `RoleMark`, `Marks`, `LaneTag`, `Stamp`, `Outcome` and `RefusedBadge` pencil
themselves under `data-inked="false"`; `RevisionCloud`, `DimensionLine`, `PropertyLine` and
`Icon` with `draw` follow `--draw`. Only `lib/motion/loader.ts` may import `gsap`, and only
with `import()`.
