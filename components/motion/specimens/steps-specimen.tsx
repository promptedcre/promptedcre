import { SequenceControls, SequenceRoot } from "../sequence-root";
import { SpecimenRule } from "./parts";
import { SpecimenStyles } from "./specimen-styles";

// The generic rule, "ink the steps in DOM order", on a plain ruled list: for each
// [data-seq-step], draw its [data-draw] children, then flip it from pencil to ink. No
// named choreography: the row's rule is the generic wipe (data-draw="x") and its words
// are generic inkable text (data-ink="text").
// The five rows are the five scenes of the recorded run.

export type StepsRow = { id: string; title: string; summary: string; steps: number; refused: number };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function StepsSpecimen({ rows }: { rows: StepsRow[] }) {
  return (
    <SequenceRoot name="steps" label="the list" className="min-w-0">
      <SpecimenStyles />
      <ol className="sp-rows" aria-label="The scenes of the recorded run">
        {rows.map((row) => (
          <li key={row.id} data-seq-step="">
            <SpecimenRule />
            <div className="grid gap-x-8 gap-y-1 py-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] md:items-baseline">
              <p data-ink="text" className="type-title-s m-0 text-text">
                {row.title}
              </p>
              <p data-ink="text" className="type-body-s m-0 text-muted">
                {row.summary}
              </p>
              <p className="type-data m-0 text-faint">
                {count(row.steps, "step", "steps")} · {row.refused} refused
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <SequenceControls />
      </div>
    </SequenceRoot>
  );
}
