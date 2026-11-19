import type { ReactNode } from "react";
import { Tag } from "@/components/chips";
import { ApprovalCells, Callout, Disclosure, GATE_WORD, Icon, RoleMark, TitleBlock, TitleCell, stepGates, type GateKind } from "@/components/ui";
import { ageInDays, STALE_DAYS } from "@/lib/content/semantic";
import { formatDuration } from "@/lib/compute/duration";
import { nearestPredecessors } from "@/lib/compute/metrics";
import { firstSentence, groupByStructure } from "@/lib/compute/playbook-facts";
import { MARK_OF } from "@/lib/compute/site-facts";
import { applicableSteps, DEFAULT_JURISDICTIONS, stepStructures } from "@/lib/compute/variant";
import { JURISDICTION_LABEL, PROPERTY_LABEL, STRUCTURE_LABEL } from "@/lib/labels";
import { PROPERTY_TYPES, STRUCTURES, type Source, type Structure } from "@/lib/schemas/common";
import type { Playbook, Step } from "@/lib/schemas/playbook";
import type { Artifact, CalculatorEntry, MarketEntry, Rule } from "@/lib/schemas/records";
import { ByStructure } from "./playbook/by-structure";
import { Gate, RiskFlag } from "./playbook/glyphs";
import { stepNumbers, viewOf, type Numbers } from "./playbook/numbering";
import { RefLink } from "./playbook/ref-link";
import { SoftwareLine, type MarketTop } from "./playbook/software-line";
import { ACTOR_WORD, APPROVAL_WORD, LICENSED_WORD, UNDO_WORD, capital, isAgentMode, jurisdictionCode, pad2 } from "./playbook/words";
import { RichText } from "./rich-text";

// The steps of a written record, as cards one after another in step order, numbered per
// structure. A card is a ruled block on plain ground, never a box: the strong rule above it
// sets it apart. Always shown:
//   - the step's number and title, a real heading (level 3; level 4 under "Only for Delaware");
//   - who does it, in ROLE_WORD's four words with the role after them ("Person online ·
//     principal"), and what it asks: a signature, hard to undo or irreversible, high risk,
//     each with its own glyph, and the structure or place it is for;
//   - what to do: the instruction's first sentence (the whole of a one-sentence one);
//   - for a step whose market is ranked and published, the scored products that do the step, each icon
//     beside its name and score (./playbook/software-line).
// Everything else is behind the card's one fold, "Details", whose summary is the first
// sentence and the word itself, so the sentence is what a reader clicks to open the step.
// Open, the sentence gives way to the whole instruction, then any property-type notes, why
// this person or agent does it, the line to sign where a signature is asked, its facts as one
// ruled row (risk, undo, approval, what it waits on, time, cost, calculators, what it uses
// and the proof it keeps), its rules and its sources with the date each was opened.
//
// The fold is not the card's own child, so a link to #step-<id> lands on the card as it is
// and opens nothing: the card already says what the step is. Layout and state are in
// ./playbook/page-styles (prefix st-); a number or a "waits on" line that is the same in
// every structure is drawn once. On paper every fold is open, the summary goes, and a
// person's step ends with a line to sign and one to date.

export type Lookups = {
  sources: Map<string, Source>;
  rules: Map<string, Rule>;
  calculators: Map<string, CalculatorEntry>;
  markets: Map<string, MarketEntry>;
  publishedMarkets: Set<string>;
  /** The software that does each step, by step id (stepSoftwareFor in ./playbook/software, D218). */
  software?: Map<string, MarketTop>;
  artifacts: Map<string, Artifact>;
  today: Date;
};

// The steps this one waits on, by number, in one structure.
function waitsOn(pb: Playbook, step: Step, s: Structure): number[] {
  const order = applicableSteps(pb, viewOf(s)).map((x) => x.id);
  return nearestPredecessors(pb, step, viewOf(s))
    .map((id) => order.indexOf(id) + 1)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
}

// Who prepared what a signature step signs: the direct prerequisite whose output
// the step uses, else its first prerequisite, else the signer.
function drawnBy(pb: Playbook, step: Step): string {
  const byId = new Map(pb.steps.map((s) => [s.id, s]));
  const prior = step.after.map((id) => byId.get(id)).filter((s): s is Step => Boolean(s));
  const maker = prior.find((p) => p.produces.some((a) => step.consumes.includes(a))) ?? prior[0];
  if (!maker) return step.actor ? (ACTOR_WORD[step.actor] ?? step.actor) : "a person";
  if (isAgentMode(maker.mode)) return "agent";
  return maker.actor ? (ACTOR_WORD[maker.actor] ?? maker.actor) : "a person";
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="type-label">{label}</dt>
      <dd className="type-body-s">{children}</dd>
    </div>
  );
}

// A fact whose value is a gate: the glyph, then the word set like every other value in the
// row (the glyph names itself to a screen reader, so the word beside it is not read twice).
function Marked({ kind }: { kind: GateKind }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Gate kind={kind} label={false} />
      <span aria-hidden="true">{GATE_WORD[kind]}</span>
    </span>
  );
}

function StepCard({ pb, step, numbers, lk, noun, level }: { pb: Playbook; step: Step; numbers: Numbers; lk: Lookups; noun: string; level: 3 | 4 }) {
  const agent = isAgentMode(step.mode);
  const gates = stepGates(step);
  // Who does it in the site's four words ("Person online"), then the person by role ("counsel").
  const actor = !agent && step.actor ? (ACTOR_WORD[step.actor] ?? step.actor) : null;
  const sources = step.sources.map((id) => lk.sources.get(id)).filter((s): s is Source => Boolean(s));
  // Where it comes from, said on the closed card: how many sources, or common practice.
  const basis = sources.length > 0 ? `${sources.length} ${sources.length === 1 ? "source" : "sources"}` : "Common practice";
  const onlyFor = step.when?.structure;
  const juris = step.when?.jurisdiction;
  const numbered = Object.keys(numbers).length > 0;
  const written = new Set(pb.written.structure);
  const shownIn = stepStructures(step).filter((s) => written.has(s));
  const typeNotes = PROPERTY_TYPES.filter((t) => step.typeNotes?.[t]);
  const names = (ids: string[]) => ids.map((id) => lk.artifacts.get(id)?.name ?? id).join(", ");
  const Noun = noun === "check" ? "Check" : "Step";
  const place = juris?.[0];
  const Heading = `h${level}` as const;
  // The step's number in each structure it shows in, drawn once where the structures agree.
  const number = (render: (n: number) => string) => <ByStructure groups={groupByStructure((s) => numbers[s] ?? 0, String, shownIn)} render={render} />;
  // The scored products that do this step (content/step-software.json), when any; else the facts name the market.
  const software = step.market ? lk.software?.get(step.id) : undefined;
  const ranked = software !== undefined && software.vendors.length > 0;

  return (
    // data-mark: who does it, as the mark letter the bar that follows the reader draws (./playbook/step-tracker).
    <li id={`step-${step.id}`} data-mark={MARK_OF[step.mode]} data-s={numbered ? shownIn.join(" ") : undefined} className="st">
      {/* The step's heading: a real heading, the card's first child and outside the fold, so a
          reader can jump to it. A screen reader hears "Step 5: <title>". */}
      <Heading className="st-h">
        <span className="st-n type-data">
          {numbered ? (
            <>
              <span aria-hidden="true">{number(pad2)}</span>
              <span className="sr-only">
                {Noun} {number(String)}:
              </span>
            </>
          ) : place ? (
            // A step outside the view in hand has no number: it carries its jurisdiction instead.
            <>
              <span aria-hidden="true">{jurisdictionCode(place)}</span>
              <span className="sr-only">{JURISDICTION_LABEL[place]}:</span>
            </>
          ) : null}
        </span>
        <span className="st-t type-title-s">{step.title}</span>
      </Heading>
      <div className="st-in">
        <div className="st-by">
          <span className="st-who">
            <RoleMark mode={step.mode} />
            {actor && <span className="st-act type-label">· {actor}</span>}
          </span>
          {gates.map((g) => (
            <Gate key={g} kind={g} />
          ))}
          {step.risk === "high" && <RiskFlag />}
          {onlyFor && (
            <Tag tone="accent" dashed>
              {onlyFor.map((s) => STRUCTURE_LABEL[s]).join(" · ")} only
            </Tag>
          )}
          {juris && numbered && <Tag>{juris.map((j) => JURISDICTION_LABEL[j]).join(" · ")}</Tag>}
        </div>
        {/* A wrapper, so the fold is not the card's own child: a link to the card opens nothing. */}
        <div className="st-more">
          <Disclosure
            size="sm"
            className="st-fold"
            bodyClassName="st-body"
            summary={
              <>
                {/* The control's own name says whose details it opens and where the step comes from. */}
                <span className="sr-only">
                  {numbered ? (
                    <>
                      Details of {noun} {number(String)}
                    </>
                  ) : (
                    `Details of ${step.title}`
                  )}
                  , {basis.toLowerCase()}
                </span>
                {/* What to do, in one sentence: what the open card says in full. */}
                <span aria-hidden="true" className="st-p type-body">
                  {firstSentence(step.instruction)}
                </span>
                <span aria-hidden="true" className="st-dt type-label">
                  Details<span className="st-x"> · {basis}</span>
                </span>
              </>
            }
          >
            <RichText text={step.instruction} className="type-body measure text-text" />
            {typeNotes.map((t) => (
              <div key={t} data-p={t}>
                <Callout title={PROPERTY_LABEL[t]} className="measure print:break-inside-avoid">
                  {step.typeNotes?.[t]}
                </Callout>
              </div>
            ))}
            <Callout
              icon={<RoleMark mode={step.mode} showLabel={false} />}
              tone={agent ? "agent" : "person"}
              title={`Why ${agent ? "an agent can do it" : "a person does it"}`}
              className="measure print:break-inside-avoid"
            >
              {step.modeBasis}
            </Callout>
            {step.approval === "signature" && (
              <TitleBlock label="Approval">
                {/* On a phone the block is two cells wide: what is signed takes the first row, who drew it and who signs share the second. */}
                <TitleCell label="Signs" className="col-span-full sm:col-span-1">
                  {step.produces.length > 0 ? names(step.produces) : step.title}
                </TitleCell>
                <ApprovalCells drawnBy={drawnBy(pb, step)} signer={step.actor ? (ACTOR_WORD[step.actor] ?? step.actor) : undefined} />
              </TitleBlock>
            )}

            <dl className="st-facts">
              <Fact label="Risk">
                {step.risk === "high" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="risk" className="text-danger" />
                    High
                  </span>
                ) : (
                  capital(step.risk)
                )}
              </Fact>
              <Fact label="Undo">{step.undo === "reversible" ? capital(UNDO_WORD[step.undo] ?? step.undo) : <Marked kind={step.undo} />}</Fact>
              <Fact label="Approval">{step.approval === "signature" ? <Marked kind="signature" /> : capital(APPROVAL_WORD[step.approval] ?? step.approval)}</Fact>
              {numbered && (
                <Fact label="Waits on">
                  <ByStructure
                    groups={groupByStructure((s) => waitsOn(pb, step, s), undefined, shownIn)}
                    render={(list) => (list.length > 0 ? `${list.length > 1 ? `${Noun}s` : Noun} ${list.map(pad2).join(", ")}` : "Nothing; starts first")}
                  />
                </Fact>
              )}
              {step.licensed && <Fact label="Licensed">{capital(LICENSED_WORD[step.licensed] ?? step.licensed)}</Fact>}
              {step.effort && (
                <Fact label="Hands-on">
                  {formatDuration(step.effort)} <span className="st-x">({step.effort.basis === "cited" ? "cited" : "estimate"})</span>
                  {step.effort.note && <span className="st-x block">{step.effort.note}</span>}
                </Fact>
              )}
              {step.elapsed && (
                <Fact label="Calendar">
                  {formatDuration(step.elapsed)} <span className="st-x">({step.elapsed.basis === "cited" ? "cited" : "estimate"})</span>
                  {step.elapsed.note && <span className="st-x block">{step.elapsed.note}</span>}
                </Fact>
              )}
              {step.cost && <Fact label="Cost">{step.cost.text}</Fact>}
              {step.calculators.length > 0 && (
                <Fact label="Calculator">
                  {step.calculators.map((id) => {
                    const c = lk.calculators.get(id);
                    return c?.status === "live" ? (
                      <RefLink key={id} href={`/calculators/${id}`} className="block">
                        {c.name}
                      </RefLink>
                    ) : (
                      <span key={id} className="block">
                        {c?.name ?? id} <span className="st-x">· planned</span>
                      </span>
                    );
                  })}
                </Fact>
              )}
              {/* A market whose vendors the card shows is named there, with the link to its ranking. */}
              {step.market && !ranked && (
                <Fact label="Software">
                  {lk.publishedMarkets.has(step.market) ? (
                    <RefLink href={`/rankings/${step.market}`}>{lk.markets.get(step.market)?.name ?? step.market}</RefLink>
                  ) : (
                    <>
                      {lk.markets.get(step.market)?.name ?? step.market} <span className="st-x">· ranking not published yet</span>
                    </>
                  )}
                </Fact>
              )}
              {step.consumes.length > 0 && <Fact label="Uses">{names(step.consumes)}</Fact>}
              {step.produces.length > 0 && <Fact label="Proof to keep">{names(step.produces)}</Fact>}
            </dl>

            <div className="st-refs">
              {step.rules.length > 0 && (
                <div className="min-w-0">
                  <p className="type-label m-0 text-faint">Rules</p>
                  <ul className="st-list">
                    {step.rules.map((id) => (
                      <li key={id}>
                        <RefLink href={`#rule-${id}`} className="type-body-s">
                          {lk.rules.get(id)?.title ?? id}
                        </RefLink>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="min-w-0">
                <p className="type-label m-0 text-faint">{sources.length > 0 ? `Sources (${sources.length})` : "Source"}</p>
                {sources.length > 0 ? (
                  <ol className="st-list">
                    {sources.map((s) => (
                      <li key={s.id}>
                        <RefLink href={s.url} className="type-body-s">
                          {s.title}
                        </RefLink>
                        {/* The date is part of a sentence, so it is set in the sentence's own face (a <time> keeps its figures tabular). */}
                        <span className="st-x type-body-s block">
                          {s.publisher.replace(/\.$/, "")}. Opened <time dateTime={s.accessed}>{s.accessed}</time>.
                          {ageInDays(s.accessed, lk.today) > STALE_DAYS && " Check date."}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="type-body-s m-0 mt-2 text-muted">Common practice, with no public source to cite.</p>
                )}
              </div>
            </div>
            {/* On paper only: a person's step ends with a line to sign and one to date when it is done. */}
            {!agent && (
              <p className="st-sign type-note" aria-hidden="true">
                <span>Signed</span>
                <span>Date</span>
              </p>
            )}
          </Disclosure>
        </div>
        {software && <SoftwareLine market={software} />}
      </div>
    </li>
  );
}

// StepList: the cards of a written record. Steps that apply in no structure at the default
// jurisdictions (a Delaware step, say) follow under a heading of their own, each marked with
// its jurisdiction in place of a number, so the numbers always match the list of steps above
// the cards (./playbook/step-index) and the order of work. A structure the record was not
// written for says so where its steps would be.
export function StepList({ pb, lk, id }: { pb: Playbook; lk: Lookups; id?: string }) {
  const numbers = stepNumbers(pb);
  const main = pb.steps.filter((s) => numbers.has(s.id));
  const elsewhere = pb.steps.filter((s) => !numbers.has(s.id));
  const where = [...new Set(elsewhere.flatMap((s) => s.when?.jurisdiction ?? []))].map((j) => JURISDICTION_LABEL[j]);
  const noun = pb.kind === "audit" ? "check" : "step";
  const unwritten = STRUCTURES.filter((s) => !pb.written.structure.includes(s));
  return (
    <div id={id} className="min-w-0">
      {unwritten.length > 0 && (
        <p data-s={unwritten.join(" ")} className="type-body m-0 border-b border-dashed border-line-bold py-4 text-muted">
          This record is not written for the {unwritten.map((s) => STRUCTURE_LABEL[s].toLowerCase()).join(" or ")} structure.
        </p>
      )}
      <ol className="st-cards">
        {main.map((step) => (
          <StepCard key={step.id} pb={pb} step={step} numbers={numbers.get(step.id) ?? {}} lk={lk} noun={noun} level={3} />
        ))}
      </ol>
      {elsewhere.length > 0 && (
        <div className="mt-16">
          <h3 className="type-title-s m-0 text-text">{where.length ? `Only for ${where.join(" or ")}` : "Outside this view"}</h3>
          <p className="type-body-s measure m-0 mt-2 text-muted">
            These {noun}s apply outside the {DEFAULT_JURISDICTIONS.map((j) => JURISDICTION_LABEL[j]).join(" + ")} view, so they are not numbered or drawn in the
            order of work.
          </p>
          <ol className="st-cards st-cards--else mt-6">
            {elsewhere.map((step) => (
              <StepCard key={step.id} pb={pb} step={step} numbers={{}} lk={lk} noun={noun} level={4} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
