import type { Metadata } from "next";
import { Container, PageHead, TextLink } from "@/components/ui";
import { CatalogList, URGENCIES, getCatalog, moreOutlined, pick, type ListGroup, type Urgency } from "@/components/catalog";
import { StructureSwitch } from "@/components/structure-switch";

export const metadata: Metadata = {
  title: "Scenarios",
  description:
    "Unplanned events in a real estate firm's life, each with its trigger and how fast to act, and the steps an AI agent or a person takes next.",
};

const ROOT = "situations-root";

// How fast to act, in plain words. The words carry it: a group heading and a filter choice, in
// neutral ink (red is the refusal's color, and orange a finding's).
const FAST: Record<Urgency, string> = {
  hours: "Within hours",
  days: "Within days",
  weeks: "Within weeks",
};

// /situations, a Read page: the same list as /playbooks, grouped by how fast to act.
export default function SituationsPage() {
  const { facts, written, outlined } = getCatalog();
  const writtenSits = pick(written, { kind: "situation" });
  const outlinedSits = pick(outlined, { kind: "situation" });
  const all = [...writtenSits, ...outlinedSits];
  const urgencies = URGENCIES.filter((u) => all.some((r) => r.urgency === u));
  // A situation always carries its urgency (the content check requires it); one that did not
  // would be listed under "Not sorted" rather than given an urgency it does not have.
  const groups: ListGroup[] = [
    ...urgencies.map((u) => ({ key: u, label: FAST[u] })),
    ...(all.some((r) => !r.urgency) ? [{ key: "unsorted", label: "Not sorted" }] : []),
  ];

  return (
    <div id={ROOT} data-structure="syndication" data-ptype="industrial">
      <Container>
        <PageHead
          title="Scenarios"
          lede={
            <>
              The day something goes wrong. Each situation starts from what happened, says how fast you have to act, and
              marks which steps your AI agent can do and where a person decides. Every written situation can be copied
              into any AI chat as a file, from the top of its page.
            </>
          }
          facts={[
            // The situations' own counts, the catalog's way and with no denominator (those are
            // explained in the ledger on /playbooks alone): how many are written, how many outlined.
            {
              lead: true,
              label: `${writtenSits.length === 1 ? "situation" : "situations"} written in full. ${moreOutlined(outlinedSits.length)}`.trim(),
              value: writtenSits.length,
              // the figure and its words stay on one line, the words wrapping beside it on a phone
              className: "max-md:flex-nowrap",
            },
            { label: "Coverage", value: facts.coverage.label },
          ]}
        />

        <div className="mt-8">
          <CatalogList
            id="situations"
            noun="situations"
            written={writtenSits}
            outlined={outlinedSits}
            groups={groups}
            groupOf={(r) => r.urgency ?? "unsorted"}
            groupLegend="How fast"
            detail="trigger"
            controls={
              <>
                <span className="type-label whitespace-nowrap text-faint">Capital structure</span>
                <StructureSwitch rootId={ROOT} />
              </>
            }
            footer={
              <p className="type-body m-0 mt-10 text-muted">
                The planned work, from forming the entity to selling, is in the{" "}
                <TextLink href="/playbooks">playbooks</TextLink>.
              </p>
            }
          />
        </div>
      </Container>
    </div>
  );
}
