import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import {
  addMonths,
  LEASE_ROLLOVER_DOWNTIME_EXAMPLE,
  LEASE_ROLLOVER_EXAMPLE,
  leaseRolloverInput,
  runLeaseRollover,
  type LeaseRolloverInput,
  type LeaseRolloverRowInput,
} from "@/lib/calculators/lease-rollover";

// The optional downtime check (2026-11-14). Expected values were computed on
// 2026-11-14 by a separate Python model written from the stated method, not from
// this module: it walks every vacant day one at a time, finds the hold year the day
// falls in and adds the annual rent ÷ that hold year's days, with exact fractions
// and the datetime module's calendar (scratch downtime_check.py). Money is compared
// to the cent, shares to 1e-9.

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
const row = (tenant: string, area: number, annualRent: number, leaseEnd: string | null): LeaseRolloverRowInput => ({ tenant, area, annualRent, leaseEnd, marketRentPerSf: null });
type Entry = [row: number, renewalProbability: number, downtimeMonths: number];
const roll = (rows: LeaseRolloverRowInput[], entries: Entry[], flatVacancy: number | null = null, analysisDate = "2028-01-01", holdYears = 5): LeaseRolloverInput => ({
  analysisDate,
  holdYears,
  rows,
  downtimeCheck: { leases: entries.map(([r, p, m]) => ({ row: r, renewalProbability: p, downtimeMonths: m })), flatVacancy },
});
const issueAt = (input: unknown, path: string) => {
  const p = leaseRolloverInput.safeParse(input);
  expect(p.success).toBe(false);
  const issue = p.error?.issues.find((i) => i.path.join(".") === path);
  expect(issue, path).toBeDefined();
  return issue ? plainIssue(issue) : "";
};
const without = (r: ReturnType<typeof runLeaseRollover>, traceLines: number) => {
  const rest: Partial<typeof r> = { ...r };
  delete rest.downtimeCheck;
  return { ...rest, trace: r.trace.slice(0, traceLines) };
};

describe("downtime check, worked example (the rent roll above, 5-year hold from 2028-01-01, flat 5%)", () => {
  const r = runLeaseRollover(LEASE_ROLLOVER_DOWNTIME_EXAMPLE);
  const c = r.downtimeCheck;

  it("leaves every other figure exactly as the example without the block", () => {
    const base = runLeaseRollover(LEASE_ROLLOVER_EXAMPLE);
    expect(base.downtimeCheck).toBeNull();
    // the existing trace lines come first, unchanged, by position
    expect(without(r, base.trace.length)).toEqual(without(base, base.trace.length));
    // and every line after them belongs to the check: 4 leases, 5 hold years, 5 totals
    const added = r.trace.slice(base.trace.length).map((l) => l.label);
    expect(added).toHaveLength(4 + 5 + 5);
    expect(added.slice(0, 4).every((l) => l.endsWith("expected rent lost to downtime"))).toBe(true);
    expect(added.slice(4, 9).every((l) => /^Hold year \d+: expected downtime loss$/.test(l))).toBe(true);
    expect(added.slice(9)).toEqual(["Potential rent over the hold", "Expected rent lost to downtime", "Rent lost if no expiring tenant renews", "Equivalent flat vacancy", "Flat allowance less expected loss"]);
  });

  it("each expiring row: vacancy window, days inside the hold, loss if vacated and expected loss", () => {
    expect(c?.leases.map((l) => l.row)).toEqual([0, 2, 3, 4]);
    expect(c?.leases.map((l) => [l.vacancyStart, l.vacancyEnd])).toEqual([
      ["2031-01-01", "2031-10-01"],
      ["2028-01-01", "2028-07-01"], // holdover: vacant from the analysis date
      ["2028-01-01", "2028-04-01"], // month-to-month: the same
      ["2030-01-01", "2031-01-01"],
    ]);
    expect(c?.leases.map((l) => l.daysInHold)).toEqual([273, 182, 91, 365]);
    const ifVacated = [373972.602739726, 69617.48633879781, 29836.06557377049, 60000];
    const expected = [186986.301369863, 52213.11475409836, 7459.016393442623, 30000];
    c?.leases.forEach((l, k) => {
      cents(l.lossIfVacated, ifVacated[k] as number);
      cents(l.expectedLoss, expected[k] as number);
      expect(l.expiresInHold).toBe(true);
    });
  });

  it("by hold year, in total, as a share of potential rent, and against the flat allowance", () => {
    expect(c?.years.map((y) => [y.year, y.start, y.end])).toEqual([
      [1, "2028-01-01", "2029-01-01"],
      [2, "2029-01-01", "2030-01-01"],
      [3, "2030-01-01", "2031-01-01"],
      [4, "2031-01-01", "2032-01-01"],
      [5, "2032-01-01", "2033-01-01"],
    ]);
    const yearExp = [59672.13114754098, 0, 30000, 186986.301369863, 0];
    const yearIf = [99453.5519125683, 0, 60000, 373972.602739726, 0];
    const yearDiff = [-672.1311475409836, 59000, 29000, -127986.30136986301, 59000];
    c?.years.forEach((y, k) => {
      cents(y.potentialRent, 1_180_000);
      cents(y.expectedLoss, yearExp[k] as number);
      cents(y.lossIfNoneRenew, yearIf[k] as number);
      cents(y.flatAllowance, 59_000);
      cents(y.difference, yearDiff[k] as number);
      close(y.lossShare, (yearExp[k] as number) / 1_180_000);
    });
    cents(c?.potentialRent, 5_900_000);
    cents(c?.expectedLoss, 276658.43251740397);
    cents(c?.lossIfNoneRenew, 533426.1546522944);
    close(c?.equivalentFlatVacancy, 0.04689125974871254);
    close(c?.flatVacancy, 0.05);
    cents(c?.flatAllowance, 295_000);
    cents(c?.difference, 18341.567482596);
  });

  it("traces the check after the existing lines, ending with the comparison", () => {
    const labels = r.trace.map((l) => l.label);
    const at = (s: string) => labels.findIndex((l) => l.startsWith(s));
    expect(at("Market less in-place rent")).toBeLessThan(at("Tenant A, row 0: expected rent lost"));
    expect(at("Hold year 5")).toBeLessThan(at("Potential rent over the hold"));
    expect(r.trace.find((l) => l.label === "Equivalent flat vacancy")?.value).toBe("4.69%");
    expect(r.trace.at(-1)).toMatchObject({ label: "Flat allowance less expected loss", value: "$18,342" });
  });
});

describe("downtime check edge cases", () => {
  it("no lease expires in the hold: nothing lost, and a listed later lease shows no loss", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 25_000, 250_000, "2035-06-30")], [[0, 0.5, 6]], 0.05));
    const c = r.downtimeCheck;
    expect(c?.leases[0]).toMatchObject({ expiresInHold: false, vacancyStart: null, vacancyEnd: null, daysInHold: 0, lossIfVacated: 0, expectedLoss: 0 });
    cents(c?.potentialRent, 1_250_000);
    expect(c?.expectedLoss).toBe(0);
    close(c?.equivalentFlatVacancy, 0);
    cents(c?.difference, 62_500);
    // and with no entries at all, which is the same thing
    const empty = runLeaseRollover(roll([row("Tenant A", 25_000, 250_000, "2035-06-30")], [], null));
    expect(empty.downtimeCheck?.leases).toEqual([]);
    expect(empty.downtimeCheck?.expectedLoss).toBe(0);
    expect(empty.downtimeCheck?.difference).toBeNull();
    expect(empty.trace.at(-1)?.value).toBe("not given");
  });

  it("one tenant expiring in year one: the loss spans two hold years with their own day counts", () => {
    const c = runLeaseRollover(roll([row("Tenant A", 40_000, 400_000, "2028-06-30")], [[0, 0, 12]], 0.1)).downtimeCheck;
    expect(c?.leases[0]?.daysInHold).toBe(365); // 2028-07-01 to 2029-07-01
    cents(c?.years[0]?.expectedLoss, 201092.8961748634); // 184 of 366 days
    cents(c?.years[1]?.expectedLoss, 198356.16438356164); // 181 of 365 days
    cents(c?.expectedLoss, 399449.06055842503);
    close(c?.equivalentFlatVacancy, 0.19972453027921253);
    cents(c?.difference, -199449.06055842503); // the flat 10% covers half of it
  });

  it("a lease ending in the hold's last month loses only the days before the hold ends", () => {
    const c = runLeaseRollover(roll([row("Tenant A", 30_000, 300_000, "2032-12-15"), row("Tenant B", 10_000, 100_000, "2032-12-31")], [[0, 0.5, 6], [1, 0, 6]])).downtimeCheck;
    expect(c?.leases.map((l) => l.daysInHold)).toEqual([16, 0]);
    expect(c?.leases.map((l) => l.expiresInHold)).toEqual([true, true]);
    expect(c?.leases[1]?.vacancyStart).toBe("2033-01-01"); // the hold's end: no vacant day inside it
    cents(c?.leases[0]?.lossIfVacated, 13114.754098360656);
    cents(c?.expectedLoss, 6557.377049180328);
    close(c?.equivalentFlatVacancy, 0.003278688524590164);
    expect(c?.flatAllowance).toBeNull();
  });

  it("renewal probability 1 and downtime 0 both lose nothing; the if-vacated loss still shows the exposure", () => {
    const c = runLeaseRollover(roll([row("Tenant A", 30_000, 300_000, "2029-06-30"), row("Tenant B", 10_000, 100_000, "2030-06-30")], [[0, 1, 12], [1, 0.4, 0]], 0.02)).downtimeCheck;
    cents(c?.leases[0]?.lossIfVacated, 300_000);
    expect(c?.leases[0]?.expectedLoss).toBe(0);
    expect(c?.leases[1]).toMatchObject({ vacancyStart: "2030-07-01", vacancyEnd: "2030-07-01", daysInHold: 0, lossIfVacated: 0 });
    expect(c?.expectedLoss).toBe(0);
    cents(c?.lossIfNoneRenew, 300_000);
    cents(c?.years[1]?.lossIfNoneRenew, 151232.87671232875);
    cents(c?.difference, 40_000);
  });

  it("renewal probability 0 takes the whole loss", () => {
    const c = runLeaseRollover(roll([row("Tenant A", 30_000, 300_000, "2029-06-30")], [[0, 0, 12]])).downtimeCheck;
    cents(c?.expectedLoss, 300_000);
    expect(c?.expectedLoss).toBe(c?.lossIfNoneRenew);
  });

  it("downtime longer than the hold has left is cut off at the hold's end", () => {
    const c = runLeaseRollover(roll([row("Tenant A", 25_000, 250_000, "2031-06-30")], [[0, 0.2, 36]], 0.05)).downtimeCheck;
    expect(c?.leases[0]).toMatchObject({ vacancyStart: "2031-07-01", vacancyEnd: "2034-07-01", daysInHold: 550 });
    cents(c?.years[3]?.expectedLoss, 100821.91780821918);
    cents(c?.years[4]?.expectedLoss, 200_000); // a whole vacant hold year: one year's rent × 0.8
    cents(c?.expectedLoss, 300821.91780821915);
    close(c?.equivalentFlatVacancy, 0.24065753424657535);
    cents(c?.difference, -238321.91780821918);
  });

  it("a vacancy starting on the 31st ends on the last day of a shorter month", () => {
    const c = runLeaseRollover(roll([row("Tenant A", 12_000, 120_000, "2029-01-30")], [[0, 0, 1]], null, "2028-01-01", 3)).downtimeCheck;
    expect(c?.leases[0]).toMatchObject({ vacancyStart: "2029-01-31", vacancyEnd: "2029-02-28", daysInHold: 28 });
    cents(c?.expectedLoss, 9205.479452054795);
    expect(addMonths("2029-01-31", 1)).toBe("2029-02-28");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2028-11-15", 3)).toBe("2029-02-15");
    expect(addMonths("2028-01-01", 0)).toBe("2028-01-01");
  });

  it("the trace prints the probability as entered and the window with its end plainly exclusive", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 10_000, 100_000, null)], [[0, 0.125, 1]], null, "2027-03-31", 1));
    const line = r.trace.find((l) => l.label === "Tenant A, row 0: expected rent lost to downtime");
    expect(line?.formula).toBe("(1 − 0.125 renewal probability) × $100,000/yr over 30 vacant days in the hold (vacant from 2027-03-31, a new lease paying from 2027-04-30: 1 month), each day ÷ the days in its hold year");
    // 30 of 366 days (2027-03-31 to 2028-03-31 crosses 29 Feb 2028) × 0.875
    cents(r.downtimeCheck?.expectedLoss, (100_000 * 30 * 0.875) / 366);
    const worked = runLeaseRollover(LEASE_ROLLOVER_DOWNTIME_EXAMPLE).trace.find((l) => l.label.startsWith("Tenant C, row 2"));
    expect(worked?.formula).toContain("(1 − 0.25 renewal probability)");
    expect(worked?.formula).toContain("vacant from 2028-01-01, a new lease paying from 2028-07-01: 6 months");
  });

  it("no rent at all: the shares are none, the dollars zero", () => {
    const c = runLeaseRollover(roll([row("Tenant A", 10_000, 0, "2029-12-31")], [[0, 0.5, 6]], 0.05)).downtimeCheck;
    expect(c?.expectedLoss).toBe(0);
    expect(c?.equivalentFlatVacancy).toBeNull();
    expect(c?.years[0]?.lossShare).toBeNull();
    expect(c?.difference).toBe(0);
  });
});

describe("the downtime check is refused in plain words", () => {
  const rows = [row("Tenant A", 10_000, 100_000, "2029-12-31"), row("Vacant", 5_000, 0, null), row("Tenant B", 10_000, 100_000, null)];

  it("an expiring row with no entry: no probability or downtime is assumed", () => {
    expect(issueAt(roll(rows, [[0, 0.5, 6]]), "downtimeCheck.leases")).toBe("Row 2 (Tenant B) expires inside the hold: give its renewal probability and downtime.");
    expect(leaseRolloverInput.safeParse(roll(rows, [[0, 0.5, 6], [2, 0.5, 3]])).success).toBe(true);
  });

  it("rows that can lose nothing need no entry: zero rent, or a lease ending on the hold's last day", () => {
    // hold 2028-01-01 to 2033-01-01: its last day is 2032-12-31
    const quiet = [row("Free", 10_000, 0, "2029-01-01"), row("Last day", 10_000, 100_000, "2032-12-31"), row("Free holdover", 5_000, 0, "2027-06-30")];
    const p = leaseRolloverInput.safeParse(roll(quiet, []));
    expect(p.success).toBe(true);
    expect(runLeaseRollover(roll(quiet, [])).downtimeCheck?.expectedLoss).toBe(0);
    // one day earlier and the lease can lose a day, so it needs an entry
    expect(issueAt(roll([row("Day before", 10_000, 100_000, "2032-12-30")], []), "downtimeCheck.leases")).toBe("Row 0 (Day before) expires inside the hold: give its renewal probability and downtime.");
  });

  it("a vacant row, a row that is not there, a row listed twice", () => {
    expect(issueAt(roll(rows, [[0, 0.5, 6], [2, 0.5, 3], [1, 0.5, 3]]), "downtimeCheck.leases.2.row")).toBe("Row 1 is vacant: there is no lease to roll.");
    expect(issueAt(roll(rows, [[0, 0.5, 6], [2, 0.5, 3], [7, 0.5, 3]]), "downtimeCheck.leases.2.row")).toBe("There is no row 7: the rent roll has rows 0 to 2.");
    expect(issueAt(roll(rows, [[0, 0.5, 6], [2, 0.5, 3], [0, 0.25, 3]]), "downtimeCheck.leases.2.row")).toBe("Row 0 is listed twice.");
  });

  it("a probability outside 0 to 1, a part or negative month, a flat allowance of 100%, an unknown field", () => {
    expect(issueAt(roll(rows, [[0, 1.2, 6], [2, 0.5, 3]]), "downtimeCheck.leases.0.renewalProbability")).toBe("At most 1.");
    expect(issueAt(roll(rows, [[0, -0.1, 6], [2, 0.5, 3]]), "downtimeCheck.leases.0.renewalProbability")).toBe("Cannot be negative.");
    expect(issueAt(roll(rows, [[0, 0.5, 2.5], [2, 0.5, 3]]), "downtimeCheck.leases.0.downtimeMonths")).toBe("Whole numbers only.");
    expect(issueAt(roll(rows, [[0, 0.5, -1], [2, 0.5, 3]]), "downtimeCheck.leases.0.downtimeMonths")).toBe("Cannot be negative.");
    expect(issueAt(roll(rows, [[0, 0.5, 121], [2, 0.5, 3]]), "downtimeCheck.leases.0.downtimeMonths")).toBe("At most 120.");
    expect(issueAt(roll(rows, [[0, 0.5, 6], [2, 0.5, 3]], 1), "downtimeCheck.flatVacancy")).toBe("Less than 1.");
    const extra = roll(rows, [[0, 0.5, 6], [2, 0.5, 3]]);
    expect(leaseRolloverInput.safeParse({ ...extra, downtimeCheck: { ...extra.downtimeCheck, growth: 0.03 } }).success).toBe(false);
  });

  it("null and a missing block both skip the check", () => {
    expect(runLeaseRollover({ ...LEASE_ROLLOVER_EXAMPLE, downtimeCheck: null }).downtimeCheck).toBeNull();
    expect(JSON.stringify(runLeaseRollover({ ...LEASE_ROLLOVER_EXAMPLE, downtimeCheck: null }))).toBe(JSON.stringify(runLeaseRollover(LEASE_ROLLOVER_EXAMPLE)));
  });
});
