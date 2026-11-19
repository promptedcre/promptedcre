import { Icon, Logo, cx } from "@/components/ui";
import type { Vendor } from "@/lib/schemas/rankings";

// The vendor page's own parts (D230, the owner's "Upgrade the vendor pages"), in the look the
// BoardUI round gave the site (D224, D227), with no BoardUI code:
//
//   SiteLink      the vendor's own site as one pill: its icon, its host, the drawn external
//                 mark, a little lift under the pointer. It leaves the site, so a screen reader
//                 hears that too.
//   CoverageRing  where a coverage page stands, by shape first: a check in the agent's tint for
//                 found, a minus for checked and absent, an empty dashed ring for not recorded
//                 ("not yet" is dashed everywhere on the site). The word beside it says the same.
//   .vd-card      a box on the ground: rounded, the soft shadow. The evidence fold, each of the
//                 four coverage pages and the contest box. Never inside the verdict's sheet
//                 (one border per sheet); there an excerpt sits in a well (.vd-q), a step of
//                 paper with no border, and the evidence ids are small wells (.vd-id).
//
// The classes are in VendorStyles, which the page renders once.

export const VENDOR_CSS = `@layer components {
.vd-site{display:inline-flex;max-width:100%;min-width:0;min-height:2.75rem;align-items:center;gap:.5rem;padding:.25rem .875rem .25rem .375rem;border:1px solid var(--line-strong);border-radius:2rem;background:var(--bg-raised);box-shadow:var(--shadow-box);color:var(--text);text-decoration:none;transition:border-color var(--dur-1) var(--ease-out),translate var(--dur-2) var(--ease-out)}
.vd-site:focus-visible{outline:var(--focus-ring);outline-offset:2px}
@media (hover:hover){.vd-site:hover{border-color:var(--line-bold);translate:0 -1px}}
@media (min-width:768px){.vd-site{min-height:2.5rem}}
.vd-card{border:1px solid var(--line-strong);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box)}
.vd-card>.disclosure>summary:focus-visible{outline-offset:-2px}
.vd-ring{display:inline-grid;flex:none;place-items:center;width:1.5rem;height:1.5rem;border:1.5px solid var(--line-bold);border-radius:50%;color:var(--text-muted)}
.vd-ring--found{border-color:var(--agent-mid);background:var(--agent-deep);color:var(--agent-text)}
.vd-ring--gap{border-style:dashed}
.vd-ids{display:inline-flex;flex-wrap:wrap;gap:.25rem}
.vd-id{display:inline-flex;align-items:center;padding:0 .375rem;border-radius:var(--radius-chip);background:var(--bg-inset);color:var(--text)}
.vd-q{margin:0;padding:.75rem 1rem;border-radius:var(--radius-control);background:var(--bg-inset)}
@media print{.vd-site,.vd-card{box-shadow:none}.vd-q{padding-inline:0;background:none}}
}`;

/** The rules for the vendor page's pill, cards, rings and wells. Render once per page. */
export function VendorStyles() {
  return (
    <style href="rankings-vendor" precedence="default">
      {VENDOR_CSS}
    </style>
  );
}

/** The vendor's own site as a pill: icon, host, the external mark. */
export function SiteLink({ vendor, className }: { vendor: Pick<Vendor, "id" | "name" | "homepage" | "kind">; className?: string }) {
  return (
    <a href={vendor.homepage} rel="noreferrer" className={cx("vd-site type-body-s", className)}>
      <Logo id={vendor.id} name={vendor.name} size="lg" government={vendor.kind === "government"} />
      <span className="min-w-0 truncate">{new URL(vendor.homepage).host}</span>
      <Icon name="external" className="flex-none text-faint" />
      <span className="sr-only"> (another site)</span>
    </a>
  );
}

/** Where one coverage page stands, drawn: found, checked and absent, or not recorded. A picture; the word beside it is the label. */
export function CoverageRing({ state }: { state: "found" | "none" | "gap" }) {
  return (
    <span aria-hidden="true" className={cx("vd-ring", state === "found" && "vd-ring--found", state === "gap" && "vd-ring--gap")}>
      {state !== "gap" && <Icon name={state === "found" ? "check" : "minus"} />}
    </span>
  );
}
