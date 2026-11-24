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
import { ENTERPRISE, FREE_ACTION, PLANS_LABEL, PRO, costAnswer, freePlan, llmsNote, plansDescription } from "@/lib/plans";
import { site } from "@/lib/site";

// The plans page (decisions 120 to 127, made simpler by 134 to 138), pinned to what the server
// renders: three cards in order, each saying what it is, where it stands and its lines by name
// alone; every figure on Free counted; nothing taken from a visitor (no waitlist for now); no
// title, line or money line drawn; and the page's promises, word for word.

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
  it("has one h1, 'Plans', for screen readers only, and draws no title, line or money line (decision 135)", () => {
    expect(count(body, "<h1")).toBe(1);
    const h1 = /<h1([^>]*)>([\s\S]*?)<\/h1>/.exec(body);
    expect(text(h1?.[2] ?? "")).toBe(PLANS_LABEL);
    expect(h1?.[1]).toMatch(/class="sr-only"/);
    const said = text(body);
    for (const gone of ["Three plans. One is live today.", "Free gives you and your agent", "Paid plans are paid for", "No vendor pays"])
      expect(said, gone).not.toContain(gone);
    // the cards are the last thing on the page
    expect(text(body.slice(body.lastIndexOf("</ul>") + 5))).toBe("");
  });

  it("draws no 'who it is for' line and no label over a list; a screen reader still hears each list's name (decision 134)", () => {
    const said = text(body);
    for (const gone of ["For real estate operators.", "For full-service and vertically integrated firms.", "Included today", "Planned"])
      expect(said, gone).not.toContain(gone);
    expect(body).not.toMatch(/<dl|<dt|<dd|<h3/);
    expect(card("free")).toContain('aria-label="Included today"');
    for (const id of PAID) expect(card(id)).toContain('aria-label="Planned"');
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
    for (const id of PAID) expect(card(id)).toMatch(/class="tag tag--muted tag--dashed"[^>]*>Coming soon<\/span>/);
  });

  it("takes nothing from a visitor: no form, no field, no button and no waitlist (decision 127)", () => {
    expect(body).not.toMatch(/<form|<input|<button|<textarea|<select/);
    expect(text(body).toLowerCase()).not.toMatch(/waitlist|sign up for|your email|work email/);
    for (const id of PAID) expect(card(id)).not.toContain("btn");
  });

  it("counts every figure on the Free card from the catalog, in the lines' names (decision 138)", () => {
    const said = text(card("free"));
    expect(said).toContain(`${facts.counts.written} playbooks, scenarios and audits`);
    expect(said).toContain(`${facts.counts.rules} rule cards and ${facts.counts.calculatorsLive} calculators`);
    expect(said).toContain(`MCP connector: ${TOOLS.length} read-only tools`);
  });

  it("says each card's promise, then its lines by name alone and in order: four on Free, three on Pro, six on Enterprise", () => {
    for (const plan of [freePlan(counts), PRO, ENTERPRISE]) {
      const c = card(plan.id);
      expect(text(c)).toContain(plan.promise);
      const lines = [...c.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1] ?? ""));
      expect(lines, plan.id).toEqual(plan.items.map((i) => i.name));
    }
    expect([freePlan(counts).items.length, PRO.items.length, ENTERPRISE.items.length]).toEqual([4, 3, 6]);
    // the promises, short (decision 134)
    expect([freePlan(counts).promise, PRO.promise, ENTERPRISE.promise]).toEqual([
      "Everything on this site, for you and your agent.",
      "Everything in Free, plus the Desk: live data and your firm's tools.",
      "Everything in Pro, built with your firm.",
    ]);
    // Pro's first line, in the owner's words, with the two lines it covers folded in (decision 136)
    expect(PRO.items.map((i) => i.name)).toEqual([`Connector and skill repository, updated weekly by the ${site.name} team`, "Live market data", "Property lookups"]);
    expect(ENTERPRISE.items.map((i) => i.name)).toEqual([
      "Custom skills and workflows",
      "Company brain",
      "Agent harness",
      "Approvals inbox",
      "Access by role",
      "Runs where you choose",
    ]);
  });

  it("says only what is live: the Free card and the plans' lines follow the site's two flags", () => {
    const on = { connectorLive: true, engineReleased: true, repoUrl: "https://github.com/example/repo" };
    const off = { connectorLive: false, engineReleased: false, repoUrl: null };
    const always = [`${counts.written} playbooks, scenarios and audits`, `${counts.rules} rule cards and ${counts.calculators} calculators`];
    expect(freePlan(counts, on).items.map((i) => i.name)).toEqual([...always, `MCP connector: ${counts.tools} read-only tools`, "The engine and code on GitHub"]);
    expect(freePlan(counts, off).items.map((i) => i.name)).toEqual(always);
    expect(freePlan(counts, { ...on, engineReleased: false }).items.at(-1)?.name).toBe("The code and playbooks on GitHub");
    expect(costAnswer(on).text).toBe("The playbooks, the connector and the engine are free, with no account. Pro and Enterprise plans for firms are coming.");
    expect(costAnswer(off).text).toBe("The playbooks are free, with no account. Pro and Enterprise plans for firms are coming.");
    expect(llmsNote(on)).toContain("(the site, the MCP connector and the repository, with no account)");
    expect(llmsNote(off)).toContain("(the site, with no account)");
    expect(plansDescription(off)).not.toMatch(/connector|repository/);
    // and the page draws today's state
    expect(text(card("free"))).toContain("MCP connector:");
    expect(text(card("free"))).toContain("The engine and code on GitHub");
  });

  it("claims no license on the card: with the lines under the names gone, nothing says what is open (D276)", () => {
    expect(text(card("free"))).not.toMatch(/licen[cs]e|open source|all the code and content/i);
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
    // each mark sits in the line whose name says its company, and is hidden from screen readers
    const line = (needle: string) => [...free.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1] ?? "").find((l) => text(l).includes(needle)) ?? "";
    expect(line("MCP connector:")).toContain('src="/logos/mcp.png"');
    expect(line("on GitHub")).toContain('src="/logos/github.png"');
    expect(free).not.toMatch(/<img[^>]*alt="[^"]+"/);
    for (const id of PAID) expect(card(id)).not.toContain("<img");
  });

  it("makes the Free card's names links where each has a page: the catalog, the tools and the repository (decision 138)", () => {
    const free = card("free");
    expect(anchors(free, "/playbooks")).toHaveLength(1);
    expect(anchors(free, "/connect#tools")).toHaveLength(1);
    if (site.repoUrl) expect(anchors(free, site.repoUrl)).toHaveLength(1);
    // the button and those three: the rule cards and calculators line has no one page
    expect(count(free, "<a ")).toBe(site.repoUrl ? 4 : 3);
    for (const id of PAID) expect(card(id)).not.toContain("<a ");
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
