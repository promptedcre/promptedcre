import type { ReactNode } from "react";
import { Disclosure, TextLink } from "@/components/ui";
import type { SiteFacts } from "@/lib/compute/site-facts";
import { costAnswer } from "@/lib/plans";
import { catalogSentence, listWords, type HostChip } from "./data";

// The questions at the foot of the home page (D218 kept them). Every figure is computed
// (siteFacts, HOSTS); the hosts are said in lib/hosts.ts's own three words. What it costs is
// lib/plans.ts's answer (decision 129): what is live is free, and the plans are coming.

// The review of the written records, said as what it is: "12 practitioner-reviewed;
// 32 AI-drafted, sources checked 2026-11-14". A level no record has reached is left out.
function reviewLine(facts: SiteFacts): string {
  const { review, checked } = facts.trust;
  const drafted = checked["ai-drafted"].last;
  return [
    review["attorney-reviewed"] > 0 ? `${review["attorney-reviewed"]} attorney-reviewed` : null,
    review["practitioner-reviewed"] > 0 ? `${review["practitioner-reviewed"]} practitioner-reviewed` : null,
    review["ai-drafted"] > 0 ? `${review["ai-drafted"]} AI-drafted${drafted ? `, sources checked ${drafted}` : ""}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

// "Claude Code is tested. Claude, ChatGPT and Codex are documented ... Grok and Muse are
// listed and not checked yet."
export function hostAnswer(hosts: readonly HostChip[]): string {
  const names = (status: HostChip["status"]) => hosts.filter((h) => h.status === status).map((h) => h.name);
  const is = (n: string[]) => (n.length === 1 ? "is" : "are");
  const tested = names("tested");
  const documented = names("documented");
  const unchecked = names("unchecked");
  return [
    tested.length > 0 ? `${listWords(tested)} ${is(tested)} tested.` : "",
    documented.length > 0 ? `${listWords(documented)} ${is(documented)} documented from each maker's own instructions and not run yet.` : "",
    unchecked.length > 0 ? `${listWords(unchecked)} ${is(unchecked)} listed and not checked yet.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Questions({ facts, hosts }: { facts: SiteFacts; hosts: readonly HostChip[] }) {
  const cost = costAnswer();
  const qa: Array<[string, ReactNode]> = [
    [
      "What does it cost?",
      <>
        {cost.text}{" "}
        <TextLink href="/plans" tone="accent">
          {cost.link}
        </TextLink>
        .
      </>,
    ],
    ["Is this legal advice?", "No. Every rule links to its source, and a step that needs an attorney or a CPA says so."],
    ["What does it cover?", `${facts.coverage.label}. ${catalogSentence(facts)}`],
    ["Which agents does it work with?", hostAnswer(hosts)],
    [
      "What can the agent see?",
      "The public library. The hosted connector is read-only and takes no firm file. Your firm's records stay in a folder on your own machine.",
    ],
    ["Who wrote the playbooks?", `AI agents drafted them from primary sources. Of the ${facts.counts.written} written in full: ${reviewLine(facts)}.`],
  ];
  return (
    <section id="questions" aria-labelledby="questions-title" className="mt-16 grid gap-x-16 gap-y-6 md:mt-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:items-start">
      <h2 id="questions-title" className="type-title-l m-0 text-text">
        Questions, answered plainly.
      </h2>
      <div className="min-w-0 border-t border-line-strong">
        {qa.map(([q, a]) => (
          <Disclosure
            key={q}
            summary={q}
            chevron="end"
            className="border-b border-line"
            summaryClassName="type-title-s py-2"
            bodyClassName="type-body measure pb-6 text-muted"
          >
            {a}
          </Disclosure>
        ))}
      </div>
    </section>
  );
}
