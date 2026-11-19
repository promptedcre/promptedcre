import {
  ACCRUAL_BASIS_LABEL,
  LOAN_PAYMENTS_EXAMPLE,
  runLoanPayments,
  type AccrualResult,
  type LoanPaymentsInput,
  type LoanPaymentsResult,
} from "@/lib/calculators/loan-payments";
import { pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline } from "./figures";
import { count } from "./format";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

export function loanPaymentsHeadline(r: LoanPaymentsResult): string {
  const years = r.termMonths / 12;
  const level = r.level.balanceAtMaturity === 0 ? "pay the loan off" : `leave ${usd(r.level.balanceAtMaturity, false)} due`;
  const ep = r.equalPrincipal.balanceAtMaturity === 0 ? "equal principal pays it off" : `equal principal leaves ${usd(r.equalPrincipal.balanceAtMaturity, false)}`;
  return `Level payments of ${usd(r.level.firstPayment, false)} a month ${level} after ${years} ${years === 1 ? "year" : "years"}; ${ep}, and interest only the full ${usd(r.interestOnly.balanceAtMaturity, false)}.`;
}

// The lead figure is the level payment the sentence names. The cells carry what the
// sentence does not: the other structures' payments and the level loan's constant. (The
// balances at maturity are in the sentence; the stepped loan has its own part of the page.)
export function loanPaymentsFigures(d: LoanPaymentsInput, r: LoanPaymentsResult): { lead: Headline; rest: Headline[] } {
  return {
    lead: { label: "Level payment, a month", value: usd(r.level.firstPayment, false), sub: `at ${pct(d.rate)} over ${r.amortMonths / 12} years` },
    rest: [
      { label: "Interest-only payment", value: usd(r.interestOnly.firstPayment, false), sub: "a month" },
      { label: "Equal principal, first payment", value: usd(r.equalPrincipal.firstPayment, false), sub: "a month, falling" },
      { label: "Level loan constant", value: pct(r.level.loanConstant), sub: "a year" },
    ],
  };
}

// A rate with the decimals it needs: two when two say it exactly, four where two
// would round. So a rate entered in eighths keeps its last digit, and a year's cost
// of 7.0972% never reads 7.10% beside a stated 7.00%.
export function loanPaymentsRate(n: number): string {
  const percent = n * 100;
  return Math.abs(percent - Number(percent.toFixed(2))) < 1e-9 ? pct(n, 2) : pct(n, 4);
}

// The line beside the structures table. The effective annual rate is the stated
// rate compounded monthly; the year's cost in the section below is simple interest
// on the day count, so each says which it is.
export function loanPaymentsRateNote(r: LoanPaymentsResult): string {
  return `payments monthly · effective annual rate ${loanPaymentsRate(r.effectiveAnnualRate)}: the stated rate compounded monthly, before fees`;
}

// The result section for the interest between two dates: the line beside its
// title, and its four cells. The stated rate is printed under the year's cost
// only when the two differ.
export function loanPaymentsAccrualNote(a: AccrualResult): string {
  return `${ACCRUAL_BASIS_LABEL[a.basis]} · first day counted, last not: check the loan documents`;
}

export function loanPaymentsAccrualFigures(statedRate: number, a: AccrualResult): Headline[] {
  return [
    { label: "Interest for the stretch", value: usd(a.interest), sub: `${a.from} to ${a.to}` },
    { label: "A day's interest (per diem)", value: usd(a.dailyInterest), sub: `on ${usd(a.balance, false)}, unchanged` },
    { label: "Days counted", value: String(a.countedDays), sub: a.basis === "30-360" ? `30-day months; ${count(a.actualDays, "actual day")}` : "the actual days" },
    {
      label: "A year's cost on this basis",
      value: loanPaymentsRate(a.yearCostRate),
      sub: `simple interest for 365 days${a.yearCostRate === statedRate ? "" : `; the stated rate is ${loanPaymentsRate(statedRate)}`}`,
    },
  ];
}

export const loanPaymentsInfo: ModuleInfo = {
  meta: {
    purpose:
      "Compare level, equal-principal, interest-only and stepped payments on one loan: the payment, the balance at maturity and when the balance grows; and check a day's interest or the interest between two dates on the loan's day-count basis.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's payments, loan constants, balances at maturity and total interest for all four structures, and year-1 interest for the level and equal-principal loans, match a separate Python calculation (decimal module, 2026-11-13) to the cent, and the constants to six decimals.",
      "Every stepped year-end balance, the years the stepped balance grows and its peak are pinned to the same calculation.",
      "On three test loans, principal paid equals the loan less the balance at maturity for every structure, the level balance equals its closed form and the value of the payments left, and the equal-principal balance and total interest equal theirs.",
      "A zero rate, a term equal to the amortization (nothing due, to the cent), a one-year loan and a stepped loan paid off early are pinned; a term longer than the amortization is refused.",
      "On the worked example, the interest between two dates, a day's interest, the day counts and the year's cost on all three day-count bases, and the effective annual rate, match a separate Python calculation (datetime and decimal modules, 2026-11-14) to the cent, and the rates to six decimals.",
      "The days and the interest are pinned the same way across a leap day, a year end, whole months, a 31st on either end and the end of February; an input without the dates block gives the figures it gave before; and an impossible date, dates out of order and a stretch over 366 days are refused.",
    ],
    tests: ["__tests__/calc-loan-payments.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `${usd(LOAN_PAYMENTS_EXAMPLE.loan, false)} at ${pct(LOAN_PAYMENTS_EXAMPLE.rate)}, ${LOAN_PAYMENTS_EXAMPLE.amortYears}-year amortization, ${LOAN_PAYMENTS_EXAMPLE.termYears}-year term${
    LOAN_PAYMENTS_EXAMPLE.accrual
      ? `; interest from ${LOAN_PAYMENTS_EXAMPLE.accrual.from} to ${LOAN_PAYMENTS_EXAMPLE.accrual.to} on an example ${ACCRUAL_BASIS_LABEL[LOAN_PAYMENTS_EXAMPLE.accrual.basis]} basis`
      : ""
  }`,
  headline: () => loanPaymentsHeadline(runLoanPayments(LOAN_PAYMENTS_EXAMPLE)),
  preview: () => {
    const f = loanPaymentsFigures(LOAN_PAYMENTS_EXAMPLE, runLoanPayments(LOAN_PAYMENTS_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
