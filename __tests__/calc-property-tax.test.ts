import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { MAX_UNITS, PROPERTY_TAX_EXAMPLE, propertyTaxInput, runPropertyTax, type PropertyTaxInput } from "@/lib/calculators/property-tax";

// The worked example's expected values were computed independently in Python on
// 2026-11-13, with the decimal module for money and the datetime module's own day
// counts for the proration, written from the method rather than from this module.
// Money is compared to the cent, rates and shares to 1e-9.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};
const close = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(1e-9);
};

// A plain case to vary: $1,000,000 at $2.00 per $100, nothing else asked.
const base = (p: Partial<PropertyTaxInput> = {}): PropertyTaxInput => ({
  appraisedValue: 1_000_000,
  assessmentRatio: 1,
  units: [{ name: "Unit A", rate: 0.02 }],
  purchasePrice: null,
  protestReduction: null,
  closingDate: null,
  sellerOwnsClosingDay: true,
  taxUnpaidAtClosing: true,
  ...p,
});

const issueAt = (input: unknown, path: string, kind: "money" | "pct" | "number" = "number") => {
  const p = propertyTaxInput.safeParse(input);
  expect(p.success).toBe(false);
  const issue = p.error?.issues.find((i) => i.path.join(".") === path);
  expect(issue, path).toBeDefined();
  return issue ? plainIssue(issue, kind) : "";
};

describe("property-tax worked example ($4,000,000 appraised, four made-up units)", () => {
  const r = runPropertyTax(PROPERTY_TAX_EXAMPLE);

  it("taxable value, tax by unit, total and effective rate", () => {
    cents(r.taxableValue, 4_000_000);
    expect(r.units.map((u) => u.name)).toEqual(["Example County", "Example City", "Example School District", "Example Utility District"]);
    cents(r.units[0]?.tax, 14_000);
    cents(r.units[1]?.tax, 24_000);
    cents(r.units[2]?.tax, 44_000);
    cents(r.units[3]?.tax, 8_000);
    close(r.combinedRate, 0.0225);
    close(r.units[2]?.per100, 1.1);
    cents(r.totalTax, 90_000);
    close(r.effectiveRate, 0.0225);
  });

  it("each unit's share of the tax", () => {
    close(r.units[0]?.share, 14 / 90);
    close(r.units[1]?.share, 24 / 90);
    close(r.units[2]?.share, 44 / 90);
    close(r.units[3]?.share, 8 / 90);
  });

  it("the tax if the value resets to the $5,000,000 price", () => {
    cents(r.purchase?.taxableValue, 5_000_000);
    cents(r.purchase?.totalTax, 112_500);
    cents(r.purchase?.difference, 22_500);
    close(r.purchase?.effectiveRate, 0.0225);
    cents(r.units[2]?.taxAtPrice, 55_000);
  });

  it("what a $250,000 protest reduction saves", () => {
    cents(r.protest?.appraisedAfter, 3_750_000);
    cents(r.protest?.taxableValue, 3_750_000);
    cents(r.protest?.totalTax, 84_375);
    cents(r.protest?.saving, 5_625);
    cents(r.units[0]?.protestSaving, 875);
  });

  it("the proration on a 2027-09-30 closing, seller owns the day, tax unpaid", () => {
    const p = r.proration;
    expect(p?.year).toBe(2027);
    expect(p?.daysInYear).toBe(365);
    expect(p?.sellerDays).toBe(273);
    expect(p?.buyerDays).toBe(92);
    cents(p?.sellerShare, 67_315.07);
    cents(p?.buyerShare, 22_684.93);
    expect(p?.payer).toBe("seller");
    expect(p?.payee).toBe("buyer");
    cents(p?.credit, 67_315.07);
  });

  it("the trace runs in the order the figures were computed and ends on the credit", () => {
    const labels = r.trace.map((t) => t.label);
    expect(labels[0]).toBe("Taxable value");
    expect(labels.indexOf("Tax for the year")).toBeGreaterThan(labels.indexOf("Tax: Example Utility District"));
    expect(labels.indexOf("Tax at the price")).toBeGreaterThan(labels.indexOf("Effective rate"));
    expect(labels.indexOf("Saved by the protest")).toBeGreaterThan(labels.indexOf("Change in the yearly tax"));
    expect(labels.at(-1)).toBe("Seller credits the buyer");
    expect(r.trace.find((t) => t.label === "Tax for the year")?.value).toBe("$90,000.00");
    expect(r.trace.at(-1)?.value).toBe("$67,315.07");
  });
});

describe("property-tax other conventions, against the same Python check", () => {
  it("buyer owns the closing day and the tax was paid: the buyer credits the seller", () => {
    const r = runPropertyTax({ ...PROPERTY_TAX_EXAMPLE, sellerOwnsClosingDay: false, taxUnpaidAtClosing: false });
    expect(r.proration?.sellerDays).toBe(272);
    expect(r.proration?.buyerDays).toBe(93);
    cents(r.proration?.sellerShare, 67_068.49);
    cents(r.proration?.buyerShare, 22_931.51);
    expect(r.proration?.payer).toBe("buyer");
    expect(r.proration?.payee).toBe("seller");
    cents(r.proration?.credit, 22_931.51);
  });

  it("an assessment ratio below one, and a protest that lowers the appraised value", () => {
    const r = runPropertyTax(
      base({
        assessmentRatio: 0.4,
        units: [
          { name: "Unit A", rate: 0.02 },
          { name: "Unit B", rate: 0.01 },
        ],
        purchasePrice: 1_500_000,
        protestReduction: 100_000,
      }),
    );
    cents(r.taxableValue, 400_000);
    cents(r.totalTax, 12_000);
    close(r.effectiveRate, 0.012);
    cents(r.purchase?.taxableValue, 600_000);
    cents(r.purchase?.totalTax, 18_000);
    cents(r.purchase?.difference, 6_000);
    cents(r.protest?.appraisedAfter, 900_000);
    cents(r.protest?.taxableValue, 360_000);
    cents(r.protest?.saving, 1_200);
  });

  it("leap-year and year-end closings", () => {
    const cases: Array<[string, boolean, number, number, number]> = [
      ["2028-12-31", true, 366, 366, 20_000],
      ["2028-12-31", false, 366, 365, 19_945.36],
      ["2028-01-01", true, 366, 1, 54.64],
      ["2028-01-01", false, 366, 0, 0],
      ["2028-03-01", true, 366, 61, 3_333.33],
      ["2027-12-31", true, 365, 365, 20_000],
    ];
    for (const [closingDate, sellerOwnsClosingDay, daysInYear, sellerDays, sellerShare] of cases) {
      const p = runPropertyTax(base({ closingDate, sellerOwnsClosingDay })).proration;
      expect(p?.daysInYear, closingDate).toBe(daysInYear);
      expect(p?.sellerDays, closingDate).toBe(sellerDays);
      cents(p?.sellerShare, sellerShare);
      cents((p?.sellerShare ?? 0) + (p?.buyerShare ?? 0), 20_000);
    }
  });
});

describe("property-tax invariants", () => {
  const rates = [
    [0.004, 0.0065, 0.0102],
    [0.012],
    [0, 0.0031, 0.0007, 0.0049, 0.0025],
  ];
  const values = [250_000, 1_234_567, 9_000_000];

  it("the units' shares sum to one, and their taxes, prices and savings to the totals", () => {
    for (const rs of rates) {
      for (const v of values) {
        const r = runPropertyTax(
          base({ appraisedValue: v, units: rs.map((rate, i) => ({ name: `Unit ${i + 1}`, rate })), purchasePrice: v * 1.3, protestReduction: v * 0.1 }),
        );
        close(
          r.units.reduce((s, u) => s + (u.share ?? 0), 0),
          1,
        );
        cents(
          r.units.reduce((s, u) => s + u.tax, 0),
          r.totalTax,
        );
        cents(
          r.units.reduce((s, u) => s + (u.taxAtPrice ?? 0), 0),
          r.purchase?.totalTax ?? Number.NaN,
        );
        cents(
          r.units.reduce((s, u) => s + (u.protestSaving ?? 0), 0),
          r.protest?.saving ?? Number.NaN,
        );
      }
    }
  });

  it("the seller's and buyer's shares always sum to the year's tax, and the days to the year", () => {
    const dates = ["2027-01-01", "2027-02-28", "2027-06-15", "2027-12-31", "2028-02-29", "2028-07-04", "2100-03-01", "2000-12-31"];
    for (const closingDate of dates) {
      for (const sellerOwnsClosingDay of [true, false]) {
        for (const taxUnpaidAtClosing of [true, false]) {
          const r = runPropertyTax({ ...PROPERTY_TAX_EXAMPLE, closingDate, sellerOwnsClosingDay, taxUnpaidAtClosing });
          const p = r.proration;
          cents((p?.sellerShare ?? 0) + (p?.buyerShare ?? 0), r.totalTax);
          expect((p?.sellerDays ?? 0) + (p?.buyerDays ?? 0)).toBe(p?.daysInYear);
          expect(p?.sellerShare ?? -1).toBeGreaterThanOrEqual(0);
          expect(p?.buyerShare ?? -1).toBeGreaterThanOrEqual(-0.005);
          cents(p?.credit, taxUnpaidAtClosing ? (p?.sellerShare ?? 0) : (p?.buyerShare ?? 0));
        }
      }
    }
    // 2100 is not a leap year; 2000 is
    expect(runPropertyTax(base({ closingDate: "2100-03-01" })).proration?.daysInYear).toBe(365);
    expect(runPropertyTax(base({ closingDate: "2000-12-31" })).proration?.daysInYear).toBe(366);
  });

  it("a flat case equals the closed form: one unit, ratio one, tax = value × rate", () => {
    for (const v of values) {
      for (const rate of [0.001, 0.0185, 0.05]) {
        const r = runPropertyTax(base({ appraisedValue: v, units: [{ name: "Only unit", rate }] }));
        cents(r.totalTax, v * rate);
        close(r.effectiveRate, rate);
      }
    }
  });

  it("tax is linear in value, effective rate × appraised value is the tax, and the saving is the tax difference", () => {
    const units = PROPERTY_TAX_EXAMPLE.units;
    const tax = (v: number) => runPropertyTax(base({ appraisedValue: v, units })).totalTax;
    cents(tax(1_500_000) + tax(2_500_000), tax(4_000_000));
    for (const v of values) {
      const r = runPropertyTax(base({ appraisedValue: v, units, protestReduction: 40_000 }));
      cents(r.effectiveRate * v, r.totalTax);
      cents(r.protest?.saving, tax(v) - tax(v - 40_000));
    }
  });

  it("the tax rises with the value and with any unit's rate", () => {
    let last = -1;
    for (const v of [100_000, 500_000, 2_000_000, 8_000_000]) {
      const t = runPropertyTax(base({ appraisedValue: v })).totalTax;
      expect(t).toBeGreaterThan(last);
      last = t;
    }
    const lower = runPropertyTax(PROPERTY_TAX_EXAMPLE).totalTax;
    const higher = runPropertyTax({ ...PROPERTY_TAX_EXAMPLE, units: PROPERTY_TAX_EXAMPLE.units.map((u, i) => (i === 1 ? { ...u, rate: u.rate + 0.001 } : u)) }).totalTax;
    expect(higher).toBeGreaterThan(lower);
  });
});

describe("property-tax edge cases", () => {
  it("no taxing units: no tax, no shares, and nothing to prorate", () => {
    const r = runPropertyTax(base({ units: [], purchasePrice: 2_000_000, protestReduction: 50_000, closingDate: "2027-06-30" }));
    expect(r.totalTax).toBe(0);
    expect(r.combinedRate).toBe(0);
    expect(r.effectiveRate).toBe(0);
    expect(r.units).toEqual([]);
    expect(r.purchase?.totalTax).toBe(0);
    expect(r.protest?.saving).toBe(0);
    expect(r.proration?.sellerShare).toBe(0);
    expect(r.proration?.credit).toBe(0);
    expect(r.trace.find((t) => t.label === "Tax for the year")?.formula).toBe("no taxing units");
  });

  it("a zero-rate unit owes nothing and takes no share", () => {
    const r = runPropertyTax(base({ units: [{ name: "Unit A", rate: 0.02 }, { name: "Exempt unit", rate: 0 }] }));
    expect(r.units[1]?.tax).toBe(0);
    expect(r.units[1]?.share).toBe(0);
    cents(r.totalTax, 20_000);
  });

  it("a reduction above the appraised value floors the value at zero", () => {
    const r = runPropertyTax(base({ protestReduction: 1_200_000 }));
    expect(r.protest?.appraisedAfter).toBe(0);
    expect(r.protest?.taxableValue).toBe(0);
    cents(r.protest?.saving, 20_000);
    expect(r.trace.find((t) => t.label === "Appraised value after the protest")?.formula).toContain("floored at $0");
  });

  it("a price below the appraised value lowers the tax: the change is negative", () => {
    const r = runPropertyTax(base({ purchasePrice: 800_000 }));
    cents(r.purchase?.totalTax, 16_000);
    cents(r.purchase?.difference, -4_000);
  });

  it("a zero reduction saves nothing", () => {
    const r = runPropertyTax(base({ protestReduction: 0 }));
    expect(r.protest?.saving).toBe(0);
  });

  it("what-ifs left null are not run and leave no trace lines", () => {
    const r = runPropertyTax(base());
    expect(r.purchase).toBeNull();
    expect(r.protest).toBeNull();
    expect(r.proration).toBeNull();
    expect(r.units[0]?.taxAtPrice).toBeNull();
    expect(r.units[0]?.protestSaving).toBeNull();
    expect(r.trace.map((t) => t.label)).toEqual(["Taxable value", "Tax: Unit A", "Combined rate per $100", "Tax for the year", "Effective rate"]);
  });
});

describe("property-tax rejects bad input in plain words", () => {
  it("a value of zero, a ratio out of range, a negative reduction", () => {
    expect(issueAt(base({ appraisedValue: 0 }), "appraisedValue", "money")).toBe("Must be more than zero.");
    expect(issueAt(base({ assessmentRatio: 0 }), "assessmentRatio")).toBe("Must be more than zero.");
    expect(issueAt(base({ assessmentRatio: 1.2 }), "assessmentRatio")).toBe("At most 1.");
    expect(issueAt(base({ protestReduction: -1 }), "protestReduction", "money")).toBe("Cannot be negative.");
    expect(issueAt(base({ purchasePrice: 0 }), "purchasePrice", "money")).toBe("Must be more than zero.");
  });

  it("a rate typed per $100 as a decimal, a negative rate and a blank name", () => {
    expect(issueAt(base({ units: [{ name: "Unit A", rate: 0.55 }] }), "units.0.rate", "pct")).toBe("At most 5%.");
    expect(issueAt(base({ units: [{ name: "Unit A", rate: -0.001 }] }), "units.0.rate", "pct")).toBe("Cannot be negative.");
    expect(issueAt(base({ units: [{ name: "  ", rate: 0.01 }] }), "units.0.name")).toBe("Fill this in.");
  });

  it("too many units", () => {
    const units = Array.from({ length: MAX_UNITS + 1 }, (_, i) => ({ name: `Unit ${i + 1}`, rate: 0.001 }));
    expect(issueAt(base({ units }), "units")).toBe(`At most ${MAX_UNITS}.`);
  });

  it("a date that is not real or not written as YYYY-MM-DD", () => {
    expect(issueAt(base({ closingDate: "2027-02-30" }), "closingDate")).toBe("Not a real calendar date.");
    expect(issueAt(base({ closingDate: "9/30/2027" }), "closingDate")).toBe("Enter a date.");
  });

  it("a missing number, a field it does not know", () => {
    expect(issueAt({ ...base(), appraisedValue: Number.NaN }, "appraisedValue", "money")).toBe("Enter a number.");
    expect(propertyTaxInput.safeParse({ ...base(), millRate: 20 }).success).toBe(false);
    expect(() => runPropertyTax({ ...base(), assessmentRatio: 2 })).toThrow();
  });
});

// Second review (math-review-b, 2026-11-13): the reviewer's own inputs, worked by hand and in
// a separate Python model (scratch pt.py), and the December 31 guard.
describe("second review", () => {
  it("the reviewer's own case: three units, a price reset, a protest and a September closing", () => {
    const r = runPropertyTax(
      base({
        appraisedValue: 3_000_000,
        units: [
          { name: "County", rate: 0.0035 },
          { name: "City", rate: 0.006 },
          { name: "School", rate: 0.011 },
        ],
        purchasePrice: 3_600_000,
        protestReduction: 150_000,
        closingDate: "2027-09-30",
      }),
    );
    cents(r.totalTax, 61_500);
    cents(r.purchase?.difference, 12_300);
    cents(r.protest?.saving, 3_075);
    expect(r.proration?.sellerDays).toBe(273);
    cents(r.proration?.credit, 45_998.630137);
  });

  it("a December 31 closing the seller owns gives the buyer exactly nothing, never -$0.00", () => {
    for (const closingDate of ["2027-12-31", "2028-12-31"]) {
      for (const taxUnpaidAtClosing of [true, false]) {
        const r = runPropertyTax(
          base({ appraisedValue: 7_040_686.02, units: [{ name: "A", rate: 0.00075 }, { name: "B", rate: 0.00144 }], closingDate, sellerOwnsClosingDay: true, taxUnpaidAtClosing }),
        );
        expect(r.proration?.buyerShare).toBe(0);
        expect(r.proration?.sellerShare).toBe(r.totalTax);
        expect(r.trace.some((l) => l.value.includes("-$0.00"))).toBe(false);
      }
    }
  });
});
