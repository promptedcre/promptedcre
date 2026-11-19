import type { BoardRow } from "@/lib/demo/board";
import { SequenceControls, SequenceRoot } from "../sequence-root";
import { SpecimenCheck, SpecimenCloud, SpecimenConnector, SpecimenMark, SpecimenRule } from "./parts";
import { SpecimenStyles } from "./specimen-styles";

// M1, the handoff, as a specimen: three rows of the recorded run (lib/demo/board.ts) on
// one sheet. The agent's own step; the person's step it tried next, which the engine
// refused; the person recording it. Every word is the recording's or the catalog's. The
// markup below is the finished drawing; the attributes are the whole of what makes it
// playable (docs/MOTION.md):
//   data-seq-step="own | reach | tried | refused | cross | person | record"   the seven steps, in DOM order
//   data-ink                                                                   what goes from pencil to ink
//   data-draw                                                                  what is drawn: the check, the two connectors, the cloud, the line to sign on
// The real cover is built from components/ui; this stands in for it.

function Who({ row, who }: { row: BoardRow; who: string }) {
  const person = row.lane === "person";
  return (
    <p className="type-label m-0 flex items-center gap-2">
      <SpecimenMark person={person} />
      <span data-ink="text" className={person ? "text-human-text" : "text-agent-text"}>
        {who}
      </span>
      <span className="type-data ml-auto pl-3 text-faint">Step {row.n}</span>
    </p>
  );
}

export function HandoffSpecimen({
  rows,
  sceneTitle,
  sceneSteps,
  firm,
  recordedOn,
  href,
}: {
  rows: { own: BoardRow; refused: BoardRow; person: BoardRow };
  sceneTitle: string;
  sceneSteps: number;
  firm: string;
  recordedOn: string;
  href: string;
}) {
  const { own, refused, person } = rows;
  return (
    <SequenceRoot as="figure" name="handoff" className="sp-sheet m-0 min-w-0 border border-line-strong bg-raised">
      <SpecimenStyles />
      <ol className="sp-handoff sheet-grid" aria-label={`Steps ${own.n} to ${person.n} of ${sceneSteps} in “${sceneTitle}”, as recorded`}>
        <li data-seq-step="own" className="sp-pos">
          <Who row={own} who={own.who} />
          <p data-ink="text" className="type-title-s m-0 mt-2 text-text">
            {own.title}
          </p>
          <p className="type-body-s m-0 mt-2 flex items-start gap-2">
            <SpecimenCheck />
            <span data-ink="text" className="text-agent-text">
              {own.outcome.line}
            </span>
          </p>
        </li>

        <SpecimenConnector step="reach" />

        <li className="sp-pos">
          <div data-seq-step="tried">
            <Who row={refused} who={refused.who} />
            <p data-ink="text" className="type-title-s m-0 mt-2 text-text">
              {refused.title}
            </p>
          </div>
          <p data-seq-step="refused" className="type-body-s m-0 mt-2">
            <SpecimenCloud />
            <b data-ink="text" className="text-danger">
              Refused.
            </b>{" "}
            <span data-ink="text" className="text-text">
              {refused.reason}
            </span>
          </p>
        </li>

        <SpecimenConnector step="cross" toPerson propertyLine />

        <li className="sp-pos">
          <div data-seq-step="person">
            <Who row={person} who="A person" />
            <p data-ink="text" className="type-title-s m-0 mt-2 text-text">
              {person.title}
            </p>
          </div>
          <div data-seq-step="record">
            <SpecimenRule sign />
            <p data-ink="text" className="type-body-s m-0 text-human-text">
              {person.outcome.line}
            </p>
          </div>
        </li>
      </ol>

      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-strong px-4 py-3 md:px-6">
        <p className="type-body-s m-0 max-w-[68ch] text-muted">
          A recorded run of the engine on {firm}, a fictional firm, <time dateTime={recordedOn}>{recordedOn}</time>. {person.who} is fictional too.{" "}
          <a href={href} className="text-accent-strong underline underline-offset-4 hover:text-text">
            See the whole run
          </a>
        </p>
        <SequenceControls />
      </figcaption>
    </SequenceRoot>
  );
}
