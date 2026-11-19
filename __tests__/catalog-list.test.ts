import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogList, type ListGroup } from "@/components/catalog/list";
import { URGENCIES, getCatalog, pick } from "@/components/catalog/data";
import { titleKey, titleMatches, titleWords } from "@/components/catalog/title-words";

// The list /playbooks and /situations are for (D224, the owner's "Pills + search"), rendered to
// markup. Pinned: the two filters are radios in pill tracks whose highlight is placed by CSS
// alone, so they work with scripts off; the filter box is drawn only with scripts on and every
// row carries the words it matches; each group comes into focus once (data-reveal); a row has
// its hover light. Words and looks are not pinned.

const count = (html: string, needle: string) => html.split(needle).length - 1;
const render = (props: Parameters<typeof CatalogList>[0]) => renderToStaticMarkup(createElement(CatalogList, props));

const { facts, written, outlined } = getCatalog();

// /playbooks: the process playbooks by phase, then the audits.
const pbWritten = [...pick(written, { kind: "process" }), ...pick(written, { kind: "audit" })];
const pbOutlined = outlined.filter((r) => r.kind === "process" || r.kind === "audit");
const phases: ListGroup[] = [...facts.phases.map((p) => ({ key: p.phase, label: p.label })), { key: "audits", label: "Audits" }];
const playbooks = render({
  id: "catalog",
  noun: "playbooks and audits",
  written: pbWritten,
  outlined: pbOutlined,
  groups: phases,
  groupOf: (r) => (r.kind === "audit" ? "audits" : r.phase),
  groupLegend: "Phase",
  detail: "summary",
});

// /situations: grouped by how fast to act.
const sitWritten = pick(written, { kind: "situation" });
const sitOutlined = pick(outlined, { kind: "situation" });
const urgencies: ListGroup[] = URGENCIES.filter((u) => [...sitWritten, ...sitOutlined].some((r) => r.urgency === u)).map((u) => ({ key: u, label: u }));
const situations = render({
  id: "situations",
  noun: "situations",
  written: sitWritten,
  outlined: sitOutlined,
  groups: urgencies,
  groupOf: (r) => r.urgency ?? "unsorted",
  groupLegend: "How fast",
  detail: "trigger",
});

/** The radios of one group, in order: value and whether it is chosen with scripts off. */
function radios(html: string, name: string): Array<{ value: string; checked: boolean }> {
  return [...html.matchAll(/<input[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`name="${name}"`))
    .map((tag) => ({ value: /\svalue="([^"]+)"/.exec(tag)?.[1] ?? "", checked: /\schecked(=|\s|\/|>)/.test(tag) }));
}

describe("the filter box's words", () => {
  it("are lower case, without accents, letters and digits only", () => {
    expect(titleWords("File Form D — and state notices")).toEqual(["file", "form", "d", "and", "state", "notices"]);
    expect(titleWords("Résumé 1031")).toEqual(["resume", "1031"]);
    expect(titleKey("Buy as a 1031 replacement")).toBe("buy as a 1031 replacement");
  });

  it("match a title holding every word typed, in any order, as a whole word or a part of one", () => {
    expect(titleMatches("Form the sponsor entity", "entity form")).toBe(true);
    expect(titleMatches("Form the sponsor entity", "spons")).toBe(true);
    expect(titleMatches("Form the sponsor entity", "fund")).toBe(false);
    expect(titleMatches("Form the sponsor entity", "")).toBe(true);
  });
});

describe("the catalog list's filters", () => {
  it("are radios in two pill tracks, the first choice of each chosen with scripts off", () => {
    expect(count(playbooks, 'class="cl-seg"')).toBe(2);
    expect(count(playbooks, 'class="cl-thumb"')).toBe(2);
    expect(radios(playbooks, "catalog-show")).toEqual([
      { value: "all", checked: true },
      { value: "written", checked: false },
      { value: "outline", checked: false },
    ]);
    const groups = radios(playbooks, "catalog-g");
    expect(groups.map((g) => g.value)).toEqual(["all", ...phases.map((p) => p.key)]);
    expect(groups.filter((g) => g.checked).map((g) => g.value)).toEqual(["all"]);
  });

  it("slide the highlight to the chosen pill with CSS alone, one column per choice", () => {
    expect(playbooks).toContain('#catalog:has(#catalog-show-written:checked) .cl-thumb[data-seg="catalog-show"]{translate:100% 0}');
    expect(playbooks).toContain('#catalog:has(#catalog-show-outline:checked) .cl-thumb[data-seg="catalog-show"]{translate:200% 0}');
    phases.forEach((p, i) => expect(playbooks).toContain(`#catalog:has(#catalog-g-${p.key}:checked) .cl-thumb[data-seg="catalog-g"]{translate:${(i + 1) * 100}% 0}`));
    // the first choice needs no rule: the pill starts under it
    expect(playbooks).not.toContain("#catalog-show-all:checked) .cl-thumb");
    expect(playbooks).toContain('style="--n:3"');
  });

  it("give the group a select where its pills would not fit: below 1024 px for the phases, on a phone for how fast", () => {
    expect(playbooks).toContain("@media (min-width:1024px){#catalog:has(#catalog-g-");
    expect(playbooks).toContain("@media (max-width:1023.98px){#catalog:has(#catalog-g-select option");
    expect(playbooks).toMatch(/<fieldset class="[^"]*max-lg:hidden"/);
    expect(situations).toContain("@media (min-width:768px){#situations:has(#situations-g-");
    expect(situations).toContain("@media (max-width:767.98px){#situations:has(#situations-g-select option");
    expect(situations).toMatch(/<fieldset class="[^"]*max-md:hidden"/);
  });
});

describe("the catalog list's rows and the filter box", () => {
  it("is drawn only with scripts on, and every row carries the words it matches", () => {
    for (const html of [playbooks, situations]) {
      expect(html).toContain("html:not(.js) .cl-js{display:none}");
      expect(html).toMatch(/<div class="cl-js[^"]*"><label for="[a-z]+-q" class="sr-only">Filter the [a-z ]+ by title<\/label>/);
    }
    expect(count(playbooks, 'data-row=""')).toBe(pbWritten.length + pbOutlined.length);
    for (const r of [...pbWritten, ...pbOutlined]) expect(playbooks).toContain(`data-title="${titleKey(r.title)}"`);
    expect(count(situations, 'data-row=""')).toBe(sitWritten.length + sitOutlined.length);
  });

  it("hides what misses only while a query is typed", () => {
    expect(playbooks).toContain("#catalog[data-q] [data-row][data-miss],#catalog[data-q] [data-none]{display:none !important}");
    // nothing on the page is marked missing before a query is typed
    expect(playbooks).not.toMatch(/<[^>]+\sdata-miss/);
    expect(playbooks).not.toMatch(/<[^>]+\sdata-q[\s=>]/);
  });

  it("lights a row softly under the pointer, and brings each group into focus once", () => {
    expect(count(playbooks, 'class="cl-row ')).toBe(pbWritten.length + pbOutlined.length);
    expect(playbooks).toContain("@media (hover:hover){.cl-row:hover::before{opacity:1}}");
    const groups = new Set([...pbWritten, ...pbOutlined].map((r) => (r.kind === "audit" ? "audits" : r.phase)));
    expect(count(playbooks, 'data-reveal=""')).toBe(groups.size);
  });
});
