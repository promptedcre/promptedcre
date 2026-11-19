import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { LoanPaymentsCalculator } from "@/components/calc/loan-payments-calculator";
import { loanPaymentsAccrualFigures, loanPaymentsAccrualNote, loanPaymentsInfo, loanPaymentsRate, loanPaymentsRateNote } from "@/components/calc/loan-payments-info";
import {
  ACCRUAL_BASES,
  ACCRUAL_BASIS_LABEL,
  ACCRUAL_EXAMPLE,
  LOAN_PAYMENTS_EXAMPLE,
  loanPaymentsInput,
  runLoanPayments,
  type AccrualBasis,
  type LoanPaymentsInput,
  type StructureResult,
} from "@/lib/calculators/loan-payments";
import { pct, usd } from "@/lib/calculators/trace";
import * as t from "@/lib/mcp/tools";

// The worked example's expected values were computed independently in Python on
// 2026-11-13 with the decimal module at 40 digits: closed forms for the level,
// equal-principal and interest-only loans, a plain month loop for the stepped
// loan. Money is compared to the cent, rates to 1e-6.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};
const rate = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(1e-6);

const all = (r: ReturnType<typeof runLoanPayments>): StructureResult[] => [r.level, r.equalPrincipal, r.interestOnly, ...(r.stepped ? [r.stepped] : [])];
const ex = (over: Partial<LoanPaymentsInput>): LoanPaymentsInput => ({ ...LOAN_PAYMENTS_EXAMPLE, ...over });

describe("loan-payments worked example ($1,500,000 at 7%, 30-year amortization, 10-year term)", () => {
  const r = runLoanPayments(LOAN_PAYMENTS_EXAMPLE);

  it("figures the month and term counts", () => {
    rate(r.monthlyRate, 0.07 / 12);
    expect(r.amortMonths).toBe(360);
    expect(r.termMonths).toBe(120);
  });

  it("level payment: payment, constant, year 1, balance at maturity, total interest", () => {
    cents(r.level.firstPayment, 9979.5374276877);
    cents(r.level.lastPayment, 9979.5374276877);
    rate(r.level.loanConstant, 0.0798362994);
    cents(r.level.years[0]?.interest, 104517.3016928275);
    cents(r.level.years[0]?.principal, 15237.1474394255);
    cents(r.level.years[0]?.endBalance, 1484762.8525605745);
    cents(r.level.years[9]?.interest, 91197.3382844324);
    cents(r.level.balanceAtMaturity, 1287185.751096341);
    cents(r.level.totalInterest, 984730.2424188706);
  });

  it("equal principal: first and last payment, year 1, balance at maturity, total interest", () => {
    cents(r.equalPrincipal.firstPayment, 12916.6666666667);
    cents(r.equalPrincipal.lastPayment, 10024.3055555556);
    cents(r.equalPrincipal.years[0]?.interest, 103395.8333333333);
    rate(r.equalPrincipal.loanConstant, 0.1022638889);
    cents(r.equalPrincipal.balanceAtMaturity, 1_000_000);
    cents(r.equalPrincipal.totalInterest, 876458.3333333333);
  });

  it("interest only: payment, constant, balance at maturity, total interest", () => {
    cents(r.interestOnly.firstPayment, 8750);
    rate(r.interestOnly.loanConstant, 0.07);
    cents(r.interestOnly.balanceAtMaturity, 1_500_000);
    cents(r.interestOnly.totalInterest, 1_050_000);
  });

  it("stepped: payments, every year-end balance, the years it grows, the peak and total interest", () => {
    const s = r.stepped;
    expect(s).not.toBeNull();
    if (!s) return;
    cents(s.firstPayment, 8000);
    cents(s.lastPayment, 10438.185470634);
    rate(s.loanConstant, 0.064);
    const ends = [
      1509294.4389672303, 1516286.5532094013, 1520720.6808718958, 1522320.0014855319, 1520784.9261046524, 1515791.3686590487, 1506988.8898603825,
      1493998.704375619, 1476411.5413063579, 1453785.3472905575,
    ];
    ends.forEach((e, k) => cents(s.years[k]?.endBalance, e));
    expect(s.negAmYears).toEqual([1, 2, 3, 4]);
    expect(s.peakYear).toBe(4);
    cents(s.peakBalance, 1522320.0014855319);
    cents(s.balanceAtMaturity, 1453785.3472905575);
    cents(s.totalInterest, 1054317.7611917476);
    expect(s.paidOffMonth).toBeNull();
  });

  it("traces every figure it shows, with the value the result holds, starting from the monthly rate", () => {
    expect(r.trace[0]?.label).toBe("Monthly rate");
    const value = (label: string) => r.trace.find((t) => t.label === label)?.value;
    expect(value("Level payment, a month")).toBe(usd(r.level.firstPayment));
    expect(value("Level: balance due at maturity")).toBe(usd(r.level.balanceAtMaturity));
    expect(value("Level: the same balance as the payments left, discounted")).toBe(usd(r.level.balanceAtMaturity));
    expect(value("Level: total interest over the term")).toBe(usd(r.level.totalInterest));
    expect(value("Equal principal: total interest over the term")).toBe(usd(r.equalPrincipal.totalInterest));
    expect(value("Interest only: payment, a month")).toBe(usd(r.interestOnly.firstPayment));
    expect(value("Stepped: years the balance grows")).toBe("years 1 to 4");
    expect(value("Stepped: balance due at maturity")).toBe(usd(r.stepped?.balanceAtMaturity ?? Number.NaN));
  });
});

describe("loan-payments invariants", () => {
  const cases: LoanPaymentsInput[] = [
    LOAN_PAYMENTS_EXAMPLE,
    ex({ rate: 0.115, amortYears: 20, termYears: 7, steppedFirstPayment: 9_000, steppedGrowth: 0.06 }),
    ex({ rate: 0.02, amortYears: 15, termYears: 15, steppedFirstPayment: 12_000, steppedGrowth: 0 }),
  ];

  it.each(cases.map((c, k) => [k, c] as const))("money in equals money out, case %i", (_k, c) => {
    const r = runLoanPayments(c);
    for (const s of all(r)) {
      const principal = s.years.reduce((a, y) => a + y.principal, 0);
      cents(s.totalPrincipal, principal); // loan less the balance at maturity = principal paid
      cents(c.loan - s.balanceAtMaturity, principal);
      cents(s.totalPaid, s.totalInterest + s.totalPrincipal);
      for (const y of s.years) cents(y.endBalance, y.beginBalance - y.principal);
    }
  });

  it.each(cases.map((c, k) => [k, c] as const))("level: the closed form equals the schedule and the value of the payments left, case %i", (_k, c) => {
    const r = runLoanPayments(c);
    const i = c.rate / 12;
    const left = r.amortMonths - r.termMonths;
    const pvLeft = left === 0 ? 0 : (r.level.firstPayment * (1 - (1 + i) ** -left)) / i;
    cents(r.level.balanceAtMaturity, r.level.years.at(-1)?.endBalance ?? Number.NaN);
    cents(r.level.balanceAtMaturity, pvLeft);
    rate(r.level.loanConstant, (12 * r.level.firstPayment) / c.loan);
  });

  it.each(cases.map((c, k) => [k, c] as const))("equal principal: balance and total interest match their closed forms, payments fall, case %i", (_k, c) => {
    const r = runLoanPayments(c);
    const n = r.amortMonths;
    const T = r.termMonths;
    const i = c.rate / 12;
    cents(r.equalPrincipal.balanceAtMaturity, c.loan * (1 - T / n));
    cents(r.equalPrincipal.totalInterest, i * c.loan * (T - (T * (T - 1)) / (2 * n)));
    const paid = r.equalPrincipal.years.map((y) => y.payment);
    for (let k = 1; k < paid.length; k += 1) expect(paid[k] as number).toBeLessThan(paid[k - 1] as number);
    expect(r.equalPrincipal.lastPayment).toBeLessThan(r.equalPrincipal.firstPayment);
  });

  it.each(cases.map((c, k) => [k, c] as const))("interest only: the balance never moves and interest is loan × rate × years, case %i", (_k, c) => {
    const r = runLoanPayments(c);
    cents(r.interestOnly.balanceAtMaturity, c.loan);
    cents(r.interestOnly.totalInterest, c.loan * c.rate * c.termYears);
    rate(r.interestOnly.loanConstant, c.rate);
  });

  it.each(cases.map((c, k) => [k, c] as const))("stepped: a year is flagged exactly when its balance rises, case %i", (_k, c) => {
    const s = runLoanPayments(c).stepped;
    expect(s).not.toBeNull();
    for (const y of s?.years ?? []) expect(y.balanceGrows).toBe(y.endBalance > y.beginBalance);
  });

  it("a stepped loan that starts at or above the level payment never grows", () => {
    const level = runLoanPayments(LOAN_PAYMENTS_EXAMPLE).level.firstPayment;
    const s = runLoanPayments(ex({ steppedFirstPayment: level, steppedGrowth: 0.02 })).stepped;
    expect(s?.negAmYears).toEqual([]);
    expect(s?.peakYear).toBe(0);
    cents(s?.peakBalance, LOAN_PAYMENTS_EXAMPLE.loan);
  });

  it("a flat stepped loan at the level payment is the level loan", () => {
    const r = runLoanPayments(ex({ steppedFirstPayment: runLoanPayments(LOAN_PAYMENTS_EXAMPLE).level.firstPayment, steppedGrowth: 0 }));
    cents(r.stepped?.balanceAtMaturity, r.level.balanceAtMaturity);
    cents(r.stepped?.totalInterest, r.level.totalInterest);
  });
});

describe("loan-payments edge cases", () => {
  it("at a zero rate: level is the loan over the months, no interest anywhere, interest-only pays nothing", () => {
    const r = runLoanPayments(ex({ rate: 0 }));
    cents(r.level.firstPayment, 1_500_000 / 360);
    cents(r.level.balanceAtMaturity, 1_500_000 - 120 * (1_500_000 / 360));
    for (const s of all(r)) cents(s.totalInterest, 0);
    cents(r.interestOnly.firstPayment, 0);
    cents(r.equalPrincipal.firstPayment, r.equalPrincipal.lastPayment);
    expect(r.trace.find((t) => t.label === "Level payment, a month")?.formula).toBe("$1,500,000.00 ÷ 360");
  });

  it("when the term equals the amortization, level and equal principal leave nothing due, to the cent", () => {
    const r = runLoanPayments(ex({ amortYears: 10, termYears: 10 }));
    expect(r.level.balanceAtMaturity).toBe(0);
    expect(r.equalPrincipal.balanceAtMaturity).toBe(0);
    expect(usd(r.level.years.at(-1)?.endBalance ?? Number.NaN)).toBe("$0.00");
    cents(r.level.totalPrincipal, 1_500_000);
  });

  it("handles a one-year loan", () => {
    const r = runLoanPayments(ex({ amortYears: 1, termYears: 1, steppedFirstPayment: null }));
    expect(r.level.years).toHaveLength(1);
    expect(r.level.balanceAtMaturity).toBe(0);
    expect(r.equalPrincipal.balanceAtMaturity).toBe(0);
  });

  it("a stepped payment that pays the loan off early stops at zero", () => {
    const r = runLoanPayments({ loan: 100_000, rate: 0.06, amortYears: 10, termYears: 10, steppedFirstPayment: 40_000, steppedGrowth: 0 });
    const s = r.stepped;
    expect(s?.paidOffMonth).toBe(3);
    expect(s?.balanceAtMaturity).toBe(0);
    expect(s?.lastPayment).toBe(0);
    cents(s?.totalPrincipal, 100_000);
    // month 1: 100,000 + 500 − 40,000; month 2: 60,500 + 302.50 − 40,000; month 3 pays what is left
    cents(s?.totalInterest, 500 + 302.5 + 20802.5 * 0.005);
    expect(r.trace.some((t) => t.formula.startsWith("paid off in month 3"))).toBe(true);
  });

  // Review 2026-11-13 (math-review-a): an input set of the reviewer's own, checked in an
  // independent Python month loop written from the scope: the term equals a five-year
  // amortization, and a stepped payment rising 10% a year pays the loan off in month 26.
  it("a five-year loan paid off at maturity, and a stepped loan paid off early, match the reviewer's own calculation", () => {
    const r = runLoanPayments({ loan: 500_000, rate: 0.05, amortYears: 5, termYears: 5, steppedFirstPayment: 20_000, steppedGrowth: 0.1 });
    cents(r.level.firstPayment, 9435.616822005497);
    cents(r.level.totalInterest, 66137.00932032774);
    expect(r.level.balanceAtMaturity).toBe(0);
    cents(r.equalPrincipal.lastPayment, 8368.055555555558);
    cents(r.equalPrincipal.totalInterest, 63541.66666666676);
    expect(r.equalPrincipal.balanceAtMaturity).toBe(0);
    cents(r.interestOnly.totalInterest, 125_000);
    expect(r.stepped?.paidOffMonth).toBe(26);
    cents(r.stepped?.totalInterest, 28295.75404446386);
    rate(r.stepped?.loanConstant ?? Number.NaN, 0.48);
    expect(r.stepped?.lastPayment).toBe(0);
    expect(r.stepped?.negAmYears).toEqual([]);
    expect(r.stepped?.years.slice(3).every((y) => y.payment === 0 && y.endBalance === 0)).toBe(true);
  });

  it("leaves the stepped loan out when there is no first payment", () => {
    const r = runLoanPayments(ex({ steppedFirstPayment: null }));
    expect(r.stepped).toBeNull();
    expect(r.trace.some((t) => t.label.startsWith("Stepped"))).toBe(false);
  });
});

describe("loan-payments rejects bad input in plain words", () => {
  const firstIssue = (input: unknown) => {
    const p = loanPaymentsInput.safeParse(input);
    expect(p.success).toBe(false);
    return p.error?.issues[0];
  };

  it("a term longer than the amortization", () => {
    const i = firstIssue(ex({ amortYears: 10, termYears: 15 }));
    expect(i?.path).toEqual(["termYears"]);
    expect(i?.message).toBe("term cannot exceed amortization");
    expect(() => runLoanPayments(ex({ amortYears: 10, termYears: 15 }))).toThrow(/term cannot exceed amortization/);
  });

  it("a zero loan, a negative rate, a part year and a negative step", () => {
    const zero = firstIssue(ex({ loan: 0 }));
    expect(zero?.path).toEqual(["loan"]);
    expect(plainIssue(zero as NonNullable<typeof zero>, "money")).toBe("Must be more than zero.");
    const neg = firstIssue(ex({ rate: -0.01 }));
    expect(plainIssue(neg as NonNullable<typeof neg>, "pct")).toBe("Cannot be negative.");
    const part = firstIssue(ex({ termYears: 7.5 }));
    expect(plainIssue(part as NonNullable<typeof part>, "int")).toBe("Whole numbers only.");
    const step = firstIssue(ex({ steppedGrowth: -0.02 }));
    expect(step?.path).toEqual(["steppedGrowth"]);
    expect(plainIssue(step as NonNullable<typeof step>, "pct")).toBe("Cannot be negative.");
  });

  it("an amortization past 40 years and a field it does not know", () => {
    const long = firstIssue(ex({ amortYears: 50, termYears: 10 }));
    expect(plainIssue(long as NonNullable<typeof long>, "int")).toBe("At most 40.");
    expect(loanPaymentsInput.safeParse({ ...LOAN_PAYMENTS_EXAMPLE, balloonYears: 5 }).success).toBe(false);
  });
});

// ---------- interest between two dates, and the effective annual rate ----------
//
// Every expected value below was computed independently in Python on 2026-11-14
// with datetime.date and the decimal module at 40 digits: actual days by date
// subtraction, the thirty-day-month count from a 30/360 ordinal (year × 360 +
// months elapsed × 30 + the day, a 31st held to 30), and the effective rate as
// (1 + rate ÷ 12)^12 − 1. Money is compared to the cent, rates to 1e-6.

// The worked example as it was before the accrual block existed: no `accrual` key.
const BEFORE = { loan: 1_500_000, rate: 0.07, amortYears: 30, termYears: 10, steppedFirstPayment: 8_000, steppedGrowth: 0.03 };

const between = (basis: AccrualBasis, from: string, to: string, over: Partial<LoanPaymentsInput> = {}, balance: number | null = null) => {
  const r = runLoanPayments(ex({ ...over, accrual: { basis, from, to, balance } }));
  if (!r.accrual) throw new Error("the accrual block was given, so its result is expected");
  return r.accrual;
};
// Everything the calculator returned before the block existed.
const schedule = (r: ReturnType<typeof runLoanPayments>) => ({ ...r, effectiveAnnualRate: null, accrual: null, trace: [] });

describe("loan-payments worked example: interest from 2027-03-12 to 2027-04-01 (made-up dates)", () => {
  const r = runLoanPayments(LOAN_PAYMENTS_EXAMPLE);

  it("keeps every earlier input value and adds the block", () => {
    expect(LOAN_PAYMENTS_EXAMPLE).toEqual({ ...BEFORE, accrual: ACCRUAL_EXAMPLE });
    expect(ACCRUAL_EXAMPLE).toEqual({ basis: "actual-360", from: "2027-03-12", to: "2027-04-01", balance: null });
  });

  it("the effective annual rate of 7% compounded monthly", () => {
    rate(r.effectiveAnnualRate, 0.072290080856);
  });

  it("on actual-360, the example's basis: days, balance, interest, a day's interest, the year's cost", () => {
    const a = r.accrual;
    expect(a).not.toBeNull();
    expect(a?.basis).toBe("actual-360");
    expect(a?.from).toBe("2027-03-12");
    expect(a?.to).toBe("2027-04-01");
    expect(a?.actualDays).toBe(20);
    expect(a?.countedDays).toBe(20);
    expect(a?.balance).toBe(1_500_000);
    cents(a?.interest, 5833.3333333333);
    cents(a?.dailyInterest, 291.6666666667);
    rate(a?.yearCostRate ?? Number.NaN, 0.070972222222);
    expect(a?.notes).toEqual([]);
  });

  it("the same dates on actual-365 and on 30-360", () => {
    const a365 = between("actual-365", "2027-03-12", "2027-04-01");
    expect(a365.actualDays).toBe(20);
    expect(a365.countedDays).toBe(20);
    cents(a365.interest, 5753.4246575342);
    cents(a365.dailyInterest, 287.6712328767);
    rate(a365.yearCostRate, 0.07);

    const a30 = between("30-360", "2027-03-12", "2027-04-01");
    expect(a30.actualDays).toBe(20);
    expect(a30.countedDays).toBe(19); // 30 × (4 − 3) + (1 − 12)
    cents(a30.interest, 5541.6666666667);
    cents(a30.dailyInterest, 291.6666666667);
    rate(a30.yearCostRate, 0.07);
    expect(a30.notes).toEqual([]);
  });

  it("traces the new figures in the order computed, with the values the result holds", () => {
    const labels = r.trace.map((x) => x.label);
    const at = labels.indexOf("Effective annual rate");
    expect(labels[at - 1]).toBe("Stepped: total interest over the term");
    expect(labels.slice(at)).toEqual([
      "Effective annual rate",
      "Between dates: actual days",
      "Between dates: days counted",
      "Between dates: balance the interest runs on",
      "Between dates: a day's interest",
      "Between dates: interest",
      "Between dates: a year's cost on the basis",
    ]);
    const line = (label: string) => r.trace.find((x) => x.label === label);
    expect(line("Effective annual rate")?.value).toBe(pct(r.effectiveAnnualRate, 4));
    expect(line("Effective annual rate")?.value).toBe("7.2290%");
    expect(line("Between dates: actual days")?.value).toBe("20 days");
    expect(line("Between dates: days counted")?.value).toBe("20 days");
    expect(line("Between dates: balance the interest runs on")?.value).toBe("$1,500,000.00");
    expect(line("Between dates: a day's interest")?.value).toBe(usd(r.accrual?.dailyInterest ?? Number.NaN));
    expect(line("Between dates: a day's interest")?.formula).toBe("$1,500,000.00 × 7.0000% ÷ 360");
    expect(line("Between dates: interest")?.value).toBe(usd(r.accrual?.interest ?? Number.NaN));
    expect(line("Between dates: interest")?.value).toBe("$5,833.33");
    expect(line("Between dates: interest")?.formula).toBe("$1,500,000.00 × 7.0000% × 20 ÷ 360");
    expect(line("Between dates: a year's cost on the basis")?.value).toBe("7.0972%");
  });

  it("on 30-360 the trace shows the count it made", () => {
    const run = runLoanPayments(ex({ accrual: { basis: "30-360", from: "2027-01-31", to: "2027-03-31", balance: null } }));
    const counted = run.trace.find((x) => x.label === "Between dates: days counted");
    expect(counted?.formula).toBe("360 × (2027 − 2027) + 30 × (3 − 1) + (30 − 30), a 31st counted as a 30th");
    expect(counted?.value).toBe("60 days");
    expect(run.trace.find((x) => x.label === "Between dates: interest")?.formula).toBe("$1,500,000.00 × 7.0000% × 60 ÷ 360");
  });
});

describe("loan-payments: an input written before the accrual block existed", () => {
  it("still parses, and gives exactly the figures it gave before", () => {
    expect(loanPaymentsInput.safeParse(BEFORE).success).toBe(true);
    const r = runLoanPayments(BEFORE);
    expect(r.accrual).toBeNull();
    // the same pins as the worked example above, on the object without the key
    cents(r.level.firstPayment, 9979.5374276877);
    rate(r.level.loanConstant, 0.0798362994);
    cents(r.level.balanceAtMaturity, 1287185.751096341);
    cents(r.level.totalInterest, 984730.2424188706);
    cents(r.equalPrincipal.firstPayment, 12916.6666666667);
    cents(r.equalPrincipal.lastPayment, 10024.3055555556);
    cents(r.equalPrincipal.totalInterest, 876458.3333333333);
    cents(r.interestOnly.firstPayment, 8750);
    cents(r.interestOnly.totalInterest, 1_050_000);
    cents(r.stepped?.lastPayment, 10438.185470634);
    cents(r.stepped?.balanceAtMaturity, 1453785.3472905575);
    cents(r.stepped?.totalInterest, 1054317.7611917476);
    expect(r.stepped?.negAmYears).toEqual([1, 2, 3, 4]);
    // and every schedule figure is the very number the example with the block returns
    expect(schedule(r)).toEqual(schedule(runLoanPayments(LOAN_PAYMENTS_EXAMPLE)));
    rate(r.effectiveAnnualRate, 0.072290080856);
  });

  it("null and a missing key mean the same thing, and neither adds a line about the dates", () => {
    const missing = runLoanPayments(BEFORE);
    const nulled = runLoanPayments({ ...BEFORE, accrual: null });
    expect(nulled).toEqual(missing);
    expect(missing.trace.some((x) => x.label.startsWith("Between dates"))).toBe(false);
    expect(missing.trace.at(-1)?.label).toBe("Effective annual rate");
    // the lines that were there before the change are the same lines, in the same order
    const withBlock = runLoanPayments(LOAN_PAYMENTS_EXAMPLE).trace;
    expect(withBlock.slice(0, missing.trace.length)).toEqual(missing.trace);
  });

  it.each(ACCRUAL_BASES.map((b) => [b] as const))("the block never changes the monthly schedule, on %s", (basis) => {
    const withBlock = runLoanPayments(ex({ accrual: { basis, from: "2027-12-20", to: "2028-01-10", balance: 900_000 } }));
    expect(schedule(withBlock)).toEqual(schedule(runLoanPayments(BEFORE)));
    expect(withBlock.effectiveAnnualRate).toBe(runLoanPayments(BEFORE).effectiveAnnualRate);
  });
});

describe("loan-payments edge cases between two dates ($1,500,000 at 7%)", () => {
  // [what, from, to, actual days, days counted on 30-360, interest on actual-360, on actual-365, on 30-360]
  const rows: Array<[string, string, string, number, number, number, number, number]> = [
    ["across a leap day", "2028-02-15", "2028-03-15", 29, 30, 8458.3333333333, 8342.4657534247, 8750],
    ["across a year end", "2027-12-20", "2028-01-10", 21, 20, 6125, 6041.095890411, 5833.3333333333],
    ["three whole months", "2027-05-15", "2027-08-15", 92, 90, 26833.3333333333, 26465.7534246575, 26250],
    ["a 31st on both ends", "2027-01-31", "2027-03-31", 59, 60, 17208.3333333333, 16972.602739726, 17500],
    ["the 30th to the 31st of one month", "2027-07-30", "2027-07-31", 1, 0, 291.6666666667, 287.6712328767, 0],
    ["a 31st to the 15th", "2027-08-31", "2027-09-15", 15, 15, 4375, 4315.0684931507, 4375],
    ["the 15th to a 31st", "2027-10-15", "2027-10-31", 16, 15, 4666.6666666667, 4602.7397260274, 4375],
    ["February 28 to March 28", "2027-02-28", "2027-03-28", 28, 30, 8166.6666666667, 8054.7945205479, 8750],
    ["January 29 to February 29 of a leap year", "2028-01-29", "2028-02-29", 31, 30, 9041.6666666667, 8917.8082191781, 8750],
    ["a whole leap year, the longest stretch taken", "2028-01-01", "2029-01-01", 366, 360, 106750, 105287.6712328767, 105000],
  ];

  it.each(rows)("%s: %s to %s", (_what, from, to, actual, counted30, i360, i365, i30) => {
    const a360 = between("actual-360", from, to);
    const a365 = between("actual-365", from, to);
    const a30 = between("30-360", from, to);
    for (const a of [a360, a365, a30]) expect(a.actualDays).toBe(actual);
    expect(a360.countedDays).toBe(actual);
    expect(a365.countedDays).toBe(actual);
    expect(a30.countedDays).toBe(counted30);
    cents(a360.interest, i360);
    cents(a365.interest, i365);
    cents(a30.interest, i30);
    cents(a360.dailyInterest, 291.6666666667);
    cents(a365.dailyInterest, 287.6712328767);
    cents(a30.dailyInterest, 291.6666666667);
  });

  it("whole months on 30-360 cost that many twelfths of a year's interest", () => {
    const year = 1_500_000 * 0.07;
    for (let months = 1; months <= 12; months += 1) {
      const to = months === 12 ? "2028-01-15" : `2027-${String(months + 1).padStart(2, "0")}-15`;
      const a = between("30-360", "2027-01-15", to);
      expect(a.countedDays).toBe(30 * months);
      cents(a.interest, (year * months) / 12);
    }
    cents(between("30-360", "2027-05-15", "2027-08-15").interest, 26250);
  });

  // Finish pass 2026-11-14: the notes say "the loan documents" for the promissory
  // note, and two dates flagged for the same reason share one line (they were two
  // near-identical lines). The pins below were updated to the new wording.
  it("on 30-360 a 31st and the last days of February each add a note naming the date; other days and the actual bases add none", () => {
    expect(between("30-360", "2027-08-31", "2027-09-15").notes).toEqual([
      "2027-08-31 is a 31st, counted here as a 30th. Check the day count against the loan documents: their own thirty-day-month rule can count this date differently.",
    ]);
    expect(between("30-360", "2027-10-15", "2027-10-31").notes).toHaveLength(1);
    expect(between("30-360", "2027-10-15", "2027-10-31").notes[0]?.startsWith("2027-10-31 is a 31st, counted here as a 30th.")).toBe(true);
    const feb = between("30-360", "2027-02-28", "2027-03-28").notes;
    expect(feb).toEqual([
      "2027-02-28 is in the last days of February, which this count does not adjust. Check the day count against the loan documents: their own thirty-day-month rule can count this date differently.",
    ]);
    expect(between("30-360", "2028-01-29", "2028-02-29").notes[0]?.startsWith("2028-02-29 is in the last days of February")).toBe(true);
    expect(between("30-360", "2028-02-28", "2028-03-15").notes).toHaveLength(1); // the 28th is flagged in a leap year too
    expect(between("30-360", "2027-02-27", "2027-03-27").notes).toEqual([]);
    expect(between("30-360", "2027-04-30", "2027-05-30").notes).toEqual([]);
    for (const basis of ["actual-360", "actual-365"] as const) {
      expect(between(basis, "2027-01-31", "2027-03-31").notes).toEqual([]);
      expect(between(basis, "2027-02-28", "2027-03-28").notes).toEqual([]);
    }
  });

  it("on 30-360 two dates flagged for the same reason share one note; two reasons give two notes, the earlier date's first", () => {
    expect(between("30-360", "2027-01-31", "2027-03-31").notes).toEqual([
      "2027-01-31 and 2027-03-31 are each a 31st, counted here as a 30th. Check the day count against the loan documents: their own thirty-day-month rule can count these dates differently.",
    ]);
    expect(between("30-360", "2027-02-28", "2028-02-28").notes).toEqual([
      "2027-02-28 and 2028-02-28 are both in the last days of February, which this count does not adjust. Check the day count against the loan documents: their own thirty-day-month rule can count these dates differently.",
    ]);
    expect(between("30-360", "2028-02-28", "2028-02-29").notes).toHaveLength(1); // one day apart, both late February
    const febFirst = between("30-360", "2027-02-28", "2027-03-31").notes;
    expect(febFirst).toHaveLength(2);
    expect(febFirst[0]?.startsWith("2027-02-28 is in the last days of February, which this count does not adjust.")).toBe(true);
    expect(febFirst[1]?.startsWith("2027-03-31 is a 31st, counted here as a 30th.")).toBe(true);
    const thirtyFirstFirst = between("30-360", "2027-01-31", "2027-02-28").notes;
    expect(thirtyFirstFirst).toHaveLength(2);
    expect(thirtyFirstFirst[0]?.startsWith("2027-01-31 is a 31st")).toBe(true);
    expect(thirtyFirstFirst[1]?.startsWith("2027-02-28 is in the last days of February")).toBe(true);
    // folding changes the wording only: the count and the interest are what they were
    expect(between("30-360", "2027-02-28", "2028-02-28").countedDays).toBe(360);
    cents(between("30-360", "2027-02-28", "2028-02-28").interest, 105000);
  });

  it("a note never uses the word for the promissory note, and every one names the loan documents", () => {
    const flagged: Array<[string, string]> = [
      ["2027-01-31", "2027-03-31"],
      ["2027-08-31", "2027-09-15"],
      ["2027-02-28", "2027-03-28"],
      ["2027-02-28", "2028-02-28"],
      ["2027-02-28", "2027-03-31"],
    ];
    for (const [from, to] of flagged) {
      for (const n of between("30-360", from, to).notes) {
        expect(n).not.toMatch(/\bnotes?\b/i);
        expect(n).toContain("Check the day count against the loan documents:");
        expect(n).not.toMatch(/—|\bsimply\b|\bjust\b/);
      }
    }
  });

  it("a person reads actual/360, actual/365 and 30/360 in the trace and the notes; the ids stay what an agent sends", () => {
    expect(ACCRUAL_BASES).toEqual(["actual-360", "actual-365", "30-360"]);
    expect(ACCRUAL_BASIS_LABEL).toEqual({ "actual-360": "actual/360", "actual-365": "actual/365", "30-360": "30/360" });
    const counted = (basis: AccrualBasis) => runLoanPayments(ex({ accrual: { ...ACCRUAL_EXAMPLE, basis } })).trace.find((x) => x.label === "Between dates: days counted")?.formula;
    expect(counted("actual-360")).toBe("actual/360 charges the actual days");
    expect(counted("actual-365")).toBe("actual/365 charges the actual days");
    for (const basis of ACCRUAL_BASES) {
      const r = runLoanPayments(ex({ accrual: { basis, from: "2027-01-31", to: "2027-03-31", balance: null } }));
      expect(r.accrual?.basis).toBe(basis); // the result still carries the id
      const read = [...r.trace.flatMap((x) => [x.label, x.formula, x.value]), ...(r.accrual?.notes ?? [])].join(" | ");
      expect(read).not.toMatch(/actual-36[05]|30-360|Actual\//);
    }
  });

  it("at a zero rate there is no interest on any basis, and the effective rate is zero", () => {
    for (const basis of ACCRUAL_BASES) {
      const r = runLoanPayments(ex({ rate: 0, accrual: { ...ACCRUAL_EXAMPLE, basis } }));
      expect(r.accrual?.interest).toBe(0);
      expect(r.accrual?.dailyInterest).toBe(0);
      expect(r.accrual?.yearCostRate).toBe(0);
      expect(r.accrual?.actualDays).toBe(20);
      expect(r.effectiveAnnualRate).toBe(0);
      expect(r.trace.find((x) => x.label === "Between dates: interest")?.value).toBe("$0.00");
    }
  });

  it("a null balance uses the loan; a balance given is used as given and leaves the loan's own figures alone", () => {
    const onLoan = runLoanPayments(LOAN_PAYMENTS_EXAMPLE);
    expect(onLoan.accrual?.balance).toBe(LOAN_PAYMENTS_EXAMPLE.loan);
    expect(onLoan.trace.find((x) => x.label === "Between dates: balance the interest runs on")?.formula).toBe("none given: the loan amount");

    const given = runLoanPayments(ex({ accrual: { ...ACCRUAL_EXAMPLE, balance: 1_250_000 } }));
    expect(given.accrual?.balance).toBe(1_250_000);
    cents(given.accrual?.interest, 4861.1111111111);
    cents(given.accrual?.dailyInterest, 243.0555555556);
    expect(given.trace.find((x) => x.label === "Between dates: balance the interest runs on")?.value).toBe("$1,250,000.00");
    expect(given.level.firstPayment).toBe(onLoan.level.firstPayment);
    cents(between("actual-365", "2027-03-12", "2027-04-01", {}, 1_250_000).interest, 4794.5205479452);
    cents(between("30-360", "2027-03-12", "2027-04-01", {}, 1_250_000).interest, 4618.0555555556);
  });

  it("a second loan of the test's own: $640,000 at 5.25%, $612,500 outstanding, 2029-11-18 to 2030-01-05", () => {
    const over = { loan: 640_000, rate: 0.0525, steppedFirstPayment: null };
    const a360 = between("actual-360", "2029-11-18", "2030-01-05", over, 612_500);
    const a365 = between("actual-365", "2029-11-18", "2030-01-05", over, 612_500);
    const a30 = between("30-360", "2029-11-18", "2030-01-05", over, 612_500);
    expect(a360.actualDays).toBe(48);
    expect(a30.countedDays).toBe(47);
    cents(a360.interest, 4287.5);
    cents(a365.interest, 4228.7671232877);
    cents(a30.interest, 4198.1770833333);
    cents(a360.dailyInterest, 89.3229166667);
    cents(a365.dailyInterest, 88.0993150685);
    rate(a360.yearCostRate, 0.053229166667);
    rate(a365.yearCostRate, 0.0525);
    rate(a30.yearCostRate, 0.0525);
    rate(runLoanPayments(ex({ ...over, accrual: null })).effectiveAnnualRate, 0.053781886727);
  });
});

describe("loan-payments invariants between two dates", () => {
  const stretches: Array<[string, string]> = [
    ["2027-03-12", "2027-04-01"],
    ["2028-02-15", "2028-03-15"],
    ["2027-12-20", "2028-01-10"],
    ["2027-01-31", "2027-03-31"],
    ["2028-01-01", "2029-01-01"],
  ];

  it.each(stretches)("a day's interest times the days is the interest on the two actual bases, %s to %s", (from, to) => {
    for (const basis of ["actual-360", "actual-365"] as const) {
      const a = between(basis, from, to);
      cents(a.dailyInterest * a.actualDays, a.interest);
    }
    // on 30-360 the same holds with the days it counted
    const a30 = between("30-360", from, to);
    cents(a30.dailyInterest * a30.countedDays, a30.interest);
  });

  it.each(stretches)("actual-360 interest is actual-365 interest times 365 over 360, %s to %s", (from, to) => {
    cents(between("actual-360", from, to).interest, (between("actual-365", from, to).interest * 365) / 360);
  });

  it("from January 1 of a non-leap year to the next January 1, actual-365 interest is exactly balance × rate", () => {
    const a = between("actual-365", "2027-01-01", "2028-01-01");
    expect(a.actualDays).toBe(365);
    expect(a.interest).toBe(1_500_000 * 0.07);
    const given = between("actual-365", "2027-01-01", "2028-01-01", { rate: 0.0525 }, 612_500);
    expect(given.interest).toBe(612_500 * 0.0525);
    // the same year on actual-360 costs 365 ÷ 360 of that, and on 30-360 counts 360 days
    cents(between("actual-360", "2027-01-01", "2028-01-01").interest, 106458.3333333333);
    expect(between("30-360", "2027-01-01", "2028-01-01").countedDays).toBe(360);
    cents(between("30-360", "2027-01-01", "2028-01-01").interest, 105000);
  });

  it("a year's cost on the basis is the rate times 365 over 360 on actual-360, and the rate on the other two", () => {
    for (const r of [0.02, 0.07, 0.115]) {
      rate(between("actual-360", "2027-03-12", "2027-04-01", { rate: r }).yearCostRate, (r * 365) / 360);
      expect(between("actual-365", "2027-03-12", "2027-04-01", { rate: r }).yearCostRate).toBe(r);
      expect(between("30-360", "2027-03-12", "2027-04-01", { rate: r }).yearCostRate).toBe(r);
    }
  });

  it("the effective annual rate is above the stated rate whenever the rate is above zero, and equal to it at zero", () => {
    for (const r of [0.0001, 0.02, 0.0525, 0.07, 0.115, 0.3]) expect(runLoanPayments(ex({ rate: r })).effectiveAnnualRate).toBeGreaterThan(r);
    expect(runLoanPayments(ex({ rate: 0 })).effectiveAnnualRate).toBe(0);
    rate(runLoanPayments(ex({ rate: 0.115 })).effectiveAnnualRate, 0.121259328138);
    rate(runLoanPayments(ex({ rate: 0.02 })).effectiveAnnualRate, 0.020184355682);
  });
});

describe("loan-payments refuses a bad accrual block in plain words", () => {
  const block = (over: Record<string, unknown>) => ({ ...BEFORE, accrual: { ...ACCRUAL_EXAMPLE, ...over } });
  const issuesOf = (input: unknown) => {
    const p = loanPaymentsInput.safeParse(input);
    expect(p.success).toBe(false);
    return p.error?.issues ?? [];
  };

  it("a date the calendar does not hold", () => {
    const [i] = issuesOf(block({ from: "2027-02-30", to: "2027-03-15" }));
    expect(i?.path).toEqual(["accrual", "from"]);
    expect(i?.message).toBe("2027-02-30 is not a real calendar date");
    expect(plainIssue(i as NonNullable<typeof i>)).toBe("2027-02-30 is not a real calendar date.");
    const [j] = issuesOf(block({ to: "2027-04-31" }));
    expect(j?.path).toEqual(["accrual", "to"]);
    expect(j?.message).toBe("2027-04-31 is not a real calendar date");
    // February 29 is real only in a leap year; both dates wrong gives both messages
    expect(issuesOf(block({ from: "2027-02-29", to: "2027-03-15" }))[0]?.message).toBe("2027-02-29 is not a real calendar date");
    expect(loanPaymentsInput.safeParse(block({ from: "2028-02-29", to: "2028-03-15" })).success).toBe(true);
    expect(issuesOf(block({ from: "2027-13-01", to: "2027-02-30" })).map((x) => x.path.join("."))).toEqual(["accrual.from", "accrual.to"]);
    expect(() => runLoanPayments(block({ from: "2027-02-30", to: "2027-03-15" }) as LoanPaymentsInput)).toThrow(/2027-02-30 is not a real calendar date/);
  });

  it("the last day on or before the first", () => {
    for (const to of ["2027-03-12", "2027-03-11", "2026-04-01"]) {
      const [i] = issuesOf(block({ to }));
      expect(i?.path).toEqual(["accrual", "to"]);
      expect(i?.message).toBe("must be later than the first day interest runs");
      expect(plainIssue(i as NonNullable<typeof i>)).toBe("Must be later than the first day interest runs.");
    }
    expect(loanPaymentsInput.safeParse(block({ to: "2027-03-13" })).success).toBe(true);
  });

  it("a stretch over 366 days, while 366 days is taken", () => {
    expect(loanPaymentsInput.safeParse(block({ from: "2028-01-01", to: "2029-01-01" })).success).toBe(true);
    const [i] = issuesOf(block({ from: "2028-01-01", to: "2029-01-02" }));
    expect(i?.path).toEqual(["accrual", "to"]);
    expect(i?.message).toBe("must be within 366 days of the first day; these dates are 367 days apart");
    expect(issuesOf(block({ to: "2028-04-01" }))[0]?.message).toBe("must be within 366 days of the first day; these dates are 386 days apart");
  });

  it("a date not written YYYY-MM-DD, a missing date and a year the day count cannot read", () => {
    const [i] = issuesOf(block({ from: "3/12/2027" }));
    expect(i?.path).toEqual(["accrual", "from"]);
    expect(plainIssue(i as NonNullable<typeof i>)).toBe("Enter a date.");
    const [j] = issuesOf(block({ to: null }));
    expect(j?.path).toEqual(["accrual", "to"]);
    expect(plainIssue(j as NonNullable<typeof j>)).toBe("Fill this in.");
    expect(issuesOf(block({ from: "0050-03-12", to: "0050-04-01" })).map((x) => x.message)).toEqual(["the year must be 0100 or later", "the year must be 0100 or later"]);
  });

  it("a basis it does not know, a zero balance, a missing balance and a field it does not know", () => {
    expect(issuesOf(block({ basis: "actual/360" }))[0]?.path).toEqual(["accrual", "basis"]);
    const [zero] = issuesOf(block({ balance: 0 }));
    expect(zero?.path).toEqual(["accrual", "balance"]);
    expect(plainIssue(zero as NonNullable<typeof zero>, "money")).toBe("Must be more than zero.");
    expect(issuesOf({ ...BEFORE, accrual: { basis: "actual-360", from: "2027-03-12", to: "2027-04-01" } })[0]?.path).toEqual(["accrual", "balance"]);
    expect(issuesOf(block({ fee: 500 }))[0]?.path).toEqual(["accrual"]);
  });

  it("calc_run names the field and says what is wrong", () => {
    expect(() => t.calcRun({ id: "loan-payments", input: block({ from: "2027-02-30", to: "2027-03-15" }) })).toThrow(
      "Invalid input for loan-payments: input.accrual.from: 2027-02-30 is not a real calendar date",
    );
    expect(() => t.calcRun({ id: "loan-payments", input: block({ to: "2027-03-01" }) })).toThrow("Invalid input for loan-payments: input.accrual.to: must be later than the first day interest runs");
    const ran = t.calcRun({ id: "loan-payments", input: BEFORE }) as unknown as { result: { accrual: unknown; effectiveAnnualRate: number } };
    expect(ran.result.accrual).toBeNull();
    rate(ran.result.effectiveAnnualRate, 0.072290080856);
  });
});

// ---------- reviewer's input sets ----------
//
// Added by the math reviewer (math-review-loan). Every expected value below was
// computed independently in Python on 2026-11-14 from the scope alone (datetime.date
// for the days, a thirty-day-month count written from the scope's words, the decimal
// module at 50 digits), before the reviewer read the TypeScript. Figures are made up.
describe("loan-payments between two dates: the reviewer's own input sets", () => {
  const run = (loan: number, r: number, basis: AccrualBasis, from: string, to: string, balance: number | null = null) => {
    const out = runLoanPayments({ loan, rate: r, amortYears: 25, termYears: 10, steppedFirstPayment: null, steppedGrowth: 0, accrual: { basis, from, to, balance } });
    if (!out.accrual) throw new Error("the accrual block was given, so its result is expected");
    return { a: out.accrual, ear: out.effectiveAnnualRate };
  };

  it("an ordinary stretch: $2,400,000 at 6.25% on actual-360, 2027-03-15 to 2027-04-01", () => {
    const { a, ear } = run(2_400_000, 0.0625, "actual-360", "2027-03-15", "2027-04-01");
    expect(a.actualDays).toBe(17);
    expect(a.countedDays).toBe(17);
    cents(a.interest, 7083.3333333333);
    cents(a.dailyInterest, 416.6666666667);
    rate(a.yearCostRate, 0.063368055556);
    rate(ear, 0.064321814606);
    expect(a.notes).toEqual([]);
  });

  it("a balance given across a leap day: $1,750,000 of a $1,800,000 loan at 7.1% on actual-365, 2028-02-20 to 2028-03-05", () => {
    const { a, ear } = run(1_800_000, 0.071, "actual-365", "2028-02-20", "2028-03-05", 1_750_000);
    expect(a.actualDays).toBe(14);
    expect(a.balance).toBe(1_750_000);
    cents(a.interest, 4765.7534246575);
    cents(a.dailyInterest, 340.4109589041);
    rate(ear, 0.073356638104);
  });

  it("exactly 366 days across 2028-02-29 on actual-365: $500,000 at 8%, 2027-06-01 to 2028-06-01", () => {
    const { a, ear } = run(500_000, 0.08, "actual-365", "2027-06-01", "2028-06-01");
    expect(a.actualDays).toBe(366);
    expect(a.countedDays).toBe(366);
    cents(a.interest, 40109.5890410959); // 366 ÷ 365 of a year's $40,000
    cents(a.dailyInterest, 109.5890410959);
    rate(ear, 0.082999506808);
  });

  it("a 31st to a 31st on 30-360: $3,200,000 at 6.75%, 2027-01-31 to 2027-03-31", () => {
    const { a } = run(3_200_000, 0.0675, "30-360", "2027-01-31", "2027-03-31");
    expect(a.actualDays).toBe(59);
    expect(a.countedDays).toBe(60);
    cents(a.interest, 36000);
    cents(a.dailyInterest, 600);
    expect(a.notes).toHaveLength(1); // was 2: since the finish pass both 31sts share one note
    expect(a.notes[0]?.startsWith("2027-01-31 and 2027-03-31 are each a 31st")).toBe(true);
  });

  it("the 30th to the 31st of one month on 30-360 counts no days: $1,000,000 at 6%, 2027-05-30 to 2027-05-31", () => {
    const { a } = run(1_000_000, 0.06, "30-360", "2027-05-30", "2027-05-31");
    expect(a.actualDays).toBe(1);
    expect(a.countedDays).toBe(0);
    expect(a.interest).toBe(0);
    cents(a.dailyInterest, 166.6666666667);
    expect(a.notes).toHaveLength(1);
  });

  it("thirty-day-month counts and notes on twelve date pairs that touch month ends", () => {
    // [from, to, actual days, days counted, a note expected]
    const pairs: Array<[string, string, number, number, boolean]> = [
      ["2027-01-31", "2027-02-28", 28, 28, true],
      ["2027-01-30", "2027-03-01", 30, 31, false],
      ["2027-02-28", "2027-03-31", 31, 32, true],
      ["2028-02-29", "2028-03-31", 31, 31, true],
      ["2027-03-31", "2027-04-30", 30, 30, true],
      ["2027-07-31", "2027-08-31", 31, 30, true],
      ["2027-02-27", "2027-03-27", 28, 30, false],
      ["2027-10-15", "2027-11-30", 46, 45, false],
      ["2027-12-31", "2028-01-31", 31, 30, true],
      ["2028-02-28", "2028-03-28", 29, 30, true],
      ["2027-05-30", "2027-05-31", 1, 0, true],
      ["2027-06-30", "2027-07-31", 31, 30, true],
    ];
    for (const [from, to, actual, counted, note] of pairs) {
      const { a } = run(1_000_000, 0.06, "30-360", from, to);
      expect([from, to, a.actualDays, a.countedDays, a.notes.length > 0]).toEqual([from, to, actual, counted, note]);
      cents(a.interest, (1_000_000 * 0.06 * counted) / 360);
    }
  });

  it("the example line names the dates block the worked example carries", () => {
    expect(loanPaymentsInfo.exampleLine).toBe("$1,500,000 at 7.00%, 30-year amortization, 10-year term; interest from 2027-03-12 to 2027-04-01 on an example actual/360 basis");
  });
});

// ---------- what a person reads on the page ----------
//
// Finish pass 2026-11-14: wording, labels and one formatter. No figure moved. The
// rates below were recomputed in Python (float and the decimal module): 7% and
// 7.125% × 365 ÷ 360 are 7.097222% and 7.223958%, and 7% and 11.5% compounded
// monthly are 7.229008% and 12.125933%.
describe("loan-payments: what a person reads on the page", () => {
  const r = runLoanPayments(LOAN_PAYMENTS_EXAMPLE);
  const cells = (basis: AccrualBasis, stated = 0.07) => loanPaymentsAccrualFigures(stated, between(basis, "2027-03-12", "2027-04-01", { rate: stated }));

  it("a rate is printed with the decimals it needs: two when two are exact, four where two would round", () => {
    expect(loanPaymentsRate(0.07)).toBe("7.00%");
    expect(loanPaymentsRate(0.071)).toBe("7.10%");
    expect(loanPaymentsRate(0.0525)).toBe("5.25%");
    expect(loanPaymentsRate(0.3)).toBe("30.00%");
    expect(loanPaymentsRate(0)).toBe("0.00%");
    expect(loanPaymentsRate(0.07125)).toBe("7.1250%"); // two decimals would round the last digit away
    expect(loanPaymentsRate((0.07 * 365) / 360)).toBe("7.0972%"); // two decimals would say 7.10%, beside a stated 7.00%
    expect(pct((0.07 * 365) / 360)).toBe("7.10%");
    expect(loanPaymentsRate(r.effectiveAnnualRate)).toBe("7.2290%");
    // wherever it prints four decimals it agrees with the trace
    expect(loanPaymentsRate(r.effectiveAnnualRate)).toBe(r.trace.find((x) => x.label === "Effective annual rate")?.value);
    expect(loanPaymentsRate(r.accrual?.yearCostRate ?? Number.NaN)).toBe(r.trace.find((x) => x.label === "Between dates: a year's cost on the basis")?.value);
  });

  it("the line beside the structures table names the effective annual rate and says how it compounds", () => {
    expect(loanPaymentsRateNote(r)).toBe("payments monthly · effective annual rate 7.2290%: the stated rate compounded monthly, before fees");
    expect(loanPaymentsRateNote(runLoanPayments(ex({ rate: 0.115 })))).toBe("payments monthly · effective annual rate 12.1259%: the stated rate compounded monthly, before fees");
    expect(loanPaymentsRateNote(runLoanPayments(ex({ rate: 0 })))).toBe("payments monthly · effective annual rate 0.00%: the stated rate compounded monthly, before fees");
    expect(loanPaymentsRateNote(runLoanPayments(BEFORE))).toBe(loanPaymentsRateNote(r)); // always on, with or without the dates block
  });

  it("the section for the two dates names the basis as a person reads it", () => {
    expect(loanPaymentsAccrualNote(between("actual-360", "2027-03-12", "2027-04-01"))).toBe("actual/360 · first day counted, last not: check the loan documents");
    expect(loanPaymentsAccrualNote(between("actual-365", "2027-03-12", "2027-04-01"))).toBe("actual/365 · first day counted, last not: check the loan documents");
    expect(loanPaymentsAccrualNote(between("30-360", "2027-03-12", "2027-04-01"))).toBe("30/360 · first day counted, last not: check the loan documents");
  });

  it("the year's cost says what it is, and names the stated rate only when the two differ", () => {
    expect(cells("actual-360")).toEqual([
      { label: "Interest for the stretch", value: "$5,833.33", sub: "2027-03-12 to 2027-04-01" },
      { label: "A day's interest (per diem)", value: "$291.67", sub: "on $1,500,000, unchanged" },
      { label: "Days counted", value: "20", sub: "the actual days" },
      { label: "A year's cost on this basis", value: "7.0972%", sub: "simple interest for 365 days; the stated rate is 7.00%" },
    ]);
    for (const basis of ["actual-365", "30-360"] as const) {
      expect(cells(basis)[3]).toEqual({ label: "A year's cost on this basis", value: "7.00%", sub: "simple interest for 365 days" });
    }
    expect(cells("30-360")[2]).toEqual({ label: "Days counted", value: "19", sub: "30-day months; 20 actual days" });
    // a stated rate that needs more than two decimals keeps them, in the cell and under it
    expect(cells("actual-360", 0.07125)[3]).toEqual({ label: "A year's cost on this basis", value: "7.2240%", sub: "simple interest for 365 days; the stated rate is 7.1250%" });
    expect(cells("actual-365", 0.07125)[3]).toEqual({ label: "A year's cost on this basis", value: "7.1250%", sub: "simple interest for 365 days" });
    // at a zero rate the two are equal on every basis
    expect(cells("actual-360", 0)[3]).toEqual({ label: "A year's cost on this basis", value: "0.00%", sub: "simple interest for 365 days" });
  });

  it("the page prints one spelling of each basis, the group's one-sentence note and a sub-label under each yearly figure", () => {
    const html = renderToStaticMarkup(createElement(LoanPaymentsCalculator, { tool: "calc_run" }));
    // the words between the tags, as a person reads them
    const text = html
      .replace(/<[^>]*>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&");
    for (const option of ["Leave this check out", "actual/360: actual days over 360", "actual/365: actual days over 365", "30/360: 30-day months over 360"]) expect(text).toContain(option);
    // the ids are still what the select sends
    for (const id of ACCRUAL_BASES) expect(html).toContain(`value="${id}"`);
    expect(text).toContain('Read the basis off the loan documents, or choose "Leave this check out". The payment tables above use the rate over 12 whatever basis is chosen here.');
    // the dates block is a fold that starts closed: its fields are in the page all the same
    expect(html).toContain("Interest between two dates (optional)");
    expect(text).toContain("not counted here; some loan documents count it");
    expect(text).toContain("payments monthly · effective annual rate 7.2290%: the stated rate compounded monthly, before fees");
    expect(text).toContain("actual/360 · first day counted, last not: check the loan documents");
    expect(text).toContain("simple interest for 365 days; the stated rate is 7.00%");
    expect(text).toContain("actual/360 charges the actual days");
    expect(text).not.toMatch(/actual-36[05]|30-360|Actual\/|effective a year|off the note/);
  });

  it("the lede says the page checks a day's interest, and no pinned entry runs long", () => {
    const { purpose, pinned } = loanPaymentsInfo.meta;
    expect(purpose.startsWith("Compare level, equal-principal, interest-only and stepped payments on one loan:")).toBe(true);
    expect(purpose).toContain("check a day's interest or the interest between two dates on the loan's day-count basis");
    // the dates block has two entries of its own, where it had one of about ninety words
    expect(pinned).toHaveLength(6);
    expect(pinned[4]?.startsWith("On the worked example, the interest between two dates")).toBe(true);
    expect(pinned[5]?.startsWith("The days and the interest are pinned the same way")).toBe(true);
    for (const p of pinned) expect(p.split(/\s+/).length, p).toBeLessThanOrEqual(60);
  });
});
