import Link from "next/link";
import type { CSSProperties } from "react";
import { Tag } from "@/components/chips";
import { Logo, TextLink } from "@/components/ui";
import type { JourneyRow, ScenarioRow, ShareCells } from "./data";

// The home page's two lists (D218): the journey (twelve playbooks in the order a firm needs
// them) and the scenarios (what to do when something goes wrong, the most urgent first).
// Each row is a record's own numbers: how much of it an AI agent can do, said as a share with
// its count, and on the journey the ranked software its steps use, each icon a link to the
// vendor's page and named by its own label. A list of ruled rows on plain ground, never a
// box: from 768 px the rows line up in columns, and a phone reads each row as two lines.

// A record's own share: a bar in the agent's ink and the figure, with the count for anyone
// who reads it out ("5 of 12 steps").
function Share({ cells }: { cells: ShareCells }) {
  if (cells.pct === null || cells.total === 0) return <span className="type-body-s text-faint">Not counted</span>;
  const pct = Math.round(cells.pct);
  return (
    <span className="hm-share-cell" title={`${cells.agent} of ${cells.total} steps an agent can do`}>
      <span aria-hidden="true" className="hm-bar" style={{ "--pct": `${pct}%` } as CSSProperties}>
        <span className="fill-on-reveal" />
      </span>
      <span className="type-data text-text">{pct}%</span>
      <span className="sr-only">
        , {cells.agent} of {cells.total} steps an agent can do
      </span>
    </span>
  );
}

function SectionHead({ id, title, lede, all }: { id: string; title: string; lede: string; all: { href: string; text: string } }) {
  return (
    <div className="hm-head" data-reveal="">
      <div className="min-w-0">
        <h2 id={id} className="type-title-l m-0 text-text">
          {title}
        </h2>
        <p className="type-body m-0 mt-2 text-muted">{lede}</p>
      </div>
      <TextLink href={all.href} tone="accent" className="hm-all type-body-s py-3 md:py-0">
        {all.text}
      </TextLink>
    </div>
  );
}

export function JourneyTable({ rows, all }: { rows: JourneyRow[]; all: number }) {
  return (
    <section id="journey" aria-labelledby="journey-title" className="mt-12 md:mt-20">
      <SectionHead
        id="journey-title"
        title="Playbooks"
        lede="From forming the firm to running the building, in order. Each one says how much of it an AI agent can do."
        all={{ href: "/playbooks", text: `See all ${all}` }}
      />
      <div aria-hidden="true" className="hm-cols type-label mt-6 text-faint">
        <span>Playbook</span>
        <span>Phase</span>
        <span>An agent can do</span>
        <span>Software it uses</span>
      </div>
      <ol className="hm-rows">
        {rows.map((r, i) => (
          <li key={r.slug} className="hm-row" data-reveal="" style={{ "--reveal-i": i % 4 } as CSSProperties}>
            <span aria-hidden="true" className="hm-n type-data text-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Link href={`/playbooks/${r.slug}`} className="hm-title type-title-s">
              {r.title}
            </Link>
            <span className="hm-meta">
              <span className="type-body-s text-muted">{r.phase}</span>
              <Share cells={r} />
              <span className="hm-soft stagger-in">
                {r.software.length > 0 ? (
                  <>
                    <span className="sr-only">Software it uses: </span>
                    {r.software.map((s, k) => (
                      <Link key={s.id} href={s.href} aria-label={s.name} title={s.name} className="hm-soft-link" style={{ "--i": k } as CSSProperties}>
                        <Logo id={s.id} name={s.name} size="md" government={s.government} />
                      </Link>
                    ))}
                  </>
                ) : (
                  <span className="type-body-s text-faint">None ranked</span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const URGENCY: Record<ScenarioRow["urgency"], { word: string; tone: "danger" | "warn" | "muted" }> = {
  hours: { word: "Act within hours", tone: "danger" },
  days: { word: "Act within days", tone: "warn" },
  weeks: { word: "Act within weeks", tone: "muted" },
};

export function ScenarioTable({ rows, all }: { rows: ScenarioRow[]; all: number }) {
  return (
    <section id="scenarios" aria-labelledby="scenarios-title" className="mt-16 md:mt-24">
      <SectionHead
        id="scenarios-title"
        title="Scenarios"
        lede="When something goes wrong: a tenant stops paying, the lender retrades, the wire instructions change. What to do, in order, and how fast."
        all={{ href: "/situations", text: `See all ${all}` }}
      />
      <div aria-hidden="true" className="hm-cols hm-cols--sc type-label mt-6 text-faint">
        <span>Scenario</span>
        <span>How fast</span>
        <span>An agent can do</span>
      </div>
      <ol className="hm-rows">
        {rows.map((r, i) => (
          <li key={r.slug} className="hm-row hm-row--sc" data-reveal="" style={{ "--reveal-i": i % 4 } as CSSProperties}>
            <span aria-hidden="true" className="hm-n hm-n--dot" />
            <Link href={`/playbooks/${r.slug}`} className="hm-title type-title-s">
              {r.title}
            </Link>
            <span className="hm-meta">
              <span>
                <Tag tone={URGENCY[r.urgency].tone} dot={r.urgency === "hours"}>
                  {URGENCY[r.urgency].word}
                </Tag>
              </span>
              <Share cells={r} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
