import type { ReactNode } from "react";
import { ReviewChip, Tag } from "@/components/chips";
import { CopyButton } from "@/components/connect/copy-button";
import { Disclosure, Icon } from "@/components/ui";
import { JURISDICTION_LABEL } from "@/lib/labels";
import type { Jurisdiction } from "@/lib/schemas/common";
import type { RuleRow, RuleSubject } from "./data";
import { RuleCitations } from "./rule-parts";
import { titleKey } from "@/components/catalog/title-words";
import { GroupHead } from "./cover";

// The rule index on /rules: one ruled row per rule, grouped by subject. A row leads with the
// rule's plain title; who cites it, where it applies and when it was checked sit to the right
// from 768 px (under the title on a phone); the id an agent cites sits small and faint beneath,
// with its copy control. A row opens (the one Disclosure) to the rule in its own words and a
// ruled facts list: the law, the sources, who cites it, what would change it, its review. Each
// row keeps id="rule-<id>": steps, findings and search link there, and a link to it opens the
// row with scripts off. The body is .lb-lazy: an open rule far down the page is not laid out
// until it nears the screen.
//
// The jurisdiction filter (CatalogFilter on the page) hides rows by data-j, a subject with no row
// in the chosen jurisdiction by data-js, and swaps each subject's count by data-c (see
// subjectFilterHides). The title box over the list (ListSearch) reads a row's data-row and
// data-title and a subject's data-g. Nothing here needs a script except the copy button, which
// is absent without one (the id stays, selectable by hand), and the title box.
//
// The look of the catalog lists (D230): a closed row lights softly under the pointer or the
// keyboard, the #target row keeps the selected fill on the same rounded light (.lb-rr in
// LibraryStyles), and each subject comes into focus once as it reaches the screen (data-reveal;
// scripts off, less motion and paper get it in place).

// .lb-rs (LibraryStyles) is the row's grid: the title cell, then cited by, where and checked from 768 px.
const COLS = "lb-rs";

/** What one jurisdiction choice hides beyond its rows: the subjects it empties and the other counts. */
export function subjectFilterHides(value: "all" | Jurisdiction): string[] {
  return value === "all"
    ? ['[data-c]:not([data-c="all"])']
    : [`[data-js]:not([data-js~="${value}"])`, `[data-c]:not([data-c="${value}"])`];
}

// A row: the summary (title, then cited by, where and checked) opens the rule; the id and its
// copy control sit on their own line under the summary, outside it, so pressing Copy never
// toggles the fold and the summary stays one control. Open, the rule's body comes between the
// summary and the id line, which then closes the row like a title block's last cell. The row
// lights as the #target (.lb-rr:has(:target)), id line included.
function RuleIndexRow({ row }: { row: RuleRow }) {
  const { rule, steps, stale } = row;
  return (
    <li data-j={rule.jurisdiction} data-row="" data-title={titleKey(rule.title)} className="lb-rr border-b border-line">
      <Disclosure
        id={`rule-${rule.id}`}
        chevron="end"
        className="scroll-mt-24"
        summaryClassName="group/rule pt-4 pb-1 md:pr-1"
        bodyClassName="lb-lazy lb-lazy--s pt-3 pb-6 md:pr-12"
        summary={
          <span className={COLS}>
            {/* a heading by role, so a screen reader can step through the rules: an <h3> cannot
                sit in the Disclosure's label span */}
            <span
              role="heading"
              aria-level={3}
              className="type-title-s block min-w-0 text-balance text-text transition-colors group-hover/rule:text-accent-strong"
            >
              {rule.title}
            </span>
            {/* on a phone these three read as one line under the title; from 768 px they are columns */}
            <span className="type-body-s flex flex-wrap items-baseline gap-x-3 gap-y-1 text-muted md:contents">
              <span className="tabular-nums">
                <span className="md:sr-only">Cited by </span>
                {steps > 0 ? (
                  `${steps} ${steps === 1 ? "step" : "steps"}`
                ) : (
                  <>
                    <span className="md:hidden">no step yet</span>
                    <span className="max-md:hidden">None yet</span>
                  </>
                )}
              </span>
              <span>{JURISDICTION_LABEL[rule.jurisdiction]}</span>
              <span className="text-faint">
                <span className="sr-only">Checked </span>
                <time dateTime={rule.lastVerified} className="type-data whitespace-nowrap">
                  {rule.lastVerified}
                </time>
                {stale && (
                  <span className="ml-2 inline-block md:ml-0 md:mt-1 md:block">
                    <Tag tone="warn">check date</Tag>
                  </span>
                )}
              </span>
            </span>
          </span>
        }
      >
        <p className="type-body measure m-0 text-pretty text-text">{rule.rule}</p>
        <dl className="type-body-s m-0 mt-6 max-w-[52rem]">
          <Fact term="The law">
            <a href={rule.citation.url} rel="noreferrer" className="lb-q inline-flex items-baseline gap-1.5">
              {rule.citation.authority}
              <Icon name="external" className="self-center text-faint" />
              <span className="sr-only"> (opens the source)</span>
            </a>
            <span className="mt-1 block text-faint">
              As of <time dateTime={rule.asOf} className="type-data">{rule.asOf}</time>; sources checked{" "}
              <time dateTime={rule.lastVerified} className="type-data">
                {rule.lastVerified}
              </time>
            </span>
          </Fact>
          <Fact term={rule.sources.length === 1 ? "Source" : "Sources"}>
            <ul className="lb-xl">
              {rule.sources.map((s) => (
                <li key={s.id}>
                  <a href={s.url} rel="noreferrer" className="lb-q">
                    {s.title}
                  </a>
                  <span className="mt-0.5 block text-faint">{s.publisher}</span>
                </li>
              ))}
            </ul>
          </Fact>
          <Fact term="Cited by">
            <RuleCitations row={row} />
          </Fact>
          {rule.changeWatch && <Fact term="What would change it">{rule.changeWatch}</Fact>}
          <Fact term="Review">
            <ReviewChip review={rule.review} />
          </Fact>
        </dl>
      </Disclosure>
      {/* the id an agent cites; the copy control renders only with scripts, the id always */}
      <p className="m-0 flex min-h-8 flex-wrap items-center gap-x-2 pb-3 max-md:pb-2">
        <code className="type-data min-w-0 break-all text-faint">{rule.id}</code>
        <CopyButton text={rule.id} label={`Copy the id ${rule.id}`} className="btn--quiet -my-2 -ml-2 border-transparent text-muted">
          Copy the id
        </CopyButton>
      </p>
    </li>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="lb-fact">
      <dt className="type-label text-faint">{term}</dt>
      <dd className="m-0 min-w-0 text-muted">{children}</dd>
    </div>
  );
}

// One subject: its heading with a count for each jurisdiction choice (the filter shows one),
// a quiet column key from 768 px, and its rows.
export function RuleSubjectGroup({ subject, first }: { subject: RuleSubject; first: boolean }) {
  const hId = `s-${subject.key}`;
  const n = (j?: Jurisdiction) => subject.rows.filter((r) => !j || r.rule.jurisdiction === j).length;
  const word = (k: number) => `${k} ${k === 1 ? "rule" : "rules"}`;
  return (
    <section
      data-js={subject.jurisdictions.join(" ")}
      data-g={subject.key}
      data-reveal=""
      aria-labelledby={hId}
      className={first ? "pt-10" : "pt-12 md:pt-16"}
    >
      <GroupHead
        id={hId}
        title={subject.label}
        className="scroll-mt-24"
        note={
          <>
            <span data-c="all">{word(n())}</span>
            {subject.jurisdictions.map((j) => (
              <span key={j} data-c={j}>
                {word(n(j))}
              </span>
            ))}
          </>
        }
      />
      <div aria-hidden="true" className={`type-label hidden border-t border-line-strong py-2 pr-8 text-faint md:grid ${COLS}`}>
        <span>Rule</span>
        <span>Cited by</span>
        <span>Where</span>
        <span>Checked</span>
      </div>
      <ol aria-label={`${subject.label}: rules`} className="m-0 list-none border-t border-line-strong p-0 md:border-line">
        {subject.rows.map((row) => (
          <RuleIndexRow key={row.rule.id} row={row} />
        ))}
      </ol>
    </section>
  );
}
