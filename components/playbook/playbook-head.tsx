import type { ReactNode } from "react";
import { Callout, Marks, PageHead, Stamp, cx, marksLabel, type PageCrumb } from "@/components/ui";
import { ReviewChip, Tag } from "@/components/chips";
import { VariantSwitch } from "@/components/variant-switch";
import { groupByStructure, playbookFacts } from "@/lib/compute/playbook-facts";
import { stepMarks, type StepMark } from "@/lib/compute/site-facts";
import { applicableSteps, DEFAULT_VARIANT, isResearched, writtenStructures } from "@/lib/compute/variant";
import { ageInDays, STALE_DAYS } from "@/lib/content/semantic";
import { JURISDICTION_LABEL, PHASE_LABEL, PROPERTY_LABEL, STRUCTURE_LABEL, URGENCY_LABEL } from "@/lib/labels";
import { PROPERTY_TYPES, type Structure } from "@/lib/schemas/common";
import type { Playbook } from "@/lib/schemas/playbook";
import type { ReviewEntry } from "@/lib/schemas/records";
import { runPrompt } from "@/lib/site";
import { ByStructure } from "./by-structure";
import { RecordActions } from "./file-actions";
import { displayTitle, joinAnd, onlyLabel } from "./words";

// The head of a record, lean on purpose: where it sits (the breadcrumb carries its kind and
// its phase), its title and its summary as the lede, then
//   - for a situation, when it applies and how soon to act;
//   - what an agent can do: this record's own share as a count ("5 of 12 steps an agent can
//     do") with one mark per step beside it, in step order;
//   - what to do with it (RecordActions): "Run with your agent", the one filled button, with
//     the page's one "Not live yet"; "Copy the whole playbook"; download and print as links;
//   - the structure switch (and the property-type one) where the choice changes the page;
//   - one small line: its review, the date its sources were checked, what it covers, and
//     which structures it is for when that is not all three.
// No label sits above the title. A figure that changes with the structure is drawn once per
// structure that differs. The rest of what the steps ask is said under the steps (KeyFacts).
//
// Only the structures a record is written for are drawn or offered. A record written for
// one structure has no structure switch: its page is that structure's view (the page root
// says which), and the small line says so ("JV only").

export const KIND_WORD = { process: "Playbook", situation: "Situation", audit: "Audit" } as const;
const KIND_HOME = {
  process: { href: "/playbooks", label: "Playbooks" },
  situation: { href: "/situations", label: "Scenarios" },
  audit: { href: "/audit", label: "Audit" },
} as const;

export function recordCrumbs(pb: Playbook): PageCrumb[] {
  return [KIND_HOME[pb.kind], { href: `/playbooks#${pb.phase}`, label: PHASE_LABEL[pb.phase] }, { label: pb.title }];
}

// A situation says when it applies before anything else: what happened, and how soon to act.
// The icon and the chip's frame carry the urgency; the words are neutral ink.
export function SituationNote({ situation, className }: { situation: NonNullable<Playbook["situation"]>; className?: string }) {
  const soon = situation.urgency !== "weeks";
  return (
    <Callout
      icon={soon ? "risk" : "calendar"}
      tone={situation.urgency === "hours" ? "risk" : situation.urgency === "days" ? "warn" : "note"}
      title={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          When this happens
          <Tag tone={situation.urgency === "hours" ? "danger" : situation.urgency === "days" ? "warn" : "muted"}>{URGENCY_LABEL[situation.urgency]}</Tag>
        </span>
      }
      className={className}
    >
      {situation.trigger}
    </Callout>
  );
}

type HeadView = {
  steps: number;
  agent: number;
  marks: StepMark[];
};

function headView(pb: Playbook, structure: Structure): HeadView {
  const f = playbookFacts(pb, { ...DEFAULT_VARIANT, structure });
  return { steps: f.steps, agent: f.agent, marks: stepMarks(pb, structure) };
}

// The record's own share, once per structure it has steps in that differs: the count ("5 of
// 12", the figure read first, then what it counts) and one mark per step in step order, an
// agent's square or a person's cut corner, which is the share drawn as a bar.
function Share({ pb, className }: { pb: Playbook; className?: string }) {
  const nouns = pb.kind === "audit" ? "checks" : "steps";
  const groups = groupByStructure((s) => headView(pb, s), undefined, writtenStructures(pb));
  return (
    <p className={cx("m-0 flex flex-wrap items-center", className)}>
      <ByStructure
        groups={groups}
        render={(v) => (
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex flex-wrap items-baseline gap-x-2">
              <span className="type-title-s tabular-nums text-text">
                {v.agent} of {v.steps}
              </span>
              <span className="type-body-s text-muted">{pb.kind === "audit" ? "checks an agent can verify" : "steps an agent can do"}</span>
            </span>
            <Marks marks={v.marks} label={marksLabel(v.marks, nouns)} />
          </span>
        )}
      />
    </p>
  );
}

// One fact of the head's small line: a label in faint ink, its value in the text color.
function Fact({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
      <dt className="type-body-s text-faint">{label}</dt>
      <dd className={cx("m-0 text-text", mono ? "type-data" : "type-body-s")}>{children}</dd>
    </div>
  );
}

// Does the structure switch change anything? Only then is it drawn: the record is written
// for more than one structure, and its steps differ between them.
function structureMatters(pb: Playbook): boolean {
  const groups = groupByStructure(
    (structure) => {
      const v = { ...DEFAULT_VARIANT, structure };
      return isResearched(pb, v) ? applicableSteps(pb, v).map((s) => s.id) : null;
    },
    undefined,
    writtenStructures(pb),
  );
  return groups.length > 1;
}

// Does the property-type switch change anything? Only when a step carries a note or
// a condition for a property type.
function propertyTypeMatters(pb: Playbook): boolean {
  return pb.steps.some((s) => s.typeNotes || s.when?.propertyType);
}

// RecordSwitches: the structure and property-type switches of a record, drawn in its head
// only where the choice changes something on the page. Nothing for a record whose steps are
// the same in every structure and for every property type. The structure switch offers the
// structures the record is written for, in the catalog's order; the first is the one the page
// root opens on (openingStructure), which __tests__/written-structures-pages.test.ts holds
// every written record to.
export function RecordSwitches({ pb }: { pb: Playbook }) {
  const structure = structureMatters(pb);
  const propertyType = propertyTypeMatters(pb);
  if (!structure && !propertyType) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 print:hidden">
      {structure && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="type-label text-faint" aria-hidden="true">
            Your structure
          </span>
          <VariantSwitch
            rootId="pb-root"
            param="structure"
            attr="data-structure"
            label="Your structure"
            options={writtenStructures(pb).map((s) => ({ value: s, label: STRUCTURE_LABEL[s] }))}
          />
        </div>
      )}
      {propertyType && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="type-label text-faint" aria-hidden="true">
            Your property type
          </span>
          <VariantSwitch
            rootId="pb-root"
            param="type"
            attr="data-ptype"
            label="Your property type"
            options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_LABEL[t] }))}
          />
        </div>
      )}
    </div>
  );
}

/** The id of a record's h1. */
export const HEAD_ID = "pb-title";

export function PlaybookHead({ pb, review, today, file }: { pb: Playbook; review: ReviewEntry | null; today: Date; file: string | null }) {
  const nouns = pb.kind === "audit" ? "checks" : "steps";
  const stale = pb.lastVerified ? ageInDays(pb.lastVerified, today) > STALE_DAYS : false;
  const sameSteps = !structureMatters(pb) && writtenStructures(pb).length > 1;
  // "JV only": the record is not written for every structure, and the page says so once, here.
  // A record not written for every structure says which it is for: "same steps for fund and
  // JV" would not say that the third is missing.
  const structures =
    onlyLabel(writtenStructures(pb)) ??
    (sameSteps ? `Same ${nouns} for ${joinAnd(writtenStructures(pb).map((s) => (s === "jv" ? "JV" : STRUCTURE_LABEL[s].toLowerCase())))}` : null);
  return (
    <PageHead title={displayTitle(pb.title)} id={HEAD_ID} crumbs={recordCrumbs(pb)} lede={pb.summary}>
      {pb.situation && <SituationNote situation={pb.situation} className="measure mt-6 text-text" />}
      <Share pb={pb} className="mt-6" />
      <RecordActions prompt={runPrompt(pb.title, pb.kind)} slug={pb.slug} file={file} className="mt-6" />
      <RecordSwitches pb={pb} />
      {/* The small line. AI-drafted is always said beside the date the sources were checked. */}
      <dl aria-label={`About this ${KIND_WORD[pb.kind].toLowerCase()}`} className="m-0 mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-line pt-4">
        <Fact label="Review">
          {/* A person's review is the one thing the site stamps ("Practitioner, reviewed <date>"), in the one
              review color; a record nobody has reviewed says AI-drafted in a dashed chip. Here the stamp is
              set on one line (the classes only lay it out), so its word and date sit on the line's baseline. */}
          {review ? (
            <Stamp
              word={review.level === "attorney-reviewed" ? "Attorney" : "Practitioner"}
              datePrefix="reviewed"
              date={review.date}
              className="flex-row items-baseline gap-2 py-1"
            />
          ) : (
            <ReviewChip review="ai-drafted" />
          )}
        </Fact>
        {/* lastVerified is the date of the last full citation check, not a review. */}
        {pb.lastVerified && (
          <Fact label="Sources checked" mono>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <time dateTime={pb.lastVerified} className="whitespace-nowrap">
                {pb.lastVerified}
              </time>
              {stale && <Tag tone="warn">check date</Tag>}
            </span>
          </Fact>
        )}
        {pb.written.jurisdiction.length > 0 && <Fact label="Coverage">{pb.written.jurisdiction.map((j) => JURISDICTION_LABEL[j]).join(" + ")}</Fact>}
        {structures && <Fact label="Structures">{structures}</Fact>}
      </dl>
    </PageHead>
  );
}
