import type { ReactNode } from "react";
import { Tag } from "@/components/chips";
import { TextLink, cx } from "@/components/ui";
import { site } from "@/lib/site";

// What the engine is, before the word is used for anything else on the page.
const ENGINE_IS =
  "It runs on your own machine: a command line and a local server that keep the firm's records, refuse any move a playbook does not allow, and never record a person's step under the agent's name.";

// SiteStatus: the two deploy states, each said once, for the /connect head: the hosted
// connector (site.connectorLive) and the engine (site.engineReleased). Two ruled rows on
// plain ground, never a box: the name with its chip, then one or two sentences that first
// say what the thing is, then where it stands. Every sentence reads right in both states of
// its flag.
export function SiteStatus({ className }: { className?: string }) {
  const rows: { k: string; chip: ReactNode; text: ReactNode }[] = [
    {
      k: "Connector",
      chip: site.connectorLive ? (
        <Tag tone="agent" dot>
          Live
        </Tag>
      ) : (
        <NotLiveChip />
      ),
      text: site.connectorLive
        ? "It is how your agent reads the playbooks. The hosted connector is on. Add it to your agent with the steps below."
        : "It is how your agent reads the playbooks. The steps below are how you add it once it is switched on. The playbooks, rules and calculators here are open now.",
    },
    {
      k: "Engine",
      chip: site.engineReleased ? (
        <Tag tone="agent" dot>
          Released
        </Tag>
      ) : (
        <NotReleasedChip />
      ),
      // What it is first, in the same words in both states; then where it stands. While it is
      // not released the second sentence holds whether the connector is on or off: a playbook
      // (copied into a chat, or read through the connector) tells an agent where to stop, and
      // nothing refuses.
      text: site.engineReleased ? (
        <>
          {ENGINE_IS}
          {site.repoUrl && (
            <>
              {" "}
              <TextLink href={site.repoUrl} tone="accent">
                Get it from the repository
              </TextLink>
              .
            </>
          )}
        </>
      ) : (
        `${ENGINE_IS} Until it is released, nothing here refuses a step: every playbook step tells your agent where to stop.`
      ),
    },
  ];
  return (
    <dl aria-label="What is switched on" className={cx("m-0 border-t border-line-strong", className)}>
      {rows.map((r) => (
        <div key={r.k} className="border-b border-line py-4 last:border-b-0 last:pb-0">
          <dt className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="type-label text-text">{r.k}</span>
            {r.chip}
          </dt>
          <dd className="type-body-s m-0 mt-2 text-muted">{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}

// NotLiveChip: the amber dashed chip, shown only while the hosted connector is off.
// Renders nothing once site.connectorLive is true.
export function NotLiveChip({ children = "Not live yet" }: { children?: string }) {
  if (site.connectorLive) return null;
  return (
    <Tag tone="human" dashed dot>
      {children}
    </Tag>
  );
}

// NotReleasedChip: the same amber dashed chip for the engine (the command line and the
// local MCP server), shown only while site.engineReleased is false. SiteStatus is its one user.
function NotReleasedChip({ children = "Not released yet" }: { children?: string }) {
  if (site.engineReleased) return null;
  return (
    <Tag tone="human" dashed dot>
      {children}
    </Tag>
  );
}
