import { z } from "zod";
import { npv, pmt, pv } from "./finance";
import { defineModule } from "./module";
import { num, pct, type TraceLine, usd } from "./trace";

// One lease, month by month: base rent by lease year with its escalation, free
// rent at the start, the improvement allowance and the leasing commission, then
// the rent per square foot the landlord nets after those concessions, two ways.
// Rent is paid monthly in advance; escalations take effect on lease anniversaries;
// the improvement allowance and the commission are paid at signing (month 0).
// Base rent only: no expense recoveries. Nothing is rounded until it is shown.

export const ESCALATIONS = ["none", "percent", "step", "index"] as const;
export type Escalation = (typeof ESCALATIONS)[number];

export const leaseRentInput = z
  .object({
    area: z.number().int().positive().describe("rentable area leased, whole square feet"),
    rentPerSf: z.number().positive().describe("base rent in lease year 1, dollars per square foot per year"),
    termMonths: z
      .number()
      .int()
      .min(1)
      .max(600)
      .describe("lease term in whole months; a term that is not whole years ends with a partial lease year"),
    escalation: z
      .enum(ESCALATIONS)
      .describe(
        "how rent changes on each lease anniversary: none; percent (a fixed percent a year, compounding); step (a fixed dollar amount per square foot a year); index (an assumed yearly index change, held between the floor and cap)",
      ),
    escalationRate: z
      .number()
      .gt(-1)
      .max(1)
      .describe("percent: the yearly increase as a decimal, 0.03 is 3%; index: the assumed yearly index change as a decimal; ignored for none and step"),
    escalationStep: z
      .number()
      .min(-1000)
      .max(1000)
      .describe("step: dollars per square foot per year added on each lease anniversary (negative lowers the rent); ignored otherwise"),
    indexFloor: z
      .number()
      .gt(-1)
      .max(1)
      .nullable()
      .describe("index: the smallest yearly increase applied, as a decimal; null for no floor; ignored otherwise"),
    indexCap: z
      .number()
      .gt(-1)
      .max(1)
      .nullable()
      .describe("index: the largest yearly increase applied, as a decimal; null for no cap; ignored otherwise"),
    freeMonths: z
      .number()
      .int()
      .min(0)
      .describe("months of free base rent at the start of the term, whole months; must be fewer than the term"),
    tiPerSf: z.number().min(0).describe("tenant improvement allowance the landlord pays, dollars per square foot, paid at signing; 0 for none"),
    commissionShare: z
      .number()
      .min(0)
      .lt(1)
      .describe("leasing commission as a decimal share of the rent payable over the term (after free rent), paid at signing; 0.05 is 5%; 0 for none"),
    discountRate: z
      .number()
      .gt(-1)
      .max(1)
      .describe("the landlord's discount rate as an effective annual decimal, 0.08 is 8%; the monthly rate is (1 + rate)^(1/12) - 1"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.freeMonths >= d.termMonths) {
      ctx.addIssue({ code: "custom", path: ["freeMonths"], message: "free rent must end before the lease does: enter fewer months than the term" });
    }
    if (d.escalation === "index" && d.indexFloor !== null && d.indexCap !== null && d.indexFloor > d.indexCap) {
      ctx.addIssue({ code: "custom", path: ["indexCap"], message: "the cap cannot be below the floor" });
    }
    if (d.escalation === "step") {
      const years = Math.ceil(d.termMonths / 12);
      const last = d.rentPerSf + d.escalationStep * (years - 1);
      if (last < 0) {
        ctx.addIssue({ code: "custom", path: ["escalationStep"], message: `the step takes the rent below zero by lease year ${years}` });
      }
    }
  });

export type LeaseRentInput = z.infer<typeof leaseRentInput>;

export type LeaseYear = {
  year: number;
  months: number; // months of the term in this lease year: 12, or fewer in a partial last year
  rate: number; // base rent, dollars per square foot per year
  scheduled: number; // base rent scheduled for the months in this year, dollars
  freeMonths: number; // of those months, how many are free
  free: number; // base rent abated, dollars
  payable: number; // scheduled less free, dollars
};

export type LeaseRentResult = {
  leaseYears: number;
  lastYearMonths: number;
  appliedEscalation: number | null; // the yearly percent applied (percent or index); null for none and step
  years: LeaseYear[];
  totalRent: number; // base rent scheduled over the term
  freeRent: number;
  rentPayable: number; // total less free
  averageRent: number; // total rent per square foot per year of term
  ti: number;
  commission: number;
  concessions: number; // free rent + improvements + commission
  concessionsShare: number; // concessions ÷ total base rent
  netRent: number; // rent payable less improvements and commission
  // shares of the total base rent: free + improvements + commission + net = 1
  shares: { free: number; ti: number; commission: number; net: number };
  nerSimple: number; // net rent per square foot per year of term
  monthlyDiscountRate: number;
  pvRent: number; // rent payable discounted to signing, in advance
  pvLandlord: number; // pvRent less improvements and commission
  annuityFactor: number; // present value of 1 a month for the term, in advance
  levelMonthly: number; // the level monthly rent, in advance, with the landlord's present value
  nerPv: number; // that level rent per square foot per year
  trace: TraceLine[];
};

const ESC_LABEL: Record<Escalation, string> = {
  none: "no escalation",
  percent: "a fixed percent a year",
  step: "a fixed step a year",
  index: "an assumed index change",
};

export function escalationLabel(e: Escalation): string {
  return ESC_LABEL[e];
}

// $/SF figures carry two decimals on the page and four in the working, where a
// compounding rate is easier to check.
const perSf = (n: number) => `${n < 0 ? "-" : ""}$${num(Math.abs(n), 4)}/SF`;

export function runLeaseRent(raw: LeaseRentInput): LeaseRentResult {
  const d = leaseRentInput.parse(raw);
  const M = d.termMonths;
  const A = d.area;
  const leaseYears = Math.ceil(M / 12);
  const lastYearMonths = M - (leaseYears - 1) * 12;
  const trace: TraceLine[] = [];

  trace.push({
    label: "Lease years",
    formula: lastYearMonths === 12 ? `${M} months ÷ 12` : `${M} months: ${leaseYears - 1} full ${leaseYears - 1 === 1 ? "year" : "years"} and ${lastYearMonths} months`,
    value: lastYearMonths === 12 ? `${leaseYears}` : `${leaseYears}, the last partial`,
  });

  // The yearly percent applied: the fixed percent, or the index held between floor and cap.
  let appliedEscalation: number | null = null;
  if (d.escalation === "percent") appliedEscalation = d.escalationRate;
  if (d.escalation === "index") {
    const floored = d.indexFloor === null ? d.escalationRate : Math.max(d.indexFloor, d.escalationRate);
    appliedEscalation = d.indexCap === null ? floored : Math.min(d.indexCap, floored);
    trace.push({
      label: "Yearly increase applied",
      formula: `index ${pct(d.escalationRate)}, floor ${d.indexFloor === null ? "none" : pct(d.indexFloor)}, cap ${d.indexCap === null ? "none" : pct(d.indexCap)}`,
      value: pct(appliedEscalation),
    });
  }

  const rateFor = (y: number): number => {
    if (d.escalation === "step") return d.rentPerSf + d.escalationStep * (y - 1);
    if (appliedEscalation !== null) return d.rentPerSf * (1 + appliedEscalation) ** (y - 1);
    return d.rentPerSf;
  };
  // How a year's rate was reached; year 1 and a flat lease need no working.
  const rateFormula = (y: number, rate: number): string => {
    if (y === 1 || d.escalation === "none") return perSf(rate);
    if (d.escalation === "step") return `${usd(d.rentPerSf)} + ${usd(d.escalationStep)} × ${y - 1} = ${perSf(rate)}`;
    return `${usd(d.rentPerSf)} × (1 + ${pct(appliedEscalation ?? 0)})^${y - 1} = ${perSf(rate)}`;
  };

  // Month by month, in advance: month m (1-based) is paid at time m - 1.
  const payableByMonth: number[] = [];
  const years: LeaseYear[] = [];
  for (let y = 1; y <= leaseYears; y += 1) {
    const rate = rateFor(y);
    const monthly = (rate * A) / 12;
    const months = y === leaseYears ? lastYearMonths : 12;
    let freeMonths = 0;
    for (let k = 1; k <= months; k += 1) {
      const m = (y - 1) * 12 + k;
      const isFree = m <= d.freeMonths;
      if (isFree) freeMonths += 1;
      payableByMonth.push(isFree ? 0 : monthly);
    }
    const scheduled = monthly * months;
    const free = monthly * freeMonths;
    years.push({ year: y, months, rate, scheduled, freeMonths, free, payable: scheduled - free });
    trace.push({
      label: `Lease year ${y} base rent`,
      formula: `${rateFormula(y, rate)} × ${num(A, 0)} SF × ${months} ÷ 12`,
      value: usd(scheduled),
    });
  }

  const totalRent = years.reduce((s, y) => s + y.scheduled, 0);
  const freeRent = years.reduce((s, y) => s + y.free, 0);
  const rentPayable = totalRent - freeRent;
  trace.push({ label: "Total base rent", formula: `sum of ${leaseYears} lease ${leaseYears === 1 ? "year" : "years"}`, value: usd(totalRent) });
  trace.push({
    label: "Free rent",
    formula: d.freeMonths === 0 ? "no free months" : `base rent of months 1 to ${d.freeMonths}`,
    value: usd(freeRent),
  });
  trace.push({ label: "Rent payable", formula: `${usd(totalRent)} − ${usd(freeRent)}`, value: usd(rentPayable) });

  const termYears = M / 12;
  const averageRent = totalRent / A / termYears;
  trace.push({ label: "Average rent", formula: `${usd(totalRent)} ÷ ${num(A, 0)} SF ÷ (${M} ÷ 12) years`, value: `${perSf(averageRent)}/yr` });

  const ti = d.tiPerSf * A;
  trace.push({ label: "Improvement allowance", formula: `${usd(d.tiPerSf)} × ${num(A, 0)} SF, paid at signing`, value: usd(ti) });
  const commission = d.commissionShare * rentPayable;
  trace.push({ label: "Leasing commission", formula: `${pct(d.commissionShare)} × ${usd(rentPayable)} rent payable, paid at signing`, value: usd(commission) });
  const concessions = freeRent + ti + commission;
  trace.push({ label: "Landlord's concessions", formula: `${usd(freeRent)} free + ${usd(ti)} improvements + ${usd(commission)} commission`, value: usd(concessions) });

  const netRent = rentPayable - ti - commission;
  trace.push({ label: "Net rent over the term", formula: `${usd(rentPayable)} − ${usd(ti)} − ${usd(commission)}`, value: usd(netRent) });
  const shares = { free: freeRent / totalRent, ti: ti / totalRent, commission: commission / totalRent, net: netRent / totalRent };
  const concessionsShare = concessions / totalRent;
  trace.push({ label: "Concessions as a share of total base rent", formula: `${usd(concessions)} ÷ ${usd(totalRent)}`, value: pct(concessionsShare) });

  const nerSimple = netRent / A / termYears;
  trace.push({ label: "Net effective rent, simple", formula: `${usd(netRent)} ÷ ${num(A, 0)} SF ÷ (${M} ÷ 12) years`, value: `${perSf(nerSimple)}/yr` });

  const im = (1 + d.discountRate) ** (1 / 12) - 1;
  trace.push({ label: "Monthly discount rate", formula: `(1 + ${pct(d.discountRate)})^(1/12) − 1`, value: pct(im, 4) });

  // npv() leaves the first flow undiscounted: rent in advance.
  const pvRent = npv(im, payableByMonth);
  trace.push({ label: "Present value of rent payable", formula: `${M} monthly payments in advance at ${pct(im, 4)} a month`, value: usd(pvRent) });
  const pvLandlord = pvRent - ti - commission;
  trace.push({ label: "Present value of the lease to the landlord", formula: `${usd(pvRent)} − ${usd(ti)} − ${usd(commission)}`, value: usd(pvLandlord) });

  // Present value of 1 a month for M months, in advance; at a zero rate, M.
  const annuityFactor = pv(im, M, -1, 0, 1);
  trace.push({ label: "Present value of $1 a month", formula: `PV(${pct(im, 4)}, ${M}, −1, 0, 1), in advance`, value: num(annuityFactor, 4) });
  // The level monthly amount in advance with the same present value, per SF per year.
  const levelMonthly = -pmt(im, M, pvLandlord, 0, 1);
  const nerPv = (levelMonthly * 12) / A;
  trace.push({
    label: "Net effective rent, present value",
    formula: `${usd(pvLandlord)} ÷ ${num(annuityFactor, 4)} = ${usd(levelMonthly)} a month; × 12 ÷ ${num(A, 0)} SF`,
    value: `${perSf(nerPv)}/yr`,
  });

  return {
    leaseYears,
    lastYearMonths,
    appliedEscalation,
    years,
    totalRent,
    freeRent,
    rentPayable,
    averageRent,
    ti,
    commission,
    concessions,
    concessionsShare,
    netRent,
    shares,
    nerSimple,
    monthlyDiscountRate: im,
    pvRent,
    pvLandlord,
    annuityFactor,
    levelMonthly,
    nerPv,
    trace,
  };
}

// Synthetic: round, made-up figures. The escalation, free rent, allowance,
// commission and discount rate are example values, not market terms.
export const LEASE_RENT_EXAMPLE: LeaseRentInput = {
  area: 25_000,
  rentPerSf: 12,
  termMonths: 66,
  escalation: "percent",
  escalationRate: 0.04,
  escalationStep: 0.5,
  indexFloor: null,
  indexCap: null,
  freeMonths: 6,
  tiPerSf: 15,
  commissionShare: 0.05,
  discountRate: 0.09,
};

export const leaseRentModule = defineModule({ id: "lease-rent", input: leaseRentInput, run: runLeaseRent, example: LEASE_RENT_EXAMPLE });
