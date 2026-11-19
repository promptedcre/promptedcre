import { Logo } from "@/components/ui";
import { RefLink } from "./ref-link";

// The software that does a step, as the step card draws it (components/step-list.tsx). Pure:
// the data comes from stepSoftwareFor (./software.ts), which reads content/step-software.json
// and the rankings files.

export type RankedVendor = { id: string; name: string; government: boolean; score: number | null };
/** The products that do one step, best score first, and the published market they are ranked in. */
export type MarketTop = { id: string; name: string; vendors: RankedVendor[] };

// SoftwareLine: the products that do this step (D218, the owner's "Map each step"), each its own
// icon (Logo, components/ui, at 20 px as the home page draws them) beside its name and the
// agent-ready score its market's ranking gives it, a figure out of 100. The market's name is
// the one link, to its ranking. Which products do a step is AI-drafted from each product's
// own description (content/step-software.json); the score is the ranking's. A government
// source is drawn with the one neutral glyph of ours, never a seal. Nothing is drawn when no
// product on the step's list has a score. Screen only: on paper the step reads without it.
export function SoftwareLine({ market }: { market: MarketTop }) {
  if (market.vendors.length === 0) return null;
  return (
    <div className="st-sw print:hidden">
      <p className="st-sw-k type-label m-0">
        Software for this step, scored in <RefLink href={`/rankings/${market.id}`}>{market.name}</RefLink>
      </p>
      <ol className="st-vs" aria-label={`${market.vendors.length} products for this step, by agent-ready score out of 100`}>
        {market.vendors.map((v) => (
          <li key={v.id} className="st-v">
            <Logo id={v.id} name={v.name} government={v.government} />
            <span className="type-body-s text-text">{v.name}</span>
            {v.score === null ? (
              // Listed in the ranking, not judged yet (D225): no score is shown, and none is implied.
              <span className="type-body-s text-faint">not judged yet</span>
            ) : (
              <span className="type-data text-muted">
                {v.score}
                <span className="sr-only"> of 100</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
