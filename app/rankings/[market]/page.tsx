import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BarStyles,
  PublishLine,
  RankSchedule,
  ReviewStamp,
  ScoreChart,
  SortControl,
  VerdictLegend,
  getMarketSummary,
  storyKey,
} from "@/components/rankings";
import { Callout, Container, PageHead, TextLink } from "@/components/ui";
import { getRankings } from "@/lib/rankings/load";
import { GOLDEN_CELLS, GOLDEN_TO_PUBLISH } from "@/lib/rankings/state";

export const dynamicParams = false;

export function generateStaticParams() {
  return getRankings().markets.map((m) => ({ market: m.market.id }));
}

export async function generateMetadata({ params }: PageProps<"/rankings/[market]">): Promise<Metadata> {
  const { market } = await params;
  const m = getRankings().markets.find((x) => x.market.id === market);
  return m ? { title: `${m.market.name} rankings`, description: m.market.what } : {};
}

// One market: the head (what it covers, its publish and review state, what was judged), then,
// once the market publishes, its scores as a chart card of bars (ScoreChart: they fill and
// count up once, and show each vendor's group scores on hover or focus), then the schedule:
// the key to its task columns directly above the full table, which SortControl puts in score
// or name order (the server's order is the rank order, so without scripts it is unchanged).
export default async function MarketPage({ params }: PageProps<"/rankings/[market]">) {
  const { market } = await params;
  const summary = getMarketSummary(market);
  if (!summary) notFound();
  const { view, review, listed, judged, dropped, judgedOn, evidenceItems } = summary;
  const show = view.published;
  const rows = show ? listed : [...listed].sort((a, b) => a.vendor.name.localeCompare(b.vendor.name));
  const groups = storyKey(view.stories);
  const count = (g: string) => groups.find((x) => x.group === g)?.stories.length ?? 0;
  const c = view.calibration;
  const anyUntested = rows.some((r) => r.status !== "judged");
  const sortId = `rk-rows-${market}`;

  return (
    <Container>
      <BarStyles />
      <PageHead
        crumbs={[{ href: "/rankings", label: "Software" }, { label: view.market.name }]}
        title={view.market.name}
        lede={view.market.what}
        actions={
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ReviewStamp review={review} />
            {/* The same words as the index. Unpublished, the note under the head says it in full. */}
            {show && <PublishLine published matches={c.matches} cells={c.cells} />}
          </div>
        }
        facts={[
          {
            label: "Vendors judged",
            value: (
              <span className="tabular-nums">
                {judged.length}
                <span className="text-muted"> of {listed.length}</span>
              </span>
            ),
          },
          {
            label: "Tasks",
            value: (
              <span className="tabular-nums">
                {view.stories.length}
                <span className="text-muted">
                  {" "}
                  · {count("access")} agent access, {count("openness")} openness, {count("task")} market
                </span>
              </span>
            ),
          },
          { label: "Evidence items", value: <span className="tabular-nums">{evidenceItems}</span> },
          { label: "Last judged", mono: true, value: judgedOn },
        ]}
      />

      {!show && (
        <Callout icon="info" className="type-body measure mt-8">
          Not published yet. Scores appear when the judge agrees with at least {GOLDEN_TO_PUBLISH} of {GOLDEN_CELLS} cells
          checked by hand{c.cells > 0 ? `; so far it matches ${c.matches} of ${c.cells}` : ""}.
        </Callout>
      )}

      {show && (
        <section aria-labelledby="ranked-title" className="mt-12 md:mt-16">
          <h2 id="ranked-title" className="type-title-l m-0 text-text">
            Ranked by score
          </h2>
          <ScoreChart summary={summary} className="mt-6" />
        </section>
      )}

      <section aria-labelledby="schedule-title" className="mt-12 md:mt-16">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <h2 id="schedule-title" className="type-title-l m-0 text-text">
            {show ? `All ${rows.length} vendors, task by task` : "In name order until the market publishes"}
          </h2>
          {show && <SortControl target={sortId} className="print:hidden" />}
        </div>
        {show && (
          <VerdictLegend
            className="mb-6"
            kinds={anyUntested ? ["full", "partial", "disputed", "none", "na", "untested"] : ["full", "partial", "disputed", "none", "na"]}
          />
        )}
        <RankSchedule marketId={market} marketName={view.market.name} stories={view.stories} rows={rows} published={show} sortId={sortId} />
        <p className="type-body-s measure m-0 mt-6 text-muted">
          An AI judge reads only the stored public evidence and cites it in every verdict; the score is arithmetic on the
          verdicts. <TextLink href="/rankings/methodology">How the scores work</TextLink>
        </p>
      </section>

      {dropped.length > 0 && (
        <section aria-labelledby="dropped-title" className="mt-16 md:mt-24">
          <h2 id="dropped-title" className="type-title-l m-0 text-text">
            Dropped on the evidence
          </h2>
          <ul className="type-body measure m-0 mt-6 list-none border-t border-line p-0 text-muted">
            {dropped.map((r) => (
              <li key={r.vendor.id} className="border-b border-line py-4">
                <span className="text-text">{r.vendor.name}</span>: {r.vendor.dropReason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
