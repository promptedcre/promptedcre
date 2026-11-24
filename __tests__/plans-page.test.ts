import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GET as llmsGET } from "@/app/llms.txt/route";
import PlansPage, { generateMetadata } from "@/app/plans/page";
import { QUICK } from "@/components/search-palette-dialog";
import { FOOTER_GROUPS } from "@/components/site-footer";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { HOSTS } from "@/lib/hosts";
import { TOOLS } from "@/lib/mcp/server";
import { ENTERPRISE, FREE_ACTION, MONEY_LINE, PLANS_PAGE, PRO, costAnswer, freePlan, llmsNote, plansDescription } from "@/lib/plans";
import { site } from "@/lib/site";

// The plans page (decisions 120 to 127), pinned to what the server renders: three cards in
// order, each saying what it is and where it stands; every figure on Free counted; nothing
// taken from a visitor (no waitlist for now); and the page's promises, word for word.

const html = renderToStaticMarkup(createElement(PlansPage));
// The page itself, without its hoisted style block.
const body = html.replace(/<style[\s\S]*?<\/style>/g, "");
const text = (markup: string) =>
  markup
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;|’/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;])/g, "$1")
    .trim();
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const anchors = (markup: string, href: string) => [...markup.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((a) => a.includes(`href="${href}"`));

// One card's markup: from its own opening to the next card's, or to the end of the list.
function card(id: string): string {
  const from = body.indexOf(`data-plan="${id}"`);
  expect(from, id).toBeGreaterThan(-1);
  const next = body.indexOf("data-plan=", from + 12);
  return body.slice(from, next === -1 ? body.indexOf("</ul>", body.lastIndexOf('data-plan="')) : next);
}

const PAID = ["pro", "enterprise"] as const;
const facts = siteFacts(getCorpus());
const counts = { written: facts.counts.written, rules: facts.counts.rules, calculators: facts.counts.calculatorsLive, tools: TOOLS.length };

describe("the plans page", () => {
  it("has one h1, the page's title, and the line under it", () => {
    expect(count(body, "<h1")).toBe(1);
    expect(text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(body)?.[1] ?? "")).toBe(PLANS_PAGE.title);
    expect(text(body)).toContain(PLANS_PAGE.lede);
  });

  it("shows three cards in order, Free, Pro and Enterprise, each under its own h2", () => {
    expect([...body.matchAll(/data-plan="(\w+)"/g)].map((m) => m[1])).toEqual(["free", "pro", "enterprise"]);
    expect([...body.matchAll(/<h2 id="plan-(\w+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]])).toEqual([
      ["free", "Free"],
      ["pro", "Pro"],
      ["enterprise", "Enterprise"],
    ]);
  });

  it("marks Free live with the solid chip, and Pro and Enterprise coming soon with the dashed one", () => {
    const free = card("free");
    expect(free).toMatch(/class="tag tag--agent"[^>]*>[\s\S]*?Live<\/span>/);
    expect(free).not.toContain("tag--dashed");
    expect(text(free)).toContain("Included today");
    for (const id of PAID) {
      const c = card(id);
      expect(c).toMatch(/class="tag tag--muted tag--dashed"[^>]*>Coming soon<\/span>/);
      expect(text(c)).toContain("Planned");
      expect(text(c)).not.toContain("Included today");
    }
  });

  it("takes nothing from a visitor: no form, no field, no button and no waitlist (decision 127)", () => {
    expect(body).not.toMatch(/<form|<input|<button|<textarea|<select/);
    expect(text(body).toLowerCase()).not.toMatch(/waitlist|sign up for|your email|work email/);
    for (const id of PAID) expect(card(id)).not.toContain("btn");
  });

  it("counts every figure on the Free card from the catalog", () => {
    const said = text(card("free"));
    expect(said).toContain(
      `${facts.counts.written} playbooks, scenarios and audits, with ${facts.counts.rules} rule cards and ${facts.counts.calculatorsLive} calculators.`,
    );
    expect(said).toContain(`${TOOLS.length} read-only tools to search, read and calculate. No account.`);
  });

  it("says each card's lines word for word and in order: three on Free, six on Pro, nine on Enterprise", () => {
    for (const plan of [freePlan(counts), PRO, ENTERPRISE]) {
      const c = card(plan.id);
      const said = text(c);
      expect(said).toContain(plan.who);
      expect(said).toContain(plan.promise);
      // each line's name, in order, in its own <dt>; then its words, in the same order
      const names = [...c.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>/g)].map((m) => text(m[1] ?? ""));
      expect(names).toHaveLength(plan.items.length);
      plan.items.forEach((item, i) => expect(names[i], `${plan.id} line ${i + 1}`).toContain(item.name));
      let at = -1;
      for (const item of plan.items) {
        const where = said.indexOf(item.text);
        expect(where, `${plan.id}: ${item.name}`).toBeGreaterThan(at);
        at = where;
      }
    }
    expect([freePlan(counts).items.length, PRO.items.length, ENTERPRISE.items.length]).toEqual([3, 6, 9]);
    // the names the owner picked for the renamed lines (R15)
    expect(PRO.items.map((i) => i.name)).toContain("Links to your firm's tools");
    expect(freePlan(counts).items.map((i) => i.name)).toContain("The MCP connector");
  });

  it("says only what is live: the Free card and the plans' lines follow the site's two flags", () => {
    const on = { connectorLive: true, engineReleased: true, repoUrl: "https://github.com/example/repo" };
    const off = { connectorLive: false, engineReleased: false, repoUrl: null };
    expect(freePlan(counts, on).items.map((i) => i.name)).toEqual(["The site", "The MCP connector", "The repository"]);
    expect(freePlan(counts, off).items.map((i) => i.name)).toEqual(["The site"]);
    expect(freePlan(counts, { ...on, engineReleased: false }).items.at(-1)?.text).not.toContain("engine");
    expect(costAnswer(on).text).toBe("The playbooks, the connector and the engine are free, with no account. Pro and Enterprise plans for firms are coming.");
    expect(costAnswer(off).text).toBe("The playbooks are free, with no account. Pro and Enterprise plans for firms are coming.");
    expect(llmsNote(on)).toContain("(the site, the MCP connector and the repository, with no account)");
    expect(llmsNote(off)).toContain("(the site, with no account)");
    expect(plansDescription(off)).not.toMatch(/connector|repository/);
    // and the page draws today's state
    expect(text(card("free"))).toContain("The MCP connector");
  });

  it("claims open licenses only for what the repository licenses openly: the code and the playbooks", () => {
    const repo = freePlan(counts).items.find((i) => i.name === "The repository");
    expect(repo?.text).toContain("the code and playbooks under open licenses");
    expect(repo?.text).not.toMatch(/all the code and content/);
  });

  it("sends Free on to the setup steps with the page's one filled button, above its list", () => {
    const free = card("free");
    const button = anchors(free, FREE_ACTION.href).filter((a) => a.includes("btn--primary"));
    expect(button).toHaveLength(1);
    expect(text(free)).toContain(FREE_ACTION.text);
    expect(count(body, "btn--primary")).toBe(1);
    expect(free.indexOf("btn--primary")).toBeLessThan(free.indexOf('id="free-list"'));
  });

  it("draws two company marks on the Free card, each beside its name, and none on the others", () => {
    const free = card("free");
    expect(free).toContain('src="/logos/mcp.png"');
    expect(free).toContain('src="/logos/github.png"');
    expect(count(free, "<img")).toBe(2);
    expect(text(free)).toContain("The MCP connector");
    expect(text(free)).toMatch(/The repository GitHub/);
    for (const id of PAID) expect(card(id)).not.toContain("<img");
  });

  it("links the Free card's three lines to the catalog, the tools and the repository", () => {
    const free = card("free");
    expect(anchors(free, "/playbooks")).toHaveLength(1);
    expect(anchors(free, "/connect#tools")).toHaveLength(1);
    if (site.repoUrl) expect(anchors(free, site.repoUrl)).toHaveLength(1);
  });

  it("says under the cards who pays for the paid plans, word for word", () => {
    const after = text(body.slice(body.lastIndexOf("</ul>")));
    expect(after).toContain(MONEY_LINE);
  });

  it("types no figure: every number on the page is one the catalog counts", () => {
    const counted = new Set([counts.written, counts.rules, counts.calculators, counts.tools].map(String));
    const figures = [...text(body).matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0]);
    expect(figures.length).toBeGreaterThan(0);
    for (const f of figures) expect(counted.has(f), f).toBe(true);
  });

  it("names no price, no date, no AI app on the paid cards, and not the other site's hub", () => {
    const said = text(body);
    expect(said).not.toMatch(/\$|\bUSD\b|\bper (month|year|seat)\b|\/(mo|month|yr)\b/i);
    expect(said).not.toMatch(/\b(19|20)\d\d\b/);
    expect(said).not.toMatch(/\bA\.?\s?CRE\b/);
    expect(said.toLowerCase()).not.toContain("dreaming");
    for (const id of PAID) {
      const paid = text(card(id));
      expect(paid).not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]|quarter|spring|summer|autumn|fall|winter)\b/);
      for (const h of HOSTS) expect(paid, `${id}: ${h.name}`).not.toContain(h.name);
    }
  });

  it("names itself for a tab and a shared link, on the site's own share image", async () => {
    const image = { url: new URL(`${site.url}/opengraph-image?abc`), width: 1200, height: 630, alt: "share" };
    // Next's own shape: the layout's twitter has no images yet (they are copied from Open Graph last)
    const parent = Promise.resolve({ openGraph: { images: [image] }, twitter: { card: "summary_large_image" } });
    const meta = await generateMetadata({} as never, parent as never);
    expect(meta.title).toBe("Plans");
    expect(meta.description).toBe(plansDescription());
    expect(meta.openGraph?.url).toBe(`${site.url}/plans`);
    expect(meta.openGraph?.title).toBe(`Plans · ${site.name}`);
    // a page's openGraph replaces the layout's whole, so the image must be carried over
    expect(meta.openGraph?.images).toEqual([image]);
    // and twitter leaves images out, so Next copies the Open Graph image into it; [] would stop that
    expect(meta.twitter).not.toHaveProperty("images");
    expect(meta.twitter?.title).toBe(`Plans · ${site.name}`);
  });

  it("is listed for people in /llms.txt, in the footer and in the search box's quick links", async () => {
    const index = await llmsGET(new Request("https://example.test/llms.txt")).text();
    expect(index).toContain(`- [Plans](https://example.test/plans): ${llmsNote()}`);
    expect(index).not.toMatch(/waitlist/i);
    const start = FOOTER_GROUPS.find((g) => g.links.some((l) => l.href === "/"));
    expect(start?.links).toEqual([
      { href: "/", label: "Home" },
      { href: "/plans", label: "Plans" },
      { href: "/connect", label: "Set up your agent" },
    ]);
    expect(QUICK.slice(0, 2).map((q) => [q.href, q.title, q.sub])).toEqual([
      ["/connect", "Set up your agent", "Add PromptedCRE to your AI agent"],
      ["/plans", "Plans", "Free today. Pro and Enterprise are coming"],
    ]);
  });
});
