import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Tag } from "@/components/chips";
import { Calculator } from "@/components/calc/calculator";
import { calcTool, calcUsage, usageLine } from "@/components/calc/catalog";
import { isCalcId } from "@/components/calc/examples";
import { count } from "@/components/calc/format";
import { calcMeta, checkedHow, CHECKED_NOTE } from "@/components/calc/meta";
import { ModuleCalculator } from "@/components/calc/module-calculator";
import { CalcStyles } from "@/components/calc/styles";
import { FoldStyles } from "@/components/playbook/fold";
import { RuleCard } from "@/components/rule-card";
import { Container, Disclosure, Icon, PageHead, RoleMark, SheetHeader } from "@/components/ui";
import { DEADLINES_EXAMPLE } from "@/lib/calculators/deadlines";
import { isModuleCalc } from "@/lib/calculators/modules";
import { getCorpus } from "@/lib/content/load";
import { calcDeadlines } from "@/lib/mcp/tools";
import type { PlaybookKind } from "@/lib/schemas/playbook";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCorpus()
    .calculators.filter((c) => c.status === "live")
    .map((c) => ({ slug: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/calculators/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const calc = getCorpus().calculators.find((c) => c.id === slug);
  return calc ? { title: calc.name, description: calc.what } : {};
}

const KIND_WORD: Record<PlaybookKind, string> = { process: "Playbook", situation: "Situation", audit: "Audit" };

// The page of one calculator, in the same order on all of them: the head; the tool (the
// answer, the inputs, the figures, then its schedules and the working, all drawn by the
// calculator itself); the rules the math rests on; how it counts and how it is checked;
// who calls it. What a developer wants (test files) comes last. The three sections after the
// tool come into focus once as they reach the screen (data-reveal, decision 83); the tool's
// own figures come alive in components/calc/live.tsx.
export default async function CalculatorPage({ params }: PageProps<"/calculators/[slug]">) {
  const { slug } = await params;
  const corpus = getCorpus();
  const calc = corpus.calculators.find((c) => c.id === slug && c.status === "live");
  if (!calc) notFound();
  const today = new Date();
  const rules = calc.rules.map((id) => corpus.rules.find((r) => r.id === id)).filter((r) => r !== undefined);
  const ruleTitles = Object.fromEntries(rules.map((r) => [r.id, r.title]));
  const meta = calcMeta(calc.id);
  const tool = calcTool(calc.name, calc.id);
  const usage = calcUsage(corpus, calc.id);
  const shared = isModuleCalc(calc.id);

  const head = <PageHead crumbs={[{ href: "/calculators", label: "Calculators" }, { label: calc.name }]} title={calc.name} lede={meta?.purpose ?? calc.what} />;

  const slots = { head, tool: tool?.name, toolId: shared ? calc.id : null, checked: meta ? checkedHow(meta) : null };

  return (
    <Container>
      <CalcStyles />
      {isCalcId(calc.id) &&
        (calc.id === "deadline-calendar" ? (
          <Calculator id={calc.id} {...slots} ruleTitles={ruleTitles} reviewNote={calcDeadlines(DEADLINES_EXAMPLE).note} />
        ) : (
          <Calculator id={calc.id} {...slots} />
        ))}
      {isModuleCalc(calc.id) && <ModuleCalculator id={calc.id} {...slots} />}

      {rules.length > 0 && (
        <section aria-labelledby="rules" className="mt-16 md:mt-24" data-reveal="">
          <FoldStyles />
          <SheetHeader id="rules" title={calc.id === "deadline-calendar" ? "The rules these dates come from." : "The rules this math rests on."} note={count(rules.length, "rule card")} />
          <ul className="m-0 list-none border-t border-line-strong p-0">
            {rules.map((r) => (
              <li key={r.id} className="min-w-0">
                <RuleCard rule={r} today={today} fold />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="method" aria-labelledby="method-h" className="mt-16 md:mt-24" data-reveal="">
        <SheetHeader id="method-h" title="How it counts, and how it is checked." note={meta ? CHECKED_NOTE[meta.checkedAgainst] : undefined} />
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="type-title-s m-0 mb-3 text-text">How it counts</h3>
            <ul className="type-body-s m-0 list-none border-t border-line-strong p-0 text-muted">
              {calc.method.map((m, i) => (
                <li key={i} className="border-b border-line py-3">
                  {m}
                </li>
              ))}
            </ul>
          </div>
          {meta && (
            <div className="min-w-0">
              <h3 className="type-title-s m-0 mb-3 text-text">What the checks pin</h3>
              <ul className="type-body-s m-0 list-none border-t border-line-strong p-0 text-muted">
                {meta.pinned.map((line, i) => (
                  <li key={i} className="flex gap-3 border-b border-line py-3">
                    <Icon name="check" className="mt-1 text-accent" />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="callers" className="mt-16 md:mt-24" data-reveal="">
        <SheetHeader id="callers" title={usage.steps > 0 ? `Called by ${usageLine(usage)}.` : "An AI agent calls it by name."} />
        {usage.playbooks.length > 0 && (
          <ul className="m-0 grid list-none gap-x-12 border-t border-line-strong p-0 lg:grid-cols-2">
            {usage.playbooks.map((p) => (
              <li key={p.slug} className="border-b border-line">
                <Disclosure
                  chevron="end"
                  summary={
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <span className="type-body min-w-0 flex-1 text-text">{p.title}</span>
                      {p.kind !== "process" && <Tag>{KIND_WORD[p.kind]}</Tag>}
                      <span className="type-body-s flex-none tabular-nums text-faint">{count(p.steps.length, "step")}</span>
                    </span>
                  }
                >
                  <ol className="m-0 list-none p-0 pb-3">
                    {p.steps.map((s) => (
                      <li key={s.id} className="flex items-baseline gap-3">
                        <span className="type-body-s w-14 flex-none tabular-nums text-faint">Step {s.n}</span>
                        <Link href={`/playbooks/${p.slug}#step-${s.id}`} className="link link--muted type-body-s min-w-0 flex-1 py-3">
                          {s.title}
                        </Link>
                        <RoleMark mode={s.mode} size="sm" />
                      </li>
                    ))}
                  </ol>
                </Disclosure>
              </li>
            ))}
          </ul>
        )}
        {tool && (
          <div className="mt-8">
            <h3 className="type-title-s m-0 text-text">For your agent</h3>
            <p className="type-body-s measure m-0 mt-2 text-muted">
              It calls <code className="type-data text-text">{tool.name}</code>{" "}
              {shared ? (
                <>
                  with id <code className="type-data text-text">{calc.id}</code> and
                </>
              ) : (
                "with"
              )}{" "}
              the same inputs as the form above, and gets back the result, its working and the rule cards it rests on.
              {meta && meta.tests.length > 0 && (
                <>
                  {" "}
                  The worked example is pinned in{" "}
                  {meta.tests.map((t, i) => (
                    <span key={t}>
                      {i > 0 && " and "}
                      {/* a path breaks after a slash, never in the middle of a name */}
                      <code className="type-data break-words">
                        {t.split("/").map((part, k, parts) => (
                          <Fragment key={k}>
                            {part}
                            {k < parts.length - 1 && (
                              <>
                                /<wbr />
                              </>
                            )}
                          </Fragment>
                        ))}
                      </code>
                    </span>
                  ))}
                  , which run it through the same function this page and the tool call.
                </>
              )}
            </p>
          </div>
        )}
      </section>
    </Container>
  );
}
