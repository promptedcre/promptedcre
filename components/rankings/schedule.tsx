import Link from "next/link";
import { Tag } from "@/components/chips";
import { DimensionLine, Disclosure, Logo, cx } from "@/components/ui";
import type { AnyStory } from "@/lib/schemas/rankings";
import { storyKey, type StoryGroupKey } from "./labels";
import { MARK_LABEL, VerdictMark } from "./marks";
import { ScoreReadout } from "./score";
import { RankNumeral } from "./status";
import type { RankedRow } from "./summary";

// The ranked schedule of one market, read the way a door or finish schedule reads: the rank as
// a plain numeral, the product's name, its score as a figure with a measured bar, and one small
// mark per task, grouped under named heads (Agent access, Openness, Market tasks).
//
// From 1024 px it is a real table. Its head stays in view while the rows scroll, each task's
// number in the head is a link to its line in the key directly above the table and shows the
// task's name on hover or focus, and pointing at a number lights its column and its key line.
// Under 1024 px every vendor is one ruled row: name and score, then each group of marks on its
// own line under the group's name, with the group's score at the end. Untested vendors say so
// in words; no empty marks stand in for a verdict that does not exist.
//
// `sortId` makes a published table sortable by SortControl (D224): the body takes that id and
// each row its place in the server's order (data-order) and its name (data-name). The server's
// order is the rank order, and the Score head says so with aria-sort.

const SLOT = "w-4 lg:w-5";

// Hover and focus links a task's number, its column of marks and its key line. Written once
// per page for the market's task codes (plain CSS: :has() works with scripts off).
function ScheduleStyles({ codes }: { codes: string[] }) {
  const rules = codes
    .map(
      (c) =>
        `.rk:has(.rk-col[data-col="${c}"]:is(:hover,:focus-visible)) :is(.rk-cell[data-col="${c}"],.rk-key-line[data-key="${c}"]){background-color:var(--bg-panel)}`,
    )
    .join("\n");
  const css = `@layer components {
.rk-col{position:relative;display:block;text-decoration:none;color:var(--text-faint)}
.rk-col:hover,.rk-col:focus-visible{color:var(--text)}
.rk-tip{display:none;position:absolute;right:0;top:calc(100% + 0.5rem);z-index:3;width:max-content;max-width:16rem;padding:0.375rem 0.5rem;border:1px solid var(--line-strong);background:var(--bg-inset);color:var(--text);text-align:left;white-space:normal}
.rk-col:is(:hover,:focus-visible) .rk-tip{display:block}
.rk-key-line:target{background-color:var(--bg-panel)}
${rules}
}`;
  return (
    <style href={`rankings-schedule-${codes.length}`} precedence="default">
      {css}
    </style>
  );
}

function GroupMarks({ row, g }: { row: RankedRow; g: StoryGroupKey }) {
  const byStory = new Map(row.result.cells.map((c) => [c.story.id, c.verdict]));
  const score = row.result.groups[g.group];
  return (
    <div className="flex items-center gap-3 lg:block">
      <span className="type-body-s w-28 flex-none text-muted lg:hidden">{g.label}</span>
      <div className="inline-flex flex-col">
        <span className="flex">
          {g.stories.map(({ story, code }) => {
            const v = byStory.get(story.id)?.verdict ?? "untested";
            return (
              <span key={story.id} data-col={code} className={cx("rk-cell grid h-5 place-items-center", SLOT)}>
                <VerdictMark v={v} label={`Task ${code}, ${story.title}: ${MARK_LABEL[v]}`} />
              </span>
            );
          })}
        </span>
        <DimensionLine placement="below" className="max-lg:hidden">
          <span aria-hidden="true">{score ?? "–"}</span>
        </DimensionLine>
      </div>
      <span aria-hidden="true" className="type-body-s ml-auto min-w-6 text-right tabular-nums text-muted lg:hidden">
        {score ?? "–"}
      </span>
      <span className="sr-only">
        {g.label} score {score ?? "not applicable"}.
      </span>
    </div>
  );
}

function HeadNumbers({ g }: { g: StoryGroupKey }) {
  return (
    <span className="mt-2 flex">
      {g.stories.map(({ story, code }) => (
        <span key={story.id} className={cx("text-center", SLOT)}>
          <a href={`#key-${code}`} data-col={code} className="rk-col type-note tabular-nums" aria-label={`Task ${code}: ${story.title}`}>
            {code}
            <span aria-hidden="true" className="rk-tip type-body-s">
              {story.title}
            </span>
          </a>
        </span>
      ))}
    </span>
  );
}

// StoryKey: the key to the schedule's columns, directly above it. Each task's number, its name
// and its weight, grouped as the columns are. On a phone it folds shut under one line; from
// 768 px it is simply open.
export function StoryKey({ stories, className }: { stories: AnyStory[]; className?: string }) {
  const groups = storyKey(stories);
  return (
    <Disclosure openFrom="md" className={className} summary={<>Key to the {stories.length} task columns</>}>
      <div className="grid gap-x-10 gap-y-6 pt-2 md:grid-cols-3 md:pt-0">
        {groups.map((g) => (
          <div key={g.group} className="min-w-0">
            <h3 className="type-label m-0 border-b border-line-strong pb-2 text-text">{g.label}</h3>
            <ol className="m-0 list-none p-0">
              {g.stories.map(({ story, code }) => (
                <li
                  key={story.id}
                  id={`key-${code}`}
                  data-key={code}
                  className="rk-key-line grid scroll-mt-32 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-line py-2"
                >
                  <span className="type-data text-faint">{code}</span>
                  <span className="type-body-s text-text">{story.title}</span>
                  <span className="type-data text-faint">
                    <span className="sr-only">weight </span>×{story.weight}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="type-body-s m-0 mt-3 text-faint">
        Each group of marks carries that group&apos;s score, 0 to 100. ×n is a task&apos;s weight.
      </p>
    </Disclosure>
  );
}

export function RankSchedule({
  marketId,
  marketName,
  stories,
  rows,
  published,
  sortId,
  className,
}: {
  marketId: string;
  marketName: string;
  stories: AnyStory[];
  // the market's listed rows (dropped vendors left out), in the order to draw them
  rows: RankedRow[];
  published: boolean;
  // the body's id, for SortControl; only a published table is sorted
  sortId?: string;
  className?: string;
}) {
  const sortable = published && Boolean(sortId);
  const groups = storyKey(stories);
  const codes = groups.flatMap((g) => g.stories.map((s) => s.code));
  const anyUntested = rows.some((r) => r.status !== "judged");
  const scores = rows.map((r) => (r.status === "judged" ? r.result.score : null)).filter((s): s is number => s !== null);
  const best = published && scores.length > 0 ? Math.max(...scores) : null;
  // The head sticks under the site header from 1024 px. A collapsed table's border does not
  // travel with a sticky cell, so each head cell draws its own 1 px bottom rule.
  const headCell =
    "type-label bg-bg pb-3 pt-2 text-left align-bottom text-muted lg:sticky lg:top-[var(--header-h)] lg:z-[2] lg:shadow-[inset_0_-1px_0_var(--line-strong)]";

  return (
    <div className={cx("rk", className)}>
      {published && <ScheduleStyles codes={codes} />}
      {published && <StoryKey stories={stories} />}
      <table className={cx("w-full border-collapse text-left max-lg:block", published && "mt-6 lg:mt-8")}>
        <caption className="sr-only">
          {marketName}:{" "}
          {sortable
            ? "every listed vendor with its score and each task's verdict, grouped as Agent access, Openness and Market tasks"
            : published
              ? "vendors ranked by score, highest first, with each task's verdict grouped as Agent access, Openness and Market tasks"
              : "vendors in name order; scores appear when the market publishes"}
        </caption>
        <thead className="max-lg:hidden">
          <tr className="border-b border-line-strong">
            <th scope="col" className={cx(headCell, "w-16 pr-3")}>
              Rank
            </th>
            <th scope="col" className={cx(headCell, "pr-6")} data-sort={sortable ? "name" : undefined}>
              Product
            </th>
            {published ? (
              <>
                <th scope="col" className={cx(headCell, "w-52 pr-6")} data-sort={sortable ? "score" : undefined} aria-sort={sortable ? "descending" : undefined}>
                  <span className="block">Score</span>
                  <span className="type-note mt-1 block text-faint">Out of 100</span>
                  {best !== null && (
                    <span className="type-note block text-faint">
                      Tick: best here, <span className="tabular-nums">{best}</span>
                    </span>
                  )}
                </th>
                {groups.map((g, i) => (
                  <th key={g.group} scope="col" className={cx(headCell, i < groups.length - 1 && "pr-6")}>
                    <span className="block text-text">{g.label}</span>
                    <HeadNumbers g={g} />
                  </th>
                ))}
              </>
            ) : (
              <th scope="col" className={headCell}>
                State
              </th>
            )}
          </tr>
        </thead>
        <tbody className="max-lg:block" id={sortable ? sortId : undefined}>
          {rows.map((r, i) => {
            const judged = r.status === "judged";
            const href = `/rankings/${marketId}/${r.vendor.id}`;
            const scored = published && judged && r.result.score !== null;
            return (
              <tr
                key={r.vendor.id}
                data-order={sortable ? i : undefined}
                data-name={sortable ? r.vendor.name : undefined}
                className={cx(
                  "border-b align-top max-lg:relative max-lg:grid max-lg:grid-cols-[2rem_minmax(0,1fr)] max-lg:gap-x-3 max-lg:gap-y-3 max-lg:py-5",
                  judged ? "border-line" : "border-dashed border-line-bold",
                )}
              >
                <td className="py-5 pr-3 max-lg:row-span-6 max-lg:p-0">
                  <RankNumeral rank={r.rank} />
                </td>
                <td className="py-5 pr-6 max-lg:col-start-2 max-lg:p-0">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={href}
                      className={cx(
                        // On a phone the name's link stretches over its row, so the whole row is the target.
                        "type-title-s inline-flex items-center gap-2 underline decoration-transparent underline-offset-4 hover:decoration-accent max-lg:before:absolute max-lg:before:inset-0",
                        judged ? "text-text" : "text-muted",
                      )}
                    >
                      <Logo id={r.vendor.id} name={r.vendor.name} size="md" government={r.vendor.kind === "government"} />
                      {r.vendor.name}
                    </Link>
                    {r.vendor.kind === "government" && <Tag>government</Tag>}
                  </span>
                  <span className="type-body-s mt-1 block max-w-[46ch] text-muted">{r.vendor.what}</span>
                </td>
                {published ? (
                  scored ? (
                    <>
                      <td className="py-5 pr-6 max-lg:col-start-2 max-lg:p-0">
                        <ScoreReadout score={r.result.score as number} best={best} figureClassName="max-lg:min-w-0 max-lg:text-left" />
                      </td>
                      {groups.map((g, i) => (
                        <td key={g.group} className={cx("py-5 max-lg:col-start-2 max-lg:p-0", i < groups.length - 1 && "lg:pr-6")}>
                          <GroupMarks row={r} g={g} />
                        </td>
                      ))}
                    </>
                  ) : (
                    <>
                      <td className="py-5 pr-6 max-lg:col-start-2 max-lg:p-0">
                        <Tag dashed>{r.status === "stale" ? "stale" : "untested"}</Tag>
                      </td>
                      <td colSpan={groups.length} className="py-5 max-lg:col-start-2 max-lg:p-0">
                        <span className="type-body-s block max-w-[52ch] text-muted">Not scored: {r.reason}.</span>
                      </td>
                    </>
                  )
                ) : (
                  <td className="py-5 max-lg:col-start-2 max-lg:p-0">
                    {judged ? (
                      <span className="type-body-s text-muted">Judged</span>
                    ) : (
                      <span className="flex flex-col items-start gap-2">
                        <Tag dashed>{r.status === "stale" ? "stale" : "untested"}</Tag>
                        <span className="type-body-s text-muted">Not scored: {r.reason}.</span>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {anyUntested && (
        <p className="type-body-s measure m-0 mt-4 text-faint">
          Untested means the evidence checklist is incomplete or the vendor is not judged yet; it is not a low score.
        </p>
      )}
    </div>
  );
}
