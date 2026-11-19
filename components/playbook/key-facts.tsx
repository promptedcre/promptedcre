import { Callout } from "@/components/ui";
import { groupByStructure, playbookFacts, recordTimes, variantDifferences, type DiffStep } from "@/lib/compute/playbook-facts";
import { DEFAULT_VARIANT } from "@/lib/compute/variant";
import { STRUCTURE_LABEL } from "@/lib/labels";
import type { Playbook } from "@/lib/schemas/playbook";
import { ByStructure } from "./by-structure";
import { RefLink } from "./ref-link";
import { LICENSED_WORD, capital, countWord, isAgentMode, joinAnd, pad2, plural } from "./words";

// What the steps ask of a person, said in sentences: how many steps need a signature, how
// many are hard to undo or cannot be undone, how often the work passes between agent and
// person, where the agent stops first (a link to that step's card), and the time it takes
// when every step in view carries an estimate (recordTimes). Then the costs by the step they
// belong to and the licensed professionals, as ruled rows, and how the structures differ
// (variantDifferences). Every number is counted from the steps by playbookFacts; drawn once
// when every structure agrees, else once per structure that differs.

// "one agent step: Answer the pooled-fund items" / "two person steps: A and B"
function stepsPhrase(steps: DiffStep[]): string {
  const agent = steps.filter((s) => isAgentMode(s.mode));
  const person = steps.filter((s) => !isAgentMode(s.mode));
  const parts: string[] = [];
  if (agent.length) parts.push(`${plural(agent.length, "agent step")}: ${joinAnd(agent.map((s) => s.title))}`);
  if (person.length) parts.push(`${plural(person.length, "person step")}: ${joinAnd(person.map((s) => s.title))}`);
  return parts.join("; and ");
}

function differenceSentences(pb: Playbook): string[] {
  return variantDifferences(pb).map((d) => {
    const name = `The ${d.structure === "jv" ? "JV" : STRUCTURE_LABEL[d.structure].toLowerCase()} structure`;
    const bits: string[] = [];
    if (d.adds.length) bits.push(`adds ${stepsPhrase(d.adds)}`);
    if (d.drops.length) bits.push(`${d.adds.length ? "and leaves out" : "leaves out"} ${stepsPhrase(d.drops)}`);
    return `${name} ${bits.join(", ")}.`;
  });
}

type Asks = { signatures: number; irreversible: number; hardToUndo: number; handoffs: number };

const TIMES = ["never", "once", "twice"];

// The counts as sentences. "Three steps need a signature. One step is irreversible and four
// are hard to undo. The work passes between your agent and a person eight times."
export function askSentences(f: Asks, noun: string): string[] {
  const out: string[] = [];
  out.push(f.signatures === 0 ? `No ${noun} needs a signature.` : `${capital(plural(f.signatures, noun))} ${f.signatures === 1 ? "needs" : "need"} a signature.`);
  if (f.irreversible > 0 && f.hardToUndo > 0) {
    out.push(`${capital(plural(f.irreversible, noun))} ${f.irreversible === 1 ? "is" : "are"} irreversible and ${countWord(f.hardToUndo)} ${f.hardToUndo === 1 ? "is" : "are"} hard to undo.`);
  } else if (f.irreversible > 0) {
    out.push(`${capital(plural(f.irreversible, noun))} ${f.irreversible === 1 ? "is" : "are"} irreversible.`);
  } else if (f.hardToUndo > 0) {
    out.push(`${capital(plural(f.hardToUndo, noun))} ${f.hardToUndo === 1 ? "is" : "are"} hard to undo; none is irreversible.`);
  } else {
    out.push(`No ${noun} is hard to undo.`);
  }
  if (f.handoffs > 0) out.push(`The work passes between your agent and a person ${TIMES[f.handoffs] ?? `${plural(f.handoffs, "time")}`}.`);
  return out;
}

export function KeyFacts({ pb }: { pb: Playbook }) {
  const noun = pb.kind === "audit" ? "check" : "step";
  // One group per structure the record is written for that differs: the page shows no other.
  const groups = groupByStructure(
    (structure) => {
      const v = { ...DEFAULT_VARIANT, structure };
      const f = playbookFacts(pb, v);
      return f.researched
        ? {
            ...recordTimes(pb, v),
            signatures: f.signatures,
            irreversible: f.irreversible,
            hardToUndo: f.hardToUndo,
            handoffs: f.handoffs,
            stop: f.firstPersonStep,
            licensed: f.licensed,
            costs: f.costs,
          }
        : null;
    },
    undefined,
    pb.written.structure,
  );
  const diffs = differenceSentences(pb);
  return (
    <div>
      <ByStructure
        as="div"
        groups={groups}
        render={(f) =>
          f && (
            <>
              <p className="type-body measure m-0 text-text">
                {askSentences(f, noun).join(" ")}{" "}
                {f.stop ? (
                  <>
                    The agent stops first at {noun} {pad2(f.stop.n)},{" "}
                    {/* A link in running text keeps its underline; under a finger its hit area reaches 12 px above and below its words. */}
                    <a href={`#step-${f.stop.id}`} className="link pointer-coarse:-my-3 pointer-coarse:py-3">
                      {f.stop.title}
                    </a>
                    .
                  </>
                ) : (
                  `An agent can do every ${noun} here.`
                )}
              </p>
              {(f.handsOn || f.calendar) && (
                <p className="type-body measure m-0 mt-3 text-muted">
                  It takes {joinAnd([f.handsOn ? `about ${f.handsOn} hands-on` : "", f.calendar ? `about ${f.calendar} on the calendar` : ""].filter(Boolean))},
                  counted from every {noun}&rsquo;s estimate.
                </p>
              )}
              {(f.costs.length > 0 || f.licensed.length > 0) && (
                <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
                  {f.costs.length > 0 && (
                    <div className="min-w-0">
                      <h3 className="type-label m-0 border-b border-line-strong pb-2 text-faint">Costs, by the {noun} they belong to</h3>
                      <ul className="m-0 list-none p-0">
                        {f.costs.map((c) => (
                          <li key={c.stepId} className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-line py-3">
                            <span className="type-data text-faint">{pad2(c.n)}</span>
                            <span className="min-w-0">
                              <RefLink href={`#step-${c.stepId}`} className="type-body-s">
                                {c.stepTitle}
                              </RefLink>
                              <span className="type-body-s block text-muted">{c.text}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {f.licensed.length > 0 && (
                    <div className="min-w-0">
                      <h3 className="type-label m-0 border-b border-line-strong pb-2 text-faint">Licensed professionals</h3>
                      <ul className="m-0 list-none p-0">
                        {f.licensed.map((l) => (
                          <li key={l.kind} className="type-body-s border-b border-line py-3 text-muted">
                            {/^[aeiou]/i.test(LICENSED_WORD[l.kind] ?? l.kind) ? "An" : "A"} {LICENSED_WORD[l.kind] ?? l.kind} on {plural(l.count, noun)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )
        }
      />
      {diffs.length > 0 && (
        <Callout title="Where the structures differ" className="measure mt-8">
          <ul className="m-0 list-none space-y-2 p-0">
            {diffs.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}
