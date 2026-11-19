// Figures in the data face, words as words. A calculator hands the page strings that mix the
// two (a line of the working, a table cell, a dimension's label); figureRuns
// (components/calc/format.ts) says which part is which and this sets each in its face. Pure:
// the client calculators and the server previews share it.

import { Fragment } from "react";
import { figureRuns, type CountAs } from "./format";

// PV(, PMT(, FV(, IRR( ... a step brighter, so a formula reads like a spreadsheet cell.
function Call({ text }: { text: string }) {
  const parts = text.split(/\b(PV|PMT|FV|IRR|IPMT|PPMT|XIRR)(?=\()/);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <span key={i} className="text-text">
        {p}
      </span>
    ) : (
      p
    ),
  );
}

// `ground` is the face the surrounding element already sets. On "words" (the default) each
// figure is wrapped in the data face. On "data" (a dimension line's label, which the
// foundation sets in the data face) the words are wrapped instead, in the label role at the
// label's own line height. A string that is all one or the other comes back unwrapped.
export function Figured({
  text,
  counts = "figure",
  ground = "words",
  calls = false,
}: {
  text: string;
  counts?: CountAs;
  ground?: "words" | "data";
  // brighten spreadsheet function names
  calls?: boolean;
}) {
  return figureRuns(text, counts).map((r, i) => {
    const inner = r.figure && calls ? <Call text={r.text} /> : r.text;
    if (r.figure === (ground === "data")) return <Fragment key={i}>{inner}</Fragment>;
    return (
      <span key={i} className={r.figure ? "type-data" : "type-label leading-4"}>
        {inner}
      </span>
    );
  });
}
