// The library pages' few rules that utilities cannot say once, under an "lb-" prefix. CSS modules
// do not work in this repository, so the rules render once per page from a server component
// (React hoists and dedupes a <style> with an href and a precedence). They sit in
// @layer components, so a utility on the same element still wins.
//
// .lb-q    a quiet cross-reference link: the ink of the text, underlined only on hover and
//          focus. Dense reference cells hold three to eight of these; underlining every one
//          turns the column into stripes. An outlined record (.lb-q--o) is muted ink with a
//          dashed underline at rest, so the difference is a shape, not only a color.
// .lb-jump an in-page jump link under a page head: muted words, a down arrow, underlined on
//          hover and focus; 44 px tall on a phone.
// .lb-xl   a cell's list of links (the records that make or read an artifact, a rule's citations).
// .lb-fs   a field standard's open body: a size container, so its fields (.lb-fr) stack in a
//          narrow cell and take four columns (with the column key .lb-fk) only past 44rem.
// .lb-rs   a rule-index row's grid (and its column key); .lb-fact one ruled fact of an open rule.
// .lb-rr   a rule-index row's soft light (D230, as the catalog lists' rows): drawn behind the
//          row a little wider than its words, under the pointer or around a keyboard focus while
//          the row is closed, and in the selected fill while the row is the #target.
// .lb-lazy a long fold's body: the browser skips laying it out until it nears the screen.

const CSS = `
@layer components {
  .lb-q{color:var(--text);text-decoration-line:none;text-decoration-color:var(--accent-strong);text-underline-offset:var(--underline-offset);transition:color var(--dur-1) var(--ease-out)}
  .lb-q:focus-visible{text-decoration-line:underline}
  .lb-q--o{color:var(--text-muted);text-decoration-line:underline;text-decoration-style:dashed;text-decoration-color:var(--line-bold)}
  @media (hover:hover){.lb-q:hover{color:var(--accent-strong);text-decoration-line:underline;text-decoration-color:var(--accent-strong)}}
  .lb-jump{display:inline-flex;align-items:center;gap:0.375rem;min-height:2.75rem;color:var(--text-muted);text-decoration-line:none;text-decoration-color:var(--accent-strong);text-underline-offset:var(--underline-offset);transition:color var(--dur-1) var(--ease-out)}
  .lb-jump-i{color:var(--text-faint);flex:none;transition:color var(--dur-1) var(--ease-out)}
  .lb-jump:focus-visible{text-decoration-line:underline}
  @media (min-width:768px){.lb-jump{min-height:2rem}}
  @media (hover:hover){.lb-jump:hover{color:var(--text);text-decoration-line:underline}.lb-jump:hover .lb-jump-i{color:var(--accent-strong)}}
  .lb-xl{display:grid;gap:0.375rem;margin:0;padding:0;list-style:none}
  .lb-xl>li{min-width:0}
  @media (max-width:767.98px){.lb-xl{gap:0}.lb-xl>li>a{display:inline-flex;min-height:2.75rem;align-items:center}}
  .lb-fs{container-type:inline-size}
  .lb-fk{display:none}
  .lb-fr{display:grid;gap:0.25rem 1.5rem;padding-block:0.75rem;border-top:1px solid var(--line)}
  .lb-fr>dt,.lb-fr>dd{margin:0;min-width:0}
  .lb-fr .lb-fl{color:var(--text-faint)}
  @container (min-width:44rem){
    .lb-fk,.lb-fr{grid-template-columns:minmax(0,13rem) 8rem minmax(0,1fr) minmax(0,11rem)}
    .lb-fk{display:grid;gap:0 1.5rem;padding-block:0.5rem}
    .lb-fr .lb-fl{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  }
  .lb-rs{display:grid;gap:0.25rem 2rem}
  @media (min-width:768px){.lb-rs{grid-template-columns:minmax(0,1fr) 9rem 5.5rem 6.5rem;align-items:baseline}}
  .lb-rr{position:relative;isolation:isolate}
  .lb-rr::before{content:"";position:absolute;inset:0 -0.75rem;z-index:-1;border-radius:var(--radius-control);background:var(--bg-raised);opacity:0;transition:opacity var(--dur-1) var(--ease-out);pointer-events:none}
  @media (hover:hover){.lb-rr:not(:has(details[open])):hover::before{opacity:1}}
  .lb-rr:not(:has(details[open])):has(summary:focus-visible)::before{opacity:1}
  .lb-rr:has(:target)::before{opacity:1;background:var(--bg-panel)}
  @media print{.lb-rr::before{content:none}}
  .lb-fact{display:grid;gap:0.25rem 1.5rem;padding-block:0.75rem;border-top:1px solid var(--line)}
  @media (min-width:768px){.lb-fact{grid-template-columns:9rem minmax(0,1fr)}}
  .lb-lazy{content-visibility:auto;contain-intrinsic-size:auto 40rem}
  .lb-lazy--s{contain-intrinsic-size:auto 24rem}
  @media print{.lb-lazy{content-visibility:visible}}
}
`;

export function LibraryStyles() {
  return (
    <style href="library" precedence="default">
      {CSS}
    </style>
  );
}
