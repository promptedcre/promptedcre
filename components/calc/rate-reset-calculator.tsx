"use client";

import { useState } from "react";
import { RATE_RESET_EXAMPLE, rateResetInput, rateText, runRateReset, type RateResetInput } from "@/lib/calculators/rate-reset";
import { multiple, pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, FormAction, InputsPanel, NumberField, type FixLabels } from "./fields";
import { rateResetCells, rateResetFigures, rateResetHeadline } from "./rate-reset-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

// The form holds a blank year as null; the schema reads it as a number to fix.
type Ui = Omit<RateResetInput, "indexPath"> & { indexPath: Array<number | null> };

const MAX_YEARS = 40;

const toInput = (u: Ui): RateResetInput => ({ ...u, indexPath: u.indexPath.map((x) => x ?? Number.NaN) });

const EXAMPLE_KEY = JSON.stringify(RATE_RESET_EXAMPLE);

const LABELS: FixLabels = {
  loan: ["Loan amount", "money"],
  amortYears: "Amortization",
  spread: ["Spread", "pct"],
  indexPath: "Index path",
  "indexPath.*": ["Year # index", "pct"],
  rateCap: ["Rate cap", "pct"],
  rateFloor: ["Rate floor", "pct"],
  noi: ["Year-1 NOI", "money"],
  noiGrowth: ["NOI growth", "pct"],
  minDscr: ["Minimum coverage", "multiple"],
};

export function RateResetCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(RATE_RESET_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = rateResetInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runRateReset(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const set = (k: Exclude<keyof Ui, "indexPath">) => (v: number | null) => setUi((p) => ({ ...p, [k]: v }) as Ui);
  const req = (k: Exclude<keyof Ui, "indexPath">) => (v: number | null) => setUi((p) => ({ ...p, [k]: v ?? Number.NaN }) as Ui);
  const setYear = (i: number) => (v: number | null) => setUi((p) => ({ ...p, indexPath: p.indexPath.map((x, j) => (j === i ? v : x)) }));

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(RATE_RESET_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Loan">
          <NumberField label="Loan amount" kind="money" prefix="$" step={50000} value={ui.loan} onChange={req("loan")} issue={issues.get("loan")} />
          <NumberField
            label="Amortization"
            kind="int"
            unit="yrs"
            value={ui.amortYears}
            onChange={req("amortYears")}
            hint="payments monthly; 0 for interest only"
            issue={issues.get("amortYears")}
          />
        </FieldGroup>

        <FieldGroup title="Rate" note="The all-in rate is the index plus the spread, held inside the cap and floor. Leave the cap or floor blank for none.">
          <NumberField label="Spread" kind="pct" unit="%" step={0.125} value={ui.spread} onChange={req("spread")} hint="over the index" issue={issues.get("spread")} wide />
          <NumberField label="Rate cap" kind="pct" unit="%" step={0.125} optional value={ui.rateCap} onChange={set("rateCap")} hint="highest all-in rate" issue={issues.get("rateCap")} />
          <NumberField label="Rate floor" kind="pct" unit="%" step={0.125} optional value={ui.rateFloor} onChange={set("rateFloor")} hint="lowest all-in rate" issue={issues.get("rateFloor")} />
        </FieldGroup>

        <FieldGroup
          title="Index path"
          note="One index rate a year, a path you choose to test, not a forecast. The rate resets at the start of each loan year; the path's length is the horizon."
          action={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {ui.indexPath.length < MAX_YEARS && (
                <FormAction onClick={() => setUi((p) => ({ ...p, indexPath: [...p.indexPath, p.indexPath.at(-1) ?? null] }))}>Add a year</FormAction>
              )}
              {ui.indexPath.length > 1 && (
                <FormAction tone="faint" label={`Remove year ${ui.indexPath.length}`} onClick={() => setUi((p) => ({ ...p, indexPath: p.indexPath.slice(0, -1) }))}>
                  Remove the last year
                </FormAction>
              )}
            </span>
          }
        >
          {ui.indexPath.map((x, i) => (
            <NumberField key={i} label={`Year ${i + 1} index`} kind="pct" unit="%" step={0.125} value={x} onChange={setYear(i)} issue={issues.get(`indexPath.${i}`)} />
          ))}
          {ui.indexPath.length % 2 === 1 && <div aria-hidden="true" className="bg-raised" />}
        </FieldGroup>

        <FieldGroup title="Property" note="Leave the minimum coverage blank to skip the flag.">
          <NumberField label="Year-1 NOI" kind="money" prefix="$" unit="/yr" step={5000} value={ui.noi} onChange={req("noi")} issue={issues.get("noi")} />
          <NumberField label="NOI growth" kind="pct" unit="%/yr" value={ui.noiGrowth} onChange={req("noiGrowth")} issue={issues.get("noiGrowth")} />
          <NumberField label="Minimum coverage" kind="multiple" unit="x" optional value={ui.minDscr} onChange={set("minDscr")} hint="DSCR to flag" issue={issues.get("minDscr")} wide />
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
    problem: parsed.success ? null : { say: "Fix the inputs to run the path.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = rateResetFigures(d, r);

  return (
    // the sentence gives the year and the change from year 1, so the lead figure stands without them
    <CalcSheet {...sheet} headline={rateResetHeadline(d, r)} lead={{ label: f.lead.label, value: f.lead.value }} cells={rateResetCells(d, r)}>
      <CalcSection id="schedule" title="The loan, year by year." note={`${count(r.years.length, "year")} · rate resets each year · payments monthly`}>
        <Schedule
          caption="Rate, payment, balance and coverage by year"
          columns={[
            { head: "Year" },
            { head: "Rate" },
            { head: "Payment / mo" },
            { head: "Debt service" },
            { head: "Interest" },
            { head: "Principal" },
            { head: "Ends at" },
            { head: "NOI" },
            { head: "Coverage" },
            { head: "vs year 1" },
          ]}
          rows={r.years.map((y) => [
            y.year,
            `${rateText(y.rate)}${y.bound ? ` ${y.bound}` : ""}`,
            y.paidOff ? "paid off" : usd(y.payment, false),
            usd(y.debtService, false),
            usd(y.interest, false),
            usd(y.principal, false),
            usd(y.endBalance, false),
            usd(y.noi, false),
            y.dscr === null ? "none" : `${multiple(y.dscr)}${y.belowMin ? " below" : ""}`,
            y.shock === null ? "none" : y.year === 1 ? "" : pct(y.shock),
          ])}
        />
        <p className="type-body-s m-0 mt-3 text-faint">“cap” or “floor” after a rate: that limit set it. “below” after a coverage: under the minimum you set.</p>
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Excel's definition of PMT; payments monthly in arrears">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
