import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "@/components/chips";
import { stepsUsingAnyCalculator } from "@/components/calc/catalog";
import { count } from "@/components/calc/format";
import { groupCalculators } from "@/components/calc/groups";
import { calcMeta, checkedSentence, type CalcMeta } from "@/components/calc/meta";
import { calculatorPreview } from "@/components/calc/previews";
import { Container, Icon, PageHead, cx } from "@/components/ui";
import { getCorpus } from "@/lib/content/load";

export function generateMetadata(): Metadata {
  const live = getCorpus().calculators.filter((c) => c.status === "live");
  const first = live[0]?.name.toLowerCase();
  const last = live.at(-1)?.name.toLowerCase();
  const span = first && last && live.length > 1 ? `: ${count(live.length, "calculator")}, from the ${first} to the ${last}` : "";
  return {
    title: "Calculators",
    description: `Tested deal math an AI agent calls instead of guessing${span}. Each shows every formula it ran.`,
  };
}

// "N in Excel · N against published dates · N by independent calculation": each kind of check with its count (counted below, never typed), in this order.
const CHECK_WORDS: Array<[CalcMeta["checkedAgainst"], string]> = [
  ["excel", "in Excel"],
  ["published", "against published dates"],
  ["independent", "by independent calculation"],
  ["none", "not yet"],
];

// One row's columns from 1024 px: the calculator and its question, its worked example, how that was checked, the way in.
const COLS = "lg:grid-cols-[minmax(0,5fr)_minmax(0,5fr)_minmax(0,3fr)_1rem]";

export default function CalculatorsPage() {
  const corpus = getCorpus();
  const live = corpus.calculators.filter((c) => c.status === "live");
  const planned = corpus.calculators.filter((c) => c.status !== "live");
  const rows = live.map((c) => ({ id: c.id, calc: c, meta: calcMeta(c.id), example: calculatorPreview(c.id)?.headline ?? null }));
  const groups = groupCalculators(rows);
  const checks = CHECK_WORDS.map(([k, words]) => ({ n: rows.filter((r) => r.meta?.checkedAgainst === k).length, words }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${x.words}`)
    .join(" · ");
  const steps = stepsUsingAnyCalculator(corpus);

  return (
    <Container>
      <PageHead
        title="Calculators"
        lede={
          <>
            Tested deal math your AI agent calls instead of guessing. Each one returns its answer with every formula it ran,
            so you can check the work line by line.
          </>
        }
        facts={[
          { label: live.length === 1 ? "calculator" : "calculators", value: live.length, lead: true },
          { label: "Worked examples checked", value: checks || null },
          { label: "Used by", value: steps > 0 ? count(steps, "playbook step") : null },
          { label: "Runs", value: "In your browser" },
        ]}
      >
        {groups.length > 1 && (
          <nav aria-label="Groups of calculators" className="type-body-s mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {groups.map(({ group }) => (
              <a key={group.id} href={`#${group.id}`} className="link link--muted inline-flex min-h-11 items-center md:min-h-0">
                {group.name}
              </a>
            ))}
          </nav>
        )}
      </PageHead>

      {/* Each group comes into focus once as it reaches the screen (data-reveal, decision 83). */}
      {groups.map(({ group, items }, n) => (
        <section key={group.id} id={group.id} aria-labelledby={`${group.id}-h`} className={n === 0 ? "mt-10 md:mt-12" : "mt-12 md:mt-16"} data-reveal="">
          <div className={cx("grid items-baseline gap-x-8 border-b border-line-strong pb-3", COLS)}>
            <h2 id={`${group.id}-h`} className="type-title-m m-0 text-text">
              {group.name}
              <span className="type-body-s ml-3 whitespace-nowrap text-faint">{count(items.length, "calculator")}</span>
            </h2>
            <span aria-hidden="true" className="type-label hidden text-faint lg:block">
              Worked example
            </span>
            <span aria-hidden="true" className="type-label hidden text-faint lg:block">
              How it was checked
            </span>
          </div>
          <ul className="m-0 list-none p-0">
            {items.map(({ calc, meta, example }) => (
              <li key={calc.id} className={cx("group relative grid gap-x-8 gap-y-2 border-b border-line py-4", COLS)}>
                <div className="min-w-0">
                  <h3 className="type-title-s m-0">
                    <Link
                      href={`/calculators/${calc.id}`}
                      className="text-text underline decoration-transparent transition-colors after:absolute after:inset-0 group-hover:decoration-accent"
                    >
                      {calc.name}
                    </Link>
                  </h3>
                  <p className="type-body-s m-0 mt-1 text-muted">{meta?.purpose ?? calc.what}</p>
                </div>
                {example ? (
                  <p className="type-body-s m-0 min-w-0 text-text">
                    <span className="type-note block text-faint lg:sr-only">Worked example</span>
                    {example}
                  </p>
                ) : (
                  <span />
                )}
                <p className="type-body-s m-0 min-w-0 text-muted">{meta ? checkedSentence(meta) : null}</p>
                <Icon name="arrow-right" className="hidden self-center text-faint transition-colors group-hover:text-text lg:block" />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {planned.length > 0 && (
        <section aria-labelledby="planned-h" className="mt-12 md:mt-16" data-reveal="">
          <h2 id="planned-h" className="type-title-m m-0 border-b border-dashed border-line-bold pb-3 text-text">
            Outlined, not built yet
            <span className="type-body-s ml-3 whitespace-nowrap text-faint">{count(planned.length, "calculator")}</span>
          </h2>
          <ul className="m-0 list-none p-0">
            {planned.map((c) => (
              <li key={c.id} className="border-b border-dashed border-line py-4">
                <p className="m-0 flex flex-wrap items-center gap-3">
                  <span className="type-title-s text-muted">{c.name}</span>
                  <Tag dashed>Outlined</Tag>
                </p>
                <p className="type-body-s m-0 mt-1 text-faint">{c.what}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
