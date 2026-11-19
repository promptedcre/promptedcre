"use client";

// The page body every calculator shares, in one structure:
//
//   the answer     one sentence, the page's h2
//   the inputs     the form (components/calc/fields.tsx)
//   the figures    one sheet: a lead figure, ruled cells of computed values, the drawings,
//                  and a title block that says what the sheet was drawn from, how the
//                  worked example was checked and what an agent calls
//   the rest       schedules and the working, as later sections
//
// On a phone that is the reading order, and the answer holds at the foot of the screen
// while the form is on it. From 1024 px the answer and the figures stand left of the form
// and hold in view while they fit the window.
//
// One input that does not read never blanks the page. The last result that read stays,
// dimmed, and the page says so next to it: the list of what to fix stands over the figures,
// and where the form comes between the answer and the figures (under 1024 px) the form's
// own state line, right under the answer, says it too. Nothing is called an error until the
// reader has paused for a moment or left the field, and a screen reader hears it once, from
// the one quiet live line.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ZodError } from "zod";
import { Sheet, SheetPart } from "@/components/ui/sheet";
import { TitleBlock, TitleCell } from "@/components/ui/title-block";
import { CalcState, FixList, fixCount, fixLine, type FixLabels } from "./fields";
import { FigureCells, LeadFigure, type Headline } from "./figures";
import { Moves } from "./motion";
import type { SheetSlots } from "./trace-view";

type Issue = ZodError["issues"][number];

// What is wrong with the inputs: what to say in place of an answer, and what to fix.
export type Problem = { say: string; issues: Issue[]; labels: FixLabels };

// How long a value may fail to read, with the caret still in the form, before it is called an error.
const PAUSE_MS = 400;
// How long the answer must rest before a screen reader is told it changed.
const SETTLE_MS = 700;

// The last result that read. `key` names the inputs (the form's state as JSON); `live` is
// the result for them, or null while they do not read.
export function useHeld<T>(key: string, live: T | null): T | null {
  const [last, setLast] = useState<{ key: string; value: T } | null>(() => (live === null ? null : { key, value: live }));
  if (live !== null && last?.key !== key) setLast({ key, value: live });
  return live ?? last?.value ?? null;
}

export function CalcSheet({
  head,
  checked,
  toolId,
  tool,
  state,
  changed,
  problem,
  headline,
  lead,
  cells = [],
  figures,
  inputs,
  children,
}: SheetSlots & {
  tool?: string | null;
  // the form's state as JSON: it changes with every edit
  state: string;
  // the inputs are no longer the worked example's
  changed: boolean;
  // null while the inputs read
  problem: Problem | null;
  // the answer in one sentence: the last one that read, while the inputs do not
  headline: string | null;
  lead?: Headline | null;
  cells?: Headline[];
  // the drawings and notes of the figures sheet, each a part of it (Drawing, CellsPart, Words)
  figures?: ReactNode;
  inputs: ReactNode;
  children?: ReactNode;
}) {
  const invalid = problem !== null;

  // The inputs behind the result on screen: it moves on only when a new result reads.
  const [stamp, setStamp] = useState(state);
  if (!invalid && stamp !== state) setStamp(state);

  // Errors wait for a pause in typing, or for the caret to leave the field.
  const [shown, setShown] = useState(false);
  if (!invalid && shown) setShown(false);
  useEffect(() => {
    if (!invalid || shown) return;
    const t = window.setTimeout(() => setShown(true), PAUSE_MS);
    return () => window.clearTimeout(t);
  }, [invalid, shown, state]);
  const stale = invalid && shown && headline !== null;
  const blank = invalid && headline === null;

  // What a screen reader hears: the answer once it has rested, not every keystroke.
  const first = problem?.issues[0];
  const fix = problem && first ? fixLine(first, problem.labels) : null;
  const saying = invalid && (shown || blank) ? `${fixCount(problem.issues.length)}${fix ? `: ${fix.label}: ${fix.says}` : "."}` : (headline ?? "");
  const [said, setSaid] = useState(saying);
  useEffect(() => {
    const t = window.setTimeout(() => setSaid(saying), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [saying]);

  // From 1024 px the answer and the figures hold beside the form while it scrolls: from
  // their top while they fit the window, and from their foot when they are taller than it
  // (the drawings stay; the answer then repeats under the form). The rule that holds them
  // (.calc-result) needs their height, which is written here; with scripts off it is
  // absent and nothing holds.
  const unit = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = unit.current;
    if (!el) return;
    const watch = new ResizeObserver(() => el.style.setProperty("--calc-h", `${el.offsetHeight}px`));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // The answer repeats at the foot of the form only while the answer itself is off screen.
  const answer = useRef<HTMLDivElement>(null);
  const [answerSeen, setAnswerSeen] = useState(true);
  useEffect(() => {
    const el = answer.current;
    if (!el) return;
    const watch = new IntersectionObserver((entries) => setAnswerSeen(entries.at(-1)?.isIntersecting ?? true), { rootMargin: "-64px 0px 0px 0px" });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const drawnFrom = stale ? "Your last inputs that read" : changed ? "Your inputs" : "The worked example";
  const hasSheet = !blank && (lead || cells.length > 0 || figures);

  return (
    <CalcState value={{ shown: shown || blank, fixes: stale && problem ? problem.issues.length : 0 }}>
      {head}
      <Moves stamp={stamp}>
        <section aria-labelledby="result-title" className="calc-tool mt-8 md:mt-10" data-stale={stale ? "" : undefined}>
          <p className="sr-only" aria-live="polite">
            {said}
          </p>
          <div ref={unit} className="calc-result">
            <div ref={answer} className="calc-answer">
              <h2 id="result-title" className="type-title-l measure m-0 text-text">
                {headline ?? problem?.say}
              </h2>
            </div>
            <div className="calc-figures">
              {problem && (stale || blank) && (
                <div className="calc-fix mb-6">
                  <FixList issues={problem.issues} labels={problem.labels} held={stale} />
                </div>
              )}
              {hasSheet && (
                <div className="calc-held">
                  <Sheet
                    as="div"
                    flush
                    label="Figures"
                    titleBlock={
                      <TitleBlock label="About these figures">
                        <TitleCell label="Drawn from">{drawnFrom}</TitleCell>
                        {checked && (
                          <TitleCell label="Checked">
                            <a href="#method" className="link link--muted -my-3 inline-block py-3">
                              {checked}
                            </a>
                          </TitleCell>
                        )}
                        <TitleCell label="Runs">In your browser</TitleCell>
                        {tool && (
                          <TitleCell label="For your agent">
                            <code className="type-data">{tool}</code>
                            {toolId && (
                              <>
                                {" "}
                                {/* a long id breaks at its hyphen: held on one line it ran out of its cell and was cut */}
                                with id <code className="type-data">{toolId}</code>
                              </>
                            )}
                          </TitleCell>
                        )}
                      </TitleBlock>
                    }
                  >
                    {lead && (
                      <SheetPart>
                        <LeadFigure lead={lead} />
                      </SheetPart>
                    )}
                    <FigureCells cells={cells} />
                    {figures}
                  </Sheet>
                </div>
              )}
            </div>
          </div>
          <div className="calc-form" onBlur={() => invalid && setShown(true)}>
            {inputs}
            {/* While the form is on screen the answer holds at the foot of it, so a change
                shows its effect; past the form it rests under it. It is drawn only while
                the answer itself is off screen. */}
            <div aria-hidden="true" data-off={answerSeen ? "" : undefined} className="calc-bar print:hidden">
              <p data-pulse="">
                <span className="type-label flex-none text-faint">{stale && problem ? fixCount(problem.issues.length) : "Result"}</span>
                <span className="type-body-s min-w-0 text-text">{stale && fix ? `${fix.label}: ${fix.says}` : (headline ?? problem?.say)}</span>
              </p>
            </div>
          </div>
        </section>
        {children && (
          <div className="calc-after" data-stale={stale ? "" : undefined}>
            {children}
          </div>
        )}
      </Moves>
    </CalcState>
  );
}
