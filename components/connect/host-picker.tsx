import type { ReactNode } from "react";
import { Tag } from "@/components/chips";
import { Logo, cx } from "@/components/ui";
import { HOSTS, STATUS_LABEL, statusLine, type Host } from "@/lib/hosts";
import { CopyButton } from "./copy-button";
import { OPTION } from "./doors";
import type { SetupStep } from "./host-steps";

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

// Code-like pieces inside a step's sentence: `backticked`, --flags, ~/paths and bare
// domain paths. They are set in the mono face; the words are untouched.
const CODE_PIECE = /(`[^`]+`|--[a-z][\w-]*|~\/[\w./-]*\w|\b[a-z0-9-]+\.(?:com|ai|org|io)\/[\w/-]*\w)/;

export function StepText({ text }: { text: string }) {
  const parts = text.split(CODE_PIECE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="type-code whitespace-nowrap text-text">
            {p.replace(/^`|`$/g, "")}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}

// HostStatus: how far a host's claim goes, in lib/hosts.ts's own words. Tested is a solid
// chip with the agent's square (an agent ran a playbook through it); documented is the
// dashed chip the site uses for "not yet" (its steps were read, not run); not checked yet is
// the same dashed chip in the person's amber (listed at the owner's word, D218).
export function HostStatus({ host }: { host: Host }) {
  if (host.status === "tested")
    return (
      <Tag tone="agent" dot title={statusLine(host)}>
        {STATUS_LABEL.tested}
      </Tag>
    );
  if (host.status === "documented")
    return (
      <Tag dashed title={statusLine(host)}>
        {STATUS_LABEL.documented}
      </Tag>
    );
  return (
    <Tag tone="human" dashed title={statusLine(host)}>
      {STATUS_LABEL.unchecked}
    </Tag>
  );
}

// A command or config never wraps: a wrapped address invites a copy error. A line wider
// than its well scrolls sideways inside the well, and the page itself never does. The well is
// a step down in the paper, never a box; its Copy button sits under it.
function CodeWell({ code, kind, id }: { code: string; kind: "command" | "config"; id: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <pre id={id} tabIndex={0} className="type-code m-0 min-w-0 overflow-x-auto whitespace-pre rounded-control bg-inset p-4 text-text [scrollbar-color:var(--line-bold)_var(--bg-inset)]">
        <code>{code}</code>
      </pre>
      <div className="cn-copy cn-copy--sm">
        <CopyButton text={code} label={kind === "command" ? "Copy the command" : "Copy the config lines"} selectId={id}>
          {kind === "command" ? "Copy the command" : "Copy the config lines"}
        </CopyButton>
      </div>
    </div>
  );
}

// StepRow: one numbered step of a sequence: a plain numeral, then the step's content. The
// row carries its own padding and the rule under it.
export function StepRow({ n, children, className }: { n: number; children: ReactNode; className?: string }) {
  return (
    <li className={cx("grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 border-b border-line py-6 md:grid-cols-[2.5rem_minmax(0,1fr)]", className)}>
      <span className="type-data pt-1 text-faint">
        <span className="sr-only">Step </span>
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </li>
  );
}

// HostStepRows: a host's setup steps from lib/hosts.ts, numbered from `start`. Another way to
// do a step ("Or in the IDE extension ...") is said quietly under that step: it is not the
// next thing to do, so it takes no number.
export function HostStepRows({ steps, hostId, start = 1 }: { steps: SetupStep[]; hostId: string; start?: number }) {
  return (
    <>
      {steps.map((s, i) => (
        <StepRow key={i} n={start + i}>
          {s.text && (
            <p className="type-body m-0 text-text">
              <StepText text={s.text} />
            </p>
          )}
          {s.code && s.codeKind && <CodeWell code={s.code} kind={s.codeKind} id={`${hostId}-code-${start + i}`} />}
          {s.alt && (
            <p className="type-body-s m-0 text-muted">
              <StepText text={s.alt} />
            </p>
          )}
        </StepRow>
      ))}
    </>
  );
}

// ConnectorAddress: the hosted connector's URL in a well, with its Copy button under it. The
// page says once whether the connector is live (SiteStatus in the /connect head), so this
// never does. The address never wraps; on a narrow screen it scrolls sideways inside its well.
export function ConnectorAddress({ mcpUrl, id }: { mcpUrl: string; id: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0 rounded-control bg-inset p-4">
        <p className="type-label m-0 mb-1 text-faint">Connector address</p>
        <code id={id} className="type-code block overflow-x-auto whitespace-nowrap text-text [scrollbar-color:var(--line-bold)_var(--bg-inset)]">
          {mcpUrl}
        </code>
      </div>
      <div className="cn-copy cn-copy--sm">
        <CopyButton text={mcpUrl} label="Copy the connector address" selectId={id}>
          Copy the address
        </CopyButton>
      </div>
    </div>
  );
}

// The rules that show only the chosen host's panel, with scripts off: inside #ROOT, every
// [data-host-panel] but the checked host's is hidden (see doorRules for why it is important).
export function hostPanelRules(rootId: string, name: string): string {
  const root = safe(rootId);
  const n = safe(name);
  return HOSTS.map(
    (h) => `#${root}:has(input[name="${n}"][value="${safe(h.id)}"]:checked) [data-host-panel]:not([data-host-panel="${safe(h.id)}"]){display:none !important}`,
  ).join("\n");
}

// HostOptions: the hosts from lib/hosts.ts as the options of one radio group: our monogram,
// the name, the status it has earned and, where a product has several surfaces, which ones.
// How many host tiles stand in a row from 1024 px; components/connect/connect-setup.tsx
// places the sliding rule to match (D218 made the hosts six).
export const HOST_COLS = 3;

// The rules between tiles: two a row on a phone, HOST_COLS a row from 1024 px.
function tileRules(i: number): string {
  const wide = Math.min(HOSTS.length, HOST_COLS);
  return cx(
    i % 2 === 1 && "border-l",
    i > 1 && "border-t",
    i % wide === 0 ? "lg:border-l-0" : "lg:border-l",
    i < wide ? "lg:border-t-0" : "lg:border-t",
  );
}

// Two columns on a phone, rows of three from 1024 px. Each option carries the host's id as its
// anchor, so /connect#codex arrives with Codex chosen (RadioSync, via "hash").
export function HostOptions({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cx("cn-opts cn-opts--hosts", className)}>
      {HOSTS.map((h, i) => (
        <label
          key={h.id}
          id={h.id}
          className={cx(OPTION, "group grid scroll-mt-24 grid-cols-[auto_minmax(0,1fr)] content-start items-center gap-x-3 gap-y-2", tileRules(i))}
        >
          <input type="radio" name={name} value={h.id} defaultChecked={i === 0} className="sr-only" />
          <Logo id={h.id} name={h.name} size="lg" />
          <span className="type-title-s min-w-0 text-text">{h.name}</span>
          <span className="col-span-2">
            <HostStatus host={h} />
          </span>
          {h.detail && <span className="type-body-s col-span-2 text-faint">{h.detail}</span>}
        </label>
      ))}
    </div>
  );
}

// StatusKey: what "tested" and "documented" mean, once, under the form, with the same two
// chips the hosts carry. One key of two rows: the chips share a column, so both meanings
// start on the same line at any width.
export function StatusKey({ className }: { className?: string }) {
  return (
    <dl className={cx("type-body-s m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-muted", className)}>
      <dt>
        <Tag tone="agent" dot>
          Tested
        </Tag>
      </dt>
      <dd className="m-0">A playbook was run through it end to end.</dd>
      <dt>
        <Tag dashed>Documented</Tag>
      </dt>
      <dd className="m-0">Its steps were checked against the vendor&rsquo;s own documentation and have not been run yet.</dd>
      {HOSTS.some((h) => h.status === "unchecked") && (
        <>
          <dt>
            <Tag tone="human" dashed>
              Not checked yet
            </Tag>
          </dt>
          <dd className="m-0">Listed, but its steps have been neither checked nor run. Follow its own help to add a custom connector.</dd>
        </>
      )}
    </dl>
  );
}
