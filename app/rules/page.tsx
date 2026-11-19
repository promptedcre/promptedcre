import type { Metadata } from "next";
import { Container, Disclosure, PageHead } from "@/components/ui";
import { CatalogFilter, ListSearch } from "@/components/catalog";
import { DateSpan, JumpLinks } from "@/components/library/cover";
import { RuleSubjectGroup, subjectFilterHides } from "@/components/library/rule-index";
import { LibraryStyles } from "@/components/library/styles";
import { ruleRows, ruleSubjects, ruleTotals, rulesByJurisdiction } from "@/components/library/data";
import { getCorpus } from "@/lib/content/load";
import { STALE_DAYS } from "@/lib/content/semantic";

export const metadata: Metadata = {
  title: "Rules",
  description: "Rule cards: what the law requires, in plain words, each linked to the law it comes from, dated, and linked to the playbook steps that cite it.",
};

const ROOT = "rules-root";

const REVIEW_WORD = { "practitioner-reviewed": "practitioner-reviewed", "attorney-reviewed": "attorney-reviewed", "ai-drafted": "AI-drafted" } as const;

// While a title is typed in the box (ListSearch marks the root data-q): a row that misses
// goes, and so does a subject the box found empty (data-none). The box itself needs scripts:
// with scripts off it is not drawn and nothing is filtered. In @layer components (DIRECTION
// section 9); a hide is !important so a display utility cannot undo it.
const SEARCH_CSS = `@layer components {
html:not(.js) .cl-js{display:none}
#${ROOT}[data-q] [data-row][data-miss],#${ROOT}[data-q] [data-none]{display:none !important}
}`;

// /rules: a ruled index of every rule card, grouped by the subject its id names. Read mode:
// the head, then the filter row the catalog lists draw (D230): a box that keeps the rules
// whose titles match what is typed, and the jurisdiction as a pill track (a select on a
// phone); then the subject list, then the rows, each subject coming into focus once as it
// reaches the screen.
export default function RulesPage() {
  const corpus = getCorpus();
  const today = new Date();
  const rows = ruleRows(corpus, today);
  const totals = ruleTotals(corpus, rows);
  const byJ = rulesByJurisdiction(corpus.rules);
  const subjects = ruleSubjects(rows);

  // Review stated as what it is: when no card has been reviewed by a person, say how each one
  // stands instead of printing a bare zero.
  const review =
    totals.byReview.length === 1 && totals.byReview[0]?.review === "ai-drafted"
      ? "AI-drafted; each card cites its law"
      : totals.byReview.map((r) => `${r.count} ${REVIEW_WORD[r.review]}`).join(", ");

  const options = [
    { value: "all", label: "All", count: totals.cards, hides: subjectFilterHides("all") },
    ...byJ.map((j) => ({
      value: j.id,
      label: j.label,
      count: j.count,
      hides: [`[data-j]:not([data-j="${j.id}"])`, ...subjectFilterHides(j.id)],
    })),
  ];

  const subjectLinks = (
    <JumpLinks lead="md" items={subjects.map((s) => ({ href: `#s-${s.key}`, label: s.label, js: s.jurisdictions.join(" ") }))} />
  );

  return (
    <div id={ROOT}>
      <LibraryStyles />
      <style href="rules-search" precedence="default">
        {SEARCH_CSS}
      </style>
      <Container>
        <PageHead
          title="Rules"
          lede={
            <>
              Rule cards: what the law requires, in plain words. Each card links the law it comes from and the date it was
              last checked, and the playbook steps that rest on it.
            </>
          }
          facts={[
            { label: "rule cards", value: totals.cards, lead: true },
            { label: "By jurisdiction", value: byJ.map((j) => `${j.count} ${j.label}`).join(", ") },
            { label: "Sources checked", value: <DateSpan from={totals.oldest} to={totals.newest} /> },
            { label: "Review", value: review },
            ...(totals.stale > 0 ? [{ label: `Over ${STALE_DAYS} days old`, value: `${totals.stale} of ${totals.cards}` }] : []),
          ]}
        >
          {/* One ruled row from 768 px, as on /playbooks: the box, then the pills. On a phone the
              box and the select each take their own line. */}
          <div className="mt-8 flex min-w-0 flex-col gap-3 border-t border-line pt-3 print:hidden md:flex-row md:flex-wrap md:items-center md:gap-x-8 md:border-b md:py-3">
            <ListSearch rootId={ROOT} noun="rules" />
            <CatalogFilter rootId={ROOT} name="jurisdiction" legend="Show" options={options} />
          </div>
          <nav aria-label="Rules by subject" className="mt-6 print:hidden">
            <Disclosure openFrom="md" summary="Jump to a subject" summaryClassName="type-body-s text-muted">
              {subjectLinks}
            </Disclosure>
          </nav>
        </PageHead>

        {subjects.map((s, i) => (
          <RuleSubjectGroup key={s.key} subject={s} first={i === 0} />
        ))}
      </Container>
    </div>
  );
}
