import { basisPoints, CAP_RATE_EXAMPLE, runCapRate, type CapRateInput, type CapRateResult } from "@/lib/calculators/cap-rate";
import { num, pct } from "@/lib/calculators/trace";
import { count } from "./format";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

const NUMBER_WORD = ["No", "One", "Two", "Three"];

export function capRateHeadline(r: CapRateResult): string {
  if (r.methods.length === 1) {
    const only = r.methods[0];
    if (only?.key === "extraction") return `The sales give a ${pct(only.rate)} cap rate, their mean.`;
    if (only?.key === "band") return `The band of investment gives a ${pct(only.rate)} cap rate.`;
    return `The lender's formula gives a ${pct(only?.rate ?? Number.NaN)} cap rate.`;
  }
  return `${NUMBER_WORD[r.methods.length] ?? r.methods.length} methods put the cap rate between ${pct(r.low.rate)} and ${pct(r.high.rate)}.`;
}

// The range as the lead figure, then one cell per method (run or not) and the loan constant.
export function capRateFigures(d: CapRateInput, r: CapRateResult): { lead: Headline; rest: Headline[] } {
  const noLoan = r.loanConstant === null;
  const e = r.extraction;
  return {
    lead: {
      label: r.methods.length === 1 ? "Cap rate" : "Range of the methods",
      value: r.methods.length === 1 ? pct(r.low.rate) : `${pct(r.low.rate)} to ${pct(r.high.rate)}`,
      sub: r.methods.length === 1 ? "one method ran" : `${basisPoints(r.spread)} from low to high · ${count(r.methods.length, "method")}`,
    },
    rest: [
      e
        ? { label: "Comparable sales", value: pct(e.mean), sub: `mean of ${count(e.count, "sale")}; price-weighted ${pct(e.weighted)}` }
        : { label: "Comparable sales", value: "not run", sub: "no sales given" },
      r.band
        ? { label: "Band of investment", value: pct(r.band.rate), sub: `${pct(d.ltv ?? 0, 1)} debt, ${pct(1 - (d.ltv ?? 0), 1)} equity` }
        : { label: "Band of investment", value: "not run", sub: noLoan ? "no loan given" : "no equity dividend rate" },
      r.lender !== null
        ? { label: "Lender's formula", value: pct(r.lender), sub: `at ${num(d.minDscr ?? 0)}x coverage` }
        : { label: "Lender's formula", value: "not run", sub: noLoan ? "no loan given" : "no minimum coverage" },
      r.loanConstant !== null
        ? {
            label: "Loan constant",
            value: pct(r.loanConstant),
            sub: d.amortYears === 0 ? "interest only: the rate" : `${pct(d.rate ?? 0)} over ${count(d.amortYears ?? 0, "year")}, paid monthly`,
          }
        : { label: "Loan constant", value: "not run", sub: "no loan given" },
    ],
  };
}

const ex = CAP_RATE_EXAMPLE;

export const capRateInfo: ModuleInfo = {
  meta: {
    purpose: "Check a cap rate against the sales, the capital stack and the lender's coverage, and see how far the three disagree.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example is pinned to values computed independently in Python: each sale's rate, their mean, median and price-weighted rate, the loan constant, the band of investment, the lender's rate, and the low, high and spread.",
      "The tests pin that the price shares sum to one and weight the sales into the price-weighted rate, that the band less the constant equals the equity share times the equity rate less the constant, and that the lender's rate divided by loan-to-value and the constant gives back the coverage.",
      "Edge cases are pinned: one sale, an interest-only loan (the constant is the rate), a zero rate (the constant is one over the amortization), an equity rate equal to the constant, and one method alone (a zero spread).",
      "A sale with zero or negative NOI, a loan given in part, an equity rate or coverage with no loan, and input that runs no method are each refused with a plain message.",
    ],
    tests: ["__tests__/calc-cap-rate.test.ts"],
  },
  exampleLine: `${count(ex.comps.length, "sale")}; a ${pct(ex.ltv ?? 0, 0)} loan at ${pct(ex.rate ?? 0, 0)} over ${ex.amortYears ?? 0} years; an ${pct(ex.equityDividendRate ?? 0, 0)} equity dividend rate; ${num(ex.minDscr ?? 0)}x coverage`,
  headline: () => capRateHeadline(runCapRate(CAP_RATE_EXAMPLE)),
  preview: () => {
    const f = capRateFigures(CAP_RATE_EXAMPLE, runCapRate(CAP_RATE_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
