import { NPV_IRR_EXAMPLE, runNpvIrr, type NpvIrrInput, type NpvIrrResult } from "@/lib/calculators/npv-irr";
import { num, pct, usd } from "@/lib/calculators/trace";
import { count } from "./format";
import { HeadlineFigures, type Headline, type SplitSegment } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.
// Every figure is a field of the result; nothing is computed here but the words around it.

export function npvIrrHeadline(r: NpvIrrResult): string {
  const at = `The NPV at ${pct(r.requiredReturn)} is ${usd(r.npv, false)}`;
  if (r.irr === null || r.atIrr === null) {
    return r.signChanges === 0 ? `${at}, and no rate makes the NPV zero, so there is no IRR.` : `${at}, and the search found no IRR.`;
  }
  return `${at} and the IRR is ${pct(r.irr)}; ${pct(r.atIrr.saleShare ?? 0, 1)} of the IRR comes from the sale.`;
}

export function npvIrrFigures(d: NpvIrrInput, r: NpvIrrResult): { lead: Headline; rest: Headline[] } {
  const saleShare = r.atIrr?.saleShare ?? null;
  const opsShare = r.atIrr?.operationsShare ?? null;
  const rest: Headline[] = [
    {
      label: "IRR",
      value: r.irr === null ? "none" : pct(r.irr),
      sub: r.irr === null ? (r.signChanges === 0 ? "no rate makes NPV zero" : "the search found none") : r.irrMayNotBeUnique ? `${count(r.signChanges, "sign change")}: may not be unique` : "one sign change",
    },
    {
      label: "Share from the sale",
      value: saleShare === null ? "none" : pct(saleShare, 1),
      sub: opsShare === null ? "no IRR to partition" : `at the IRR; ${pct(opsShare, 1)} from operations`,
    },
    { label: "Profitability index", value: num(r.profitabilityIndex, 3), sub: "present value over equity" },
    { label: "Payback year", value: r.paybackYear === null ? "never" : `year ${r.paybackYear}`, sub: "undiscounted, sale included" },
    {
      label: "Modified IRR",
      value: r.mirr === null ? (r.mirrParts === null ? "not computed" : "none") : pct(r.mirr),
      sub:
        d.financeRate === null || d.reinvestmentRate === null
          ? "enter both rates to compute it"
          : `reinvesting at ${pct(d.reinvestmentRate)}, financing at ${pct(d.financeRate)}`,
    },
    { label: "Net cash, undiscounted", value: usd(r.netCash, false), sub: `over ${count(r.holdYears, "year")}` },
  ];
  return {
    lead: { label: `NPV at ${pct(d.requiredReturn)}`, value: usd(r.npv, false), sub: `present value ${usd(r.presentValue, false)} on ${usd(r.equity, false)} of equity` },
    rest,
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
// The IRR keeps its cell only when it may not be the only one, which the sentence does not say.
export function npvIrrCells(d: NpvIrrInput, r: NpvIrrResult): Headline[] {
  return npvIrrFigures(d, r).rest.filter((h) => h.label !== "Share from the sale" && (h.label !== "IRR" || r.irrMayNotBeUnique));
}

// The equity at the IRR, split into what operations and the sale are worth. Drawn only
// when there is an IRR and neither part is negative, so the two parts add to the equity.
export function npvIrrSplit(r: NpvIrrResult): SplitSegment[] | null {
  if (r.atIrr === null || r.atIrr.operations < 0 || r.atIrr.sale < 0) return null;
  return [
    { key: "operations", label: "Operations, at the IRR", value: r.atIrr.operations, fill: "tint" },
    { key: "sale", label: "Sale, at the IRR", value: r.atIrr.sale, fill: "solid" },
  ];
}

export const npvIrrInfo: ModuleInfo = {
  meta: {
    purpose: "Test an equity cash flow against a required return, and see how much of its IRR rests on the sale.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "Every figure in the worked example (net cash, NPV, profitability index, IRR, the partition at the IRR and at the required return, the payback year and the modified IRR with its two parts) matches values computed independently in Python with 50-digit decimals and an IRR found by bisection.",
      "Across seven cases each year's flow is its operating flow plus its sale, the years add to the present value, NPV at the IRR is zero, the two shares at the IRR sum to one, and the profitability index equals one plus NPV over equity.",
      "Ten years of level cash on the equity with the equity back at the sale gives the closed-form IRR, NPV and partition; NPV falls as the required return rises, and the modified IRR lies between the reinvestment rate and the IRR.",
      "No sale, a loss, one period, a zero required return, a required return equal to the IRR (an NPV of zero, never a minus zero), cash back that repays the equity to the cent (payback in that year), flows that never change sign (no IRR) and flows that change sign three times (flagged) each return what the method says, and bad input is refused in plain words.",
    ],
    tests: ["__tests__/calc-npv-irr.test.ts"],
  },
  exampleLine: `${usd(NPV_IRR_EXAMPLE.equity, false)} of equity, ${NPV_IRR_EXAMPLE.operatingFlows.length} years of operating cash, a ${usd(NPV_IRR_EXAMPLE.saleProceeds ?? 0, false)} net sale, discounted at ${pct(NPV_IRR_EXAMPLE.requiredReturn)}`,
  headline: () => npvIrrHeadline(runNpvIrr(NPV_IRR_EXAMPLE)),
  preview: () => {
    const f = npvIrrFigures(NPV_IRR_EXAMPLE, runNpvIrr(NPV_IRR_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest.slice(0, 2)} compact />;
  },
};
