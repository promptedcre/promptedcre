import { describe, expect, it } from "vitest";
import { plainIssue } from "@/components/calc/format";
import { addYears, LEASE_ROLLOVER_EXAMPLE, leaseRolloverInput, runLeaseRollover, type LeaseRolloverInput, type LeaseRolloverRowInput } from "@/lib/calculators/lease-rollover";

// The worked example's expected values were computed independently in Python on
// 2026-11-13, with exact fractions and the datetime module's day counts, written
// from the method rather than from this module. Money is compared to the cent,
// shares and terms to 1e-9.

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
const row = (tenant: string, area: number, annualRent: number, leaseEnd: string | null, marketRentPerSf: number | null = null): LeaseRolloverRowInput => ({
  tenant,
  area,
  annualRent,
  leaseEnd,
  marketRentPerSf,
});
const roll = (rows: LeaseRolloverRowInput[], analysisDate = "2028-01-01", holdYears = 5): LeaseRolloverInput => ({ analysisDate, holdYears, rows });
const issueAt = (input: unknown, path: string) => {
  const p = leaseRolloverInput.safeParse(input);
  expect(p.success).toBe(false);
  const issue = p.error?.issues.find((i) => i.path.join(".") === path);
  expect(issue, path).toBeDefined();
  return issue ? plainIssue(issue) : "";
};

describe("lease-rollover worked example (120,000 SF, read 2028-01-01, 5-year hold)", () => {
  const r = runLeaseRollover(LEASE_ROLLOVER_EXAMPLE);

  it("occupancy and in-place rent", () => {
    expect(r.totalArea).toBe(120_000);
    expect(r.occupiedArea).toBe(105_000);
    expect(r.vacantArea).toBe(15_000);
    close(r.occupiedShare, 0.875);
    close(r.vacantShare, 0.125);
    cents(r.totalRent, 1_180_000);
  });

  it("each row's status and remaining term in days over 365", () => {
    expect(r.rows.map((x) => x.status)).toEqual(["lease", "lease", "holdover", "month-to-month", "lease", "vacant"]);
    expect(r.rows.map((x) => x.effectiveEnd)).toEqual(["2030-12-31", "2034-06-30", "2028-01-01", "2028-01-01", "2029-12-31", null]);
    const terms = r.rows.map((x) => x.remainingYears);
    close(terms[0], 3); // 1,095 days
    close(terms[1], 2372 / 365); // 6.498630137
    close(terms[2], 0);
    close(terms[3], 0);
    close(terms[4], 2); // 730 days
    expect(terms[5]).toBeNull();
  });

  it("expirations: a now bucket, then every year 2028 to 2034, with cumulative shares", () => {
    expect(r.buckets.map((b) => b.label)).toEqual(["Now", "2028", "2029", "2030", "2031", "2032", "2033", "2034"]);
    expect(r.buckets.map((b) => b.area)).toEqual([20_000, 0, 5_000, 50_000, 0, 0, 0, 30_000]);
    expect(r.buckets.map((b) => b.rent)).toEqual([260_000, 0, 60_000, 500_000, 0, 0, 0, 360_000]);
    expect(r.buckets[0]?.tenants).toEqual(["Tenant C", "Tenant D"]);
    const cumArea = [0.16666666666666666, 0.16666666666666666, 0.20833333333333334, 0.625, 0.625, 0.625, 0.625, 0.875];
    const cumRent = [0.22033898305084745, 0.22033898305084745, 0.2711864406779661, 0.6949152542372882, 0.6949152542372882, 0.6949152542372882, 0.6949152542372882, 1];
    r.buckets.forEach((b, k) => {
      close(b.cumulativeAreaShare, cumArea[k] as number);
      close(b.cumulativeRentShare, cumRent[k] as number);
    });
    close(r.buckets[3]?.areaShare, 0.4166666666666667);
    close(r.buckets[3]?.rentShare, 0.423728813559322);
    close(r.buckets[7]?.rentShare, 0.3050847457627119);
  });

  it("inside the hold (before 2033-01-01): 75,000 SF and $820,000", () => {
    expect(r.holdEnd).toBe("2033-01-01");
    expect(r.hold.area).toBe(75_000);
    cents(r.hold.rent, 820_000);
    close(r.hold.areaShare, 0.625);
    close(r.hold.rentShare, 0.6949152542372882);
  });

  it("weighted average lease term by rent and by area", () => {
    close(r.waltByRent, 3.3555142791);
    close(r.waltByArea, 3.3805609915);
  });

  it("concentration groups Tenant A's two suites", () => {
    expect(r.tenants.map((t) => [t.tenant, t.rent])).toEqual([
      ["Tenant A", 560_000],
      ["Tenant B", 360_000],
      ["Tenant C", 140_000],
      ["Tenant D", 120_000],
    ]);
    close(r.largestShare, 0.4745762712);
    close(r.topThreeShare, 0.8983050847);
  });

  it("market less in-place rent, on the four priced rows", () => {
    const m = r.markToMarket;
    expect(m).not.toBeNull();
    expect(m?.rows.map((x) => x.difference)).toEqual([50_000, -15_000, -10_000, 5_000]);
    expect(m?.rows.map((x) => x.row)).toEqual([0, 1, 2, 4]); // Tenant D has no market rent; the vacant row is left out
    cents(m?.market, 1_090_000);
    cents(m?.inPlace, 1_060_000);
    cents(m?.difference, 30_000);
    close(m?.differenceShare, 0.0283018868);
    expect(m?.pricedArea).toBe(95_000);
    close(m?.pricedShare, 0.9047619048);
  });

  it("traces the figures in the order they were computed", () => {
    const labels = r.trace.map((l) => l.label);
    expect(labels[0]).toBe("Total area");
    const at = (s: string) => labels.findIndex((l) => l.startsWith(s));
    expect(at("Occupied area")).toBeLessThan(at("Expiring now"));
    expect(at("Expiring now")).toBeLessThan(at("Hold ends"));
    expect(at("Hold ends")).toBeLessThan(at("Weighted average lease term, by rent"));
    expect(at("Weighted average lease term, by area")).toBeLessThan(at("Largest tenant"));
    expect(at("Largest tenant")).toBeLessThan(at("Market less in-place rent"));
    expect(r.trace.find((l) => l.label === "Rent expiring inside the hold")?.value).toBe("69.49%");
    expect(r.trace.find((l) => l.label === "Market less in-place rent")?.value).toBe("$30,000 (2.83%)");
  });
});

// A fixed set of synthetic rent rolls for the invariants (a seeded generator, not random).
function rolls(): LeaseRolloverInput[] {
  let seed = 7;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const out: LeaseRolloverInput[] = [];
  for (let k = 0; k < 12; k++) {
    const rows: LeaseRolloverRowInput[] = [];
    const n = 1 + Math.floor(next() * 8);
    for (let j = 0; j < n; j++) {
      const area = 1_000 * (1 + Math.floor(next() * 40));
      const kind = next();
      const year = 2024 + Math.floor(next() * 14);
      const end = `${year}-${String(1 + Math.floor(next() * 12)).padStart(2, "0")}-15`;
      if (kind < 0.15) rows.push(row("Vacant", area, 0, null));
      else if (kind < 0.25) rows.push(row(`Tenant ${j}`, area, area * 10, null, 12));
      else rows.push(row(`Tenant ${j % 4}`, area, area * (8 + Math.floor(next() * 8)), end, next() < 0.5 ? null : 9 + Math.floor(next() * 6)));
    }
    out.push(roll(rows, "2027-04-01", 1 + Math.floor(next() * 8)));
  }
  return [LEASE_ROLLOVER_EXAMPLE, ...out];
}

describe("invariants on twelve synthetic rent rolls and the worked example", () => {
  it.each(rolls().map((x, i) => [i, x] as const))("roll %i", (_, input) => {
    const r = runLeaseRollover(input);
    // area in equals area out: every expiry bucket plus vacant is the building
    const bucketArea = r.buckets.reduce((s, b) => s + b.area, 0);
    expect(Math.abs(bucketArea + r.vacantArea - r.totalArea)).toBeLessThan(1e-6);
    // rent in equals rent out
    expect(Math.abs(r.buckets.reduce((s, b) => s + b.rent, 0) - r.totalRent)).toBeLessThan(1e-6);
    // shares sum to one
    expect(Math.abs(r.occupiedShare + r.vacantShare - 1)).toBeLessThan(1e-12);
    if (r.totalRent > 0) expect(Math.abs(r.buckets.reduce((s, b) => s + (b.rentShare ?? 0), 0) - 1)).toBeLessThan(1e-9);
    // cumulative shares never fall, and end at the occupied share and at one
    for (let k = 1; k < r.buckets.length; k++) {
      expect((r.buckets[k]?.cumulativeAreaShare ?? 0) + 1e-12).toBeGreaterThanOrEqual(r.buckets[k - 1]?.cumulativeAreaShare ?? 0);
    }
    const last = r.buckets[r.buckets.length - 1];
    expect(Math.abs((last?.cumulativeAreaShare ?? 0) - r.occupiedShare)).toBeLessThan(1e-12);
    if (r.totalRent > 0) expect(Math.abs((last?.cumulativeRentShare ?? 0) - 1)).toBeLessThan(1e-12);
    // the weighted terms sit between the shortest and the longest
    const terms = r.rows.flatMap((x) => (x.remainingYears === null ? [] : [x.remainingYears]));
    for (const w of [r.waltByRent, r.waltByArea]) {
      if (w === null) continue;
      expect(w).toBeGreaterThanOrEqual(Math.min(...terms) - 1e-12);
      expect(w).toBeLessThanOrEqual(Math.max(...terms) + 1e-12);
    }
    // concentration
    if (r.largestShare !== null && r.topThreeShare !== null) {
      expect(r.largestShare).toBeLessThanOrEqual(r.topThreeShare + 1e-12);
      expect(r.topThreeShare).toBeLessThanOrEqual(1 + 1e-12);
    }
    // the hold's share is the sum of the rows inside it
    const inside = r.rows.filter((x) => x.insideHold).reduce((s, x) => s + x.area, 0);
    expect(r.hold.area).toBe(inside);
    // the total market difference is the sum of the rows'
    if (r.markToMarket) {
      expect(Math.abs(r.markToMarket.rows.reduce((s, m) => s + m.difference, 0) - r.markToMarket.difference)).toBeLessThan(1e-6);
    }
  });

  it("a flat case equals its closed form: every lease ending on the same day gives that term both ways", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 20_000, 200_000, "2032-12-31"), row("Tenant B", 10_000, 150_000, "2032-12-31"), row("Tenant C", 5_000, 40_000, "2032-12-31")]));
    const t = 1826 / 365; // 2028-01-01 to 2032-12-31: 366 + 365 + 365 + 365 + 365 days
    close(r.waltByRent, t);
    close(r.waltByArea, t);
    close(r.hold.areaShare, 1);
  });
});

describe("edge cases", () => {
  it("one tenant: largest and top three are both the whole rent", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 40_000, 400_000, "2030-06-30")]));
    close(r.largestShare, 1);
    close(r.topThreeShare, 1);
    expect(r.tenants).toHaveLength(1);
  });

  it("no market rents: in-place against market is null and says so", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 40_000, 400_000, "2030-06-30"), row("Tenant B", 10_000, 90_000, "2029-06-30")]));
    expect(r.markToMarket).toBeNull();
    expect(r.trace.at(-1)?.value).toBe("not given");
  });

  it("all vacant: no rent, so the terms and rent shares are null; area shares still hold", () => {
    const r = runLeaseRollover(roll([row("Vacant", 30_000, 0, null, 10), row("Vacant", 20_000, 0, null)]));
    expect(r.occupiedArea).toBe(0);
    close(r.vacantShare, 1);
    expect(r.waltByRent).toBeNull();
    expect(r.waltByArea).toBeNull();
    expect(r.largestShare).toBeNull();
    expect(r.topThreeShare).toBeNull();
    expect(r.hold.rentShare).toBeNull();
    expect(r.markToMarket).toBeNull(); // a vacant row's market rent is not in-place rent
    expect(r.buckets.every((b) => b.area === 0 && b.rentShare === null)).toBe(true);
  });

  it("a lease that already ended is a holdover: expiring now, no term left", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 10_000, 100_000, "2026-03-31"), row("Tenant B", 10_000, 100_000, "2031-12-31")]));
    expect(r.rows[0]?.status).toBe("holdover");
    expect(r.rows[0]?.remainingYears).toBe(0);
    expect(r.buckets[0]).toMatchObject({ label: "Now", area: 10_000, rent: 100_000 });
  });

  it("a lease ending on the analysis date is still a lease: no term left, in that year", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 10_000, 100_000, "2028-01-01")]));
    expect(r.rows[0]?.status).toBe("lease");
    expect(r.rows[0]?.remainingYears).toBe(0);
    expect(r.buckets.find((b) => b.label === "2028")?.area).toBe(10_000);
    expect(r.buckets[0]?.area).toBe(0);
  });

  it("the hold ends on its anniversary: a lease ending the day before is inside, on the day is outside", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 10_000, 100_000, "2032-12-31"), row("Tenant B", 10_000, 100_000, "2033-01-01"), row("Tenant C", 10_000, 100_000, "2036-06-30")]));
    expect(r.rows.map((x) => x.insideHold)).toEqual([true, false, false]);
    close(r.hold.rentShare, 1 / 3);
    expect(r.buckets.at(-1)?.label).toBe("2036");
  });

  it("a leap year counts its extra day, and 29 February rolls to 1 March", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 10_000, 100_000, "2028-12-31")]));
    close(r.waltByRent, 365 / 365); // 2028-01-01 to 2028-12-31 is 365 days
    expect(addYears("2028-02-29", 1)).toBe("2029-03-01");
    expect(addYears("2028-02-29", 4)).toBe("2032-02-29");
    const s = runLeaseRollover(roll([row("Tenant A", 10_000, 100_000, "2029-02-28")], "2028-02-29", 1));
    expect(s.holdEnd).toBe("2029-03-01");
    expect(s.rows[0]?.insideHold).toBe(true);
  });

  it("a month-to-month tenant counts as occupied, expiring now", () => {
    const r = runLeaseRollover(roll([row("Tenant A", 10_000, 120_000, null, 13)]));
    expect(r.rows[0]?.status).toBe("month-to-month");
    close(r.hold.areaShare, 1);
    cents(r.markToMarket?.difference, 10_000);
  });
});

describe("bad input is refused in plain words", () => {
  it("a date that is not a real day", () => {
    expect(issueAt({ ...LEASE_ROLLOVER_EXAMPLE, analysisDate: "2027-02-30" }, "analysisDate")).toBe("Not a real calendar date.");
    expect(issueAt({ ...LEASE_ROLLOVER_EXAMPLE, analysisDate: "1/1/2028" }, "analysisDate")).toBe("Enter a date.");
    // a misshapen date is named once, not twice
    expect(leaseRolloverInput.safeParse({ ...LEASE_ROLLOVER_EXAMPLE, analysisDate: "1/1/2028" }).error?.issues).toHaveLength(1);
    expect(issueAt(roll([row("Tenant A", 1_000, 10_000, "2029-13-01")]), "rows.0.leaseEnd")).toBe("Not a real calendar date.");
  });

  it("a lease end more than 100 years out", () => {
    expect(issueAt(roll([row("Tenant A", 1_000, 10_000, "2128-01-02")]), "rows.0.leaseEnd")).toBe(
      "The lease end must fall within 100 years of the analysis date, by 2128-01-01.",
    );
    expect(leaseRolloverInput.safeParse(roll([row("Tenant A", 1_000, 10_000, "2128-01-01")])).success).toBe(true);
  });

  it("empty, zero and negative values, a blank name, a short hold, an unknown field", () => {
    expect(issueAt(roll([]), "rows")).toBe("Add at least one.");
    expect(issueAt(roll([row("Tenant A", 0, 10_000, null)]), "rows.0.area")).toBe("Must be more than zero.");
    expect(issueAt(roll([row("Tenant A", 1_000, -1, null)]), "rows.0.annualRent")).toBe("Cannot be negative.");
    expect(issueAt(roll([row("Tenant A", 1_000, 10_000, null, 0)]), "rows.0.marketRentPerSf")).toBe("Must be more than zero.");
    expect(issueAt(roll([row("   ", 1_000, 10_000, null)]), "rows.0.tenant")).toBe("Fill this in.");
    expect(issueAt({ ...LEASE_ROLLOVER_EXAMPLE, holdYears: 0 }, "holdYears")).toBe("At least 1.");
    expect(issueAt({ ...LEASE_ROLLOVER_EXAMPLE, holdYears: 2.5 }, "holdYears")).toBe("Whole numbers only.");
    expect(leaseRolloverInput.safeParse({ ...LEASE_ROLLOVER_EXAMPLE, rows: [{ ...row("Tenant A", 1_000, 10_000, null), suite: "100" }] }).success).toBe(false);
    expect(() => runLeaseRollover({ ...LEASE_ROLLOVER_EXAMPLE, rows: [] })).toThrow();
  });
});

// Second review (math-review-b, 2026-11-13): the reviewer's own inputs, pinned to a separate
// Python model written before the TypeScript was read (scratch ro.py).
describe("second review: a leap-day analysis date and a signed lease with no rent yet", () => {
  const r = runLeaseRollover(
    roll([row("Tenant A", 10_000, 100_000, "2030-02-28", 9), row("Tenant B", 10_000, 0, "2029-12-31"), row("Tenant C", 1, 1, "2030-03-01")], "2028-02-29", 2),
  );

  it("counts a lease end with no rent as occupied, and the hold ends on 1 March", () => {
    expect(r.rows.map((x) => x.status)).toEqual(["lease", "lease", "lease"]);
    expect(r.occupiedArea).toBe(20_001);
    expect(r.vacantArea).toBe(0);
    expect(r.holdEnd).toBe("2030-03-01");
    close(r.hold.areaShare, 20_000 / 20_001);
    close(r.hold.rentShare, 100_000 / 100_001);
  });

  it("matches the reviewer's model on terms, WALT and concentration", () => {
    close(r.rows[1]?.remainingYears, 671 / 365);
    close(r.waltByRent, 2.0000000273969865);
    close(r.waltByArea, 1.9191822600650792);
    close(r.largestShare, 100_000 / 100_001);
    close(r.topThreeShare, 1);
    cents(r.markToMarket?.difference, -10_000);
  });
});
