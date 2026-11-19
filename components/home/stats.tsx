import Link from "next/link";
import type { CSSProperties } from "react";
import { CountUp } from "@/components/ui";
import type { SiteFacts } from "@/lib/compute/site-facts";

// Four headline numbers under the prompt box (D224, the owner's stat cards), each computed:
// the catalog's written records, the headline agent share (the one share printed outside a
// record's page, linked to the ledger that explains it), the rule cards and the software
// judged. Each figure counts up once when it is first seen (CountUp); the server's HTML is
// the figure itself.

export type StatsData = {
  facts: SiteFacts;
  software: { judged: number; listed: number; markets: number };
};

export function HomeStats({ data }: { data: StatsData }) {
  const { facts, software } = data;
  const w = facts.counts.writtenByKind;
  const share = facts.share.syndication;
  const cards = [
    {
      key: "written",
      value: facts.counts.written,
      label: "Written in full",
      note: `${w.process} playbooks, ${w.situation} scenarios, ${w.audit} audit${w.audit === 1 ? "" : "s"}`,
      href: "/playbooks",
    },
    {
      key: "share",
      value: share.pct ?? 0,
      suffix: "%",
      label: "An agent can do",
      note: `of the ${share.total} written steps`,
      href: "/playbooks#where-it-stands",
    },
    { key: "rules", value: facts.counts.rules, label: "Rule cards", note: `${facts.coverage.label}, each with its law and date`, href: "/rules" },
    {
      key: "software",
      value: software.judged,
      label: "Software judged",
      note: `of ${software.listed} products in ${software.markets} markets; no vendor pays`,
      href: "/rankings",
    },
  ];
  return (
    <section aria-labelledby="stats-title" className="mt-10 md:mt-12">
      <h2 id="stats-title" className="sr-only">
        The library in numbers
      </h2>
      <ul className="hm-stats">
        {cards.map((c, i) => (
          <li key={c.key} data-reveal="" style={{ "--reveal-i": i } as CSSProperties}>
            <Link href={c.href} className="hm-stat">
              <span className="type-label text-muted">{c.label}</span>
              <CountUp value={c.value} suffix={c.suffix} className="hm-stat-v type-title-l" />
              <span className="type-body-s text-muted">{c.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
