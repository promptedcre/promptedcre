import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Tag } from "@/components/chips";
import {
  COVERAGE_LABEL,
  CoverageRing,
  MARK_WORD,
  ScoreScale,
  SiteLink,
  TIER_LABEL,
  VendorStyles,
  VerdictLegend,
  VerdictMark,
  VerdictSummary,
  VerdictTally,
  getMarketSummary,
  storyKey,
} from "@/components/rankings";
import { ButtonLink, Container, CountUp, Disclosure, Icon, PageHead, Sheet, SheetPart, TitleBlock, TitleCell, cx } from "@/components/ui";
import { packHash } from "@/lib/rankings/hash";
import { getRankings } from "@/lib/rankings/load";
import { COVERAGE_KEYS } from "@/lib/schemas/rankings";
import { site } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getRankings().markets.flatMap((m) => m.vendors.map((v) => ({ market: m.market.id, vendor: v.id })));
}

export async function generateMetadata({ params }: PageProps<"/rankings/[market]/[vendor]">): Promise<Metadata> {
  const { market, vendor } = await params;
  const m = getRankings().markets.find((x) => x.market.id === market);
  const v = m?.vendors.find((x) => x.id === vendor);
  return v && m ? { title: `${v.name} · ${m.market.name}`, description: `Agent-readiness verdicts for ${v.name}, with the evidence behind each.` } : {};
}

// A URL as a reader scans it: no scheme, a break allowed after each slash.
function UrlText({ url }: { url: string }) {
  const parts = url.replace(/^https?:\/\//, "").split("/");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && "/"}
          {i > 0 && <wbr />}
          {p}
        </span>
      ))}
    </>
  );
}

// A version with its date, "stories-v1 (2026-11-12)": it may break before the date, never
// inside it.
function VersionText({ value }: { value: string }) {
  const m = value.match(/^(.*?)\s*(\([^)]*\))$/);
  if (!m) return <>{value}</>;
  return (
    <>
      {m[1]} <span className="whitespace-nowrap">{m[2]}</span>
    </>
  );
}

// A link that leaves the site: the drawn external mark after it, and words for a screen reader.
// A word joiner keeps the mark on the line of the address's last part, so a long address that
// wraps never leaves the mark alone on a line.
function OutLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} rel="noreferrer" className={cx("link link--muted inline break-words", className)}>
      {children}
      <span className="whitespace-nowrap">
        {"⁠"}
        <Icon name="external" className="ml-1 inline-block align-[-0.125em] text-faint" />
      </span>
      <span className="sr-only"> (another site)</span>
    </a>
  );
}

// One vendor in one market. The head: its name, what it is, and its own site as a pill. Then the
// verdict's sheet: the score (it counts up once and its bar fills, D230), the verdicts at a
// glance, then each group of tasks with the judge's reason and the evidence ids as small wells
// that open on the excerpts quoted, each in a well. Under the sheet, on the ground, rounded
// boxes with the soft shadow: every evidence item in one fold, the four coverage pages as four
// cards with a ring for where each stands, and the contest box. Each part comes into focus once
// as it reaches the screen; scripts off, less motion and paper get the finished page.
export default async function VendorPage({ params }: PageProps<"/rankings/[market]/[vendor]">) {
  const { market, vendor } = await params;
  const summary = getMarketSummary(market);
  if (!summary) notFound();
  const { view, judged: judgedRows } = summary;
  const row = summary.listed.find((r) => r.vendor.id === vendor) ?? summary.dropped.map((r) => ({ ...r, rank: null })).find((r) => r.vendor.id === vendor);
  if (!row) notFound();
  const { vendor: v, pack, verdicts, result } = row;
  const isJudged = row.status === "judged";
  const show = view.published && isJudged && result.score !== null;
  const groups = storyKey(view.stories);
  const hash = pack ? packHash(pack) : null;
  const { storiesVersion } = getRankings();
  const best = summary.ranked[0]?.result.score ?? null;
  const items = new Map((pack?.items ?? []).map((i) => [i.id, i]));

  // Which tasks cite each evidence item, so an excerpt points back to the verdicts that rest on it.
  const citedBy = new Map<string, string[]>();
  if (verdicts && isJudged) {
    for (const g of groups) {
      for (const { story, code } of g.stories) {
        const x = verdicts.verdicts.find((y) => y.story === story.id);
        for (const e of x?.evidence ?? []) citedBy.set(e, [...(citedBy.get(e) ?? []), code]);
      }
    }
  }

  const hashState = !hash
    ? { tone: "muted" as const, text: "no evidence collected yet" }
    : row.status === "stale"
      ? { tone: "danger" as const, text: "changed after judging" }
      : isJudged
        ? { tone: "default" as const, text: "matches the judged evidence" }
        : { tone: "muted" as const, text: "yes" };

  const stateWord = isJudged ? "Not published" : row.status === "dropped" ? "Dropped" : row.status === "stale" ? "Stale" : "Untested";

  return (
    <Container>
      <VendorStyles />
      <PageHead
        crumbs={[{ href: "/rankings", label: "Software" }, { href: `/rankings/${market}`, label: view.market.name }, { label: v.name }]}
        title={v.name}
        lede={v.what}
        actions={
          <>
            <SiteLink vendor={v} />
            {v.kind === "government" && <Tag>government</Tag>}
            {row.status === "dropped" && <Tag dashed>dropped</Tag>}
          </>
        }
      />

      {/* The whole verdict comes into focus at once (data-reveal): its frame never shows empty. Inside it
          the score's bar fills and the marks arrive in turn, and each group below comes into focus as it
          reaches the screen. */}
      <div data-reveal="" className="mt-8 md:mt-10">
        <Sheet
          as="article"
          label={`${v.name}: the verdict`}
          flush
          titleBlock={
            <TitleBlock label="What was judged, and when" cols={4}>
              <TitleCell label="Vendor">{v.name}</TitleCell>
              <TitleCell label="Market">{view.market.name}</TitleCell>
              <TitleCell label="Judged on" mono={Boolean(verdicts && isJudged)} tone={verdicts && isJudged ? "default" : "muted"}>
                {verdicts && isJudged ? verdicts.judged : "Not judged"}
              </TitleCell>
              <TitleCell label="Evidence collected" mono={Boolean(pack?.collected)} tone={pack?.collected ? "default" : "muted"}>
                {pack?.collected ?? "Not yet"}
              </TitleCell>
              <TitleCell label="Evidence sealed" tone={hashState.tone}>
                {hashState.text.charAt(0).toUpperCase() + hashState.text.slice(1)}
              </TitleCell>
              <TitleCell label="Evidence hash" mono={Boolean(hash)} tone={hash ? "default" : "muted"}>
                {hash ? hash.slice(0, 16) : "None"}
              </TitleCell>
              {verdicts && isJudged && (
                <TitleCell label="Judge" mono>
                  {verdicts.judgeModel} · {verdicts.promptVersion}
                </TitleCell>
              )}
              <TitleCell label="Task list" mono>
                <VersionText value={storiesVersion} />
              </TitleCell>
            </TitleBlock>
          }
        >
          <SheetPart className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
            <div className="min-w-0">
              {show && result.score !== null ? (
                <>
                  <p className="m-0 flex flex-wrap items-end gap-x-5 gap-y-2">
                    <span className="type-figure text-text">
                      <CountUp value={result.score} />
                      <span className="sr-only"> of 100</span>
                    </span>
                    <span className="mb-1 flex flex-col gap-1">
                      <span aria-hidden="true" className="type-body text-muted">
                        of 100
                      </span>
                      <span className="type-body-s text-muted">
                        Ranked <span className="tabular-nums text-text">{row.rank}</span> of{" "}
                        <span className="tabular-nums">{judgedRows.length}</span> judged in this market
                      </span>
                    </span>
                  </p>
                  <ScoreScale score={result.score} best={best} className="mt-8 max-w-xl" />
                  {verdicts && <VerdictTally row={row} className="mt-8" />}
                </>
              ) : (
                <>
                  <p className="type-title-l m-0 text-muted">{stateWord}</p>
                  <p className="type-body measure m-0 mt-3 text-muted">
                    {isJudged ? "The market is not published yet, so its scores are not shown." : `Not scored: ${row.reason}.`}
                  </p>
                  {!isJudged && row.status !== "dropped" && (
                    <p className="type-body-s m-0 mt-2 text-faint">Untested is not a low score. It means there is no verdict to show yet.</p>
                  )}
                </>
              )}
            </div>
            {verdicts && isJudged && <VerdictSummary row={row} stories={view.stories} />}
          </SheetPart>

          {verdicts &&
            isJudged &&
            groups.map((g, gi) => (
              <SheetPart key={g.group} as="section" reveal>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2 className="type-title-m m-0 text-text">{g.label}</h2>
                  {result.groups[g.group] !== null && (
                    <p className="type-body-s m-0 text-muted">
                      Group score <span className="type-title-s tabular-nums text-text">{result.groups[g.group]}</span>
                    </p>
                  )}
                </div>
                {gi === 0 && (
                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <p className="type-body-s m-0 text-faint">One verdict per task, with the judge&apos;s reason. Quality is how completely the evidence supports the verdict.</p>
                    <VerdictLegend kinds={["full", "partial", "disputed", "none", "na"]} />
                  </div>
                )}
                <ol className="m-0 mt-4 list-none border-t border-line p-0">
                  {g.stories.map(({ story, code }) => {
                    const cell = result.cells.find((c) => c.story.id === story.id);
                    if (!cell) return null;
                    const x = cell.verdict;
                    const cited = x.evidence.map((e) => ({ id: e, item: items.get(e) }));
                    return (
                      <li
                        key={story.id}
                        id={`story-${story.id}`}
                        className="grid scroll-mt-24 gap-x-10 gap-y-3 border-b border-line py-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
                      >
                        <div className="min-w-0">
                          <h3 className="type-title-s m-0 text-text">
                            <span className="type-data mr-2 text-faint">
                              <span className="sr-only">Task </span>
                              {code}
                            </span>
                            {story.title}
                          </h3>
                          <p className="type-body-s m-0 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
                            <span className="inline-flex items-center gap-2 text-text">
                              <VerdictMark v={x.verdict} label="" />
                              {MARK_WORD[x.verdict]}
                            </span>
                            {x.verdict !== "na" && (
                              <span>
                                Quality <span className="tabular-nums text-text">{x.quality}</span>/10
                              </span>
                            )}
                            <span>
                              Weight <span className="tabular-nums text-text">×{story.weight}</span>
                            </span>
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="type-body measure m-0 text-text">{x.rationale}</p>
                          {x.missing && (
                            <p className="type-body-s measure m-0 mt-2 text-muted">
                              <span className="text-text">Not shown: </span>
                              {x.missing}
                            </p>
                          )}
                          {cited.length > 0 && (
                            <Disclosure
                              size="sm"
                              className="mt-2"
                              summary={
                                <span className="type-body-s inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
                                  Evidence
                                  <span className="vd-ids">
                                    {x.evidence.map((e) => (
                                      <span key={e} className="vd-id type-data">
                                        {e}
                                      </span>
                                    ))}
                                  </span>
                                </span>
                              }
                            >
                              <ul className="m-0 grid list-none gap-4 p-0 pb-2 pt-2">
                                {cited.map(({ id, item }) =>
                                  item ? (
                                    <li key={id} className="measure">
                                      <blockquote className="vd-q type-body text-text">“{item.excerpt}”</blockquote>
                                      <p className="type-body-s m-0 mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-faint">
                                        <span className="type-data text-muted">{id}</span>
                                        <span>{TIER_LABEL[item.tier]}</span>
                                        <time dateTime={item.fetched} className="type-data">
                                          {item.fetched}
                                        </time>
                                        <OutLink href={item.url} className="type-data min-w-0">
                                          <UrlText url={item.url} />
                                        </OutLink>
                                      </p>
                                    </li>
                                  ) : (
                                    <li key={id} className="type-body-s text-muted">
                                      <span className="type-data">{id}</span> is not in the stored evidence.
                                    </li>
                                  ),
                                )}
                              </ul>
                            </Disclosure>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </SheetPart>
            ))}
        </Sheet>
      </div>

      {pack && (
        <section aria-labelledby="evidence" className="mt-16 md:mt-24">
          <h2 id="evidence" className="type-title-l m-0 text-text">
            What the judge read
          </h2>
          <p className="type-body-s m-0 mt-2 text-faint">Verbatim from each page on the date shown · probe items were checked by script</p>
          {pack.items.length > 0 ? (
            <div data-reveal="" className="mt-6">
              <Disclosure
                id="evidence-items"
                className="vd-card"
                summaryClassName="px-4 md:px-6"
                bodyClassName="px-4 pb-2 md:px-6"
                summary={
                  <span className="type-body text-text">
                    All <span className="tabular-nums">{pack.items.length}</span> evidence items
                  </span>
                }
              >
                <ol className="m-0 list-none p-0">
                  {pack.items.map((i) => {
                    const by = citedBy.get(i.id) ?? [];
                    return (
                      <li
                        key={i.id}
                        id={`ev-${i.id}`}
                        className="grid scroll-mt-24 gap-x-10 gap-y-2 border-t border-line py-4 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
                      >
                        <p className="type-body-s m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-faint md:flex-col md:gap-y-1">
                          <span className="type-data text-text">{i.id}</span>
                          <span>{TIER_LABEL[i.tier]}</span>
                          <time dateTime={i.fetched} className="type-data">
                            {i.fetched}
                          </time>
                        </p>
                        <div className="min-w-0">
                          <blockquote className="type-body measure m-0 text-text">“{i.excerpt}”</blockquote>
                          <p className="type-data m-0 mt-2">
                            <OutLink href={i.url}>
                              <UrlText url={i.url} />
                            </OutLink>
                          </p>
                          {i.note && <p className="type-body-s m-0 mt-1 text-faint">{i.note}</p>}
                          {by.length > 0 && (
                            <p className="type-body-s m-0 mt-1 text-faint">
                              Cited by {by.length === 1 ? "task" : "tasks"} <span className="tabular-nums text-muted">{by.join(", ")}</span>
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Disclosure>
            </div>
          ) : (
            <p className="type-body-s m-0 mt-6 rounded-box border border-dashed border-line-bold px-4 py-4 text-muted md:px-6">No evidence items stored yet.</p>
          )}
        </section>
      )}

      {pack && (
        <section aria-labelledby="coverage" className="mt-16 md:mt-24">
          <h2 id="coverage" className="type-title-l m-0 text-text">
            The four pages every vendor needs
          </h2>
          <p className="type-body measure m-0 mt-3 text-muted">
            A vendor is judged only when all four are recorded: found, or checked and absent.{" "}
            <span className="whitespace-nowrap text-text">
              <span className="tabular-nums">{COVERAGE_KEYS.filter((k) => pack.coverage[k]).length}</span> of {COVERAGE_KEYS.length} recorded.
            </span>
          </p>
          <ul className="m-0 mt-6 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {COVERAGE_KEYS.map((k, i) => {
              const c = pack.coverage[k];
              return (
                <li key={k} data-reveal="" style={{ "--reveal-i": i } as CSSProperties} className="vd-card min-w-0 p-4">
                  <p className="type-label m-0 text-muted">{COVERAGE_LABEL[k]}</p>
                  {c ? (
                    <>
                      <p className="type-body-s m-0 mt-3 flex items-center gap-2 text-text">
                        <CoverageRing state={c.found ? "found" : "none"} />
                        {c.found ? "Found" : "Checked, none"}
                      </p>
                      <p className="type-data m-0 mt-3">
                        <OutLink href={c.url}>
                          <UrlText url={c.url} />
                        </OutLink>
                      </p>
                      {c.note && <p className="type-body-s m-0 mt-1 text-faint">{c.note}</p>}
                    </>
                  ) : (
                    <p className="m-0 mt-3 flex items-center gap-2">
                      <CoverageRing state="gap" />
                      <Tag tone="warn" dashed>
                        not recorded
                      </Tag>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {site.repoUrl && (
        <section data-reveal="" className="vd-card mt-16 p-4 md:mt-24 md:p-6" aria-labelledby="contest-title">
          <div className="grid gap-x-10 gap-y-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <h2 id="contest-title" className="type-title-m m-0 text-text">
                Think a verdict is wrong?
              </h2>
              <p className="type-body measure m-0 mt-2 text-muted">
                Contest it with a link to the public page that shows otherwise. No vendor can pay for a listing, a score or a
                review.
              </p>
            </div>
            <ButtonLink href={`${site.repoUrl}/issues/new?template=contest-a-verdict.yml`} variant="secondary">
              Open a contest
            </ButtonLink>
          </div>
        </section>
      )}
    </Container>
  );
}
