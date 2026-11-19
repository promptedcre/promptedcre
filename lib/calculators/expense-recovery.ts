import { z } from "zod";
import { defineModule } from "./module";
import { num, pct, type TraceLine, usd } from "./trace";

// What one tenant reimburses of a building's recoverable operating expenses, year by
// year, under a net, base-year, expense-stop or gross lease, with an optional yearly cap
// on the growth of the expenses passed through; and percentage rent over a breakpoint.
// No gross-up for occupancy; the cap is not cumulative. Pure: no I/O, no clock.

export const LEASE_TYPES = ["net", "baseYear", "expenseStop", "gross"] as const;
export type LeaseType = (typeof LEASE_TYPES)[number];

export const LEASE_TYPE_LABEL: Record<LeaseType, string> = {
  net: "net lease",
  baseYear: "base-year lease",
  expenseStop: "expense-stop lease",
  gross: "gross lease",
};

export const MAX_YEARS = 10;

const percentageRent = z
  .object({
    sales: z.number().min(0).describe("the tenant's gross sales for the lease year, dollars"),
    rate: z.number().gt(0).lt(1).describe("the percentage of sales over the breakpoint owed as rent, as a decimal: 0.05 is 5%"),
    breakpoint: z
      .number()
      .min(0)
      .nullable()
      .describe("the stated breakpoint, dollars of sales a year; null to use the natural breakpoint (base rent divided by the percentage)"),
    baseRent: z
      .number()
      .min(0)
      .nullable()
      .describe("the year's base rent, dollars; needed for the natural breakpoint, null when a breakpoint is stated"),
  })
  .strict();

export const expenseRecoveryInput = z
  .object({
    buildingArea: z.number().positive().describe("rentable area of the building, square feet; the denominator of the pro rata share"),
    tenantArea: z.number().positive().describe("the tenant's rentable area, square feet; at most the building's area"),
    expenses: z
      .array(z.number().min(0).describe("recoverable operating expenses for the year, dollars"))
      .min(1)
      .max(MAX_YEARS)
      .describe("the building's recoverable operating expenses for each lease year, dollars a year, year 1 first; 1 to 10 years"),
    leaseType: z
      .enum(LEASE_TYPES)
      .describe(
        'how expenses are shared: "net" (the tenant pays its share of all of them), "baseYear" (its share of the increase over a base year), "expenseStop" (its share above a stop per square foot) or "gross" (none)',
      ),
    baseYearExpenses: z
      .number()
      .min(0)
      .nullable()
      .describe("base-year leases only: the base year's recoverable expenses, dollars; null uses year 1's expenses. Ignored for other lease types"),
    expenseStop: z
      .number()
      .min(0)
      .nullable()
      .describe("expense-stop leases only: the stop, dollars per square foot of building area a year; required for that lease type and ignored for the others"),
    cap: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .describe("yearly cap on the increase in the expenses passed through, as a decimal: 0.05 is 5%; not cumulative; null for no cap"),
    percentageRent: percentageRent.nullable().describe("a percentage rent clause: sales, the percentage and the breakpoint; null for none"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.tenantArea > d.buildingArea) {
      ctx.addIssue({ code: "custom", message: "the tenant's area cannot be more than the building's area", path: ["tenantArea"] });
    }
    if (d.leaseType === "expenseStop" && d.expenseStop === null) {
      ctx.addIssue({ code: "custom", message: "an expense-stop lease needs the stop, in dollars per square foot", path: ["expenseStop"] });
    }
    const p = d.percentageRent;
    if (p && p.breakpoint === null && p.baseRent === null) {
      ctx.addIssue({ code: "custom", message: "enter a breakpoint, or the base rent to work out the natural breakpoint", path: ["percentageRent", "baseRent"] });
    }
  });

export type ExpenseRecoveryInput = z.infer<typeof expenseRecoveryInput>;

export type RecoveryYear = {
  year: number;
  // the building's expenses as entered
  expenses: number;
  // the expenses after the cap (equal to expenses with no cap)
  passedThrough: number;
  // pro rata share × expenses: the tenant's part of the building's cost
  tenantShare: number;
  // what the tenant reimburses, after the cap; never negative
  reimbursement: number;
  // what it would reimburse with no cap
  reimbursementUncapped: number;
  // tenantShare − reimbursement: the part of the tenant's share the landlord pays
  landlordBears: number;
  // reimbursementUncapped − reimbursement
  capEffect: number;
};

export type PercentageRentResult = {
  sales: number;
  rate: number;
  breakpoint: number;
  breakpointKind: "stated" | "natural";
  salesOverBreakpoint: number;
  overage: number;
};

export type ExpenseRecoveryResult = {
  leaseType: LeaseType;
  proRataShare: number;
  // the base used on a base-year lease, else null
  baseYearExpenses: number | null;
  // the stop in total dollars (stop × building area) on a stop lease, else null
  stopTotal: number | null;
  capped: boolean;
  years: RecoveryYear[];
  totals: { expenses: number; tenantShare: number; reimbursement: number; reimbursementUncapped: number; landlordBears: number; capEffect: number };
  // null when there is no clause
  percentageRent: PercentageRentResult | null;
  notes: string[];
  trace: TraceLine[];
};

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function runExpenseRecovery(raw: ExpenseRecoveryInput): ExpenseRecoveryResult {
  const d = expenseRecoveryInput.parse(raw);
  const trace: TraceLine[] = [];
  const notes: string[] = [];
  const area = (x: number) => `${num(x, 0)} SF`;

  const p = d.tenantArea / d.buildingArea;
  trace.push({ label: "Pro rata share", formula: `${area(d.tenantArea)} ÷ ${area(d.buildingArea)}`, value: pct(p, 4) });

  const first = d.expenses[0] ?? 0;
  const base = d.leaseType === "baseYear" ? (d.baseYearExpenses ?? first) : null;
  if (base !== null) {
    trace.push({ label: "Base-year expenses", formula: d.baseYearExpenses === null ? "none entered: year 1's expenses" : "as entered", value: usd(base) });
  }
  const stop = d.leaseType === "expenseStop" ? (d.expenseStop ?? 0) : null;
  const stopTotal = stop === null ? null : stop * d.buildingArea;
  if (stop !== null && stopTotal !== null) {
    trace.push({ label: "Expense stop in dollars", formula: `${usd(stop)}/SF × ${area(d.buildingArea)}`, value: usd(stopTotal) });
  }

  // What the tenant reimburses on a year's expenses e (capped or not), by lease type.
  const reimburse = (e: number): { amount: number; formula: string } => {
    switch (d.leaseType) {
      case "net":
        return { amount: p * e, formula: `${pct(p, 4)} × ${usd(e)}` };
      case "baseYear": {
        const b = base ?? 0;
        return { amount: p * Math.max(0, e - b), formula: `${pct(p, 4)} × max(0, ${usd(e)} − ${usd(b)} base)` };
      }
      case "expenseStop": {
        const s = stop ?? 0;
        const perSf = e / d.buildingArea;
        return { amount: Math.max(0, perSf - s) * d.tenantArea, formula: `max(0, ${usd(perSf)}/SF − ${usd(s)}/SF stop) × ${area(d.tenantArea)}` };
      }
      case "gross":
        return { amount: 0, formula: "gross lease: the tenant reimburses nothing" };
    }
  };

  const capped = d.cap !== null;
  const years: RecoveryYear[] = [];
  let prevPassed = 0;
  d.expenses.forEach((e, i) => {
    const year = i + 1;
    // Not cumulative: each year's pass-through grows at most the cap over last year's pass-through.
    let passedThrough = e;
    if (d.cap !== null && i > 0) {
      passedThrough = Math.min(e, prevPassed * (1 + d.cap));
      trace.push({ label: `Year ${year} expenses passed through`, formula: `min(${usd(e)}, ${usd(prevPassed)} × (1 + ${pct(d.cap)}))`, value: usd(passedThrough) });
    }
    prevPassed = passedThrough;

    const withCap = reimburse(passedThrough);
    const noCap = reimburse(e);
    trace.push({ label: `Year ${year} reimbursement`, formula: withCap.formula, value: usd(withCap.amount) });
    if (capped) trace.push({ label: `Year ${year} reimbursement with no cap`, formula: noCap.formula, value: usd(noCap.amount) });

    const tenantShare = p * e;
    const landlordBears = tenantShare - withCap.amount;
    trace.push({ label: `Year ${year} landlord bears`, formula: `${pct(p, 4)} × ${usd(e)} − ${usd(withCap.amount)}`, value: usd(landlordBears) });

    const capEffect = noCap.amount - withCap.amount;
    if (capped) trace.push({ label: `Year ${year} effect of the cap`, formula: `${usd(noCap.amount)} − ${usd(withCap.amount)}`, value: usd(capEffect) });

    years.push({ year, expenses: e, passedThrough, tenantShare, reimbursement: withCap.amount, reimbursementUncapped: noCap.amount, landlordBears, capEffect });
  });

  const totals = {
    expenses: sumOf(years.map((y) => y.expenses)),
    tenantShare: sumOf(years.map((y) => y.tenantShare)),
    reimbursement: sumOf(years.map((y) => y.reimbursement)),
    reimbursementUncapped: sumOf(years.map((y) => y.reimbursementUncapped)),
    landlordBears: sumOf(years.map((y) => y.landlordBears)),
    capEffect: sumOf(years.map((y) => y.capEffect)),
  };
  const over = years.length === 1 ? "year 1" : `years 1 to ${years.length}`;
  trace.push({ label: "Total reimbursement", formula: `sum of ${over}`, value: usd(totals.reimbursement) });
  trace.push({ label: "Total the landlord bears", formula: `sum of ${over}`, value: usd(totals.landlordBears) });
  if (capped) trace.push({ label: "Total effect of the cap", formula: `${usd(totals.reimbursementUncapped)} − ${usd(totals.reimbursement)}`, value: usd(totals.capEffect) });

  let pr: PercentageRentResult | null = null;
  if (d.percentageRent) {
    const c = d.percentageRent;
    let breakpoint: number;
    let breakpointKind: "stated" | "natural";
    if (c.breakpoint !== null) {
      breakpoint = c.breakpoint;
      breakpointKind = "stated";
      trace.push({ label: "Breakpoint", formula: "stated in the lease", value: usd(breakpoint) });
    } else {
      // the refinement guarantees a base rent when no breakpoint is stated
      const baseRent = c.baseRent ?? 0;
      breakpoint = baseRent / c.rate;
      breakpointKind = "natural";
      trace.push({ label: "Natural breakpoint", formula: `${usd(baseRent)} base rent ÷ ${pct(c.rate)}`, value: usd(breakpoint) });
    }
    const salesOverBreakpoint = Math.max(0, c.sales - breakpoint);
    trace.push({ label: "Sales over the breakpoint", formula: `max(0, ${usd(c.sales)} − ${usd(breakpoint)})`, value: usd(salesOverBreakpoint) });
    const overage = c.rate * salesOverBreakpoint;
    trace.push({ label: "Percentage rent", formula: `${pct(c.rate)} × ${usd(salesOverBreakpoint)}`, value: usd(overage) });
    if (salesOverBreakpoint === 0) notes.push(`Sales of ${usd(c.sales, false)} do not pass the breakpoint of ${usd(breakpoint, false)}, so no percentage rent is due.`);
    pr = { sales: c.sales, rate: c.rate, breakpoint, breakpointKind, salesOverBreakpoint, overage };
  }

  if (d.leaseType === "gross") notes.push("On a gross lease the tenant reimburses nothing: the landlord bears all of the tenant's share.");
  if (d.leaseType === "baseYear" && d.baseYearExpenses === null) notes.push("The base year is year 1, so year 1's reimbursement is zero.");
  if (capped && totals.capEffect > 0) notes.push(`The cap holds back ${usd(totals.capEffect, false)} the tenant would otherwise reimburse.`);

  return {
    leaseType: d.leaseType,
    proRataShare: p,
    baseYearExpenses: base,
    stopTotal,
    capped,
    years,
    totals,
    percentageRent: pr,
    notes,
    trace,
  };
}

// Synthetic: round, made-up figures for a fictional building. Not a real deal and not a market term.
export const EXPENSE_RECOVERY_EXAMPLE: ExpenseRecoveryInput = {
  buildingArea: 80_000,
  tenantArea: 24_000,
  expenses: [400_000, 420_000, 450_000, 460_000],
  leaseType: "baseYear",
  baseYearExpenses: null,
  expenseStop: null,
  cap: 0.05,
  percentageRent: { sales: 7_000_000, rate: 0.05, breakpoint: null, baseRent: 300_000 },
};

export const expenseRecoveryModule = defineModule({ id: "expense-recovery", input: expenseRecoveryInput, run: runExpenseRecovery, example: EXPENSE_RECOVERY_EXAMPLE });
