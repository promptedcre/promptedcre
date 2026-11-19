import { describe, expect, it } from "vitest";
import { buildDate } from "@/lib/build-date";

// The site prints the date its counts were computed. Read in UTC, a build made in the evening
// in the United States is dated tomorrow, and a reviewer caught "Counted 2026-11-14" on the 13th.
describe("buildDate", () => {
  it("reads the build clock in Central time, so an evening build is not dated tomorrow", () => {
    expect(buildDate(new Date("2026-11-14T00:38:00Z"))).toBe("2026-11-13");
    expect(buildDate(new Date("2026-11-13T18:00:00Z"))).toBe("2026-11-13");
  });

  it("follows daylight time", () => {
    // 04:30 UTC is 11:30 PM the day before in Central daylight time (UTC-5)
    expect(buildDate(new Date("2026-07-02T04:30:00Z"))).toBe("2026-07-01");
    // and 05:30 UTC is 12:30 AM the same day
    expect(buildDate(new Date("2026-07-02T05:30:00Z"))).toBe("2026-07-02");
  });

  it("is always a plain ISO date", () => {
    expect(buildDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
