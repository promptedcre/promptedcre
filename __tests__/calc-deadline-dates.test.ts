import { describe, expect, it } from "vitest";
import { calendarDateProblem, fromDays, isCalendarDate, toDays } from "@/lib/calculators/dates";
import { computeDeadlines, DEADLINES_EXAMPLE, deadlinesInput, type DeadlinesInput } from "@/lib/calculators/deadlines";
import { LEASE_ROLLOVER_EXAMPLE, leaseRolloverInput } from "@/lib/calculators/lease-rollover";
import { PROPERTY_TAX_EXAMPLE, propertyTaxInput } from "@/lib/calculators/property-tax";

// A deadline computed from a date the calendar does not hold used to roll silently
// into the next month (2027-02-30 became March 2), and a year under 100 was read as
// 19xx. Both are refused now, with a message that names the date.

const DATE_FIELDS = ["firstSaleDate", "firstTexasSaleDate", "exchangeTransferDate", "returnDueDate", "appraisalNoticeDate", "contractEffectiveDate"] as const;

function messages(input: unknown): string[] {
  const r = deadlinesInput.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

const blank: DeadlinesInput = {
  firstSaleDate: null,
  firstTexasSaleDate: null,
  exchangeTransferDate: null,
  returnDueDate: null,
  appraisalNoticeDate: null,
  protestYear: null,
  contractEffectiveDate: null,
  contractPeriods: [],
};

describe("deadline calendar refuses impossible dates", () => {
  const refused: Array<[string, string]> = [
    ["2027-02-30", "2027-02-30 is not a real calendar date"],
    ["2026-13-01", "2026-13-01 is not a real calendar date"],
    ["2026-00-10", "2026-00-10 is not a real calendar date"],
    ["2026-04-31", "2026-04-31 is not a real calendar date"],
    ["2027-02-29", "2027-02-29 is not a real calendar date"], // 2027 is not a leap year
    ["2100-02-29", "2100-02-29 is not a real calendar date"], // a century year not divisible by 400
    ["0026-11-14", "0026-11-14 has a two-digit year; write all four digits, like 2026"],
    ["0099-12-31", "0099-12-31 has a two-digit year; write all four digits, like 2026"],
  ];

  for (const field of DATE_FIELDS) {
    for (const [value, message] of refused) {
      it(`refuses ${field} = ${value}`, () => {
        expect(messages({ ...blank, [field]: value })).toEqual([`${field}: ${message}`]);
      });
    }
  }

  it("throws from computeDeadlines rather than rolling 2027-02-30 into March", () => {
    expect(() => computeDeadlines({ ...blank, firstSaleDate: "2027-02-30" })).toThrow("2027-02-30 is not a real calendar date");
    expect(() => computeDeadlines({ ...blank, exchangeTransferDate: "0026-11-14" })).toThrow("two-digit year");
  });

  it("names a date written with a two-digit year once, by the shape check", () => {
    expect(messages({ ...blank, firstSaleDate: "26-11-14" })).toEqual(["firstSaleDate: expected a date written like 2026-11-11"]);
  });

  it("names every bad field, not only the first", () => {
    expect(messages({ ...blank, firstSaleDate: "2027-02-30", contractEffectiveDate: "2026-13-01" })).toEqual([
      "firstSaleDate: 2027-02-30 is not a real calendar date",
      "contractEffectiveDate: 2026-13-01 is not a real calendar date",
    ]);
  });

  it("accepts a leap day in a leap year and computes from it", () => {
    for (const leap of ["2028-02-29", "2000-02-29"]) expect(messages({ ...blank, firstSaleDate: leap })).toEqual([]);
    // 2028-02-29 + 15 days = 2028-03-15, a Wednesday: no roll (checked with Python's datetime)
    const r = computeDeadlines({ ...blank, firstSaleDate: "2028-02-29" });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: "form-d", date: "2028-03-15", weekday: "Wednesday", rolledFrom: null });
  });

  it("still accepts the worked example and every null", () => {
    expect(messages(DEADLINES_EXAMPLE)).toEqual([]);
    expect(messages(blank)).toEqual([]);
  });
});

describe("date helper counts every year from 0100 as written", () => {
  it("keeps the day numbers it gave before for four-digit years (checked with Python's datetime)", () => {
    expect(toDays("1970-01-01")).toBe(0);
    expect(toDays("2026-11-14")).toBe(20771);
    expect(toDays("1927-02-01")).toBe(-15675);
  });

  it("does not read a year under 100 as 19xx: it gives no day number at all", () => {
    expect(toDays("0027-02-01")).toBeNaN();
    expect(toDays("0001-01-01")).toBeNaN();
    expect(toDays("0099-12-31")).toBeNaN();
    expect(fromDays(toDays("0027-02-01"))).toBe("");
    // From 0100 on every year counts as written (Python's datetime: 0100-01-01 is
    // day -683003, 0100-03-01 is day -682944; 0100 is not a leap year).
    expect(toDays("0100-01-01")).toBe(-683003);
    expect(toDays("0100-03-01")).toBe(-682944);
    expect(fromDays(toDays("0100-01-01"))).toBe("0100-01-01");
  });

  it("keeps every round-trip date check strict for a year under 100", () => {
    // lease-rollover and property-tax refuse a date whose round trip fails; a year
    // under 100 used to fail only because it was read as 19xx, and must still fail.
    const leaseIssues = leaseRolloverInput.safeParse({ ...LEASE_ROLLOVER_EXAMPLE, analysisDate: "0027-01-01" });
    expect(leaseIssues.success).toBe(false);
    if (!leaseIssues.success) expect(leaseIssues.error.issues.map((i) => i.message)).toContain("not a real calendar date");
    const taxIssues = propertyTaxInput.safeParse({ ...PROPERTY_TAX_EXAMPLE, closingDate: "0027-09-30" });
    expect(taxIssues.success).toBe(false);
    if (!taxIssues.success) expect(taxIssues.error.issues.map((i) => i.message)).toContain("not a real calendar date");
    expect(fromDays(toDays("0027-01-01"))).not.toBe("0027-01-01");
  });

  it("explains why a date is refused, or returns null", () => {
    expect(calendarDateProblem("2026-11-14")).toBeNull();
    expect(calendarDateProblem("0100-01-01")).toBeNull();
    expect(calendarDateProblem("2026-11-4")).toBe("2026-11-4: expected a date written like 2026-11-11");
    expect(calendarDateProblem("0026-11-14")).toBe("0026-11-14 has a two-digit year; write all four digits, like 2026");
    expect(calendarDateProblem("2027-02-30")).toBe("2027-02-30 is not a real calendar date");
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
  });
});
