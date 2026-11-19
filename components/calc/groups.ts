// How /calculators groups the calculators: by the question a principal arrives with.
// At most five in a group. A live calculator that no group names is never dropped: it
// lands in a last group of its own, and a test fails until it is placed.

export type CalcGroup = { id: string; name: string; ids: string[] };

export const CALC_GROUPS: CalcGroup[] = [
  { id: "returns", name: "Returns and promote", ids: ["returns-sensitivity", "waterfall-promote", "npv-irr", "scenario-risk"] },
  { id: "debt", name: "Debt", ids: ["debt-sizing", "loan-payments", "rate-reset", "leverage"] },
  { id: "income", name: "Income and value", ids: ["income-value", "cap-rate", "replacement-reserves"] },
  { id: "leases", name: "Leases", ids: ["lease-rent", "expense-recovery", "lease-rollover"] },
  { id: "tax", name: "Tax, sale and deadlines", ids: ["after-tax", "sale-proceeds", "exchange-1031", "property-tax", "deadline-calendar"] },
];

const OTHER: CalcGroup = { id: "more", name: "More", ids: [] };

// The groups with their calculators, in each group's own order; empty groups are left out.
export function groupCalculators<T extends { id: string }>(list: T[]): Array<{ group: CalcGroup; items: T[] }> {
  const placed = new Set(CALC_GROUPS.flatMap((g) => g.ids));
  const out = CALC_GROUPS.map((group) => ({ group, items: group.ids.flatMap((id) => list.filter((x) => x.id === id)) }));
  const rest = list.filter((x) => !placed.has(x.id));
  if (rest.length > 0) out.push({ group: OTHER, items: rest });
  return out.filter((g) => g.items.length > 0);
}
