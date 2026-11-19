import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketRow, RankSchedule, ScoreChart, SortControl, getMarketSummary, getRankingsSummary, groupSentence, storyKey } from "@/components/rankings";
import { BARS_CSS } from "@/components/rankings/bars";
import { rankingsIssues } from "@/lib/rankings/check";
import { itemHash, packHash } from "@/lib/rankings/hash";
import { loadRankings, type MarketData, type Rankings } from "@/lib/rankings/load";
import { calibrate, marketView } from "@/lib/rankings/state";
import type { EvidencePack, GoldenCell, Story, TaskStory, Verdict, VerdictFile } from "@/lib/schemas/rankings";
import { compareScores, scoreVendor } from "@/lib/scoring/score";
import { htmlToLines, normalize } from "../tools/rankings/page-text.mjs";

const story = (id: string, weight: number, na?: string): Story => ({
  id,
  group: "access",
  title: `Story ${id}`,
  question: "Can an agent do the thing?",
  weight,
  full: "Shows the whole thing.",
  partial: "Shows part of the thing.",
  ...(na ? { na } : {}),
});

const task: TaskStory = { ...story("task-one", 2), group: "task" };

const v = (s: string, verdict: Verdict["verdict"], quality: number, evidence: string[] = ["c1"], missing?: string): Verdict => ({
  story: s,
  verdict,
  quality,
  evidence,
  rationale: "The cited page says so plainly.",
  ...(missing ? { missing } : {}),
});

describe("score", () => {
  const stories = [story("a", 3), story("b", 2), story("c", 1, "never applies to static data")];

  it("weights quality and verdict, and leaves not-applicable stories out of both sums", () => {
    // (3 × 1.0 × 1 + 2 × 0.6 × 0.5) ÷ (3 + 2) = 0.72
    const s = scoreVendor(stories, [v("a", "full", 10), v("b", "partial", 6, ["c1"], "only reads"), v("c", "na", 0, [])]);
    expect(s.score).toBe(72);
    expect(s.groups.access).toBe(72);
    expect(s.groups.task).toBeNull();
  });

  it("scores disputed at a quarter and none at zero", () => {
    const s = scoreVendor(stories, [v("a", "disputed", 10, ["c1", "c2"]), v("b", "none", 0, [], "nothing"), v("c", "none", 0, [], "nothing")]);
    // (3 × 0.25) ÷ 6 = 0.125
    expect(s.score).toBe(13);
  });

  it("gives untested vendors no score and sorts them last", () => {
    expect(scoreVendor(stories, null).score).toBeNull();
    const rows = [
      { name: "Untested", score: null },
      { name: "Low", score: 20 },
      { name: "High", score: 80 },
    ].sort(compareScores);
    expect(rows.map((r) => r.name)).toEqual(["High", "Low", "Untested"]);
  });
});

function fixture(): { r: Rankings; m: MarketData; pack: EvidencePack; file: VerdictFile } {
  const items = [
    { id: "c1", tier: "vendor-claim" as const, url: "https://example.com/api", excerpt: "Our REST API is public.", fetched: "2026-11-12" },
    { id: "c2", tier: "vendor-claim" as const, url: "https://example.com/pricing", excerpt: "Plans start at a price.", fetched: "2026-11-12" },
  ].map((i) => ({ ...i, hash: itemHash(i.url, i.excerpt) }));
  const cov = { url: "https://example.com/", found: true };
  const pack: EvidencePack = {
    vendor: "demo-vendor",
    collected: "2026-11-12",
    coverage: { docs: cov, api: cov, pricing: cov, changelog: cov },
    links: {},
    packages: [],
    repos: [],
    items,
  };
  const stories = [story("public-api", 3), story("public-pricing", 3)];
  const file: VerdictFile = {
    vendor: "demo-vendor",
    judged: "2026-11-12",
    judgeModel: "test-model",
    promptVersion: "judge-test",
    evidenceHash: packHash(pack),
    verdicts: [v("public-api", "full", 10), v("public-pricing", "partial", 5, ["c2"], "no tier prices"), v("task-one", "none", 0, [], "nothing shown")],
  };
  const m: MarketData = {
    market: { id: "demo-market", name: "Demo market", what: "A market used only by the tests.", order: 1, tasks: [task, { ...task, id: "task-two" }, { ...task, id: "task-three" }] },
    vendors: [{ id: "demo-vendor", name: "Demo Vendor", kind: "product", what: "A vendor used only by the tests.", homepage: "https://example.com/", status: "active" }],
    evidence: new Map([["demo-vendor", pack]]),
    verdicts: new Map([["demo-vendor", file]]),
    golden: [],
  };
  file.verdicts.push(v("task-two", "none", 0, [], "nothing"), v("task-three", "none", 0, [], "nothing"));
  return { r: { storiesVersion: "test", stories, markets: [m] }, m, pack, file };
}

describe("rankings checks", () => {
  it("accepts a complete, current verdict file", () => {
    const { r } = fixture();
    expect(rankingsIssues(r).errors).toEqual([]);
  });

  it("rejects verdicts that cite missing evidence, skip a story, misuse na or omit what is missing", () => {
    const { r, file } = fixture();
    file.verdicts[0] = v("public-api", "full", 8, ["c9"]);
    file.verdicts[1] = v("public-pricing", "na", 0, []);
    file.verdicts = file.verdicts.filter((x) => x.story !== "task-three");
    const text = rankingsIssues(r).errors.join("\n");
    expect(text).toContain('cites evidence "c9", which is not in the pack');
    expect(text).toContain("quality 8 must name what is missing");
    expect(text).toContain('"na" is not allowed');
    expect(text).toContain('no verdict for story "task-three"');
  });

  it("marks a verdict stale when the evidence changes after judging", () => {
    const { r, m, pack } = fixture();
    const first = pack.items[0];
    if (!first) throw new Error("fixture needs an item");
    first.excerpt = "Our REST API is private.";
    first.hash = itemHash(first.url, first.excerpt);
    expect(rankingsIssues(r).errors.join("\n")).toContain("evidence changed after judging");
    expect(marketView(r, m).rows[0]?.status).toBe("stale");
  });

  it("catches an excerpt edited without re-sealing", () => {
    const { r, pack } = fixture();
    const first = pack.items[0];
    if (!first) throw new Error("fixture needs an item");
    first.excerpt = "Edited by hand.";
    expect(rankingsIssues(r).errors.join("\n")).toContain("hash does not match");
  });
});

describe("calibration", () => {
  const cells = (n: number): GoldenCell[] =>
    Array.from({ length: n }, (_, i) => ({ vendor: "demo-vendor", story: i % 2 ? "public-api" : "public-pricing", verdict: i % 2 ? "full" : "partial", why: "checked by hand", checked: "2026-11-12", evidence: [] }));

  it("publishes a market at 18 of 20 matching cells and not at 17", () => {
    const { m } = fixture();
    m.golden = cells(20);
    expect(calibrate(m)).toMatchObject({ cells: 20, matches: 20, passed: true });
    m.golden = cells(20).map((c, i) => (i < 2 ? { ...c, verdict: "none" as const } : c));
    expect(calibrate(m)).toMatchObject({ matches: 18, passed: true });
    m.golden = cells(20).map((c, i) => (i < 3 ? { ...c, verdict: "none" as const } : c));
    expect(calibrate(m)).toMatchObject({ matches: 17, passed: false });
  });

  it("does not publish with fewer than 20 cells", () => {
    const { m } = fixture();
    m.golden = cells(19);
    expect(calibrate(m).passed).toBe(false);
  });
});

describe("page text", () => {
  it("keeps visible text, drops scripts and styles, decodes entities", () => {
    const lines = htmlToLines("<html><head><style>p{}</style><script>var x=1</script></head><body><h1>API &amp; SDKs</h1><p>Use our&nbsp;REST API.</p></body></html>");
    expect(lines).toEqual(["API & SDKs", "Use our REST API."]);
    expect(normalize("It’s “free” – really")).toBe("it's \"free\" - really");
  });
});

describe("rankings data", () => {
  it("loads every rankings file with no schema errors", () => {
    const { rankings, errors } = loadRankings();
    expect(errors).toEqual([]);
    expect(rankings.markets).toHaveLength(4);
    expect(rankings.stories.length).toBeGreaterThanOrEqual(11);
  });
});

// The rankings pages (D224, the owner's "animated bars"): every bar and figure is the computed
// score, a vendor with no score never gets a bar or a number, and the full table's server order
// is the rank order the sort control starts from.
describe("rankings pages", () => {
  const render = <P extends object>(component: (props: P) => unknown, props: P) =>
    renderToStaticMarkup(createElement(component as never, props as never)).replace(/<!-- -->/g, "");
  const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  // A rendering's bar rows, by vendor id, each with its markup.
  const barRows = (html: string) =>
    new Map(
      html
        .split('<li class="rkb rkb--go" data-vendor="')
        .slice(1)
        .map((part) => [part.slice(0, part.indexOf('"')), part.slice(0, part.indexOf("</li>"))] as const),
    );
  const figure = (n: number) => `<span aria-hidden="true" class="tabular-nums">${n}</span><span class="sr-only">${n}</span>`;
  const { markets } = getRankingsSummary();
  const formation = getMarketSummary("formation-back-office");
  if (!formation) throw new Error("No formation-back-office market.");

  it("draws each published market's top three as bars: the score is the figure and the bar's length, the group scores the row's description", () => {
    for (const m of markets.filter((x) => x.view.published)) {
      const html = render(MarketRow, { summary: m });
      const rows = barRows(html);
      const top = m.ranked.slice(0, 3);
      expect([...rows.keys()]).toEqual(top.map((r) => r.vendor.id));
      expect(html).toContain('<ol data-reveal=""');
      for (const r of top) {
        const row = rows.get(r.vendor.id) ?? "";
        const score = r.result.score as number;
        expect(row).toContain(`--pct:${score}%`);
        expect(row).toContain(figure(score));
        expect(row).toContain('class="rkb-fill fill-on-reveal"');
        const groups = storyKey(m.view.stories).map((g) => ({ label: g.label, score: r.result.groups[g.group] }));
        expect(row).toContain(`aria-describedby="rkb-${m.view.market.id}-${r.vendor.id}"`);
        expect(row).toContain(`hidden="">${groupSentence(groups)}</span>`);
      }
    }
  });

  it("words the group scores as a sentence, and a group with no applicable task as not applicable", () => {
    const groups = [
      { label: "Agent access", score: 75 },
      { label: "Openness", score: null },
      { label: "Market tasks", score: 0 },
    ];
    expect(groupSentence(groups)).toBe("Group scores: agent access 75, openness not applicable, market tasks 0.");
  });

  it("charts every listed vendor: the scored ones as bars in rank order under the best score, the rest with their state and no bar or number", () => {
    const html = render(ScoreChart, { summary: formation });
    const rows = barRows(html);
    const unscored = formation.listed.filter((r) => r.rank === null);
    expect([...rows.keys()]).toEqual([...formation.ranked, ...unscored].map((r) => r.vendor.id));
    const best = formation.ranked[0]?.result.score as number;
    expect(html).toContain(`Best score here</span><span class="type-title-l text-text">${figure(best)}</span>`);
    for (const r of formation.listed) {
      const row = rows.get(r.vendor.id) ?? "";
      if (r.rank !== null) {
        expect(row).toContain(`--pct:${r.result.score}%`);
        expect(row).toContain(figure(r.result.score as number));
        continue;
      }
      for (const drawn of ["rkb-fill", "rkb-score", "rkb-card", "--pct", "aria-describedby"]) expect(row, `${r.vendor.id}: ${drawn}`).not.toContain(drawn);
      expect(row).toContain(r.status === "stale" ? ">Stale<" : ">Untested<");
      expect(row).toContain(`Not scored: ${r.reason}.`);
    }
  });

  it("lists ZenBusiness, not judged yet, as untested with its reason, in the chart and the table", () => {
    const z = formation.listed.find((r) => r.vendor.id === "zenbusiness");
    expect(z?.status).toBe("untested");
    expect(z?.rank).toBeNull();
    expect(z?.result.score).toBeNull();
    const chart = barRows(render(ScoreChart, { summary: formation })).get("zenbusiness") ?? "";
    expect(chart).toContain("ZenBusiness</a>");
    expect(chart).toContain(`Not scored: ${z?.reason}.`);
    const table = render(RankSchedule, {
      marketId: formation.view.market.id,
      marketName: formation.view.market.name,
      stories: formation.view.stories,
      rows: formation.listed,
      published: true,
    });
    const row = table.slice(table.indexOf('href="/rankings/formation-back-office/zenbusiness"'));
    expect(row.slice(0, row.indexOf("</tr>"))).toContain(`Not scored: ${z?.reason}.`);
  });

  it("gives ZenBusiness its own page, which says it is untested and why, with no score", async () => {
    const { default: VendorPage, generateStaticParams } = await import("@/app/rankings/[market]/[vendor]/page");
    expect(generateStaticParams()).toContainEqual({ market: "formation-back-office", vendor: "zenbusiness" });
    const page = await VendorPage({ params: Promise.resolve({ market: "formation-back-office", vendor: "zenbusiness" }) } as never);
    const html = renderToStaticMarkup(page).replace(/<!-- -->/g, "");
    expect(html).toContain(">ZenBusiness</h1>");
    expect(html).toContain(">Untested</p>");
    expect(html).toContain("Not scored: no evidence collected yet.");
    expect(html).not.toContain("type-figure");
  });

  it("draws no chart until the market publishes", () => {
    expect(render(ScoreChart, { summary: { ...formation, view: { ...formation.view, published: false } } })).toBe("");
  });

  it("keeps the table's server order the rank order and marks each row for the sort; an unpublished table is not sortable", () => {
    const props = {
      marketId: formation.view.market.id,
      marketName: formation.view.market.name,
      stories: formation.view.stories,
      rows: formation.listed,
      published: true,
      sortId: "rk-rows-test",
    };
    const html = render(RankSchedule, props);
    expect(html).toContain('<tbody class="max-lg:block" id="rk-rows-test">');
    const order = [...html.matchAll(/<tr data-order="(\d+)" data-name="([^"]+)"/g)].map((m) => [Number(m[1]), unescape(m[2] ?? "")]);
    expect(order).toEqual(formation.listed.map((r, i) => [i, r.vendor.name]));
    expect(html).toContain('data-sort="score" aria-sort="descending"');
    expect(html).toContain('data-sort="name"');
    const unpublished = render(RankSchedule, { ...props, published: false });
    for (const mark of ["data-order=", "data-sort=", "aria-sort=", 'id="rk-rows-test"']) expect(unpublished).not.toContain(mark);
  });

  it("offers the sort as two pill buttons under a visible label, score pressed first", () => {
    const html = render(SortControl, { target: "rk-rows-test" });
    expect(html).toContain('data-order="score" role="group" aria-labelledby="rk-rows-test-sort"');
    expect(html).toContain('<span id="rk-rows-test-sort" class="type-label text-muted">Sort by</span>');
    expect(html).toContain('aria-pressed="true">Score</button>');
    expect(html).toContain('aria-pressed="false">Name</button>');
  });

  it("hides nothing of its own before motion: no blur or zero scale in its rules, and only the hover card starts hidden", () => {
    expect(BARS_CSS.startsWith("@layer components {")).toBe(true);
    expect(BARS_CSS).not.toMatch(/scaleX\(0\)|blur\(/);
    const hidden = [...BARS_CSS.matchAll(/([^{}]+)\{[^{}]*(?:opacity:0|visibility:hidden)[^{}]*\}/g)].map((m) => (m[1] ?? "").trim());
    expect(hidden).toEqual([".rkb-pop"]);
  });
});
