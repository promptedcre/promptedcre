import Link from "next/link";
import { Tag } from "@/components/chips";
import { StakeLine } from "@/components/run/findings-report";
import { Icon, Marks, RoleMark, cx } from "@/components/ui";
import type { CheckRow, WrittenAudit } from "./data";

// CheckSchedule: an audit's checks as a ruled schedule on plain ground. Each row gives the
// check's number, its title (a link to that check on the playbook page), who verifies it
// (the role mark, big enough that a person's cut corner shows), whether it reads a public
// record by the engine's own rule, what missing it can cost in its rule card's words, and
// whether it is cited or common practice. A table from 768 px; on a phone each row is a
// short block. Pure.

function Basis({ row }: { row: CheckRow }) {
  if (row.basis !== "cited") return <Tag dashed>Common practice</Tag>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Tag tone="accent">Cited</Tag>
      <span className="type-note whitespace-nowrap text-faint">
        {row.sources} {row.sources === 1 ? "source" : "sources"}
        {row.rules > 0 && ` · ${row.rules} ${row.rules === 1 ? "rule" : "rules"}`}
      </span>
    </span>
  );
}

const TH = "type-label border-b border-line-strong pb-2 pr-6 text-left align-bottom text-faint";
const TD = "block md:table-cell md:border-b md:border-line md:py-4 md:pr-6 md:align-top";

export function CheckSchedule({ audit, className }: { audit: WrittenAudit; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      {/* The key, once, above the schedule. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <p className="type-body-s m-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted">
          <Marks marks={audit.marks} label={`${audit.checks} checks: ${audit.agentChecks} an agent verifies, ${audit.personChecks} a person confirms`} />
          <span>
            <b className="font-semibold text-text">{audit.agentChecks}</b> an agent verifies, <b className="font-semibold text-text">{audit.personChecks}</b> a person confirms
          </span>
        </p>
        <ul className="type-label m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-muted" aria-label="Key">
          {audit.publicRecord > 0 && (
            <li className="flex items-center gap-2">
              <Icon name="search" />
              Reads a public record
            </li>
          )}
          {audit.personChecks > 0 && <li>A person&rsquo;s check has a cut corner</li>}
        </ul>
      </div>

      <table className="block w-full border-collapse md:table">
        <caption className="sr-only">
          The {audit.checks} checks of {audit.title}: who verifies each, whether it reads a public record, and its basis
        </caption>
        <thead className="sr-only md:not-sr-only md:table-header-group">
          <tr>
            <th scope="col" className={cx(TH, "w-12")}>
              <span className="sr-only">Number</span>
            </th>
            <th scope="col" className={TH}>
              Check
            </th>
            <th scope="col" className={cx(TH, "w-56")}>
              Who verifies it
            </th>
            <th scope="col" className={cx(TH, "w-52 pr-0")}>
              Basis
            </th>
          </tr>
        </thead>
        <tbody className="block border-t border-line-strong md:table-row-group md:border-t-0">
          {audit.rows.map((r) => (
            <tr key={r.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b border-line py-4 md:table-row md:border-b-0 md:py-0">
              <td className={cx(TD, "type-data self-start text-faint max-md:pt-1")}>{r.n}</td>
              <td className={cx(TD, "col-span-2")}>
                <Link
                  href={r.href}
                  className="type-title-s text-text underline decoration-transparent underline-offset-4 transition-colors hover:decoration-accent-strong"
                >
                  {r.title}
                </Link>
                {r.readsPublicRecord && (
                  <span className="type-body-s mt-2 flex items-start gap-2 text-muted">
                    <Icon name="search" className="mt-1" />
                    <span>Reads a public record. An agent asks a person once per audit, and records it clear or as a finding only after their yes is on file.</span>
                  </span>
                )}
                {r.stake && <StakeLine stake={r.stake} className="measure mt-2" />}
              </td>
              <td className={cx(TD, "col-start-2")}>
                <RoleMark mode={r.mark} label={r.who} />
              </td>
              <td className={cx(TD, "justify-self-end md:pr-0")}>
                <Basis row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
