// The plans page's own rules (prefix pl-), rendered once by the page. React hoists a <style>
// with an href and a precedence into <head>; the rules sit in @layer components so a utility on
// the same element still wins (docs/DESIGN.md, section 1). Only what utilities cannot say:
// the three cards, each a box on the ground (one border, smooth corners, the soft shadow, rules
// inside, never a box in a box), stacked on a phone and three across from 1024 px. There each
// card is a subgrid of the same three rows (name, the promise, then the rest), so the cards'
// lists start level whatever the words above them (decision 134 took out the row that said who
// each plan is for).

const CSS = `@layer components {
.pl-cards{display:grid;gap:1rem;margin:0;padding:0;list-style:none}
.pl-card{display:grid;align-content:start;min-width:0;border:1px solid var(--line-strong);border-radius:var(--radius-box);background:var(--bg-raised);box-shadow:var(--shadow-box)}
@media (min-width:1024px){
.pl-cards{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:0}
.pl-card{grid-row:span 3;grid-template-rows:subgrid;row-gap:0}
}
.pl-part{min-width:0;padding-inline:1rem}
@media (min-width:768px){.pl-part{padding-inline:1.5rem}}
.pl-head{display:flex;flex-wrap:wrap;align-items:center;align-self:start;justify-content:space-between;gap:.5rem 1rem;padding-top:1.25rem}
.pl-promise{padding-top:.5rem;padding-bottom:1.5rem}
.pl-action{padding-bottom:1.5rem}
.pl-list{border-top:1px solid var(--line);padding-block:1.25rem 1.5rem}
}`;

export function PlansStyles() {
  return (
    <style href="plans-page" precedence="default">
      {CSS}
    </style>
  );
}
