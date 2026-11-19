"use client";

import { useState } from "react";
import { DEBT_EXAMPLE, debtInput, sizeDebt, type DebtInput } from "@/lib/calculators/debt";
import { usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, InputsPanel, NumberField, type FixLabels } from "./fields";
import { Drawing, LimitBars } from "./figures";
import { CalcSheet, useHeld } from "./sheet";
import { debtFigures, debtHeadline, debtLimitBars } from "./shape";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

const EXAMPLE_KEY = JSON.stringify(DEBT_EXAMPLE);

const LABELS: FixLabels = {
  noi: ["Net operating income", "money"],
  value: ["Value or price", "money"],
  rate: ["Interest rate", "pct"],
  amortYears: "Amortization",
  termYears: "Term",
  ioYears: "Interest-only period",
  minDscr: ["Min DSCR", "multiple"],
  maxLtv: ["Max loan-to-value", "pct"],
  minDebtYield: ["Min debt yield", "pct"],
};

export function DebtCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [input, setInput] = useState<DebtInput>(DEBT_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  const set = (k: keyof DebtInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v }) as DebtInput);
  const req = (k: keyof DebtInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v ?? Number.NaN }) as DebtInput);
  const key = JSON.stringify(input);
  const parsed = debtInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: sizeDebt(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setInput(DEBT_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Property">
          <NumberField label="Net operating income" kind="money" prefix="$" unit="/yr" step={5000} value={input.noi} onChange={req("noi")} issue={issues.get("noi")} />
          <NumberField label="Value or price" kind="money" prefix="$" step={50000} value={input.value} onChange={req("value")} issue={issues.get("value")} />
        </FieldGroup>
        <FieldGroup title="Loan terms">
          <NumberField label="Interest rate" kind="pct" unit="%/yr" step={0.125} value={input.rate} onChange={req("rate")} issue={issues.get("rate")} />
          <NumberField label="Amortization" kind="int" unit="yrs" value={input.amortYears} onChange={req("amortYears")} hint="0 for interest only" issue={issues.get("amortYears")} />
          <NumberField label="Term" kind="int" unit="yrs" value={input.termYears} onChange={req("termYears")} issue={issues.get("termYears")} />
          <NumberField label="Interest-only period" kind="int" unit="yrs" value={input.ioYears} onChange={req("ioYears")} issue={issues.get("ioYears")} />
        </FieldGroup>
        <FieldGroup title="Lender limits" note="Leave a limit blank to drop it. At least one is needed.">
          <NumberField label="Min DSCR" kind="multiple" unit="x" optional value={input.minDscr} onChange={set("minDscr")} issue={issues.get("minDscr")} />
          <NumberField label="Max loan-to-value" kind="pct" unit="%" step={1} optional value={input.maxLtv} onChange={set("maxLtv")} issue={issues.get("maxLtv")} />
          <NumberField label="Min debt yield" kind="pct" unit="%" optional value={input.minDebtYield} onChange={set("minDebtYield")} issue={issues.get("minDebtYield")} wide />
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
    problem: parsed.success ? null : { say: "Fix the inputs to size the loan.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;
  const f = debtFigures(d, r);

  return (
    <CalcSheet
      {...sheet}
      headline={debtHeadline(r)}
      lead={f.lead}
      cells={f.rest}
      figures={
        <Drawing title="The loan each limit allows" note="solid: the limit that binds">
          <LimitBars limits={debtLimitBars(d, r)} loan={r.loan} />
        </Drawing>
      }
    >
      <CalcSection id="schedule" title="The loan, year by year." note={`${count(r.schedule.length, "year")} · payments monthly`}>
        <Schedule
          caption="Loan schedule by year"
          columns={[{ head: "Year" }, { head: "Begins at" }, { head: "Interest" }, { head: "Principal" }, { head: "Paid" }, { head: "Ends at" }]}
          rows={r.schedule.map((y) => [y.year, usd(y.beginBalance, false), usd(y.interest, false), usd(y.principal, false), usd(y.payment, false), usd(y.endBalance, false)])}
        />
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Excel's definitions of PV, PMT and FV">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
