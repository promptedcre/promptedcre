import Link from "next/link";
import { Tag } from "@/components/chips";
import { ButtonLink, Marks, PageHead, TextLink, tallyMarks, type PageFact } from "@/components/ui";
import { stepMarks, type SiteFacts } from "@/lib/compute/site-facts";
import { openingStructure, writtenStructures } from "@/lib/compute/variant";
import { PHASE_LABEL } from "@/lib/labels";
import type { Playbook } from "@/lib/schemas/playbook";
import { site } from "@/lib/site";
import { KIND_WORD, SituationNote, recordCrumbs } from "./playbook-head";
import { SectionHead } from "./section-head";
import { displayTitle, onlyLabel, pad2 } from "./words";

// An outlined record. It says so first and plainly: "Outline: planned, not written yet" is
// the head's lead fact, and the head points to the nearest written record so the page is
// never a dead end. Then the step titles as the order of work it will follow (dashed rules:
// the site's one line for "not written yet"), and its nearest written neighbours with what
// an agent can do in each. No share, no board and no invented detail for the outline
// itself: nothing in it is measured yet. When the project has a public repository, a link
// to ask for it.

function RecordLinks({ records }: { records: Playbook[] }) {
  return (
    <>
      {records.map((r, i) => (
        <span key={r.id}>
          {i > 0 && "; "}
          <Link href={`/playbooks/${r.slug}`} className="link">
            {r.title}
          </Link>
        </span>
      ))}
    </>
  );
}

// One written neighbour as a ruled definition row: which side it is on, its title, and its
// steps as marks with the count an agent can do (the syndication view, the one share the
// site prints outside a record's own page). A neighbour that is not written for a
// syndication is counted in the view its own page opens on, and a chip beside its title
// says which structures it is for ("JV only").
function Neighbour({ pb, side }: { pb: Playbook | null; side: "before" | "after" }) {
  const marks = pb ? stepMarks(pb, openingStructure(pb)) : [];
  const only = pb ? onlyLabel(writtenStructures(pb)) : null;
  const noun = pb?.kind === "audit" ? "checks" : "steps";
  return (
    <div className="grid gap-x-8 gap-y-1 border-b border-line py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-baseline">
      <dt className="type-label text-faint">{side === "before" ? "Written before it" : "Written after it"}</dt>
      <dd className="m-0 min-w-0">
        {pb ? (
          <>
            {/* Under a finger the link's hit area reaches 12 px above and below its words; nothing moves. */}
            <Link href={`/playbooks/${pb.slug}`} className="link type-title-s pointer-coarse:-my-3 pointer-coarse:inline-block pointer-coarse:py-3">
              {pb.title}
            </Link>
            {only && (
              <span className="ml-3 inline-block align-middle">
                <Tag>{only}</Tag>
              </span>
            )}
            {marks.length > 0 && (
              <span className="type-body-s mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                <Marks marks={marks} size="sm" />
                <span>
                  {tallyMarks(marks).agent} of {marks.length} {noun} an agent can do
                </span>
              </span>
            )}
          </>
        ) : (
          <span className="type-body-s text-muted">{side === "before" ? "Nothing written comes before it here." : "Nothing written comes after it here."}</span>
        )}
      </dd>
    </div>
  );
}

// The group an outline is counted in, the way the home page counts it: a playbook among
// its phase's playbooks (siteFacts.phases), a situation among the situations, an audit
// among the audits.
function scopeOf(pb: Playbook, all: Playbook[], facts: SiteFacts) {
  if (pb.kind === "process") {
    const phase = facts.phases.find((p) => p.phase === pb.phase);
    const slugs = new Set((phase?.playbooks ?? []).map((p) => p.slug));
    const label = PHASE_LABEL[pb.phase];
    return {
      records: all.filter((p) => slugs.has(p.slug)),
      written: phase?.written ?? 0,
      noun: "playbooks",
      where: ` in ${label}`,
      title: `Its place in ${label}.`,
    };
  }
  const noun = pb.kind === "situation" ? "scenarios" : "audits";
  return {
    records: all.filter((p) => p.kind === pb.kind),
    written: facts.counts.writtenByKind[pb.kind],
    noun,
    where: "",
    title: `Its place among the ${noun}.`,
  };
}

export function OutlineRecord({ pb, all, facts }: { pb: Playbook; all: Playbook[]; facts: SiteFacts }) {
  const scope = scopeOf(pb, all, facts);
  const at = scope.records.findIndex((p) => p.id === pb.id);
  const beforeAt = scope.records.slice(0, Math.max(0, at)).findLastIndex((p) => p.depth === "full");
  const afterAt = scope.records.findIndex((p, i) => i > at && p.depth === "full");
  const before = beforeAt >= 0 ? (scope.records[beforeAt] ?? null) : null;
  const after = afterAt >= 0 ? (scope.records[afterAt] ?? null) : null;
  // The nearest written record in the same group: the closer of the two, the earlier one on a tie.
  const nearest = before && after ? (at - beforeAt <= afterAt - at ? before : after) : (before ?? after);
  const noun = pb.kind === "audit" ? "checks" : "steps";
  const kind = KIND_WORD[pb.kind].toLowerCase();
  const requires = pb.requires.map((id) => all.find((p) => p.id === id)).filter((p): p is Playbook => Boolean(p));
  const next = all.filter((p) => p.requires.includes(pb.id));
  const ask = site.repoUrl
    ? `${site.repoUrl.replace(/\/$/, "")}/issues/new?title=${encodeURIComponent(`Write the ${kind}: ${pb.title}`)}`
    : null;

  const strip: PageFact[] = [
    { label: "planned, not written yet", value: "Outline", lead: true },
    { label: `Planned ${noun}`, value: pb.outlineSteps.length > 0 ? String(pb.outlineSteps.length) : null, mono: true },
    { label: "Comes after", value: requires.length > 0 ? <RecordLinks records={requires} /> : null },
    { label: "Comes next", value: next.length > 0 ? <RecordLinks records={next} /> : null },
    { label: "Written so far", value: `${scope.written} of ${scope.records.length} ${scope.noun}${scope.where}` },
  ];

  return (
    <>
      <PageHead
        title={displayTitle(pb.title)}
        crumbs={recordCrumbs(pb)}
        lede={pb.summary}
        actions={
          nearest || ask ? (
            <>
              {nearest && (
                <p className="type-body m-0 basis-full text-muted">
                  The nearest written {KIND_WORD[nearest.kind].toLowerCase()} is <TextLink href={`/playbooks/${nearest.slug}`}>{nearest.title}</TextLink>.
                </p>
              )}
              {ask && (
                <ButtonLink href={ask} variant="secondary" size="sm">
                  Ask for this {kind}
                </ButtonLink>
              )}
            </>
          ) : undefined
        }
        facts={strip}
        factsLabel="About this outline"
      >
        <p className="type-body measure m-0 mt-8 text-muted">
          When it is written, each {noun.slice(0, -1)} will say whether an agent can do it or a person must, and where it comes from.
          Until then nothing in it is researched or cited.
        </p>
        {pb.situation && <SituationNote situation={pb.situation} className="measure mt-6 text-text" />}
      </PageHead>

      {pb.outlineSteps.length > 0 && (
        <section aria-labelledby="planned" className="mt-16 md:mt-20">
          <SectionHead id="planned" title={`The ${pb.outlineSteps.length} ${noun} it will cover, in order.`} note="Titles only, not yet researched" />
          <ol className="m-0 max-w-3xl list-none border-t border-dashed border-line-bold p-0">
            {pb.outlineSteps.map((title, i) => (
              <li key={`${i}-${title}`} className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-dashed border-line-strong py-3">
                <span className="type-data text-faint">{pad2(i + 1)}</span>
                <span className="type-body text-muted">{title}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="in-phase" className="mt-16 md:mt-24">
        <SectionHead id="in-phase" title={scope.title} />
        <dl className="m-0 border-t border-line-strong">
          <Neighbour pb={before} side="before" />
          <Neighbour pb={after} side="after" />
        </dl>
        <p className="type-body-s m-0 mt-6">
          <TextLink href={pb.kind === "situation" ? "/situations" : "/playbooks"} tone="accent" className="pointer-coarse:-my-3 pointer-coarse:inline-block pointer-coarse:py-3">
            {pb.kind === "situation" ? "Browse every situation" : "Browse every playbook"}
          </TextLink>
        </p>
      </section>
    </>
  );
}
