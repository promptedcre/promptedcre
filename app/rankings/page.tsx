import type { Metadata } from "next";
import { BarStyles, MarketRow, getRankingsSummary } from "@/components/rankings";
import { Callout, Container, PageHead, TextLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Software",
  description: "Software that real estate operators use, scored on how well an AI agent can operate it, from public evidence.",
};

// The rankings index: a working list, not a set of panels. The head says what is judged and
// that no vendor pays; one sentence says what a score means before any score is read; then
// one ruled row per market with its top three as score bars and the way in.
export default function RankingsPage() {
  const { markets, totals, range } = getRankingsSummary();
  const { top } = range;

  return (
    <Container>
      <BarStyles />
      <PageHead
        title="Software"
        lede={
          <>
            Software that operators use, ranked on one question: how well can an AI agent operate it? Every verdict cites
            public evidence.
          </>
        }
        actions={
          <Callout icon="check" className="type-body">
            <span className="text-text">No vendor pays to be listed or ranked.</span>
          </Callout>
        }
        facts={[
          { label: "Markets", value: <span className="tabular-nums">{totals.markets}</span> },
          {
            label: "Vendors judged",
            value: (
              <span className="tabular-nums">
                {totals.judged}
                <span className="text-muted"> of {totals.listed} listed</span>
              </span>
            ),
          },
          { label: "Evidence items", value: <span className="tabular-nums">{totals.evidenceItems}</span> },
          { label: "Last judged", mono: true, value: totals.judgedOn },
        ]}
      />

      {/* What a score means, before any score is read: the scale, the highest today, and why the rest are low. */}
      <p className="type-body measure m-0 mt-8 text-muted md:mt-10">
        A score runs from 0 to 100; 100 would mean the public evidence shows an agent can do every task in full.
        {top && (
          <>
            {" "}
            The highest today is <span className="tabular-nums text-text">{top.score}</span> ({top.vendor}, {top.market.toLowerCase()}).
          </>
        )}
        {range.verdicts > 0 && (
          <>
            {" "}
            Most are low: in <span className="tabular-nums text-text">{range.none}</span> of{" "}
            <span className="tabular-nums text-text">{range.verdicts}</span> verdicts the judge found no public evidence that an agent can do the task.
          </>
        )}{" "}
        <TextLink href="/rankings/methodology#score" tone="accent">
          How the scores work
        </TextLink>
      </p>

      <ul aria-label="Markets, top three by score" className="m-0 mt-6 list-none border-t border-line-strong p-0 md:mt-8">
        {markets.map((m) => (
          <MarketRow key={m.view.market.id} summary={m} />
        ))}
      </ul>
    </Container>
  );
}
