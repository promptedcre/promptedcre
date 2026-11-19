import { Disclosure, RoleMark, cx } from "@/components/ui";
import { groupByStructure } from "@/lib/compute/playbook-facts";
import { stepStructures, writtenStructures } from "@/lib/compute/variant";
import { JURISDICTION_LABEL } from "@/lib/labels";
import type { Playbook } from "@/lib/schemas/playbook";
import { ByStructure } from "./by-structure";
import { stepNumbers } from "./numbering";
import { jurisdictionCode, pad2 } from "./words";

export type PageSection = { href: string; label: string };

/** The list's own id: the step tracker (./step-tracker) finds its links by it. */
export const INDEX_ID = "step-index";

// StepIndex: the record's steps as one compact numbered list above the cards, each line its
// number, the mark of who does it (a person's has its corner cut) and its title, and each a
// link to its card (#step-<id>). Steps that apply outside the default view (a Delaware step)
// follow under their own label with their jurisdiction in place of a number, as the cards do.
// Under it, one line of links to the page's other sections.
//
// From 768 px it is simply open, in as many columns as fit (./page-styles, prefix si-); on a
// phone it is one fold ("16 steps · Jump to a step") so the first card is not a screen away.
// Server-rendered anchors, so it works with scripts off. A step that applies in some
// structures only is marked data-s, and its number is drawn per structure where the numbers
// differ, so the list follows the structure switch as the cards do. With scripts on, the step
// being read is marked aria-current="step" (./step-tracker). Not printed: on paper the steps
// follow in order.
export function StepIndex({ pb, sections = [], className }: { pb: Playbook; sections?: PageSection[]; className?: string }) {
  const Noun = pb.kind === "audit" ? "Check" : "Step";
  const noun = Noun.toLowerCase();
  const numbers = stepNumbers(pb);
  const written = new Set(pb.written.structure);
  const rows = pb.steps.filter((s) => numbers.has(s.id));
  const elsewhere = pb.steps.filter((s) => !numbers.has(s.id));
  const where = [...new Set(elsewhere.flatMap((s) => s.when?.jurisdiction ?? []))].map((j) => JURISDICTION_LABEL[j]);
  // Counted for the structures the record has steps in: the page shows no other.
  const counts = groupByStructure((s) => rows.filter((r) => numbers.get(r.id)?.[s] !== undefined).length, undefined, writtenStructures(pb));
  return (
    <nav id={INDEX_ID} aria-label={`${Noun}s, in order`} className={cx("si print:hidden", className)}>
      <Disclosure
        openFrom="md"
        chevron="end"
        summaryClassName="si-sum"
        summary={
          <span className="si-now">
            <span className="type-label tabular-nums text-text">
              <ByStructure groups={counts} render={(n) => `${n} ${n === 1 ? noun : `${noun}s`}`} />
            </span>
            <span className="type-body-s text-muted">Jump to a {noun}</span>
          </span>
        }
      >
        <ol className="si-list">
          {rows.map((step) => {
            const own = numbers.get(step.id) ?? {};
            const shownIn = stepStructures(step).filter((s) => written.has(s));
            return (
              <li key={step.id} data-s={shownIn.join(" ")}>
                <a href={`#step-${step.id}`} className="si-a">
                  <span className="si-n type-data">
                    <ByStructure groups={groupByStructure((s) => own[s] ?? 0, String, shownIn)} render={pad2} />
                  </span>
                  <RoleMark mode={step.mode} showLabel={false} size="sm" />
                  <span className="si-t type-body-s">{step.title}</span>
                </a>
              </li>
            );
          })}
        </ol>
        {elsewhere.length > 0 && (
          <>
            <p className="si-k type-label">{where.length ? `Only for ${where.join(" or ")}` : "Outside this view"}</p>
            <ul className="si-list">
              {elsewhere.map((step) => {
                const place = step.when?.jurisdiction?.[0];
                return (
                  <li key={step.id}>
                    <a href={`#step-${step.id}`} className="si-a">
                      <span className="si-n type-data">{place ? jurisdictionCode(place) : ""}</span>
                      <RoleMark mode={step.mode} showLabel={false} size="sm" />
                      <span className="si-t type-body-s">{step.title}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {sections.length > 0 && (
          <ul aria-label="Also on this page" className="si-more">
            {sections.map((s) => (
              <li key={s.href}>
                <a href={s.href} className="link link--muted type-body-s">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </nav>
  );
}
