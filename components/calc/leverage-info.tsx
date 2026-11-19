import { LEVERAGE_EXAMPLE, runLeverage, type LeverageInput, type LeverageLevel, type LeverageResult } from "@/lib/calculators/leverage";
import { multiple, pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

export const ltvText = (ltv: number) => `${Math.round(ltv * 1000) / 10}%`;

// A gap between two rates, in percentage points: "0.19 points", never "0.19%".
const points = (gap: number) => `${pct(gap).replace("%", "")} points`;

export function leverageHeadline(r: LeverageResult): string {
  const lead =
    r.sign === "neutral"
      ? `Leverage is neutral: the ${pct(r.capRate)} cap rate equals the loan constant`
      : `Leverage is ${r.sign}: the ${pct(r.capRate)} cap rate is ${points(Math.abs(r.spread))} ${r.sign === "positive" ? "above" : "below"} the ${pct(r.loanConstant)} loan constant`;
  const lo = r.levels[0] as LeverageLevel;
  const hi = r.levels.at(-1) as LeverageLevel;
  if (r.levels.length === 1) return `${lead}; cash-on-cash is ${pct(lo.cashOnCash)} at ${ltvText(lo.ltv)} loan-to-value.`;
  const move = r.sign === "positive" ? "rises" : r.sign === "negative" ? "falls" : "holds";
  return `${lead}, so cash-on-cash ${move} from ${pct(lo.cashOnCash)} at ${ltvText(lo.ltv)} loan-to-value to ${pct(hi.cashOnCash)} at ${ltvText(hi.ltv)}.`;
}

export function leverageFigures(d: LeverageInput, r: LeverageResult): { lead: Headline; rest: Headline[] } {
  const hi = r.levels.at(-1) as LeverageLevel;
  const at = `at ${ltvText(hi.ltv)} loan-to-value`;
  const c = r.comparison;
  return {
    lead: { label: "Cap rate less loan constant", value: points(r.spread), sub: `${pct(r.capRate)} cap rate · ${pct(r.loanConstant)} constant` },
    rest: [
      { label: "Cash-on-cash", value: pct(hi.cashOnCash), sub: at },
      { label: "Coverage (DSCR)", value: hi.dscr === null ? "none" : multiple(hi.dscr), sub: hi.dscr === null ? "no debt service" : at },
      { label: "Break-even occupancy", value: pct(hi.breakEvenOccupancy), sub: at },
      c && c.effective !== null
        ? { label: "Cost of the extra dollars", value: pct(c.effective), sub: `${usd(c.extraProceeds, false)} more, effective a year` }
        : { label: "Net operating income", value: usd(r.noi, false), sub: `on ${usd(d.price, false)}` },
    ],
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function leverageCells(d: LeverageInput, r: LeverageResult): Headline[] {
  // cash-on-cash at the top level is in the sentence; the cost of the extra dollars is in its own part of the page
  return leverageFigures(d, r).rest.filter((h) => h.label !== "Cash-on-cash" && h.label !== "Cost of the extra dollars");
}

export const leverageInfo: ModuleInfo = {
  meta: {
    purpose: "Test whether debt raises or lowers the cash return: cap rate against loan constant, cash-on-cash, coverage, debt yield and break-even occupancy by loan-to-value, and what a larger loan's extra dollars cost.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's NOI, cap rate, loan constant and, at each loan-to-value level, loan, debt service, cash flow, cash-on-cash, coverage, debt yield and both break-evens match a separate Python calculation (decimal module, 2026-11-13): money to the cent, rates and ratios to 1e-6.",
      "The comparison's payments, balances after the hold, extra proceeds, extra payment, extra balance and the monthly, nominal and effective cost of the extra dollars are pinned to the same calculation, and that cost plugged back makes the extra flows worth the extra cash.",
      "On five test loans, cash-on-cash equals the cap rate plus the spread times loan over equity at every level and rises with loan-to-value exactly when the spread is positive, and coverage times constant times loan-to-value gives back the cap rate; two interest-only quotes cost their closed form.",
      "All cash, a zero rate, a neutral spread, a second quote smaller than the first (swapped, same cost), equal proceeds after fees and a hold equal to the amortization are pinned; expenses that leave no NOI, levels out of order, fees above the loan and a hold past an amortization are refused in plain words.",
    ],
    tests: ["__tests__/calc-leverage.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `a ${usd(LEVERAGE_EXAMPLE.price, false)} purchase at a ${pct(runLeverage(LEVERAGE_EXAMPLE).capRate)} cap rate and a ${pct(LEVERAGE_EXAMPLE.rate)} loan on a ${LEVERAGE_EXAMPLE.amortYears}-year amortization, tested from all cash to ${ltvText(LEVERAGE_EXAMPLE.ltvLevels.at(-1) ?? 0)} loan-to-value`,
  headline: () => leverageHeadline(runLeverage(LEVERAGE_EXAMPLE)),
  preview: () => {
    const f = leverageFigures(LEVERAGE_EXAMPLE, runLeverage(LEVERAGE_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
