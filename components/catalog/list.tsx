import type { ReactNode } from "react";
import Link from "next/link";
import { Disclosure, cx } from "@/components/ui";
import { AgentCount, MarksKey, PerStructure, ReviewLegend, ReviewMark, RowMarks, STEP_NOUN } from "./row-parts";
import type { BoardRecord, OutlineRecord } from "./data";
import { FilterSelect, Segmented, SegmentedStyles, segmentRules } from "./filter";
import { ListSearch } from "./list-search";
import { titleKey } from "./title-words";

// CatalogList: the list a catalog page is for, grouped (by phase, or by how fast to act). Each
// group is a plain heading with its counts, then ruled rows: the written records first, solid,
// each with its title, one line on what it is for, its step marks, how many steps an agent can
// do and its review state; then the outlines, on dashed rules, in quieter ink, each saying
// "Outlined". A group's outlines fold under one line at every width, so the written rows lead.
//
// Over the list (D224, the owner's "Pills + search"):
//   - a box that keeps the rows whose titles match what is typed (ListSearch, scripts on; with
//     scripts off it is not drawn and nothing is filtered);
//   - two filters as pill tracks whose highlight slides to the choice (Segmented): written or
//     outlined, with counts, and one group. They are radios with :has() rules that hide the
//     rest, so they work with scripts off. A group filter with more than five choices (the six
//     phases and the audits) is a select below 1024 px, where its pills would not fit a line;
//     a shorter one (how fast to act) is a select only on a phone.
// The first filter's legend is the noun, so its counts say what they count. A row lights softly
// under the pointer or the keyboard, and each group comes into focus once as it reaches the
// screen (data-reveal, components/motion/page-motion.tsx; scripts off, less motion and paper
// get it in place). Every structure's figures are rendered; the nearest [data-structure] root
// picks one. Server component.

/** A group the second filter picks: a phase, or how fast to act. */
export type ListGroup = { key: string; label: string };
type Rec = { kind: BoardRecord["kind"]; phase: BoardRecord["phase"]; urgency: BoardRecord["urgency"] };

// A key or id piece must not carry quotes or brackets into a selector.
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

// The three columns a row lays out on from 1024 px: the record, its steps, its review state.
const COLS = "lg:grid-cols-[minmax(0,1fr)_16rem_12rem] lg:gap-x-8";

// More group choices than this, and the group's pills wait for 1024 px.
const PILLS_AT_768 = 5;

// The rules every catalog list shares: the search box only with scripts on, and a row's soft
// light, drawn behind the row a little wider than its words, under the pointer or around a
// keyboard focus. In @layer components (DIRECTION section 9).
const LIST_CSS = `@layer components {
html:not(.js) .cl-js{display:none}
.cl-row{isolation:isolate}
.cl-row::before{content:"";position:absolute;inset:0 -.75rem;z-index:-1;border-radius:var(--radius-control);background:var(--bg-raised);opacity:0;transition:opacity var(--dur-1) var(--ease-out);pointer-events:none}
@media (hover:hover){.cl-row:hover::before{opacity:1}}
.cl-row:has(a:focus-visible)::before{opacity:1}
@media print{.cl-row::before{content:none}}
}`;

export function CatalogList({
  id,
  noun,
  written,
  outlined,
  groups,
  groupOf,
  groupLegend,
  detail,
  controls,
  footer,
}: {
  /** The list's id: the filter's :has() rules are scoped to it. */
  id: string;
  /** What a row is, plural and lower case ("playbooks and audits"). */
  noun: string;
  written: readonly BoardRecord[];
  outlined: readonly OutlineRecord[];
  /** The groups, in order (phases, or how fast to act). Each is a heading and a filter choice. */
  groups: readonly ListGroup[];
  groupOf: (r: Rec) => string;
  groupLegend: string;
  /** The row's second line: what it is for (summary) or when it applies (trigger). */
  detail: "summary" | "trigger";
  /** At the end of the filter row: a structure switch. */
  controls?: ReactNode;
  /** Under the list: a link onward. */
  footer?: ReactNode;
}) {
  const root = safe(id);
  const showId = (v: string) => `${root}-show-${v}`;
  const groupId = (g: string) => `${root}-g-${safe(g)}`;
  const selectId = `${root}-g-select`;
  // With nothing outlined, the written/outlined choice has nothing to choose between, so it goes.
  const shows =
    outlined.length === 0
      ? []
      : [
          { v: "all", label: "All", n: written.length + outlined.length },
          { v: "written", label: "Written", n: written.length },
          { v: "outline", label: "Outlined", n: outlined.length },
        ];
  const showOptions = shows.map((s) => ({ value: s.v, label: s.label, count: s.n }));
  const groupOptions = [{ value: "all", label: "All" }, ...groups.map((g) => ({ value: safe(g.key), label: g.label }))];
  // Where the group's pills take over from its select: 768 px, or 1024 px for a long list of choices.
  const wide = groupOptions.length > PILLS_AT_768;
  const at = wide ? 1024 : 768;
  const writtenIn = (g: string) => written.filter((r) => groupOf(r) === g);
  const outlinedIn = (g: string) => outlined.filter((r) => groupOf(r) === g);
  const text = (r: { summary: string; trigger: string | null }) => (detail === "trigger" ? (r.trigger ?? r.summary) : r.summary);

  // The rules: each choice hides what it leaves out; a group with nothing left in it hides too,
  // and the one note shows when a combination leaves nothing at all. The group is picked with
  // pills from `at` px and with a select below it; each width reads only its own control, so
  // the one in view always governs. In @layer components (DIRECTION section 9); a hide is
  // !important so a display utility on a row cannot undo it.
  const on = (sel: string) => `#${root}:has(#${sel}:checked)`;
  const picked = {
    chips: (g: string) => on(groupId(g)),
    select: (g: string) => `#${root}:has(#${selectId} option[value="${safe(g)}"]:checked)`,
  };
  const hide = "{display:none !important}";
  const unfold = (scope: string) =>
    `${scope} .cl-fold::details-content{display:contents;content-visibility:visible}\n${scope} .cl-fold>summary{display:none}`;
  const groupRules = (pick: (g: string) => string) => {
    const out = groups.map((g) => `${pick(g.key)} [data-g]:not([data-g="${safe(g.key)}"])${hide}`);
    // Outlines are folded; once the reader picks one group, its outlines show.
    out.push(`@supports selector(::details-content){${groups.map((g) => unfold(pick(g.key))).join("\n")}}`);
    for (const g of [{ key: "all" }, ...groups]) {
      const w = g.key === "all" ? written.length : writtenIn(g.key).length;
      const o = g.key === "all" ? outlined.length : outlinedIn(g.key).length;
      for (const s of shows) {
        const left = (s.v === "outline" ? 0 : w) + (s.v === "written" ? 0 : o);
        if (left === 0) out.push(`${pick(g.key)}:has(#${showId(s.v)}:checked) [data-empty]{display:block !important}`);
      }
      if (shows.length === 0 && w + o === 0) out.push(`${pick(g.key)} [data-empty]{display:block !important}`);
    }
    return out.join("\n");
  };
  // While a query is typed (ListSearch marks the root data-q): a row that misses goes, so does a
  // list or a fold with no row left in it and a group the box found empty (data-none), and the
  // folded outlines show their matches without the line that folds them.
  const q = `#${root}[data-q]`;
  const searchRules = [
    `${q} [data-row][data-miss],${q} [data-none]${hide}`,
    `${q} ol[data-depth="full"]:not(:has(>[data-row]:not([data-miss])))${hide}`,
    `${q} .cl-outs:not(:has([data-row]:not([data-miss])))${hide}`,
    `${q} .cl-fold>summary${hide}`,
  ];
  const rules = [
    `#${root} [data-empty]${hide}`,
    `${on(showId("written"))} [data-depth="outline"]${hide}`,
    `${on(showId("written"))} [data-n-full="0"]${hide}`,
    `${on(showId("outline"))} [data-depth="full"]${hide}`,
    `${on(showId("outline"))} [data-n-outline="0"]${hide}`,
    // Picking outlines unfolds every group's outlines; where the written rows above are hidden,
    // the outlines take their own dashed rule on top.
    `@supports selector(::details-content){${unfold(on(showId("outline")))}\n${on(showId("outline"))} [data-after-rows] .cl-fold ol{border-top:1px dashed var(--line-strong)}}`,
    `@media (min-width:${at}px){${groupRules(picked.chips)}}`,
    `@media (max-width:${at - 0.02}px){${groupRules(picked.select)}}`,
    ...searchRules,
    // Each pill track's highlight sits under its checked choice.
    segmentRules(`#${root}`, `${root}-show`, showOptions, showId),
    segmentRules(`#${root}`, `${root}-g`, groupOptions, groupId),
  ];

  // The first filter's legend names what the counts count ("Playbooks and audits: All 73"), so
  // they read in the same scope as the page's facts above them. On a phone the head's fact
  // line just above already names them, and the three chips need the line.
  const scope = noun.charAt(0).toUpperCase() + noun.slice(1);

  return (
    <div id={root} className="min-w-0">
      <style href="catalog-list" precedence="default">
        {LIST_CSS}
      </style>
      <SegmentedStyles />
      <style href={`catalog-list-${root}`} precedence="default">{`@layer components{\n${rules.join("\n")}\n}`}</style>

      {/* The list's head. From 768 px: one ruled row with the filter box and the two pill
          tracks (the group's own row where it does not fit), then the key on the left and the
          capital structure on the right. On a phone: the box, the written/outlined pills, the
          group as a select, the capital structure, each on its own line and all in view, then
          the key folded under one line. */}
      <div className="grid gap-y-3 border-t border-line pt-3 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-8 md:gap-y-0 md:pt-0">
        <div className="flex min-w-0 flex-col gap-3 print:hidden md:col-span-2 md:flex-row md:flex-wrap md:items-center md:gap-x-8 md:border-b md:border-line md:py-3">
          <ListSearch rootId={root} noun={noun} />
          {shows.length > 0 && <Segmented name={`${root}-show`} legend={scope} options={showOptions} idOf={showId} legendClassName="max-md:hidden" />}
          <Segmented name={`${root}-g`} legend={groupLegend} options={groupOptions} idOf={groupId} className={wide ? "max-lg:hidden" : "max-md:hidden"} />
          <FilterSelect id={selectId} legend={groupLegend} options={groupOptions} className={wide ? "lg:hidden" : "md:hidden"} />
        </div>
        {controls && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-3 print:hidden md:col-start-2 md:row-start-2 md:self-start md:border-0 md:pb-0 md:pt-4">
            {controls}
          </div>
        )}
        {/* The key: who does a step, and the review states, said once for every row below. */}
        <div data-depth="full" className="min-w-0 md:col-start-1 md:row-start-2 md:pt-4">
          <Disclosure
            openFrom="md"
            summary="What the marks mean"
            summaryClassName="type-label text-muted"
            bodyClassName="flex flex-col gap-y-3 pb-1 max-md:pt-1"
          >
            <MarksKey />
            <ReviewLegend records={written} scope={`Of the ${written.length} written`} />
          </Disclosure>
        </div>
      </div>

      {groups.map((g, gi) => {
        const rows = writtenIn(g.key);
        const outs = outlinedIn(g.key);
        if (rows.length + outs.length === 0) return null;
        const hId = `${root}-${safe(g.key)}-h`;
        return (
          <section
            key={g.key}
            data-g={safe(g.key)}
            data-n-full={rows.length}
            data-n-outline={outs.length}
            data-reveal=""
            aria-labelledby={hId}
            className={gi === 0 ? "pt-8 md:pt-10" : "pt-12 md:pt-16"}
          >
            <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <h2 id={hId} className="type-title-m m-0 text-text">
                {g.label}
              </h2>
              <p className="type-body-s m-0 flex gap-x-4 tabular-nums text-faint">
                <span data-depth="full">{rows.length} written</span>
                {outlined.length > 0 && <span data-depth="outline">{outs.length} outlined</span>}
              </p>
            </div>

            {rows.length > 0 && (
              <ol data-depth="full" aria-label={`${g.label}: written ${noun}`} className="m-0 list-none border-t border-line-strong p-0">
                {rows.map((r) => (
                  <WrittenRow key={r.id} r={r} text={text(r)} />
                ))}
              </ol>
            )}

            {outs.length > 0 && (
              <div
                data-depth="outline"
                data-after-rows={rows.length > 0 ? "" : undefined}
                className={cx("cl-outs", rows.length === 0 && "border-t border-line-strong")}
              >
                {/* The outlines fold under one line at every width, so the written rows lead; picking
                    Outlined or one group unfolds them (the rules above), and find-in-page and print open them. */}
                <Disclosure
                  className="cl-fold"
                  summaryClassName="type-body-s border-b border-dashed border-line-strong text-muted hover:text-text"
                  summary={<span className="tabular-nums">{outs.length} outlined, not written yet</span>}
                >
                  <ol
                    aria-label={`${g.label}: outlined ${noun}`}
                    className="m-0 list-none p-0 lg:grid lg:grid-cols-2 lg:gap-x-8"
                  >
                    {outs.map((r) => (
                      <OutlineRow key={r.id} r={r} text={text(r)} />
                    ))}
                  </ol>
                </Disclosure>
              </div>
            )}
          </section>
        );
      })}

      <p data-empty="" className="type-body m-0 mt-10 border-y border-dashed border-line-strong py-6 text-muted">
        Nothing here for that choice yet. Pick All to see every one.
      </p>
      {footer}
    </div>
  );
}

// A written record: solid rule, the title in the row-title role, and its figures to the right.
// data-row and data-title are what the filter box reads (ListSearch).
function WrittenRow({ r, text }: { r: BoardRecord; text: string }) {
  return (
    <li data-row="" data-title={titleKey(r.title)} className={cx("cl-row relative grid gap-y-3 border-b border-line py-4 lg:items-center", COLS)}>
      <div className="min-w-0">
        <Link
          href={`/playbooks/${r.slug}`}
          className="type-title-s block text-text no-underline decoration-accent-strong after:absolute after:inset-0 hover:text-accent-strong hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent-strong"
        >
          {r.title}
        </Link>
        <p className="type-body-s m-0 mt-1 line-clamp-2 text-muted lg:line-clamp-1">{text}</p>
      </div>
      {/* Under 1024 px the marks, the count and the review state run as one wrapping line under
          the title; from 1024 px they take the row's second and third columns. */}
      <div className="type-body-s flex flex-wrap items-center gap-x-4 gap-y-2 text-muted lg:contents">
        <div className="contents lg:flex lg:flex-col lg:items-start lg:gap-y-2">
          <PerStructure>{(s) => <RowMarks r={r} s={s} size="md" />}</PerStructure>
          <PerStructure>{(s) => <AgentCount r={r} s={s} />}</PerStructure>
        </div>
        <ReviewMark review={r.review} />
      </div>
    </li>
  );
}

// An outline: dashed rule, quieter ink, its title and one line, and how many steps are planned.
// The group says once that these are outlines; a screen reader hears it on every row.
function OutlineRow({ r, text }: { r: OutlineRecord; text: string }) {
  const noun = STEP_NOUN[r.kind][r.planned === 1 ? 0 : 1];
  return (
    <li data-row="" data-title={titleKey(r.title)} className="cl-row relative min-w-0 border-b border-dashed border-line-strong py-3">
      <div className="flex min-w-0 items-baseline justify-between gap-x-4">
        <Link
          href={`/playbooks/${r.slug}`}
          className="type-body min-w-0 text-muted no-underline after:absolute after:inset-0 hover:text-text hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent-strong"
        >
          {r.title}
          <span className="sr-only">. Outlined, not written yet.</span>
        </Link>
        {r.planned > 0 && (
          <span className="type-body-s flex-none whitespace-nowrap tabular-nums text-faint">
            {r.planned} {noun} planned
          </span>
        )}
      </div>
      <p className="type-body-s m-0 mt-1 truncate text-faint">{text}</p>
    </li>
  );
}
