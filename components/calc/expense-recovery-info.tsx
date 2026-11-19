import { EXPENSE_RECOVERY_EXAMPLE, LEASE_TYPE_LABEL, runExpenseRecovery, type ExpenseRecoveryInput, type ExpenseRecoveryResult } from "@/lib/calculators/expense-recovery";
import { num, pct, usd } from "@/lib/calculators/trace";
import { count } from "./format";
import { HeadlineFigures, type Headline, type SplitSegment } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.
// Every figure is a field of the result; nothing is computed here but the words around it.

export function expenseRecoveryHeadline(r: ExpenseRecoveryResult): string {
  const years = count(r.years.length, "year");
  if (r.leaseType === "gross") return `Under a gross lease the tenant reimburses nothing; the landlord bears all ${usd(r.totals.tenantShare, false)} of its share over ${years}.`;
  const cap = r.capped && r.totals.capEffect > 0 ? `, ${usd(r.totals.capEffect, false)} less than with no cap` : "";
  return `Under a ${LEASE_TYPE_LABEL[r.leaseType]} the tenant reimburses ${usd(r.totals.reimbursement, false)} over ${years}${cap}.`;
}

export function expenseRecoveryFigures(d: ExpenseRecoveryInput, r: ExpenseRecoveryResult): { lead: Headline; rest: Headline[] } {
  const last = r.years[r.years.length - 1];
  const rest: Headline[] = [
    { label: "Pro rata share", value: pct(r.proRataShare), sub: `${num(d.tenantArea, 0)} of ${num(d.buildingArea, 0)} SF` },
    { label: "Landlord bears", value: usd(r.totals.landlordBears, false), sub: "of the tenant's share, all years" },
  ];
  if (last) rest.push({ label: `Reimbursement, year ${last.year}`, value: usd(last.reimbursement, false), sub: `on ${usd(last.passedThrough, false)} of expenses passed through` });
  if (r.capped) rest.push({ label: "Effect of the cap", value: usd(r.totals.capEffect, false), sub: "held back from the tenant, all years" });
  if (r.percentageRent) {
    const pr = r.percentageRent;
    rest.push({
      label: "Percentage rent",
      value: usd(pr.overage, false),
      sub: `${pct(pr.rate, 1)} over a ${pr.breakpointKind} breakpoint of ${usd(pr.breakpoint, false)}`,
    });
  }
  return {
    lead: { label: "Tenant reimburses, all years", value: usd(r.totals.reimbursement, false), sub: `${LEASE_TYPE_LABEL[r.leaseType]}, ${count(r.years.length, "year")}` },
    rest,
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function expenseRecoveryCells(d: ExpenseRecoveryInput, r: ExpenseRecoveryResult): Headline[] {
  const said = r.leaseType === "gross" ? ["Landlord bears"] : r.capped && r.totals.capEffect > 0 ? ["Effect of the cap"] : [];
  return expenseRecoveryFigures(d, r).rest.filter((h) => !said.includes(h.label));
}

// The tenant's share of the expenses over all years: what it reimburses and what the landlord
// bears. The two parts add to the whole by construction; null when the share is zero.
export function expenseRecoverySplit(r: ExpenseRecoveryResult): SplitSegment[] | null {
  if (!(r.totals.tenantShare > 0)) return null;
  return [
    { key: "tenant", label: "Tenant reimburses", value: r.totals.reimbursement, fill: "solid" },
    { key: "landlord", label: "Landlord bears", value: r.totals.landlordBears, fill: "outline" },
  ];
}

export const expenseRecoveryInfo: ModuleInfo = {
  meta: {
    purpose: "See what a tenant reimburses of the building's expenses under its lease, year by year, and the percentage rent its sales trigger.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "Every yearly figure in the worked example (expenses passed through under the cap, reimbursement with and without the cap, what the landlord bears and the totals) matches values computed independently in Python with exact fractions, as do the net and expense-stop leases on the same expenses and percentage rent over a natural and a stated breakpoint.",
      "In eight cases across all four lease types, reimbursement plus what the landlord bears equals the share times the expenses every year, reimbursement is never negative or above the uncapped figure, and no year passes through more growth than the cap.",
      "A net lease with no cap equals the share times the expenses; the base year reimburses nothing; percentage rent is zero at the natural breakpoint and rises by the percentage above it.",
      "A tenant taking the whole building, expenses below the stop or base, sales below the breakpoint, a zero cap, a gross lease and a single year each return what the method says, and bad input is refused in plain words.",
    ],
    tests: ["__tests__/calc-expense-recovery.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `${num(EXPENSE_RECOVERY_EXAMPLE.tenantArea, 0)} of ${num(EXPENSE_RECOVERY_EXAMPLE.buildingArea, 0)} SF, a ${LEASE_TYPE_LABEL[EXPENSE_RECOVERY_EXAMPLE.leaseType]}, ${count(EXPENSE_RECOVERY_EXAMPLE.expenses.length, "year")} of expenses${EXPENSE_RECOVERY_EXAMPLE.cap === null ? "" : `, a ${pct(EXPENSE_RECOVERY_EXAMPLE.cap, 0)} cap`}`,
  headline: () => expenseRecoveryHeadline(runExpenseRecovery(EXPENSE_RECOVERY_EXAMPLE)),
  preview: () => {
    const f = expenseRecoveryFigures(EXPENSE_RECOVERY_EXAMPLE, runExpenseRecovery(EXPENSE_RECOVERY_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest.filter((h) => h.label === "Effect of the cap" || h.label === "Percentage rent")} compact />;
  },
};
