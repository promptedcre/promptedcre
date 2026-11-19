import { useId } from "react";
import { VariantSync } from "@/components/ui/variant-sync";

type Option = { value: string; label: string };

// A CSS selector piece must not carry quotes or brackets from a prop.
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

// The attribute each variant carries for a root attribute: data-structure → data-s,
// data-ptype → data-p, data-mode → data-m (globals.css uses the same pairs).
const itemAttr = (attr: string) => `data-${safe(attr).replace(/^data-/, "").slice(0, 1)}`;

// The look every switch shares (D227, the owner's BoardUI round): the catalog filters' pill
// track (components/catalog/filter.tsx), an inset well with the chosen option raised on it as
// a pill of paper with the soft box shadow. Options keep their own widths here, so the chosen
// pill fades in where it lands rather than sliding (at once for a reader who asked for less
// motion: the foundation zeroes every transition). 44 px tall where it is tapped and 36 px
// from 768 px, like the filters. The radio is kept for the keyboard and a screen reader; its
// focus ring is drawn on the option. In @layer components, so a utility still wins.
const BASE = `@layer components {
.vsw-track{display:inline-flex;max-width:100%;flex-wrap:wrap;border-radius:2rem;background:var(--bg-inset);padding:.25rem}
.vsw-opt{position:relative;display:inline-flex;min-height:2.75rem;cursor:pointer;align-items:center;border-radius:2rem;padding:0 .875rem;white-space:nowrap;color:var(--text-muted);transition:background-color var(--dur-2) var(--ease-out),box-shadow var(--dur-2) var(--ease-out),color var(--dur-1) var(--ease-out)}
.vsw-opt:has(>input:focus-visible){outline:var(--focus-ring);outline-offset:2px}
@media (hover:hover){.vsw-opt:hover{color:var(--text)}}
@media (min-width:768px){.vsw-opt{min-height:2.25rem}}
}`;

// The rules that make the choice show and hide content with scripts off: inside #rootId,
// anything marked with the item attribute follows the checked radio, and every switch for
// the same choice marks that option as chosen. (Two switches for one choice share one radio
// group with scripts off, so only one of them holds the checked radio; the mark follows the
// value, not the radio, so both show it.)
function switchRules(rootId: string, group: string, attr: string, options: Option[]): string {
  return `@layer components {\n${options.map((o) => optionRules(safe(rootId), group, itemAttr(attr), safe(o.value))).join("\n")}\n}`;
}

function optionRules(root: string, group: string, item: string, value: string): string {
  const on = `#${root}:has(input[data-vsw="${group}"][value="${value}"]:checked)`;
  const chosen = `${on} .vsw-opt:has(> input[data-vsw="${group}"][value="${value}"])`;
  return [
    `${on} [${item}]:not([${item}~="${value}"]){display:none !important}`,
    `${chosen}{background:var(--bg-raised);color:var(--text);box-shadow:var(--shadow-box)}`,
  ].join("\n");
}

// VariantSwitch: a segmented control (a pill track; the chosen option is a raised pill) that
// picks which variant of a page shows. It is a
// fieldset of radios, and a <style> element carries the choice with CSS alone, so it works with
// scripts off. With scripts on, VariantSync keeps the choice in the URL (?param=value) and on
// the root element's data attribute.
// The switch must sit inside the element whose id is `rootId`; mark each variant inside it
// data-s, data-p or data-m (for data-structure, data-ptype, data-mode).
export function VariantSwitch({
  rootId,
  param,
  attr,
  options,
  label,
}: {
  rootId: string;
  param: string;
  attr: string;
  options: Option[];
  label: string;
}) {
  const fieldsetId = `vsw-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const group = `${safe(rootId)}-${safe(param)}`;
  return (
    <>
      <style href="vsw-base" precedence="default">
        {BASE}
      </style>
      <style href={`vsw-${group}`} precedence="default">
        {switchRules(rootId, group, attr, options)}
      </style>
      <VariantSync fieldsetId={fieldsetId} rootId={rootId} param={param} attr={attr} values={options.map((o) => o.value)} />
      <fieldset id={fieldsetId} className="m-0 inline-flex min-w-0 max-w-full border-0 p-0 print:hidden">
        <legend className="sr-only">{label}</legend>
        <span className="vsw-track type-label">
          {options.map((o, i) => (
            <label key={o.value} className="vsw-opt">
              <input type="radio" name={group} value={o.value} defaultChecked={i === 0} data-vsw={group} data-vsw-attr={safe(attr)} className="sr-only" />
              {o.label}
            </label>
          ))}
        </span>
      </fieldset>
    </>
  );
}
