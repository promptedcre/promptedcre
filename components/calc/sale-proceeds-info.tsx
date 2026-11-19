import {
  HALF_CENT,
  runSaleProceeds,
  SALE_PROCEEDS_EXAMPLE,
  saleProceedsNotes,
  type SaleProceedsInput,
  type SaleProceedsResult,
  type SaleProceedsRow,
} from "@/lib/calculators/sale-proceeds";
import { pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline, type SplitSegment } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.
// Every figure is a field of the result; nothing is computed here but the words around it.

// Whole dollars, except an amount under a dollar, which would otherwise read as $0.
const whole = (x: number) => usd(x, Math.abs(x) < 1);

const BEFORE = "Cash at closing, before tax";
const TAX = "Tax on the gain";

// The one sentence for a result, the notes whose fact that sentence already states, and
// the figures (by their cell's label) it already names.
function headlineOf(r: SaleProceedsResult): { text: string; says: string[]; names: string[] } {
  const n = saleProceedsNotes;
  const before = usd(r.cashBeforeTax, false);
  if (!r.clears) {
    const bring = `The sale does not clear the debts: the seller must bring ${whole(r.shortfall)} to closing`;
    // A gain on a sale that does not clear: the tax is owed as well as the cash to bring.
    if (r.tax !== null && r.tax > HALF_CENT && r.cashAfterTax !== null) {
      return {
        text: `${bring} and owes ${whole(r.tax)} of tax on the gain, ${whole(-r.cashAfterTax)} in all.`,
        says: [n.doesNotClear(r.shortfall), n.taxOnTop(r.tax, -r.cashAfterTax)],
        names: [BEFORE, TAX],
      };
    }
    return { text: `${bring}.`, says: [n.doesNotClear(r.shortfall)], names: [BEFORE] };
  }
  if (r.cashAfterTax === null || r.tax === null) return { text: `The sale leaves ${before} at closing, before tax.`, says: [n.noRates()], names: [BEFORE] };
  if (r.isLoss) {
    return { text: `The sale leaves ${before} at closing, at a loss of ${whole(-r.gain)}; what the loss may save in tax is not figured here.`, says: [n.loss(-r.gain)], names: [BEFORE, "Loss"] };
  }
  if (r.cashAfterTax < -HALF_CENT) {
    return {
      text: `The sale leaves ${before} at closing, which does not cover the ${usd(r.tax, false)} of tax on the gain: it is ${whole(-r.cashAfterTax)} short.`,
      says: [n.taxNotCovered(-r.cashAfterTax)],
      names: [BEFORE, TAX],
    };
  }
  return { text: `The sale leaves ${usd(r.cashAfterTax, false)} after tax: ${before} at closing, less ${usd(r.tax, false)} of tax on the gain.`, says: [], names: [BEFORE, TAX] };
}

export function saleProceedsHeadline(r: SaleProceedsResult): string {
  return headlineOf(r).text;
}

// The notes the page prints under the headline: every note of the result but the ones
// the headline already states. The result keeps them all.
export function saleProceedsPageNotes(r: SaleProceedsResult): string[] {
  const says = headlineOf(r).says;
  return r.notes.filter((note) => !says.includes(note));
}

// "$5,400,000 (10% lower)": a ladder row's price and how far it sits from the price entered.
export function saleProceedsRowLabel(row: SaleProceedsRow): string {
  if (row.change === 0) return `${usd(row.price, false)} (entered)`;
  return `${usd(row.price, false)} (${pct(Math.abs(row.change), 0)} ${row.change < 0 ? "lower" : "higher"})`;
}

export function saleProceedsFigures(d: SaleProceedsInput, r: SaleProceedsResult): { lead: Headline; rest: Headline[] } {
  const price = `on a ${usd(d.salePrice, false)} price`;
  const rest: Headline[] = [];
  if (r.cashAfterTax !== null && r.tax !== null) {
    rest.push(
      { label: BEFORE, value: usd(r.cashBeforeTax, false), sub: r.clears ? "amount realized less the payoffs" : "the seller brings this much" },
      { label: TAX, value: usd(r.tax, false), sub: r.isLoss ? "a loss: no tax, and any tax saving is not figured" : "at the rates entered" },
    );
  }
  rest.push(
    r.isLoss
      ? { label: "Loss", value: usd(-r.gain, false), sub: "adjusted basis less amount realized" }
      : { label: "Gain", value: usd(r.gain, false), sub: "amount realized less adjusted basis" },
    { label: "Amount realized", value: usd(r.amountRealized, false), sub: `after ${usd(r.sellingCosts, false)} of selling costs` },
    { label: "Adjusted basis", value: usd(r.adjustedBasis, false), sub: "cost plus improvements less depreciation" },
    { label: "Clearing price", value: usd(r.clearingPrice, false), sub: "the lowest price that pays the payoffs and costs, before tax" },
  );
  return {
    lead:
      r.cashAfterTax !== null
        ? { label: "Cash after tax", value: usd(r.cashAfterTax, false), sub: `${price}; federal tax at the rates entered, paid with the return` }
        : { label: "Cash at closing, before tax", value: usd(r.cashBeforeTax, false), sub: `${price}; no tax figured` },
    rest,
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function saleProceedsCells(d: SaleProceedsInput, r: SaleProceedsResult): Headline[] {
  const named = headlineOf(r).names;
  return saleProceedsFigures(d, r).rest.filter((h) => !named.includes(h.label));
}

// Where the price goes: selling costs, the payoffs, the tax when it is figured, and what
// is left. Drawn only when what is left is not negative, so the parts add to the price.
export function saleProceedsSplit(r: SaleProceedsResult): SplitSegment[] | null {
  const left = r.cashAfterTax ?? r.cashBeforeTax;
  if (!r.clears || left < 0) return null;
  return [
    { key: "costs", label: "Selling costs", value: r.sellingCosts, fill: "outline" },
    { key: "payoffs", label: "Loan and other payoffs", value: r.payoffs, fill: "tint" },
    ...(r.tax !== null ? [{ key: "tax", label: "Tax on the gain", value: r.tax, fill: "light" as const }] : []),
    { key: "cash", label: r.tax !== null ? "Cash after tax" : "Cash at closing, before tax", value: left, fill: "solid" },
  ];
}

const EX = SALE_PROCEEDS_EXAMPLE;

export const saleProceedsInfo: ModuleInfo = {
  meta: {
    purpose: "Work out what a sale leaves the seller at a given price: the gain, the tax on it at rates you enter, and the cash at closing before tax and after.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's selling costs, amount realized, adjusted basis, gain, depreciation part, tax on each part, cash before and after tax, clearing price and all five ladder rows match a separate Python calculation (decimal module, 2026-11-14) that works the cash as a settlement statement and the gain and the tax two ways each, to the cent.",
      "The gain example in IRS Publication 544 (2025) comes out to the amount realized, adjusted basis and $56,000 gain the IRS states.",
      "No loan, a loss, a gain smaller than the depreciation taken, no rates, a sale that does not clear the debts, zero selling costs, cash that does not cover the tax and figures in cents are pinned to the same Python calculation; a reviewer's three sales of its own, including a loss with a loan larger than the price and a sale that does not clear the debts yet owes tax on a gain, are pinned to a second Python calculation written from the scope alone.",
      "On seven sales, amount realized equals adjusted basis plus gain, the price equals selling costs plus payoffs plus cash, cash is zero at the clearing price and rises by one less the selling cost rate per dollar of price, the ladder's middle row is the result, and on the six with rates the tax equals what the like-kind exchange calculator reports as the tax on the whole gain; depreciation above cost plus improvements, a selling cost rate of 100% and rates given in part are refused in plain words.",
    ],
    tests: ["__tests__/calc-sale-proceeds.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `a ${usd(EX.salePrice, false)} sale with ${pct(EX.sellingCostRate, 0)} and ${usd(EX.sellingCostFixed, false)} of selling costs, a ${usd(EX.loanPayoff, false)} loan and ${usd(EX.otherPayoffs, false)} of other payoffs, on a ${usd(EX.originalCost, false)} cost plus ${usd(EX.improvements, false)} of improvements less ${usd(EX.depreciationTaken, false)} of depreciation, at example rates of ${pct(EX.capitalGainRate ?? 0, 0)} on the gain, ${pct(EX.unrecapturedRate ?? 0, 0)} on the depreciation part and ${pct(EX.niiRate ?? 0, 1)} net investment income`,
  headline: () => saleProceedsHeadline(runSaleProceeds(EX)),
  preview: () => {
    const f = saleProceedsFigures(EX, runSaleProceeds(EX));
    return <HeadlineFigures lead={f.lead} rest={f.rest.slice(0, 4)} compact />;
  },
};
