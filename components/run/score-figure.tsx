import type { CSSProperties } from "react";
import { SequenceControls, SequenceRoot } from "@/components/motion";
import { CountUp, DimensionLine, Icon, cx, type IconName } from "@/components/ui";
import type { ParsedCheckOutcome, ParsedFindings } from "@/lib/demo/findings";
import { FINDING_STATUSES } from "@/lib/schemas/firm";
import { OUTCOME_WORD, capital } from "./doc-parts";

// ScoreFigure: an audit's score as a drawing. One lead figure (the checks that are clear),
// one box per check under a dimension line, the arithmetic that adds the boxes up, and a
// key. Every number is counted from the findings file the engine wrote. Pure.
//
// The boxes are keyed by shape as well as color: a check for clear, a cross for a finding,
// hatching for unverified, a dashed outline for a check nobody has answered yet.
//
// It is a sequence (docs/MOTION.md, M4): each box is a step named by its outcome, and the
// "score" choreography inks the clear ones, then the findings, then the unverified, in
// under 1.2 seconds, once, when half the figure is in view. Since D227 the figure beside the
// boxes counts up once on its own (CountUp, outside the sequence). With scripts off or
// reduced motion it is simply finished.
//
// A box in pencil is still its own outcome: its outline in the outcome's ink, its fill (or
// its hatching) at a third of its strength, and its glyph in the faint ink under the one
// that is drawn. It is never the dashed outline, which the key gives to a check nobody has
// answered: the drawing must not say that while the sentence under it says "7 clear".
//
// It is a size container: the figure sits beside the boxes when there is room for both
// (36rem), and above them otherwise. `compact` keeps it above at every width.

const ORDER: ParsedCheckOutcome[] = ["clear", "finding", "unverified", "not-applicable", "not-checked"];

const outcomeCount = (o: ParsedCheckOutcome, k: number) => `${k} ${o === "finding" && k !== 1 ? "findings" : OUTCOME_WORD[o]}`;

// The score's arithmetic, counted from the file: "7 clear + 3 findings + 1 unverified =
// 11 checks", and where there are findings, "Findings: 2 open, 1 fixed".
export function scoreArithmetic(doc: ParsedFindings): { sum: string; findings: string | null } {
  const parts = ORDER.map((o) => ({ o, k: doc.checks.filter((c) => c.outcome === o).length }))
    .filter(({ k }) => k > 0)
    .map(({ o, k }) => outcomeCount(o, k));
  const n = doc.checks.length;
  const byStatus = FINDING_STATUSES.map((s) => ({ s, k: doc.findings.filter((f) => f.status === s).length }))
    .filter(({ k }) => k > 0)
    .map(({ s, k }) => `${k} ${s}`);
  return {
    sum: `${parts.join(" + ")} = ${n} ${n === 1 ? "check" : "checks"}`,
    findings: byStatus.length > 0 ? `Findings: ${byStatus.join(", ")}` : null,
  };
}

/** "The 11 checks: 7 clear, 3 findings, 1 unverified", counted from the file. */
export function checksSummary(doc: ParsedFindings): string {
  const n = doc.checks.length;
  const counts = ORDER.map((o) => ({ o, k: doc.checks.filter((c) => c.outcome === o).length }))
    .filter(({ k }) => k > 0)
    .map(({ o, k }) => outcomeCount(o, k));
  return `The ${n} ${n === 1 ? "check" : "checks"}: ${counts.join(", ")}`;
}

// The glyph drawn in a box: the shape that says the outcome without its color.
const GLYPH: Partial<Record<ParsedCheckOutcome, IconName>> = { clear: "check", finding: "close" };

const CSS = `@layer components {
.sf{container:sf / inline-size;min-width:0}
.sf-lay{display:grid;grid-template-columns:minmax(0,1fr);gap:1.25rem 2.5rem;align-items:end}
.sf-lead{display:flex;align-items:baseline;gap:.75rem;margin:0}
.sf-boxes{display:grid;gap:.375rem;margin:.25rem 0 0;padding:0;list-style:none}
.sf-box{position:relative;display:grid;place-items:center;height:2.5rem;color:var(--accent-ink);box-shadow:inset 0 0 0 1px var(--sf-ink,transparent)}
.sf-box::before{content:"";position:absolute;inset:0;transition:opacity var(--dur-2) var(--ease-out)}
.sf-box,.sf-box::before{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sf-box>svg{position:relative;grid-area:1 / 1}
.sf-box--clear{--sf-ink:var(--accent)}
.sf-box--clear::before{background-color:var(--accent)}
.sf-box--finding{--sf-ink:var(--warn)}
.sf-box--finding::before{background-color:var(--warn)}
.sf-box--unverified{--sf-ink:var(--accent)}
.sf-box--unverified::before{color:var(--accent);background-image:var(--hatch)}
.sf-box--not-applicable{--sf-ink:var(--line-bold)}
.sf-box--not-checked{outline:1px dashed var(--text-faint);outline-offset:-1px}
.sf-box>.sf-pencil{color:var(--text-faint);opacity:0;transition:opacity var(--dur-2) var(--ease-out)}
.sf-box--key{display:inline-grid;flex:none;width:1.25rem;height:1.25rem}
.sf-n{display:block;margin-top:.25rem;text-align:center;color:var(--text-faint)}
.sf-foot{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1.5rem;margin-top:.75rem}
.sf-key{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin:0;padding:0;list-style:none}
.sf-key>li{display:flex;align-items:center;gap:.5rem;color:var(--text-muted)}
.sf-ctl{display:flex}
@media screen{
[data-inked="false"] .sf-box[data-ink]::before{opacity:.3}
[data-inked="false"] .sf-box[data-ink]>.sf-pencil{opacity:1}
html[data-motion="full"] .sf-ctl{min-width:9.5rem;min-height:2.75rem}
}
@container sf (min-width:36rem){.sf-lay:not(.sf-lay--stack){grid-template-columns:auto minmax(0,1fr)}}
}`;

function ScoreStyles() {
  return (
    <style href="score-figure" precedence="default">
      {CSS}
    </style>
  );
}

// `draw` is a box that takes its turn in the sequence: the glyph twice, in pencil under the
// ink one that is drawn. A box in the key is the plain glyph.
function Glyph({ outcome, draw = false }: { outcome: ParsedCheckOutcome; draw?: boolean }) {
  const name = GLYPH[outcome];
  if (!name) return null;
  return (
    <>
      {draw && <Icon name={name} className="sf-pencil" />}
      <Icon name={name} draw={draw} />
    </>
  );
}

export function ScoreFigure({
  doc,
  compact = false,
  className,
}: {
  doc: ParsedFindings;
  /** Keep the figure above the boxes at every width. */
  compact?: boolean;
  /** @deprecated The figure reads its own width now; the prop is accepted and ignored. */
  narrowAtXl?: boolean;
  className?: string;
}) {
  const { score, checks } = doc;
  const { sum, findings } = scoreArithmetic(doc);
  const present = ORDER.filter((o) => checks.some((c) => c.outcome === o));
  const columns: CSSProperties = { gridTemplateColumns: `repeat(${checks.length}, minmax(0, 1fr))` };
  return (
    <SequenceRoot name="score" className={cx("sf", className)}>
      <ScoreStyles />
      <div className={cx("sf-lay", compact && "sf-lay--stack")}>
        <p className="sf-lead">
          {/* D227: the figure counts up once in view; the server's HTML and the accessible text are the figure. */}
          <CountUp value={score.clear} className="type-figure text-text" />
          <span className="type-body-s text-muted">
            of {score.total} {score.total === 1 ? "check" : "checks"} clear
          </span>
        </p>
        <div className="min-w-0">
          <DimensionLine>
            {checks.length} {checks.length === 1 ? "check" : "checks"}
          </DimensionLine>
          <ol className="sf-boxes" style={columns} aria-label={`Score: ${score.line}`}>
            {checks.map((c) => (
              <li key={c.id} data-seq-step={c.outcome} title={`${c.n}. ${c.title}: ${OUTCOME_WORD[c.outcome]}`} className="min-w-0">
                <span data-ink="" className={`sf-box sf-box--${c.outcome}`} aria-hidden="true">
                  <Glyph outcome={c.outcome} draw />
                </span>
                <span className="sf-n type-data" aria-hidden="true">
                  {c.n}
                </span>
                <span className="sr-only">
                  Check {c.n}, {c.title}: {OUTCOME_WORD[c.outcome]}
                </span>
              </li>
            ))}
          </ol>
          <p className="type-body-s m-0 mt-4 tabular-nums text-text">{sum}</p>
          {findings && <p className="type-body-s m-0 mt-1 tabular-nums text-muted">{findings}</p>}
          {/* The control's place is held from the first paint (when the reader allows motion),
              so the figure does not grow when Pause and Replay arrive. */}
          <div className="sf-foot">
            <ul className="sf-key" aria-label="Key to the boxes">
              {present.map((o) => (
                <li key={o} className="type-label">
                  <span className={`sf-box sf-box--key sf-box--${o}`} aria-hidden="true">
                    <Glyph outcome={o} />
                  </span>
                  {capital(OUTCOME_WORD[o])}
                </li>
              ))}
            </ul>
            <div className="sf-ctl print:hidden">
              <SequenceControls />
            </div>
          </div>
        </div>
      </div>
    </SequenceRoot>
  );
}
