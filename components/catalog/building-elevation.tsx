import type { CSSProperties } from "react";
import { DimensionLine, cx } from "@/components/ui";
import type { SiteFacts } from "@/lib/compute/site-facts";
import { STRUCTURES, type Structure } from "@/lib/schemas/common";

// BuildingElevation: the life of a firm, drawn as an elevation. Six bays, one per phase; one
// floor per process playbook, the first at the bottom, standing on one ground line. A written
// floor is solid and filled to its agent share for the structure in view (the fill is the
// picture; no percentage is printed); an outlined floor is dashed. Beside each bay a vertical
// dimension gives its height in floors (the playbooks listed in the phase); under the ground the
// words give how many are written and outlined. Both are counted from the catalog.
//
// It sits on a page that already lists every playbook by title, so the floors carry no text
// (the title is a tooltip) and are not links, and the figure is one picture with a spoken
// summary of its counts, so a screen reader is not read the list twice. Put it in a Sheet with
// the grid: the drawing is the sheet's drawing area, and its title block says what it counts.
//
// Six bays from 1280 px; three from 640 px; two on a phone, each row on its own ground.

const FLOOR = { outlined: 9, written: 15, gap: 2 } as const;

/**
 * The building. Inside a [data-structure] root every structure's fill is rendered and the root picks one;
 * pass `structure` to draw one structure only. `labelId` names the figure (give it the id of a visible heading).
 */
export function BuildingElevation({
  facts,
  structure,
  labelId,
  className,
}: {
  facts: Pick<SiteFacts, "phases" | "records">;
  structure?: Structure;
  labelId?: string;
  className?: string;
}) {
  const share = new Map(facts.records.map((r) => [r.slug, r.byStructure]));
  const structures = structure ? [structure] : STRUCTURES;
  const ds = (s: Structure) => (structure ? {} : { "data-s": s });
  const counts = (p: { written: number; outlined: number }) => (p.outlined > 0 ? `${p.written} written, ${p.outlined} outlined` : `${p.written} written`);
  const summary = facts.phases.map((p) => `${p.label}: ${counts(p)}`).join("; ");
  const anyOutlined = facts.phases.some((p) => p.outlined > 0);

  return (
    <figure
      aria-labelledby={labelId}
      // the fill is the drawing's one meaning, and a browser drops backgrounds on paper: print it
      className={cx("m-0 min-w-0 print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]", className)}
      style={{ "--floor": `${FLOOR.outlined}px`, "--floor-w": `${FLOOR.written}px` } as CSSProperties}
    >
      <figcaption className="type-label mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-muted">
        <span className="sr-only">{summary}.</span>
        <span aria-hidden="true" className="inline-flex items-center gap-2">
          <i className="flex h-3 w-7 flex-none border border-agent-mid bg-human-deep">
            <i className="block w-3/5 bg-agent-mid" />
          </i>
          Written, filled to what an agent can do
        </span>
        {anyOutlined && (
          <span aria-hidden="true" className="inline-flex items-center gap-2">
            <i className="block h-3 w-7 flex-none border border-dashed border-line-bold" />
            Outlined, not written yet
          </span>
        )}
      </figcaption>

      {/* Each bay: the floors, and beside them a vertical dimension of the bay's height in floors
          (the scale is 1 floor = 1 playbook); the words under the ground say how many are written. */}
      <ol aria-hidden="true" className="m-0 grid min-w-0 list-none grid-cols-2 gap-y-10 p-0 sm:grid-cols-3 xl:grid-cols-6">
        {facts.phases.map((phase) => (
          <li key={phase.phase} className="flex min-w-0 flex-col px-2">
            {/* the bay stands on the ground (mt-auto); the dimension is as tall as its own floors */}
            <div className="mt-auto flex items-stretch gap-x-1">
              <ol className="m-0 flex min-w-0 flex-1 list-none flex-col-reverse p-0" style={{ gap: FLOOR.gap }}>
                {phase.playbooks.map((pb) => {
                  const by = pb.depth === "full" ? share.get(pb.slug) : undefined;
                  return (
                    <li
                      key={pb.slug}
                      title={pb.title}
                      className={cx(
                        "relative min-w-0 overflow-hidden",
                        by ? "h-[var(--floor-w)] border border-agent-mid bg-human-deep" : "h-[var(--floor)] border border-dashed border-line-bold",
                      )}
                    >
                      {by &&
                        structures.map((s) =>
                          by[s].pct === null ? null : (
                            <span
                              key={s}
                              {...ds(s)}
                              className="absolute inset-y-0 left-0 bg-agent-mid"
                              style={{ width: `${by[s].pct}%` }}
                            />
                          ),
                        )}
                    </li>
                  );
                })}
              </ol>
              <DimensionLine orientation="v" className="flex-none self-stretch">
                {phase.playbooks.length}
              </DimensionLine>
            </div>
            {/* the ground: one heavy line under each bay, so a row of bays stands on one line */}
            <div className="-mx-2 mt-1 border-t border-line-bold" />
            <div className="pt-3">
              <p className={cx("type-label m-0", phase.written === 0 ? "text-muted" : "text-text")}>{phase.label}</p>
              <p className="type-label m-0 mt-1 tabular-nums text-faint">
                {counts(phase)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
