import type { Metadata } from "next";
import { Container, PageHead } from "@/components/ui";
import { ArtifactSchedule } from "@/components/library/artifact-schedule";
import { GroupHead, JumpLinks } from "@/components/library/cover";
import { artifactRows } from "@/components/library/data";
import { LibraryStyles } from "@/components/library/styles";
import { getCorpus } from "@/lib/content/load";

export const metadata: Metadata = {
  title: "Firm documents",
  description:
    "The documents a real estate firm produces and uses, with the playbooks that make and read each one, and field standards for the ones agents fill most.",
};

// /artifacts: two schedules, the artifacts with a field standard and the ones named and described.
export default function ArtifactsPage() {
  const corpus = getCorpus();
  const { standard, plain } = artifactRows(corpus);
  const all = [...standard, ...plain];
  const fields = standard.reduce((n, r) => n + r.artifact.fields.length, 0);
  const made = all.filter((r) => r.makes.length > 0).length;
  const used = all.filter((r) => r.uses.length > 0).length;
  const of = (n: number) => (
    <>
      {n}
      <span className="text-faint"> of {all.length}</span>
    </>
  );

  return (
    <Container>
      <LibraryStyles />
      <PageHead
        title="Firm documents"
        lede={
          <>
            The documents a firm produces and uses, from the operating agreement to the rent roll. Each one lists the
            playbooks that make it and the ones that read it.
          </>
        }
        facts={[
          { label: "firm documents", value: all.length, lead: true },
          { label: "With a field standard", value: of(standard.length) },
          { label: "Fields defined", value: fields },
          { label: "Made by a playbook", value: of(made) },
          { label: "Read by a playbook", value: of(used) },
        ]}
      >
        <nav aria-label="Firm documents by kind" className="mt-6 print:hidden">
          <JumpLinks
            items={[
              ...(standard.length > 0 ? [{ href: "#standards", label: "With a field standard", note: standard.length }] : []),
              ...(plain.length > 0 ? [{ href: "#named", label: "Named and described", note: plain.length }] : []),
            ]}
          />
        </nav>
      </PageHead>

      {standard.length > 0 && (
        <section aria-labelledby="standards" className="pt-10">
          <GroupHead id="standards" className="scroll-mt-24" title="With a field standard" note={`${standard.length} artifacts, ${fields} fields`} />
          <p className="type-body measure m-0 mb-6 text-pretty text-muted">
            A field standard lists the fields a document carries, each with its type, its definition and, where there is one,
            the form item or rule that defines it, so every AI agent means the same thing by the same field.
          </p>
          <ArtifactSchedule rows={standard} label="Artifacts with a field standard" />
        </section>
      )}

      {plain.length > 0 && (
        <section aria-labelledby="named" className="pt-16 md:pt-24">
          <GroupHead id="named" className="scroll-mt-24" title="Named and described" note={`${plain.length} artifacts, no field standard yet`} />
          <ArtifactSchedule rows={plain} label="Artifacts without a field standard" />
        </section>
      )}
    </Container>
  );
}
