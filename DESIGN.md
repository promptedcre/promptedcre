---
name: PromptedCRE
description: Open playbooks for real estate operators, drawn as a set of construction drawings in two lights.
colors:
  # Night: the first :root block of app/globals.css, the default theme.
  bg: "#0b131f"
  bg-raised: "#101a28"
  bg-inset: "#050b15"
  bg-panel: "#172233"
  bg-tile: "#202c3d"
  fill-hover: "#cedcef"
  selection: "#1f487c"
  scrim: "rgba(5, 11, 21, 0.8)"
  shadow: "#050b15"
  line: "#212e42"
  line-strong: "#38465b"
  line-bold: "#59697f"
  grid-minor: "rgba(141, 187, 240, 0.02)"
  grid-major: "rgba(141, 187, 240, 0.04)"
  text: "#ebf1f8"
  text-muted: "#bdc8d8"
  text-faint: "#9eacbe"
  accent: "#8dbbf0"
  accent-strong: "#a8d2ff"
  accent-ink: "#070d18"
  agent: "#60e0a8"
  agent-text: "#93f0c3"
  agent-mid: "#287353"
  agent-deep: "#103324"
  human: "#f2b95a"
  human-text: "#fcd086"
  human-mid: "#84622a"
  human-deep: "#38280f"
  human-ink: "#070d18"
  danger: "#fc675c"
  warn: "#f98e46"
  dim-line: "rgba(141, 187, 240, 0.45)"
  dim-ext: "rgba(141, 187, 240, 0.3)"
  # Paper: the @utility theme-paper block, applied for a light system setting or <html data-theme="paper">.
  paper-bg: "#f3f6fa"
  paper-bg-raised: "#fcfdff"
  paper-bg-inset: "#eaf0f6"
  paper-bg-panel: "#e2ebf4"
  paper-bg-tile: "#d8e4f1"
  paper-fill-hover: "#1d3259"
  paper-selection: "#b7d4f9"
  paper-scrim: "rgba(243, 246, 250, 0.82)"
  paper-shadow: "rgba(19, 31, 53, 0.2)"
  paper-line: "#d1dae5"
  paper-line-strong: "#9cacc5"
  paper-line-bold: "#5672a0"
  paper-grid-minor: "rgba(30, 78, 172, 0.05)"
  paper-grid-major: "rgba(30, 78, 172, 0.1)"
  paper-text: "#131f35"
  paper-text-muted: "#364358"
  paper-text-faint: "#4f5c6f"
  paper-accent: "#1e4eac"
  paper-accent-strong: "#0f359b"
  paper-accent-ink: "#fcfdff"
  paper-agent: "#007d4d"
  paper-agent-text: "#01603a"
  paper-agent-mid: "#4c9c74"
  paper-agent-deep: "#ddf8e8"
  paper-human: "#b17000"
  paper-human-text: "#7b4700"
  paper-human-mid: "#b38309"
  paper-human-deep: "#feefb5"
  paper-human-ink: "#070d18"
  paper-danger: "#c50516"
  paper-warn: "#a24100"
  paper-dim-line: "rgba(30, 78, 172, 0.65)"
  paper-dim-ext: "rgba(30, 78, 172, 0.4)"
typography:
  hero:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 4.2vw + 1.25rem, 5rem)"
    fontWeight: 620
    lineHeight: 0.98
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 110"
  page:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.022em"
    fontVariation: "'wdth' 108"
  title-l:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 104"
  title-m:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.24
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 102"
  title-s:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.32
    letterSpacing: "0em"
  lede:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  body:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 420
    lineHeight: 1.6
    letterSpacing: "0em"
  body-s:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 430
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 540
    lineHeight: 1.35
    letterSpacing: "0.01em"
  note:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 480
    lineHeight: 1.4
    letterSpacing: "0.015em"
  figure:
    fontFamily: "Archivo Variable, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 6vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 110"
    fontFeature: "'tnum'"
  code:
    fontFamily: "IBM Plex Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0em"
    fontFeature: "'tnum'"
rounded:
  none: "0px"
  control: "2px"
spacing:
  space-1: "0.25rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-5: "1.5rem"
  space-6: "2rem"
  space-7: "3rem"
  space-8: "4rem"
  space-9: "6rem"
  space-10: "8rem"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.fill-hover}"
  button-primary-active:
    backgroundColor: "{colors.text-muted}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.5rem"
  button-secondary-hover:
    backgroundColor: "{colors.bg-tile}"
  button-secondary-active:
    backgroundColor: "{colors.bg-panel}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 0.5rem"
    height: "2.5rem"
  button-quiet-hover:
    backgroundColor: "{colors.bg-tile}"
  button-sm:
    padding: "0 0.75rem"
    height: "2rem"
  tag:
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.125rem 0.5rem"
  tag-muted:
    textColor: "{colors.text-muted}"
  stamp:
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.none}"
    padding: "0.4375rem 0.75rem 0.375rem"
  sheet:
    backgroundColor: "{colors.bg-raised}"
    rounded: "{rounded.none}"
    padding: "1.5rem"
  sheet-head:
    padding: "0.875rem 1.5rem"
  title-block-cell:
    padding: "0.625rem 1rem 0.75rem"
  well:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-muted}"
    typography: "{typography.code}"
    rounded: "{rounded.none}"
    padding: "1rem 1.5rem"
  role-mark:
    backgroundColor: "{colors.agent}"
    size: "0.75rem"
  role-mark-person:
    backgroundColor: "{colors.human}"
    size: "0.75rem"
  monogram:
    backgroundColor: "{colors.bg-tile}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    size: "2.25rem"
  link:
    textColor: "{colors.text}"
---

# Design System: PromptedCRE

This file describes the system as the code ships it on 2026-11-14. The tokens in the
frontmatter are copied by script from `app/globals.css`; the code wins wherever the two
differ. The implementer's companion is `docs/DESIGN.md`; motion is `docs/MOTION.md`.

**Two themes, one set of names.** The keys without a prefix are **Night**, the first
`:root` block of `app/globals.css` and the site with no preference. The keys that start
with `paper-` are **Paper**, the `@utility theme-paper` block: the same token names with
daylight values. Paper is drawn when the system asks for light (unless the visitor chose
Night) and when the visitor chose Paper; print is Paper with eight overrides. Component
entries refer to the unprefixed names because the names do not change between themes,
only their values. `.impeccable/design.json` holds what this frontmatter cannot: the OKLCH
each hex was computed from, the motion tokens, the breakpoints, the one shadow and the
phone sizes of the type roles.

## Overview

**Creative North Star: "The Drawing Set, Seen in Two Lights"**

The site is a set of construction drawings. Real estate operators read drawings every
week, so the drawing conventions carry meaning the reader already knows: a solid line is
written, a dashed line is outlined, hatching is a variant, a cut corner is a person's
step, a dash-dot property line divides the agent's side from the person's, a red revision
cloud circles the one step the engine refused, a flat stamp says a person reviewed it, and
a title block says who drew it and who approves it. Each device has one meaning and one
definition, and the system uses it for that meaning and nothing else.

Night is the drawing set at night: a dark blue ground, sheets one step lighter, light ink.
Paper is the same set on a desk in daylight, composed for paper rather than inverted: a
cool white sheet on a greyer light table, a blue-line border, and every color a writing
instrument. Density is calm. Persuade pages (`/`, `/audit`, `/connect`, `/run`) commit
fully to the world and carry the one authored motion. Read and Operate pages (the
catalog, the library, the calculators, the rankings, search) are precise and restrained:
plain ground, ruled rows, a fixed type scale, no load choreography.

The world carries structure, not decoration. The grid wallpaper, the kickers, the tick
rules under headings, mono on words, boxes inside boxes, colored side stripes and the
blurred header were removed in this round and are banned.

**Key Characteristics:**
- One border per sheet; inside it, rules, never another box.
- The drafting grid only inside a drawing.
- Color encodes role and state; a mark carries the color and the words stay neutral ink.
- Meaning by shape as well as color: a cut corner, hatching, a dashed line, a cloud.
- Archivo for every word; Plex Mono only for prompts, commands, paths, ids and measured figures.
- Smooth corners (D218): `--radius-box` (0.75rem) on a sheet, panel or window, `--radius-control` (0.5rem) on a well, button or field, `--radius-chip` (0.375rem) on a chip. The notation stays square. Boxes sit on the soft `--shadow-box` (D224); the search dialog keeps its own.
- Server HTML is the finished drawing; motion pencils it and inks it, replaying only the recorded run.

## Colors

Two lights for one drawing set: on Night a dark blue paper with light inks, on Paper a
cool white sheet with blue-black, blue, green, amber and red inks. Every color is declared
once per theme as hex, with the OKLCH it was computed from written beside it. Values below
read Night / Paper.

### Primary
- **Drafting Blue** (`accent`, #8dbbf0 / #1e4eac): links' underlines, dimension lines and
  their extension lines, the property line, the review stamp's frame, a note's icon, the
  drafting grid's tint. It is neutral: drawn or documented, not earned.
- **Strong Drafting Blue** (`accent-strong`, #a8d2ff / #0f359b): link text on hover and in
  the accent tone, the stamp's words, the focus ring, the caret, a current control's border.

### Secondary
- **Agent Green** (`agent`, #60e0a8 / #007d4d): an agent's mark, an agent's chip frame, a
  tested host's tile border. A mark, never running text. `agent-text` (#93f0c3 / #01603a)
  is for the rare word that must carry the role; `agent-mid` (#287353 / #4c9c74) is an
  agent's border; `agent-deep` (#103324 / #ddf8e8) is an agent's tint.

### Tertiary
- **Person Amber** (`human`, #f2b95a / #b17000): a person's mark, the sign-here moments,
  the "Not live yet" chip's frame. `human-text` (#fcd086 / #7b4700) is a person's word and
  "Not live yet"; `human-mid` (#84622a / #b38309) is a person's border; `human-deep`
  (#38280f / #feefb5) is a person's tint and, on Paper, the highlighter over the line a
  person signs on. Ink written on an amber fill is `human-ink` (#070d18), dark in both themes.

### Status
- **Redline** (`danger`, #fc675c / #c50516): the revision cloud, "Refused.", a
  high-severity finding, the irreversible gate. Red pencil, not salmon.
- **Burnt Orange** (`warn`, #f98e46 / #a24100): a finding, the hard-to-undo gate. Kept
  apart from amber by hue (at least 12 degrees, asserted) and by shape. Never on a neutral tag.

### Neutral
- **Ground** (`bg`, #0b131f / #f3f6fa): the page; on Paper, the light table under the sheets.
- **Sheet Paper** (`bg-raised`, #101a28 / #fcfdff): a sheet, the search dialog.
- **Well** (`bg-inset`, #050b15 / #eaf0f6): a prompt, code, a transcript, engine output.
- **Selected** (`bg-panel`, #172233 / #e2ebf4): the selected state, a pressed secondary control.
- **Control Fill** (`bg-tile`, #202c3d / #d8e4f1): a secondary control's hover, a monogram tile.
- **Ink** (`text`, #ebf1f8 / #131f35): primary words; the primary button's fill.
- **Muted Ink** (`text-muted`, #bdc8d8 / #364358): body, ledes, labels.
- **Faint Ink** (`text-faint`, #9eacbe / #4f5c6f): notes, labels in a title block, pencil.
- **Row Rule** (`line`, #212e42 / #d1dae5); **Sheet Border** (`line-strong`, #38465b /
  #9cacc5), also title-block rules; **Emphasis** (`line-bold`, #59697f / #5672a0), also a
  control's outline and a chip's frame.
- **Hover Fill** (`fill-hover`, #cedcef / #1d3259): the primary button under the pointer.
  It replaces every white hover.
- **Selection** (`selection`, #1f487c / #b7d4f9), **Scrim** (`scrim`) behind the search
  dialog, **Shadow** (`shadow`) under it, and the translucent `grid-minor`, `grid-major`,
  `dim-line` and `dim-ext`, each a percentage of the drafting blue.

Non-color theme tokens live in the same blocks: `show-on-night` and `show-on-paper`
(visibility of a thing drawn in one theme only), `highlight` (transparent on Night,
`var(--human-deep)` on Paper), `pencil-mark-opacity` and `pencil-mark-filter` (how a
sequence's generic mark looks in pencil).

`__tests__/tokens.test.ts` asserts, in each theme: every ink set as words at 4.5:1 on
every surface (`bg`, `bg-raised`, `bg-inset`, `bg-panel`, `bg-tile`) and over the grid;
`text-faint` at 6:1 on the ground and a sheet; marks, a control's outline and the focus
ring at 3:1; the surfaces stepping apart in one direction; warn apart from amber and from
the redline; the cloud's pencil at 3:1; and that both themes declare the same names.

### Named Rules

**The Writing Instrument Rule.** Every color is a writing instrument: blue-black ink for
words and linework, blue ink for links, dimensions and the stamp, green ink for the agent,
amber and a highlighter for a person, red pencil for a refusal, burnt orange for a
finding. A color that is not an instrument (a gradient, a glow, a translucent stack where
a token would do) does not belong on the sheet.

**The Mark Carries the Color Rule.** On every page a mark, a chip's frame, a square or a
glyph carries the color, and the words beside it stay neutral ink. No colored body text
except links. Color is a code for role and state; colored words would make it a mood.

**The One Review Color Rule.** A person's review has one color, the drafting blue, in the
list, the ledger and the stamp. AI-drafted is a dashed neutral outline. A review is never
drawn in a lane color, so it never reads as the agent's or the person's step.

**The Subject Owns the Strongest Color Rule.** The strongest color on any screen belongs
to the thing the screen is about. On the home cover that is the refusal and the person's
step; nothing else on the cover competes with the redline and the amber.

## Typography

**Display Font:** Archivo Variable (weight and width axes), with the metric-matched
"Archivo Fallback" faces (local Arial scaled per weight and width range) then the system sans.
**Body Font:** Archivo Variable, the same family.
**Label/Mono Font:** IBM Plex Mono, 400 and 500 only, with ui-monospace, Cascadia Mono, Consolas.

**Character:** One working face for every word, set slightly expanded for display (width
102 to 110) so headings read like the lettering on a title sheet, and a quiet mono kept
for the things a drafter would letter by machine: commands, ids, measured figures.

### Hierarchy

Thirteen role utilities in `app/globals.css`, named by job. Each sets family, size,
leading, weight, width and tracking. The frontmatter gives the value from 640 px up; the
phone value is in parentheses.

- **Hero** (`type-hero`; 620, clamp(2.75rem, 4.2vw + 1.25rem, 5rem), 0.98, width 110,
  -0.03em): the home h1 only. Fluid.
- **Page** (`type-page`; 600, 2.75rem / 1.04 (2rem / 1.14), width 108, -0.022em): every other h1.
- **Title L** (`type-title-l`; 600, 1.875rem / 1.14 (1.5rem / 1.16), width 104, -0.015em): h2.
- **Title M** (`type-title-m`; 600, 1.375rem / 1.24, width 102, -0.01em): h3, a sheet's title.
- **Title S** (`type-title-s`; 600, 1.125rem / 1.32): row and step titles, h4.
- **Lede** (`type-lede`; 400, 1.25rem / 1.5 (1.125rem)): one per page head, muted ink set by the role.
- **Body** (`type-body`; 420, 1rem / 1.6): prose, with `measure` (68ch). Light-on-dark body
  carries the extra leading and weight on purpose.
- **Body S** (`type-body-s`; 430, 0.875rem / 1.5): secondary rows, table cells, captions.
- **Label** (`type-label`; 540, 0.8125rem / 1.35, +0.01em): controls, table heads, chips,
  keys. Sentence case; the capital is written in the text.
- **Note** (`type-note`; 480, 0.75rem / 1.4, +0.015em): the floor. Chart ticks, fine print.
- **Figure** (`type-figure`; 600, clamp(3.5rem, 6vw, 6rem) / 0.9, width 110, -0.03em,
  tabular): one lead figure per sheet at most. Fluid.
- **Code** (`type-code`; Plex Mono 400, 0.875rem / 1.55): prompts and commands.
- **Data** (`type-data`; Plex Mono 500, 0.8125rem / 1.4, tabular): dimension labels, ids,
  dates in a table.

Headings take `text-wrap: balance`, body text `pretty`, both from the base layer. Figures
in tables, `time` and `output` are tabular.

### Named Rules

**The No-Kicker Rule.** Nothing sits above a heading: no eyebrow, no kicker, no small
label. Where such a label held real information ("Scene 2 of 5", a record's phase), it
moves into the heading line, the breadcrumb or the facts line. A kicker is the commonest
sign of a template, and this system is not one.

**The Mono for Measures Rule.** Plex Mono is for prompts, commands, file paths, ids and
measured figures, and nothing else. A word in mono reads as code; costume mono on labels
and buttons made the site read as a console. Digits inside a sentence are Archivo, with
`tabular-nums` where they align.

**The 12 px Floor Rule.** No text is smaller than `type-note` (0.75rem, 12 px). The
tokens test scans every font size in the stylesheet and the design lint every size in
the code. There is no exception for chart ticks any more.

**The One Scale Rule.** Type is set only through the role utilities. No arbitrary
`text-[..px]`, weight, width or tracking; the design lint fails on each.

## Layout

The frame is a 1240 px container holding 1128 px of content, with gutters of 20, 40 and
56 px (`px-5 md:px-10 lg:px-14` in `Container`). Prose holds a 68ch measure (`--measure`).
The sticky header is `--header-h` tall: 3.5rem, 3.75rem from 768 px, and in-page jumps
clear it through `scroll-padding-top`. Breakpoints are Tailwind's: 640, 768, 1024 and
1280 px; author them min-first.

Space is a 4 px base: `--space-1` to `--space-10` are 4, 8, 12, 16, 24, 32, 48, 64, 96
and 128 px, used through Tailwind's steps 1, 2, 3, 4, 6, 8, 12, 16, 24 and 32. No
arbitrary paddings or margins. A ruled row carries its own padding (`py-3` or `py-4` on
the row, not on a child). The direction for rhythm, not enforced by code: 8 to 12 px
inside a group, 24 to 32 between groups, 96 to 128 between sections on desktop and 64 to
80 on a phone, at least twice the space above a heading as below it, and no single
interval repeated down a page.

There are three kinds of surface:
- **Sheet**: a drawing (the home cover, the handoff, the run board, the findings report,
  the order-of-work board, the building elevation, the site plan, a calculator's figures).
  One 1 px border, the grid allowed in the drawing area, one title block, rules inside.
- **Column**: reading (playbook steps, rule lists, artifacts, documents, questions,
  methodology). Plain ground, no box, ruled rows, a real reading measure.
- **Form**: input (calculator inputs, search, filters). One bordered block of title-block
  cells: a dashed blank is where you type, a solid cell is computed.

Touch targets are at least 44 px on a phone: every button, summary and switch option
starts at `min-height: 2.75rem` and drops to 40 px (32 px small) only from 768 px.

### Named Rules

**The Grid Under a Drawing Rule.** The drafting grid (24 px minor, 120 px major) is drawn
only by `.sheet-grid`, inside a drawing. Prose, lists, forms and the footer sit on plain
ground. The tokens test asserts that the body has no grid and that `--grid-major` is used
only in `.sheet-grid`. On the whole page the grid was wallpaper; under a drawing it is paper.

## Elevation & Depth

The system is flat. Depth is three steps of paper: the well (`bg-inset`) behind, the
ground (`bg`), and the sheet (`bg-raised`), then `bg-panel` and `bg-tile` for the
selected state and a control's fill. On Night the steps run lighter toward the viewer; on
Paper the sheet is the lightest and the wells and selections go deeper. Lines step the
same way: a row rule, a sheet's border, emphasis. The header is opaque with a 1 px rule
and no blur.

### Shadow Vocabulary
- **Search dialog** (`box-shadow: 0 1.5rem 4rem var(--shadow)`): the one shadow on the
  site, under the search palette, over `--scrim`.

### Named Rules

**The Three Papers Rule, softened (D224).** A surface is told from another by a step of
paper and a rule. Since the owner's BoardUI round a box (a sheet, the prompt box, a stat
card, the demo window, a toast) also sits a little above the table on `--shadow-box`, one
soft shadow per theme; the search dialog keeps its deeper one. No glows; blur only in a
reveal's first frames.

## Shapes

Boxes are rounded; the notation is square. Since D218 three tokens round the boxes:
`--radius-box` on sheets, panels and cards, `--radius-control` on wells, fields, buttons and
a row's soft light, `--radius-chip` on chips. A switch's track and its sliding pill are fully
round (D224), and so are a link pill (a vendor's own site) and a status ring around an icon
(D230). No circles around numbers.

The notation is a fixed set of shapes, each defined once in `app/globals.css`:
- **Solid and dashed.** A solid line is written, earned; a dashed line is outlined, not
  yet. A chip goes dashed for "not yet"; AI-drafted is a dashed neutral chip.
- **Cut corner.** A person's step. The top-right corner is cut by `--cut` with
  `clip-path`: 5 px on the 12 px mark, 6 px on the 14 px mark, 8 px on the 20 px mark,
  12 px on `.cut-corner-ruled`, which also draws the cut edge for an outlined box. Never
  on a mark under 12 px, where the cut does not show.
- **Hatching.** A variant: an agent in a browser, a person offline, unverified. One
  pattern, `--hatch`: 135 degrees, a 1.25 px line on a 4 px pitch, in the element's own
  color with a 1 px outline.
- **Revision cloud.** Red scallops around the refused step: an 8 px band with 12 px
  corners, 16 px scallops fitted to any width by `mask-repeat: round`, drawn from SVG path
  tiles masked out of `--danger` ink. A plain 1.5 px outline where masks are not supported.
- **Dimension line.** A hairline in `--dim-line` with a 45 degree tick at each end and a
  Plex Mono figure that breaks the line.
- **Property line.** Dash-dot, 1.5 px, in the drafting blue: a 22 px dash, a 6 px gap, a
  3 px dot, a 6 px gap.
- **Stamp.** A flat ruled box (1.5 px frame), never tilted.
- **The refused badge.** A revision triangle with the step's number in Plex Mono.

### Named Rules

**The One-Border Sheet Rule.** A sheet has one 1 px border. Inside it there are rules,
never another bordered box: divide it with `SheetPart`. A `Sheet` placed inside a `Sheet`
loses its border and becomes a part of it. Boxes inside boxes made every page read as a
template; a drawing has one frame.

**The Shape Before Color Rule.** Every meaning that color carries is also carried by a
shape: a person's step by the cut corner, a variant by hatching, "not yet" by a dash, a
refusal by the cloud, high risk by the risk triangle. Color alone fails in print, for a
reader who does not see the hue, and in forced colors.

**The One Meaning Rule.** Each device means one thing. A dimension line sits only over a
counted or computed number, never as a divider. The cloud circles only a refusal, one per
view. The stamp means only that a person reviewed the record, with its date. The property
line is only the boundary between the agent's side and the person's.

## Components

Every primitive lives in `components/ui/` (exported from `@/components/ui`) or
`components/chips.tsx`. Each is pure, takes `className` for layout only, and carries its
contract in its header comment. Props and one-line examples are in `docs/DESIGN.md`.

### Buttons
- **Shape:** smooth corners (`--radius-control`); type-label; a drawn icon (arrow) when it goes somewhere.
- **Primary:** filled with ink (`text`), words in `accent-ink`; 2.5rem tall from 768 px,
  2.75rem under it; `0 1rem` padding. One per screenful.
- **Hover / Focus:** hover takes `fill-hover`, never white; pressed takes `text-muted`. The
  focus ring is the global one: 2 px `accent-strong`, 2 px offset.
- **Secondary:** outlined in `line-bold`, transparent, hover `bg-tile`, pressed `bg-panel`.
- **Quiet:** words alone, `0 0.5rem`, hover `bg-tile`.
- **Small:** 2rem tall from 768 px (still 44 px on a phone), `0 0.75rem`.
- `aria-current="page"` gives any button an `accent-strong` border. Disabled is faint ink
  in a `line-strong` frame.
- `Button` is an action that stays on the page; `ButtonLink` goes somewhere and is a real
  link with scripts off; `TextLink` is a link in running text. Not for a link inside a
  sentence: use `TextLink`.

### Chips
- **Style:** `Tag`, a ruled chip with smooth corners (`--radius-chip`) in type-label. The frame and an
  optional square (`dot`) carry the tone (muted, accent, agent, human, danger, warn); the
  word is neutral ink. Dashed for "not yet".
- **State:** `ReviewChip` is the accent tone with a square for a reviewed record and a
  dashed neutral outline for AI-drafted. Not for who does a step (use `RoleMark`) and not
  for a person's review on a record's head (use `Stamp`).

### Cards / Containers
- **Corner Style:** rounded since D218: `--radius-box` on a sheet, a panel and a card. The
  notation inside stays square.
- **Background:** a `Sheet` on `bg-raised`; a `Terminal` well on `bg-inset`; a card on
  `bg-raised`.
- **Shadow Strategy:** `--shadow-box`, the one soft shadow (D224), under a box that sits on
  the ground: a sheet, a card, the prompt box, a toast. None on paper.
- **Border:** one 1 px `line-strong` border on the sheet; rules inside. A card is a box on
  the ground beside a sheet, never inside one (the home page's stat cards; a vendor's
  evidence fold and coverage cards, D230). Inside a sheet a quoted excerpt sits in a
  borderless well.
- **Internal Padding:** 1rem, 1.5rem from 768 px; the head 0.875rem by 1rem (1.5rem
  inline from 768 px).
- `Band` is a full-width ruled stripe for a closing call, not an ordinary section.
  `Callout` is an icon and its words with no box and no side stripe: the icon carries the
  tone (note, agent, person, warn, risk).

### Inputs / Fields
There is no shared input primitive in `components/ui`. Inputs follow the Form surface: a
dashed blank is where you type, a solid cell is computed (`components/calc/styles.tsx`
draws the calculators' form). Focus is the global ring. The segmented `VariantSwitch`
(`components/variant-switch.tsx`) is the catalog filters' pill track since D227: an inset
well whose chosen option is a raised pill of paper with the soft box shadow. The catalog
lists' filters and, since D230, the jurisdiction filter on /rules are `Segmented`
(`components/catalog/filter.tsx`), the same track, with a native select on a phone where
the choices do not fit a line, and a box over the list keeps the rows whose titles match. The calculator
form is a box too: rounded, with the soft shadow, and its sticky result bar a rounded well.

### Navigation
The site header (`components/site-header.tsx`) is opaque with one rule. The current
section is the text ink with a 2 px drafting-blue rule sitting on the header's rule, never
the agent's green. "Connect your agent" is the secondary button while
`site.connectorLive` is false and the primary when it is true. It opens /plans, whose Free
card leads on to the setup steps at /connect. Under 768 px the sections
fold into a native menu. `ThemeToggle` sits in the header: a quiet small button that names
the theme it turns to. Breadcrumbs in `PageHead` are type-body-s in muted ink with a
faint slash. The footer lists every page in plain groups.

### Primitives at a glance
- **Container / Band**: the page width; a full-width stripe.
- **Heading / Lede**: h1 to h4 in the roles; the one paragraph under a title.
  **Eyebrow** is deprecated and draws one plain muted line until its callers are rebuilt.
- **PageHead**: the head of every page but the home cover: breadcrumb, h1, lede, actions,
  an optional aside from 1024 px, and one line of computed facts with at most one lead
  fact. No label above the title.
- **SheetHeader**: a section's h2 or h3 and an optional note or control. Its `label` and
  `size` props are deprecated and ignored.
- **Icon**: the one drawn set: 25 icons on a 16 px grid, 1.5 px square-capped strokes, at
  16 or 20 px. Every chevron, plus, copy, check, arrow, search, menu, close, print,
  download, external and risk mark. Never a text glyph.
- **Disclosure**: the one fold, a native `details` with one chevron that turns. It opens
  with scripts off, for find-in-page and in print.
- **TitleBlock / TitleCell / ApprovalCells**: what a sheet is, in ruled cells.
- **RoleMark / Marks / Elevation**: who does a step, as one mark, a row of marks, or a
  dimensioned drawing of many.
- **LaneTag**: whose lane a column or card is.
- **GateGlyph**: a pen (signature), a filled diamond (irreversible), a half diamond (hard
  to undo) on a person's step; its word is neutral ink.
- **Outcome**: what happened to a step. Neutral ink, except a refusal's first word in the
  redline and a finding in burnt orange; unverified and read are muted.
- **RefusedBadge**: the revision triangle with the step's number.
- **Terminal / TermLine**: the well for real engine output only, never a mock-up.
- **Logo**: a company's own icon beside its name (D218): the file its own site served, from
  `lib/logos.ts`; a letter tile of ours where none was got, one neutral glyph for a
  government source.
- **Monogram / Wordmark**: our own two-letter tile, where a tile of ours is wanted; the brand
  mark (five floors as a caret and the cursor slab, D218) and PromptedCRE, header and footer
  only.
- **StatusLine / CountsLine**: the one row of real counts above the footer, rendered once
  by the layout; the catalog's one sentence.
- **ThemeToggle, PrintFolds, VariantSync**: behavior only.

### Sheet with TitleBlock (signature)
A `Sheet` is a drawing: one border on the sheet's paper, an optional head with its title
(type-title-m), the drawing area, and one `TitleBlock` in the `titleBlock` slot drawn as
the sheet's bottom edge. `grid` turns on the drafting grid in the drawing area; `flush`
drops the padding so `SheetPart` rows lay themselves out. A Sheet sets `--dim-surface` to
its paper so a dimension or property-line label breaks its line cleanly. The title block
is one per sheet: who drew it (`ApprovalCells` draws the role's mark), who approves (with
a line to sign while unsigned, highlighted on Paper), when, what state. Cells in a row
share a label track and a value track, so values stay level when a label wraps. A
`TitleCell` with a tone draws a small square before a plain value; the words stay neutral.
Never a placeholder value.

### RevisionCloud (signature)
The red scalloped outline around the one thing the engine refused, with a `RefusedBadge`
on its corner when `delta` is given. Only for a refusal, one per view. It is drawn from
`--danger`, so it prints and print remaps it. It is drawable: `--draw` uncovers it
clockwise from the top left, and while `--draw` is below 1 the same outline shows in
pencil underneath. `TermLine kind="refused"` wraps engine output in it.

### RoleMark and LaneTag (signature)
`RoleMark` is a mark and a word: green for an agent, amber for a person, hatched for the
browser and offline variants, and a person's mark cut at the top-right corner. Sizes 12,
14 and 20 px, never smaller. The word is neutral ink in sentence case ("Person online");
`ROLE_WORD` holds the four words (agent, agent in a browser, person online, person
offline). `LaneTag` is the lane's mark and "Your agent" or "A person", and sets
`data-lane`, which hands `--lane`, `--lane-mid` and `--lane-deep` to what is inside.
Neither is ever a colored side stripe. Every key that explains the marks says "A person's
step has a cut corner".

### Stamp (signature)
A word over its date in a flat 1.5 px ruled box, in the one review color: the frame in
`accent`, the words in `accent-strong`, the date in Plex Mono. It means one thing: a
person (a practitioner or an attorney) reviewed this record, on this date. Never without
its date, never a lane color, never decorative. Its `tone` prop is deprecated and ignored.
Every other status (tested, documented, not live, AI-drafted, outline) is a `Tag`.

### DimensionLine and PropertyLine (signature)
`DimensionLine` is a hairline with tick ends and a figure that breaks it, horizontal or
vertical, label above or below: only over a number counted or computed, never a divider.
`PropertyLine` is the dash-dot boundary between the agent's side and the person's, or the
operator's machine and the hosted site; a vertical line folds flat below 768 px unless
`fold` is false. Both are drawable by `--draw` from their start.

### The handoff sequence (signature)
The home cover's drawing (`components/home/handoff.tsx`) and the site's one authored
motion (M1). Three positions of one scene of the recorded run in recorded order: the
agent's own step, done; the person's step the agent tried next, which the engine refused;
the person recording it. Agent positions sit on one side of the property line, the
person's on the other. With full motion it starts in pencil and inks in seven steps: the
check draws and the step inks (`own`), a connector reaches the next step (`reach`), the
attempt inks (`tried`), the cloud is drawn round it and "Refused." sets (`refused`), a
connector crosses the property line (`cross`), the cut-corner mark inks (`person`), and
the line to sign on is drawn and the record sets (`record`). About five seconds, once, when
half in view, with Pause and Replay. With scripts off or reduced motion it is the finished
drawing. The motion kit (`SequenceRoot`, `SequenceControls`) and the other sequences are
in `docs/MOTION.md`.

### Motion tokens
`--ease-out` cubic-bezier(0.16, 1, 0.3, 1) and `--ease-in-out` cubic-bezier(0.65, 0,
0.35, 1); `--dur-1` 120ms (feedback), `--dur-2` 200ms (a change of state, pencil to ink),
`--dur-3` 320ms (layout, a short stroke), `--dur-4` 600ms (the authored moment). Every
Tailwind `transition-*` utility defaults to `--dur-1` and `--ease-out`. A fold closes at
three quarters of its opening. Reduced motion sets every CSS transition to zero.

### Named Rules

**The Only the Recording Moves Rule.** The one demonstration is the recorded run of the
real engine (`content/demo/run.json`). Motion may replay what was recorded; it may not
stage a chat, type a prompt or invent a step. A demonstration that is not the engine's own
would be the one dishonest thing on an honest site.

**The Penciled, Then Inked Rule.** A sequence never hides its content to replay it.
Before it plays the drawing is in pencil (reduced weight and contrast, words still 4.5:1,
marks 3:1, no size change); playing inks it. This is the world's own idea, outlined then
written, and it is the only entrance on the site.

**The Visible by Default Rule.** The server's HTML is the finished state. With scripts
off, with reduced motion, if GSAP fails to load, and on paper, the page is complete and
still. Nothing on screen at load disappears or jumps.

## Do's and Don'ts

### Do:
- **Do** put one 1 px border on a sheet and divide its inside with rules (`SheetPart`).
- **Do** draw the grid only with `.sheet-grid` (or `Sheet grid`) in a drawing area.
- **Do** set every word with a type role; mono only through `type-code`, `type-data` or
  `TextLink mono`, for prompts, commands, paths, ids and measured figures.
- **Do** color the mark and leave the words in neutral ink (`text`, `text-muted`, `text-faint`).
- **Do** carry every color meaning in a shape too: cut corner, hatching, dash, cloud, risk triangle.
- **Do** use the review blue for every review statement, and a dashed neutral chip for AI-drafted.
- **Do** round boxes, wells, buttons and chips with the three radius tokens (D218), keep the notation square, and keep 44 px touch targets on a phone.
- **Do** take every icon from `Icon` and every fold from `Disclosure`.
- **Do** write colors only as tokens; add a token to both theme blocks with its OKLCH and to the tokens test.
- **Do** make a sequence start penciled from the finished server HTML, with Replay over two
  seconds and Pause when it plays by itself, keyboard reachable at 44 px.
- **Do** give reduced motion the finished state, and a step-through whose change is an
  opacity change of 120 ms at most.

### Don't:
- **Don't** put the drafting grid on `body` or behind prose, lists, forms, questions or the footer.
- **Don't** put a kicker or eyebrow above a heading.
- **Don't** draw a tick-ended rule under a section heading.
- **Don't** set words in mono.
- **Don't** put a bordered container inside another bordered container.
- **Don't** use a colored side stripe (a `border-left` or inset shadow above 1 px) on a
  card, row, note or error.
- **Don't** circle a number, zero-pad a section number, or number things that have no order.
- **Don't** use a radial glow, a blurred header, or a color written outside the token blocks.
- **Don't** stand a text glyph (`+`, `›`, a diamond, a chevron character) in for an icon.
- **Don't** use `hover:bg-white`; the hover fill is `fill-hover`.
- **Don't** use a dimension line as a divider, the cloud for anything but a refusal, or
  the stamp for anything but a person's review.
- **Don't** fade and raise sections into view, count numbers up, type out a prompt or a
  fake chat, animate or parallax the grid, draw dimension lines on scroll, lift rows or
  cards on hover, stagger lists of cards, pulse chips, or loop anything.
- **Don't** use ScrollTrigger or put GSAP in a shared chunk; only `lib/motion/loader.ts`
  imports it, on demand.
- **Don't** set text under 12 px.
