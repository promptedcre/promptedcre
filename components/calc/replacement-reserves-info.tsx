import { balanceUsd, perSfUsd, REPLACEMENT_RESERVES_EXAMPLE, runReplacementReserves, type ReplacementReservesInput, type ReplacementReservesResult } from "@/lib/calculators/replacement-reserves";
import { usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

// The per-area figures that were asked for: per square foot, per unit, or both.
function perBasis(perSf: number | null, perUnit: number | null): string {
  const parts = [perSf === null ? null : `${perSfUsd(perSf)}/SF`, perUnit === null ? null : `${usd(perUnit)}/unit`].filter((p): p is string => p !== null);
  return parts.join(", ");
}

export function replacementReservesHeadline(r: ReplacementReservesResult): string {
  const H = r.years.length;
  const level = usd(r.levelContribution, false);
  if (r.firstShortfall) {
    return `The reserve runs short in year ${r.firstShortfall.year}, ending it ${balanceUsd(-r.firstShortfall.balance, false)} below zero; a level ${level} a year would not run short over ${yrs(H)}.`;
  }
  if (r.levelContribution === 0) {
    return `The starting balance covers every replacement over ${yrs(H)}; the straight-line reserve is ${usd(r.straightLine, false)} a year.`;
  }
  return `The reserve never runs short over ${yrs(H)}; the least level contribution that holds is ${level} a year.`;
}

export function replacementReservesFigures(d: ReplacementReservesInput, r: ReplacementReservesResult): { lead: Headline; rest: Headline[] } {
  const H = d.horizonYears;
  const levelBasis = perBasis(r.levelPerSf, r.levelPerUnit);
  const slBasis = perBasis(r.straightLinePerSf, r.straightLinePerUnit);
  return {
    lead: {
      label: "Level contribution that never runs short",
      value: usd(r.levelContribution, false),
      sub: `a year${levelBasis ? `, ${levelBasis}` : ""}${r.levelBindingYear === null ? "; no contribution needed" : `; set by spending through year ${r.levelBindingYear}`}`,
    },
    rest: [
      {
        label: "First year short",
        value: r.firstShortfall ? `Year ${r.firstShortfall.year}` : "None",
        sub: r.firstShortfall ? `balance ${balanceUsd(r.firstShortfall.balance, false)} at ${usd(d.annualContribution, false)} a year` : `over ${yrs(H)} at ${usd(d.annualContribution, false)} a year`,
      },
      { label: "Added contribution needed", value: usd(r.contributionGap, false), sub: `a year over the ${usd(d.annualContribution, false)} given` },
      { label: "Straight-line reserve", value: usd(r.straightLine, false), sub: `a year${slBasis ? `, ${slBasis}` : ""}; cost ÷ life` },
      { label: "Replacement spending", value: usd(r.totalSpend, false), sub: `${r.replacements.length} ${r.replacements.length === 1 ? "replacement" : "replacements"} in ${yrs(H)}, with inflation` },
      { label: "Lowest year-end balance", value: balanceUsd(r.lowestBalance.balance, false), sub: `year ${r.lowestBalance.year}` },
      { label: "Balance at the end", value: balanceUsd(r.endingBalance, false), sub: `end of year ${H}` },
    ],
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function replacementReservesCells(d: ReplacementReservesInput, r: ReplacementReservesResult): Headline[] {
  const said = ["First year short", ...(!r.firstShortfall && r.levelContribution === 0 ? ["Straight-line reserve"] : [])];
  return replacementReservesFigures(d, r).rest.filter((h) => !said.includes(h.label));
}

export const replacementReservesInfo: ModuleInfo = {
  meta: {
    purpose:
      "Test a building's replacement reserve: the straight-line reserve per square foot or unit, the replacements due over a horizon with cost inflation, the first year the reserve runs short and the level contribution that never does.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's straight-line reserve by component, in total and per square foot, each replacement's year and inflated cost, the year-end balance for all ten years, the first shortfall, the level contribution with its year and per square foot, and the added contribution match a separate Python calculation (exact fractions, level contribution found by bisection, 2026-11-13).",
      "On five plans, the ending balance equals the starting balance plus contributions less spending, the straight-line reserves sum to the total, zero inflation prices every replacement at today's cost, and the level contribution never falls as inflation rises.",
      "At the level contribution no year runs short and the lowest balance is zero, while a cent a year less runs short; a balance below zero by less than half a cent is not a shortfall.",
      "A component past or at its life (replaced in year 1), none inside the horizon, a starting balance that covers everything, a one-year horizon and life, per unit and per square foot are pinned; a missing area and unit count, a negative cost, a life under one year, a fractional life and unknown fields are refused in plain words.",
    ],
    tests: ["__tests__/calc-replacement-reserves.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `${REPLACEMENT_RESERVES_EXAMPLE.components.length} components, ${(REPLACEMENT_RESERVES_EXAMPLE.areaSf ?? 0).toLocaleString("en-US")} SF, ${REPLACEMENT_RESERVES_EXAMPLE.horizonYears} years, contributing ${usd(REPLACEMENT_RESERVES_EXAMPLE.annualContribution, false)} a year`,
  headline: () => replacementReservesHeadline(runReplacementReserves(REPLACEMENT_RESERVES_EXAMPLE)),
  preview: () => {
    const f = replacementReservesFigures(REPLACEMENT_RESERVES_EXAMPLE, runReplacementReserves(REPLACEMENT_RESERVES_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest.slice(0, 4)} compact />;
  },
};
