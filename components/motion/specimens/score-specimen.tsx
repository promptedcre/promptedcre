import type { ParsedCheckOutcome, ParsedFindings } from "@/lib/demo/findings";
import { SequenceControls, SequenceRoot } from "../sequence-root";
import { SpecimenBoxGlyph } from "./parts";
import { SpecimenStyles } from "./specimen-styles";

// M4, the audit's score, as a specimen: one box per check of the finished audit in the
// recorded run (lib/demo/findings.ts parses the engine's own findings.md). Each box is a
// step whose data-seq-step is its outcome; the "score" choreography inks the clear ones,
// then the findings, then the unverified, in under 1.2 seconds. The figure beside the
// boxes does not move: a number that counts up is a number nobody measured.

const OUTCOME_WORD: Record<ParsedCheckOutcome, string> = {
  clear: "clear",
  finding: "finding",
  unverified: "unverified",
  "not-applicable": "not applicable",
  "not-checked": "not checked",
};

// What the key says about each box: the shape first, so the outcome never rests on color.
const KEY: Partial<Record<ParsedCheckOutcome, string>> = {
  clear: "Clear: a check",
  finding: "Finding: a slash",
  unverified: "Unverified: hatched",
  "not-applicable": "Not applicable: an empty box",
  "not-checked": "Not checked: an empty box",
};

export function ScoreKey({ outcomes }: { outcomes: ParsedCheckOutcome[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0" aria-label="Key to the boxes">
      {outcomes.map((o) => (
        <li key={o} className="type-label flex items-center gap-2 text-muted">
          <span className={`sp-box sp-box--key sp-box--${o}`} aria-hidden="true">
            <SpecimenBoxGlyph outcome={o} />
          </span>
          {KEY[o]}
        </li>
      ))}
    </ul>
  );
}

export function ScoreSpecimen({ doc, firm, recordedOn }: { doc: ParsedFindings; firm: string; recordedOn: string }) {
  const { score, checks } = doc;
  return (
    <SequenceRoot as="figure" name="score" className="sp-sheet m-0 min-w-0 border border-line-strong bg-raised">
      <SpecimenStyles />
      <div className="grid gap-x-12 gap-y-6 px-4 py-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:px-6">
        <p className="m-0 flex items-baseline gap-3">
          <span className="type-figure text-text">{score.clear}</span>
          <span className="type-body-s text-muted">
            of {score.total} checks clear
          </span>
        </p>
        <div className="min-w-0">
          <ol className="sp-score" style={{ gridTemplateColumns: `repeat(${checks.length}, minmax(0, 1fr))` }} aria-label={`Score: ${score.line}`}>
            {checks.map((c) => (
              <li key={c.id} data-seq-step={c.outcome} className="min-w-0">
                <span data-ink="" className={`sp-box sp-box--${c.outcome}`} aria-hidden="true">
                  <SpecimenBoxGlyph outcome={c.outcome} />
                </span>
                <span className="type-data mt-2 block text-center text-faint" aria-hidden="true">
                  {c.n}
                </span>
                <span className="sr-only">
                  Check {c.n}, {c.title}: {OUTCOME_WORD[c.outcome]}
                </span>
              </li>
            ))}
          </ol>
          <p className="type-data m-0 mt-4 text-text">{score.line}</p>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-strong px-4 py-3 md:px-6">
        <p className="type-body-s m-0 max-w-[68ch] text-muted">
          The audit the recorded run finished on {firm}, a fictional firm, <time dateTime={recordedOn}>{recordedOn}</time>.
        </p>
        <SequenceControls />
      </figcaption>
    </SequenceRoot>
  );
}
