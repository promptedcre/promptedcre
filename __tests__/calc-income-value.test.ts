import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { incomeValueFigures, incomeValueHeadline } from "@/components/calc/income-value-info";
import { INCOME_VALUE_EXAMPLE, incomeValueInput, runIncomeValue, type IncomeValueInput } from "@/lib/calculators/income-value";

// The worked example's expected values were computed independently in Python on
// 2026-11-13 with exact rational arithmetic (fractions.Fraction), building NOI as
// collected income less every outflow in one expression, not by porting this module.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(0.005);
};
const rate = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(1e-9);
};

const ex = INCOME_VALUE_EXAMPLE;
const run = (over: Partial<IncomeValueInput>) => runIncomeValue({ ...ex, ...over });

describe("income-value worked example (pinned to Python)", () => {
  const r = runIncomeValue(ex);

  it("builds potential gross income down to NOI", () => {
    cents(r.vacancyLoss, 25_000);
    cents(r.egi, 485_000);
    cents(r.opex, 100_000);
    cents(r.noiBeforeReserves, 385_000);
    cents(r.reserves, 8_000);
    cents(r.noiAfterReserves, 377_000);
    rate(r.expenseRatio, 20 / 97);
    rate(r.expenseRatioWithReserves, 108 / 485);
  });

  it("capitalizes NOI after reserves, and reads the price against the value", () => {
    expect(r.capitalized).toBe("afterReserves");
    cents(r.noiCapitalized, 377_000);
    cents(r.value, 37_700_000 / 7); // $5,385,714.29
    cents(r.valuePerSf, 1885 / 14); // $134.64
    rate(r.gim, 10);
    rate(r.impliedCapRate, 377 / 5000);
    cents(r.valueLessPrice, 2_700_000 / 7);
    expect(r.notes).toEqual(["The price is $385,714 below the capitalized value."]);
  });

  it("gives value at the cap rate and 25 and 50 basis points either side", () => {
    [0.065, 0.0675, 0.07, 0.0725, 0.075].forEach((x, i) => rate(r.sensitivity[i]?.capRate, x));
    const expected = [5_800_000, 150_800_000 / 27, 37_700_000 / 7, 5_200_000, 15_080_000 / 3];
    const perSf = [145, 3770 / 27, 1885 / 14, 130, 377 / 3];
    expect(r.sensitivity).toHaveLength(5);
    r.sensitivity.forEach((s, i) => {
      cents(s.value, expected[i] as number);
      cents(s.valuePerSf, perSf[i] as number);
    });
    expect(r.sensitivity[2]?.value).toBe(r.value);
  });

  it("capitalizes NOI before reserves when asked", () => {
    const b = run({ capitalize: "beforeReserves" });
    cents(b.noiCapitalized, 385_000);
    cents(b.value, 5_500_000);
    rate(b.impliedCapRate, 0.077);
  });

  it("says the value, the NOI it rests on and the cap rate in one sentence", () => {
    expect(incomeValueHeadline(r)).toBe("Capitalized at 7.00%, $377,000 of NOI after reserves is worth $5,385,714.");
    expect(incomeValueHeadline(run({ expenses: [{ label: "Taxes", amount: 480_000 }] }))).toBe("The NOI after reserves is -$3,000, so there is no value to capitalize.");
  });

  it("traces every figure in the order it was computed", () => {
    expect(r.trace.map((t) => t.label)).toEqual([
      "Vacancy and collection loss",
      "Effective gross income",
      "Operating expenses",
      "NOI before reserves",
      "NOI after reserves",
      "Expense ratio",
      "Expense ratio with reserves",
      "Value by direct capitalization, on NOI after reserves",
      "Value per square foot",
      "Gross income multiplier",
      "Cap rate implied by the price",
      "Value less price",
      "Value at a 6.50% cap rate",
      "Value at a 6.75% cap rate",
      "Value at a 7.25% cap rate",
      "Value at a 7.50% cap rate",
    ]);
    expect(r.trace[7]?.value).toBe("$5,385,714.29");
    expect(r.trace[8]?.value).toBe("$134.64");
  });
});

// Hand-picked cases: several shapes of building, all synthetic.
const CASES: IncomeValueInput[] = [
  ex,
  { ...ex, capitalize: "beforeReserves", price: 7_000_000 },
  { ...ex, reserves: null, otherIncome: 0, vacancy: 0.12 },
  { ...ex, expenses: [{ label: "Taxes", amount: 90_000 }], capRate: 0.055, area: 12_345 },
  { ...ex, pgi: 1_234_567, vacancy: 0.0333, otherIncome: 4_321, capRate: 0.0815, price: 13_000_000 },
];

describe("invariants", () => {
  it.each(CASES.map((c, i) => [i, c] as const))("case %i: money in equals money out, shares sum to one", (_, c) => {
    const r = runIncomeValue(c);
    const out = r.vacancyLoss + r.opex + r.reserves + r.noiAfterReserves;
    expect(Math.abs(c.pgi + c.otherIncome - out)).toBeLessThan(1e-6);
    expect(Math.abs(r.egi - r.opex - r.reserves - r.noiAfterReserves)).toBeLessThan(1e-6);
    expect(Math.abs(r.noiBeforeReserves - r.noiAfterReserves - r.reserves)).toBeLessThan(1e-6);
    const shares = r.egiShares.reduce((a, s) => a + s.share, 0);
    expect(Math.abs(shares - 1)).toBeLessThan(1e-12);
  });

  it.each(CASES.map((c, i) => [i, c] as const))("case %i: value times cap rate is the NOI, and the price test agrees", (_, c) => {
    const r = runIncomeValue(c);
    expect(r.value).not.toBeNull();
    const v = r.value as number;
    expect(Math.abs(v * c.capRate - r.noiCapitalized)).toBeLessThan(1e-6);
    if (c.area !== null) expect(Math.abs((r.valuePerSf as number) * c.area - v)).toBeLessThan(1e-6);
    if (c.price !== null) {
      expect(Math.abs((r.impliedCapRate as number) * c.price - r.noiCapitalized)).toBeLessThan(1e-6);
      expect((r.impliedCapRate as number) > c.capRate).toBe(c.price < v);
      expect(Math.abs((r.gim as number) * c.pgi - c.price)).toBeLessThan(1e-6);
    }
    for (let i = 1; i < r.sensitivity.length; i += 1) {
      expect((r.sensitivity[i]?.value as number) < (r.sensitivity[i - 1]?.value as number)).toBe(true);
    }
  });

  it("a flat case equals the closed form: no loss, no other income, no expenses, no reserves", () => {
    const r = run({ vacancy: 0, otherIncome: 0, expenses: [], reserves: null, capRate: 0.08, price: 6_000_000 });
    cents(r.noiCapitalized, 500_000);
    cents(r.value, 6_250_000); // PGI ÷ R
    rate(r.gim, 12);
    rate(r.impliedCapRate, 1 / 12); // with NOI equal to PGI, the implied cap rate is 1 ÷ GIM
    rate(r.expenseRatio, 0);
  });
});

describe("edge cases", () => {
  it("no expense lines: operating expenses and the ratio are zero", () => {
    const r = run({ expenses: [] });
    expect(r.opex).toBe(0);
    expect(r.expenseRatio).toBe(0);
    expect(r.trace[2]?.formula).toBe("no expense lines entered");
    cents(r.noiBeforeReserves, 485_000);
  });

  it("no reserves: both NOIs and both values match", () => {
    const a = run({ reserves: null });
    const b = run({ reserves: null, capitalize: "beforeReserves" });
    expect(a.reserves).toBe(0);
    expect(a.noiAfterReserves).toBe(a.noiBeforeReserves);
    expect(a.value).toBe(b.value);
    cents(a.value, 5_500_000);
  });

  it("no area: value per square foot is null, and so is each per-square-foot figure", () => {
    const r = run({ area: null });
    expect(r.valuePerSf).toBeNull();
    expect(r.statement.every((s) => s.perSf === null)).toBe(true);
    expect(r.sensitivity.every((s) => s.valuePerSf === null)).toBe(true);
    expect(r.trace.some((t) => t.label === "Value per square foot")).toBe(false);
  });

  it("no price: no multiplier, implied cap rate or price test", () => {
    const r = run({ price: null });
    expect(r.gim).toBeNull();
    expect(r.impliedCapRate).toBeNull();
    expect(r.valueLessPrice).toBeNull();
    expect(r.notes).toEqual([]);
  });

  it("a price above the value says so, and its implied cap rate is under the cap rate", () => {
    const r = run({ price: 6_000_000 });
    cents(r.valueLessPrice, 37_700_000 / 7 - 6_000_000);
    expect(r.notes).toEqual(["The price is $614,286 above the capitalized value."]);
    expect((r.impliedCapRate as number) < ex.capRate).toBe(true);
  });

  // Review 2026-11-13 (math-review-a): $70,000 ÷ 0.07 is 999,999.9999999999 in floating
  // point, so a $1,000,000 price once printed "-$0.00" and "$0 above the capitalized value".
  it("a price equal to the value is no gap, never a minus zero", () => {
    for (const [noi, cap] of [[70_000, 0.07], [72_500, 0.0725]] as const) {
      const r = run({ area: null, pgi: noi, otherIncome: 0, vacancy: 0, expenses: [], reserves: null, capRate: cap, price: 1_000_000 });
      expect(r.valueLessPrice).toBe(0);
      expect(r.trace.find((t) => t.label === "Value less price")?.value).toBe("$0.00");
      expect(r.notes).toEqual(["The price equals the capitalized value, to the dollar."]);
      const lead = incomeValueFigures({ ...ex, price: 1_000_000 }, r).rest.find((h) => h.label === "Value less price");
      expect(lead).toMatchObject({ value: "$0", sub: "priced at the value" });
    }
  });

  // Review 2026-11-13 (math-review-a), an input set of the reviewer's own, checked in an
  // independent Python implementation written from the scope: 25,000 SF, $300,000 PGI,
  // $4,000 other income, 8% loss, three expense lines, $5,000 reserves, 7.25% cap rate.
  it("a second building matches the reviewer's own calculation", () => {
    const r = runIncomeValue({
      area: 25_000,
      pgi: 300_000,
      otherIncome: 4_000,
      vacancy: 0.08,
      expenses: [
        { label: "Taxes", amount: 36_000 },
        { label: "Insurance", amount: 9_000 },
        { label: "Common area", amount: 21_000 },
      ],
      reserves: 5_000,
      capRate: 0.0725,
      capitalize: "afterReserves",
      price: 2_900_000,
    });
    cents(r.egi, 280_000);
    cents(r.noiAfterReserves, 209_000);
    cents(r.value, 209_000 / 0.0725); // $2,882,758.62
    cents(r.valueLessPrice, 209_000 / 0.0725 - 2_900_000);
    rate(r.impliedCapRate, 209_000 / 2_900_000);
    expect(r.notes).toEqual(["The price is $17,241 above the capitalized value."]);
  });

  it("NOI of zero or less gives no value, no sensitivity and a plain note", () => {
    const r = run({ expenses: [{ label: "Taxes", amount: 480_000 }] });
    cents(r.noiAfterReserves, -3_000);
    expect(r.value).toBeNull();
    expect(r.valuePerSf).toBeNull();
    expect(r.impliedCapRate).toBeNull();
    expect(r.valueLessPrice).toBeNull();
    expect(r.sensitivity).toEqual([]);
    rate(r.gim, 10);
    expect(r.notes[0]).toBe("The NOI after reserves is -$3,000, so direct capitalization gives no value.");
    expect(r.trace.find((t) => t.label.startsWith("Value by direct"))?.value).toBe("not defined");
  });

  it("skips a sensitivity row whose cap rate would be zero or less, and flags an unusual cap rate", () => {
    const r = run({ capRate: 0.004 });
    expect(r.sensitivity.map((s) => s.capRate.toFixed(4))).toEqual(["0.0015", "0.0040", "0.0065", "0.0090"]);
    expect(r.notes.some((n) => n.startsWith("The cap rate entered is 0.40%."))).toBe(true);
  });
});

describe("rejects bad input in plain words", () => {
  const issue = (over: Record<string, unknown>) => {
    const p = incomeValueInput.safeParse({ ...ex, ...over });
    expect(p.success).toBe(false);
    return p.error?.issues[0];
  };

  it("names each limit the way the field shows it", () => {
    expect(plainIssue(issue({ vacancy: 1 }) as never, "pct")).toBe("Less than 100%.");
    expect(plainIssue(issue({ capRate: 0 }) as never, "pct")).toBe("Must be more than zero.");
    expect(plainIssue(issue({ capRate: 6.5 }) as never, "pct")).toBe("Less than 100%.");
    expect(plainIssue(issue({ pgi: 0 }) as never, "money")).toBe("Must be more than zero.");
    expect(plainIssue(issue({ area: 0 }) as never, "number")).toBe("Must be more than zero.");
    expect(plainIssue(issue({ otherIncome: -1 }) as never, "money")).toBe("Cannot be negative.");
    expect(plainIssue(issue({ reserves: -1 }) as never, "money")).toBe("Cannot be negative.");
  });

  it("checks each expense line", () => {
    const neg = issue({ expenses: [{ label: "Taxes", amount: -5 }] });
    expect(neg?.path).toEqual(["expenses", 0, "amount"]);
    const blank = issue({ expenses: [{ label: "  ", amount: 5 }] });
    expect(blank?.path).toEqual(["expenses", 0, "label"]);
    const dup = issue({ expenses: [{ label: "Taxes", amount: 5 }, { label: "taxes", amount: 6 }] });
    expect(dup?.path).toEqual(["expenses", 1, "label"]);
    expect(plainIssue(dup as never)).toBe("Each expense line needs its own name.");
  });

  it("refuses a field it does not know and a missing choice", () => {
    expect(incomeValueInput.safeParse({ ...ex, noi: 1 }).success).toBe(false);
    expect(incomeValueInput.safeParse({ ...ex, capitalize: "both" }).success).toBe(false);
    expect(() => runIncomeValue({ ...ex, vacancy: Number.NaN })).toThrow();
  });
});
