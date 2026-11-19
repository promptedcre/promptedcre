import { Disclosure, cx } from "@/components/ui";
import type { Artifact } from "@/lib/schemas/records";
import type { ArtifactRow } from "./data";
import { RecordLinks } from "./record-links";

const TYPE_WORD: Record<Artifact["fields"][number]["type"], string> = {
  string: "text",
  text: "long text",
  date: "date",
  money: "money",
  integer: "whole number",
  boolean: "yes or no",
  enum: "one of a list",
  list: "list",
};

// A field standard, folded directly under its artifact's description, in the artifact's own
// cell. Closed, the browser does not lay the fields out; open, a long standard still waits until
// it nears the screen (.lb-lazy). Ruled rows (.lb-fr in LibraryStyles), no frame. The body is a
// size container (.lb-fs): in the schedule's first column the fields stack, label then type,
// definition and authority; given 44rem they take four columns under a column key.
function FieldStandard({ a }: { a: Artifact }) {
  return (
    <Disclosure
      size="sm"
      className="mt-3"
      summaryClassName="type-body-s text-muted"
      bodyClassName="lb-lazy lb-fs pb-2"
      summary={
        <>
          Field standard<span className="tabular-nums text-faint">, {a.fields.length} fields</span>
        </>
      }
    >
      <div aria-hidden="true" className="lb-fk type-label mt-1 text-faint">
        <span>Field</span>
        <span>Type</span>
        <span>Definition</span>
        <span>Authority</span>
      </div>
      <dl className="type-body-s m-0">
        {a.fields.map((f) => (
          <div key={f.key} className="lb-fr">
            <dt>
              <span className="block text-text">{f.label}</span>
              <code className="type-data block break-all text-faint">{f.key}</code>
            </dt>
            <dd className="text-muted">
              <span className="lb-fl">Type: </span>
              {TYPE_WORD[f.type]}
              {f.unit ? `, ${f.unit}` : ""}
            </dd>
            <dd className="text-pretty text-muted">{f.definition}</dd>
            {f.authority && (
              <dd className="text-faint">
                <span className="lb-fl">Authority: </span>
                {f.authority}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </Disclosure>
  );
}

// ArtifactSchedule: artifacts as a drawing set's schedule. A real table from 768 px (the
// artifact and what it is, the records that make it, the records that read it), stacked rows on
// a phone with each cell named. A field standard folds under the artifact's description, in the
// same cell, so it never drifts below a long "Used by" list. Each artifact is its own
// <tbody id=<artifact id>>, so search, steps and findings link to it and the row lights as the
// target. The page renders LibraryStyles once (the lb- rules this relies on).
export function ArtifactSchedule({ rows, label, className }: { rows: readonly ArtifactRow[]; label: string; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <table className={cx("w-full border-collapse text-left md:table-fixed max-md:block max-md:border-t max-md:border-line-strong", className)}>
      <caption className="sr-only">{label}</caption>
      <thead className="max-md:sr-only">
        <tr className="border-y border-line-strong">
          <th scope="col" className="type-label py-2 text-left pr-6 text-faint md:w-2/5">
            Artifact
          </th>
          <th scope="col" className="type-label py-2 text-left pr-6 text-faint md:w-3/10">
            Made by
          </th>
          <th scope="col" className="type-label py-2 text-left text-faint md:w-3/10">
            Used by
          </th>
        </tr>
      </thead>
      {rows.map(({ artifact: a, makes, uses }) => (
        <tbody key={a.id} id={a.id} className="scroll-mt-24 border-b border-line target:bg-panel max-md:block">
          <tr className="align-baseline max-md:block">
            <th scope="row" className="py-4 pr-6 text-left max-md:block max-md:pb-2">
              <span className="type-title-s block text-text">{a.name}</span>
              <span className="type-body-s measure mt-1 block text-pretty text-muted">{a.what}</span>
              {a.fields.length > 0 && <FieldStandard a={a} />}
            </th>
            <td className="py-4 pr-6 max-md:block max-md:py-2">
              <p className="type-label m-0 mb-1 text-faint md:hidden">Made by</p>
              <RecordLinks records={makes} empty="No written step makes it" />
            </td>
            <td className="py-4 max-md:block max-md:py-2 max-md:pb-4">
              <p className="type-label m-0 mb-1 text-faint md:hidden">Used by</p>
              <RecordLinks records={uses} empty="No written step reads it yet" />
            </td>
          </tr>
        </tbody>
      ))}
    </table>
  );
}
