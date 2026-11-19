import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { expenseRecoveryHeadline } from "@/components/calc/expense-recovery-info";
import { EXPENSE_RECOVERY_EXAMPLE, expenseRecoveryInput, runExpenseRecovery, type ExpenseRecoveryInput } from "@/lib/calculators/expense-recovery";

// The worked example's expected values were computed independently in Python on
// 2026-11-13 with exact fractions (fractions.Fraction): the stop lease figured in total
// dollars (share × max(0, expenses − stop × building area)) rather than per square foot,
// and the capped path built from a running limit, not by porting this module.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(0.005);
};
const each = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((a, i) => cents(a, expected[i] as number));
};

const ex = EXPENSE_RECOVERY_EXAMPLE;
const run = (over: Partial<ExpenseRecoveryInput>) => runExpenseRecovery({ ...ex, ...over });
const col = (r: ReturnType<typeof runExpenseRecovery>, k: "expenses" | "passedThrough" | "tenantShare" | "reimbursement" | "reimbursementUncapped" | "landlordBears" | "capEffect") =>
  r.years.map((y) => y[k]);

describe("expense-recovery worked example (pinned to Python)", () => {
  const r = runExpenseRecovery(ex);

  it("takes the pro rata share and caps the expenses passed through, not cumulatively", () => {
    expect(r.proRataShare).toBe(0.3);
    each(col(r, "passedThrough"), [400_000, 420_000, 441_000, 460_000]);
    cents(r.baseYearExpenses, 400_000);
    expect(r.stopTotal).toBeNull();
  });

  it("gives the base-year reimbursement with and without the cap, and what the landlord bears", () => {
    each(col(r, "reimbursement"), [0, 6_000, 12_300, 18_000]);
    each(col(r, "reimbursementUncapped"), [0, 6_000, 15_000, 18_000]);
    each(col(r, "capEffect"), [0, 0, 2_700, 0]);
    each(col(r, "tenantShare"), [120_000, 126_000, 135_000, 138_000]);
    each(col(r, "landlordBears"), [120_000, 120_000, 122_700, 120_000]);
    cents(r.totals.reimbursement, 36_300);
    cents(r.totals.reimbursementUncapped, 39_000);
    cents(r.totals.capEffect, 2_700);
    cents(r.totals.landlordBears, 482_700);
    cents(r.totals.tenantShare, 519_000);
  });

  it("works percentage rent over the natural breakpoint", () => {
    expect(r.percentageRent?.breakpointKind).toBe("natural");
    cents(r.percentageRent?.breakpoint, 6_000_000);
    cents(r.percentageRent?.salesOverBreakpoint, 1_000_000);
    cents(r.percentageRent?.overage, 50_000);
  });

  it("gives the net and stop leases on the same expenses", () => {
    const net = run({ leaseType: "net" });
    each(col(net, "reimbursement"), [120_000, 126_000, 132_300, 138_000]);
    each(col(net, "reimbursementUncapped"), [120_000, 126_000, 135_000, 138_000]);
    each(col(net, "landlordBears"), [0, 0, 2_700, 0]);
    cents(net.totals.reimbursement, 516_300);
    const stop = run({ leaseType: "expenseStop", expenseStop: 5.25 });
    cents(stop.stopTotal, 420_000);
    expect(stop.baseYearExpenses).toBeNull();
    each(col(stop, "reimbursement"), [0, 0, 6_300, 12_000]);
    each(col(stop, "reimbursementUncapped"), [0, 0, 9_000, 12_000]);
    cents(stop.totals.reimbursement, 18_300);
  });

  it("uses a stated breakpoint over the natural one", () => {
    const s = run({ percentageRent: { sales: 7_000_000, rate: 0.05, breakpoint: 6_500_000, baseRent: 300_000 } });
    expect(s.percentageRent?.breakpointKind).toBe("stated");
    cents(s.percentageRent?.overage, 25_000);
  });

  it("says what the tenant reimburses and what the cap saves in one sentence", () => {
    expect(expenseRecoveryHeadline(r)).toBe("Under a base-year lease the tenant reimburses $36,300 over 4 years, $2,700 less than with no cap.");
    expect(expenseRecoveryHeadline(run({ leaseType: "gross" }))).toBe("Under a gross lease the tenant reimburses nothing; the landlord bears all $519,000 of its share over 4 years.");
  });

  it("traces every figure in the order it was computed", () => {
    const labels = r.trace.map((t) => t.label);
    expect(labels.slice(0, 6)).toEqual([
      "Pro rata share",
      "Base-year expenses",
      "Year 1 reimbursement",
      "Year 1 reimbursement with no cap",
      "Year 1 landlord bears",
      "Year 1 effect of the cap",
    ]);
    expect(labels.slice(6, 11)).toEqual(["Year 2 expenses passed through", "Year 2 reimbursement", "Year 2 reimbursement with no cap", "Year 2 landlord bears", "Year 2 effect of the cap"]);
    expect(labels.slice(-7)).toEqual([
      "Year 4 effect of the cap",
      "Total reimbursement",
      "Total the landlord bears",
      "Total effect of the cap",
      "Natural breakpoint",
      "Sales over the breakpoint",
      "Percentage rent",
    ]);
    expect(r.trace.find((t) => t.label === "Year 3 expenses passed through")?.value).toBe("$441,000.00");
    expect(r.trace.find((t) => t.label === "Percentage rent")?.value).toBe("$50,000.00");
    expect(r.trace).toHaveLength(1 + 1 + 4 + 3 * 5 + 3 + 3);
  });
});

describe("expense-recovery invariants", () => {
  const cases: Array<Partial<ExpenseRecoveryInput>> = [
    {},
    { leaseType: "net" },
    { leaseType: "net", cap: null },
    { leaseType: "expenseStop", expenseStop: 5.25 },
    { leaseType: "expenseStop", expenseStop: 0, cap: 0.02 },
    { leaseType: "baseYear", baseYearExpenses: 430_000, cap: 0.03 },
    { leaseType: "gross" },
    { expenses: [500_000, 450_000, 520_000, 700_000, 690_000], cap: 0.04 },
  ];

  it("splits the tenant's share between the tenant and the landlord, every year and in total", () => {
    for (const c of cases) {
      const r = run(c);
      for (const y of r.years) {
        cents(y.reimbursement + y.landlordBears, y.tenantShare);
        cents(y.tenantShare, r.proRataShare * y.expenses);
        expect(y.reimbursement).toBeGreaterThanOrEqual(0);
        expect(y.landlordBears).toBeGreaterThanOrEqual(-1e-9);
        expect(y.reimbursement).toBeLessThanOrEqual(y.reimbursementUncapped + 1e-9);
        cents(y.capEffect, y.reimbursementUncapped - y.reimbursement);
      }
      cents(r.totals.reimbursement + r.totals.landlordBears, r.totals.tenantShare);
    }
  });

  it("never passes through more than the expenses, nor more growth than the cap", () => {
    for (const c of cases) {
      const r = run(c);
      const cap = { ...ex, ...c }.cap;
      r.years.forEach((y, i) => {
        expect(y.passedThrough).toBeLessThanOrEqual(y.expenses);
        const prev = r.years[i - 1];
        if (prev && cap !== null && prev.passedThrough > 0) expect(y.passedThrough / prev.passedThrough).toBeLessThanOrEqual(1 + cap + 1e-12);
        if (cap === null) expect(y.passedThrough).toBe(y.expenses);
      });
    }
  });

  it("on a net lease with no cap, equals the share times the expenses (the closed form)", () => {
    const r = run({ leaseType: "net", cap: null, percentageRent: null });
    each(col(r, "reimbursement"), [120_000, 126_000, 135_000, 138_000]);
    each(col(r, "landlordBears"), [0, 0, 0, 0]);
    expect(r.percentageRent).toBeNull();
    expect(r.trace.some((t) => t.label.includes("cap"))).toBe(false);
  });

  it("reimburses nothing in the base year itself", () => {
    expect(run({}).years[0]?.reimbursement).toBe(0);
    const stated = run({ baseYearExpenses: 420_000, cap: null });
    each(col(stated, "reimbursement"), [0, 0, 9_000, 12_000]);
  });

  it("owes no percentage rent at the natural breakpoint, and rises by the percentage above it", () => {
    const at = run({ percentageRent: { sales: 6_000_000, rate: 0.05, breakpoint: null, baseRent: 300_000 } });
    expect(at.percentageRent?.overage).toBe(0);
    cents((at.percentageRent?.rate ?? 0) * (at.percentageRent?.breakpoint ?? 0), 300_000);
    const a = run({ percentageRent: { sales: 6_400_000, rate: 0.05, breakpoint: null, baseRent: 300_000 } });
    const b = run({ percentageRent: { sales: 6_800_000, rate: 0.05, breakpoint: null, baseRent: 300_000 } });
    cents(a.percentageRent?.overage, 20_000);
    cents((b.percentageRent?.overage ?? 0) - (a.percentageRent?.overage ?? 0), 20_000);
  });
});

describe("expense-recovery edge cases", () => {
  it("gives a share of one when the tenant takes the whole building", () => {
    const r = run({ tenantArea: 80_000, leaseType: "net", cap: null });
    expect(r.proRataShare).toBe(1);
    each(col(r, "reimbursement"), [400_000, 420_000, 450_000, 460_000]);
  });

  it("reimburses zero, never less, when expenses sit below the stop", () => {
    const r = run({ leaseType: "expenseStop", expenseStop: 10, cap: null });
    each(col(r, "reimbursement"), [0, 0, 0, 0]);
    each(col(r, "landlordBears"), [120_000, 126_000, 135_000, 138_000]);
    const below = run({ expenses: [350_000], baseYearExpenses: 400_000, cap: null });
    expect(below.years[0]?.reimbursement).toBe(0);
  });

  it("owes no percentage rent when sales fall short of the breakpoint, and says so", () => {
    const r = run({ percentageRent: { sales: 5_500_000, rate: 0.05, breakpoint: null, baseRent: 300_000 } });
    expect(r.percentageRent?.overage).toBe(0);
    expect(r.percentageRent?.salesOverBreakpoint).toBe(0);
    expect(r.notes).toContain("Sales of $5,500,000 do not pass the breakpoint of $6,000,000, so no percentage rent is due.");
  });

  it("freezes the pass-through at year 1 with a zero cap", () => {
    const r = run({ leaseType: "net", cap: 0 });
    each(col(r, "passedThrough"), [400_000, 400_000, 400_000, 400_000]);
    each(col(r, "reimbursement"), [120_000, 120_000, 120_000, 120_000]);
    cents(r.totals.capEffect, 39_000);
  });

  it("leaves the landlord all of it on a gross lease", () => {
    const r = run({ leaseType: "gross" });
    each(col(r, "reimbursement"), [0, 0, 0, 0]);
    each(col(r, "landlordBears"), [120_000, 126_000, 135_000, 138_000]);
    expect(r.notes).toContain("On a gross lease the tenant reimburses nothing: the landlord bears all of the tenant's share.");
  });

  it("works one year, with no cap line and no percentage rent", () => {
    const r = run({ expenses: [300_000], leaseType: "net", cap: 0.05, percentageRent: null });
    expect(r.years).toHaveLength(1);
    cents(r.totals.reimbursement, 90_000);
    expect(r.trace.some((t) => t.label.endsWith("passed through"))).toBe(false);
    expect(r.trace.find((t) => t.label === "Total reimbursement")?.formula).toBe("sum of year 1");
  });

  it("ignores a stop or base given for another lease type", () => {
    const r = run({ leaseType: "net", expenseStop: 3, baseYearExpenses: 1, cap: null });
    each(col(r, "reimbursement"), [120_000, 126_000, 135_000, 138_000]);
    expect(r.stopTotal).toBeNull();
    expect(r.baseYearExpenses).toBeNull();
  });
});

describe("expense-recovery input", () => {
  const issues = (over: Record<string, unknown>) => {
    const p = expenseRecoveryInput.safeParse({ ...ex, ...over });
    expect(p.success).toBe(false);
    return p.error?.issues ?? [];
  };

  it("refuses a tenant larger than the building, in plain words", () => {
    const [i] = issues({ tenantArea: 90_000 });
    expect(i?.path).toEqual(["tenantArea"]);
    expect(plainIssue(i as NonNullable<typeof i>)).toBe("The tenant's area cannot be more than the building's area.");
  });

  it("asks for the stop on a stop lease, and for a breakpoint or base rent", () => {
    const [s] = issues({ leaseType: "expenseStop", expenseStop: null });
    expect(s?.path).toEqual(["expenseStop"]);
    expect(plainIssue(s as NonNullable<typeof s>)).toBe("An expense-stop lease needs the stop, in dollars per square foot.");
    const [b] = issues({ percentageRent: { sales: 1, rate: 0.05, breakpoint: null, baseRent: null } });
    expect(b?.path).toEqual(["percentageRent", "baseRent"]);
    expect(plainIssue(b as NonNullable<typeof b>)).toBe("Enter a breakpoint, or the base rent to work out the natural breakpoint.");
  });

  it("refuses no years, more than ten, negative expenses, a cap over 100% and a percentage of zero", () => {
    expect(plainIssue(issues({ expenses: [] })[0] as never)).toBe("Add at least one.");
    expect(plainIssue(issues({ expenses: Array(11).fill(1) })[0] as never)).toBe("At most 10.");
    const [neg] = issues({ expenses: [400_000, -1] });
    expect(neg?.path).toEqual(["expenses", 1]);
    expect(plainIssue(neg as never)).toBe("Cannot be negative.");
    expect(plainIssue(issues({ cap: 1.5 })[0] as never, "pct")).toBe("At most 100%.");
    expect(plainIssue(issues({ percentageRent: { sales: 1, rate: 0, breakpoint: 1, baseRent: null } })[0] as never, "pct")).toBe("Must be more than zero.");
    expect(issues({ buildingArea: 0 })[0]?.path).toEqual(["buildingArea"]);
    expect(issues({ leaseType: "modifiedGross" })[0]?.path).toEqual(["leaseType"]);
    expect(issues({ percentageRent: { sales: 1, rate: 0.05, breakpoint: 1, baseRent: null, extra: 1 } })[0]?.code).toBe("unrecognized_keys");
  });
});

// Second review (math-review-b, 2026-11-13): the reviewer's own inputs, pinned to a separate
// Python model written before the TypeScript was read (scratch er.py).
describe("second review: an expense-stop lease with a 5% cap", () => {
  const r = runExpenseRecovery({
    buildingArea: 60_000,
    tenantArea: 15_000,
    expenses: [420_000, 445_200, 471_912, 500_226.72],
    leaseType: "expenseStop",
    baseYearExpenses: null,
    expenseStop: 7.25,
    cap: 0.05,
    percentageRent: { sales: 2_500_000, rate: 0.05, breakpoint: null, baseRent: 100_000 },
  });

  it("matches the reviewer's model: the cap compounds on the capped figure, not on year 1", () => {
    each(col(r, "passedThrough"), [420_000, 441_000, 463_050, 486_202.5]);
    each(col(r, "reimbursement"), [0, 1_500, 7_012.5, 12_800.625]);
    each(col(r, "reimbursementUncapped"), [0, 2_550, 9_228, 16_306.68]);
    each(col(r, "landlordBears"), [105_000, 109_800, 110_965.5, 112_256.055]);
    cents(r.percentageRent?.breakpoint, 2_000_000);
    cents(r.percentageRent?.overage, 25_000);
  });
});
