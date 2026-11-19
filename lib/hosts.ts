// The agent hosts PromptedCRE names, and what each claim rests on. The home page
// strip, /connect and /install all render from this list, so they cannot drift.
//
// A host is "tested" only after a playbook has been run through it end to end.
// "documented" means its steps were checked against the vendor's own
// documentation on the date shown and have not been run yet. "unchecked" means it is
// listed at the owner's word (D218, amending decision 42) and neither run nor checked:
// /connect and /install say "not checked yet" and point to the host's own help.

export type HostStatus = "tested" | "documented" | "unchecked";

// Who adds the connector, which sets the order of work. "agent": the agent reads the
// install page from the paste-in sentence and adds the connector itself, so the
// sentence comes first; only a tested host leads with the sentence (a test holds it).
// "settings": a person adds a custom connector in the app's settings first, and the
// sentence is pasted after. "chat": a person asks the agent, in a chat, to create the
// connector first, the host's own way (D228), and the sentence is pasted after.
export type HostAdds = "agent" | "settings" | "chat";

export type Host = {
  id: string;
  name: string;
  detail?: string; // which surfaces of the product, when it has several
  status: HostStatus;
  checked: string; // the date the status was earned
  basis: string; // what was actually done on that date
  adds: HostAdds;
  // How the connector is added, as lines wrapped for the plain-text /install page.
  steps: (mcpUrl: string) => string[];
  // Notes for whoever sets it up (plans, scopes, what will not work), wrapped the same way.
  setup: (mcpUrl: string) => string[];
};

export const HOSTS: readonly Host[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    status: "tested",
    checked: "2026-11-12",
    basis: "A full playbook was run through it against a local server.",
    adds: "agent",
    steps: (mcp) => [`claude mcp add --transport http promptedcre ${mcp}`],
    setup: () => ["Add --scope user to use it in every project."],
  },
  {
    id: "claude",
    name: "Claude",
    detail: "web and desktop",
    status: "documented",
    checked: "2026-11-12",
    basis: "Steps checked against Anthropic's documentation.",
    adds: "settings",
    steps: () => [
      "Customize > Connectors > Add > Add custom connector. Name it PromptedCRE,",
      'paste the URL above and choose "No sign in" for authentication.',
    ],
    setup: () => [
      "Team and Enterprise: an owner adds it under Organization settings >",
      "Connectors, then each member connects. The server must be reachable from the",
      "internet; a local address will not work here.",
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    status: "documented",
    checked: "2026-11-12",
    basis: "Steps checked against OpenAI's documentation.",
    adds: "settings",
    steps: () => [
      "At chatgpt.com/plugins, choose the plus button, then Add custom MCP server.",
      "Enter the URL above, set authentication to No authentication, create it and",
      "install it before use.",
    ],
    setup: () => ["Which plans allow this changes; check OpenAI's help center. Every tool", "here is marked read-only."],
  },
  {
    id: "codex",
    name: "Codex",
    detail: "the CLI, IDE extension and app share one config",
    status: "documented",
    checked: "2026-11-12",
    basis: "Steps checked against OpenAI's documentation.",
    adds: "settings",
    steps: (mcp) => [
      "In ~/.codex/config.toml:",
      "  [mcp_servers.promptedcre]",
      `  url = "${mcp}"`,
      "Or in the IDE extension: MCP servers > Add server > Streamable HTTP, then",
      "the URL.",
    ],
    setup: () => [
      "Codex's docs do not yet show a no-sign-in example; if it asks you",
      "to sign in, run `codex mcp --help` for the current options.",
    ],
  },
  {
    id: "grok",
    name: "Grok",
    status: "documented",
    checked: "2026-11-17",
    basis: "Steps checked against Grok's own documentation (docs.x.ai, updated 2026-10-10).",
    adds: "settings",
    steps: () => [
      "At grok.com/connectors, choose New Connector, then Custom. Enter the URL",
      "above; this connector needs no sign-in.",
    ],
    setup: () => [
      "Grok Business and Enterprise: a team admin provisions the connector in the",
      "cloud console before members can use it. The server must be reachable from",
      "the internet; a local address will not work here.",
    ],
  },
  {
    id: "muse",
    name: "Muse",
    detail: "Meta's personal agent",
    status: "documented",
    checked: "2026-11-17",
    basis: "Steps checked against Meta's Muse Help Center (How Muse works with Connectors).",
    adds: "chat",
    steps: (mcp) => [
      "In a chat, ask Muse to create a custom connector for PromptedCRE at",
      `${mcp}, and approve it when it asks.`,
    ],
    setup: () => [
      "Meta's help describes custom connectors without naming MCP, so whether Muse",
      "reaches this connector is not confirmed until someone runs it. Meta does not",
      "review custom connectors.",
    ],
  },
];

export const STATUS_LABEL: Record<HostStatus, string> = {
  tested: "tested",
  documented: "documented",
  unchecked: "not checked yet",
};

// One line for a status, as /install and the home page print it.
export function statusLine(h: Host): string {
  if (h.status === "tested") return `tested ${h.checked}`;
  if (h.status === "documented") return `documented ${h.checked}, not run yet`;
  return `listed ${h.checked}, not checked yet`;
}

// One line for who adds the connector, as /install prints it.
export function addsLine(h: Host): string {
  if (h.adds === "agent") return "Added by: the agent, with the steps below, after the person pastes the sentence.";
  if (h.adds === "chat") return "Added by: a person, by asking the agent in a chat, before the sentence is pasted.";
  return "Added by: a person, in the app's settings, before the sentence is pasted.";
}
