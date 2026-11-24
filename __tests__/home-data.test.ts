import fs from "node:fs";
import path from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConnectPage from "@/app/connect/page";
import HomePage from "@/app/page";
import PlaybooksPage from "@/app/playbooks/page";
import {
  JOURNEY,
  SOFTWARE_SHOWN,
  availability,
  catalogSentence,
  getHomeData,
  journeyRows,
  listWords,
  pickStory,
  scenarioRows,
} from "@/components/home/data";
import { hostAnswer } from "@/components/home/reference";
import { getStepSoftwareFile, stepKey } from "@/components/rankings/step-software";
import { getRankingsSummary } from "@/components/rankings/summary";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { buildBoard } from "@/lib/demo/board";
import { getDemoRun } from "@/lib/demo/load";
import { HOSTS } from "@/lib/hosts";
import { logoSrc } from "@/lib/logos";
import { costAnswer } from "@/lib/plans";
import { PHASES } from "@/lib/schemas/playbook";
import { setupPrompt, site } from "@/lib/site";

// The home page of D218: the owner's line and one box, the twelve playbooks of the journey,
// the scenarios and the questions. Every value is computed; these pin the rules. The last
// block renders the page itself and pins what it must keep saying, whatever its layout.

const corpus = getCorpus();
const facts = siteFacts(corpus);

describe("the journey", () => {
  const rows = journeyRows(facts);

  it("is twelve written playbooks, each once, in the order a firm meets them", () => {
    expect(JOURNEY).toHaveLength(12);
    expect(new Set(JOURNEY).size).toBe(12);
    const phaseAt = JOURNEY.map((id) => {
      const pb = corpus.playbooks.find((p) => p.id === id);
      expect(pb, id).toBeDefined();
      expect(pb?.kind, id).toBe("process");
      expect(pb?.depth, id).toBe("full");
      return PHASES.indexOf(pb!.phase);
    });
    expect([...phaseAt].sort((a, b) => a - b)).toEqual(phaseAt);
  });

  it("prints each record's own share, as its own page does", () => {
    for (const r of rows) {
      const rec = facts.records.find((x) => x.slug === r.slug)!;
      expect(r.pct).toBe(rec.byStructure.syndication.pct);
      expect(r.agent).toBe(rec.byStructure.syndication.agent);
      expect(r.total).toBe(rec.byStructure.syndication.total);
    }
  });

  it("shows only scored software the step map names for its steps, best score first, never twice", () => {
    const summary = getRankingsSummary();
    const map = getStepSoftwareFile().steps;
    for (const r of rows) {
      const pb = corpus.playbooks.find((p) => p.slug === r.slug)!;
      expect(r.software.length).toBeLessThanOrEqual(SOFTWARE_SHOWN);
      expect(new Set(r.software.map((s) => s.id)).size).toBe(r.software.length);
      const scores: number[] = [];
      for (const s of r.software) {
        const [, , market = "", vendor = ""] = s.href.split("/");
        // some step of this record names this market and lists this product
        expect(pb.steps.some((st) => st.market === market && (map[stepKey(pb.id, st.id)] ?? []).includes(vendor)), `${r.slug}: ${s.id}`).toBe(true);
        const row = summary.markets.find((m) => m.view.market.id === market)?.listed.find((x) => x.vendor.id === vendor);
        expect(row, `${r.slug}: ${s.id} is listed in ${market}`).toBeDefined();
        expect(s.government).toBe(row?.vendor.kind === "government");
        // a product not judged yet sorts after every scored one (D225)
        scores.push(row?.result.score ?? -1);
      }
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });
});

describe("the scenarios", () => {
  it("are every written scenario, the most urgent first", () => {
    const rows = scenarioRows(facts);
    const written = corpus.playbooks.filter((p) => p.kind === "situation" && p.depth === "full");
    expect(rows.map((r) => r.slug).sort()).toEqual(written.map((p) => p.slug).sort());
    const rank = { hours: 0, days: 1, weeks: 2 } as const;
    const order = rows.map((r) => rank[r.urgency]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("the words", () => {
  it("say the catalog in the one sentence, computed and with no denominators", () => {
    const s = catalogSentence(facts);
    const { written, writtenByKind: w } = facts.counts;
    expect(s.startsWith(`${written} written in full: `)).toBe(true);
    expect(s).toContain(`${w.situation} scenario`);
    expect(catalogSentence(facts, { lead: false })).toBe(s.slice(`${written} `.length));
  });

  it("list words the plain way", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["Exit"])).toBe("Exit");
    expect(listWords(["Report", "Exit"])).toBe("Report and Exit");
    expect(listWords(["Operate", "Report", "Exit"])).toBe("Operate, Report and Exit");
  });

  it("name every host under its own status", () => {
    const answer = hostAnswer(HOSTS.map((h) => ({ id: h.id, name: h.name, status: h.status })));
    for (const h of HOSTS) expect(answer).toContain(h.name);
    if (HOSTS.some((h) => h.status === "unchecked")) expect(answer).toContain("not checked yet");
  });
});

describe("what is available", () => {
  it("is true in every state of the two flags, and gone when both are on", () => {
    const off = availability({ connectorLive: false, engineReleased: false });
    expect(off?.today).toBe(true);
    expect(off?.connector).not.toBeNull();
    expect(availability({ connectorLive: true, engineReleased: false })?.connector).toBeNull();
    expect(availability({ connectorLive: true, engineReleased: true })).toBeNull();
  });
});

describe("the motion specimen's moment", () => {
  it("is the agent's own step, the refused person's step and the person recording it", () => {
    const scene = buildBoard(getDemoRun(), corpus.playbooks).find((s) => s.id === "run");
    expect(scene).toBeDefined();
    const story = pickStory(scene!);
    expect(story.own.lane).toBe("agent");
    expect(story.refused.outcome.kind).toBe("refused");
    expect(story.person.lane).toBe("person");
  });
});

describe("the page, as the server renders it", () => {
  // The page itself: its hoisted rules and its inline scripts are not what it says.
  const html = renderToStaticMarkup(createElement(HomePage))
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "");
  const text = (markup: string) =>
    markup
      // a line-break hint inside an address is not a space; the URL's own spans are not either
      .replace(/<wbr\s*\/?>/g, "")
      .replace(/<\/?span[^>]*>(?=[^<\s]*\/)/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&rsquo;|’/g, "'")
      .replace(/&ldquo;|&rdquo;|&quot;|“|”/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .replace(/ ([.,:;?])/g, "$1")
      .trim();
  const count = (hay: string, needle: string) => hay.split(needle).length - 1;
  const page = text(html);
  const data = getHomeData();

  it("has one h1, the owner's line, and the line under it", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "")).toBe(site.tagline);
    expect(page).toContain(site.subline);
  });

  it("inks its last word once as the page opens, and keeps the line's own words in the h1 (decision 128)", () => {
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    // the word is real text, so reading, copying and finding stay plain; the ink is laid over it
    expect(h1).toContain('<span class="hl-power" data-ink="superpowers">superpowers</span>.');
    expect(text(h1)).toBe(site.tagline);
    const css = fs.readFileSync(path.join(process.cwd(), "components", "home", "styles.tsx"), "utf8");
    // the picture of the word is generated content that screen readers skip
    expect(css).toMatch(/\.hl-power::after\{content:attr\(data-ink\);content:attr\(data-ink\) \/ ""/);
    // it moves only on a screen, with scripts on and full motion; never in print or forced colors
    for (const rule of css.match(/[^{}]*\{[^{}]*animation:hl-[^}]*\}/g) ?? []) expect(rule, rule).toMatch(/html\.js\[data-motion="full"\] \.hl-power/);
    expect(css).toMatch(/@media print\{\.hl-power\{color:inherit\}\.hl-power::after\{content:none\}\}/);
    expect(css).toMatch(/@media \(forced-colors:active\)\{\.hl-power\{color:inherit\}\.hl-power::after\{content:none\}\}/);
    // it plays once: no animation repeats
    expect(css).not.toMatch(/infinite|alternate/);
    // the old cycling word is gone, component and rules
    expect(fs.existsSync(path.join(process.cwd(), "components", "home", "headline.tsx"))).toBe(false);
    expect(css).not.toMatch(/hl-word/);
  });

  it("answers what it costs: what is live is free, and the plans are coming", () => {
    const cost = costAnswer();
    expect(page).toContain(`${cost.text} ${cost.link}.`);
    expect(html).toContain('href="/plans"');
  });

  it("offers the one sentence, Claude Code's command and the address, and says once that it is not live", () => {
    expect(page).toContain(setupPrompt());
    expect(page).toContain(data.command);
    expect(page).toContain(data.mcpUrl);
    expect(count(page, "Goes live at launch")).toBe(site.connectorLive ? 0 : 1);
    expect(html).toContain('href="/audit"');
  });

  it("shows every host with its own icon, linking to its setup", () => {
    for (const h of HOSTS) {
      expect(html).toContain(`href="/connect#${h.id}"`);
      expect(html).toContain(`src="${logoSrc(h.id)}"`);
    }
  });

  it("lists the journey and the scenarios, each row a link to its record", () => {
    for (const r of [...data.journey, ...data.scenarios]) expect(html).toContain(`href="/playbooks/${r.slug}"`);
    for (const s of data.journey.flatMap((r) => r.software)) expect(html).toContain(`aria-label="${s.name.replace(/&/g, "&amp;")}"`);
  });

  it("names every section by its heading alone", () => {
    const ids = [...new Set([...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1] ?? ""))];
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const id of ids) {
      const open = new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>`).exec(html);
      expect(open, id).not.toBeNull();
      if (!open) continue;
      const tag = open[1] ?? "";
      expect(/^h[1-6]$/.test(tag), `${id} is a heading`).toBe(true);
    }
  });

  it("links into other pages only at places those pages have", () => {
    const pages: Record<string, ComponentType> = { "/connect": ConnectPage, "/playbooks": PlaybooksPage };
    const targets = new Map<string, Set<string>>();
    for (const m of html.matchAll(/href="(\/[^"#]*)#([^"]+)"/g)) {
      const [, path = "", hash = ""] = m;
      targets.set(path, (targets.get(path) ?? new Set()).add(hash));
    }
    for (const [path, hashes] of targets) {
      const target = pages[path];
      expect(target, `a page to check ${path} against`).toBeDefined();
      if (!target) continue;
      const there = renderToStaticMarkup(createElement(target));
      for (const hash of hashes) expect(there.includes(`id="${hash}"`), `${path}#${hash}`).toBe(true);
    }
  });
});
