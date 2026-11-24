import { site } from "@/lib/site";

// The three plans and every word a visitor reads about them (decisions 120 to 130), written
// once. The plans page, the home page's cost answer, /connect's line, the footer, the search
// box's quick links, /llms.txt and the tests all read them from here. Free is what is live;
// Pro and Enterprise are coming, with no prices and, for now, no waitlist (decision 127).
//
// The ideas on the paid cards come from a post the owner shared, said in our own words
// (decision 124): the post, its author and the products it lists are never named.

export type PlanId = "free" | "pro" | "enterprise";

// One line of a card's list. `logo` is a company's own mark (D218), drawn beside its name:
// in the line's title when the title says the name, beside the title when it does not.
export type PlanItem = {
  name: string;
  text: string;
  logo?: { id: string; name: string; inTitle: boolean };
  link?: { text: string; href: string };
};

export type Plan = {
  id: PlanId;
  name: string;
  live: boolean;
  chip: string;
  who: string;
  promise: string;
  listTitle: string;
  items: PlanItem[];
};

// What the Free card counts: the catalog at build (lib/compute/site-facts.ts) and the
// connector's own tool list. No figure on the card is typed.
export type FreeCounts = { written: number; rules: number; calculators: number; tools: number };

export const PLANS_LABEL = "Plans";
export const SETUP_LABEL = "Set up your agent";

export const PLANS_PAGE = {
  title: "Three plans. One is live today.",
  lede: "Free gives you and your agent everything on this site, with no account. Pro and Enterprise are coming for firms that want more.",
  tabTitle: PLANS_LABEL,
} as const;

// Under the three cards (decision 126).
export const MONEY_LINE = `Paid plans are paid for by the firms that use them. No vendor pays ${site.name}, ever.`;

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

const FIRMS = "For full-service and vertically integrated firms.";

export function freePlan(c: FreeCounts, s: LiveState = site): Plan {
  const items: PlanItem[] = [
    {
      name: "The site",
      text: `${c.written} playbooks, scenarios and audits, with ${c.rules} rule cards and ${c.calculators} calculators. Every step says who does it and where it comes from.`,
      link: { text: "Browse the playbooks", href: "/playbooks" },
    },
  ];
  if (s.connectorLive)
    items.push({
      name: "The MCP connector",
      logo: { id: "mcp", name: "MCP", inTitle: true },
      text: `The link your agent adds to reach ${site.name}: ${c.tools} read-only tools to search, read and calculate. No account.`,
      link: { text: "See the tools", href: "/connect#tools" },
    });
  // The repository's own licenses are open for the code and the playbooks; its rankings data is
  // under a draft data license and its company marks are their owners' (README, License).
  if (s.repoUrl !== null)
    items.push({
      name: "The repository",
      logo: { id: "github", name: "GitHub", inTitle: false },
      text: s.engineReleased
        ? "The engine that keeps your firm's records on your own machine, and the code and playbooks under open licenses."
        : "The code and playbooks, under open licenses.",
      link: { text: "Open the repository", href: s.repoUrl },
    });
  return {
    id: "free",
    name: "Free",
    live: true,
    chip: "Live",
    who: "For real estate operators.",
    promise: "Everything on this site, for you and your agent.",
    listTitle: "Included today",
    items,
  };
}

// The Free card's button: on to the setup steps, which stay as they are (decision 121).
export const FREE_ACTION = { text: SETUP_LABEL, href: "/connect" } as const;

export const PRO: Plan = {
  id: "pro",
  name: "Pro",
  live: false,
  chip: "Coming soon",
  who: FIRMS,
  promise: "Everything in Free, plus the Desk: live data and working tools your firm connects itself.",
  listTitle: "Planned",
  items: [
    {
      name: "Live market data",
      text: "Rates and the SOFR curve, demographics, jobs and permits, from public primary sources such as the Fed, Census and BLS. Each figure with its source and date.",
    },
    { name: "CRE models as skills", text: "Practitioner-written models your agent runs, one job each." },
    { name: "Property lookups", text: "Owner of record, parcel and utility provider for an address." },
    { name: "Links to your firm's tools", text: "Your CRM, email and accounting stay where they are. Your agent reads them through the Desk." },
    { name: "In the AI app you use", text: "Your team works with its agents in the AI app it already uses. Nothing new to learn." },
    { name: "Self-serve", text: "Sign up and connect it yourself." },
  ],
};

export const ENTERPRISE: Plan = {
  id: "enterprise",
  name: "Enterprise",
  live: false,
  chip: "Coming soon",
  who: FIRMS,
  promise: "Everything in Pro, plus your firm's own skills, workflows, company brain and agent harness, built with you.",
  listTitle: "Planned",
  items: [
    {
      name: "Custom skills and workflows",
      text: "Your standards and processes, written as skills and playbooks your agents follow. Every step says who does it: an agent or a person.",
    },
    { name: "Skills that improve", text: "An agent can propose a change to a skill, and a person approves it before it takes effect." },
    {
      name: "Company brain",
      text: "Your firm's memory, in plain files: its deals and properties, its relationships, its standards and each person's own notes. Every night an agent reviews the day's work and updates the brain. Nothing is overwritten: the full log stays.",
    },
    { name: "Access by role", text: "Each person and each agent sees only what their role allows." },
    {
      name: "Agent harness",
      text: "Your own agents, one job each: for example acquisitions, asset management, investor relations and accounting. Each has its own skills and its own limits, and every step it takes is on the record.",
    },
    { name: "Approvals inbox", text: "Every step that needs a person, from all your agents' work, in one list." },
    {
      name: "Views on request",
      text: "Your agents build a pipeline view, an investor report or a review screen from the brain, and change it when you ask.",
    },
    {
      name: "Runs where you choose",
      text: `On your machines, in your own cloud account, or in a private space ${site.name} hosts for your firm alone.`,
    },
    { name: "Built with you", text: `${site.name} builds it with your team. What is built is yours to keep and change.` },
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
