// Turns a calculator's result into the props its figures draw. Pure, so the
// server previews on /calculators and the client calculators agree exactly.

import type { Constraint, DebtInput, DebtResult } from "@/lib/calculators/debt";
import type { ReturnsResult } from "@/lib/calculators/returns";
import { multiple, num, pct, usd } from "@/lib/calculators/trace";
import type { WaterfallInput, WaterfallResult } from "@/lib/calculators/waterfall";
import type { Headline, LadderTier, LimitBar, SplitSegment } from "./figures";

const LIMIT_LABEL: Record<Constraint, string> = { dscr: "Coverage", ltv: "Loan-to-value", "debt-yield": "Debt yield" };

// The three limits as bars, in a fixed order; a limit left blank is not drawn.
export function debtLimitBars(input: DebtInput, r: DebtResult): LimitBar[] {
  const detail: Record<Constraint, string | null> = {
    dscr: input.minDscr === null ? null : `DSCR at least ${num(input.minDscr)}x`,
    ltv: input.maxLtv === null ? null : `at most ${pct(input.maxLtv, 1)}`,
    "debt-yield": input.minDebtYield === null ? null : `at least ${pct(input.minDebtYield, 1)}`,
  };
  return (["dscr", "ltv", "debt-yield"] as Constraint[]).flatMap((c) => {
    const amount = r.byConstraint[c];
    const d = detail[c];
    return amount === undefined || d === null ? [] : [{ key: c, label: LIMIT_LABEL[c], detail: d, amount, binding: c === r.binding }];
  });
}

export function debtHeadline(r: DebtResult): string {
  return `The largest loan is ${usd(r.loan, false)}, set by ${LIMIT_LABEL[r.binding].toLowerCase()}.`;
}

// The lead figure is the loan the sentence names; the cells carry what the sentence does not.
export function debtFigures(input: DebtInput, r: DebtResult): { lead: Headline; rest: Headline[] } {
  return {
    lead: { label: "Largest loan", value: usd(r.loan, false) },
    rest: [
      { label: "Payment, interest only", value: usd(r.ioPayment, false), sub: "a month" },
      ...(r.amortPayment === null ? [] : [{ label: "Payment, amortizing", value: usd(r.amortPayment, false), sub: "a month" }]),
      { label: "Coverage", value: `${num(r.dscr)}x`, sub: r.amortPayment === null ? "on the interest payment" : "on the amortizing payment" },
      { label: "Loan-to-value", value: pct(r.ltv, 1) },
      { label: "Debt yield", value: pct(r.debtYield, 1) },
      { label: "Due at maturity", value: usd(r.balloon, false), sub: `after ${input.termYears} ${input.termYears === 1 ? "year" : "years"}` },
    ],
  };
}

// Where the cash went, by party: the LP, the operator's co-invest and the promote.
export function waterfallSplit(r: WaterfallResult): SplitSegment[] {
  const co = r.periods.reduce((s, p) => s + p.sponsorCoInvest, 0);
  return [
    { key: "lp", label: "LP investors", value: r.totals.lp, fill: "solid" },
    { key: "co", label: "Operator co-invest", value: co, fill: "tint" },
    { key: "promote", label: "Promote", value: r.totals.promote, fill: "light" },
  ];
}

// Each tier's cash, split between the investor class and the promote.
export function waterfallTiers(input: WaterfallInput, r: WaterfallResult): LadderTier[] {
  const shares = [input.pref.investorShare, input.catchUp ? 1 - input.catchUp.sponsorShare : 1, ...input.tiers.map((t) => t.investorShare), input.residualInvestorShare];
  return r.tierLabels.map((label, i) => {
    const total = r.tierCash[i] ?? 0;
    const investors = total * (shares[i] ?? 1);
    return { label, total, investors, promote: total - investors };
  });
}

export function waterfallHeadline(r: WaterfallResult): string {
  const irr = r.investorIrr === null ? "no IRR" : `a ${pct(r.investorIrr)} IRR`;
  return `Investors earn ${irr}; the promote is ${usd(r.totals.promote, false)}.`;
}

// The lead figure is the investor IRR the sentence names. The cells carry what the sentence
// does not: the promote as a share of profit, the operator's total, and the other order.
export function waterfallLead(r: WaterfallResult): Headline {
  return { label: "Investor IRR", value: r.investorIrr === null ? "none" : pct(r.investorIrr), sub: `${multiple(r.investorMultiple)} on ${usd(r.totals.contributed, false)}` };
}

const sameCents = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

export function waterfallCells(r: WaterfallResult): Headline[] {
  const other = `Promote if ${r.alternative.order === "deal-by-deal" ? "deal by deal" : "whole fund"}`;
  return [
    r.promoteShareOfProfit === null
      ? { label: "Promote, share of profit", value: "none", sub: "no profit to share" }
      : { label: "Promote, share of profit", value: pct(r.promoteShareOfProfit) },
    { label: "Operator, in all", value: usd(r.totals.sponsorTotal, false), sub: r.sponsorIrr === null ? undefined : `IRR ${pct(r.sponsorIrr)}` },
    // the other order often pays the same promote (one deal always does): then it says so, not the figure again
    { label: other, value: sameCents(r.alternative.promote, r.totals.promote) ? "The same" : usd(r.alternative.promote, false), sub: "same inputs, other order" },
  ];
}

// "Year 1", "Years 1 to 3", or the years listed.
function yearsText(years: number[]): string {
  const first = years[0];
  const last = years.at(-1);
  if (first === undefined || last === undefined) return "None";
  if (years.length === 1) return `Year ${first}`;
  return last - first === years.length - 1 ? `Years ${first} to ${last}` : `Years ${years.join(", ")}`;
}

// The lead figure is the levered IRR the sentence names; the multiple and the equity are
// in the sentence too, so no cell repeats them.
export function returnsHeadlines(r: ReturnsResult): { lead: Headline; rest: Headline[] } {
  return {
    lead: { label: "Levered IRR", value: r.leveredIrr === null ? "none" : pct(r.leveredIrr) },
    rest: [
      { label: "Unlevered IRR", value: r.unleveredIrr === null ? "none" : pct(r.unleveredIrr) },
      { label: "Cash-on-cash, average", value: pct(r.averageCashOnCash) },
      { label: "Cash-on-cash, year 1", value: pct(r.cashOnCashYear1), sub: r.cashOnCashYear1InterestOnly ? "on an interest-only payment that pays down no principal" : undefined },
      { label: "Interest-only years", value: yearsText(r.interestOnlyYears), sub: r.interestOnlyYears.length > 0 ? "the loan payment covers interest only" : undefined },
    ],
  };
}

export function returnsHeadline(r: ReturnsResult): string {
  const irr = r.leveredIrr === null ? "no levered IRR" : `a ${pct(r.leveredIrr)} levered IRR`;
  return `${irr.charAt(0).toUpperCase()}${irr.slice(1)} and a ${multiple(r.equityMultiple)} multiple on ${usd(r.equity, false)} of equity.`;
}
