// The connect pieces: the whole setup flow (doors, host tiles, each host's numbered steps),
// the paste-in prompt, the connector and engine status, plus the /connect page's tool list
// and site plan. ToolList and SitePlan read lib/mcp (which touches the file system), so this
// barrel is for server components. A client component imports what it needs from the file
// itself (copy-button.tsx, radio-sync.tsx).
export { ConnectSetup } from "./connect-setup";
export { NotLiveChip, SiteStatus } from "./connector-status";
export { CopyButton } from "./copy-button";
export { doorNotes } from "./door-notes";
export { hostCounts, monogramFor } from "./host-steps";
export { MonoWithUrls, PromptCard } from "./prompt-card";
export { SitePlan } from "./site-plan";
export { TermsList } from "./terms-list";
export { ToolList } from "./tool-list";
