import type { CSSProperties } from "react";
import { SequenceControls, SequenceRoot } from "@/components/motion";
import { LaneTag, PropertyLine, RoleMark, Sheet, TitleBlock, TitleCell, type GateKind } from "@/components/ui";
import { groupByStructure } from "@/lib/compute/playbook-facts";
import { planLayout, planStats, type PlanGates, type PlanLayout, type PlanNode, type PlanSide } from "@/lib/compute/plan-layout";
import { DEFAULT_VARIANT } from "@/lib/compute/variant";
import { STRUCTURE_LABEL } from "@/lib/labels";
import { STRUCTURES, type Structure } from "@/lib/schemas/common";
import type { Playbook, StepMode } from "@/lib/schemas/playbook";
import { ByStructure } from "./by-structure";
import { Gate } from "./glyphs";
import { capital, joinAnd, pad2, whoWord } from "./words";

// The order of work: the record page's one sheet. Stages read top to bottom; a step's stage
// is one past the furthest step it waits on (lib/compute/plan-layout.ts), so the steps in
// one stage do not wait on each other, and each card says what it waits on by number. From
// 768 px the agent's lane sits beside a person's with the property line between them; below
// that the lanes stack inside each stage. Nothing is placed by coordinates, so it fits its
// sheet at every width. A card is a mark, a number and a title on the sheet's paper: the
// mark says whose it is, and there is no box inside the sheet. Structures whose layouts
// are identical share one drawing (data-s takes a list); the page root's switch shows one.
//
// One line is drawn on it: the longest chain, one step from each stage, each waiting on the
// one before. The line runs on the side of the lane its step is in, so where the chain
// passes from the agent to a person it crosses the property line, and the mark of every step
// on the chain is framed. The title block names those steps by number, and says so when
// other chains are as long.
//
// That line is also the page's one sequence (M2, docs/MOTION.md, choreography "trace"): the
// list of stages carries data-seq-trace, each stage is a step, and a stage's place on the
// line is the share of the line drawn before it (a run that crosses sides counts double),
// which the line's own rules (./page-styles, prefix bd-) honour whatever height the cards
// wrap to. The line stops for a beat at a stage where the chain's step is a person's, beside
// that person's card. With scripts off or reduced motion the board is simply finished.

const gatesOf = (g: PlanGates): GateKind[] => [
  ...(g.signature ? (["signature"] as const) : []),
  ...(g.irreversible ? (["irreversible"] as const) : g.hardToUndo ? (["hard-to-undo"] as const) : []),
];

const MODES: StepMode[] = ["agent", "agent-browser", "human-online", "human-offline"];
const GATES: GateKind[] = ["signature", "irreversible", "hard-to-undo"];

const viewName = (s: Structure) => (s === "jv" ? "JV" : STRUCTURE_LABEL[s].toLowerCase());

// One step from each stage, each waiting on the one before it: the chain the line follows.
// Where several chains are as long, this is the first in step order: it ends at the last
// stage's first step, and takes the lowest-numbered step that step waits on in each stage
// before it.
function longestChain(layout: PlanLayout): Map<number, PlanNode> {
  const byNumber = new Map(layout.nodes.map((n) => [n.n, n]));
  const chain = new Map<number, PlanNode>();
  let node = layout.nodes.find((n) => n.stage === layout.stages.length);
  while (node) {
    chain.set(node.stage, node);
    const before = node.stage - 1;
    node = node.waitsOn.map((k) => byNumber.get(k)).find((p) => p?.stage === before);
  }
  return chain;
}

// How many chains are that long: the ways to take one step from each stage, each waiting on
// the one before it. Steps are in step order, so a step's count is ready before any step
// that waits on it.
function chainCount(layout: PlanLayout): number {
  const byNumber = new Map(layout.nodes.map((n) => [n.n, n]));
  const ways = new Map<number, number>();
  for (const node of layout.nodes) {
    const before = node.waitsOn.map((k) => byNumber.get(k)).filter((p): p is PlanNode => p?.stage === node.stage - 1);
    ways.set(node.n, node.stage === 1 ? 1 : before.reduce((sum, p) => sum + (ways.get(p.n) ?? 0), 0));
  }
  return layout.nodes.filter((n) => n.stage === layout.stages.length).reduce((sum, n) => sum + (ways.get(n.n) ?? 0), 0);
}

function Card({ node, href, Noun, onChain }: { node: PlanNode; href: string; Noun: string; onChain: boolean }) {
  const gates = gatesOf(node.gates);
  const who = whoWord(node.mode, node.actor);
  const waits = node.waitsOn.length > 0 ? `Waits on ${node.waitsOn.map(pad2).join(", ")}` : "Starts first";
  const label = `${Noun} ${pad2(node.n)}, ${who}: ${node.title}${gates.length ? ` (${gates.join(", ").replace(/-/g, " ")})` : ""}. ${waits}.${onChain ? " On the longest chain." : ""}`;
  return (
    <li>
      <a href={href} aria-label={label} data-chain={onChain ? "" : undefined} className="bd-card">
        <span aria-hidden="true" className="bd-hd">
          <RoleMark mode={node.mode} showLabel={false} size="sm" />
          <span data-ink="text" className="type-data text-text">
            {pad2(node.n)}
          </span>
          <span data-ink="text" className="bd-who type-label">
            {capital(who)}
          </span>
          {gates.length > 0 && (
            <span data-ink="mark" className="bd-gs">
              {gates.map((g) => (
                <Gate key={g} kind={g} label={false} />
              ))}
            </span>
          )}
        </span>
        <span aria-hidden="true" data-ink="text" className="bd-ti type-body-s font-semibold">
          {node.title}
        </span>
        <span aria-hidden="true" data-ink="text" className="bd-w type-label">
          {waits}
        </span>
      </a>
    </li>
  );
}

// A run of the line that crosses to the other side is about this many times as long as one
// that goes straight down a stage, so it takes that share of the line's travel and the pen
// keeps a steadier pace.
const TURN_LENGTH = 2;

const places = (n: number) => Number(n.toFixed(4));

function Board({ layout, stepHref, name, Noun }: { layout: PlanLayout; stepHref: (id: string) => string; name: string; Noun: string }) {
  const chain = longestChain(layout);
  const last = layout.stages.length - 1;
  // The side of the lane the chain's step is in, stage by stage: the side the line runs on.
  const sides: PlanSide[] = layout.stages.map((st) => chain.get(st.n)?.side ?? "agent");
  // The run from each stage's node to the next: how long it is, and so where along the whole
  // line (0 to 1) it starts and how much of the line it is.
  const lengths: number[] = sides.map((side, k) => (k < last ? (sides[k + 1] === side ? 1 : TURN_LENGTH) : 0));
  const whole = lengths.reduce((sum, n) => sum + n, 0);
  const starts = lengths.map((_, k) => (whole > 0 ? places(lengths.slice(0, k).reduce((sum, n) => sum + n, 0) / whole) : 1));
  return (
    <div className="bd">
      <p aria-hidden="true" className="bd-heads">
        <LaneTag lane="agent" />
        <LaneTag lane="person" />
      </p>
      <PropertyLine orientation="v" fold={false} className="bd-pl" />
      <ol aria-label={name} data-seq-trace="" data-draw="" className="bd-stages">
        {layout.stages.map((st, k) => {
          const side = sides[k] ?? "agent";
          const next = k < last ? (sides[k + 1] ?? side) : null;
          // Where the chain changes hands after this stage, the line turns: along the rule
          // under the stage, across the property line, and down to the next stage's node.
          const turn = next !== null && next !== side ? next : null;
          const start = starts[k] ?? 1;
          return (
            <li
              key={st.n}
              data-seq-step={side}
              // The beat at a person's card is the time its ink takes to set: no pause on top of it.
              data-seq-hold={side === "person" ? 0 : undefined}
              data-seq-at={start}
              data-side={side}
              data-turn={turn ?? undefined}
              className="bd-st"
              // The run from this node ends exactly where the next stage's begins.
              style={next !== null ? ({ "--bd-a": start, "--bd-s": (starts[k + 1] ?? 1) - start } as CSSProperties) : undefined}
            >
              <i aria-hidden="true" data-ink="mark" className="bd-node" />
              {next !== null && <i aria-hidden="true" className="bd-run bd-run--down" />}
              {turn !== null && (
                <>
                  <i aria-hidden="true" className="bd-run bd-run--across" />
                  <i aria-hidden="true" className="bd-run bd-run--drop" />
                </>
              )}
              <p data-ink="text" className="bd-sn type-label">
                Stage {st.n}
              </p>
              {(["agent", "person"] as const).map((lane) => (
                <ul key={lane} aria-label={lane === "agent" ? "Your agent" : "A person"} className={`bd-lane ${lane === "agent" ? "bd-la" : "bd-lp"}`}>
                  {st[lane].map((node) => (
                    <Card key={node.id} node={node} href={stepHref(node.id)} Noun={Noun} onChain={chain.get(st.n)?.id === node.id} />
                  ))}
                </ul>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// The key to the board's marks, for the modes and gates the record uses in any structure,
// and the frame that marks a step on the longest chain.
function Legend({ layouts, noun }: { layouts: PlanLayout[]; noun: string }) {
  const nodes = layouts.flatMap((l) => l.nodes);
  const modes = new Set(nodes.map((n) => n.mode));
  const gates = new Set(nodes.flatMap((n) => gatesOf(n.gates)));
  const person = modes.has("human-online") || modes.has("human-offline");
  return (
    <ul className="pb-key" aria-label="Key to the board">
      {MODES.filter((m) => modes.has(m)).map((m) => (
        <li key={m}>
          <RoleMark mode={m} size="sm" />
        </li>
      ))}
      {/* On a phone the sentence takes a line of its own, so the gates under it read as one group. */}
      {person && <li className="basis-full sm:basis-auto">A person&rsquo;s {noun} has a cut corner</li>}
      {GATES.filter((g) => gates.has(g)).map((g) => (
        <li key={g}>
          <Gate kind={g} />
        </li>
      ))}
      <li className="bd-key-chain type-label text-text">
        <i aria-hidden="true" />
        On the longest chain
      </li>
    </ul>
  );
}

// PlanDrawing: the order of work for every structure of a written record, as one sheet; the
// switch on the page root chooses the drawing. `id` is the id of the sheet's heading, for a
// link from the list of steps. stepHref says where a card links (by default the step's card
// on the same page). Renders nothing for an outline.
export function PlanDrawing({
  pb,
  id = "plan",
  stepHref = (stepId) => `#step-${stepId}`,
  structures = STRUCTURES,
}: {
  pb: Playbook;
  id?: string;
  stepHref?: (stepId: string) => string;
  structures?: readonly Structure[];
}) {
  const noun = pb.kind === "audit" ? "check" : "step";
  const Noun = capital(noun);

  // One drawing per distinct layout; structures that share a layout share its drawing.
  const groups: Array<{ structures: Structure[]; layout: PlanLayout }> = [];
  const seen = new Map<string, number>();
  for (const s of structures) {
    const layout = planLayout(pb, { ...DEFAULT_VARIANT, structure: s });
    if (layout.nodes.length === 0) continue;
    const key = JSON.stringify(layout);
    const at = seen.get(key);
    const group = at === undefined ? undefined : groups[at];
    if (group) group.structures.push(s);
    else {
      seen.set(key, groups.length);
      groups.push({ structures: [s], layout });
    }
  }
  if (groups.length === 0) return null;

  // The title block's figures, per structure, each drawn once where the structures agree.
  const drawn = new Map(groups.flatMap((g) => g.structures.map((s) => [s, g] as const)));
  const among = structures.filter((s) => drawn.has(s));
  const figure = <T,>(pick: (layout: PlanLayout, ss: Structure[]) => T) =>
    groupByStructure((s) => {
      const g = drawn.get(s);
      return g ? pick(g.layout, g.structures) : null;
    }, undefined, among);

  return (
    <SequenceRoot name="trace" stepThrough={false}>
      <Sheet
        as="section"
        title="Order of work: what waits on what."
        titleId={id}
        level={2}
        actions={
          <>
            {/* The hint holds the place of the sequence's control and gives it up when there is
                one (./page-styles, bd-hint), so the sheet's head never changes height. */}
            <p className="bd-hint type-label m-0 text-faint">Read down, stage by stage</p>
            <SequenceControls />
          </>
        }
        grid
        titleBlock={
          <TitleBlock label="About this drawing" cols={4}>
            <TitleCell label="View">
              <ByStructure groups={figure((_, ss) => capital(joinAnd(ss.map(viewName))))} render={(v) => v} />
            </TitleCell>
            <TitleCell label={`${Noun}s`} mono>
              <ByStructure groups={figure((l) => l.nodes.length)} render={(v) => v} />
            </TitleCell>
            <TitleCell label="Longest chain">
              <ByStructure
                groups={figure((l) => {
                  const chain = longestChain(l);
                  return { numbers: l.stages.map((st) => chain.get(st.n)?.n ?? 0).filter((n) => n > 0), chains: chainCount(l) };
                })}
                render={(c) =>
                  c === null ? null : (
                    <>
                      <span className="tabular-nums">
                        {c.numbers.length} {c.numbers.length === 1 ? noun : `${noun}s`}: {c.numbers.map(pad2).join(", ")}
                      </span>
                      {/* Said only where it is true: other chains are as long, and this is the first in step order. */}
                      {c.chains > 1 && <span className="type-body-s block tabular-nums text-faint">The first of {c.chains} this long</span>}
                    </>
                  )
                }
              />
            </TitleCell>
            <TitleCell label="Side by side">
              <ByStructure groups={figure((l) => planStats(l).widest)} render={(n) => (n === null ? null : `${n} at most`)} />
            </TitleCell>
          </TitleBlock>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
            <Legend layouts={groups.map((g) => g.layout)} noun={noun} />
            <p className="m-0">{Noun}s in one stage do not wait on each other.</p>
          </div>
        }
      >
        {groups.map(({ structures: ss, layout }) => (
          <div key={ss.join("-")} data-s={ss.length < STRUCTURES.length ? ss.join(" ") : undefined}>
            <Board
              layout={layout}
              stepHref={stepHref}
              Noun={Noun}
              name={`The ${layout.nodes.length} ${noun}s in ${layout.stages.length} stages, ${joinAnd(ss.map(viewName))} ${ss.length > 1 ? "views" : "view"}`}
            />
          </div>
        ))}
      </Sheet>
    </SequenceRoot>
  );
}
