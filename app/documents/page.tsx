import type { Metadata } from "next";
import { Container, PageHead } from "@/components/ui";
import { DateSpan, GroupHead, JumpLinks } from "@/components/library/cover";
import { ACCESS_ORDER, documentGroups, type Access } from "@/components/library/data";
import { AccessKey, AccessMarks, DocumentSchedule } from "@/components/library/document-schedule";
import { LibraryStyles } from "@/components/library/styles";
import { getCorpus } from "@/lib/content/load";
import { STALE_DAYS } from "@/lib/content/semantic";

export const metadata: Metadata = {
  title: "Public forms",
  description:
    "Forms and standards an operator files or reads, linked to the agency or body that publishes them, with the access level and the date each link was last checked.",
};

// /documents: one schedule per phase, then what each access level means.
export default function DocumentsPage() {
  const { documents } = getCorpus();
  const today = new Date();
  const groups = documentGroups(documents, today);
  const counts = Object.fromEntries(ACCESS_ORDER.map((a) => [a, documents.filter((d) => d.access === a).length])) as Record<
    Access,
    number
  >;
  const publishers = new Set(documents.map((d) => d.publisher)).size;
  const checked = documents.map((d) => d.lastChecked).sort();
  const stale = groups.reduce((n, g) => n + g.rows.filter((r) => r.stale).length, 0);
  const word = (n: number) => `${n} ${n === 1 ? "document" : "documents"}`;

  return (
    <Container>
      <LibraryStyles />
      <AccessMarks />
      <PageHead
        title="Public forms"
        lede={
          <>
            The public forms and standards an operator files or reads, each linked to the agency or body that publishes it.
            Nothing is copied here; a paid item is listed so you know it exists.
          </>
        }
        facts={[
          { label: "public forms", value: documents.length, lead: true },
          { label: "Publishers", value: publishers },
          { label: "Links checked", value: <DateSpan from={checked[0]} to={checked.at(-1)} /> },
          ...(stale > 0 ? [{ label: `Over ${STALE_DAYS} days old`, value: `${stale} of ${documents.length}` }] : []),
        ]}
      >
        <nav aria-label="Documents by phase" className="mt-6 print:hidden">
          <JumpLinks
            items={[
              ...groups.map((g) => ({ href: `#${g.key}`, label: g.label, note: g.rows.length })),
              { href: "#access", label: "Access levels" },
            ]}
          />
        </nav>
      </PageHead>

      {groups.map((g, i) => (
        <section key={g.key} aria-labelledby={g.key} className={i === 0 ? "pt-10" : "pt-12 md:pt-16"}>
          <GroupHead id={g.key} className="scroll-mt-24" title={g.label} note={word(g.rows.length)} />
          <DocumentSchedule group={g} />
        </section>
      ))}

      <section aria-labelledby="access" className="pt-16 md:pt-24">
        <GroupHead id="access" className="scroll-mt-24" title="What each access level means" />
        <AccessKey counts={counts} className="max-w-3xl" />
      </section>
    </Container>
  );
}
