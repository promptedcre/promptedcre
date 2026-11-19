import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConnectPage from "@/app/connect/page";
import NotFound from "@/app/not-found";
import { setupSteps } from "@/components/connect/host-steps";
import { FOOTER_GROUPS, SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatusLine } from "@/components/ui/status-line";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { HOSTS, statusLine } from "@/lib/hosts";
import { TOOLS } from "@/lib/mcp/server";
import { firmFileSpec } from "@/lib/mcp/tools";
import { nav, site } from "@/lib/site";

// What /connect, the header, the footer, the status line and the not-found page promise,
// pinned to what they render: the hosts' true order of work, each state said once and from
// its flag, a header that tells the truth about the connector, and one voice in the foot.

const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;|’/g, "'")
    .replace(/&ldquo;|&rdquo;|“|”/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    // a tag before a full stop, a comma or a colon leaves no space there
    .replace(/ ([.,:;])/g, "$1");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
// The markup without its hoisted style blocks, for counting what is in the page itself.
const body = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "");
// Every <a ... href="X" ...> opening tag in the markup.
const anchors = (html: string, href: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((a) => a.includes(`href="${href}"`));

describe("/connect", () => {
  // the page itself: the hoisted rules name the panels too, and are not the page
  const html = body(renderToStaticMarkup(createElement(ConnectPage)));
  const panel = (id: string) => {
    const from = html.indexOf(`data-host-panel="${id}"`);
    expect(from, id).toBeGreaterThan(-1);
    const next = html.indexOf("data-host-panel=", from + 20);
    return text(html.slice(from, next === -1 ? html.indexOf('id="tools"') : next));
  };

  it("lists each host's steps in the order that host really works", () => {
    for (const h of HOSTS) {
      const p = panel(h.id);
      const check = p.indexOf("Check it worked");
      const firstOwn = setupSteps(h.steps(`${site.url}/api/mcp`))[0];
      // the opening words of the host's own first step (a step that is only a command gets a sentence on the page)
      const opening = firstOwn?.text?.split(/[`,]/)[0]?.trim().slice(0, 20);
      const own = p.indexOf(opening ?? "adds the connector with this command");
      expect(own, `${h.id}: its own steps`).toBeGreaterThan(-1);
      if (h.adds === "agent") {
        // the agent adds the connector itself, so the sentence comes first
        const paste = p.indexOf(`Paste this into ${h.name}.`);
        expect(paste, h.id).toBeGreaterThan(-1);
        expect(p).not.toContain("First, add the connector");
        expect(paste).toBeLessThan(own);
      } else {
        // a person adds it first (in the app's settings, or by asking the agent in a chat); the sentence is pasted after
        const add = p.indexOf(h.adds === "chat" ? `First, have ${h.name} add the connector.` : `First, add the connector in ${h.name}'s settings.`);
        const paste = p.indexOf(`Then paste this into ${h.name}.`);
        expect(add, h.id).toBeGreaterThan(-1);
        expect(add).toBeLessThan(own);
        expect(own).toBeLessThan(paste);
      }
      expect(own).toBeLessThan(check);
      // the notes for whoever wires it up come last, in a fold named for what is in it
      expect(p.indexOf(`Setup notes for ${h.name}`)).toBeGreaterThan(check);
    }
  });

  it("says each host's status in the words of lib/hosts.ts, with its date and what was done", () => {
    for (const h of HOSTS) {
      // the option in the form carries the status as a chip whose title is the full line
      expect(html).toContain(`title="${statusLine(h)}"`);
      const p = panel(h.id);
      expect(p).toContain(`${h.status === "tested" ? "Tested" : h.status === "documented" ? "Documented" : "Listed"} ${h.checked}: ${h.basis}`);
      if (h.status === "documented") expect(p).toContain("Not run yet.");
      else expect(p).not.toContain("Not run yet.");
    }
    // only what was run is called tested
    expect(count(html, 'title="tested ')).toBe(HOSTS.filter((h) => h.status === "tested").length);
  });

  it("says what is not switched on once, in the head, following the flags", () => {
    const head = html.slice(0, html.indexOf('id="setup"'));
    expect(count(html, "Not live yet")).toBe(site.connectorLive ? 0 : 1);
    expect(count(html, "Not released yet")).toBe(site.engineReleased ? 0 : 1);
    expect(count(head, "Not live yet")).toBe(site.connectorLive ? 0 : 1);
    expect(count(head, "Not released yet")).toBe(site.engineReleased ? 0 : 1);
    // while the connector is off, the head's own actions are the ones that work today
    expect(anchors(head, "/run").some((a) => a.includes("btn--primary"))).toBe(!site.connectorLive);
    // and the path that needs no connector is offered in both states
    expect(text(head)).toContain("No connector? Open any written playbook and copy its file into any AI chat.");
    // the engine is said to be what it is before it is said to be unreleased, and while it
    // is unreleased the head says that nothing refuses a step
    expect(text(head)).toContain(
      "It runs on your own machine: a command line and a local server that keep the firm's records, refuse any move a playbook does not allow, and never record a person's step under the agent's name.",
    );
    expect(text(head).includes("nothing here refuses a step")).toBe(!site.engineReleased);
  });

  it("says another way to do a step under that step, and never numbers it as the next one", () => {
    let alternatives = 0;
    for (const h of HOSTS) {
      const lines = h.steps(`${site.url}/api/mcp`);
      const steps = setupSteps(lines);
      // no numbered step opens with "Or": that would read as the thing to do next
      for (const s of steps) expect(s.text ?? "", h.id).not.toMatch(/^Or\s/);
      for (const s of steps) {
        if (s.alt === null) continue;
        alternatives += 1;
        expect(s.alt).toMatch(/^Or\s/);
        // it is on the page, in the panel of its own host, after that host's first own step
        const p = panel(h.id);
        expect(p, h.id).toContain(s.alt);
        expect(p.indexOf(s.alt)).toBeLessThan(p.indexOf("Check it worked"));
      }
      // nothing the host's lines say is lost: every word of them is still in its steps
      const said = steps.flatMap((s) => [s.text, s.code, s.alt]).filter((t): t is string => t !== null).join(" ");
      for (const word of lines.join(" ").split(/\s+/).filter(Boolean)) expect(said, `${h.id}: ${word}`).toContain(word);
    }
    // lib/hosts.ts has at least one today (Codex's IDE extension); the rule is not vacuous
    expect(alternatives).toBeGreaterThan(0);
  });

  it("numbers the steps plainly: no leading zero, no circle, no step skipped", () => {
    expect(html).not.toMatch(/rounded-full/);
    for (const h of HOSTS) {
      const from = html.indexOf(`data-host-panel="${h.id}"`);
      const next = html.indexOf("data-host-panel=", from + 20);
      const numbers = [...html.slice(from, next === -1 ? undefined : next).matchAll(/<span class="sr-only">Step <\/span>(\d+)<\/span>/g)].map((m) => m[1]);
      expect(numbers.length, h.id).toBeGreaterThanOrEqual(3);
      expect(numbers).toEqual(numbers.map((_, i) => String(i + 1)));
    }
  });

  it("draws the site plan as the page's one sheet, from the connector's own facts", () => {
    expect(count(html, 'class="sheet ')).toBe(1);
    expect(count(html, "tblock tblock--rows")).toBe(1);
    const plan = text(html.slice(html.indexOf('id="never"')));
    for (const words of ["Files never cross", "Parcel 1", "Parcel 2", "not to scale", "Your machine", "The hosted site"]) expect(plan).toContain(words);
    expect(plan).toContain(Object.keys(firmFileSpec().files).join(" · "));
    expect(plan).toContain(`${TOOLS.length} read-only tools`);
    expect(plan).toContain("The connector takes no firm file, and no tool accepts one.");
    expect(plan).toContain("What you show a chat app is handled under that app's own terms.");
    // every tool is named in the fold above it, which is labelled as the agent's
    for (const t of TOOLS) expect(html).toContain(`>${t.name}</code>`);
    expect(text(html)).toContain(`For your agent: the ${TOOLS.length} tools by name`);
  });

  it("draws nothing on the plan as a box, and claims only what is true of files", () => {
    const from = html.indexOf('id="never"');
    const sheet = html.slice(from);
    const drawing = sheet.slice(sheet.indexOf("sheet-grid"), sheet.indexOf('class="sheet-tb"'));
    // what stands on a parcel is a ruled row of a name and what it is: no frame, no fill of its own
    expect(count(drawing, "<dt")).toBe(5);
    for (const cls of [...drawing.matchAll(/class="([^"]*)"/g)].map((m) => m[1] ?? "")) {
      const words = cls.split(/\s+/);
      expect(words.includes("border") && !words.includes("border-0"), cls).toBe(false);
      expect(words.some((w) => /^bg-(raised|panel|tile|inset)$/.test(w)), cls).toBe(false);
    }
    // the key says no file crosses; it never says that nothing does (an agent's questions do)
    const key = text(sheet.slice(sheet.indexOf('class="sheet-tb"')));
    expect(key).toContain("No file crosses");
    expect(key).not.toMatch(/Crosses the line Nothing|Nothing\./);
  });
});

describe("the header", () => {
  const at = (pathname: string) => renderToStaticMarkup(createElement(PathnameContext.Provider, { value: pathname }, createElement(SiteHeader, {})));

  it("carries the five sections, search, the connect control and a menu that opens without scripts", () => {
    const html = at("/");
    for (const item of nav) expect(anchors(html, item.href).length, item.href).toBeGreaterThan(0);
    expect(anchors(html, "/search").some((a) => a.includes("data-search-open"))).toBe(true);
    expect(html).toContain('<details id="site-menu"');
    expect(html).not.toMatch(/backdrop-blur/);
    // every page of the footer is one step from the header
    for (const l of FOOTER_GROUPS.flatMap((g) => g.links)) if (l.href !== "/") expect(anchors(html, l.href).length, l.href).toBeGreaterThan(0);
    expect(body(html)).not.toContain('aria-current="page"');
  });

  it("outlines the connect control while the connector is off, and fills it when it is on", () => {
    const controls = anchors(at("/"), "/connect");
    expect(controls.length).toBeGreaterThan(0);
    for (const a of controls) {
      expect(a.includes("btn--primary")).toBe(site.connectorLive);
      expect(a.includes("btn--secondary")).toBe(!site.connectorLive);
    }
  });

  it("marks the page the reader is on, with a state that is not the agent's color", () => {
    const playbooks = at("/playbooks/file-form-d-and-state-notices");
    expect(anchors(playbooks, "/playbooks").every((a) => a.includes('aria-current="page"'))).toBe(true);
    expect(anchors(playbooks, "/situations").some((a) => a.includes('aria-current="page"'))).toBe(false);
    const connect = at("/connect");
    expect(anchors(connect, "/connect").every((a) => a.includes('aria-current="page"'))).toBe(true);
    // /run is not one of the five, so the menu holds it and marks it
    const run = at("/run");
    expect(anchors(run, "/run").length).toBeGreaterThan(0);
    expect(anchors(run, "/run").every((a) => a.includes('aria-current="page"'))).toBe(true);
    expect(count(body(run), 'aria-current="page"')).toBe(anchors(run, "/run").length);
    // the current rule is the drafting blue
    expect(playbooks).toMatch(/\.sh-link\[aria-current="page"\]::after\{[^}]*var\(--accent-strong\)/);
    expect(playbooks).not.toMatch(/sh-[a-z-]+\[aria-current[^{]*\{[^}]*var\(--agent/);
  });

  it("marks a current control in the bar with the same rule a section's link carries, not with a border's hue", () => {
    const connect = at("/connect");
    // the bar's Search and Connect controls take the header's own mark
    const bar = (html: string, href: string) => anchors(html, href).filter((a) => /class="[^"]*\bsh-ctl\b/.test(a));
    expect(bar(connect, "/connect")).toHaveLength(1);
    expect(bar(connect, "/connect")[0]).toContain('aria-current="page"');
    expect(bar(at("/search"), "/search")).toHaveLength(1);
    expect(bar(at("/search"), "/search")[0]).toContain('aria-current="page"');
    expect(connect).toMatch(/\.sh-ctl\[aria-current="page"\]::after\{[^}]*height:2px;background:var\(--accent-strong\)/);
    // and keep their own outline: no rule here turns a control's border the accent color
    for (const rule of [...connect.matchAll(/\.sh-(?:ctl|cta)[^{]*\[aria-current="page"\][^{]*\{([^}]*)\}/g)].map((m) => m[1] ?? "")) {
      expect(rule).not.toMatch(/border-color:var\(--accent/);
    }
    // the control's name is the same at every width, whatever words fit
    for (const a of bar(connect, "/connect")) expect(a).toContain('aria-label="Connect your agent"');
  });

  it("puts a record that lives under another section's path in its own section", () => {
    const sectionOf = { "/playbooks/example-situation": "/situations" };
    const html = renderToStaticMarkup(createElement(PathnameContext.Provider, { value: "/playbooks/example-situation" }, createElement(SiteHeader, { sectionOf })));
    expect(anchors(html, "/situations").every((a) => a.includes('aria-current="page"'))).toBe(true);
    expect(anchors(html, "/playbooks").some((a) => a.includes('aria-current="page"'))).toBe(false);
  });
});

describe("the status line and the footer", () => {
  const facts = siteFacts(getCorpus());
  const status = renderToStaticMarkup(createElement(StatusLine, { facts, computedOn: "2026-01-02" }));
  const footer = renderToStaticMarkup(createElement(SiteFooter));

  it("says the catalog's one sentence with figures in the reading face", () => {
    const said = text(status);
    expect(said).toContain(facts.catalog.line);
    expect(said).toContain(facts.coverage.label);
    expect(status).toMatch(/<time datetime="2026-01-02">2026-01-02<\/time>/i);
    const view = facts.share.syndication;
    if (view.pct !== null) {
      expect(said).toContain(`An agent can do ${view.pct}% of the ${view.total} written steps`);
      expect(anchors(status, "/playbooks#where-it-stands")).toHaveLength(1);
    }
    // one face: no figure is switched to the mono face inside the sentence
    expect(status).not.toMatch(/font-mono|type-data|type-code/);
    // it never states availability: each page says that once, in its own head
    expect(said).not.toMatch(/not live|live yet|released/i);
  });

  it("is not said a second time on the page that holds the ledger: the region goes, heading and all", () => {
    expect(status).toMatch(/body:has\(#where-it-stands\) \.status-line\{display:none\}/);
    // the hidden thing is the labelled region itself, so its heading leaves with the row
    const region = /<section\b[^>]*class="status-line"[^>]*>[\s\S]*<\/section>/.exec(status)?.[0] ?? "";
    expect(region).toContain('aria-labelledby="status-line-h"');
    expect(region).toContain('id="status-line-h"');
    expect(text(region)).toContain(facts.catalog.line);
  });

  it("lists every page in the footer, with the site's one line about itself and the licenses as a sentence", () => {
    // once each; the home page twice, since the wordmark leads there too
    for (const l of FOOTER_GROUPS.flatMap((g) => g.links)) expect(anchors(footer, l.href).length, l.href).toBe(l.href === "/" ? 2 : 1);
    const said = text(footer);
    expect(said).toContain("Not legal advice. Every step says where it comes from.");
    expect(said).toContain(`Code ${site.codeLicense}.`);
    expect(said).toContain(`Content ${site.contentLicense}.`);
    expect(footer).not.toMatch(/font-mono|type-data|type-code/);
  });

  it("is one navigation region, each group a list named by its label, with the way home first in its group", () => {
    expect(count(footer, "<nav")).toBe(1);
    expect(footer).toContain('<nav aria-label="Site"');
    FOOTER_GROUPS.forEach((g, i) => {
      expect(footer).toContain(`<p id="site-foot-${i}"`);
      expect(footer).toContain(`<ul aria-labelledby="site-foot-${i}"`);
      expect(text(footer)).toContain(g.label);
    });
    const home = FOOTER_GROUPS.find((g) => g.links.some((l) => l.href === "/"));
    expect(home?.links[0]?.href).toBe("/");
  });
});

describe("the not-found page", () => {
  const html = renderToStaticMarkup(createElement(NotFound));

  it("says what happened and offers three ways on, one of them filled", () => {
    expect(text(html)).toContain("Page not found.");
    expect(text(html)).toContain("That address is not on this site.");
    const ways = [...html.matchAll(/<a\b[^>]*class="btn [^>]*>/g)].map((m) => m[0]);
    expect(ways).toHaveLength(3);
    expect(ways.filter((a) => a.includes("btn--primary"))).toHaveLength(1);
    expect(ways.map((a) => /href="([^"]*)"/.exec(a)?.[1])).toEqual(["/search", "/playbooks", "/"]);
    // search opens with the words of the address that was asked for
    expect(ways[0]).toContain('data-search-open="path"');
  });
});
