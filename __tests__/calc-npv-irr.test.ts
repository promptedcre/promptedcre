import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { npvIrrHeadline } from "@/components/calc/npv-irr-info";
import { countSignChanges, NPV_IRR_EXAMPLE, npvIrrInput, runNpvIrr, type NpvIrrInput } from "@/lib/calculators/npv-irr";
import { num, pct, usd } from "@/lib/calculators/trace";

// The expected values below were computed independently in Python on 2026-11-13
// (scratch check.py): Decimal arithmetic at 50 digits, discount factors built by
// repeated multiplication and the IRR found by plain bisection on NPV, written from
// the definitions rather than ported from this module.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(0.005);
};
const rate = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(1e-9);
};

const ex = NPV_IRR_EXAMPLE;
const run = (over: Partial<NpvIrrInput>) => runNpvIrr({ ...ex, ...over });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// A spread of conventional and unconventional cases the invariants run over.
const CASES: NpvIrrInput[] = [
  ex,
  { equity: 1_000_000, operatingFlows: [300_000, 300_000, 300_000, 300_000, 300_000], saleProceeds: null, requiredReturn: 0.1, financeRate: null, reinvestmentRate: null },
  { equity: 1_000_000, operatingFlows: [20_000, 20_000, 20_000, 20_000], saleProceeds: 700_000, requiredReturn: 0.07, financeRate: 0.05, reinvestmentRate: 0.04 },
  { equity: 500_000, operatingFlows: [25_000], saleProceeds: 525_000, requiredReturn: 0.1, financeRate: null, reinvestmentRate: null },
  { equity: 800_000, operatingFlows: Array(10).fill(40_000) as number[], saleProceeds: 800_000, requiredReturn: 0.08, financeRate: 0.06, reinvestmentRate: 0.03 },
  { equity: 1_000_000, operatingFlows: [100_000, -300_000, 100_000, 100_000], saleProceeds: 1_250_000, requiredReturn: 0.08, financeRate: 0.06, reinvestmentRate: 0.05 },
  { equity: 750_000, operatingFlows: [0, 0, 40_000, 80_000, 90_000, 95_000, 100_000], saleProceeds: 900_000, requiredReturn: 0.12, financeRate: 0.07, reinvestmentRate: 0.06 },
];

describe("npv-irr worked example (pinned to Python)", () => {
  const r = runNpvIrr(ex);

  it("builds the flows: equity out at year 0, the sale added to the final year", () => {
    expect(r.flows).toEqual([-2_000_000, 100_000, 110_000, 120_000, 130_000, 2_740_000]);
    expect(r.holdYears).toBe(5);
    cents(r.netCash, 1_200_000);
  });

  it("discounts at the required return: present value, NPV and profitability index", () => {
    cents(r.presentValue, 2_242_511.5724842317);
    cents(r.npv, 242_511.5724842317);
    rate(r.profitabilityIndex, 1.1212557862421159);
  });

  it("finds the IRR and partitions the equity between operations and the sale", () => {
    expect(r.signChanges).toBe(1);
    expect(r.irrMayNotBeUnique).toBe(false);
    rate(r.irr, 0.1074047941);
    cents(r.atIrr?.operations, 438_861.7974667686);
    cents(r.atIrr?.sale, 1_561_138.2025332314);
    rate(r.atIrr?.operationsShare, 0.2194308987);
    rate(r.atIrr?.saleShare, 0.7805691013);
  });

  it("splits the present value at the required return the same way", () => {
    cents(r.atRequired.operations, 472_995.2601964735);
    cents(r.atRequired.sale, 1_769_516.3122877582);
    rate(r.atRequired.saleShare, 0.7890778955);
  });

  it("pays back in the sale year, and gives the modified IRR from both rates", () => {
    expect(r.paybackYear).toBe(5);
    cents(r.mirrParts?.futureValueOfInflows, 3_257_689.375);
    cents(r.mirrParts?.presentValueOfOutlays, 2_000_000);
    rate(r.mirr, 0.1024932397);
    expect(r.notes).toEqual([]);
  });

  it("shows each figure in the trace as the result holds it, in the order computed", () => {
    const value = (label: string) => r.trace.find((l) => l.label === label)?.value;
    expect(r.trace[0]?.label).toBe("Equity at year 0");
    expect(value("NPV at the 8.00% required return")).toBe(usd(r.npv));
    expect(value("Profitability index")).toBe(num(r.profitabilityIndex, 3));
    expect(value("IRR")).toBe(pct(r.irr as number));
    expect(value("NPV at the IRR (check)")).toBe("$0.00");
    expect(value("Share of the IRR from the sale")).toBe(pct(r.atIrr?.saleShare as number));
    expect(value("Payback year")).toBe("year 5");
    expect(value("Modified IRR")).toBe(pct(r.mirr as number));
    const order = r.trace.map((l) => l.label);
    expect(order.indexOf("NPV at the 8.00% required return")).toBeLessThan(order.indexOf("IRR"));
    expect(order.indexOf("IRR")).toBeLessThan(order.indexOf("Share of the IRR from the sale"));
    expect(order.indexOf("Payback year")).toBeLessThan(order.indexOf("Modified IRR"));
    expect(npvIrrHeadline(r)).toBe("The NPV at 8.00% is $242,512 and the IRR is 10.74%; 78.1% of the IRR comes from the sale.");
  });
});

describe("npv-irr invariants", () => {
  it.each(CASES.map((c, i) => [i, c] as const))("case %i: money in equals money out, by year and in present value", (_, c) => {
    const r = runNpvIrr(c);
    // the schedule adds up: each year's flow is its operating flow plus its sale
    for (const y of r.years) expect(y.cashFlow).toBe(y.operating + y.sale);
    expect(sum(r.years.map((y) => y.sale))).toBe(c.saleProceeds ?? 0);
    cents(r.years.at(-1)?.cumulative, r.netCash);
    cents(sum(r.flows), r.netCash);
    // discounted, the years add to the present value, and the two parts to the whole
    cents(sum(r.years.map((y) => y.pvAtRequired)), r.presentValue);
    cents(r.atRequired.operations + r.atRequired.sale, r.presentValue);
    rate(r.profitabilityIndex, 1 + r.npv / c.equity);
  });

  it.each(CASES.map((c, i) => [i, c] as const))("case %i: at the IRR, NPV is zero and the two shares sum to one", (_, c) => {
    const r = runNpvIrr(c);
    expect(r.irr).not.toBeNull();
    expect(Math.abs(r.npvAtIrr as number)).toBeLessThan(1e-4);
    cents(sum(r.years.map((y) => y.pvAtIrr ?? Number.NaN)), c.equity);
    cents((r.atIrr?.operations ?? 0) + (r.atIrr?.sale ?? 0), c.equity);
    rate((r.atIrr?.operationsShare ?? 0) + (r.atIrr?.saleShare ?? 0), 1);
  });

  it("for conventional flows, PI above one, NPV above zero and IRR above the required return go together", () => {
    for (const c of CASES.filter((x) => countSignChanges([-x.equity, ...x.operatingFlows]) === 1)) {
      for (const k of [0, 0.04, 0.08, 0.1, 0.15, 0.25]) {
        const r = runNpvIrr({ ...c, requiredReturn: k });
        if (Math.abs(r.npv) < 1e-6) continue;
        expect(r.profitabilityIndex > 1).toBe(r.npv > 0);
        expect((r.irr as number) > k).toBe(r.npv > 0);
      }
    }
  });

  it("NPV falls as the required return rises, for conventional flows", () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let k = 0; k <= 0.3 + 1e-9; k += 0.01) {
      const v = run({ requiredReturn: k }).npv;
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it("puts the modified IRR between the reinvestment rate and the IRR, and on the IRR when the two rates match it", () => {
    const base = runNpvIrr(ex);
    const irr = base.irr as number;
    for (const rr of [0, 0.03, 0.05, 0.09]) {
      const m = run({ reinvestmentRate: rr }).mirr as number;
      expect(m).toBeGreaterThan(rr);
      expect(m).toBeLessThan(irr);
    }
    // only year 0 is negative, so the finance rate cannot move it
    rate(run({ financeRate: 0, reinvestmentRate: 0.05 }).mirr, base.mirr as number);
    expect(Math.abs((run({ reinvestmentRate: irr }).mirr as number) - irr)).toBeLessThan(1e-9);
  });

  it("a flat case equals the closed form: level cash on the equity and the equity back at the sale", () => {
    // $40,000 a year on $800,000 for ten years, $800,000 back: the IRR is 5% exactly.
    const c = CASES[4] as NpvIrrInput;
    const r = runNpvIrr(c);
    const y = 0.05;
    const k = 0.08;
    rate(r.irr, y);
    // NPV at k: a level annuity plus the equity discounted, less the equity
    const annuity = (40_000 * (1 - (1 + k) ** -10)) / k;
    cents(r.npv, annuity + 800_000 / (1 + k) ** 10 - 800_000);
    // at the IRR the sale is worth the equity discounted ten years; operations the rest
    cents(r.atIrr?.sale, 800_000 / (1 + y) ** 10);
    cents(r.atIrr?.operations, 800_000 * (1 - (1 + y) ** -10));
    // and the Python check agrees
    cents(r.npv, -161_041.9535745947);
    cents(r.atIrr?.sale, 491_130.6028326075);
    rate(r.atIrr?.saleShare, 0.6139132535);
    expect(r.paybackYear).toBe(10);
  });
});

describe("npv-irr edge cases", () => {
  it("no sale: every dollar of value is operations, and null and 0 give the same figures", () => {
    const c = CASES[1] as NpvIrrInput;
    const r = runNpvIrr(c);
    rate(r.irr, 0.1523823712);
    cents(r.npv, 137_236.0308225345);
    rate(r.atIrr?.operationsShare, 1);
    expect(r.atIrr?.sale).toBe(0);
    rate(r.atRequired.saleShare, 0);
    expect(r.paybackYear).toBe(4);
    expect(r.mirr).toBeNull();
    expect(r.mirrParts).toBeNull();
    expect(r.trace.find((l) => l.label === "Modified IRR")?.value).toBe("not computed");
    const zero = runNpvIrr({ ...c, saleProceeds: 0 });
    expect(zero.npv).toBe(r.npv);
    expect(zero.irr).toBe(r.irr);
    expect(zero.atIrr).toEqual(r.atIrr);
  });

  it("a loss: the IRR is negative, NPV and PI say so, and payback never comes", () => {
    const r = runNpvIrr(CASES[2] as NpvIrrInput);
    rate(r.irr, -0.0623959825);
    cents(r.npv, -398_229.1264374538);
    rate(r.profitabilityIndex, 0.6017708736);
    rate(r.atIrr?.saleShare, 0.9057747333);
    expect(r.paybackYear).toBeNull();
    expect(r.trace.find((l) => l.label === "Payback year")?.value).toBe("never");
    expect(r.notes).toContain("The cash back never covers the equity within the hold.");
  });

  it("one period: the IRR is the year's cash over the equity less one, and NPV is zero at that rate", () => {
    const r = runNpvIrr(CASES[3] as NpvIrrInput);
    rate(r.irr, 0.1);
    cents(r.npv, 0);
    rate(r.profitabilityIndex, 1);
    cents(r.atIrr?.operations, 22_727.2727272727);
    cents(r.atIrr?.sale, 477_272.7272727273);
    expect(r.paybackYear).toBe(1);
  });

  it("a zero required return makes NPV the undiscounted net cash", () => {
    const r = runNpvIrr({ equity: 1_000_000, operatingFlows: [50_000, 50_000], saleProceeds: 1_100_000, requiredReturn: 0, financeRate: null, reinvestmentRate: null });
    cents(r.npv, 200_000);
    cents(r.npv, r.netCash);
    rate(r.irr, 0.0976718976);
    rate(r.atRequired.saleShare, 1_100_000 / 1_200_000);
    expect(r.paybackYear).toBe(2);
  });

  it("flows that never change sign have no IRR and no partition, and say why", () => {
    const r = runNpvIrr({ equity: 1_000_000, operatingFlows: [-50_000, -50_000], saleProceeds: null, requiredReturn: 0.08, financeRate: null, reinvestmentRate: null });
    expect(r.signChanges).toBe(0);
    expect(r.irr).toBeNull();
    expect(r.atIrr).toBeNull();
    expect(r.npvAtIrr).toBeNull();
    expect(r.years.every((y) => y.pvAtIrr === null)).toBe(true);
    cents(r.npv, -1_089_163.2373113855);
    expect(r.atRequired.saleShare).toBeNull();
    expect(r.paybackYear).toBeNull();
    expect(r.trace.find((l) => l.label === "IRR")?.value).toBe("none");
    expect(r.trace.find((l) => l.label === "IRR")?.formula).toContain("never change sign");
    expect(r.trace.find((l) => l.label === "Partition at the IRR")?.value).toBe("not defined");
  });

  it("flows that change sign but give the search no IRR claim only that the search found none", () => {
    // −1,000,000, +2,000,000, −1,010,000: with x = 1 ÷ (1 + r), NPV = −1,010,000x² + 2,000,000x − 1,000,000,
    // whose discriminant (4e12 − 4.04e12) is below zero, so NPV is below zero at every rate.
    const r = runNpvIrr({ equity: 1_000_000, operatingFlows: [2_000_000, -1_010_000], saleProceeds: null, requiredReturn: 0.08, financeRate: null, reinvestmentRate: null });
    expect(r.signChanges).toBe(2);
    expect(r.irr).toBeNull();
    const line = r.trace.find((l) => l.label === "IRR");
    expect(line?.value).toBe("none");
    expect(line?.formula).toContain("the search between −99.99% and 1,000% found no rate");
    expect(line?.formula).not.toContain("never change sign");
    expect(npvIrrHeadline(r)).toContain("the search found no IRR");
    expect(npvIrrHeadline(r)).not.toContain("there is no IRR");
  });

  it("more than one sign change is flagged, and the partition can put more than all of it on the sale", () => {
    const r = runNpvIrr(CASES[5] as NpvIrrInput);
    expect(r.signChanges).toBe(3);
    expect(r.irrMayNotBeUnique).toBe(true);
    expect(r.trace.some((l) => l.label === "Sign changes in the flows: the IRR may not be unique" && l.value === "3")).toBe(true);
    expect(r.notes[0]).toMatch(/change sign 3 times/);
    rate(r.irr, 0.0550392104);
    cents(r.npv, -92_935.5281207133);
    rate(r.atIrr?.operationsShare, -0.0088709368);
    rate(r.atIrr?.saleShare, 1.0088709368);
    expect(r.notes).toContain("Operations are worth less than nothing at the IRR, so the sale carries more than all of the equity.");
    expect(r.paybackYear).toBe(4);
    cents(r.mirrParts?.futureValueOfInflows, 1_570_762.5);
    cents(r.mirrParts?.presentValueOfOutlays, 1_266_998.932004272);
    rate(r.mirr, 0.0551970513);
  });

  // Review 2026-11-13 (math-review-a): cash back that repays the equity to the cent left a
  // floating-point residue of -7e-12, so payback read "never", net cash "-$0.00", and a
  // required return equal to the IRR printed an NPV of "-$0.00".
  it("cash back that exactly repays the equity pays back, with no minus zero", () => {
    const r = runNpvIrr({ equity: 100_000.3, operatingFlows: [50_000.1, 50_000.2], saleProceeds: null, requiredReturn: 0.05, financeRate: null, reinvestmentRate: null });
    expect(r.netCash).toBe(0);
    expect(r.years.at(-1)?.cumulative).toBe(0);
    expect(r.paybackYear).toBe(2);
    expect(r.notes).not.toContain("The cash back never covers the equity within the hold.");
    expect(r.trace.find((l) => l.label === "Net cash, undiscounted")?.value).toBe("$0.00");
    for (const k of [0.1, 0.03, 0.09]) {
      const at = runNpvIrr({ equity: 100_000, operatingFlows: [100_000 * k, 100_000 * k, 100_000 * k], saleProceeds: 100_000, requiredReturn: k, financeRate: null, reinvestmentRate: null });
      expect(at.npv).toBe(0);
      expect(at.profitabilityIndex).toBe(1);
      expect(at.trace.find((l) => l.label.startsWith("NPV at the "))?.value).toBe("$0.00");
      expect(npvIrrHeadline(at)).toMatch(/^The NPV at \S+ is \$0 and/);
    }
  });

  // Review 2026-11-13 (math-review-a), an input set of the reviewer's own, checked in an
  // independent Python implementation written from the scope (bisection IRR).
  it("a capital call in year 1 and a zero year match the reviewer's own calculation", () => {
    const r = runNpvIrr({ equity: 500_000, operatingFlows: [-50_000, 0, 80_000, 90_000], saleProceeds: 600_000, requiredReturn: 0, financeRate: 0.05, reinvestmentRate: 0.05 });
    expect(r.signChanges).toBe(1);
    cents(r.npv, 220_000);
    rate(r.profitabilityIndex, 1.44);
    rate(r.irr, 0.09246812841227114);
    cents(r.atIrr?.operations, 78_773.05201711107);
    cents(r.atIrr?.sale, 421_226.9479828885);
    expect(r.paybackYear).toBe(4);
    cents(r.mirrParts?.futureValueOfInflows, 774_000);
    cents(r.mirrParts?.presentValueOfOutlays, 500_000 + 50_000 / 1.05);
    rate(r.mirr, 0.09034918618905241);
  });

  it("counts sign changes with zero years skipped", () => {
    expect(countSignChanges([-1, 0, 0, 2])).toBe(1);
    expect(countSignChanges([-1, 2, 0, -3, 4])).toBe(3);
    expect(countSignChanges([0, 0])).toBe(0);
  });
});

describe("npv-irr input", () => {
  const issues = (over: Record<string, unknown>) => {
    const p = npvIrrInput.safeParse({ ...ex, ...over });
    expect(p.success).toBe(false);
    return p.error?.issues ?? [];
  };

  it("accepts the worked example and a fifty-year hold, and refuses a fifty-first year", () => {
    expect(npvIrrInput.safeParse(ex).success).toBe(true);
    expect(npvIrrInput.safeParse({ ...ex, operatingFlows: Array(50).fill(1000) }).success).toBe(true);
    expect(plainIssue(issues({ operatingFlows: Array(51).fill(1000) })[0]!)).toBe("At most 50.");
  });

  it("refuses an empty hold, a blank year, no equity and a negative sale in plain words", () => {
    const empty = issues({ operatingFlows: [] })[0]!;
    expect(empty.path).toEqual(["operatingFlows"]);
    expect(plainIssue(empty)).toBe("Add at least one.");
    const blank = issues({ operatingFlows: [100_000, Number.NaN] })[0]!;
    expect(blank.path).toEqual(["operatingFlows", 1]);
    expect(plainIssue(blank, "money")).toBe("Enter a number.");
    expect(plainIssue(issues({ equity: 0 })[0]!, "money")).toBe("Must be more than zero.");
    expect(plainIssue(issues({ saleProceeds: -1 })[0]!, "money")).toBe("Cannot be negative.");
    expect(plainIssue(issues({ requiredReturn: 1.5 })[0]!, "pct")).toBe("At most 100%.");
  });

  it("asks for both modified-IRR rates or neither, on the missing one", () => {
    const a = issues({ financeRate: 0.06, reinvestmentRate: null });
    expect(a).toHaveLength(1);
    expect(a[0]?.path).toEqual(["reinvestmentRate"]);
    expect(plainIssue(a[0]!)).toBe("Give a reinvestment rate as well, or clear the finance rate.");
    const b = issues({ financeRate: null, reinvestmentRate: 0.05 });
    expect(b[0]?.path).toEqual(["financeRate"]);
    expect(plainIssue(b[0]!)).toBe("Give a finance rate as well, or clear the reinvestment rate.");
    expect(npvIrrInput.safeParse({ ...ex, financeRate: null, reinvestmentRate: null }).success).toBe(true);
  });

  it("refuses a field it does not know, and run throws on bad input", () => {
    expect(npvIrrInput.safeParse({ ...ex, holdYears: 5 }).success).toBe(false);
    expect(() => runNpvIrr({ ...ex, equity: -5 })).toThrow();
  });
});
