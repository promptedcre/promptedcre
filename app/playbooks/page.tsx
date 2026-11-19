import type { Metadata } from "next";
import { buildDate } from "@/lib/build-date";
import { Container, PageHead, Sheet, TextLink, TitleBlock, TitleCell } from "@/components/ui";
import { BuildingElevation, CatalogList, Ledger, PerStructure, getCatalog, kindCount, moreOutlined, pick, type ListGroup } from "@/components/catalog";
import { StructureSwitch } from "@/components/structure-switch";
import { getCorpus } from "@/lib/content/load";
import { STRUCTURE_LABEL, type PHASE_LABEL } from "@/lib/labels";

export const metadata: Metadata = {
  title: "Playbooks",
  description:
    "The life of a real estate firm as step-by-step playbooks, in six phases. Every step says whether an AI agent can do it or a person must.",
};

const ROOT = "playbooks-root";

// /playbooks, a Read page. The list is the page: the head, one quiet row of filters, then every
// playbook and audit grouped by phase. Then the one drawing, the building elevation, as a sheet
// with its title block, and the ledger that explains every total once.
export default function PlaybooksPage() {
  const { facts, written, outlined } = getCatalog();
  const computedOn = buildDate();

  // The list holds the process playbooks by phase, then the audits, and the head counts the same
  // records, named as what they are ("23 playbooks and audits written in full"), so the figure
  // cannot be read against the whole catalog's sentence in the ledger and the status line. The
  // filter's counts and the review key share that scope.
  const listed = (r: { kind: string }) => r.kind === "process" || r.kind === "audit";
  const writtenHere = [...pick(written, { kind: "process" }), ...pick(written, { kind: "audit" })];
  const outlinedHere = outlined.filter(listed);
  const groups: ListGroup[] = [
    ...facts.phases.map((p) => ({ key: p.phase, label: p.label })),
    { key: "audits", label: "Audits" },
  ];
  const groupOf = (r: { kind: string; phase: keyof typeof PHASE_LABEL }) => (r.kind === "audit" ? "audits" : r.phase);

  // The elevation's title block: what the drawing counts, at what scale, on what date.
  const floors = facts.phases.reduce((n, p) => n + p.playbooks.length, 0);
  const floorsWritten = facts.phases.reduce((n, p) => n + p.written, 0);

  return (
    <div id={ROOT} data-structure="syndication" data-ptype="industrial">
      <Container>
        <PageHead
          title="Playbooks"
          lede={
            <>
              The life of a real estate firm, step by step, from forming the entity to selling. Every step says whether
              your AI agent can do it or a person must. Every written playbook can be copied into any AI chat as a file,
              from the top of its page.
            </>
          }
          facts={[
            {
              lead: true,
              label: `playbooks and audits written in full. ${moreOutlined(outlinedHere.length)}`.trim(),
              value: writtenHere.length,
              // the figure and its words stay on one line, the words wrapping beside it on a phone
              className: "max-md:flex-nowrap",
            },
            { label: "Coverage", value: facts.coverage.label },
          ]}
        />

        <div className="mt-8">
          <CatalogList
            id="catalog"
            noun="playbooks and audits"
            written={writtenHere}
            outlined={outlinedHere}
            groups={groups}
            groupOf={groupOf}
            groupLegend="Phase"
            detail="summary"
            controls={
              <>
                <span className="type-label whitespace-nowrap text-faint">Capital structure</span>
                <StructureSwitch rootId={ROOT} />
              </>
            }
            footer={
              <p className="type-body m-0 mt-10 text-muted">
                For the day something goes wrong, {kindCount("situation", facts.situations.written)}{" "}
                {facts.situations.written === 1 ? "is" : "are"} written in full.{" "}
                <TextLink href="/situations">See the scenarios</TextLink>
              </p>
            }
          />
        </div>

        <Sheet
          title="The whole catalog, one floor per playbook."
          titleId="elevation-h"
          level={2}
          grid
          className="mt-16 md:mt-24"
          titleBlock={
            <TitleBlock label="About this drawing" cols={4}>
              <TitleCell label="Written">
                <span className="tabular-nums">
                  {floorsWritten} of {floors} playbooks
                </span>
              </TitleCell>
              <TitleCell label="Fill">
                What an agent can do, <PerStructure>{(s) => STRUCTURE_LABEL[s]}</PerStructure>
              </TitleCell>
              <TitleCell label="Scale">1 floor = 1 playbook</TitleCell>
              <TitleCell label="Counted" mono>
                <time dateTime={computedOn}>{computedOn}</time>
              </TitleCell>
            </TitleBlock>
          }
        >
          <BuildingElevation facts={facts} labelId="elevation-h" />
        </Sheet>

        <Ledger facts={facts} reviews={getCorpus().reviews} computedOn={computedOn} className="mt-16 md:mt-24" />
      </Container>
    </div>
  );
}
