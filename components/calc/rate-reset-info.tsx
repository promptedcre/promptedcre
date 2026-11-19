import { RATE_RESET_EXAMPLE, rateText, runRateReset, type RateResetInput, type RateResetResult } from "@/lib/calculators/rate-reset";
import { multiple, pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

function paymentClause(r: RateResetResult): string {
  const peak = `${usd(r.maxPayment, false)} a month in year ${r.maxPaymentYear}`;
  if (r.maxShock === null) return `The payment peaks at ${peak}`;
  if (r.maxShock <= 0) return `The payment never rises above year 1's ${usd(r.firstPayment, false)} a month`;
  return `The payment peaks at ${peak}, ${pct(r.maxShock)} above year 1`;
}

function coverageClause(d: RateResetInput, r: RateResetResult): string {
  if (r.lowestDscr === null || r.lowestDscrYear === null) return "no year has debt service to cover";
  if (d.minDscr === null) return `coverage is lowest at ${multiple(r.lowestDscr)} in year ${r.lowestDscrYear}`;
  if (r.firstBreachYear !== null) return `coverage first falls below ${multiple(d.minDscr)} in year ${r.firstBreachYear}`;
  return `coverage stays at or above ${multiple(d.minDscr)}, lowest ${multiple(r.lowestDscr)} in year ${r.lowestDscrYear}`;
}

export function rateResetHeadline(d: RateResetInput, r: RateResetResult): string {
  return `${paymentClause(r)}; ${coverageClause(d, r)}.`;
}

export function rateResetFigures(d: RateResetInput, r: RateResetResult): { lead: Headline; rest: Headline[] } {
  const breach: Headline =
    d.minDscr === null
      ? { label: "Coverage minimum", value: "none set" }
      : { label: `First year below ${multiple(d.minDscr)}`, value: r.firstBreachYear === null ? "none" : `year ${r.firstBreachYear}` };
  return {
    lead: {
      label: "Highest payment, a month",
      value: usd(r.maxPayment, false),
      sub: r.maxShock === null ? `year ${r.maxPaymentYear}` : `year ${r.maxPaymentYear} · ${pct(r.maxShock)} against year 1`,
    },
    rest: [
      { label: "Year-1 payment", value: usd(r.firstPayment, false), sub: `a month at ${rateText(r.years[0]?.rate ?? 0)}` },
      {
        label: "Lowest coverage",
        value: r.lowestDscr === null ? "none" : multiple(r.lowestDscr),
        sub: r.lowestDscrYear === null ? "no debt service" : `year ${r.lowestDscrYear}`,
      },
      breach,
      { label: `Balance after year ${r.years.length}`, value: usd(r.endingBalance, false), sub: `of ${usd(d.loan, false)} borrowed` },
    ],
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function rateResetCells(d: RateResetInput, r: RateResetResult): Headline[] {
  const rest = rateResetFigures(d, r).rest;
  if (r.lowestDscr === null || r.lowestDscrYear === null) return rest;
  // with no minimum, or one that is never breached, the sentence gives the lowest coverage; with a breach it gives the year
  const said = d.minDscr === null ? ["Lowest coverage"] : r.firstBreachYear !== null ? [`First year below ${multiple(d.minDscr)}`] : ["Lowest coverage", `First year below ${multiple(d.minDscr)}`];
  return rest.filter((h) => !said.includes(h.label));
}

const ex = RATE_RESET_EXAMPLE;

export const rateResetInfo: ModuleInfo = {
  meta: {
    purpose: "Stress a floating-rate loan along an index path you choose: the payment re-amortized at each yearly reset, coverage against NOI each year, and the payment shock.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "For each of the worked example's five years, the rate, monthly payment, debt service, interest, principal, ending balance, NOI, coverage and change from year 1 match a separate Python calculation (decimal module, 2026-11-13) built on the closed-form payment and remaining balance, to a millionth of a dollar and coverage to nine decimals.",
      "On four test loans, each year's principal equals the fall in balance, the loan less the principal paid equals the ending balance, every rate stays inside the cap and floor, and coverage times debt service equals NOI.",
      "A flat path gives the level payment every year to the cent; interest only, a zero rate, a one-year path and a path longer than the amortization (paid off, then no payment and no coverage) are pinned.",
      "An empty path, a floor above the cap and a rate below zero with no floor are refused with a plain message.",
    ],
    tests: ["__tests__/calc-rate-reset.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `${usd(ex.loan, false)}, ${ex.amortYears}-year amortization, the index plus ${rateText(ex.spread)} inside a ${rateText(ex.rateFloor ?? 0)} floor and ${rateText(ex.rateCap ?? 0)} cap, a ${ex.indexPath.length}-year path`,
  headline: () => rateResetHeadline(ex, runRateReset(ex)),
  preview: () => {
    const f = rateResetFigures(ex, runRateReset(ex));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
