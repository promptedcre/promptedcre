import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";
import { RevisionCloud } from "./drafting";

// Terminal: the well for real engine output (the recorded run, a command to copy, a sample report).
// Fill it with TermLine. Only real output from getDemoRun() or the engine goes in; never a mock-up.
export function Terminal({
  children,
  title,
  note,
  label,
  className,
}: {
  children: ReactNode;
  title?: ReactNode;
  note?: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cx("min-w-0 overflow-clip rounded-box border border-line-strong bg-inset", className)}
      style={{ "--dim-surface": "var(--bg-inset)" } as CSSProperties}
    >
      {(title || note) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-strong px-4 py-3 sm:px-6">
          {title && <span className="type-label text-faint [&_b]:text-text">{title}</span>}
          {note}
        </div>
      )}
      <div aria-label={label} role={label ? "group" : undefined} className="type-code flex flex-col gap-1 px-4 py-4 text-muted sm:px-6">
        {children}
      </div>
    </div>
  );
}

const ACTORS = "principal|counsel|cpa|lender|title|consultant|investor|broker|agency";
const TINT = new RegExp(`(\\(agent\\)|\\((?:${ACTORS})\\)|/)`, "g");

// Colors "(agent)" and "(principal)" the way the rest of the site does, and lets a
// long slug break after each slash on a phone.
function tint(text: string): ReactNode {
  // split() with one capturing group puts the matches at the odd indexes.
  return text.split(TINT).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part === "/") return <Fragment key={i}>/<wbr /></Fragment>;
    return (
      <span key={i} className={part === "(agent)" ? "text-agent-text" : "text-human-text"}>
        {part}
      </span>
    );
  });
}

// TermLine: one line of a Terminal. "command" is what was typed, with who ran it; "output" is what the engine
// printed (pre-wrapped, tinted); "refused" circles a refusal in a RevisionCloud. Use one refused line per view.
export function TermLine({
  kind,
  children,
  actor,
  delta,
  note = "Refused",
  className,
}: {
  kind: "command" | "output" | "refused";
  children: ReactNode;
  actor?: string | null;
  delta?: string | number;
  note?: ReactNode;
  className?: string;
}) {
  const body = typeof children === "string" ? tint(children) : children;
  if (kind === "command") {
    return (
      <div className={cx("mt-3 flex flex-wrap items-baseline gap-x-3 first:mt-0", className)}>
        <span className="min-w-0 break-words font-medium text-text [overflow-wrap:anywhere]">
          <span aria-hidden="true" className="select-none text-accent">
            ${" "}
          </span>
          {body}
        </span>
        {actor && <span className="type-label text-faint">{actor === "agent" ? "Agent" : `By ${actor}`}</span>}
      </div>
    );
  }
  if (kind === "refused") {
    return (
      <RevisionCloud delta={delta} className={cx("my-2 mr-3 text-text", className)}>
        <span className="type-label mb-1 block text-danger">{note}</span>
        <span className="block whitespace-pre-wrap [overflow-wrap:anywhere]">{body}</span>
      </RevisionCloud>
    );
  }
  if (typeof children === "string") {
    // An output line given as text hangs: its own leading spaces become a left inset and every
    // wrapped continuation sits 2ch further in, so a wrapped line never reads as a new line.
    const lines = children.split("\n");
    return (
      <div className={cx("[overflow-wrap:anywhere]", className)}>
        {lines.map((line, i) => {
          const lead = /^ */.exec(line)?.[0].length ?? 0;
          return (
            <div key={i} className="whitespace-pre-wrap" style={{ paddingLeft: `${lead + 2}ch`, textIndent: "-2ch" }}>
              {line.length > lead ? tint(line.slice(lead)) : " "}
            </div>
          );
        })}
      </div>
    );
  }
  return <div className={cx("whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>{body}</div>;
}
