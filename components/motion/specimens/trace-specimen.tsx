import { SequenceControls, SequenceRoot } from "../sequence-root";
import { SpecimenMark } from "./parts";
import { SpecimenStyles } from "./specimen-styles";

// M2, the order-of-work trace, as a specimen: the longest chain of one written playbook
// (lib/compute/plan-layout.ts), one row per stage. One line, the root's [data-seq-trace],
// is drawn down the chain over its pencil line; each row is a step that inks as the line
// reaches it, and at a person's row (data-seq-step="person") the line holds a beat. The
// line sits outside the steps: it belongs to the whole sequence. The rows share one height
// (grid-auto-rows: 1fr), so the line reaches row n of N at n/N and the markup needs no
// data-seq-at. The real board draws its line from the plan's own geometry and sets
// data-seq-at on each card.

export type TraceNode = { n: number; stage: number; title: string; person: boolean };

export function TraceSpecimen({ nodes }: { nodes: TraceNode[] }) {
  return (
    <SequenceRoot name="trace" className="min-w-0">
      <SpecimenStyles />
      <div className="sp-trace-wrap">
        <span className="sp-trace sp-pencil" aria-hidden="true" />
        <span data-seq-trace="" data-draw="y" className="sp-trace" aria-hidden="true" />
        <ol className="sp-trace-list" aria-label="The longest chain of steps, stage by stage">
          {nodes.map((node) => (
            <li key={node.n} data-seq-step={node.person ? "person" : "agent"} className="sp-trace-row">
              <SpecimenMark person={node.person} />
              <span className="type-data flex-none text-faint">Stage {node.stage}</span>
              <span data-ink="text" className="type-body-s min-w-0 text-text">
                {node.title}
              </span>
              <span data-ink="text" className={`type-label ml-auto flex-none pl-3 ${node.person ? "text-human-text" : "text-agent-text"}`}>
                {node.person ? "A person" : "Your agent"}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-4">
        <SequenceControls />
      </div>
    </SequenceRoot>
  );
}
