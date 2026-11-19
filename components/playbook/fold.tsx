// FoldStyles: the rules a RuleCard draws with (components/rule-card.tsx, prefix rc-), in one
// <style> React hoists to the head once. A page that draws rule cards renders it once itself
// (the playbook page, a calculator's page): the card does not, so the rules are not repeated
// in the payload once per card. They sit in @layer components, so a Tailwind utility on the
// same element still wins.
//
// The fold itself, its chevron, and a #hash that shows a folded row with scripts off are
// the foundation's Disclosure (components/ui/disclosure.tsx); nothing here redraws them.
// Where a rule must beat `.disclosure > summary` it names both classes, so the order the
// two stylesheets load in never matters.
//
// A folded card is two things in the markup, as a step row is: the rule's heading (a real
// h3, with where it applies beside it), then the fold, whose summary holds the rule's id.
// They read as one row and work as one control: the summary's click area (its ::before) is
// stretched over the whole row, the chevron is set on the title's line, and keyboard focus
// rings the row. The open card's body sits above that area, so its text can be selected and
// its links followed.

const CSS = `@layer components {
.rc{position:relative;min-width:0;border-bottom:1px solid var(--line);scroll-margin-top:1rem}
.rc-head{display:grid;grid-template-columns:minmax(0,1fr);gap:.25rem 2rem;padding:1rem 1.75rem 0 0}
.rc-t{margin:0;color:var(--text)}
.rc-meta{color:var(--text-muted)}
.rc-id{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .75rem;min-width:0;color:var(--text-faint)}
.rc-id>code{min-width:0;overflow-wrap:anywhere}
.disclosure.rc-fold>summary{min-height:0;align-items:flex-start;padding:.25rem 1.75rem 1rem 0}
.rc-fold>summary::before{content:"";position:absolute;inset:0}
.rc-fold>summary:focus-visible{outline:0}
.rc-fold>summary:focus-visible::before{outline:var(--focus-ring);outline-offset:2px}
.rc-fold>summary .disclosure-chevron{position:absolute;top:1.25rem;right:0}
.rc-body{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr);gap:.75rem;padding:0 0 1.5rem}
.rc-open{padding-bottom:1.5rem}
.rc-open>.rc-head{margin-bottom:.75rem;padding-right:0}
.rc-open>.rc-body{padding-bottom:0}
.rc-rule{max-width:var(--measure);margin:0;color:var(--text-muted)}
.rc-cite{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;margin:0;color:var(--text-faint)}
@media (min-width:768px){
.rc-head{grid-template-columns:minmax(0,1fr) auto;align-items:baseline}
.rc-meta{grid-column:2;grid-row:1;text-align:right}
.rc-id{grid-column:1}
}
@media print{.rc-head,.disclosure.rc-fold>summary{break-inside:avoid;break-after:avoid}}
}`;

export function FoldStyles() {
  return (
    <style href="pb-fold" precedence="default">
      {CSS}
    </style>
  );
}
