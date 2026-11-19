import { describe, expect, it } from "vitest";
import { DEBT_EXAMPLE, sizeDebt } from "@/lib/calculators/debt";
import { fv, ipmt, irr, pmt, ppmt, pv, xirr } from "@/lib/calculators/finance";
import { RETURNS_EXAMPLE, runReturns } from "@/lib/calculators/returns";
import { runWaterfall, WATERFALL_EXAMPLE, type WaterfallInput } from "@/lib/calculators/waterfall";

// Expected values were computed in Excel 16 on 2026-11-11 with
// tools/crosscheck/excel.ps1 (PMT, IPMT, PPMT, FV, PV, CUMIPMT, CUMPRINC, IRR, XIRR).
const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};

describe("time-value functions match Excel", () => {
  it("PMT, IPMT, PPMT, FV and PV", () => {
    cents(pmt(0.005, 360, 1_000_000), -5995.5052515275229);
    cents(ipmt(0.005, 1, 360, 1_000_000), -5000);
    cents(ipmt(0.005, 120, 360, 1_000_000), -4193.2972880039479);
    cents(ppmt(0.005, 120, 360, 1_000_000), -1802.207963523575);
    cents(fv(0.005, 60, -5995.51, 1_000_000), -930543.23692712863);
    cents(pv(0.005, 360, -5000), 833958.07196166739);
  });

  it("XIRR on dated flows", () => {
    const r = xirr([
      { date: "2026-01-15", amount: -1_000_000 },
      { date: "2026-07-15", amount: 50_000 },
      { date: "2027-01-15", amount: 50_000 },
      { date: "2027-12-31", amount: 1_100_000 },
    ]);
    expect(r).toBeCloseTo(0.10345453619956971, 7);
  });

  it("IRR returns null when the flows never change sign", () => {
    expect(irr([100, 200])).toBeNull();
    expect(irr([-100, -200])).toBeNull();
  });
});

describe("debt sizing worked example", () => {
  const d = sizeDebt(DEBT_EXAMPLE);
  it("sizes the loan on the binding limit", () => {
    expect(d.binding).toBe("dscr");
    cents(d.byConstraint.dscr, 5273693.9845690969);
    cents(d.byConstraint.ltv, 5_600_000);
    cents(d.byConstraint["debt-yield"], 6_250_000);
    cents(d.loan, 5273693.9845690969);
  });

  it("reproduces payments, schedule and balloon to the cent", () => {
    cents(d.ioPayment, 28565.842416415941);
    cents(d.amortPayment, 33333.333333333212);
    cents(d.schedule[0]?.interest, 342790.1089969913);
    cents(d.schedule[0]?.principal, 0);
    cents(d.schedule[2]?.interest, 341054.57917945908);
    cents(d.schedule[2]?.principal, 58945.420820539468);
    cents(d.balloon, 4675481.8671051767);
    cents(d.schedule[9]?.endBalance, 4675481.8671051767);
    expect(d.dscr).toBeCloseTo(1.25, 10);
  });

  it("carries a formula trace", () => {
    expect(d.trace.some((t) => t.formula.startsWith("PV("))).toBe(true);
    expect(d.trace.some((t) => t.label === "Balance due at maturity")).toBe(true);
  });

  it("rejects a loan with no sizing limit", () => {
    expect(() => sizeDebt({ ...DEBT_EXAMPLE, minDscr: null, maxLtv: null, minDebtYield: null })).toThrow();
  });
});

describe("returns worked example", () => {
  const r = runReturns(RETURNS_EXAMPLE);
  it("reproduces unlevered and levered IRR", () => {
    expect(r.unleveredIrr).toBeCloseTo(0.067141468617739841, 10);
    expect(r.leveredIrr).toBeCloseTo(0.0704539607602015, 10);
  });

  it("builds the cash flows the IRRs come from", () => {
    cents(r.unleveredFlows[0], -10_200_000);
    cents(r.leveredFlows[0], -4_200_000);
    cents(r.unleveredFlows[5], 11162276.911975386);
    cents(r.leveredFlows[5], 5090529.288566616);
  });

  it("fills the sensitivity grid, corners matching Excel", () => {
    expect(r.sensitivity.exitCaps).toEqual([0.06, 0.0625, 0.065, 0.0675, 0.07]);
    expect(r.sensitivity.growths).toEqual([0.02, 0.025, 0.03, 0.035, 0.04]);
    expect(r.sensitivity.irr[0]?.[4]).toBeCloseTo(0.12341282114548324, 10);
    expect(r.sensitivity.irr[4]?.[0]).toBeCloseTo(0.015188743526671988, 10);
    expect(r.sensitivity.irr[2]?.[2]).toBeCloseTo(r.leveredIrr ?? 0, 12);
  });
});

describe("waterfall", () => {
  const w = runWaterfall(WATERFALL_EXAMPLE);
  const last = w.periods.length - 1;
  const flows = w.periods.map((p) => p.toInvestors - p.contribution);
  const residual = w.tierCash[w.tierCash.length - 1] ?? 0;
  const tier2 = w.tierCash[2] ?? 0;
  const throughTier2 = flows.map((x, t) => (t === last ? x - residual * 0.7 : x));
  const throughTier1 = throughTier2.map((x, t) => (t === last ? x - tier2 * 0.8 : x));

  it("stops each tier exactly at its hurdle (checked with Excel's IRR)", () => {
    expect(irr(throughTier1)).toBeCloseTo(0.08, 10);
    expect(irr(throughTier2)).toBeCloseTo(0.12, 10);
    expect(w.investorIrr).toBeCloseTo(0.12899013387383307, 10);
  });

  it("never creates or loses cash", () => {
    for (const p of w.periods) {
      cents(p.toInvestors + p.promote, p.cash);
      cents(p.lp + p.sponsorCoInvest, p.toInvestors);
    }
    cents(w.tierCash.reduce((s, x) => s + x, 0), w.totals.cash);
  });

  it("matches a hand-worked simple and compound pref", () => {
    const base: WaterfallInput = {
      order: "whole-fund",
      deals: [{ name: "Hand check", contributions: [1_000_000], distributions: [0, 0, 0, 1_300_000] }],
      sponsorCoInvestPct: 0,
      pref: { rate: 0.08, compounding: "simple", investorShare: 1 },
      catchUp: null,
      tiers: [],
      residualInvestorShare: 0.8,
    };
    // simple: 3 years of 8% on $1,000,000 = $240,000 pref; $60,000 left, 20% promote
    cents(runWaterfall(base).totals.promote, 12_000);
    // compound: $1,000,000 x 1.08^3 = $1,259,712; $40,288 left, 20% promote
    cents(runWaterfall({ ...base, pref: { ...base.pref, compounding: "compound" } }).totals.promote, 8057.6);
  });

  it("brings the sponsor to its target share with a full catch-up", () => {
    const res = runWaterfall({
      ...WATERFALL_EXAMPLE,
      catchUp: { sponsorShare: 1, targetShareOfProfit: 0.2 },
      tiers: [],
      residualInvestorShare: 0.8,
    });
    expect(res.promoteShareOfProfit).toBeCloseTo(0.2, 10);
  });

  it("pays more promote deal by deal than whole fund when one deal loses money", () => {
    const deals = [
      { name: "A", contributions: [500_000], distributions: [0, 30_000, 30_000, 30_000, 30_000, 900_000] },
      { name: "B", contributions: [500_000], distributions: [0, 20_000, 20_000, 20_000, 20_000, 400_000] },
    ];
    const byDeal = runWaterfall({ ...WATERFALL_EXAMPLE, order: "deal-by-deal", deals });
    const byFund = runWaterfall({ ...WATERFALL_EXAMPLE, order: "whole-fund", deals });
    expect(byDeal.totals.promote).toBeGreaterThan(byFund.totals.promote);
    expect(byDeal.alternative.promote).toBeCloseTo(byFund.totals.promote, 6);
  });
});
