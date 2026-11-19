import type { ReactNode } from "react";
import { ageInDays, STALE_DAYS } from "@/lib/content/semantic";
import { JURISDICTION_LABEL } from "@/lib/labels";
import type { Rule } from "@/lib/schemas/records";
import { ReviewChip, Tag } from "./chips";
import { Disclosure } from "./ui/disclosure";

// RuleCard: one rule as a ruled row, led by its title in plain words. Beside the title, in
// quiet ink, where it applies and `summaryNote` (say, "Used by steps 03, 09"); under it the
// rule's id, small, as the handle an agent uses. Then the rule in its own words, the
// authority it cites (a link), the date its sources were last checked and its review state.
// `usedBy` is an optional slot under that (a playbook page lists its steps there). Each row
// carries id="rule-<id>" so a step can link to it. It is a row, not a box: put several in a
// list and they rule themselves off.
//
// `fold` (default false): the row opens from the foundation's fold at every width; closed
// it shows the title, the note and the id, and a #hash that targets the row shows it open
// even with scripts off. The whole row opens and closes it. A page that draws rule cards
// renders <FoldStyles /> (./playbook/fold) once itself: the card does not, so the rules are
// not repeated in the payload once per card.
//
// `inList` (default false): for a page that lists many cards under jurisdiction heads and
// states review once for all of them. The jurisdiction is left out, and the review chip
// shows only where a person reviewed the card.
export function RuleCard({
  rule,
  usedBy,
  today,
  fold = false,
  summaryNote,
  inList = false,
}: {
  rule: Rule;
  usedBy?: ReactNode;
  today?: Date;
  fold?: boolean;
  summaryNote?: ReactNode;
  inList?: boolean;
}) {
  const stale = today ? ageInDays(rule.lastVerified, today) > STALE_DAYS : false;
  const chip = !inList || rule.review !== "ai-drafted";
  const where = inList ? null : JURISDICTION_LABEL[rule.jurisdiction];
  const meta = (where || summaryNote) && (
    <span className="rc-meta type-body-s">
      {where}
      {where && summaryNote && " · "}
      {summaryNote}
    </span>
  );
  const id = (
    <span className="rc-id">
      <code className="type-data">{rule.id}</code>
    </span>
  );
  const body = (
    <>
      <p className="rc-rule type-body">{rule.rule}</p>
      <p className="rc-cite type-body-s">
        <a href={rule.citation.url} rel="noreferrer" className="link link--accent">
          {rule.citation.authority}
        </a>
        <span>
          Sources checked{" "}
          {/* A date in a line of words is set in the words' own face; a <time> keeps its figures tabular. */}
          <time dateTime={rule.lastVerified} className="whitespace-nowrap">
            {rule.lastVerified}
          </time>
        </span>
        {chip && <ReviewChip review={rule.review} />}
        {stale && <Tag tone="warn">check date</Tag>}
      </p>
      {usedBy}
    </>
  );

  // The rule's title is a heading in both forms, and never inside a fold's summary: a summary
  // is a button to a screen reader, and a heading inside a button cannot be jumped to.
  const title = <h3 className="rc-t type-title-s">{rule.title}</h3>;

  if (!fold)
    return (
      <article id={`rule-${rule.id}`} className="rc rc-open">
        <div className="rc-head">
          {title}
          {meta}
          {id}
        </div>
        <div className="rc-body">{body}</div>
      </article>
    );

  // Folded: the heading, then the fold. The summary holds the rule's id (its name to a screen
  // reader is "Rule <id>"), and its click area is stretched over the whole row (./playbook/fold),
  // so the title opens and closes the card as it did.
  return (
    <article id={`rule-${rule.id}`} className="rc">
      <div className="rc-head">
        {title}
        {meta}
      </div>
      <Disclosure
        chevron="end"
        className="rc-fold"
        bodyClassName="rc-body"
        summary={
          <>
            <span className="sr-only">Rule </span>
            {id}
          </>
        }
      >
        {body}
      </Disclosure>
    </article>
  );
}
