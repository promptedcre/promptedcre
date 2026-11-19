import type { ReactNode } from "react";
import { Disclosure, cx } from "@/components/ui";
import { HOSTS, type Host } from "@/lib/hosts";
import { site } from "@/lib/site";
import type { DoorId } from "./door-notes";
import { DoorOptions, DoorPrompts, doorRules } from "./doors";
import { ConnectorAddress, HOST_COLS, HostOptions, HostStepRows, StatusKey, StepRow, StepText, hostPanelRules } from "./host-picker";
import { mcpUrlFor, setupSteps } from "./host-steps";
import { RadioSync } from "./radio-sync";

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

// The setup's own rules (prefix cn-), in the components layer so a utility on the same
// element still wins. Only what utilities cannot say:
//   - .cn-opts: a row of options with one 2 px rule that marks the chosen one and slides to
//     it when the choice changes (docs/MOTION.md, M6: a switch's rule slides). The rule's
//     place is two numbers, a column and a row, set by which option holds the checked radio;
//     the hosts are two columns on a phone and one row from 1024 px.
//   - .cn-copy: the slot a Copy button arrives in. It has no height until scripts are known
//     to be on, then holds the button's height, so nothing moves when the button renders.
// A browser without :has() shows the first option's rule and every panel: still complete.
function setupRules(rootId: string, doorName: string, hostName: string): string {
  const n = HOSTS.length;
  // From 1024 px the hosts stand in rows of HOST_COLS (D218 made them six); two a row on a phone.
  const wideCols = Math.min(n, HOST_COLS);
  const at = (k: number, col: number, row: number) => `.cn-opts--hosts:has(.cn-opt:nth-child(${k}) input:checked){--col:${col};--row:${row}}`;
  const phone = HOSTS.map((_, i) => at(i + 1, i % 2, Math.floor(i / 2))).join("\n");
  const wide = HOSTS.map((_, i) => at(i + 1, i % wideCols, Math.floor(i / wideCols))).join("\n");
  return `@layer components {
${doorRules(rootId, doorName)}
${hostPanelRules(rootId, hostName)}
.cn-opts{--cols:2;--rows:1;--col:0;--row:0;position:relative;display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));grid-auto-rows:1fr;min-width:0}
.cn-opts::after{content:"";position:absolute;left:0;bottom:calc((var(--rows) - 1 - var(--row))*100%/var(--rows));width:calc(100%/var(--cols));height:2px;background:var(--accent-strong);translate:calc(var(--col)*100%) 0;transition:translate var(--dur-2) var(--ease-out),bottom var(--dur-2) var(--ease-out);pointer-events:none}
.cn-opts:has(.cn-opt:nth-child(2) input:checked){--col:1}
@media (hover:hover){.cn-opt:not(:has(input:checked)):hover{box-shadow:inset 0 -2px 0 var(--line-bold)}}
.cn-opts--hosts{--rows:${Math.ceil(n / 2)}}
${phone}
@media (min-width:1024px){
.cn-opts--hosts{--cols:${wideCols};--rows:${Math.ceil(n / wideCols)}}
${wide}
}
.cn-copy{display:none}
html.js .cn-copy{display:flex;min-height:2.75rem}
@media (min-width:768px){
html.js .cn-copy{min-height:2.5rem}
html.js .cn-copy--sm{min-height:2rem}
}
@media print{html.js .cn-copy{display:none}}
}`;
}

// The chosen agent's steps, numbered, in the order that host really works (Host.adds in
// lib/hosts.ts). Where the agent adds the connector itself, the paste-in sentence comes
// first and the command it runs second. Where a person adds a custom connector in the
// app's settings, or asks the agent in a chat to create it, that comes first and the
// sentence second. Every host ends with how to
// tell it worked, and keeps its setup notes (for whoever wires it up) in one closed fold.
// From 1024 px the panel is two columns: what the claim rests on, then the steps.
function SetupPanel({
  host,
  mcpUrl,
  toolCount,
  answer,
  headingLevel,
}: {
  host: Host;
  mcpUrl: string;
  toolCount: number;
  answer: string;
  headingLevel: 2 | 3;
}) {
  const H = `h${headingLevel}` as const;
  const id = safe(host.id);
  const tested = host.status === "tested";
  const byAgent = host.adds === "agent";
  // A step that is only a command reads, on the agent's own path, as the command the agent runs.
  const steps = setupSteps(host.steps(mcpUrl)).map((s) =>
    byAgent && s.text === null && s.codeKind === "command"
      ? { ...s, text: `${host.name} adds the connector with this command. Approve it when it asks, or run it yourself in a terminal.` }
      : s,
  );
  const notes = setupSteps(host.setup(mcpUrl)).flatMap((s) => [s.text, s.alt].filter((t): t is string => t !== null));

  // On paper too: a printed copy of the steps keeps the sentence (the form above it does not print).
  const paste = (n: number) => (
    <StepRow n={n}>
      <p className="type-body m-0 text-text">{byAgent ? `Paste this into ${host.name}.` : `Then paste this into ${host.name}.`}</p>
      <DoorPrompts idPrefix={`${id}-prompt`} primary={site.connectorLive} />
      <p className="type-body-s m-0 text-muted">
        {byAgent
          ? steps[0]?.codeKind === "command"
            ? `${host.name} reads the install page, which gives it the command in the next step.`
            : `${host.name} reads the install page, which tells it how to add the connector in the next step.`
          : `It tells ${host.name} what you want; the connector gives it the playbooks.`}
      </p>
    </StepRow>
  );
  // Step 1 is the sentence (the agent adds it) or the address (a person adds it in
  // settings); the host's own steps follow from 2; a person's path pastes after them.
  const pasteAt = byAgent ? 1 : 2 + steps.length;
  const checkAt = 2 + steps.length + (byAgent ? 0 : 1);

  return (
    <div
      data-host-panel={host.id}
      role="group"
      aria-label={`Steps for ${host.name}`}
      className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
    >
      {/* What the claim rests on stays in view beside the steps while they scroll. */}
      <div className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
        <H className="type-title-l m-0 text-text">In {host.name}</H>
        <p className="type-body-s m-0 mt-3 max-w-md text-muted">
          {tested ? "Tested" : host.status === "documented" ? "Documented" : "Listed"} <time dateTime={host.checked}>{host.checked}</time>: {host.basis}
          {host.status === "documented" && " Not run yet."}
        </p>
      </div>

      <div className="min-w-0">
        <ol role="list" className="m-0 list-none border-t border-line-strong p-0">
          {byAgent ? (
            paste(pasteAt)
          ) : (
            <StepRow n={1}>
              <p className="type-body m-0 text-text">
                {host.adds === "chat" ? (
                  <>First, have {host.name} add the connector. Copy its address.</>
                ) : (
                  <>First, add the connector in {host.name}&rsquo;s settings. Copy its address.</>
                )}
              </p>
              <ConnectorAddress mcpUrl={mcpUrl} id={`${id}-address`} />
            </StepRow>
          )}
          <HostStepRows steps={steps} hostId={id} start={2} />
          {!byAgent && paste(pasteAt)}
          <StepRow n={checkAt}>
            <p className="type-body m-0 text-text">
              Check it worked: ask &ldquo;What does {site.name} cover?&rdquo; A connected agent answers with the catalog&rsquo;s own figures:{" "}
              {answer.split(/(\d{4}-\d{2}-\d{2})/).map((part, i) =>
                i % 2 === 1 ? (
                  <span key={i} className="whitespace-nowrap">
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
              . If it answers from memory, or says it cannot reach {site.name}, the connector is not added yet.
            </p>
          </StepRow>
        </ol>

        {/* The fold says what is in it. These notes are a person's to act on (a plan, a scope, an
            owner's setting), so they are not labelled "For your agent"; the tools by name are. */}
        <Disclosure summary={`Setup notes for ${host.name}`} className="border-b border-line" summaryClassName="type-body-s" bodyClassName="flex flex-col gap-4 pb-6 pt-1">
          {byAgent && <ConnectorAddress mcpUrl={mcpUrl} id={`${id}-address`} />}
          <ul className="type-body-s m-0 flex list-disc flex-col gap-2 pl-5 text-muted marker:text-faint">
            <li>
              The connector is a remote MCP server over streamable HTTP, with no sign-in. It has {toolCount} read-only tools; none can change
              anything.
            </li>
            {notes.map((t) => (
              <li key={t}>
                <StepText text={t} />
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </div>
  );
}

// One row of the setup form: its name in the form's label column, then its options. A
// fieldset with a legend for whoever cannot see the layout; the visible name is the same
// words, set once.
function FormRow({ label, legend, children, className }: { label: string; legend: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("m-0 grid min-w-0 border-0 p-0 lg:grid-cols-[10rem_minmax(0,1fr)]", className)}>
      <legend className="sr-only">{legend}</legend>
      <p aria-hidden="true" className="type-label m-0 border-b border-line px-4 py-3 text-faint md:px-6 lg:border-b-0 lg:border-r lg:py-5">
        {label}
      </p>
      {children}
    </fieldset>
  );
}

// ConnectSetup: the whole "give your agent the playbooks" flow, complete with scripts off.
// One form block, the page's only bordered block here: what you want (the two doors from
// lib/site.ts) and your agent (the hosts from lib/hosts.ts, each with the status it has
// earned). Under it, on plain ground, the chosen agent's numbered steps in the order that
// host works (see SetupPanel). Both choices are hidden radios and :has() rules scoped to
// `rootId` (this component's own root). With scripts on, ?mode=audit picks the audit door
// and #codex picks Codex. Use it once per page: the host options carry the hosts' ids as
// anchors.
export function ConnectSetup({
  rootId,
  notes,
  toolCount,
  answer,
  mcpUrl = mcpUrlFor(site.url),
  hostName = "host",
  doorName = "door",
  headingLevel = 3,
  className,
}: {
  rootId: string;
  notes?: Partial<Record<DoorId, ReactNode>>; // the line under each door's name (see doorNotes)
  toolCount: number; // TOOLS.length, passed in so this stays free of lib/mcp
  // What a connected agent's answer holds, computed from the status tool's payload:
  // "95 records listed, 19 written in full, Federal + Texas, content dated 2026-11-12".
  answer: string;
  mcpUrl?: string;
  hostName?: string;
  doorName?: string;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  return (
    <div id={rootId} className={cx("min-w-0", className)}>
      <style href={`connect-setup-${safe(rootId)}`} precedence="default">
        {setupRules(rootId, doorName, hostName)}
      </style>
      <RadioSync name={hostName} via="hash" />
      <div className="overflow-clip rounded-box border border-line-strong bg-raised print:hidden">
        <FormRow label="What you want" legend="Choose what you want">
          <DoorOptions name={doorName} notes={notes} />
        </FormRow>
        <FormRow label="Your agent" legend="Choose your agent" className="border-t border-line-strong">
          <HostOptions name={hostName} />
        </FormRow>
      </div>
      <StatusKey className="mt-4 print:hidden" />
      <div className="mt-12 md:mt-16">
        {HOSTS.map((h) => (
          <SetupPanel key={h.id} host={h} mcpUrl={mcpUrl} toolCount={toolCount} answer={answer} headingLevel={headingLevel} />
        ))}
      </div>
    </div>
  );
}
