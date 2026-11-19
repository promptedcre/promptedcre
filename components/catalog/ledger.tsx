import type { ReactNode } from "react";
import { Heading, RoleMark, TextLink, cx } from "@/components/ui";
import type { SiteFacts } from "@/lib/compute/site-facts";
import { DEFAULT_VARIANT } from "@/lib/compute/variant";
import { JURISDICTION_LABEL, PROPERTY_LABEL, STRUCTURE_LABEL } from "@/lib/labels";
import { JURISDICTIONS, type Review, type Structure } from "@/lib/schemas/common";
import type { ReviewEntry } from "@/lib/schemas/records";
import { ReviewSquare, stepStructuresOf } from "./row-parts";

// Ledger: "Where it stands" on /playbooks, the one place that explains every count the site
// prints, once each: the fact in the site's fixed wording, then one line on what it counts. It
// opens with the catalog's one sentence (siteFacts catalog.line, D121) and is the only place
// that prints a catalog denominator (the records listed, by kind; the list on /playbooks), the
// fund and JV views of the agent share and the count of every step record; every other page
// prints the syndication view alone and links its headline here (/playbooks#where-it-stands).
// Every figure is computed: siteFacts and the dated review ledger. A review level no record has
// reached is left out. A column surface: plain ground, ruled rows, figures in the reading face
// with tabular digits, dates in the data face.

type Row = {
  item: string;
  fact: ReactNode;
  says: ReactNode;
  /** A row that breaks down the one above it. */
  sub?: boolean;
  /** The first row of a new group draws a heavier rule above it. */
  group?: boolean;
};

const REVIEW_ORDER: Review[] = ["attorney-reviewed", "practitioner-reviewed", "ai-drafted"];
const REVIEW_WORD: Record<Review, string> = {
  "attorney-reviewed": "attorney-reviewed",
  "practitioner-reviewed": "practitioner-reviewed",
  "ai-drafted": "AI-drafted",
};
const MODES = [
  { key: "agent", word: "Agent", mark: "A" },
  { key: "agent-browser", word: "Agent in a browser", mark: "B" },
  { key: "human-online", word: "Person online", mark: "H" },
  { key: "human-offline", word: "Person offline", mark: "O" },
] as const;

/** A counted figure inside a sentence: the reading face, tabular digits, one step heavier. */
function N({ children }: { children: ReactNode }) {
  return <b className="font-medium tabular-nums text-text">{children}</b>;
}

function Day({ d }: { d: string }) {
  return (
    <time dateTime={d} className="type-data whitespace-nowrap">
      {d}
    </time>
  );
}

function Dates({ first, last }: { first: string | null; last: string | null }) {
  if (!last) return null;
  if (first && first !== last)
    return (
      <>
        <Day d={first} /> to <Day d={last} />
      </>
    );
  return <Day d={last} />;
}

// The first and last date a person reviewed a written record at each level.
function reviewDates(facts: SiteFacts, reviews: readonly ReviewEntry[]) {
  const written = new Set(facts.records.map((r) => r.id));
  const range = (level: Review) => {
    const dates = reviews.filter((r) => r.kind === "playbook" && r.level === level && written.has(r.id)).map((r) => r.date).sort();
    return { first: dates[0] ?? null, last: dates.at(-1) ?? null };
  };
  return { "attorney-reviewed": range("attorney-reviewed"), "practitioner-reviewed": range("practitioner-reviewed") };
}

export function Ledger({
  facts,
  reviews,
  computedOn,
  id = "where-it-stands",
  className,
}: {
  facts: SiteFacts;
  /** content/reviews.json: the dated reviews behind every "reviewed" count. */
  reviews: readonly ReviewEntry[];
  /** The date the facts were computed (the StatusLine shows the same date). */
  computedOn: string;
  id?: string;
  className?: string;
}) {
  const { counts, share, trust, coverage } = facts;
  const view = share.syndication;
  const levels = REVIEW_ORDER.filter((r) => trust.review[r] > 0);
  const reviewed = reviewDates(facts, reviews);
  const lawOf = coverage.jurisdictions.map((j) => JURISDICTION_LABEL[j]).join(" and ");
  const defaultView = `${STRUCTURE_LABEL[DEFAULT_VARIANT.structure].toLowerCase()} structure, ${PROPERTY_LABEL[DEFAULT_VARIANT.propertyType].toLowerCase()} property, ${lawOf} law`;
  const kinds = [
    { item: "Playbooks", k: "process", says: "The planned work, from forming the entity to selling." },
    { item: "Scenarios", k: "situation", says: "What to do when something goes wrong, on their own page." },
    {
      item: "Audits",
      k: "audit",
      says: (
        <>
          Checks on a firm that already runs. This page lists them with the playbooks:{" "}
          <N>{counts.listedByKind.process + counts.listedByKind.audit}</N> in all.
        </>
      ),
    },
  ] as const;
  // Which written records a view reads. A record written for some structures only has steps
  // in those views and none in the others, so the views do not all read the same records.
  const inView = (s: Structure) => facts.records.filter((r) => r.byStructure[s].total > 0);
  const inDefault = new Set(inView(DEFAULT_VARIANT.structure).map((r) => r.id));
  // Written, with steps in another structure and none in the default view.
  const elsewhere = facts.records.filter((r) => !inDefault.has(r.id) && stepStructuresOf(r).length > 0).length;
  const otherView = (s: "fund" | "jv", name: string): Row => {
    const here = new Set(inView(s).map((r) => r.id));
    const more = [...here].filter((id) => !inDefault.has(id)).length;
    const fewer = [...inDefault].filter((id) => !here.has(id)).length;
    return {
      item: `${STRUCTURE_LABEL[s]} view`,
      sub: true,
      fact:
        share[s].pct === null ? null : (
          <>
            <N>{share[s].pct}%</N> of <N>{share[s].total}</N>
          </>
        ),
      says:
        more === 0 && fewer === 0
          ? `The same written records read for ${name}. Some steps apply to one structure only, so the count moves.`
          : `The steps of ${here.size} of the ${counts.written} written records, read for ${name}. Some records and steps are written for some structures only, so the count moves.`,
    };
  };

  const rows: Row[] = [
    {
      item: "Records",
      group: true,
      fact: facts.catalog.line,
      says: (
        <>
          <N>{counts.playbooks}</N> records listed. Written in full: every step written out, with who does it and where it comes
          from. An outline is listed by its title; no count below includes it.
        </>
      ),
    },
    ...kinds.map((k) => ({
      item: k.item,
      sub: true,
      fact: (
        <>
          <N>{counts.listedByKind[k.k]}</N> listed, <N>{counts.writtenByKind[k.k]}</N> written
        </>
      ),
      says: k.says,
    })),
    {
      item: "Written steps",
      group: true,
      fact: (
        <>
          <N>{view.total}</N> written steps
        </>
      ),
      // The Records row above says how many are written. Where one of them is written for
      // another structure only, this row says how many of them its steps come from.
      says:
        elsewhere === 0
          ? `Every step of the ${counts.written} written records that applies in the default view: ${defaultView}.`
          : `Every step that applies in the default view (${defaultView}), from ${inDefault.size} of the ${counts.written} written records. The other ${elsewhere === 1 ? "one has" : `${elsewhere} have`} no steps in this view.`,
    },
    {
      item: "Who does them",
      sub: true,
      fact: (
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
          {MODES.map((m) => (
            <li key={m.key} className="inline-flex items-center gap-2 whitespace-nowrap">
              <RoleMark mode={m.mark} size="sm" label={m.word} />
              <N>{view.modes[m.key]}</N>
            </li>
          ))}
        </ul>
      ),
      says: "Every written step names who does it. The person's steps are where an agent stops; a person's mark has a cut corner.",
    },
    {
      item: "What an agent can do",
      group: true,
      fact:
        view.pct === null ? null : (
          <>
            An agent can do <N>{view.pct}%</N> of the <N>{view.total}</N> written steps
          </>
        ),
      says: (
        <>
          <N>{view.agent}</N> steps: <N>{view.modes.agent}</N> by an agent and <N>{view.modes["agent-browser"]}</N> by an
          agent in a browser. The one share the site prints; a record&rsquo;s own page prints its own.
        </>
      ),
    },
    otherView("fund", "a fund"),
    otherView("jv", "a joint venture"),
    {
      item: "Step records",
      sub: true,
      fact: (
        <>
          <N>{trust.steps}</N> step records
        </>
      ),
      says: "Every step written in those records before a view picks the ones that apply: all three structures, every property type and state.",
    },
    {
      item: "Cited",
      group: true,
      fact: (
        <>
          <N>{view.cited}</N> of <N>{view.total}</N> written steps cite a public source
        </>
      ),
      says: (
        <>
          The other <N>{view.practice}</N> rest on common practice: how firms do it, with no public source to cite.
        </>
      ),
    },
    {
      item: "Sources",
      fact: (
        <>
          <N>{trust.sourcesUnique}</N> sources
        </>
      ),
      says: (
        <>
          Distinct addresses, each counted once. The records and rule cards cite them <N>{trust.sourcesListed}</N> times:
          those are citations, not sources.
        </>
      ),
    },
    {
      item: "Review",
      fact: levels.map((r, i) => (
        <span key={r}>
          {i > 0 && ", "}
          <N>{trust.review[r]}</N> {REVIEW_WORD[r]}
        </span>
      )),
      says: (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {levels.map((r) => (
            <li key={r} className="flex items-baseline gap-2">
              <ReviewSquare review={r} />
              <span>
                {r === "ai-drafted" ? (
                  <>
                    AI-drafted from the cited sources, sources checked <Dates {...trust.checked[r]} />.
                  </>
                ) : (
                  <>
                    Reviewed by {r === "attorney-reviewed" ? "an attorney" : "a practitioner"}, <Dates {...reviewed[r]} />.
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      item: "Rule cards",
      group: true,
      fact: (
        <>
          <N>{counts.rules}</N> rule cards, each cites its law and the date it was checked
        </>
      ),
      says: (
        <>
          {JURISDICTIONS.filter((j) => counts.rulesByJurisdiction[j] > 0).map((j, i) => (
            <span key={j}>
              {i > 0 && ", "}
              <N>{counts.rulesByJurisdiction[j]}</N> {JURISDICTION_LABEL[j]}
            </span>
          ))}
          . <TextLink href="/rules" tone="accent">See the rules</TextLink>
        </>
      ),
    },
    {
      item: "Coverage",
      fact: coverage.label,
      says: `The written steps are read for ${lawOf} law. A step for another state is listed apart on its record's page, not numbered.`,
    },
  ];

  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cx("scroll-mt-24", className)}>
      <Heading level={2} id={`${id}-h`} className="m-0">
        Where it stands.
      </Heading>
      <p className="type-body-s m-0 mt-2 text-faint">
        Counted from the catalog on <Day d={computedOn} />
      </p>
      <dl className="m-0 mt-6 border-b border-line-strong">
        {rows
          .filter((r) => r.fact !== null && r.fact !== undefined)
          .map((r) => (
            <div
              key={r.item}
              className={cx(
                "grid gap-x-8 gap-y-1 py-4 md:grid-cols-[11rem_minmax(0,0.9fr)_minmax(0,1.1fr)]",
                r.group ? "border-t border-line-strong" : "border-t border-line",
                // a sub-row breaks down the one above it: indented at every width (the whole row on
                // a phone, where its cells stack; the label from 768 px, where they are columns)
                r.sub && "max-md:pl-4",
              )}
            >
              <dt className={cx("type-body-s", r.sub ? "text-faint md:pl-4" : "font-medium text-muted")}>{r.item}</dt>
              <dd className={cx("m-0", r.sub ? "type-body-s text-muted" : "type-body text-text")}>{r.fact}</dd>
              <dd className="type-body-s m-0 text-faint">{r.says}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
