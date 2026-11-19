import type { CSSProperties, ReactNode } from "react";
import { SequenceControls, SequenceRoot } from "@/components/motion";
import { Disclosure, Icon, LaneTag, Outcome, PropertyLine, RevisionCloud, Sheet, TextLink, cx, type IconName } from "@/components/ui";
import { getCorpus } from "@/lib/content/load";
import { boardItems, buildBoard, type BoardRow, type BoardScene } from "@/lib/demo/board";
import { getDemoRun } from "@/lib/demo/load";
import { OutcomeBox } from "./doc-parts";
import { OutputText, hangOf, outputLines } from "./output-text";
import { SceneStepper } from "./run-enhance";

// The recorded run in plain words, operator first (lib/demo/board.ts reads it).
//
// RunBoard: one scene on two lanes, "Your agent" and "A person", with the property line
// between them and time running down the sheet. Whose step a row is, is said three ways and
// never by a colored stripe: the lane it sits in, the role mark, and the lane word. Every
// row's number sits in one column down its lane, and what happened is said by a glyph and
// a line: a check where it went through, a cross for a finding, hatching for unverified.
// A refused attempt sits in the agent's lane inside the revision cloud, the one outlined
// shape on the board, joined by "Then" to the row where a person picks it up. A command
// that only reads (a list, a status, the score) is a thin band across both lanes, so the
// lanes carry only work. The engine's own command and output are one fold away under every
// row. The board is a size container: under 40rem it is one column in recorded order, and
// each row keeps its mark and its word.
//
// RunBoard is also a sequence (docs/MOTION.md, M3): "Play this scene" inks the rows in
// recorded order, draws the cloud round a refusal and the connector to the person's row.
// It starts only from its control; the server's markup is the finished board. Beside that
// control, with full motion, Previous step and Next step move through the scene one stop at
// a time (SceneStepper, run-enhance.tsx; decision 95, "smoother stepping"): each move eases
// and the stop's row is marked as the current one, and the board keeps its layout.
//
// RunBoardCompact: chosen rows of one scene as a small sheet with no folds and no script,
// for a page that shows a moment of the run (the lookup approval on /audit).
//
// The classes (rb-, eo-) are in run-styles.tsx: render <RunStyles /> once on the page.

function sceneBoard(id: string): { scene: BoardScene; firm: string; recordedOn: string } {
  const run = getDemoRun();
  const board = buildBoard(run, getCorpus().playbooks);
  const scene = board.find((s) => s.id === id);
  if (!scene) throw new Error(`The recorded run has no scene "${id}". Scenes: ${board.map((s) => s.id).join(", ")}.`);
  return { scene, firm: run.firm, recordedOn: run.recordedOn };
}

// ---------- Small parts ----------

type Kind = BoardRow["outcome"]["kind"];

// The glyph before an outcome line, so what happened never rests on a color: a check where
// the step, the check or the approval went through, a cross for a finding (as the score
// figure keys it) and the risk triangle for a refusal. Unverified takes the hatched box.
const GLYPH: Partial<Record<Kind, IconName>> = { done: "check", clear: "check", approved: "check", fixed: "check", finding: "close", refused: "risk" };

// In a sequence a glyph goes from pencil to ink with its row: the same shape in the faint
// ink, then in its own (run-styles.tsx), so the line under a row's title never changes
// shape. It is not drawn stroke by stroke: on the board the drawn strokes are the cloud and
// the connector, the handoff the page is about, and the rows of plain work follow one
// another without waiting for a check each.
function OutcomeGlyph({ kind, live }: { kind: Kind; live: boolean }) {
  if (kind === "unverified") {
    return (
      <span className="rb-g rb-g--box" aria-hidden="true" data-ink={live ? "mark" : undefined}>
        <OutcomeBox outcome="unverified" size={12} />
      </span>
    );
  }
  const name = GLYPH[kind];
  return name ? <Icon name={name} className={cx("rb-g", kind === "finding" && "rb-g--finding", kind === "refused" && "rb-g--refused")} /> : null;
}

// The lane word says who; these say how, for the variants a lane does not.
const VARIANT_WORD: Partial<Record<BoardRow["mark"], string>> = { B: "in a browser", O: "offline" };

// The mark is inked by LaneTag; in a sequence the words beside it go from pencil to ink too.
function Who({ row, live }: { row: BoardRow; live: boolean }) {
  const variant = VARIANT_WORD[row.mark];
  return (
    <LaneTag lane={row.lane} mark={row.mark}>
      <span data-ink={live ? "text" : undefined}>
        {row.who}
        {variant && `, ${variant}`}
      </span>
    </LaneTag>
  );
}

function StepNumber({ row }: { row: BoardRow }) {
  return (
    <span className="rb-n type-data">
      <span className="sr-only">Step </span>
      {row.n}
    </span>
  );
}

// The fold under a row.
const ENGINE_DETAIL = "The engine's command and output";

// The engine's command and its output, exactly as recorded, and who ran it.
function EngineBlock({ row, className }: { row: BoardRow; className?: string }) {
  return (
    <div className={cx("eo type-code", className)}>
      <p className="eo-who type-label">
        {row.lane === "agent" ? "Run by the agent" : `Run by ${row.who}`}
        {row.exit !== 0 && ` · Refused, exit ${row.exit}`}
      </p>
      {/* The prompt sign is drawn by the rule (eo-cmd), so it is never selected with the command. */}
      <div className="eo-cmd">
        <OutputText text={row.command} />
      </div>
      {outputLines(row.output).map((line, i) => (
        <div key={i} className={hangOf(line)}>
          {line === "" ? " " : <OutputText text={line} />}
        </div>
      ))}
    </div>
  );
}

function EngineFold({ row }: { row: BoardRow }) {
  return (
    <Disclosure size="sm" className="rb-fold" summary={ENGINE_DETAIL} summaryClassName="type-body-s" bodyClassName="pb-1">
      <EngineBlock row={row} />
    </Disclosure>
  );
}

function stepRef(link: NonNullable<BoardRow["then"]>): string {
  return link.sameScene ? `step ${link.n}` : `step ${link.n} of “${link.sceneTitle}”`;
}

// The words that join a refusal to the row where a person takes it on, both ways. Plain
// anchors, not router links: the scene that holds the row is shown by :target, which only
// a real jump to the fragment sets.
function ThenLink({ row }: { row: BoardRow }) {
  const t = row.then;
  if (!t) return null;
  return (
    <p className="rb-link type-body-s">
      <a href={`#${t.anchor}`} className="link">
        {t.sameScene ? `Then ${t.whoInSentence} takes it on: ${stepRef(t)}` : `Later, ${t.whoInSentence} takes it on: ${stepRef(t)}`}
      </a>
    </p>
  );
}

function PicksUpLink({ row }: { row: BoardRow }) {
  const p = row.picksUp;
  if (!p) return null;
  return (
    <p className="rb-link type-body-s">
      Picks up where the engine refused the agent, at{" "}
      <a href={`#${p.anchor}`} className="link">
        {stepRef(p)}
      </a>
      .
    </p>
  );
}

// The drawn join from a refusal to the person's row that picks it up: straight across the
// property line on two lanes, a short drop under the refusal in one column. Decoration: the
// words are in ThenLink. One pencil line under two inks, one per direction; only the one
// that is laid out takes part in a sequence.
function ThenConnector({ live }: { live: boolean }) {
  return (
    <span className="rb-then" aria-hidden="true" data-seq-step={live ? "then" : undefined}>
      <span className="rb-then-track">
        <span className="rb-then-pencil" />
        <span className="rb-then-ink rb-then-y" data-draw="y">
          <Icon name="chevron-down" />
        </span>
        <span className="rb-then-ink rb-then-x" data-draw="x">
          <Icon name="chevron-right" />
        </span>
      </span>
      <span className="rb-then-word type-label" data-ink={live ? "text" : undefined}>
        Then
      </span>
    </span>
  );
}

// ---------- One piece of work ----------

type RowProps = { row: BoardRow; compact: boolean; live: boolean };

function RowTitle({ row, compact, live }: RowProps) {
  const T = compact ? "p" : "h3";
  return (
    <T className="rb-t type-title-s" data-ink={live ? "text" : undefined}>
      {row.title}
    </T>
  );
}

function Caption({ row, live }: { row: BoardRow; live: boolean }) {
  if (!row.caption) return null;
  return (
    <p className="rb-cap type-body-s" data-ink={live ? "text" : undefined}>
      {row.caption}
    </p>
  );
}

// A step the engine refused: its number in the lane's number column like any other row,
// and beside it the cloud round what the agent tried and the refusal. In a sequence these
// are two steps: "tried" inks the attempt, "refused" draws the cloud round it
// (data-seq-draws) and sets the refusal.
function RefusedRow({ row, compact, live }: RowProps) {
  return (
    <div className="rb-row rb-row--refused">
      <StepNumber row={row} />
      <RevisionCloud label="Refused by the engine" className="min-w-0 px-3 py-3">
        <div data-seq-step={live ? "tried" : undefined}>
          <Who row={row} live={live} />
          <RowTitle row={row} compact={compact} live={live} />
        </div>
        <div data-seq-step={live ? "refused" : undefined} data-seq-draws={live ? "around" : undefined}>
          <p className="rb-out">
            <OutcomeGlyph kind="refused" live={live} />
            <Outcome kind="refused" as="span">
              <b>Refused.</b> <span className="font-normal">{row.reason}</span>
            </Outcome>
          </p>
          <Caption row={row} live={live} />
          {!compact && <ThenLink row={row} />}
          {!compact && <EngineFold row={row} />}
        </div>
      </RevisionCloud>
    </div>
  );
}

function WorkRow({ row, compact, live }: RowProps) {
  return (
    <div className="rb-row">
      <StepNumber row={row} />
      <Who row={row} live={live} />
      <RowTitle row={row} compact={compact} live={live} />
      <p className="rb-out">
        <OutcomeGlyph kind={row.outcome.kind} live={live} />
        <Outcome kind={row.outcome.kind} as="span">
          {row.outcome.line}
        </Outcome>
      </p>
      <Caption row={row} live={live} />
      {!compact && row.path && (
        <p className="rb-meta type-body-s" data-ink={live ? "text" : undefined}>
          {row.path.label} <span className="type-data">{row.path.value}</span>
        </p>
      )}
      {!compact && <PicksUpLink row={row} />}
      {!compact && <EngineFold row={row} />}
    </div>
  );
}

// ---------- Reads, across the lanes ----------

function ReadText({ row, live }: { row: BoardRow; live: boolean }) {
  const ink = live ? "text" : undefined;
  return (
    <>
      <span className="rb-read-n type-data">
        <span className="sr-only">Step </span>
        {row.n}
      </span>
      <span className="rb-read-t" data-ink={ink}>
        {row.title}
        {row.result && (
          <>
            : <b data-ink={ink}>{row.result}</b>
          </>
        )}
      </span>
    </>
  );
}

function ReadLine({ row, compact, live }: RowProps) {
  if (compact) {
    return (
      <div className="rb-read">
        <p className="rb-read-line type-body-s m-0 py-3">
          <ReadText row={row} live={false} />
        </p>
      </div>
    );
  }
  return (
    <div id={row.anchor} className="rb-read" data-seq-step={live ? "read" : undefined}>
      <Disclosure
        size="sm"
        chevron="end"
        className="rb-fold"
        summaryClassName="type-body-s"
        bodyClassName="rb-read-body"
        summary={
          <span className="rb-read-line">
            <ReadText row={row} live={live} />
            <span className="rb-read-more">{ENGINE_DETAIL}</span>
          </span>
        }
      >
        {row.caption && <p className="type-body-s m-0 mb-2 text-muted">{row.caption}</p>}
        <EngineBlock row={row} />
      </Disclosure>
    </div>
  );
}

// ---------- The board ----------

// What the board draws, top to bottom: a piece of work, a band of reads, or (on the compact
// board) a line that says the rows after it come from a later scene.
type Entry = { kind: "work"; row: BoardRow; scene: string } | { kind: "reads"; rows: BoardRow[]; scene: string } | { kind: "later"; title: string; scene: string };

type Placed = { entry: Entry; r: number; joined: boolean; picks: boolean };

// One grid row per entry, so a person's row never rides up beside the agent's row before
// it. The one exception: the person's row that picks up a refusal right after it shares
// the refusal's grid row, so the join reads straight across the property line.
function place(entries: Entry[]): Placed[] {
  const out: Placed[] = [];
  for (const entry of entries) {
    const prev = out.at(-1);
    const refusal = prev?.entry.kind === "work" ? prev.entry : null;
    const pairs =
      entry.kind === "work" &&
      refusal !== null &&
      refusal.scene === entry.scene &&
      refusal.row.then !== null &&
      refusal.row.then.sameScene &&
      refusal.row.then.n === entry.row.n &&
      refusal.row.lane !== entry.row.lane;
    if (pairs && prev) prev.joined = true;
    out.push({ entry, r: pairs && prev ? prev.r : (prev?.r ?? 0) + 1, joined: false, picks: pairs });
  }
  return out;
}

// `children` is the board's control (the sequence's Play), on the head's own line. The lane
// heads are drawn only on two lanes; in one column each row's own tag says whose it is.
function Board({ placed, label, compact, live, children }: { placed: Placed[]; label: string; compact: boolean; live: boolean; children?: ReactNode }) {
  return (
    <>
      <div className={cx("rb-head", children !== undefined && "rb-head--ctl")}>
        <span className="rb-lane" aria-hidden="true">
          <LaneTag lane="agent" />
        </span>
        <div className="rb-head-end">
          <span className="rb-lane" aria-hidden="true">
            <LaneTag lane="person" />
          </span>
          {children}
        </div>
      </div>
      <div className="rb-body sheet-grid">
        <PropertyLine orientation="v" fold={false} className="rb-pline" />
        <ol className="rb-grid" aria-label={label}>
          {placed.map(({ entry, r, joined, picks }) => {
            const style = { "--r": r } as CSSProperties;
            if (entry.kind === "later") {
              return (
                <li key={`later-${entry.scene}`} className="rb-later type-label" style={style}>
                  Later, in &ldquo;{entry.title}&rdquo;
                </li>
              );
            }
            if (entry.kind === "reads") {
              return (
                <li key={`${entry.scene}-r${entry.rows[0]?.n}`} className="rb-reads" style={style}>
                  {entry.rows.map((row) => (
                    <ReadLine key={row.n} row={row} compact={compact} live={live} />
                  ))}
                </li>
              );
            }
            const { row } = entry;
            const refused = row.outcome.kind === "refused";
            return (
              <li
                key={`${entry.scene}-${row.n}`}
                id={compact ? undefined : row.anchor}
                data-lane={row.lane}
                data-seq-step={live && !refused ? "row" : undefined}
                className={cx("rb-item", joined && "rb-item--joined", picks && "rb-item--picks")}
                style={style}
              >
                {refused ? <RefusedRow row={row} compact={compact} live={live} /> : <WorkRow row={row} compact={compact} live={live} />}
                {joined && <ThenConnector live={live} />}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

// ---------- The whole board for one scene ----------

export function RunBoard({ scene: sceneId, className }: { scene: string; className?: string }) {
  const { scene } = sceneBoard(sceneId);
  const entries: Entry[] = boardItems(scene.rows).map((item) => ({ ...item, scene: scene.id }));
  return (
    <SequenceRoot name="scene" className={cx("rb", className)}>
      <Board placed={place(entries)} label={`${scene.title}: what was done, step by step`} compact={false} live>
        <SequenceControls />
        {/* After the kit's own slot, so its controls go there and these sit beside them. */}
        <SceneStepper />
      </Board>
    </SequenceRoot>
  );
}

// ---------- The transcript ----------

// Every command of a scene and the engine's output, exactly as recorded, with who ran it.
// The board's folds hold the same text row by row, so a page shows one or the other.
export function RunTranscript({ scene: sceneId, className }: { scene: string; className?: string }) {
  const { scene } = sceneBoard(sceneId);
  return (
    <ol className={cx("m-0 grid min-w-0 list-none gap-px bg-line p-0", className)} aria-label={`${scene.title}: every command and its output`}>
      {scene.rows.map((row) => (
        <li key={row.n} className="min-w-0">
          <EngineBlock row={row} />
        </li>
      ))}
    </ol>
  );
}

// ---------- A few rows, for another page ----------

// A row to show: its number in the scene, or a row of another scene (drawn after
// a line that names that scene), such as the finished audit's score.
export type BoardPick = number | { scene: string; row: number };

export function RunBoardCompact({
  scene: sceneId,
  rows: picks,
  href,
  title,
  titleBlock,
  note,
  className,
}: {
  scene: string;
  rows: BoardPick[];
  href?: string; // the whole run; /run#<scene> when left out
  title?: ReactNode; // the sheet's title; the scene's own when left out
  titleBlock?: ReactNode; // one TitleBlock, drawn as the sheet's bottom edge
  note?: ReactNode; // a sentence after the caption
  className?: string;
}) {
  const { scene, firm, recordedOn } = sceneBoard(sceneId);
  const others = new Map<string, BoardScene>();
  const chosen = picks.map((pick) => {
    const from = typeof pick === "number" ? scene : (others.get(pick.scene) ?? sceneBoard(pick.scene).scene);
    others.set(from.id, from);
    const n = typeof pick === "number" ? pick : pick.row;
    const row = from.rows[n - 1];
    if (!row) throw new Error(`Scene "${from.id}" has no step ${n}; it has ${from.rows.length}.`);
    return { from, row };
  });
  const own = chosen.filter((c) => c.from.id === scene.id).length;
  const entries: Entry[] = [];
  chosen.forEach(({ from, row }, i) => {
    if (from.id !== scene.id && chosen[i - 1]?.from.id !== from.id) entries.push({ kind: "later", title: from.title, scene: from.id });
    entries.push(row.read ? { kind: "reads", rows: [row], scene: from.id } : { kind: "work", row, scene: from.id });
  });
  const shown = `${own} of ${scene.rows.length} steps shown`;
  return (
    <Sheet
      as="figure"
      level={3}
      title={title ?? scene.title}
      note={title ? `${scene.title}: ${shown}` : shown}
      actions={
        <TextLink href={href ?? `/run#${scene.id}`} tone="accent" className="type-body-s">
          See the whole run
        </TextLink>
      }
      flush
      titleBlock={titleBlock}
      footer={
        <p className="m-0">
          A recorded run of the real engine, <time dateTime={recordedOn}>{recordedOn}</time>. {firm} is a fictional firm.
          {note && <> {note}</>}
        </p>
      }
      label={`${scene.title}: ${own} of ${scene.rows.length} steps`}
      className={cx("m-0", className)}
      bodyClassName="rb"
    >
      <Board placed={place(entries)} label={`${scene.title}: ${own} of ${scene.rows.length} steps`} compact live={false} />
    </Sheet>
  );
}
