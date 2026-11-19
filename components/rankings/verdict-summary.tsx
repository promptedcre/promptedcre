import type { CSSProperties } from "react";
import { cx } from "@/components/ui";
import type { AnyStory, VerdictLevel } from "@/lib/schemas/rankings";
import { storyKey } from "./labels";
import { MARK_LABEL, VerdictMark } from "./marks";
import type { RankedRow } from "./summary";

const ORDER: VerdictLevel[] = ["full", "partial", "disputed", "none", "na"];

// VerdictSummary: one judged vendor's verdicts at a glance, one mark per task grouped as the
// market table's columns are, each mark a link to that task's verdict on the same page
// (#story-<id>), with each group's score. Ruled rows, no frame: it sits inside the vendor's
// sheet. Every value comes from the row's computed result. Render it only for a judged vendor.
// Its heading is an h2 (the first heading under the vendor's h1), set as a quiet label. A mark
// lights softly in a rounded well under the pointer (D230), and inside a reveal the marks
// arrive one after another (stagger-in, by --i); scripts off, less motion and paper get them
// in place.
export function VerdictSummary({ row, stories, className }: { row: RankedRow; stories: AnyStory[]; className?: string }) {
  const groups = storyKey(stories);
  const byStory = new Map(row.result.cells.map((c) => [c.story.id, c.verdict.verdict]));
  return (
    <div className={cx("min-w-0", className)}>
      <h2 className="type-label m-0 text-muted">Verdicts at a glance</h2>
      <ul className="m-0 mt-3 list-none border-t border-line-strong p-0">
        {groups.map((g) => {
          const score = row.result.groups[g.group];
          return (
            <li key={g.group} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-3">
              <span className="min-w-0">
                <span className="type-body-s block text-text">{g.label}</span>
                {/* From 768 px each mark jumps to its verdict; on a phone, where a 44 px target per
                    mark would scatter them, the marks are a picture and the verdicts follow below. */}
                <span className="stagger-in mt-1 hidden flex-wrap md:flex">
                  {g.stories.map(({ story, code }, i) => {
                    const v = byStory.get(story.id) ?? "untested";
                    // The wrapper takes the stagger's transition, the link its own colour change.
                    return (
                      <span key={story.id} style={{ "--i": i } as CSSProperties} className="inline-flex">
                        <a href={`#story-${story.id}`} className="grid size-7 place-items-center rounded-chip transition-colors hover:bg-panel">
                          <VerdictMark v={v} label={`Task ${code}, ${story.title}: ${MARK_LABEL[v]}`} />
                        </a>
                      </span>
                    );
                  })}
                </span>
                <span className="stagger-in mt-2 flex flex-wrap gap-2 md:hidden">
                  {g.stories.map(({ story, code }, i) => {
                    const v = byStory.get(story.id) ?? "untested";
                    return (
                      <span key={story.id} style={{ "--i": i } as CSSProperties} className="inline-flex">
                        <VerdictMark v={v} label={`Task ${code}, ${story.title}: ${MARK_LABEL[v]}`} />
                      </span>
                    );
                  })}
                </span>
              </span>
              <span className="type-title-s tabular-nums text-text">
                {score ?? <span className="type-body-s text-faint">Not applicable</span>}
                <span className="sr-only"> {g.label} score</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// VerdictTally: how many verdicts of each kind, each count beside its mark, so the tally also
// keys the marks at a glance. It sits under the score's scale on the vendor's sheet.
export function VerdictTally({ row, className }: { row: RankedRow; className?: string }) {
  const counts = ORDER.map((v) => ({ v, n: row.result.cells.filter((c) => c.verdict.verdict === v).length })).filter((c) => c.n > 0);
  return (
    <p className={cx("type-body-s m-0 flex flex-wrap gap-x-5 gap-y-2 text-muted", className)}>
      {counts.map((c) => (
        <span key={c.v} className="inline-flex items-center gap-2 whitespace-nowrap">
          <VerdictMark v={c.v} label="" />
          <span>
            <span className="tabular-nums text-text">{c.n}</span> {MARK_LABEL[c.v]}
          </span>
        </span>
      ))}
    </p>
  );
}
