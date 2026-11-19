import { z } from "zod";
import { isoDate } from "../schemas/common";
import { addDays, calendarDateProblem, earlierOf, isWeekend, laterOf, weekday, ymd } from "./dates";
import { federalHolidays, federalObserved, holidayOn, texasHolidays, type Holiday } from "./holidays";
import type { TraceLine } from "./trace";

// Deadlines that follow from rule cards. Every date is flagged for review.
// Where a rule is unclear about weekends or holidays, the calendar keeps the
// earlier date, so a deadline is never shown later than it might be.

// A date the calendar holds, with a four-digit year. A misshapen date is named once,
// by isoDate's own check; this one refuses 2027-02-30, 2026-13-01, 2026-00-10 and
// 0026-11-14, which would otherwise roll into another day or another century and
// give a deadline that looks right and is not. A refinement adds nothing to the
// JSON schema the connector lists.
const calendarDate = isoDate.superRefine((s, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return;
  const problem = calendarDateProblem(s);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

export const deadlinesInput = z
  .object({
    firstSaleDate: calendarDate.nullable(),
    firstTexasSaleDate: calendarDate.nullable(),
    exchangeTransferDate: calendarDate.nullable(),
    returnDueDate: calendarDate.nullable().describe("tax return due date for the year of transfer, with extensions"),
    appraisalNoticeDate: calendarDate.nullable().describe("date the appraisal notice was delivered"),
    protestYear: z.number().int().min(2000).max(2100).nullable(),
    // Optional, so an input written before this field existed still parses.
    franchiseReportYear: z.number().int().min(2000).max(2100).nullable().optional().describe("the year a Texas franchise tax report is due, for an entity subject to the tax"),
    contractEffectiveDate: calendarDate.nullable(),
    contractPeriods: z
      .array(
        z
          .object({
            label: z.string().min(1).max(60),
            days: z.number().int().min(1).max(3650),
            roll: z.enum(["none", "next-business-day"]),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export type DeadlinesInput = z.infer<typeof deadlinesInput>;

export type Deadline = {
  id: string;
  label: string;
  date: string;
  weekday: string;
  computedFrom: string;
  rolledFrom: string | null;
  rollReason: string | null;
  ruleId: string | null;
  note: string | null;
  needsReview: true;
};

type DayCheck = (date: string) => string | null; // reason the day does not count, or null

const federalDayOff: DayCheck = (date) => {
  if (isWeekend(date)) return weekday(date);
  const legal = holidayOn(date, federalHolidays);
  if (legal) return legal.name;
  const observed = holidayOn(date, federalObserved);
  return observed ? observed.name : null;
};

const texasDayOff: DayCheck = (date) => {
  if (isWeekend(date)) return weekday(date);
  const h: Holiday | undefined = holidayOn(date, texasHolidays);
  return h ? h.name : null;
};

// Moves forward past days that do not count, naming each one it skips.
function roll(date: string, check: DayCheck): { date: string; from: string | null; reason: string | null } {
  let d = date;
  const skipped: string[] = [];
  for (let reason = check(d); reason; reason = check(d)) {
    skipped.push(reason === weekday(d) ? `${reason} ${d}` : `${reason}, ${weekday(d)} ${d}`);
    d = addDays(d, 1);
  }
  return skipped.length === 0 ? { date, from: null, reason: null } : { date: d, from: date, reason: skipped.join("; ") };
}

function item(p: Omit<Deadline, "weekday" | "needsReview">): Deadline {
  return { ...p, weekday: weekday(p.date), needsReview: true };
}

export function computeDeadlines(raw: DeadlinesInput): { items: Deadline[]; trace: TraceLine[] } {
  const d = deadlinesInput.parse(raw);
  const items: Deadline[] = [];

  if (d.firstSaleDate) {
    const base = addDays(d.firstSaleDate, 15);
    const r = roll(base, federalDayOff);
    items.push(
      item({
        id: "form-d",
        label: "Form D due at the SEC",
        date: r.date,
        computedFrom: `first sale ${d.firstSaleDate} + 15 calendar days = ${base}`,
        rolledFrom: r.from,
        rollReason: r.reason,
        ruleId: "us-fed.reg-d.form-d-filing",
        note: "Holidays are the federal legal public holidays and the weekdays OPM observes for them. Filing earlier is allowed.",
      }),
    );
  }

  if (d.firstTexasSaleDate) {
    items.push(
      item({
        id: "texas-notice",
        label: "Texas notice filing due",
        date: addDays(d.firstTexasSaleDate, 15),
        computedFrom: `first sale in Texas ${d.firstTexasSaleDate} + 15 days`,
        rolledFrom: null,
        rollReason: null,
        ruleId: "us-tx.securities.rule-506-notice",
        note: "Also due when the Form D is filed with the SEC, if that comes first. The rule sets no weekend extension, so the earlier date stands.",
      }),
    );
  }

  if (d.exchangeTransferDate) {
    const id = addDays(d.exchangeTransferDate, 45);
    const day180 = addDays(d.exchangeTransferDate, 180);
    items.push(
      item({
        id: "1031-identification",
        label: "1031 identification period ends (midnight)",
        date: id,
        computedFrom: `transfer ${d.exchangeTransferDate} + 45 days`,
        rolledFrom: null,
        rollReason: null,
        ruleId: "us-fed.irc.1031-periods",
        note: "Calendar days; the regulation gives no weekend or holiday extension.",
      }),
    );
    const end = d.returnDueDate ? earlierOf(day180, d.returnDueDate) : day180;
    items.push(
      item({
        id: "1031-exchange",
        label: "1031 exchange period ends (midnight)",
        date: end,
        computedFrom: d.returnDueDate
          ? `earlier of transfer + 180 days (${day180}) and the return due date (${d.returnDueDate})`
          : `transfer ${d.exchangeTransferDate} + 180 days`,
        rolledFrom: null,
        rollReason: null,
        ruleId: "us-fed.irc.1031-periods",
        note: d.returnDueDate
          ? "Calendar days; no weekend or holiday extension."
          : "Add the tax return due date (with extensions): the period ends earlier if the return is due first.",
      }),
    );
  }

  const protestYear = d.protestYear ?? (d.appraisalNoticeDate ? Number(d.appraisalNoticeDate.slice(0, 4)) : null);
  if (protestYear) {
    const may15 = ymd(protestYear, 5, 15);
    const base = d.appraisalNoticeDate ? laterOf(may15, addDays(d.appraisalNoticeDate, 30)) : may15;
    const r = roll(base, texasDayOff);
    items.push(
      item({
        id: "texas-protest",
        label: `Texas property tax protest due (${protestYear})`,
        date: r.date,
        computedFrom: d.appraisalNoticeDate
          ? `later of May 15 and notice ${d.appraisalNoticeDate} + 30 days = ${base}`
          : `May 15, ${protestYear} (add the notice date if it arrived after April 15)`,
        rolledFrom: r.from,
        rollReason: r.reason,
        ruleId: "us-tx.tax.protest-deadline",
        note: "Moved only for weekends and the holidays Texas law lists; Columbus Day and optional holidays keep the earlier date.",
      }),
    );
  }

  if (d.franchiseReportYear) {
    const year = d.franchiseReportYear;
    const base = ymd(year, 5, 15);
    // Tax Code 111.053 also moves the date off a legal holiday on the list the
    // Comptroller publishes each year. That list is not in the catalog, so only
    // weekends are applied: the date shown is never later than the true one.
    const r = roll(base, (date) => (isWeekend(date) ? weekday(date) : null));
    items.push(
      item({
        id: "texas-franchise-report",
        label: `Texas franchise tax report and Public Information Report due (${year})`,
        date: r.date,
        computedFrom: `May 15, ${year}`,
        rolledFrom: r.from,
        rollReason: r.reason,
        ruleId: "us-tx.franchise-tax.due-date-extension",
        note: "Moved only for a weekend. The law also moves it off a legal holiday on the Comptroller's yearly list; check that list. An extension to November 15 is requested, with payment, by this date.",
      }),
    );
  }

  if (d.contractEffectiveDate) {
    for (const [i, p] of d.contractPeriods.entries()) {
      const base = addDays(d.contractEffectiveDate, p.days);
      const r = p.roll === "next-business-day" ? roll(base, federalDayOff) : { date: base, from: null, reason: null };
      items.push(
        item({
          id: `contract-${i + 1}`,
          label: p.label,
          date: r.date,
          computedFrom: `effective date ${d.contractEffectiveDate} + ${p.days} days`,
          rolledFrom: r.from,
          rollReason: r.reason,
          ruleId: null,
          note: "From your contract, not a rule card. Check how the contract counts days.",
        }),
      );
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const trace: TraceLine[] = items.map((x) => ({
    label: x.label,
    formula: x.rolledFrom ? `${x.computedFrom}; moved past ${x.rollReason}` : x.computedFrom,
    value: `${x.weekday}, ${x.date}`,
  }));
  return { items, trace };
}

export const DEADLINES_EXAMPLE: DeadlinesInput = {
  firstSaleDate: "2026-06-18",
  firstTexasSaleDate: "2026-06-25",
  exchangeTransferDate: "2026-11-20",
  returnDueDate: "2027-04-15",
  appraisalNoticeDate: "2026-05-20",
  protestYear: null,
  contractEffectiveDate: "2026-12-01",
  contractPeriods: [
    { label: "Feasibility period ends (per contract)", days: 45, roll: "none" },
    { label: "Closing (per contract)", days: 75, roll: "next-business-day" },
  ],
};
