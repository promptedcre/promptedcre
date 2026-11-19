import { Tag } from "@/components/chips";
import { Icon, cx } from "@/components/ui";
import { ACCESS_MEANS, ACCESS_ORDER, ACCESS_WORD, type Access, type DocumentGroup } from "./data";

// The access mark: a 12 px square, filled for public domain, half filled for free to view,
// hollow for members only and hollow dashed for paid. Shape carries it, never color: it is
// drawn in neutral ink (drafting blue is for links, focus and the stamp), and the word always
// sits beside it. Drawn as SVG geometry, not a gradient. The four shapes are defined once
// (AccessMarks, which the page renders once) and each row points at one with <use>, so 46 rows
// do not carry 46 copies of the drawing.
const markId = (a: Access) => `lb-access-${a}`;

export function AccessMarks() {
  const box = { x: 0.75, y: 0.75, width: 10.5, height: 10.5, fill: "none", stroke: "currentColor", strokeWidth: 1.5 };
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute size-0 overflow-hidden">
      <symbol id={markId("public-domain")} viewBox="0 0 12 12">
        <rect x="0.5" y="0.5" width="11" height="11" fill="currentColor" stroke="currentColor" />
      </symbol>
      <symbol id={markId("free-to-view")} viewBox="0 0 12 12">
        <rect {...box} />
        <path d="M0.75 0.75H11.25L0.75 11.25Z" fill="currentColor" />
      </symbol>
      <symbol id={markId("member-only")} viewBox="0 0 12 12">
        <rect {...box} />
      </symbol>
      <symbol id={markId("paid")} viewBox="0 0 12 12">
        <rect {...box} strokeDasharray="2.5 1.75" />
      </symbol>
    </svg>
  );
}

function AccessGlyph({ access, className }: { access: Access; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false" className={cx("flex-none text-muted", className)}>
      <use href={`#${markId(access)}`} />
    </svg>
  );
}

function AccessWord({ access }: { access: Access }) {
  return (
    <span className="inline-flex items-center gap-2">
      <AccessGlyph access={access} />
      {ACCESS_WORD[access]}
    </span>
  );
}

// AccessKey: the access levels once, with what each means and how many documents carry it.
export function AccessKey({ counts, className }: { counts: Record<Access, number>; className?: string }) {
  const levels = ACCESS_ORDER.filter((a) => counts[a] > 0);
  return (
    <dl className={cx("type-body-s m-0 border-t border-line-strong", className)}>
      {levels.map((a) => (
        <div key={a} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-line py-3">
          <dt className="text-text">
            <AccessWord access={a} />
          </dt>
          <dd className="m-0 text-muted">{ACCESS_MEANS[a]}</dd>
          <dd className="m-0 tabular-nums text-faint">
            <span className="sr-only">Documents: </span>
            {counts[a]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// DocumentSchedule: one phase's documents as a schedule. A real table from 768 px (the document,
// its publisher, its access, the date its link was checked); on a phone each row stacks, the
// title first, with the publisher, access and date on one line under it. The title links to the
// publisher's page. Each row keeps id="doc-<id>".
export function DocumentSchedule({ group, className }: { group: DocumentGroup; className?: string }) {
  return (
    <table className={cx("w-full border-collapse text-left max-md:block max-md:border-t max-md:border-line-strong", className)}>
      <caption className="sr-only">{group.label}: documents</caption>
      <thead className="max-md:sr-only">
        <tr className="border-y border-line-strong">
          <th scope="col" className="type-label py-2 pr-6 text-left text-faint">
            Document
          </th>
          <th scope="col" className="type-label py-2 pr-6 text-left text-faint md:w-1/5">
            Publisher
          </th>
          <th scope="col" className="type-label py-2 pr-6 text-left text-faint md:w-36">
            Access
          </th>
          <th scope="col" className="type-label py-2 text-right text-faint md:w-28">
            Checked
          </th>
        </tr>
      </thead>
      <tbody className="max-md:block">
        {group.rows.map((r) => (
          <tr
            key={r.doc.id}
            id={`doc-${r.doc.id}`}
            className="scroll-mt-24 border-b border-line align-baseline target:bg-panel max-md:flex max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1 max-md:py-4"
          >
            <th scope="row" className="py-4 pr-6 text-left max-md:block max-md:w-full max-md:p-0 max-md:pb-1">
              <a href={r.doc.url} rel="noreferrer" className="lb-q type-title-s inline">
                {r.doc.title}
                <Icon name="external" className="ml-1.5 inline-block align-baseline text-faint" />
                <span className="sr-only"> (opens {r.host})</span>
              </a>
              <span className="type-data mt-1 block break-all text-faint">{r.host}</span>
              <span className="type-body-s measure mt-2 block text-pretty text-muted">
                {r.lead && r.lead !== group.label && <span className="text-faint">{r.lead}: </span>}
                {r.use.charAt(0).toUpperCase() + r.use.slice(1)}
                {r.doc.note ? <span className="text-faint">. {r.doc.note}</span> : null}
              </span>
            </th>
            {/* the cell prefixes name each cell on a phone, where the column heads are hidden;
                from 768 px the real <th scope=col> heads do it, so the prefixes go */}
            <td className="type-body-s py-4 pr-6 text-muted max-md:block max-md:p-0">
              <span className="sr-only md:hidden">Publisher: </span>
              {r.doc.publisher}
            </td>
            <td className="type-body-s py-4 pr-6 text-muted max-md:block max-md:p-0">
              <span className="sr-only md:hidden">Access: </span>
              <AccessWord access={r.doc.access} />
            </td>
            <td className="py-4 text-right text-faint max-md:block max-md:p-0 max-md:text-left">
              <span className="type-body-s md:hidden">Checked </span>
              <time dateTime={r.doc.lastChecked} className="type-data whitespace-nowrap">
                {r.doc.lastChecked}
              </time>
              {r.stale && (
                <span className="ml-2 inline-block md:ml-0 md:mt-1 md:block">
                  <Tag tone="warn">check date</Tag>
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
