import { RunBoardCompact } from "@/components/run";
import { ApprovalCells, Icon, TitleBlock, TitleCell, cx } from "@/components/ui";
import type { LookupApproval, WrittenAudit } from "./data";

// LookupsPanel: the one approval for public-record lookups. First the promise and the
// engine's rule in plain words. Then the handoff as it happened in the recorded run, on a
// sheet of its own, drawn the way the run board draws any handoff: the agent's lookup
// inside the revision cloud, "Then" across the property line to the person who approves
// once, and the same lookup recorded. The sheet's title block says which check reads a
// public record, when approval is asked, and who approved. Server component (the board
// reads the recording).
//
// Whether the engine is released is not said here: a page says what is not available once
// (decision D131), and /audit says it where the engine's output first appears, above the
// finished audit.

export function LookupsPanel({ audit, approval, className }: { audit: WrittenAudit; approval: LookupApproval | null; className?: string }) {
  const lookupChecks = audit.rows.filter((r) => r.readsPublicRecord);
  return (
    <div className={cx("min-w-0", className)}>
      <div className="grid gap-x-12 gap-y-4 lg:grid-cols-2">
        <p className="type-title-s m-0 text-text">You approve public-record lookups once per audit. The agent never logs in anywhere.</p>
        <p className="type-body measure m-0 text-muted">
          The engine keeps the rule. An agent that tries to record a check that reads a public record, clear or as a finding, before a
          lookup approval is on file is refused and told to ask. Once the person says yes, the agent records the approval in their name,
          once for the whole audit. A check recorded in a person&rsquo;s own name needs no approval.
        </p>
      </div>

      {approval && (
        <RunBoardCompact
          className="mt-8"
          scene={approval.scene}
          rows={approval.steps}
          title="How it went in the recorded run"
          titleBlock={
            <TitleBlock label="The lookup approval in the recorded run" className="grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
              <TitleCell label="Reads a public record" className="col-span-2 sm:col-span-1">
                <span className="flex items-center gap-2">
                  <Icon name="search" className="text-muted" />
                  {lookupChecks.length} {lookupChecks.length === 1 ? "check" : "checks"}
                </span>
                {lookupChecks.map((r) => (
                  <span key={r.id} className="type-body-s mt-1 block text-muted">
                    {r.n}. {r.title}
                  </span>
                ))}
              </TitleCell>
              <TitleCell label="Approval asked" className="col-span-2 sm:col-span-1">
                Once per audit, before the agent records it
              </TitleCell>
              <ApprovalCells drawnBy="agent" approvedBy={{ name: approval.by, date: approval.on }} />
            </TitleBlock>
          }
        />
      )}
    </div>
  );
}
