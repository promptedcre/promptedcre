import { Fragment } from "react";
import type { BoardRow } from "@/lib/demo/board";
import { SequenceControls, SequenceRoot } from "../sequence-root";
import { SpecimenCheck, SpecimenCloud, SpecimenConnector, SpecimenMark } from "./parts";
import { SpecimenStyles } from "./specimen-styles";

// M3, one scene of the run board, as a specimen: every row of the recorded scene, in the
// order the engine recorded them. A person starts it ("Play this scene"); nothing moves
// until then. Rows ink in recorded order (data-seq-step="row", or "read" for a command
// that only reads). A refused row is two steps: "tried" inks what the agent attempted,
// "refused" draws the cloud round it and sets the refusal. The connector to the row where
// a person picks it up is "then". The real board has two lanes and a property line; this
// is one column.

function Who({ row }: { row: BoardRow }) {
  const person = row.lane === "person";
  return (
    <p className="type-label m-0 flex items-center gap-2">
      <SpecimenMark person={person} />
      <span data-ink="text" className={person ? "text-human-text" : "text-agent-text"}>
        {row.who}
      </span>
      <span className="type-data ml-auto pl-3 text-faint">Step {row.n}</span>
    </p>
  );
}

function Title({ row }: { row: BoardRow }) {
  return (
    <p data-ink="text" className="type-title-s m-0 mt-2 text-text">
      {row.title}
    </p>
  );
}

export function SceneSpecimen({ title, rows, firm, recordedOn }: { title: string; rows: BoardRow[]; firm: string; recordedOn: string }) {
  return (
    <SequenceRoot as="figure" name="scene" className="sp-sheet m-0 min-w-0 border border-line-strong bg-raised">
      <SpecimenStyles />
      <ol className="m-0 grid list-none gap-y-1 px-2 py-4 md:px-4" aria-label={`${title}: every step, as recorded`}>
        {rows.map((row) => {
          if (row.read) {
            return (
              <li key={row.n} data-seq-step="read" className="flex items-baseline gap-3 px-5 py-2">
                <span data-ink="text" className="type-body-s text-muted">
                  {row.title}
                  {row.result && `: ${row.result}`}
                </span>
                <span className="type-data ml-auto text-faint">Step {row.n}</span>
              </li>
            );
          }
          if (row.outcome.kind === "refused") {
            return (
              <Fragment key={row.n}>
                {/* The cloud wraps the row, as the real one does: the row is the drawable, and the refusal claims it. */}
                <li data-draw="" className="sp-pos">
                  <SpecimenCloud wrapped />
                  <div data-seq-step="tried">
                    <Who row={row} />
                    <Title row={row} />
                  </div>
                  <p data-seq-step="refused" data-seq-draws="around" className="type-body-s m-0 mt-2">
                    <b data-ink="text" className="text-danger">
                      Refused.
                    </b>{" "}
                    <span data-ink="text" className="text-text">
                      {row.reason}
                    </span>
                  </p>
                </li>
                {row.then?.sameScene === true && <SpecimenConnector step="then" toPerson />}
              </Fragment>
            );
          }
          const person = row.lane === "person";
          return (
            <li key={row.n} data-seq-step="row" className="sp-pos">
              <Who row={row} />
              <Title row={row} />
              <p className="type-body-s m-0 mt-2 flex items-start gap-2">
                {!person && <SpecimenCheck />}
                <span data-ink="text" className={person ? "text-human-text" : "text-agent-text"}>
                  {row.outcome.line}
                </span>
              </p>
            </li>
          );
        })}
      </ol>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-strong px-4 py-3 md:px-6">
        <p className="type-body-s m-0 max-w-[68ch] text-muted">
          “{title}” from the recorded run on {firm}, a fictional firm, <time dateTime={recordedOn}>{recordedOn}</time>.
        </p>
        <SequenceControls />
      </figcaption>
    </SequenceRoot>
  );
}
