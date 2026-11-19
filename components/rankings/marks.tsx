import { cx } from "@/components/ui";
import type { VerdictLevel } from "@/lib/schemas/rankings";
import { FACTOR } from "@/lib/scoring/score";
import { VERDICT_LABEL } from "./labels";

export type MarkKind = VerdictLevel | "untested";

export const MARK_LABEL: Record<MarkKind, string> = { ...VERDICT_LABEL, untested: "untested" };

// The same words standing alone as a label, with their capital ("Partial", "Not applicable");
// inside a sentence MARK_LABEL stays lower case.
export const MARK_WORD = Object.fromEntries(
  Object.entries(MARK_LABEL).map(([k, w]) => [k, w.charAt(0).toUpperCase() + w.slice(1)]),
) as Record<MarkKind, string>;

// Shape carries the meaning and color confirms it, so no verdict rests on color alone:
// full is a solid square, partial a half-filled one, none an empty outline, disputed a red
// diamond, not applicable a dash, and untested a dashed outline (drawn next).
const SHAPE: Record<MarkKind, string> = {
  full: "border border-agent bg-agent",
  partial: "border border-agent bg-[linear-gradient(to_top,var(--agent)_50%,transparent_50%)]",
  none: "border border-faint",
  disputed: "rotate-45 scale-[0.78] border-[1.5px] border-danger bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]",
  na: "",
  untested: "border border-dashed border-faint",
};

// VerdictMark: one story's verdict as a small drawn mark. `label` replaces the screen-reader
// text (for example "Official MCP server: partial"); by default it is the verdict's word.
export function VerdictMark({
  v,
  size = "md",
  label,
  className,
}: {
  v: MarkKind;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const text = label ?? MARK_LABEL[v];
  return (
    <span className={cx("relative inline-grid flex-none place-items-center align-middle", size === "sm" ? "size-[10px]" : "size-3", className)} title={text}>
      <span aria-hidden="true" className={cx("block size-full", SHAPE[v])}>
        {v === "na" && <span className="absolute left-[15%] right-[15%] top-1/2 block h-[1.5px] -translate-y-1/2 bg-faint" />}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

// VerdictLegend: the key to the marks, shown once beside a schedule or a list of verdicts.
// `factors` adds what each verdict multiplies a story's weight by (from lib/scoring/score.ts).
export function VerdictLegend({
  kinds = ["full", "partial", "disputed", "none", "na"],
  factors = false,
  className,
}: {
  kinds?: MarkKind[];
  factors?: boolean;
  className?: string;
}) {
  return (
    <ul className={cx("type-label m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-muted", className)} aria-label="Key to the verdict marks">
      {kinds.map((k) => (
        <li key={k} className="inline-flex items-center gap-2 whitespace-nowrap">
          <VerdictMark v={k} label="" />
          <span>{MARK_WORD[k]}</span>
          {factors && k !== "untested" && (
            <span className={k === "na" ? "text-faint" : "type-data text-faint"}>{k === "na" ? "left out" : `× ${FACTOR[k]}`}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
