import { describe, expect, it } from "vitest";
import { annualSchedule, DEBT_EXAMPLE, sizeDebt } from "@/lib/calculators/debt";
import { RETURNS_EXAMPLE, runReturns } from "@/lib/calculators/returns";

// The shared year-by-year schedule stops at payoff: the balance never goes below
// zero, and a year after the last payment shows no payment.
// Expected values computed 2026-11-13 in Python with decimal (40 digits), by stepping
// the balance month by month: $1,000,000 at 6% (0.5% a month), 60-month amortization,
// level payment $19,332.80152942791838, total interest $159,968.09176567510,
// interest in the last amortizing year $7,367.11072146764.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};

describe("annualSchedule stops at payoff", () => {
  it("a schedule longer than the amortization: the balance closes at zero and later years pay nothing", () => {
    const s = annualSchedule(1_000_000, 0.06, 5, 0, 8);
    expect(s).toHaveLength(8);
    cents(s[0]?.payment, 12 * 19_332.801529427918);
    cents(s[4]?.interest, 7_367.110721467643);
    expect(s[4]?.endBalance).toBe(0);
    for (const y of s.slice(5)) {
      expect(y.beginBalance).toBe(0);
      expect(y.interest).toBe(0);
      expect(y.principal).toBe(0);
      expect(y.payment).toBe(0);
      expect(y.endBalance).toBe(0);
    }
    expect(s.every((y) => y.endBalance >= 0 && y.principal >= 0)).toBe(true);
    // Money in equals money out: principal repaid is the loan, and the interest is the closed form's.
    cents(s.reduce((a, y) => a + y.principal, 0), 1_000_000);
    cents(s.reduce((a, y) => a + y.interest, 0), 159_968.0917656751);
  });

  it("interest-only years first: payoff lands at the end of interest-only plus amortization", () => {
    const s = annualSchedule(1_000_000, 0.06, 5, 2, 9);
    cents(s[0]?.payment, 60_000);
    cents(s[1]?.payment, 60_000);
    cents(s[2]?.payment, 12 * 19_332.801529427918);
    expect(s[6]?.endBalance).toBe(0);
    expect(s[7]?.payment).toBe(0);
    expect(s[8]?.payment).toBe(0);
    cents(s.reduce((a, y) => a + y.principal, 0), 1_000_000);
  });

  it("a schedule that ends exactly at payoff closes at exactly zero; one that ends before it is unchanged", () => {
    expect(annualSchedule(1_000_000, 0.06, 5, 0, 5)[4]?.endBalance).toBe(0);
    const short = annualSchedule(1_000_000, 0.06, 5, 0, 4);
    cents(short[3]?.endBalance, 224_626.5076316674);
  });

  it("a zero rate pays the loan down in equal slices and then stops", () => {
    const s = annualSchedule(120_000, 0, 2, 0, 3);
    cents(s[0]?.principal, 60_000);
    cents(s[1]?.principal, 60_000);
    expect(s[1]?.endBalance).toBe(0);
    expect(s[2]?.payment).toBe(0);
  });

  it("an interest-only loan never amortizes, however long the schedule", () => {
    const s = annualSchedule(1_000_000, 0.06, 0, 0, 12);
    expect(s.every((y) => y.endBalance === 1_000_000)).toBe(true);
    cents(s[11]?.payment, 60_000);
  });
});

describe("callers of the schedule past payoff", () => {
  it("debt sizing: a term past the end of amortization owes nothing at maturity, never a negative balloon", () => {
    const r = sizeDebt({ ...DEBT_EXAMPLE, amortYears: 5, termYears: 10, ioYears: 2 });
    expect(r.balloon).toBe(0);
    expect(r.schedule[6]?.endBalance).toBe(0);
    expect(r.schedule.slice(7).every((y) => y.payment === 0 && y.endBalance === 0)).toBe(true);
    const line = r.trace.find((l) => l.label === "Balance due at maturity");
    expect(line?.value).toBe("$0.00");
    expect(line?.formula).toContain("nothing is left");
  });

  it("debt sizing's worked example still uses the closed-form balloon", () => {
    const r = sizeDebt(DEBT_EXAMPLE);
    expect(r.trace.find((l) => l.label === "Balance due at maturity")?.formula).toMatch(/^FV\(/);
    expect(r.balloon).toBeGreaterThan(0);
  });

  it("returns: a hold past payoff pays no debt service after it and no payoff at sale", () => {
    const r = runReturns({ ...RETURNS_EXAMPLE, holdYears: 7, amortYears: 5, ioYears: 0 });
    expect(r.years[5]?.debtService).toBe(0);
    expect(r.years[6]?.debtService).toBe(0);
    expect(r.years[6]?.loanPayoff).toBe(0);
    expect(r.years.every((y) => y.loanPayoff >= 0 && y.debtService >= 0)).toBe(true);
  });
});
