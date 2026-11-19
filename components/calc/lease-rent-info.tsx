import { LEASE_RENT_EXAMPLE, runLeaseRent, type LeaseRentInput, type LeaseRentResult } from "@/lib/calculators/lease-rent";
import { num, pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

const sf = (n: number) => `${usd(n)}/SF`;

// The escalation in a few words: "4.00% a year", "$0.50/SF a year", "index 3.00% a year".
export function leaseRentEscalation(d: LeaseRentInput, r: LeaseRentResult): string {
  if (d.escalation === "none") return "flat";
  if (d.escalation === "step") return `${sf(d.escalationStep)} a year`;
  if (d.escalation === "percent") return `${pct(d.escalationRate)} a year`;
  return `index, ${pct(r.appliedEscalation ?? d.escalationRate)} a year applied`;
}

export function leaseRentHeadline(r: LeaseRentResult): string {
  return `Net effective rent is ${usd(r.nerPv)} a square foot a year at present value and ${usd(r.nerSimple)} as a simple average, against an average rent of ${usd(r.averageRent)}.`;
}

export function leaseRentFigures(d: LeaseRentInput, r: LeaseRentResult): { lead: Headline; rest: Headline[] } {
  return {
    lead: { label: "Net effective rent, present value", value: usd(r.nerPv), sub: `a SF a year, discounted at ${pct(d.discountRate)}` },
    rest: [
      { label: "Net effective rent, simple", value: usd(r.nerSimple), sub: "a SF a year, undiscounted" },
      { label: "Average rent", value: usd(r.averageRent), sub: "a SF a year, before concessions" },
      { label: "Concessions", value: usd(r.concessions, false), sub: `${pct(r.concessionsShare, 1)} of total base rent` },
      { label: "Present value to the landlord", value: usd(r.pvLandlord, false), sub: "rent less allowance and commission" },
    ],
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function leaseRentCells(d: LeaseRentInput, r: LeaseRentResult): Headline[] {
  return leaseRentFigures(d, r).rest.filter((h) => h.label !== "Net effective rent, simple" && h.label !== "Average rent");
}

export const leaseRentInfo: ModuleInfo = {
  meta: {
    purpose: "Turn a lease's rent steps, free rent, improvement allowance and commission into total rent, average rent and net effective rent per square foot, to compare offers.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's rate and rent for every lease year, total, free and payable rent, average rent, allowance, commission, both net effective rents and the present values match a separate Python calculation (decimal module, 2026-11-13) to the cent, and the per-square-foot figures to 1e-6.",
      "Fixed-step, capped-index and floored-index variants are pinned to the same calculation, as are a zero discount rate and a flat lease's present value against its closed form.",
      "On four leases, payable plus free rent equals total rent, the concessions and net rent add back to it, the shares sum to one, and the level rent rebuilds the landlord's present value; with no concessions or escalation both net effective rents equal the rent.",
      "A partial last lease year, free rent past year 1 and a one-month lease are pinned; free rent as long as the term, a step below zero and a cap under its floor are refused in plain words.",
    ],
    tests: ["__tests__/calc-lease-rent.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `${num(LEASE_RENT_EXAMPLE.area, 0)} SF at ${sf(LEASE_RENT_EXAMPLE.rentPerSf)}, ${LEASE_RENT_EXAMPLE.termMonths} months, ${leaseRentEscalation(LEASE_RENT_EXAMPLE, runLeaseRent(LEASE_RENT_EXAMPLE))}, ${LEASE_RENT_EXAMPLE.freeMonths} months free, ${sf(LEASE_RENT_EXAMPLE.tiPerSf)} allowance, ${pct(LEASE_RENT_EXAMPLE.commissionShare, 0)} commission, discounted at ${pct(LEASE_RENT_EXAMPLE.discountRate, 0)}`,
  headline: () => leaseRentHeadline(runLeaseRent(LEASE_RENT_EXAMPLE)),
  preview: () => {
    const f = leaseRentFigures(LEASE_RENT_EXAMPLE, runLeaseRent(LEASE_RENT_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
