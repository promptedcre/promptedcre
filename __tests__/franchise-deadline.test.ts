import { describe, expect, it } from "vitest";
import { computeDeadlines, DEADLINES_EXAMPLE, type DeadlinesInput } from "@/lib/calculators/deadlines";
import { act, exampleFirm, realCorpus, refusal } from "./helpers/engine";

const NONE: DeadlinesInput = {
  firstSaleDate: null,
  firstTexasSaleDate: null,
  exchangeTransferDate: null,
  returnDueDate: null,
  appraisalNoticeDate: null,
  protestYear: null,
  contractEffectiveDate: null,
  contractPeriods: [],
};

const franchise = (year: number) => computeDeadlines({ ...NONE, franchiseReportYear: year }).items.find((d) => d.id === "texas-franchise-report");

describe("Texas franchise tax report date", () => {
  it("is May 15, and stays there on a weekday", () => {
    // May 15, 2026 is a Friday; May 15, 2028 is a Monday.
    expect(franchise(2026)).toMatchObject({ date: "2026-05-15", weekday: "Friday", rolledFrom: null, needsReview: true });
    expect(franchise(2028)).toMatchObject({ date: "2028-05-15", weekday: "Monday", rolledFrom: null });
  });

  it("moves past a weekend, and says so", () => {
    // May 15, 2027 is a Saturday; May 15, 2022 was a Sunday.
    expect(franchise(2027)).toMatchObject({ date: "2027-05-17", weekday: "Monday", rolledFrom: "2027-05-15" });
    expect(franchise(2022)).toMatchObject({ date: "2022-05-16", weekday: "Monday", rolledFrom: "2022-05-15" });
  });

  it("cites a rule card that exists, and warns that the holiday list is not applied", () => {
    const item = franchise(2027);
    expect(realCorpus().rules.some((r) => r.id === item?.ruleId)).toBe(true);
    expect(item?.note).toMatch(/Comptroller's yearly list/);
  });

  it("leaves every earlier input and result unchanged", () => {
    // An input written before the field existed has no franchiseReportYear at all.
    const before = computeDeadlines(DEADLINES_EXAMPLE).items;
    expect(before.some((d) => d.id === "texas-franchise-report")).toBe(false);
    expect(computeDeadlines({ ...DEADLINES_EXAMPLE, franchiseReportYear: null }).items).toEqual(before);
  });
});

describe("pcre deadline compute, for franchise reports", () => {
  type Out = { added: { id: string; due: string; rule: string | null; needsReview: boolean }[]; existing: { id: string }[] };

  it("adds one deadline for a year, or one for each year through another", () => {
    const ctx = exampleFirm();
    const one = act<Out>(ctx, "deadline.compute", { franchiseReportYear: 2027 });
    expect(one.added).toMatchObject([{ id: "texas-franchise-report-2027-05-17", due: "2027-05-17", rule: "us-tx.franchise-tax.due-date-extension", needsReview: true }]);
    const many = act<Out>(ctx, "deadline.compute", { franchiseReportYear: 2027, franchiseReportThrough: 2030 });
    expect(many.existing.map((d) => d.id)).toEqual(["texas-franchise-report-2027-05-17"]);
    expect(many.added.map((d) => d.due)).toEqual(["2028-05-15", "2029-05-15", "2030-05-15"]);
    expect(act<{ problems: string[] }>(ctx, "firm.check").problems).toEqual([]);
  });

  it("refuses a range it cannot read", () => {
    const ctx = exampleFirm();
    expect(refusal(() => act(ctx, "deadline.compute", { franchiseReportThrough: 2030 }))).toBe("invalid-input");
    expect(refusal(() => act(ctx, "deadline.compute", { franchiseReportYear: 2030, franchiseReportThrough: 2027 }))).toBe("invalid-input");
  });

  it("keeps two subjects' computed dates apart", () => {
    const ctx = exampleFirm();
    act(ctx, "subject.add", { id: "offering-one", kind: "offering", label: "First offering" });
    act(ctx, "subject.add", { id: "offering-two", kind: "offering", label: "Second offering" });
    const a = act<Out>(ctx, "deadline.compute", { firstSaleDate: "2026-03-02", subject: "offering-one" });
    const b = act<Out>(ctx, "deadline.compute", { firstSaleDate: "2026-03-02", subject: "offering-two" });
    expect(a.added.map((d) => d.id)).toEqual(["offering-one-form-d-2026-03-17"]);
    expect(b.added.map((d) => d.id)).toEqual(["offering-two-form-d-2026-03-17"]);
    expect(b.existing).toEqual([]);
  });
});
