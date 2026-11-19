"use client";

import { useRef, useState } from "react";
import { computeDeadlines, DEADLINES_EXAMPLE, deadlinesInput, type DeadlinesInput } from "@/lib/calculators/deadlines";
import { issueMap } from "./format";
import { DateField, FieldGroup, FormAction, GroupRow, InputsPanel, NumberField, SelectField, TextField, type FixLabels } from "./fields";
import { DeadlineSchedule, DeadlineTimeline, Drawing, ReviewMark, Words, type Headline } from "./figures";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, TraceView, type SheetSlots } from "./trace-view";

type Period = DeadlinesInput["contractPeriods"][number];

const LABELS: FixLabels = {
  firstSaleDate: "First sale",
  firstTexasSaleDate: "First sale to a Texas investor",
  exchangeTransferDate: "Relinquished property transferred",
  returnDueDate: "Tax return due",
  appraisalNoticeDate: "Appraisal notice delivered",
  protestYear: "Tax year",
  franchiseReportYear: "Report year",
  contractEffectiveDate: "Contract effective date",
  "contractPeriods.*.label": "Contract deadline # name",
  "contractPeriods.*.days": "Contract deadline # days",
};

function deadlinesHeadline(count: number, first: { weekday: string; date: string } | undefined): string {
  if (!first) return "Enter a date to see the deadlines that follow from it.";
  return `${count} ${count === 1 ? "date" : "dates"}, the first on ${first.weekday}, ${first.date}.`;
}

export function DeadlineCalculator({
  ruleTitles,
  tool,
  reviewNote,
  ...slots
}: { ruleTitles: Record<string, string>; tool?: string | null; reviewNote: string } & SheetSlots) {
  const [input, setInput] = useState<DeadlinesInput>(DEADLINES_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  // A stable id per contract deadline, so removing one row never hands its text to the next.
  const [periodKeys, setPeriodKeys] = useState<number[]>(() => DEADLINES_EXAMPLE.contractPeriods.map((_, i) => i));
  const nextKey = useRef(100);
  const setDate = (k: keyof DeadlinesInput) => (v: string | null) => setInput((p) => ({ ...p, [k]: v }) as DeadlinesInput);
  const setPeriod = (i: number, x: Partial<Period>) => setInput((p) => ({ ...p, contractPeriods: p.contractPeriods.map((c, j) => (j === i ? { ...c, ...x } : c)) }));
  const key = JSON.stringify(input);
  const parsed = deadlinesInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: computeDeadlines(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== JSON.stringify(DEADLINES_EXAMPLE);

  const inputs = (
    <InputsPanel
      changed={changed}
      title="Dates you know"
      onReset={() => {
        setInput(DEADLINES_EXAMPLE);
        setPeriodKeys(DEADLINES_EXAMPLE.contractPeriods.map((_, i) => i));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Raise">
          <DateField label="First sale, any investor" value={input.firstSaleDate} onChange={setDate("firstSaleDate")} issue={issues.get("firstSaleDate")} />
          <DateField label="First sale in Texas" value={input.firstTexasSaleDate} onChange={setDate("firstTexasSaleDate")} issue={issues.get("firstTexasSaleDate")} />
        </FieldGroup>
        <FieldGroup title="1031 exchange">
          <DateField label="Property transferred" value={input.exchangeTransferDate} onChange={setDate("exchangeTransferDate")} hint="the relinquished property" issue={issues.get("exchangeTransferDate")} />
          <DateField label="Tax return due" value={input.returnDueDate} onChange={setDate("returnDueDate")} hint="with extensions, for that year" issue={issues.get("returnDueDate")} />
        </FieldGroup>
        <FieldGroup title="Texas property tax">
          <DateField label="Appraisal notice delivered" value={input.appraisalNoticeDate} onChange={setDate("appraisalNoticeDate")} issue={issues.get("appraisalNoticeDate")} />
          <NumberField
            label="Or the tax year only"
            kind="year"
            optional
            value={input.protestYear}
            onChange={(v) => setInput((p) => ({ ...p, protestYear: v }))}
            hint="used when no notice date is entered"
            issue={issues.get("protestYear")}
          />
        </FieldGroup>
        <FieldGroup title="Texas franchise tax">
          <NumberField
            label="Report year"
            kind="year"
            optional
            value={input.franchiseReportYear ?? null}
            onChange={(v) => setInput((p) => ({ ...p, franchiseReportYear: v }))}
            hint="the year the May 15 report is due, for an entity subject to the tax"
            issue={issues.get("franchiseReportYear")}
            wide
          />
        </FieldGroup>
        <FieldGroup
          title="Contract"
          action={
            input.contractPeriods.length < 6 ? (
              <FormAction
                onClick={() => {
                  setInput((p) => ({ ...p, contractPeriods: [...p.contractPeriods, { label: "New deadline (per contract)", days: 30, roll: "none" }] }));
                  setPeriodKeys((k) => [...k, nextKey.current++]);
                }}
              >
                Add a deadline
              </FormAction>
            ) : undefined
          }
        >
          <DateField label="Effective date" value={input.contractEffectiveDate} onChange={setDate("contractEffectiveDate")} issue={issues.get("contractEffectiveDate")} wide />
          {input.contractPeriods.map((c, i) => (
            <div key={periodKeys[i] ?? `period-${i}`} className="calc-set">
              <GroupRow
                action={
                  <FormAction
                    tone="faint"
                    label={`Remove contract deadline ${i + 1}`}
                    onClick={() => {
                      setInput((p) => ({ ...p, contractPeriods: p.contractPeriods.filter((_, j) => j !== i) }));
                      setPeriodKeys((k) => k.filter((_, j) => j !== i));
                    }}
                  >
                    Remove
                  </FormAction>
                }
              >
                Contract deadline {i + 1}
              </GroupRow>
              <TextField label="What is due" value={c.label} onChange={(v) => setPeriod(i, { label: v })} issue={issues.get(`contractPeriods.${i}.label`)} wide />
              <NumberField
                label="Days after"
                kind="int"
                unit="days"
                value={c.days}
                onChange={(v) => setPeriod(i, { days: v ?? Number.NaN })}
                issue={issues.get(`contractPeriods.${i}.days`)}
                wideOnPhone
              />
              <SelectField
                label="On a day off"
                value={c.roll}
                options={[
                  { value: "none", label: "Keep the date" },
                  { value: "next-business-day", label: "Next business day" },
                ]}
                onChange={(v) => setPeriod(i, { roll: v })}
                wideOnPhone
              />
            </div>
          ))}
        </FieldGroup>
      </div>
    </InputsPanel>
  );

  const sheet = {
    ...slots,
    tool,
    state: key,
    changed,
    inputs,
    problem: parsed.success ? null : { say: "Fix the dates to see the deadlines.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { r } = held;

  const first = r.items[0];
  const flagged = r.items.filter((d) => d.needsReview).length;
  const moved = r.items.filter((d) => d.rolledFrom).length;
  // The lead figure is the first date the sentence names; the cells count what the sentence does not.
  const lead: Headline | null = first ? { label: "First date", value: first.date, sub: `${first.weekday}: ${first.label}` } : null;
  const cells: Headline[] = first
    ? [
        { label: "Flagged for review", value: `${flagged} of ${r.items.length}`, sub: flagged > 0 ? "check each against its rule" : undefined },
        { label: "Moved past a day off", value: String(moved), sub: moved > 0 ? "a weekend or a holiday" : undefined },
      ]
    : [];

  return (
    <CalcSheet
      {...sheet}
      headline={deadlinesHeadline(r.items.length, first)}
      lead={lead}
      cells={cells}
      figures={
        first ? (
          <>
            <Drawing title="On the calendar" note="numbered as in the schedule">
              <DeadlineTimeline items={r.items} />
            </Drawing>
            {flagged > 0 && (
              <Words>
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <ReviewMark />
                  <span className="min-w-0">
                    {flagged === r.items.length ? `All ${flagged} dates here are flagged for review. ` : `${flagged} of these dates are flagged for review. `}
                    {reviewNote}
                  </span>
                </p>
              </Words>
            )}
          </>
        ) : undefined
      }
    >
      {first && (
        <CalcSection id="schedule" title="Each date, and the rule it comes from." note={`${r.items.length} ${r.items.length === 1 ? "date" : "dates"} · a moved date says where it moved from`}>
          <DeadlineSchedule items={r.items} ruleTitles={ruleTitles} />
        </CalcSection>
      )}
      {r.trace.length > 0 && (
        <CalcSection id="trace" title="How each date was worked out." note="Calendar days unless a rule says otherwise">
          <TraceView lines={r.trace} tool={tool} />
        </CalcSection>
      )}
    </CalcSheet>
  );
}
