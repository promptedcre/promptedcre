import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { catalogFrom } from "@/components/catalog/data";
import { Ledger } from "@/components/catalog/ledger";
import { AgentCount, stepStructuresOf } from "@/components/catalog/row-parts";
import { BeforeAfterChain } from "@/components/playbook/chain";
import { KeyFacts } from "@/components/playbook/key-facts";
import { OutlineRecord } from "@/components/playbook/outline-record";
import { PlanDrawing } from "@/components/playbook/plan-drawing";
import { PlaybookHead, RecordSwitches } from "@/components/playbook/playbook-head";
import { StepIndex } from "@/components/playbook/step-index";
import { onlyLabel } from "@/components/playbook/words";
import { StepList, type Lookups } from "@/components/step-list";
import { siteFacts } from "@/lib/compute/site-facts";
import { DEFAULT_VARIANT, openingStructure, writtenStructures } from "@/lib/compute/variant";
import { getCorpus, type Corpus } from "@/lib/content/load";
import { STRUCTURES, type Structure } from "@/lib/schemas/common";
import type { Playbook, Step } from "@/lib/schemas/playbook";
import { book, corpusWith, step } from "./helpers/engine";

// A record may be written for fewer than three structures. Its pages then show the structures
// it is written for and no other: the record's page opens on the first of them, offers a
// switch only between them, and never says "not written" where its steps are; every list
// that would print a figure for a view it has no steps in says which structures it is for
// instead of a blank or a zero. Only one record in the catalog is like this, so the cases
// here are built on made-up records and hold whatever the catalog contains.

const corpus = getCorpus();
const written = corpus.playbooks.filter((p) => p.depth === "full");
const today = new Date("2026-11-15T12:00:00Z");

const person = (id: string, over: Partial<Step> = {}) => step(id, { mode: "human-online", actor: "principal", ...over });
const writtenFor = (structure: Structure[]): Playbook["written"] => ({ structure, jurisdiction: ["us-federal", "us-tx"] });

// Three steps, an agent's, a person's and an agent's, written for a joint venture alone.
const jvOnly = book("made-up-jv", [step("a"), person("b", { after: ["a"] }), step("c", { after: ["b"] })], { written: writtenFor(["jv"]) });
// Written for a fund and a joint venture; one step is the fund's alone, so the two differ.
const fundAndJv = book("made-up-fund-jv", [step("a"), step("b", { after: ["a"], when: { structure: ["fund"] } }), person("c", { after: ["a"] })], {
  written: writtenFor(["jv", "fund"]),
});
// Written for all three, with a step for the fund alone: the ordinary record with a switch.
const allThree = book("made-up-all", [step("a"), step("b", { after: ["a"], when: { structure: ["fund"] } })]);

const count = (html: string, needle: string) => html.split(needle).length - 1;
const render = <P extends object>(component: (props: P) => unknown, props: P) => renderToStaticMarkup(createElement(component as never, props as never));

/** The structure tabs a record's switch offers, in order, and which is chosen with scripts off. */
function offered(pb: Playbook): Array<{ value: string; checked: boolean }> {
  const html = render(RecordSwitches, { pb });
  return [...html.matchAll(/<input[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes('data-vsw="pb-root-structure"'))
    .map((tag) => ({ value: /\svalue="([^"]+)"/.exec(tag)?.[1] ?? "", checked: /\schecked(=|\s|\/|>)/.test(tag) }));
}

const head = (pb: Playbook) => render(PlaybookHead, { pb, review: null, today, file: null });

function lookups(pb: Playbook, from: Corpus = corpus): Lookups {
  return {
    sources: new Map(pb.sources.map((s) => [s.id, s])),
    rules: new Map(from.rules.map((r) => [r.id, r])),
    calculators: new Map(from.calculators.map((c) => [c.id, c])),
    markets: new Map(from.markets.map((m) => [m.id, m])),
    publishedMarkets: new Set(),
    artifacts: new Map(from.artifacts.map((a) => [a.id, a])),
    today,
  };
}

describe("the words for a record that is not written for every structure", () => {
  it("names the structures it is written for, in the catalog's order", () => {
    expect(onlyLabel(["jv"])).toBe("JV only");
    expect(onlyLabel(["jv", "fund"])).toBe("Fund · JV only");
    expect(onlyLabel(["syndication"])).toBe("Syndication only");
  });

  it("says nothing of a record written for all of them, or of an outline", () => {
    expect(onlyLabel([...STRUCTURES])).toBeNull();
    expect(onlyLabel([])).toBeNull();
  });
});

describe("the view a record's page opens on", () => {
  it("has written records to check", () => {
    expect(written.length).toBeGreaterThan(0);
  });

  it.each(written.map((pb) => [pb.slug, pb] as const))("%s: is a structure it is written for, the one its switch has chosen", (_, pb) => {
    const opening = openingStructure(pb);
    expect(pb.written.structure).toContain(opening);
    // the page root carries openingStructure; a switch chooses its first tab with scripts off
    // and falls back to it with scripts on (VariantSwitch, VariantSync), so the three agree
    // exactly when the first structure offered is the opening one
    expect(writtenStructures(pb)[0]).toBe(opening);
    const tabs = offered(pb);
    if (tabs.length > 0) {
      expect(tabs.map((t) => t.value)).toEqual(writtenStructures(pb));
      expect(tabs.filter((t) => t.checked).map((t) => t.value)).toEqual([opening]);
      expect(tabs[0]?.value).toBe(opening);
    }
    // and the head's lead fact there is a count, never "not written"
    const html = head(pb);
    expect(html).not.toContain("Not written for this structure");
    expect(html).toMatch(/\d+ of \d+/);
  });

  it("is read from the record by the page, not fixed", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app", "playbooks", "[slug]", "page.tsx"), "utf8");
    expect(page).toContain('<div id="pb-root" data-structure={openingStructure(pb)}');
    expect(page).not.toMatch(/id="pb-root" data-structure="/);
    // and the chain of records before and after is told which of them are for some structures only
    expect(page).toContain("only: onlyLabel(writtenStructures(p))");
  });

  it("is the default structure for a record written for it, and the first written one otherwise", () => {
    expect(openingStructure(allThree)).toBe(DEFAULT_VARIANT.structure);
    expect(openingStructure(jvOnly)).toBe("jv");
    expect(openingStructure(fundAndJv)).toBe("fund");
    expect(writtenStructures(fundAndJv)).toEqual(["fund", "jv"]);
    // an outline has no view of its own: the page root falls back to the default
    expect(openingStructure(book("made-up-outline", [], { depth: "outline", written: { structure: [], jurisdiction: [] } }))).toBe(DEFAULT_VARIANT.structure);
  });
});

describe("the page of a record written for one structure", () => {
  it("has no structure switch", () => {
    expect(offered(jvOnly)).toEqual([]);
    expect(render(RecordSwitches, { pb: jvOnly })).toBe("");
  });

  it("says which structure it is for, once, and counts its steps there", () => {
    const html = head(jvOnly);
    expect(count(html, "JV only")).toBe(1);
    expect(html).toContain("2 of 3");
    // one view: nothing is drawn per structure, and nothing says "not written"
    expect(html).not.toContain("data-s=");
    expect(html).not.toContain("Not written for this structure");
  });

  it("draws its list of steps, its cards, its facts and its board for that structure alone", () => {
    const index = render(StepIndex, { pb: jvOnly });
    expect(index).toContain("3 steps");
    expect(index).not.toContain("for this structure");
    expect(count(index, 'data-s="jv"')).toBe(3);

    const list = render(StepList, { pb: jvOnly, lk: lookups(jvOnly), id: "step-list" });
    expect(count(list, ' data-s="jv" class="st"')).toBe(3);
    // the one line for the structures it is not written for is marked for them, so the page
    // (whose root is the jv view) never shows it, and it promises nothing ("yet")
    expect(list).toContain('<p data-s="syndication fund"');
    expect(list).toContain("This record is not written for the syndication or fund structure.");
    expect(list).not.toContain("yet");

    const takes = render(KeyFacts, { pb: jvOnly });
    expect(takes).not.toContain("data-s=");
    expect(takes).toContain("No step needs a signature.");

    const board = render(PlanDrawing, { pb: jvOnly });
    expect(count(board, 'class="bd-st"')).toBe(3);
    expect(board).toContain("JV view");
    // every data-s on the board names the jv view and no other
    expect([...board.matchAll(/data-s="([^"]*)"/g)].map((m) => m[1])).toEqual(["jv"]);
  });
});

describe("the page of a record written for all three whose every step is for one", () => {
  it("opens on that structure, offers no tab that leads to nothing, and says which it is for", () => {
    const stepsInJv = book("made-up-steps-in-jv", [step("a", { when: { structure: ["jv"] } }), person("b", { after: ["a"], when: { structure: ["jv"] } })]);
    expect(openingStructure(stepsInJv)).toBe("jv");
    expect(writtenStructures(stepsInJv)).toEqual(["jv"]);
    expect(offered(stepsInJv)).toEqual([]);
    const html = head(stepsInJv);
    expect(html).toContain("1 of 2");
    expect(html).toContain("JV only");
    expect(html).not.toContain("Same steps for");
    expect(html).not.toContain("Not written for this structure");
  });
});

describe("the page of a record written for two structures", () => {
  it("offers those two, the first chosen, and no tab that leads to nothing", () => {
    expect(offered(fundAndJv)).toEqual([
      { value: "fund", checked: true },
      { value: "jv", checked: false },
    ]);
  });

  it("says which structures it is for and draws nothing for the third", () => {
    const html = head(fundAndJv);
    expect(html).toContain("Fund · JV only");
    expect(html).not.toContain("Not written for this structure");
    expect(html).not.toMatch(/data-s="[^"]*syndication/);
    const index = render(StepIndex, { pb: fundAndJv });
    expect(index).not.toContain("for this structure");
    expect(index).not.toMatch(/data-s="[^"]*syndication/);
  });

  it("says which two it is for even when their steps are the same, and then needs no switch", () => {
    const sameTwo = book("made-up-same-two", [step("a"), person("b", { after: ["a"] })], { written: writtenFor(["fund", "jv"]) });
    expect(offered(sameTwo)).toEqual([]);
    expect(openingStructure(sameTwo)).toBe("fund");
    const html = head(sameTwo);
    expect(html).toContain("Fund · JV only");
    expect(html).not.toContain("Same steps for");
  });

  it("still offers all three for a record written for all three", () => {
    expect(offered(allThree).map((t) => t.value)).toEqual([...STRUCTURES]);
    expect(offered(allThree).filter((t) => t.checked).map((t) => t.value)).toEqual([DEFAULT_VARIANT.structure]);
    expect(head(allThree)).not.toContain(" only");
  });
});

describe("a list that names a record written for some structures only", () => {
  const made = corpusWith(
    book("made-up-outline", [], { depth: "outline", outlineSteps: ["First", "Second"], written: { structure: [], jurisdiction: [] } }),
    jvOnly,
  );
  const facts = siteFacts(made);
  const catalog = catalogFrom(made, facts);

  it("marks it in the chain of what comes next", () => {
    const html = render(BeforeAfterChain, {
      title: "This record",
      requires: [],
      consumes: [],
      produces: [],
      next: [
        { slug: jvOnly.slug, title: jvOnly.title, depth: "full" as const, only: onlyLabel(writtenStructures(jvOnly)) },
        { slug: allThree.slug, title: allThree.title, depth: "full" as const, only: onlyLabel(writtenStructures(allThree)) },
      ],
    });
    expect(count(html, "JV only")).toBe(1);
    expect(html.indexOf("JV only")).toBeGreaterThan(html.indexOf(jvOnly.title));
    expect(html.indexOf("JV only")).toBeLessThan(html.indexOf(allThree.title));
    // a fact, not "not yet": the badge is solid
    expect(html).not.toContain("badge--dashed");
  });

  it("says which structure it is for where a list row has no count to give", () => {
    const row = catalog.written.find((r) => r.slug === jvOnly.slug);
    if (!row) throw new Error("the made-up record is not in the catalog");
    expect(stepStructuresOf(row)).toEqual(["jv"]);
    expect(render(AgentCount, { r: row, s: "jv" })).toMatch(/<b[^>]*>2<\/b> of 3 steps an\s+agent can do/);
    for (const s of ["syndication", "fund"] as const) {
      const cell = render(AgentCount, { r: row, s });
      expect(cell).toContain("JV only");
      expect(cell).not.toContain("agent can do");
    }
  });

  it.each(catalog.written.map((r) => [r.slug, r] as const))("%s: its list row is a count or says which structures it is for, in every view", (_, r) => {
    for (const s of STRUCTURES) {
      const cell = render(AgentCount, { r, s });
      if (r.byStructure[s].total > 0) expect(cell).toContain("agent can do");
      else expect(cell).toContain(" only");
    }
  });

  it("counts a written neighbour of an outline in the view its page opens on, and says so", () => {
    const outline = made.playbooks.find((p) => p.slug === "made-up-outline");
    if (!outline) throw new Error("the made-up outline is not in the catalog");
    const html = render(OutlineRecord, { pb: outline, all: made.playbooks, facts });
    expect(html).toContain(jvOnly.title);
    expect(html).toContain("Written after it");
    expect(html).toContain("JV only");
    expect(html).toContain("2 of 3 steps an agent can do");
  });

  // Every outline page in the catalog: a written neighbour is never drawn without its steps.
  const outlines = corpus.playbooks.filter((p) => p.depth === "outline");
  it.each(outlines.map((pb) => [pb.slug, pb] as const))("%s: each written neighbour shows its steps", (_, pb) => {
    const html = render(OutlineRecord, { pb, all: corpus.playbooks, facts: siteFacts(corpus) });
    // Each side is labelled ("Written before it", "Written after it") whether or not a record is
    // there; a side with none says "Nothing written comes ... here." instead of a title.
    const sides = count(html, ">Written before it<") + count(html, ">Written after it<");
    const empty = count(html, "Nothing written comes before it here.") + count(html, "Nothing written comes after it here.");
    expect(count(html, " an agent can do</span>")).toBe(sides - empty);
  });

  it("says in the ledger which records each view reads", () => {
    const html = render(Ledger, { facts, reviews: made.reviews, computedOn: "2026-11-15" });
    const inDefault = facts.records.filter((r) => r.byStructure[DEFAULT_VARIANT.structure].total > 0);
    const elsewhere = facts.records.length - inDefault.length;
    // the made-up record is one of them, whatever else the catalog holds
    expect(elsewhere).toBeGreaterThan(0);
    expect(html).toContain(`from ${inDefault.length} of the ${facts.counts.written} written records. The other ${elsewhere} have no steps in this view.`);
    expect(html).not.toContain(`Every step of the ${facts.counts.written} written records`);
    const inJv = facts.records.filter((r) => r.byStructure.jv.total > 0 && r.byStructure[DEFAULT_VARIANT.structure].total === 0).length;
    expect(inJv).toBeGreaterThan(0);
    const readInJv = facts.records.filter((r) => r.byStructure.jv.total > 0).length;
    expect(html).toContain(`The steps of ${readInJv} of the ${facts.counts.written} written records, read for a joint venture.`);
    expect(html).not.toContain("The same written records read for a joint venture");
  });

  it("says it in the singular when one written record has no steps in the default view", () => {
    // every written record that covers all three structures, and one made up for a joint venture alone
    const one: Corpus = { ...corpus, playbooks: [...corpus.playbooks.filter((p) => p.depth !== "full" || p.written.structure.length === STRUCTURES.length), jvOnly] };
    const f = siteFacts(one);
    const html = render(Ledger, { facts: f, reviews: one.reviews, computedOn: "2026-11-15" });
    expect(html).toContain(`from ${f.counts.written - 1} of the ${f.counts.written} written records. The other one has no steps in this view.`);
    // the fund view reads the same records as the default view; the joint venture view reads one more
    expect(html).toContain("The same written records read for a fund.");
    expect(html).toContain(`The steps of ${f.counts.written} of the ${f.counts.written} written records, read for a joint venture.`);
  });

  it("keeps the ledger's plain sentences when every written record covers every structure", () => {
    const everyStructure: Corpus = { ...corpus, playbooks: corpus.playbooks.filter((p) => p.depth !== "full" || p.written.structure.length === STRUCTURES.length) };
    const plain = siteFacts(everyStructure);
    const html = render(Ledger, { facts: plain, reviews: everyStructure.reviews, computedOn: "2026-11-15" });
    expect(html).toContain(`Every step of the ${plain.counts.written} written records that applies in the default view`);
    expect(html).not.toContain("written for another structure only");
    expect(html).toContain("The same written records read for a fund. Some steps apply to one structure only, so the count moves.");
    expect(html).toContain("The same written records read for a joint venture. Some steps apply to one structure only, so the count moves.");
  });
});
