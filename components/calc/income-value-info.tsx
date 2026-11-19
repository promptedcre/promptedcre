import { INCOME_VALUE_EXAMPLE, runIncomeValue, type IncomeValueInput, type IncomeValueResult } from "@/lib/calculators/income-value";
import { multiple, pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline, type SplitSegment } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.
// Every figure is a field of the result; nothing is computed here but the words around it.

const whichNoi = (r: IncomeValueResult) => (r.capitalized === "afterReserves" ? "NOI after reserves" : "NOI before reserves");

export function incomeValueHeadline(r: IncomeValueResult): string {
  if (r.value === null) return `The ${whichNoi(r)} is ${usd(r.noiCapitalized, false)}, so there is no value to capitalize.`;
  return `Capitalized at ${pct(r.capRate)}, ${usd(r.noiCapitalized, false)} of ${whichNoi(r)} is worth ${usd(r.value, false)}.`;
}

export function incomeValueFigures(d: IncomeValueInput, r: IncomeValueResult): { lead: Headline; rest: Headline[] } {
  const rest: Headline[] = [
    { label: "Effective gross income", value: usd(r.egi, false), sub: `after ${pct(d.vacancy, 1)} vacancy and collection loss` },
    { label: whichNoi(r), value: usd(r.noiCapitalized, false), sub: "the NOI capitalized" },
    { label: "Expense ratio", value: pct(r.expenseRatio, 1), sub: `${pct(r.expenseRatioWithReserves, 1)} with reserves` },
    { label: "Value per square foot", value: r.valuePerSf === null ? "none" : usd(r.valuePerSf), sub: d.area === null ? "no area entered" : undefined },
  ];
  if (d.price !== null) {
    rest.push(
      { label: "Gross income multiplier", value: r.gim === null ? "none" : multiple(r.gim), sub: "price over potential gross income" },
      { label: "Cap rate at the price", value: r.impliedCapRate === null ? "none" : pct(r.impliedCapRate), sub: `at ${usd(d.price, false)}` },
    );
    if (r.valueLessPrice !== null) {
      rest.push({
        label: "Value less price",
        // shown to the dollar, so a gap under half a dollar reads as $0, priced at the value
        value: usd(Math.abs(r.valueLessPrice) < 0.5 ? 0 : r.valueLessPrice, false),
        sub: r.valueLessPrice >= 0.5 ? "priced below the value" : r.valueLessPrice <= -0.5 ? "priced above the value" : "priced at the value",
      });
    }
  }
  return {
    lead: {
      label: "Value by direct capitalization",
      value: r.value === null ? "none" : usd(r.value, false),
      sub: r.value === null ? "NOI is zero or less" : `${whichNoi(r)} at a ${pct(d.capRate)} cap rate`,
    },
    rest,
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function incomeValueCells(d: IncomeValueInput, r: IncomeValueResult): Headline[] {
  // the NOI is in the sentence; the gap between value and price is in the result's own note under the figure
  return incomeValueFigures(d, r).rest.filter((h) => h.label !== whichNoi(r) && h.label !== "Value less price");
}

// Where effective gross income goes: expenses, reserves, and the NOI left after both.
// Drawn only when the NOI after reserves is not negative, so the parts add to the whole.
export function incomeValueSplit(r: IncomeValueResult): SplitSegment[] | null {
  if (r.noiAfterReserves < 0) return null;
  return [
    { key: "opex", label: "Operating expenses", value: r.opex, fill: "outline" },
    { key: "reserves", label: "Replacement reserves", value: r.reserves, fill: "tint" },
    { key: "noi", label: "NOI after reserves", value: r.noiAfterReserves, fill: "solid" },
  ];
}

export const incomeValueInfo: ModuleInfo = {
  meta: {
    purpose: "Work one stabilized year from potential gross income down to NOI, and value it by direct capitalization.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "Every figure in the worked example, from vacancy loss through value, value per square foot, the gross income multiplier, the implied cap rate and the five-row cap rate table, matches values computed independently in Python with exact fractions.",
      "In five hand-picked cases, potential gross income plus other income equals vacancy loss, expenses, reserves and NOI, the shares of effective gross income sum to one, and value times the cap rate gives back the NOI capitalized.",
      "With no vacancy, other income, expenses or reserves, value equals potential gross income over the cap rate and the implied cap rate equals one over the multiplier.",
      "No expenses, no reserves, no area, no price, a price above the value, a price equal to the value (no gap, never a minus zero), NOI at or below zero and a table row whose cap rate would fall below zero each return what the method says, and bad input is refused in plain words.",
    ],
    tests: ["__tests__/calc-income-value.test.ts"],
  },
  exampleLine: `${usd(INCOME_VALUE_EXAMPLE.pgi, false)} potential gross income, ${pct(INCOME_VALUE_EXAMPLE.vacancy, 0)} vacancy, a ${pct(INCOME_VALUE_EXAMPLE.capRate)} cap rate`,
  headline: () => incomeValueHeadline(runIncomeValue(INCOME_VALUE_EXAMPLE)),
  preview: () => {
    const f = incomeValueFigures(INCOME_VALUE_EXAMPLE, runIncomeValue(INCOME_VALUE_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest.slice(1, 3)} compact />;
  },
};
