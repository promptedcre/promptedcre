import { LEASE_ROLLOVER_EXAMPLE, runLeaseRollover, type LeaseRolloverInput, type LeaseRolloverResult } from "@/lib/calculators/lease-rollover";
import { num, pct, usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline, type SplitSegment } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

const years = (n: number | null) => (n === null ? "none" : `${num(n, 2)} yrs`);
const share = (n: number | null) => (n === null ? "none" : pct(n, 1));

export function leaseRolloverHeadline(r: LeaseRolloverResult): string {
  if (r.hold.rentShare === null) return `There is no in-place rent: ${pct(r.vacantShare, 1)} of the area is vacant.`;
  return `${pct(r.hold.rentShare, 1)} of the in-place rent expires inside the ${r.holdYears}-year hold, and the weighted average lease term is ${num(r.waltByRent ?? 0, 2)} years by rent.`;
}

export function leaseRolloverFigures(d: LeaseRolloverInput, r: LeaseRolloverResult): { lead: Headline; rest: Headline[] } {
  const now = r.buckets[0];
  const m = r.markToMarket;
  return {
    lead: {
      label: "Rent expiring inside the hold",
      value: share(r.hold.rentShare),
      sub: `${pct(r.hold.areaShare, 1)} of the area, before ${r.holdEnd}`,
    },
    rest: [
      // by rent it is in the sentence; the cell carries the other weighting
      { label: "Weighted average lease term, by area", value: years(r.waltByArea), sub: "each lease weighted by its square feet" },
      { label: "Largest tenant's share of rent", value: share(r.largestShare), sub: r.largestTenant ? `${r.largestTenant.tenant}; top three ${share(r.topThreeShare)}` : "no tenants" },
      { label: "Occupied", value: pct(r.occupiedShare, 1), sub: `${num(r.occupiedArea, 0)} of ${num(r.totalArea, 0)} SF on ${d.rows.length} rows` },
      { label: "Expiring now", value: pct(now?.areaShare ?? 0, 1), sub: "of the area: month-to-month and holdover" },
      {
        label: "Market less in-place rent",
        value: m ? usd(m.difference, false) : "not given",
        sub: m ? `${m.difference > 0 ? "rents below market" : m.difference < 0 ? "rents above market" : "rents at market"}, on ${pct(m.pricedShare, 0)} of occupied SF` : "no occupied row has a market rent",
      },
    ],
  };
}

// The in-place rent split at the end of the hold, for the drawing on the calculator page.
export function leaseRolloverSplit(r: LeaseRolloverResult): SplitSegment[] {
  return [
    { key: "inside", label: "Expires inside the hold", value: r.hold.rent, fill: "solid" },
    { key: "after", label: "Runs past the hold", value: r.totalRent - r.hold.rent, fill: "tint" },
  ];
}

export const leaseRolloverInfo: ModuleInfo = {
  meta: {
    purpose: "Read a rent roll for rollover risk: what expires each year and inside the hold, the weighted average lease term, the largest tenant's share and in-place rent against market.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's occupied and vacant area, each row's remaining term, the expirations for every bucket with their cumulative shares, the area and rent inside the hold, both weighted average lease terms, the largest and top-three shares and market less in-place rent by row and in total match a separate Python calculation (exact fractions, 2026-11-13).",
      "On thirteen rent rolls, the expiry buckets plus vacant area equal the building, the buckets' rent equals the in-place rent, the cumulative shares never fall and end at the occupied share and at one, both weighted terms sit between the shortest and longest, and the largest share is no more than the top three's; leases that all end on one day give that term both ways.",
      "One tenant, no market rents, an all-vacant roll, a holdover, a lease ending on the analysis date, the hold's last day and a leap year are pinned; impossible dates, a lease end more than 100 years out, zero area, negative rent and a blank name are refused in plain words.",
    ],
    tests: ["__tests__/calc-lease-rollover.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `${LEASE_ROLLOVER_EXAMPLE.rows.length} rows, ${num(
    LEASE_ROLLOVER_EXAMPLE.rows.reduce((s, x) => s + x.area, 0),
    0,
  )} SF, read ${LEASE_ROLLOVER_EXAMPLE.analysisDate}, ${LEASE_ROLLOVER_EXAMPLE.holdYears}-year hold`,
  headline: () => leaseRolloverHeadline(runLeaseRollover(LEASE_ROLLOVER_EXAMPLE)),
  preview: () => {
    const f = leaseRolloverFigures(LEASE_ROLLOVER_EXAMPLE, runLeaseRollover(LEASE_ROLLOVER_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest.slice(0, 4)} compact />;
  },
};
