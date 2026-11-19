import { describe, expect, it } from "vitest";
import { CAP_RATE_EXAMPLE, capRateInput, runCapRate, type CapRateInput } from "@/lib/calculators/cap-rate";

// The worked example's values were computed independently in Python on
// 2026-11-13 (decimal module at 40 digits; the loan constant from the annuity
// closed form and again by summing the monthly discount factors), not by
// porting this module. Rates are compared to 1e-9, shares to 1e-12.

const close = (actual: number | null | undefined, expected: number, digits = 9) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(actual as number).toBeCloseTo(expected, digits);
};

const NO_LOAN = { ltv: null, rate: null, amortYears: null, equityDividendRate: null, minDscr: null };
const withInput = (patch: Partial<CapRateInput>): CapRateInput => ({ ...CAP_RATE_EXAMPLE, ...patch });

// The first issue's path and message, for a plain-words check.
function rejects(input: unknown): { path: string; message: string }[] {
  const p = capRateInput.safeParse(input);
  expect(p.success).toBe(false);
  return (p.error?.issues ?? []).map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

describe("cap rate worked example (Python, 2026-11-13)", () => {
  const r = runCapRate(CAP_RATE_EXAMPLE);

  it("extracts each sale's rate and the mean, median and price-weighted rate", () => {
    expect(r.comps.map((c) => c.capRate)).toEqual([0.065, 0.07, 0.075, 0.0675].map((x) => expect.closeTo(x, 12)));
    close(r.extraction?.mean, 0.069375);
    close(r.extraction?.median, 0.06875);
    close(r.extraction?.weighted, 0.06868421052631579);
    close(r.extraction?.low, 0.065);
    close(r.extraction?.high, 0.075);
    expect(r.extraction?.totalPrice).toBe(19_000_000);
    expect(r.extraction?.totalNoi).toBe(1_305_000);
  });

  it("builds the loan constant from the monthly payment", () => {
    close(r.monthlyPaymentPerDollar, 0.005995505251527524, 12);
    close(r.loanConstant, 0.07194606301833029);
  });

  it("gives the band of investment and the lender's formula", () => {
    close(r.band?.debtPart, 0.04316763781099817);
    close(r.band?.equityPart, 0.032);
    close(r.band?.rate, 0.07516763781099817);
    close(r.lender, 0.05395954726374772);
  });

  it("gives the range of the three methods and its spread", () => {
    expect(r.methods.map((m) => m.key)).toEqual(["extraction", "band", "lender"]);
    expect(r.low.key).toBe("lender");
    expect(r.high.key).toBe("band");
    close(r.low.rate, 0.05395954726374772);
    close(r.high.rate, 0.07516763781099817);
    close(r.spread, 0.021208090547250457);
    expect(r.trace.at(-1)?.value).toBe("212 bp");
    expect(r.notes).toEqual([]);
  });

  it("traces every figure in the order it was computed", () => {
    expect(r.trace.map((l) => l.label)).toEqual([
      "Cap rate, Sale A",
      "Cap rate, Sale B",
      "Cap rate, Sale C",
      "Cap rate, Sale D",
      "Mean of the sales",
      "Median of the sales",
      "Price-weighted rate",
      "Range of the sales",
      "Monthly payment per $1 of loan",
      "Loan constant",
      "Debt part",
      "Equity part",
      "Band of investment",
      "Lender's formula",
      "Low end",
      "High end",
      "Spread",
    ]);
    expect(r.trace.find((l) => l.label === "Band of investment")?.value).toBe("7.52%");
    expect(r.trace.find((l) => l.label === "Lender's formula")?.value).toBe("5.40%");
  });
});

describe("cap rate invariants", () => {
  const r = runCapRate(CAP_RATE_EXAMPLE);

  it("the price shares sum to one and weight the sales' rates into the price-weighted rate", () => {
    const shares = r.comps.reduce((s, c) => s + c.priceShare, 0);
    expect(shares).toBeCloseTo(1, 12);
    const weightedByShare = r.comps.reduce((s, c) => s + c.priceShare * c.capRate, 0);
    close(weightedByShare, r.extraction?.weighted ?? Number.NaN, 12);
    // the NOI that goes in comes back out: each rate times its price returns the NOI
    for (const c of r.comps) expect(c.capRate * c.price).toBeCloseTo(c.noi, 6);
  });

  it("the price-weighted rate lies between the lowest and highest sale", () => {
    const e = r.extraction;
    expect(e).not.toBeNull();
    expect(e!.weighted).toBeGreaterThanOrEqual(e!.low);
    expect(e!.weighted).toBeLessThanOrEqual(e!.high);
  });

  it("band less the constant is the equity share times the equity rate less the constant", () => {
    const mc = r.loanConstant!;
    const d = CAP_RATE_EXAMPLE;
    close(r.band!.rate - mc, (1 - d.ltv!) * (d.equityDividendRate! - mc), 12);
    // the debt and equity shares sum to one
    expect(d.ltv! + (1 - d.ltv!)).toBe(1);
  });

  it("the lender's rate divided by the loan-to-value and the constant gives back the coverage", () => {
    close(r.lender! / CAP_RATE_EXAMPLE.ltv! / r.loanConstant!, CAP_RATE_EXAMPLE.minDscr!, 12);
  });

  it("with the equity rate equal to the constant, the band equals the constant (flat case)", () => {
    const mc = r.loanConstant!;
    const flat = runCapRate(withInput({ equityDividendRate: mc }));
    close(flat.band?.rate, mc, 12);
  });

  it("every method lies inside the low and high", () => {
    for (const m of r.methods) {
      expect(m.rate).toBeGreaterThanOrEqual(r.low.rate);
      expect(m.rate).toBeLessThanOrEqual(r.high.rate);
    }
  });

  it("is pure: the same input gives the same answer", () => {
    expect(JSON.stringify(runCapRate(CAP_RATE_EXAMPLE))).toBe(JSON.stringify(r));
  });
});

describe("cap rate edge cases", () => {
  it("one sale: mean, median and price-weighted are that sale's rate, and its share is one", () => {
    const one = runCapRate({ ...NO_LOAN, comps: [{ label: "Only sale", price: 4_000_000, noi: 260_000 }] });
    close(one.extraction?.mean, 0.065, 12);
    close(one.extraction?.median, 0.065, 12);
    close(one.extraction?.weighted, 0.065, 12);
    expect(one.comps[0]?.priceShare).toBe(1);
    // one method: low equals high, spread zero
    expect(one.methods).toHaveLength(1);
    expect(one.low.rate).toBe(one.high.rate);
    expect(one.spread).toBe(0);
    expect(one.loanConstant).toBeNull();
    expect(one.band).toBeNull();
    expect(one.lender).toBeNull();
  });

  it("an odd count takes the middle sale as the median", () => {
    const three = runCapRate({ ...NO_LOAN, comps: CAP_RATE_EXAMPLE.comps.slice(0, 3) });
    close(three.extraction?.median, 0.07, 12);
  });

  it("interest only: the loan constant is the rate (Python: band 6.80%, lender 4.50%)", () => {
    const io = runCapRate(withInput({ amortYears: 0 }));
    close(io.loanConstant, 0.06, 12);
    expect(io.monthlyPaymentPerDollar).toBe(0);
    close(io.band?.rate, 0.068, 12);
    close(io.lender, 0.045, 12);
    expect(io.trace.some((l) => l.label === "Monthly payment per $1 of loan")).toBe(false);
  });

  it("a zero rate on an amortizing loan gives a constant of one over the amortization", () => {
    const z = runCapRate(withInput({ rate: 0 }));
    close(z.loanConstant, 1 / 30, 12);
  });

  it("the loan methods run without comps", () => {
    const loanOnly = runCapRate({ ...CAP_RATE_EXAMPLE, comps: [] });
    expect(loanOnly.extraction).toBeNull();
    expect(loanOnly.methods.map((m) => m.key)).toEqual(["band", "lender"]);
    close(loanOnly.spread, 0.07516763781099817 - 0.05395954726374772);
  });

  it("one loan method alone gives a zero spread", () => {
    const bandOnly = runCapRate({ ...CAP_RATE_EXAMPLE, comps: [], minDscr: null });
    expect(bandOnly.methods.map((m) => m.key)).toEqual(["band"]);
    expect(bandOnly.lender).toBeNull();
    expect(bandOnly.spread).toBe(0);
    expect(bandOnly.trace.at(-1)?.value).toBe("0 bp");
  });

  // Review 2026-11-13 (math-review-a): an input set of the reviewer's own (four sales, two
  // at the same rate, so the median is the mean of the middle two), checked in an
  // independent Python implementation written from the scope and spec.
  it("a second set of sales and a 65% loan match the reviewer's own calculation", () => {
    const r = runCapRate({
      comps: [
        { label: "X", price: 3_000_000, noi: 195_000 },
        { label: "Y", price: 7_500_000, noi: 525_000 },
        { label: "Z", price: 1_200_000, noi: 90_000 },
        { label: "W", price: 2_000_000, noi: 150_000 },
      ],
      ltv: 0.65,
      rate: 0.0675,
      amortYears: 25,
      equityDividendRate: 0.09,
      minDscr: 1.3,
    });
    close(r.extraction?.mean, 0.07125);
    close(r.extraction?.median, 0.0725);
    close(r.extraction?.weighted, 960_000 / 13_700_000);
    close(r.loanConstant, 0.08290938302551765);
    close(r.band?.rate, 0.08539109896658648);
    close(r.lender, 0.07005842865656241);
    expect(r.low.key).toBe("lender");
    expect(r.high.key).toBe("band");
    close(r.spread, 0.015332670310024069);
  });

  it("notes a minimum coverage below 1.00x", () => {
    const low = runCapRate(withInput({ minDscr: 0.9 }));
    expect(low.notes).toHaveLength(1);
    expect(low.notes[0]).toMatch(/below 1\.00x/);
  });
});

describe("cap rate rejects bad input in plain words", () => {
  it("rejects a sale with zero or negative NOI, naming the sale", () => {
    const zero = rejects(withInput({ comps: [{ label: "Sale Z", price: 3_000_000, noi: 0 }] }));
    expect(zero).toContainEqual({ path: "comps.0.noi", message: "NOI must be more than zero for Sale Z" });
    const neg = rejects(withInput({ comps: [{ label: "Sale N", price: 3_000_000, noi: -50_000 }] }));
    expect(neg).toContainEqual({ path: "comps.0.noi", message: "NOI must be more than zero for Sale N" });
  });

  it("rejects a sale with no price", () => {
    expect(rejects(withInput({ comps: [{ label: "Sale P", price: 0, noi: 100_000 }] }))).toContainEqual({
      path: "comps.0.price",
      message: "price must be more than zero for Sale P",
    });
  });

  it("rejects a loan given in part", () => {
    const issues = rejects(withInput({ amortYears: null }));
    expect(issues.map((i) => i.path)).toContain("amortYears");
    expect(issues.find((i) => i.path === "amortYears")?.message).toMatch(/loan-to-value, rate and amortization together/);
  });

  it("rejects an equity rate or a coverage with no loan", () => {
    const issues = rejects({ ...CAP_RATE_EXAMPLE, ltv: null, rate: null, amortYears: null });
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["equityDividendRate", "minDscr"]));
  });

  it("rejects input that runs no method", () => {
    expect(rejects({ ...NO_LOAN, comps: [] })).toContainEqual({
      path: "comps",
      message: "give at least one method: a comparable sale, or the loan with an equity dividend rate or a minimum coverage",
    });
    // a loan alone, with neither the equity rate nor a coverage, runs no method
    expect(rejects({ ...CAP_RATE_EXAMPLE, comps: [], equityDividendRate: null, minDscr: null }).map((i) => i.path)).toContain("comps");
  });

  it("rejects an interest-only loan at a zero rate", () => {
    expect(rejects(withInput({ amortYears: 0, rate: 0 })).map((i) => i.path)).toContain("rate");
  });

  it("rejects out-of-range rates, a full loan-to-value and an unknown field", () => {
    expect(rejects(withInput({ ltv: 1 })).map((i) => i.path)).toContain("ltv");
    expect(rejects(withInput({ ltv: 0 })).map((i) => i.path)).toContain("ltv");
    expect(rejects(withInput({ rate: -0.01 })).map((i) => i.path)).toContain("rate");
    expect(rejects(withInput({ amortYears: 25.5 })).map((i) => i.path)).toContain("amortYears");
    expect(rejects(withInput({ minDscr: 0 })).map((i) => i.path)).toContain("minDscr");
    expect(rejects({ ...CAP_RATE_EXAMPLE, comps: [{ label: "", price: 1_000_000, noi: 70_000 }] }).map((i) => i.path)).toContain("comps.0.label");
    expect(capRateInput.safeParse({ ...CAP_RATE_EXAMPLE, comps: [{ label: "X", price: 1, noi: 1, extra: 1 }] }).success).toBe(false);
  });
});
