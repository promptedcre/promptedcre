import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RulesPage from "@/app/rules/page";
import VendorPage from "@/app/rankings/[market]/[vendor]/page";
import { titleKey, titleMatches } from "@/components/catalog/title-words";
import { ruleRows, ruleSubjects, rulesByJurisdiction } from "@/components/library/data";
import { getMarketSummary } from "@/components/rankings";
import { VENDOR_CSS } from "@/components/rankings/vendor-parts";
import { getCorpus } from "@/lib/content/load";
import { COVERAGE_KEYS } from "@/lib/schemas/rankings";

// The vendor pages and /rules in the look of the BoardUI round (D230), rendered to markup.
// Pinned: what the motion and the new boxes must never change, that every figure shown is the
// computed one and that the page reads finished without scripts, and the hooks the filters and
// the reveals rest on. Words and looks are not pinned.

const count = (html: string, needle: string) => html.split(needle).length - 1;
const clean = (html: string) => html.replace(/<!-- -->/g, "");

async function vendorHtml(market: string, vendor: string) {
  const page = await VendorPage({ params: Promise.resolve({ market, vendor }) } as never);
  return clean(renderToStaticMarkup(page));
}

const rowOf = (market: string, vendor: string) => {
  const summary = getMarketSummary(market);
  const row = summary?.listed.find((r) => r.vendor.id === vendor);
  if (!summary || !row) throw new Error(`no ${market}/${vendor}`);
  return { summary, row };
};

describe("a judged vendor's page", async () => {
  const { row } = rowOf("formation-back-office", "mercury");
  const html = await vendorHtml("formation-back-office", "mercury");
  const score = row.result.score as number;

  it("links the vendor's own site as one pill that says it leaves the site", () => {
    expect(html).toContain(`<a href="${row.vendor.homepage}" rel="noreferrer" class="vd-site type-body-s">`);
    const pill = html.slice(html.indexOf('class="vd-site'), html.indexOf("</a>", html.indexOf('class="vd-site')));
    expect(pill).toContain(new URL(row.vendor.homepage).host);
    expect(pill).toContain("(another site)");
  });

  it("serves the computed score as the figure, which only counts up on screen, and the bar full", () => {
    expect(html).toContain(`<span aria-hidden="true" class="tabular-nums">${score}</span><span class="sr-only">${score}</span>`);
    expect(html).toContain(" of 100</span>");
    expect(html).toContain(`class="fill-on-reveal absolute left-0 top-1/2 h-2.5 -translate-y-1/2 bg-agent" style="width:${score}%"`);
  });

  it("brings the whole verdict into focus at once, then each group as it reaches the screen", () => {
    const wrap = html.indexOf('<div data-reveal="" class="mt-8 md:mt-10"><article');
    expect(wrap).toBeGreaterThan(0);
    const groups = new Set(row.result.cells.map((c) => c.story.group)).size;
    expect(count(html, '<section data-reveal="" class="sheet-part')).toBe(groups);
  });

  it("shows each verdict's evidence ids, in order, and every excerpt it quotes in a well", () => {
    const ids = row.result.cells.flatMap((c) => c.verdict.evidence);
    expect(count(html, 'class="vd-id type-data"')).toBe(ids.length);
    const shown = [...html.matchAll(/class="vd-id type-data">([^<]+)</g)].map((m) => m[1]);
    expect(shown).toEqual(ids);
    const items = new Set((row.pack?.items ?? []).map((i) => i.id));
    expect(count(html, 'class="vd-q type-body text-text"')).toBe(ids.filter((id) => items.has(id)).length);
  });

  it("draws the four coverage pages as four cards, each ring the state the pack records", () => {
    expect(count(html, 'class="vd-card min-w-0 p-4"')).toBe(COVERAGE_KEYS.length);
    const found = COVERAGE_KEYS.filter((k) => row.pack?.coverage[k]?.found).length;
    const none = COVERAGE_KEYS.filter((k) => row.pack?.coverage[k] && !row.pack.coverage[k]?.found).length;
    expect(count(html, '"vd-ring vd-ring--found"')).toBe(found);
    expect(count(html, '"vd-ring"')).toBe(none);
    expect(count(html, '"vd-ring vd-ring--gap"')).toBe(COVERAGE_KEYS.length - found - none);
  });

  it("puts every evidence item in one rounded fold", () => {
    expect(html).toMatch(/<details id="evidence-items" class="disclosure vd-card">/);
    expect(count(html, 'id="ev-')).toBe(row.pack?.items.length ?? -1);
  });
});

describe("a vendor not judged yet", async () => {
  it("draws no score, no bar and no figure, and says why, with the gaps as dashed rings", async () => {
    const { row } = rowOf("market-property-data", "crexi");
    expect(row.status).toBe("untested");
    const html = await vendorHtml("market-property-data", "crexi");
    for (const drawn of ["type-figure", 'class="fill-on-reveal', 'class="vd-id', 'class="vd-q']) expect(html, drawn).not.toContain(drawn);
    expect(html).toContain(">Untested</p>");
    expect(html).toContain(`Not scored: ${row.reason}.`);
    const recorded = COVERAGE_KEYS.filter((k) => row.pack?.coverage[k]).length;
    expect(count(html, '"vd-ring vd-ring--gap"')).toBe(COVERAGE_KEYS.length - recorded);
    if ((row.pack?.items.length ?? 0) === 0) expect(html).toContain("No evidence items stored yet.");
  });
});

describe("the vendor page's styles", () => {
  it("keep the new boxes flat on paper and draw 'not yet' dashed", () => {
    expect(VENDOR_CSS.startsWith("@layer components {")).toBe(true);
    expect(VENDOR_CSS).toContain("@media print{.vd-site,.vd-card{box-shadow:none}");
    expect(VENDOR_CSS).toContain(".vd-ring--gap{border-style:dashed}");
  });
});

describe("/rules", () => {
  const corpus = getCorpus();
  const rows = ruleRows(corpus, new Date());
  const subjects = ruleSubjects(rows);
  const byJ = rulesByJurisdiction(corpus.rules);
  const html = clean(renderToStaticMarkup(createElement(RulesPage)));

  it("filters by jurisdiction with the catalog's pill track, and a select on a phone, both without scripts", () => {
    expect(html).toContain('class="cl-seg"');
    for (const v of ["all", ...byJ.map((j) => j.id)]) expect(html).toContain(`id="jurisdiction-${v}"`);
    expect(count(html, 'name="jurisdiction"')).toBe(byJ.length + 1);
    expect(html).toMatch(/<fieldset class="[^"]*max-md:hidden"/);
    expect(html).toContain('id="jurisdiction-select"');
    expect(html).toContain(`>All (${corpus.rules.length})</option>`);
    for (const j of byJ) {
      expect(html).toContain(`>${j.label} (${j.count})</option>`);
      expect(html).toContain(`#rules-root:has(#jurisdiction-${j.id}:checked) :is([data-j]:not([data-j="${j.id}"])`);
      expect(html).toContain(`#rules-root:has(#jurisdiction-select option[value="${j.id}"]:checked) :is([data-j]:not([data-j="${j.id}"])`);
    }
    // each width reads only its own control
    expect(html.indexOf("@media (min-width:768px){\n#rules-root:has(#jurisdiction-")).toBeGreaterThan(0);
    expect(html.indexOf("@media (max-width:767.98px){\n#rules-root:has(#jurisdiction-select option")).toBeGreaterThan(0);
  });

  it("keeps the rules whose titles match what is typed: the box needs scripts, and every row carries its words", () => {
    expect(html).toContain("html:not(.js) .cl-js{display:none}");
    expect(html).toMatch(/<div class="cl-js[^"]*"><label for="rules-root-q" class="sr-only">Filter the rules by title<\/label>/);
    expect(html).toContain("#rules-root[data-q] [data-row][data-miss],#rules-root[data-q] [data-none]{display:none !important}");
    expect(count(html, 'data-row=""')).toBe(corpus.rules.length);
    for (const r of corpus.rules) expect(html).toContain(`data-title="${titleKey(r.title)}"`);
    expect(titleMatches("Texas registered agent and registered office", "registered agent")).toBe(true);
    // nothing is marked before a query is typed
    expect(html).not.toMatch(/<[^>]+\sdata-miss/);
  });

  it("lights a closed row softly, keeps the target's fill, and brings each subject into focus once", () => {
    expect(count(html, 'class="lb-rr ')).toBe(corpus.rules.length);
    expect(html).toContain("@media (hover:hover){.lb-rr:not(:has(details[open])):hover::before{opacity:1}}");
    expect(html).toContain(".lb-rr:has(:target)::before{opacity:1;background:var(--bg-panel)}");
    expect(count(html, 'data-reveal=""')).toBe(subjects.length);
    for (const s of subjects) expect(html).toContain(`data-g="${s.key}" data-reveal=""`);
  });
});
