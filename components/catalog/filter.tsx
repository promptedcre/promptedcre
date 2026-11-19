import type { CSSProperties, ReactNode } from "react";
import { Icon, cx } from "@/components/ui";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
  /** Selectors (inside the root) that this choice hides, e.g. '[data-depth="outline"]'. */
  hides: string[];
};

/** A count inside a filter option: a measured figure in the reading face, with tabular digits. */
export function FilterCount({ children }: { children: ReactNode }) {
  return <span className="tabular-nums text-faint">{children}</span>;
}

export type SegmentOption = { value: string; label: string; count?: number };

// Segmented: one filter group as a pill track (D224, the owner's "Pills + search"), the catalog
// list's filter look on /playbooks and /situations. The options share the track in equal
// widths, each as wide as the widest, and one raised pill sits under the chosen option and
// slides to the next one chosen. It is a fieldset of radios, and the pill's place is a
// :has(...:checked) rule (segmentRules), so it works with scripts off; with less motion asked
// for, the pill lands at once (the foundation sets every transition to zero). The radio keeps
// the keyboard (arrow keys move the choice) and a screen reader; the focus ring is drawn on the
// option. Under 768 px an option is 44 px tall. Where the track is narrower than its options
// (a very small phone), the words are cut with an ellipsis rather than pushing the page wide.
// Styles: SegmentedStyles, rendered once by the page's list.
export function Segmented({
  name,
  legend,
  options,
  idOf,
  className,
  legendClassName,
}: {
  /** The radio group's name, and the pill's data-seg, which segmentRules aims at. */
  name: string;
  legend: string;
  options: readonly SegmentOption[];
  /** Each option's radio id (the list's :has() rules name it). */
  idOf: (value: string) => string;
  className?: string;
  legendClassName?: string;
}) {
  return (
    <fieldset className={cx("m-0 flex min-w-0 max-w-full items-center gap-2 border-0 p-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden="true" className={cx("type-label mr-1 whitespace-nowrap text-faint", legendClassName)}>
        {legend}
      </span>
      <span className="cl-seg" style={{ "--n": options.length } as CSSProperties}>
        <span aria-hidden="true" className="cl-thumb" data-seg={name} />
        {options.map((o, i) => (
          <label key={o.value} className="cl-opt type-label">
            <input type="radio" name={name} id={idOf(o.value)} value={o.value} defaultChecked={i === 0} />
            <span className="cl-opt-t">{o.label}</span>
            {o.count !== undefined && <FilterCount>{o.count}</FilterCount>}
          </label>
        ))}
      </span>
    </fieldset>
  );
}

// The pill's place for each option after the first, inside the element `scope` names: the
// option's index times the pill's own width (every option is one column wide).
export function segmentRules(scope: string, name: string, options: readonly SegmentOption[], idOf: (value: string) => string): string {
  return options
    .map((o, i) => (i === 0 ? "" : `${scope}:has(#${idOf(o.value)}:checked) .cl-thumb[data-seg="${name}"]{translate:${i * 100}% 0}`))
    .filter(Boolean)
    .join("\n");
}

// The track: an inset well with the pill radius the home page's switcher uses; the pill is the
// raised paper with the soft box shadow (D224), under the options (they sit above it). The
// chosen option's words take the text ink.
const SEGMENTED_CSS = `@layer components {
.cl-seg{position:relative;display:inline-grid;min-width:0;max-width:100%;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);border-radius:2rem;background:var(--bg-inset);padding:.25rem}
.cl-thumb{position:absolute;top:.25rem;bottom:.25rem;left:.25rem;width:calc((100% - .5rem) / var(--n,1));border-radius:2rem;background:var(--bg-raised);box-shadow:var(--shadow-box);transition:translate var(--dur-2) var(--ease-out)}
.cl-opt{position:relative;z-index:1;display:inline-flex;min-width:0;min-height:2.75rem;cursor:pointer;align-items:center;justify-content:center;gap:.5rem;border-radius:2rem;padding:0 .75rem;white-space:nowrap;color:var(--text-muted);transition:color var(--dur-1) var(--ease-out)}
.cl-opt>input{position:absolute;width:1px;height:1px;margin:0;opacity:0;pointer-events:none}
.cl-opt-t{min-width:0;overflow:hidden;text-overflow:ellipsis}
.cl-opt:has(>input:checked){color:var(--text)}
.cl-opt:has(>input:focus-visible){outline:var(--focus-ring);outline-offset:2px}
@media (hover:hover){.cl-opt:hover{color:var(--text)}}
@media (min-width:768px){.cl-opt{min-height:2.25rem}}
}`;

/** The rules every Segmented draws with, once per page (React keeps one copy per href). */
export function SegmentedStyles() {
  return (
    <style href="cl-seg" precedence="default">
      {SEGMENTED_CSS}
    </style>
  );
}

/**
 * FilterSelect: one filter group as a native select, for a phone, where eight chips would take three lines. It works
 * with scripts off: a :has(option:checked) rule reads it. The option values are the same as the chips'.
 */
export function FilterSelect({
  id,
  legend,
  options,
  className,
}: {
  id: string;
  legend: string;
  options: readonly { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 items-center gap-3", className)}>
      <label htmlFor={id} className="type-label whitespace-nowrap text-faint">
        {legend}
      </label>
      <span className="relative inline-flex min-w-0 flex-1">
        <select
          id={id}
          defaultValue={options[0]?.value}
          className="type-label min-h-11 w-full min-w-0 cursor-pointer appearance-none rounded-control border border-line-strong bg-raised py-0 pl-3 pr-10 text-text hover:border-line-bold"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
      </span>
    </div>
  );
}

// CatalogFilter: one group of choices that shows part of a list (the jurisdiction on /rules),
// drawn as the catalog list draws its filters (D230): the pill track (Segmented) from 768 px,
// and on a phone a native select, where the choices and their counts would not fit one line.
// It works with scripts off: the root's :has() reads the checked radio, or the chosen option,
// and a small style rule hides the rest; each width reads only its own control, so the one in
// view always governs. The first option is the default. It does not print. Server component.
export function CatalogFilter({
  rootId,
  name,
  legend,
  options,
  className,
}: {
  /** The id of an element that contains both the filter and the rows it filters. */
  rootId: string;
  name: string;
  legend: string;
  options: readonly FilterOption[];
  className?: string;
}) {
  const id = (v: string) => `${name}-${v}`;
  const selectId = `${name}-select`;
  const pick = {
    pills: (v: string) => `#${rootId}:has(#${id(v)}:checked)`,
    select: (v: string) => `#${rootId}:has(#${selectId} option[value="${v}"]:checked)`,
  };
  // In @layer components (DIRECTION section 9); a hide is !important so a display utility on a row cannot undo it.
  const hides = (on: (v: string) => string) =>
    options
      .filter((o) => o.hides.length > 0)
      .map((o) => `${on(o.value)} :is(${o.hides.join(",")}){display:none !important}`)
      .join("\n");
  const css = [
    `@media (min-width:768px){\n${hides(pick.pills)}\n}`,
    `@media (max-width:767.98px){\n${hides(pick.select)}\n}`,
    // The pill sits under the checked choice.
    segmentRules(`#${rootId}`, name, options, id),
  ].join("\n");
  // A select's option is one line of text: the count goes in brackets after the word.
  const selectOptions = options.map((o) => ({ value: o.value, label: o.count === undefined ? o.label : `${o.label} (${o.count})` }));
  return (
    <div className={cx("min-w-0 print:hidden", className)}>
      <SegmentedStyles />
      <style href={`catalog-filter-${rootId}-${name}`} precedence="default">{`@layer components{\n${css}\n}`}</style>
      <Segmented name={name} legend={legend} options={options} idOf={id} className="max-md:hidden" />
      <FilterSelect id={selectId} legend={legend} options={selectOptions} className="md:hidden" />
    </div>
  );
}
