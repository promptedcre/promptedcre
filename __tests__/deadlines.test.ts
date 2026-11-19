import { describe, expect, it } from "vitest";
import { weekday } from "@/lib/calculators/dates";
import { computeDeadlines, DEADLINES_EXAMPLE, type DeadlinesInput } from "@/lib/calculators/deadlines";
import { federalObserved, texasHolidays } from "@/lib/calculators/holidays";

const empty: DeadlinesInput = {
  firstSaleDate: null,
  firstTexasSaleDate: null,
  exchangeTransferDate: null,
  returnDueDate: null,
  appraisalNoticeDate: null,
  protestYear: null,
  contractEffectiveDate: null,
  contractPeriods: [],
};
const one = (input: Partial<DeadlinesInput>, id: string) => computeDeadlines({ ...empty, ...input }).items.find((i) => i.id === id);

describe("holiday calendars", () => {
  it("matches OPM's 2026 federal holiday schedule, observed days included", () => {
    // OPM, Federal Holidays, 2026 tab, opened 2026-11-11
    expect(federalObserved(2026).map((h) => h.date)).toEqual([
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-10-12",
      "2026-11-11",
      "2026-11-26",
      "2026-12-25",
    ]);
  });

  it("lists Texas national and state holidays, without Columbus Day", () => {
    const tx = texasHolidays(2026).map((h) => h.date);
    expect(tx).toContain("2026-06-19");
    expect(tx).toContain("2026-11-27"); // Friday after Thanksgiving
    expect(tx).not.toContain("2026-10-12");
  });
});

describe("Form D deadline", () => {
  it("is 15 calendar days after the first sale", () => {
    expect(one({ firstSaleDate: "2026-03-02" }, "form-d")?.date).toBe("2026-03-17");
  });

  it("moves past weekends and observed federal holidays", () => {
    const july = one({ firstSaleDate: "2026-06-18" }, "form-d");
    expect(july?.rolledFrom).toBe("2026-07-03");
    expect(july?.date).toBe("2026-07-06");
    expect(one({ firstSaleDate: "2026-02-01" }, "form-d")?.date).toBe("2026-02-17"); // lands on Washington's Birthday
    expect(one({ firstSaleDate: "2026-10-03" }, "form-d")?.date).toBe("2026-10-19"); // lands on a Sunday
  });
});

describe("1031 periods", () => {
  it("reproduces the regulation's own example", () => {
    // 26 CFR 1.1031(k)-1(b)(3): transfer on November 16, 1992
    const base = { exchangeTransferDate: "1992-11-16" };
    expect(one(base, "1031-identification")?.date).toBe("1992-12-31");
    expect(one({ ...base, returnDueDate: "1993-03-15" }, "1031-exchange")?.date).toBe("1993-03-15");
    expect(one({ ...base, returnDueDate: "1993-09-15" }, "1031-exchange")?.date).toBe("1993-05-15");
  });

  it("does not move for weekends", () => {
    const id = one({ exchangeTransferDate: "2026-11-21" }, "1031-identification");
    expect(weekday(id?.date ?? "")).toBe("Tuesday");
    expect(one({ exchangeTransferDate: "2026-11-16" }, "1031-identification")?.rolledFrom).toBeNull();
  });
});

describe("Texas protest deadline", () => {
  it("is the later of May 15 and 30 days after the notice", () => {
    expect(one({ appraisalNoticeDate: "2026-04-01" }, "texas-protest")?.date).toBe("2026-05-15");
    expect(one({ appraisalNoticeDate: "2026-04-20" }, "texas-protest")?.date).toBe("2026-05-20");
  });

  it("moves past weekends and Texas holidays, not Columbus Day", () => {
    expect(one({ protestYear: 2027 }, "texas-protest")?.date).toBe("2027-05-17"); // May 15, 2027 is a Saturday
    const juneteenth = one({ appraisalNoticeDate: "2026-05-20" }, "texas-protest");
    expect(juneteenth?.rolledFrom).toBe("2026-06-19");
    expect(juneteenth?.date).toBe("2026-06-22");
    expect(one({ appraisalNoticeDate: "2026-09-12" }, "texas-protest")?.date).toBe("2026-10-12");
  });
});

describe("the worked example", () => {
  it("cites a rule for every rule-based date and flags all of them", () => {
    const { items } = computeDeadlines(DEADLINES_EXAMPLE);
    expect(items.every((i) => i.needsReview)).toBe(true);
    expect(items.filter((i) => !i.id.startsWith("contract")).every((i) => i.ruleId)).toBe(true);
    const closing = items.find((i) => i.label.startsWith("Closing"));
    expect(closing?.rolledFrom).toBe("2027-02-14");
    expect(closing?.date).toBe("2027-02-16");
    // names every day it skipped: the Sunday, then Washington's Birthday on Monday
    expect(closing?.rollReason).toBe("Sunday 2027-02-14; Washington's Birthday, Monday 2027-02-15");
    const dates = items.map((i) => i.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
