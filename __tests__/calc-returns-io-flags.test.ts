import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annualSchedule } from "@/lib/calculators/debt";
import { RETURNS_EXAMPLE, runReturns, type ReturnsInput } from "@/lib/calculators/returns";

// The returns calculator gained two outputs that say which hold years are interest
// only and whether the year-1 cash-on-cash was computed on an interest-only payment.
// They add; they change nothing. The fixture holds the full result of the calculator
// as committed at ce38cf8, before the flags, for six inputs (captured once, with every
// value checked to survive JSON exactly). Each new result must match it field by field
// and differ only by the two new keys. No git checkout is needed at test time.

type Snapshot = { input: ReturnsInput; result: Record<string, unknown> };
const BEFORE = JSON.parse(
  readFileSync(join(process.cwd(), "__tests__", "fixtures", "returns-before-io-flags.json"), "utf8"),
) as Record<string, Snapshot>;

const CASES: Array<[string, ReturnsInput]> = [
  ["worked-example", RETURNS_EXAMPLE],
  ["io-2-hold-5", { ...RETURNS_EXAMPLE, ioYears: 2 }],
  ["io-10-hold-5", { ...RETURNS_EXAMPLE, ioYears: 10, holdYears: 5 }],
  ["never-amortizes-hold-7", { ...RETURNS_EXAMPLE, amortYears: 0, ioYears: 0, holdYears: 7 }],
  ["no-loan-io-3", { ...RETURNS_EXAMPLE, loan: 0, ioYears: 3 }],
  ["paid-off-amort-5-hold-7-io-1", { ...RETURNS_EXAMPLE, holdYears: 7, amortYears: 5, ioYears: 1 }],
];

const NEW_KEYS = ["interestOnlyYears", "cashOnCashYear1InterestOnly"];

describe("returns: interest-only flags change no existing figure", () => {
  it("has a snapshot for every case, taken with the same input", () => {
    expect(Object.keys(BEFORE).sort()).toEqual(CASES.map(([k]) => k).sort());
    for (const [k, input] of CASES) expect(BEFORE[k]?.input).toStrictEqual(input);
  });

  for (const [name, input] of CASES) {
    it(`matches the calculator as committed before the flags, field by field: ${name}`, () => {
      const before = BEFORE[name]!.result;
      expect(Object.keys(before).some((k) => NEW_KEYS.includes(k))).toBe(false);
      const after = runReturns(input) as unknown as Record<string, unknown>;
      expect(Object.keys(after).sort()).toEqual([...Object.keys(before), ...NEW_KEYS].sort());
      for (const key of Object.keys(before)) expect(after[key], key).toStrictEqual(before[key]);
    });
  }
});

describe("returns: interest-only flags", () => {
  it("flags min(ioYears, holdYears) years, counted from year 1, on an amortizing loan", () => {
    for (const holdYears of [1, 3, 5, 10]) {
      for (const ioYears of [0, 1, 2, 5, 12]) {
        const r = runReturns({ ...RETURNS_EXAMPLE, holdYears, ioYears });
        const n = Math.min(ioYears, holdYears);
        expect(r.interestOnlyYears).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        expect(r.cashOnCashYear1InterestOnly).toBe(n >= 1);
      }
    }
  });

  it("flags every hold year when the loan never amortizes, and none with no loan", () => {
    expect(runReturns({ ...RETURNS_EXAMPLE, amortYears: 0, ioYears: 0, holdYears: 7 }).interestOnlyYears).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const none = runReturns({ ...RETURNS_EXAMPLE, loan: 0, ioYears: 3 });
    expect(none.interestOnlyYears).toEqual([]);
    expect(none.cashOnCashYear1InterestOnly).toBe(false);
  });

  it("agrees with the debt schedule: a flagged year pays no principal, an unflagged year with a balance does", () => {
    for (const [, input] of CASES) {
      const r = runReturns(input);
      if (input.loan === 0) continue;
      const schedule = annualSchedule(input.loan, input.rate, input.amortYears, input.ioYears, input.holdYears);
      for (const y of schedule) {
        if (r.interestOnlyYears.includes(y.year)) expect(Math.abs(y.principal)).toBeLessThan(1e-6);
        else if (y.beginBalance > 0) expect(y.principal).toBeGreaterThan(0);
      }
    }
  });

  // Pinned to Python (decimal, 40 digits): with two interest-only years the year-1 debt
  // service is 6,000,000 × 6.5% = 390,000.00, so the year-1 cash-on-cash is
  // (600,000 − 390,000) ÷ (10,000,000 × 1.02 − 6,000,000) = 5.00%, and year 3 pays
  // 12 × PMT(6.5%/12, 360, 6,000,000) = 455,088.98.
  it("pins the two-year interest-only case", () => {
    const r = runReturns({ ...RETURNS_EXAMPLE, ioYears: 2 });
    expect(r.interestOnlyYears).toEqual([1, 2]);
    expect(r.cashOnCashYear1InterestOnly).toBe(true);
    expect(r.years[0]?.debtService).toBeCloseTo(390_000, 6);
    expect(r.years[1]?.debtService).toBeCloseTo(390_000, 6);
    expect(r.cashOnCashYear1).toBeCloseTo(0.05, 12);
    expect(r.years[2]?.debtService).toBeCloseTo(455088.97691493388707, 6);
  });

  it("leaves the worked example unflagged", () => {
    const r = runReturns(RETURNS_EXAMPLE);
    expect(r.interestOnlyYears).toEqual([]);
    expect(r.cashOnCashYear1InterestOnly).toBe(false);
  });
});
