import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { askSentences } from "@/components/playbook/key-facts";
import { PlanDrawing } from "@/components/playbook/plan-drawing";
import { PlaybookHead } from "@/components/playbook/playbook-head";
import { publishedMarkets, stepSoftwareFor, TOP_SHOWN } from "@/components/playbook/software";
import { getStepSoftwareFile, stepKey } from "@/components/rankings/step-software";
import type { MarketTop } from "@/components/playbook/software-line";
import { PageStyles } from "@/components/playbook/page-styles";
import { SourceList } from "@/components/playbook/source-list";
import { INDEX_ID, StepIndex } from "@/components/playbook/step-index";
import { StepTracker } from "@/components/playbook/step-tracker";
import { MARK_OF } from "@/lib/compute/site-facts";
import { getRankingsSummary } from "@/components/rankings/summary";
import { RuleCard } from "@/components/rule-card";
import { StepList, type Lookups } from "@/components/step-list";
import { getCorpus } from "@/lib/content/load";
import { logoSrc } from "@/lib/logos";
import type { Source } from "@/lib/schemas/common";
import type { Playbook, Step } from "@/lib/schemas/playbook";
import { runPrompt, site } from "@/lib/site";

// The record page's own pieces, rendered to markup. What is pinned here is structure a
// reader depends on and a restyle could quietly undo: a step's title is a heading a screen
// reader can jump to, every step is a card whose details sit behind one fold, the ranked
// software on a card is the rankings' own, the head has one filled button and says "Not live
// yet" once, the order-of-work board marks the chain it names, and every source is a link.
// Words and looks are not pinned.

function step(id: string, over: Partial<Step> = {}): Step {
  return {
    id,
    title: `Step ${id}`,
    instruction: "An instruction long enough for the schema.",
    mode: "agent",
    modeBasis: "Synthetic test step.",
    risk: "low",
    undo: "reversible",
    approval: "none",
    effort: null,
    elapsed: null,
    after: [],
    rules: [],
    calculators: [],
    consumes: [],
    produces: [],
    basis: "practitioner",
    sources: [],
    ...over,
  };
}

function book(steps: Step[], over: Partial<Playbook> = {}): Playbook {
  return {
    id: "synthetic",
    slug: "synthetic",
    kind: "process",
    title: "Synthetic",
    summary: "A synthetic playbook for tests.",
    phase: "raise",
    order: 1,
    featured: false,
    depth: "full",
    review: "ai-drafted",
    lastVerified: "2026-11-11",
    requires: [],
    consumes: [],
    produces: [],
    written: { structure: ["syndication", "fund", "jv"], jurisdiction: ["us-federal", "us-tx"] },
    sources: [],
    steps,
    outlineSteps: [],
    ...over,
  };
}

const person = (id: string, over: Partial<Step> = {}) => step(id, { mode: "human-online", actor: "principal", ...over });

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** Everything inside the page's <summary> elements, joined: what a screen reader treats as buttons. */
const summaries = (html: string) => [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => m[1] ?? "").join("\n");

const corpus = getCorpus();
const written = corpus.playbooks.filter((p) => p.depth === "full");
const today = new Date("2026-11-14T12:00:00Z");

function lookups(pb: Playbook): Lookups {
  return {
    sources: new Map(pb.sources.map((s) => [s.id, s])),
    rules: new Map(corpus.rules.map((r) => [r.id, r])),
    calculators: new Map(corpus.calculators.map((c) => [c.id, c])),
    markets: new Map(corpus.markets.map((m) => [m.id, m])),
    publishedMarkets: new Set(),
    artifacts: new Map(corpus.artifacts.map((a) => [a.id, a])),
    today,
  };
}

describe("the step cards", () => {
  it("has written records to draw", () => {
    expect(written.length).toBeGreaterThan(0);
  });

  it.each(written.map((pb) => [pb.slug, pb] as const))("%s: every step is a card with a heading, and its details behind one fold", (_, pb) => {
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: lookups(pb), id: "step-list" }));
    // one card and one real heading per step, the heading the card's first child
    expect(count(html, '<li id="step-')).toBe(pb.steps.length);
    expect(count(html, '<h3 class="st-h"') + count(html, '<h4 class="st-h"')).toBe(pb.steps.length);
    for (const s of pb.steps) expect(html).toMatch(new RegExp(`<li id="step-${s.id}"[^>]*><h[34] class="st-h">`));
    // one fold per card, never the card's own child, so a link to the card opens nothing
    expect(count(html, '<details class="disclosure disclosure--sm st-fold"')).toBe(pb.steps.length);
    expect(count(html, '<div class="st-more"><details class="disclosure disclosure--sm st-fold"')).toBe(pb.steps.length);
    expect(html).not.toMatch(/<li id="step-[^"]*"[^>]*><details/);
    // a summary is a button to a screen reader: no heading may sit inside one
    const inSummaries = summaries(html);
    expect(inSummaries).not.toMatch(/<h[1-6][\s>]/);
    expect(inSummaries).not.toContain('role="heading"');
  });

  it("numbers a step in its heading and names its fold after it", () => {
    const pb = book([step("a"), person("b", { after: ["a"] })]);
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: lookups(pb) }));
    expect(html).toContain('<span aria-hidden="true">02</span><span class="sr-only">Step 2:</span>');
    expect(html).toContain('<span class="st-t type-title-s">Step b</span></h3>');
    expect(summaries(html)).toContain('<span class="sr-only">Details of step 2, common practice</span>');
  });

  it("calls an audit's rows checks", () => {
    const pb = book([step("a")], { kind: "audit" });
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: lookups(pb) }));
    expect(html).toContain('<span class="sr-only">Check 1:</span>');
    expect(summaries(html)).toContain("Details of check 1");
  });

  it("shows who does it and what it asks outside the fold, and the first sentence in its summary", () => {
    const signer = person("b", {
      instruction: "Sign the made-up certificate. Then file it with the made-up office.",
      approval: "signature",
      undo: "hard-to-undo",
      risk: "high",
    });
    const pb = book([step("a"), signer]);
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: lookups(pb) }));
    const card = html.slice(html.indexOf('<li id="step-b"'));
    const outside = card.slice(0, card.indexOf("<details"));
    // the four words, then the role after them; each gate and high risk, before the fold
    expect(outside).toContain("Person online");
    expect(outside).toContain("· principal");
    for (const word of ["Signature", "Hard to undo", "High risk"]) expect(outside).toContain(word);
    // closed: the first sentence and where it comes from; open: the whole instruction
    const summary = summaries(card).split("\n")[0] ?? "";
    expect(summary).toContain("Sign the made-up certificate.");
    expect(summary).not.toContain("Then file it");
    expect(summary).toContain("Common practice");
    expect(card).toContain("Sign the made-up certificate. Then file it with the made-up office.");
    // a person's step prints with a line to sign; an agent's does not
    expect(card).toContain('class="st-sign');
    expect(html.slice(0, html.indexOf('<li id="step-b"'))).not.toContain('class="st-sign');
  });

  it("lists a step's sources with the date each was opened", () => {
    const s: Source = { id: "s-1", url: "https://example.com/made-up", title: "A made-up source", publisher: "Example Publisher.", accessed: "2026-11-12", tier: "primary" };
    const pb = book([step("a", { basis: "cited", sources: ["s-1"] })], { sources: [s] });
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: lookups(pb) }));
    expect(summaries(html)).toContain("1 source");
    expect(html).toContain('<a href="https://example.com/made-up"');
    expect(html).toContain('Example Publisher. Opened <time dateTime="2026-11-12">2026-11-12</time>.');
  });
});

describe("the software on a card", () => {
  const summary = getRankingsSummary();
  const map = getStepSoftwareFile().steps;

  it("is the scored products the step map names for that step, best score first, at most three", () => {
    let cards = 0;
    for (const pb of written) {
      for (const [stepId, top] of stepSoftwareFor(pb)) {
        const s = pb.steps.find((x) => x.id === stepId);
        const m = summary.markets.find((x) => x.view.market.id === s?.market);
        expect(m?.view.published, `${pb.id}/${stepId}`).toBe(true);
        const listed = map[stepKey(pb.id, stepId)] ?? [];
        // Scored products first, best first, then the ones listed but not judged yet (D225).
        const scored = (m?.ranked ?? []).filter((r) => listed.includes(r.vendor.id) && r.result.score !== null);
        const unjudged = (m?.listed ?? []).filter((r) => listed.includes(r.vendor.id) && r.result.score === null);
        const expected = [...scored, ...unjudged]
          .slice(0, TOP_SHOWN)
          .map((r) => ({ id: r.vendor.id, name: r.vendor.name, government: r.vendor.kind === "government", score: r.result.score }));
        expect(top.vendors, `${pb.id}/${stepId}`).toEqual(expected);
        expect(top.name).toBe(m?.view.market.name);
        cards++;
      }
    }
    expect(cards).toBeGreaterThan(0);
  });

  it("draws each vendor's icon beside its name and score, and links to the market's ranking", () => {
    // Made-up vendors with made-up scores: no icon is on file for either.
    const market: MarketTop = {
      id: "example-market",
      name: "Example market",
      vendors: [
        { id: "example-agency", name: "Example Agency", government: true, score: 3 },
        { id: "example-product", name: "Example Product", government: false, score: 2 },
      ],
    };
    const pb = book([step("a", { market: market.id })]);
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: { ...lookups(pb), software: new Map([["a", market]]) } }));
    expect(html).toContain('<a href="/rankings/example-market"');
    expect(html).toContain("Software for this step, scored in");
    expect(html).toContain('aria-label="2 products for this step, by agent-ready score out of 100"');
    // the icon is decoration beside the name, never alone
    expect(count(html, '<span aria-hidden="true" class="logo')).toBe(2);
    expect(html).toMatch(/class="logo[^"]*"[\s\S]*?Example Agency<\/span><span class="type-data text-muted">3<span class="sr-only"> of 100<\/span>/);
    // a government source is our one neutral glyph; a vendor with no icon on file is a letter tile
    expect(html).toContain('<path d="M2.5 6L8 2.75 13.5 6z"');
    expect(html).toContain(">EP</span>");
    // the market is named on the card, so the facts do not name it again
    expect(html).not.toContain(">Software</dt>");
  });

  it("draws a product's own icon when one is on file", () => {
    const pb = written.find((p) => [...stepSoftwareFor(p).values()].some((m) => m.vendors.some((v) => logoSrc(v.id))));
    if (!pb) throw new Error("no step shows a product with an icon on file");
    const software = stepSoftwareFor(pb);
    const vendor = [...software.values()].flatMap((m) => m.vendors).find((v) => logoSrc(v.id));
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: { ...lookups(pb), software } }));
    expect(html).toContain(`<img src="${logoSrc(vendor!.id)}" alt=""`);
    expect(html).toContain(`>${vendor!.name}</span>`);
  });

  it("shows no software for a step with none, and names its market in the facts", () => {
    const id = corpus.markets[0]?.id;
    if (!id) throw new Error("the corpus has no market");
    const pb = book([step("a", { market: id })]);
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: { ...lookups(pb), software: new Map() } }));
    expect(html).not.toContain('class="st-sw');
    expect(html).not.toContain('class="logo');
    expect(html).toContain("ranking not published yet");
  });

  it.each(written.map((pb) => [pb.slug, pb] as const))("%s: shows software on exactly the steps the map gives a scored product", (_, pb) => {
    const software = stepSoftwareFor(pb);
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: { ...lookups(pb), publishedMarkets: publishedMarkets(), software } }));
    const expected = pb.steps.filter((s) => (software.get(s.id)?.vendors.length ?? 0) > 0).length;
    expect(count(html, '<div class="st-sw print:hidden">')).toBe(expected);
  });
});

describe("the list of steps above the cards", () => {
  it("links every step to its card, in step order, with the out-of-view steps after", () => {
    const pb = book([step("a"), person("b", { after: ["a"] }), step("d", { when: { jurisdiction: ["us-de"] } })], {
      written: { structure: ["syndication", "fund", "jv"], jurisdiction: ["us-federal", "us-tx", "us-de"] },
    });
    const html = renderToStaticMarkup(createElement(StepIndex, { pb, sections: [{ href: "#sources", label: "Sources" }] }));
    const links = [...html.matchAll(/<a href="(#step-[^"]+)" class="si-a">/g)].map((m) => m[1]);
    expect(links).toEqual(["#step-a", "#step-b", "#step-d"]);
    expect(html).toContain('<span class="si-n type-data">02</span>');
    expect(html).toContain("Only for Delaware");
    expect(html).toContain('<span class="si-n type-data">DE</span>');
    expect(html).toContain('<a href="#sources"');
    // one fold on a phone, simply open from 768 px; never printed
    expect(html).toContain("disclosure--open-md");
    expect(html).toContain("print:hidden");
    expect(html).toContain("2 steps");
    // the id the tracker finds its links by; nothing is marked until scripts run
    expect(html).toContain(`<nav id="${INDEX_ID}"`);
    expect(html).not.toContain("aria-current");
  });
});

describe("following the reader through the steps", () => {
  it("gives every card the mark letter of who does it, for the bar to draw", () => {
    const pb = book([step("a"), step("b", { mode: "agent-browser" }), person("c"), person("d", { mode: "human-offline" })]);
    const html = renderToStaticMarkup(createElement(StepList, { pb, lk: lookups(pb) }));
    const marks = [...html.matchAll(/<li id="step-([a-z]+)" data-mark="([ABHO])"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(marks).toEqual(pb.steps.map((s) => `${s.id}:${MARK_OF[s.mode]}`));
  });

  it("draws its bar hidden and empty until scripts run, with a link back to the list", () => {
    const html = renderToStaticMarkup(createElement(StepTracker, { listId: "step-list", indexId: INDEX_ID, topId: "steps", noun: "Step" }));
    expect(html).toContain('<div class="si-pin print:hidden">');
    expect(html).toContain('<nav aria-label="Where you are in the steps" class="si-bar">');
    expect(html).not.toContain("data-on");
    expect(html).toContain('<a href="#steps"');
    expect(html).toContain("All steps");
  });

  // The rules the page draws with: the mark, the bar, and the smooth fold.
  const css = renderToStaticMarkup(createElement(PageStyles));

  it("draws the step being read as the list's selected row, and never marks anything without scripts", () => {
    expect(css).toContain(".si-a[aria-current]{background:var(--bg-panel)");
    expect(css).toContain("html:not(.js) .si-pin{display:none}");
    expect(css).toContain(".si-bar[data-on]{opacity:1;visibility:visible}");
  });

  it("folds the first sentence away as the details open, in the same time as the body grows", () => {
    expect(css).toContain("@supports (interpolate-size:allow-keywords){.st-fold{interpolate-size:allow-keywords}}");
    expect(css).toContain(".st-fold[open]>summary .st-p{block-size:0;margin-bottom:0;opacity:0;visibility:hidden;transition-duration:var(--dur-3)}");
    // closing runs at three quarters of the time, as the foundation's fold closes
    expect(css).toMatch(/\.st-p\{[^}]*transition:block-size calc\(var\(--dur-3\) \* \.75\)/);
    // the sentence keeps its row with no height, so nothing above the summary moves
    expect(css).not.toContain(".st-fold[open]>summary .st-p{display:none}");
  });
});

describe("the head of a record", () => {
  const pb = book([step("a"), person("b", { after: ["a"] }), step("c", { after: ["b"] })], { title: "Made-up record" });
  const html = renderToStaticMarkup(createElement(PlaybookHead, { pb, review: null, today, file: "/playbooks/synthetic/playbook.md" }));

  it("has one filled button, the run prompt that names the record", () => {
    expect(count(html, "btn--primary")).toBe(1);
    expect(html).toContain("Run with your agent");
    // with scripts off the sentence the button copies is printed in its place
    expect(html).toContain(runPrompt(pb.title).replace(/"/g, "&quot;"));
    expect(html).toContain("Copy the whole playbook");
    expect(html).toContain('download="synthetic.md"');
    expect(html).toContain("Print or save as PDF");
  });

  it("says the connector is not live once, and only while it is not", () => {
    expect(count(html, "Goes live at launch")).toBe(site.connectorLive ? 0 : 1);
  });

  it("gives the record's own share and one small line of review, sources and coverage", () => {
    expect(html).toContain("2 of 3");
    expect(html).toContain("steps an agent can do");
    expect(html).toContain('aria-label="3 steps: 2 for an agent, 1 for a person"');
    expect(html).toContain("AI-drafted");
    expect(html).toContain('<time dateTime="2026-11-11"');
    expect(html).toContain("Federal + Texas");
    // the facts that moved under the steps are not in the head
    expect(html).not.toContain("Where the agent stops first");
  });
});

describe("the order-of-work board", () => {
  it.each(written.map((pb) => [pb.slug, pb] as const))("%s: frames one step in every stage", (_, pb) => {
    const html = renderToStaticMarkup(createElement(PlanDrawing, { pb }));
    const stages = count(html, 'class="bd-st"');
    expect(stages).toBeGreaterThan(0);
    expect(count(html, 'data-chain=""')).toBe(stages);
    // a stage whose chain step is a person's is where the line stops, and it is marked as that side
    expect(count(html, 'data-seq-step="person"')).toBe(count(html, 'data-side="person"'));
    expect(count(html, 'data-seq-step="person" data-seq-hold="0"')).toBe(count(html, 'data-side="person"'));
    // every turn of the line is one run across the property line and one down to the next node
    const turns = count(html, 'data-turn="');
    expect(count(html, "bd-run--across")).toBe(turns);
    expect(count(html, "bd-run--drop")).toBe(turns);
  });

  it("follows the chain across the property line and names its steps", () => {
    // a (agent) -> b (person) and c (agent) -> d (agent): two chains of three, the first through b
    const pb = book([step("a"), person("b", { after: ["a"] }), step("c", { after: ["a"] }), step("d", { after: ["b", "c"] })]);
    const html = renderToStaticMarkup(createElement(PlanDrawing, { pb }));
    expect(count(html, 'class="bd-st"')).toBe(3);
    expect(html).toContain("3 steps: 01, 02, 04");
    expect(html).toContain("The first of 2 this long");
    expect(html).toMatch(/aria-label="Step 02, principal: Step b\. Waits on 01\. On the longest chain\."[^>]*data-chain=""/);
    expect(html).toMatch(/aria-label="Step 03, agent: Step c\. Waits on 01\."(?![^>]*data-chain)/);
    // agent, then a person, then the agent again: the line turns twice
    expect(count(html, 'data-side="agent" data-turn="person"')).toBe(1);
    expect(count(html, 'data-side="person" data-turn="agent"')).toBe(1);
    expect(count(html, "bd-run--down")).toBe(2);
  });

  it("says nothing about other chains when there is one", () => {
    const pb = book([step("a"), step("b", { after: ["a"] }), step("c", { after: ["b"] })]);
    const html = renderToStaticMarkup(createElement(PlanDrawing, { pb }));
    expect(html).toContain("3 steps: 01, 02, 03");
    expect(html).not.toContain("this long");
    expect(html).not.toContain("data-turn=");
  });

  it("draws nothing for an outline", () => {
    expect(renderToStaticMarkup(createElement(PlanDrawing, { pb: book([], { depth: "outline" }) }))).toBe("");
  });
});

describe("the source list", () => {
  const source = (i: number, over: Partial<Source> = {}): Source => ({
    id: `s-${i}`,
    url: `https://example.com/source-${i}`,
    title: `Source number ${i}`,
    publisher: "Example Publisher",
    accessed: "2026-11-12",
    tier: "primary",
    ...over,
  });
  const many = (n: number) => Array.from({ length: n }, (_, i) => source(i + 1));

  it("makes every title the link to its source", () => {
    const sources = [source(1), source(2, { quote: "Three words quoted." })];
    const html = renderToStaticMarkup(createElement(SourceList, { sources, today }));
    for (const s of sources) expect(html).toMatch(new RegExp(`<li id="source-${s.id}"[^>]*><a href="${s.url}"`));
    // the quoted source opens to its quote; the other has no fold
    expect(count(html, "<details")).toBe(1);
    expect(html).toContain("<q");
    expect(html).toContain("Three words quoted.");
  });

  it("folds a long list after the first six, and says how many are behind the fold", () => {
    const short = renderToStaticMarkup(createElement(SourceList, { sources: many(8), today }));
    expect(short).not.toContain("more source");
    const long = renderToStaticMarkup(createElement(SourceList, { sources: many(9), today }));
    expect(long).toContain("3 more sources");
    expect(count(long, '<li id="source-')).toBe(9);
    expect(long.indexOf('id="source-s-6"')).toBeLessThan(long.indexOf("3 more sources"));
    expect(long.indexOf('id="source-s-7"')).toBeGreaterThan(long.indexOf("3 more sources"));
  });
});

describe("a rule card", () => {
  const rule = corpus.rules[0];

  it("keeps its title a heading, folded or not", () => {
    if (!rule) throw new Error("the corpus has no rule card");
    const open = renderToStaticMarkup(createElement(RuleCard, { rule, today }));
    const folded = renderToStaticMarkup(createElement(RuleCard, { rule, today, fold: true }));
    for (const html of [open, folded]) expect(count(html, '<h3 class="rc-t type-title-s">')).toBe(1);
    expect(summaries(folded)).not.toMatch(/<h[1-6][\s>]/);
    expect(summaries(folded)).toContain(rule.id);
  });
});

describe("what the steps ask, in sentences", () => {
  it("counts in words and agrees in number", () => {
    expect(askSentences({ signatures: 3, irreversible: 0, hardToUndo: 4, handoffs: 8 }, "step")).toEqual([
      "Three steps need a signature.",
      "Four steps are hard to undo; none is irreversible.",
      "The work passes between your agent and a person eight times.",
    ]);
    expect(askSentences({ signatures: 0, irreversible: 1, hardToUndo: 1, handoffs: 1 }, "check")).toEqual([
      "No check needs a signature.",
      "One check is irreversible and one is hard to undo.",
      "The work passes between your agent and a person once.",
    ]);
    expect(askSentences({ signatures: 1, irreversible: 0, hardToUndo: 0, handoffs: 0 }, "step")).toEqual(["One step needs a signature.", "No step is hard to undo."]);
  });
});
