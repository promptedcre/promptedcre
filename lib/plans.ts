import { site } from "@/lib/site";

// The three plans and every word a visitor reads about them (decisions 120 to 130, and 134 to
// 138 for the simpler cards), written once. The plans page, the home page's cost answer,
// /connect's line, the footer, the search box's quick links, /llms.txt and the tests all read
// them from here. Free is what is live; Pro and Enterprise are coming, with no prices and, for
// now, no waitlist (decision 127).
//
// The ideas on the paid cards come from a post the owner shared, said in our own words
// (decision 124): the post, its author and the products it lists are never named.

export type PlanId = "free" | "pro" | "enterprise";

// One line of a card's list: its name alone, with no line under it (decision 134). `logo` is
// a company's own mark (D218), drawn beside a name that says the company; `href` makes the
// name a link to its page (decision 138).
export type PlanItem = {
  name: string;
  logo?: { id: string; name: string };
  href?: string;
};

export type Plan = {
  id: PlanId;
  name: string;
  live: boolean;
  chip: string;
  promise: string;
  // The list's name for screen readers. It is not drawn: the chip already says it (decision 134).
  listTitle: string;
  items: PlanItem[];
};

// What the Free card counts: the catalog at build (lib/compute/site-facts.ts) and the
// connector's own tool list. No figure on the card is typed.
export type FreeCounts = { written: number; rules: number; calculators: number; tools: number };

// The page's tab title, and its one h1, which only screen readers hear: the page draws no
// title, no line under it and no line under the cards (decision 135).
export const PLANS_LABEL = "Plans";
export const SETUP_LABEL = "Set up your agent";

// What is live follows the two flags in lib/site.ts, as every statement of state on the site
// does (docs/DESIGN.md, section 8). Both are on since 2026-11-19 (D246), so the approved words
// print; with a flag off, what it covers is left out rather than claimed.
export type LiveState = { connectorLive: boolean; engineReleased: boolean; repoUrl: string | null };

// "a", "a and b", "a, b and c".
function andList(parts: ReadonlyArray<string | false | null>): string {
  const words = parts.filter((p): p is string => typeof p === "string");
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}
const freeParts = (s: LiveState) => andList(["the site", s.connectorLive && "the MCP connector", s.repoUrl !== null && "the repository"]);

/** The plans page's description, in search results and link previews. */
export const plansDescription = (s: LiveState = site) =>
  `${site.name}'s three plans. Free is live today: ${freeParts(s)}, with no account. Pro and Enterprise are coming for full-service firms.`;

// Free's lines carry its counts in their names (decision 138). The rule cards and the
// calculators share a line and have no one page between them, so theirs is the name without a
// link. The repository holds the engine once it is released (D238); the card says nothing of
// its licenses, so D276's care about which parts are open has nothing left to qualify here.
export function freePlan(c: FreeCounts, s: LiveState = site): Plan {
  const items: PlanItem[] = [
    { name: `${c.written} playbooks, scenarios and audits`, href: "/playbooks" },
    { name: `${c.rules} rule cards and ${c.calculators} calculators` },
  ];
  if (s.connectorLive) items.push({ name: `MCP connector: ${c.tools} read-only tools`, logo: { id: "mcp", name: "MCP" }, href: "/connect#tools" });
  if (s.repoUrl !== null)
    items.push({
      name: s.engineReleased ? "The engine and code on GitHub" : "The code and playbooks on GitHub",
      logo: { id: "github", name: "GitHub" },
      href: s.repoUrl,
    });
  return {
    id: "free",
    name: "Free",
    live: true,
    chip: "Live",
    promise: "Everything on this site, for you and your agent.",
    listTitle: "Included today",
    items,
  };
}

// The Free card's button: on to the setup steps, which stay as they are (decision 121).
export const FREE_ACTION = { text: SETUP_LABEL, href: "/connect" } as const;

// Pro (decisions 122 and 136): the owner's new line first, the two it covers folded into it,
// and no lines about how Pro works. Pro is still self-serve; the card no longer says so.
export const PRO: Plan = {
  id: "pro",
  name: "Pro",
  live: false,
  chip: "Coming soon",
  promise: "Everything in Free, plus the Desk: live data and your firm's tools.",
  listTitle: "Planned",
  items: [{ name: `Connector and skill repository, updated weekly by the ${site.name} team` }, { name: "Live market data" }, { name: "Property lookups" }],
};

// Enterprise (decisions 123 and 137): six lines.
export const ENTERPRISE: Plan = {
  id: "enterprise",
  name: "Enterprise",
  live: false,
  chip: "Coming soon",
  promise: "Everything in Pro, built with your firm.",
  listTitle: "Planned",
  items: [
    { name: "Custom skills and workflows" },
    { name: "Company brain" },
    { name: "Agent harness" },
    { name: "Approvals inbox" },
    { name: "Access by role" },
    { name: "Runs where you choose" },
  ],
};

// The plans as other pages say them (decisions 129 and 130). What is free follows the flags.
export function costAnswer(s: LiveState = site): { text: string; link: string } {
  const free = andList(["the playbooks", s.connectorLive && "the connector", s.engineReleased && "the engine"]);
  return {
    text: `${free.charAt(0).toUpperCase()}${free.slice(1)} are free, with no account. Pro and Enterprise plans for firms are coming.`,
    link: "See the plans",
  };
}
export const CONNECT_LINE = { text: "This is the Free plan.", link: "See all three plans" } as const;
export const QUICK_LINK_NOTE = "Free today. Pro and Enterprise are coming";
export const llmsNote = (s: LiveState = site) =>
  `Free is live today (${freeParts(s)}, with no account). Pro and Enterprise are coming soon for firms`;
