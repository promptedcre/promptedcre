import Link from "next/link";
import type { RuleRow } from "./data";

const KIND_WORD = { process: null, situation: "scenario", audit: "audit" } as const;

// "Cited by 4 steps": how many written steps rest on a rule, said plainly when none does yet.
export const citedBy = (steps: number) => (steps > 0 ? `Cited by ${steps} ${steps === 1 ? "step" : "steps"}` : "Cited by no step yet");

// RuleCitations: the records that cite a rule, each with its own count and linked to the rule on
// that record's page, then any calculator that applies it. Outlined records never cite (they have
// no steps). Quiet links (.lb-q, .lb-xl in LibraryStyles, which the page renders once).
export function RuleCitations({ row }: { row: RuleRow }) {
  const { rule, records, calculators } = row;
  if (records.length === 0 && calculators.length === 0) return <p className="m-0 text-faint">{citedBy(0)}</p>;
  return (
    <ul className="lb-xl" aria-label="Cited by">
      {records.map(({ record, steps: n }) => (
        <li key={record.slug}>
          <Link href={`/playbooks/${record.slug}#rule-${rule.id}`} className="lb-q">
            {record.title}
          </Link>
          <span className="ml-2 whitespace-nowrap tabular-nums text-faint">
            {KIND_WORD[record.kind] && `${KIND_WORD[record.kind]}, `}
            {n} {record.kind === "audit" ? (n === 1 ? "check" : "checks") : n === 1 ? "step" : "steps"}
          </span>
        </li>
      ))}
      {calculators.map((k) => (
        <li key={k.id}>
          {k.live ? (
            <Link href={`/calculators/${k.id}`} className="lb-q">
              {k.name}
            </Link>
          ) : (
            <span>{k.name}</span>
          )}
          <span className="ml-2 text-faint">calculator</span>
        </li>
      ))}
    </ul>
  );
}
