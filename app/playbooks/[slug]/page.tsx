import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui";
import { BeforeAfterChain, type ChainRecord } from "@/components/playbook/chain";
import { FoldStyles } from "@/components/playbook/fold";
import { KeyFacts } from "@/components/playbook/key-facts";
import { OpenAll, OpenTarget } from "@/components/playbook/open-all";
import { OutlineRecord } from "@/components/playbook/outline-record";
import { PageStyles } from "@/components/playbook/page-styles";
import { PlanDrawing } from "@/components/playbook/plan-drawing";
import { PlaybookHead } from "@/components/playbook/playbook-head";
import { RuleUseNote, RuleUsers } from "@/components/playbook/rule-users";
import { SectionHead } from "@/components/playbook/section-head";
import { publishedMarkets, stepSoftwareFor } from "@/components/playbook/software";
import { SourceList } from "@/components/playbook/source-list";
import { INDEX_ID, StepIndex, type PageSection } from "@/components/playbook/step-index";
import { StepKey } from "@/components/playbook/step-key";
import { StepTracker } from "@/components/playbook/step-tracker";
import { RuleCard } from "@/components/rule-card";
import { StepList, type Lookups } from "@/components/step-list";
import { onlyLabel } from "@/components/playbook/words";
import { siteFacts } from "@/lib/compute/site-facts";
import { openingStructure, writtenStructures } from "@/lib/compute/variant";
import { getCorpus, getPlaybook } from "@/lib/content/load";
import { hasPlaybookMd, latestReview, playbookMdPath } from "@/lib/export/playbook-md";
import type { Playbook } from "@/lib/schemas/playbook";
import { site, siteHost } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCorpus().playbooks.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/playbooks/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const pb = getPlaybook(slug);
  return pb ? { title: pb.title, description: pb.summary } : {};
}

const KIND_NOUN = { process: "playbook", situation: "situation", audit: "audit" } as const;

// A record's page: a working document, in three groups set apart by space.
//
//   The head, lean: title, summary, this record's own share with one mark per step, "Run
//   with your agent" (with the page's one "Not live yet") and "Copy the whole playbook",
//   download and print, the structure switch, and one small line of review, sources checked
//   and coverage (./playbook-head).
//   The steps, one after another: a compact numbered list that jumps to each and marks the
//   one being read (./step-tracker, with a bar that names it while the cards are read), then
//   every step as a card that shows who does it, what it asks, what to do and the software for
//   it, with the rest behind one "Details" fold that opens smoothly (components/step-list.tsx).
//   After them the order of work, the page's one sheet, and what the steps ask of a person.
//   The shelf. The rules, the sources, and what comes before and after.
//
// Printed (or saved as PDF) it is a plain document: the head, every step open with a line
// to sign on a person's step, what it asks, the rules and the sources; the buttons, the
// switches, the list of steps, the software and the board stay off paper, and the sections
// sit a document's distance apart, not a screen's (print:mt-10).
export default async function PlaybookPage({ params }: PageProps<"/playbooks/[slug]">) {
  const { slug } = await params;
  const pb = getPlaybook(slug);
  if (!pb) notFound();

  const corpus = getCorpus();
  const today = new Date();

  if (pb.depth === "outline") {
    return (
      <Container>
        <OutlineRecord pb={pb} all={corpus.playbooks} facts={siteFacts(corpus)} />
      </Container>
    );
  }

  const audit = pb.kind === "audit";
  const kindNoun = KIND_NOUN[pb.kind];
  const artifactName = (id: string) => corpus.artifacts.find((a) => a.id === id)?.name ?? id;
  const asChain = (p: Playbook): ChainRecord => ({ slug: p.slug, title: p.title, depth: p.depth, only: onlyLabel(writtenStructures(p)) });
  const requires = pb.requires
    .map((id) => corpus.playbooks.find((p) => p.id === id))
    .filter((p): p is Playbook => Boolean(p))
    .map(asChain);
  const next = corpus.playbooks.filter((p) => p.requires.includes(pb.id)).map(asChain);
  const review = latestReview(corpus.reviews, pb.id);
  const file = hasPlaybookMd(pb) ? playbookMdPath(pb.slug) : null;

  // Rule cards: federal before state, then in the order the steps first cite them.
  const firstCite = new Map<string, number>();
  pb.steps.forEach((s, i) => s.rules.forEach((id) => firstCite.has(id) || firstCite.set(id, i)));
  const rules = corpus.rules
    .filter((r) => firstCite.has(r.id))
    .sort(
      (a, b) =>
        Number(a.jurisdiction !== "us-federal") - Number(b.jurisdiction !== "us-federal") ||
        (firstCite.get(a.id) ?? 0) - (firstCite.get(b.id) ?? 0),
    );

  // The software that does each step (content/step-software.json), for the cards whose step names a market.
  const software = stepSoftwareFor(pb);
  const lookups: Lookups = {
    sources: new Map(pb.sources.map((s) => [s.id, s])),
    rules: new Map(corpus.rules.map((r) => [r.id, r])),
    calculators: new Map(corpus.calculators.map((c) => [c.id, c])),
    markets: new Map(corpus.markets.map((m) => [m.id, m])),
    publishedMarkets: publishedMarkets(),
    software,
    artifacts: new Map(corpus.artifacts.map((a) => [a.id, a])),
    today,
  };

  // The rest of the page, as the list of steps links to it under its last line.
  const sections: PageSection[] = [
    { href: "#plan", label: "Order of work" },
    { href: "#takes", label: audit ? "What the checks ask" : "What the steps ask" },
    ...(rules.length > 0 ? [{ href: "#rules", label: "Rules" }] : []),
    ...(pb.sources.length > 0 ? [{ href: "#sources", label: "Sources" }] : []),
    { href: "#chain", label: "Before and after" },
  ];

  // The page opens on the first structure the record is written for: the default one for
  // every record written for it. The structure switch, where there is one, lists that
  // structure first, so the attribute, the tab chosen with scripts off and the switch's own
  // fallback agree. A record written for one structure has no switch, and the foundation's
  // rule for a root without one (app/globals.css) shows that structure's view alone.
  return (
    <div id="pb-root" data-structure={openingStructure(pb)} data-ptype="industrial">
      <PageStyles />
      <FoldStyles />
      <OpenTarget />
      <Container>
        {/* On paper the site header is gone, so the document says where it came from. */}
        <p className="type-data m-0 hidden text-faint print:block">
          {site.name} · {siteHost()}/playbooks/{pb.slug}
        </p>
        <PlaybookHead pb={pb} review={review} today={today} file={file} />

        <section aria-labelledby="steps" className="mt-12 md:mt-16 print:mt-10">
          {/* One row from 768 px: the heading, the key to the marks, the control. On a phone the
              control stays on the heading's line and the key takes the line under it. */}
          <div className="pb-steps-head">
            <div className="min-w-0 flex-1 md:flex-none">
              <h2 id="steps" className="type-title-l m-0 text-text">
                {audit ? "Checks" : "Steps"}
              </h2>
              {audit && <p className="type-body-s m-0 mt-1 text-muted">Each records what is true; it fixes nothing.</p>}
            </div>
            <div className="order-3 basis-full md:order-none md:flex-1 md:basis-auto print:hidden">
              <StepKey pb={pb} />
            </div>
            <OpenAll targetId="step-list" noun="details" />
          </div>
          <StepIndex pb={pb} sections={sections} className="mb-8" />
          {/* Scripts on: marks the step being read in the list above, and names it in a bar under
              the header while the cards are read. It takes no room in the page. */}
          <StepTracker listId="step-list" indexId={INDEX_ID} topId="steps" noun={audit ? "Check" : "Step"} />
          <StepList pb={pb} lk={lookups} id="step-list" />
        </section>

        <div className="mt-20 md:mt-24 print:hidden">
          <PlanDrawing pb={pb} id="plan" />
        </div>

        <section aria-labelledby="takes" className="mt-12 md:mt-16 print:mt-10">
          <SectionHead id="takes" title={audit ? "What the checks ask of a person." : "What the steps ask of a person."} note="Counted from the step data" />
          <KeyFacts pb={pb} />
        </section>

        {rules.length > 0 && (
          <section aria-labelledby="rules" className="mt-24 md:mt-32 print:mt-10">
            <SectionHead
              id="rules"
              title={`The rules this ${kindNoun} relies on.`}
              note={rules.length === 1 ? "1 rule card, linked to its law" : `${rules.length} rule cards, each linked to its law`}
            />
            <ul className="m-0 list-none border-t border-line-strong p-0">
              {rules.map((r) => (
                <li key={r.id} className="min-w-0">
                  <RuleCard
                    rule={r}
                    today={today}
                    fold
                    usedBy={<RuleUsers pb={pb} ruleId={r.id} />}
                    summaryNote={<RuleUseNote pb={pb} ruleId={r.id} />}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {pb.sources.length > 0 && (
          <section aria-labelledby="sources" className={`print:mt-10 ${rules.length > 0 ? "mt-16 md:mt-20" : "mt-24 md:mt-32"}`}>
            <SectionHead
              id="sources"
              title="Where every fact comes from."
              note={pb.sources.length === 1 ? "1 source, opened on the date shown" : `${pb.sources.length} sources, each opened on the date shown`}
            />
            <SourceList sources={pb.sources} today={today} />
          </section>
        )}

        <section aria-labelledby="chain" className="mt-16 md:mt-20 print:hidden">
          <SectionHead id="chain" title="What it needs, and what it hands on." />
          <BeforeAfterChain requires={requires} consumes={pb.consumes.map(artifactName)} produces={pb.produces.map(artifactName)} next={next} />
        </section>
      </Container>
    </div>
  );
}
