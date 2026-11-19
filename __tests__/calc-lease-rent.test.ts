import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { LEASE_RENT_EXAMPLE, leaseRentInput, runLeaseRent, type LeaseRentInput } from "@/lib/calculators/lease-rent";

// The worked example's expected values, and those of the step, index and zero-rate
// variants, were computed independently in Python on 2026-11-13 with the decimal
// module at 40 digits: per-lease-year sums and closed-form geometric sums for the
// present values, not a month loop. Money is compared to the cent, rates and $/SF
// figures to 1e-6.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};
const close = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(1e-6);
};
const ex = (over: Partial<LeaseRentInput>): LeaseRentInput => ({ ...LEASE_RENT_EXAMPLE, ...over });
const fails = (over: Partial<LeaseRentInput>, path: string) => {
  const p = leaseRentInput.safeParse(ex(over));
  expect(p.success).toBe(false);
  const issue = p.error?.issues.find((i) => i.path.join(".") === path);
  expect(issue, path).toBeDefined();
  return issue ? plainIssue(issue) : "";
};

describe("lease-rent worked example (25,000 SF at $12.00, 66 months, 4% a year, 6 months free, $15 allowance, 5% commission, 9%)", () => {
  const r = runLeaseRent(LEASE_RENT_EXAMPLE);

  it("splits 66 months into five full lease years and a six-month sixth", () => {
    expect(r.leaseYears).toBe(6);
    expect(r.lastYearMonths).toBe(6);
    expect(r.years.map((y) => y.months)).toEqual([12, 12, 12, 12, 12, 6]);
    close(r.appliedEscalation, 0.04);
  });

  it("rate and dollars for every lease year, free months in year 1 only", () => {
    const rates = [12, 12.48, 12.9792, 13.498368, 14.03830272, 14.5998348288];
    const scheduled = [300_000, 312_000, 324_480, 337_459.2, 350_957.568, 182_497.93536];
    r.years.forEach((y, k) => {
      close(y.rate, rates[k] as number);
      cents(y.scheduled, scheduled[k] as number);
    });
    expect(r.years.map((y) => y.freeMonths)).toEqual([6, 0, 0, 0, 0, 0]);
    cents(r.years[0]?.free, 150_000);
    cents(r.years[0]?.payable, 150_000);
  });

  it("total, free and payable rent, the average, and the concessions", () => {
    cents(r.totalRent, 1_807_394.70336);
    cents(r.freeRent, 150_000);
    cents(r.rentPayable, 1_657_394.70336);
    close(r.averageRent, 13.1446887517);
    cents(r.ti, 375_000);
    cents(r.commission, 82_869.735168);
    cents(r.concessions, 607_869.735168);
    cents(r.netRent, 1_199_524.968192);
    close(r.nerSimple, 8.7238179505);
  });

  it("present values and net effective rent on a present-value basis", () => {
    close(r.monthlyDiscountRate, 0.0072073233);
    cents(r.pvRent, 1_285_124.4038244009);
    cents(r.pvLandlord, 827_254.6686564009);
    close(r.annuityFactor, 52.751795431);
    cents(r.levelMonthly, 15_682.0191975966);
    close(r.nerPv, 7.5273692148);
  });

  it("traces each figure in the order it was computed, ending on the present-value rent", () => {
    const labels = r.trace.map((t) => t.label);
    expect(labels[0]).toBe("Lease years");
    expect(labels.slice(1, 7)).toEqual([1, 2, 3, 4, 5, 6].map((y) => `Lease year ${y} base rent`));
    const order = ["Total base rent", "Free rent", "Rent payable", "Average rent", "Improvement allowance", "Leasing commission", "Net effective rent, simple", "Present value of the lease to the landlord", "Net effective rent, present value"];
    const at = order.map((l) => labels.indexOf(l));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(labels.at(-1)).toBe("Net effective rent, present value");
    expect(r.trace.at(-1)?.value).toBe("$7.5274/SF/yr");
    expect(r.trace.find((t) => t.label === "Present value of the lease to the landlord")?.value).toBe("$827,254.67");
    expect(r.trace.find((t) => t.label === "Lease year 6 base rent")?.formula).toContain("× 6 ÷ 12");
  });
});

describe("lease-rent escalation kinds, against the same Python calculation", () => {
  it("a fixed step adds the same dollars each anniversary", () => {
    const r = runLeaseRent(ex({ escalation: "step", escalationStep: 0.5 }));
    expect(r.appliedEscalation).toBeNull();
    r.years.forEach((y, k) => close(y.rate, 12 + 0.5 * k));
    cents(r.totalRent, 1_806_250);
    cents(r.commission, 82_812.5);
    cents(r.pvLandlord, 826_755.142214062);
    close(r.nerSimple, 8.7159090909);
    close(r.nerPv, 7.5228239157);
  });

  it("an index above its cap is held at the cap", () => {
    const r = runLeaseRent(ex({ escalation: "index", escalationRate: 0.06, indexFloor: 0.02, indexCap: 0.035 }));
    close(r.appliedEscalation, 0.035);
    close(r.years[5]?.rate, 14.2522356678);
    cents(r.totalRent, 1_786_892.7085345312);
    cents(r.pvLandlord, 813_502.4951993341);
    close(r.nerPv, 7.4022352131);
  });

  it("an index below its floor is lifted to the floor", () => {
    const r = runLeaseRent(ex({ escalation: "index", escalationRate: 0.01, indexFloor: 0.02, indexCap: 0.035 }));
    close(r.appliedEscalation, 0.02);
    cents(r.totalRent, 1_726_824.16848);
    cents(r.pvLandlord, 773_160.7556017281);
    close(r.nerPv, 7.0351569962);
  });

  it("an index with no floor or cap applies as given, even when it falls", () => {
    const r = runLeaseRent(ex({ escalation: "index", escalationRate: -0.02, indexFloor: null, indexCap: null }));
    close(r.appliedEscalation, -0.02);
    close(r.years[1]?.rate, 11.76);
  });

  it("none keeps year 1's rent for the whole term, whatever the other escalation fields hold", () => {
    const r = runLeaseRent(ex({ escalation: "none", escalationRate: 0.5, escalationStep: 9 }));
    for (const y of r.years) close(y.rate, 12);
    expect(r.appliedEscalation).toBeNull();
  });
});

describe("lease-rent invariants", () => {
  const cases: LeaseRentInput[] = [
    LEASE_RENT_EXAMPLE,
    ex({ escalation: "step", escalationStep: 0.75, freeMonths: 15, termMonths: 85 }),
    ex({ escalation: "index", escalationRate: 0.05, indexFloor: null, indexCap: 0.03, discountRate: 0.12, tiPerSf: 40 }),
    ex({ termMonths: 13, freeMonths: 12, commissionShare: 0, tiPerSf: 0 }),
  ];

  it.each(cases.map((c, k) => [k, c] as const))("case %i: the money that goes in comes out", (_k, c) => {
    const r = runLeaseRent(c);
    cents(r.rentPayable + r.freeRent, r.totalRent);
    cents(r.freeRent + r.ti + r.commission + r.netRent, r.totalRent);
    cents(r.concessions, r.freeRent + r.ti + r.commission);
    cents(r.years.reduce((s, y) => s + y.payable, 0), r.rentPayable);
    expect(r.years.reduce((s, y) => s + y.months, 0)).toBe(c.termMonths);
    expect(r.years.reduce((s, y) => s + y.freeMonths, 0)).toBe(c.freeMonths);
    close(r.shares.free + r.shares.ti + r.shares.commission + r.shares.net, 1);
    // the level rent with the same present value gives back that present value
    cents(((r.nerPv * c.area) / 12) * r.annuityFactor, r.pvLandlord);
  });

  it("with no free rent, allowance, commission or escalation, both net effective rents equal the rent, at any discount rate", () => {
    for (const discountRate of [0, 0.05, 0.09, 0.2]) {
      const r = runLeaseRent(ex({ escalation: "none", freeMonths: 0, tiPerSf: 0, commissionShare: 0, discountRate, termMonths: 60 }));
      close(r.averageRent, 12);
      close(r.nerSimple, 12);
      close(r.nerPv, 12);
    }
  });

  it("the flat case's present value equals the closed form: monthly rent times the annuity-due factor (Python)", () => {
    const r = runLeaseRent(ex({ escalation: "none", freeMonths: 0, tiPerSf: 0, commissionShare: 0, termMonths: 60 }));
    cents(r.pvRent, 1_223_032.6569158002);
    close(r.annuityFactor, 48.9213062766);
    cents(r.levelMonthly, 25_000);
  });

  it("at a zero discount rate the two net effective rents agree", () => {
    const r = runLeaseRent(ex({ discountRate: 0 }));
    expect(r.monthlyDiscountRate).toBe(0);
    expect(r.annuityFactor).toBe(66);
    cents(r.pvLandlord, r.netRent);
    close(r.nerPv, r.nerSimple);
    // Python, d = 0
    cents(r.levelMonthly, 18_174.6207301818);
  });

  it("each extra dollar of allowance or commission lowers the landlord's present value by a dollar", () => {
    const base = runLeaseRent(LEASE_RENT_EXAMPLE);
    const moreTi = runLeaseRent(ex({ tiPerSf: 16 }));
    cents(base.pvLandlord - moreTi.pvLandlord, 25_000);
    const moreLc = runLeaseRent(ex({ commissionShare: 0.06 }));
    cents(base.pvLandlord - moreLc.pvLandlord, 0.01 * base.rentPayable);
    expect(moreLc.pvRent).toBe(base.pvRent);
  });

  it("a higher discount rate lowers the present-value rent and leaves the simple one alone", () => {
    const lo = runLeaseRent(ex({ discountRate: 0.05 }));
    const hi = runLeaseRent(ex({ discountRate: 0.12 }));
    expect(hi.pvLandlord).toBeLessThan(lo.pvLandlord);
    close(hi.nerSimple, lo.nerSimple);
  });
});

describe("lease-rent edge cases", () => {
  it("free rent that runs past the first lease year abates the second year's rate too", () => {
    const r = runLeaseRent(ex({ freeMonths: 15 }));
    expect(r.years.map((y) => y.freeMonths)).toEqual([12, 3, 0, 0, 0, 0]);
    // by hand: a full year at $12.00 on 25,000 SF, then 3 months at $12.48
    cents(r.freeRent, 300_000 + (3 * 12.48 * 25_000) / 12);
  });

  it("a one-month lease: rent in advance is not discounted, and concessions larger than the rent give a negative net effective rent (Python)", () => {
    const r = runLeaseRent(ex({ termMonths: 1, freeMonths: 0 }));
    expect(r.leaseYears).toBe(1);
    expect(r.lastYearMonths).toBe(1);
    cents(r.pvRent, 25_000);
    expect(r.annuityFactor).toBeCloseTo(1, 12);
    close(r.nerSimple, -168.6);
    close(r.nerPv, -168.6);
  });

  it("a whole-year term has no partial year", () => {
    const r = runLeaseRent(ex({ termMonths: 120 }));
    expect(r.leaseYears).toBe(10);
    expect(r.lastYearMonths).toBe(12);
    expect(r.trace[0]?.value).toBe("10");
  });

  it("a falling step is allowed while the rent stays at or above zero", () => {
    expect(leaseRentInput.safeParse(ex({ escalation: "step", escalationStep: -2 })).success).toBe(true);
    const r = runLeaseRent(ex({ escalation: "step", escalationStep: -2 }));
    close(r.years[5]?.rate, 2);
    expect(r.years.every((y) => y.scheduled >= 0)).toBe(true);
  });
});

describe("lease-rent rejects bad input in plain words", () => {
  it("free rent as long as the term", () => {
    expect(fails({ freeMonths: 66 }, "freeMonths")).toBe("Free rent must end before the lease does: enter fewer months than the term.");
    expect(fails({ termMonths: 6 }, "freeMonths")).toMatch(/^Free rent must end/);
  });

  it("a step that takes the rent below zero", () => {
    expect(fails({ escalation: "step", escalationStep: -2.5 }, "escalationStep")).toBe("The step takes the rent below zero by lease year 6.");
  });

  it("an index cap below its floor, but only when the index is in use", () => {
    expect(fails({ escalation: "index", indexFloor: 0.04, indexCap: 0.02 }, "indexCap")).toBe("The cap cannot be below the floor.");
    expect(leaseRentInput.safeParse(ex({ escalation: "percent", indexFloor: 0.04, indexCap: 0.02 })).success).toBe(true);
  });

  it("a zero term, fractional months, a negative allowance, a full commission and unknown fields", () => {
    expect(fails({ termMonths: 0 }, "termMonths")).toBe("At least 1.");
    expect(fails({ termMonths: 12.5 }, "termMonths")).toBe("Whole numbers only.");
    expect(fails({ tiPerSf: -1 }, "tiPerSf")).toBe("Cannot be negative.");
    expect(fails({ commissionShare: 1 }, "commissionShare")).toBe("Less than 1.");
    expect(fails({ area: 0 }, "area")).toBe("Must be more than zero.");
    expect(leaseRentInput.safeParse({ ...LEASE_RENT_EXAMPLE, rent: 5 }).success).toBe(false);
    expect(() => runLeaseRent(ex({ freeMonths: 70 }))).toThrow();
  });
});

// Second review (math-review-b, 2026-11-13): the reviewer's own inputs, pinned to a separate
// Python model (decimal, a month loop) written before the TypeScript was read (scratch lr.py).
describe("second review: a 41-month lease on an index held at its cap", () => {
  const r = runLeaseRent(
    ex({ area: 7_500, rentPerSf: 24, termMonths: 41, escalation: "index", escalationRate: 0.045, indexFloor: 0.02, indexCap: 0.035, freeMonths: 2, tiPerSf: 0, commissionShare: 0.04, discountRate: 0.07 }),
  );

  it("matches the reviewer's model", () => {
    expect(r.years.map((y) => y.months)).toEqual([12, 12, 12, 5]);
    close(r.years[3]?.rate, 26.609229);
    cents(r.years[3]?.scheduled, 83_153.840625);
    cents(r.totalRent, 642_274.340625);
    cents(r.freeRent, 30_000);
    cents(r.commission, 24_490.973625);
    cents(r.pvLandlord, 519_382.597743);
    close(r.averageRent, 25.064364512195);
    close(r.nerSimple, 22.937887492683);
    close(r.nerPv, 22.637605739881);
  });

  it("the concessions' share of total base rent is a field of the result", () => {
    close(r.concessionsShare, 54_490.973625 / 642_274.340625);
    close(r.concessionsShare, r.shares.free + r.shares.ti + r.shares.commission);
  });
});
