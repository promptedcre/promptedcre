import type { ReactNode } from "react";
import { PropertyLine, RoleMark, Sheet, TextLink, TitleBlock, TitleCell } from "@/components/ui";
import { TOOLS } from "@/lib/mcp/server";
import { firmFileSpec } from "@/lib/mcp/tools";

// A footprint on the plan: one thing that stands on a parcel, as one ruled row: its name, then
// what it is. A row under a rule, never a box: the plan has one border, the sheet's, and
// nothing drawn on it is a frame with words inside. Where the two do not fit on one line, what
// it is drops under its name.
function Footprint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3">
      <dt className="type-label m-0 text-text">{title}</dt>
      <dd className="type-body-s m-0 min-w-0 text-muted">{children}</dd>
    </div>
  );
}

// A parcel: whose ground it is (the mark and the name, on one line with the parcel's
// number), one line of what holds true on it, and the schedule of what stands on it.
function Parcel({ n, mode, title, sub, children }: { n: number; mode: "A" | "H"; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="m-0">
          <RoleMark mode={mode} label={title} size="lg" className="type-title-m whitespace-normal" />
        </h3>
        <p className="type-label m-0 text-faint">Parcel {n}</p>
      </div>
      <p className="type-body-s m-0 mt-1 text-muted">{sub}</p>
      <dl className="m-0 mt-6 border-t border-line-strong">{children}</dl>
    </div>
  );
}

// SitePlan: what the agent never gets, drawn as a site plan. It is the page's one sheet:
// one border, the drafting grid under the drawing, and a title block along the bottom.
// Parcel 1 is the operator's machine (the firm folder and the engine), on the person's side
// of the property line; parcel 2 is the hosted site (the read-only connector, /install,
// /llms.txt), on the agent's side. The line between them says files never cross.
//
// The title block is the plan's key, column for column: under parcel 1 what stays, under
// parcel 2 what is read, and the rule between those two cells falls under the property line.
// Its last cell says what the line means, in the connector's own terms: no tool accepts a
// firm file. It does not say that nothing reaches the hosted site: what an agent asks it (a
// search's words, a calculator's inputs) does, so the plan claims only what is true of files.
//
// The firm folder's file names come from the firm-file spec the connector publishes, and the
// tool count from the tool list. The engine's state is said once, in the /connect head
// (SiteStatus), so the plan does not say it again.
export function SitePlan({ id, titleId, className }: { id?: string; titleId: string; className?: string }) {
  const files = Object.keys(firmFileSpec().files);
  return (
    <Sheet
      id={id}
      level={2}
      title="Your firm's files stay on your machine."
      titleId={titleId}
      note="Site plan · not to scale"
      grid
      className={className}
      bodyClassName="py-8 md:py-10"
      titleBlock={
        // Two columns at every width, under the two parcels. From 768 px each cell's words start
        // on its parcel's own left edge: the sheet's inset, and the far side of the property line
        // (half the line's column plus the gap beside it).
        <TitleBlock label="What this plan shows" className="grid-cols-2">
          <TitleCell label="Stays with you" className="md:px-6">
            The firm folder, on your own machine
          </TitleCell>
          <TitleCell label="Your agent reads" className="md:pl-10 md:pr-6 lg:pl-14">
            The catalog, from the hosted site
          </TitleCell>
          <TitleCell label="No file crosses" className="col-span-2 md:px-6">
            The connector takes no firm file, and no tool accepts one.
          </TitleCell>
        </TitleBlock>
      }
      footer="What you show a chat app is handled under that app&rsquo;s own terms."
    >
      <div className="grid gap-y-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-x-6 lg:gap-x-10">
        <Parcel n={1} mode="H" title="Your machine" sub="The firm folder stays here.">
          <Footprint title="Firm folder">
            <code className="type-data [overflow-wrap:anywhere]">{files.join(" · ")}</code>
          </Footprint>
          <Footprint title="Engine">A command line and a local server</Footprint>
        </Parcel>
        {/* From 768 px the line runs the whole drawing, through its inset, from the head's rule to
            the title block, where the rule between the two key cells takes it up. */}
        <PropertyLine orientation="v" label="Files never cross" className="md:-my-10" />
        <Parcel n={2} mode="A" title="The hosted site" sub="Read-only. Takes no firm file.">
          <Footprint title="Hosted connector">{TOOLS.length} read-only tools</Footprint>
          {/* The links' block padding (taken back by the margin) makes each a 44 px target in its row. */}
          <Footprint title="Install page for agents">
            <TextLink href="/install" tone="accent" mono className="-my-3 inline-block py-3">
              /install
            </TextLink>
          </Footprint>
          <Footprint title="For language models">
            <TextLink href="/llms.txt" tone="accent" mono className="-my-3 inline-block py-3">
              /llms.txt
            </TextLink>
          </Footprint>
        </Parcel>
      </div>
    </Sheet>
  );
}
