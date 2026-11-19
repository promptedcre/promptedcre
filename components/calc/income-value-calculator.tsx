"use client";

import { useRef, useState } from "react";
import { INCOME_VALUE_EXAMPLE, incomeValueInput, runIncomeValue, type IncomeValueInput } from "@/lib/calculators/income-value";
import { pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, FormAction, GroupRow, InputsPanel, NumberField, SelectField, TextField, type FixLabels } from "./fields";
import { Drawing, SplitBar, Words } from "./figures";
import { incomeValueCells, incomeValueFigures, incomeValueHeadline, incomeValueSplit } from "./income-value-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

// key: a stable id for the row, so removing one line never hands its text to the next.
type LineUi = { key: number; label: string; amount: number | null };
type Ui = Omit<IncomeValueInput, "expenses"> & { expenses: LineUi[] };

const MAX_LINES = 20;

const fromInput = (d: IncomeValueInput): Ui => ({ ...d, expenses: d.expenses.map((e, i) => ({ key: i, label: e.label, amount: e.amount })) });
const toInput = (u: Ui): IncomeValueInput => ({ ...u, expenses: u.expenses.map((e) => ({ label: e.label, amount: e.amount ?? Number.NaN })) });

// The worked example as the form writes it back, to tell when an input has changed.
const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(INCOME_VALUE_EXAMPLE)));

const LABELS: FixLabels = {
  pgi: ["Potential gross income", "money"],
  otherIncome: ["Other income", "money"],
  vacancy: ["Vacancy and collection loss", "pct"],
  area: "Rentable area",
  expenses: "Operating expenses",
  "expenses.*.label": "Expense line # name",
  "expenses.*.amount": ["Expense line # amount", "money"],
  reserves: ["Replacement reserves", "money"],
  capRate: ["Cap rate", "pct"],
  capitalize: "NOI to capitalize",
  price: ["Price to test", "money"],
};

export function IncomeValueCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(INCOME_VALUE_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New lines take ids past the worked example's.
  const nextKey = useRef(100);
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = incomeValueInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runIncomeValue(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const set = (k: "area" | "reserves" | "price") => (v: number | null) => setUi((p) => ({ ...p, [k]: v }) as Ui);
  const req = (k: "pgi" | "otherIncome" | "vacancy" | "capRate") => (v: number | null) => setUi((p) => ({ ...p, [k]: v ?? Number.NaN }) as Ui);
  const setLine = (i: number, l: Partial<LineUi>) => setUi((p) => ({ ...p, expenses: p.expenses.map((x, j) => (j === i ? { ...x, ...l } : x)) }));

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(INCOME_VALUE_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Income">
          <NumberField label="Potential gross income" kind="money" prefix="$" unit="/yr" step={5000} value={ui.pgi} onChange={req("pgi")} hint="rent at full occupancy" issue={issues.get("pgi")} />
          <NumberField
            label="Vacancy and collection loss"
            kind="pct"
            unit="%"
            value={ui.vacancy}
            onChange={req("vacancy")}
            hint="share of potential gross income"
            issue={issues.get("vacancy")}
          />
          <NumberField
            label="Other income"
            kind="money"
            prefix="$"
            unit="/yr"
            step={1000}
            value={ui.otherIncome}
            onChange={req("otherIncome")}
            hint="already net of its own loss; 0 for none"
            issue={issues.get("otherIncome")}
          />
          <NumberField label="Rentable area" kind="number" unit="SF" step={1000} optional value={ui.area} onChange={set("area")} hint="optional; gives value per square foot" issue={issues.get("area")} />
        </FieldGroup>

        <FieldGroup
          title="Operating expenses"
          note="Dollars a year. Leave out debt service, depreciation, income tax and capital items."
          action={
            ui.expenses.length < MAX_LINES ? (
              <FormAction onClick={() => setUi((p) => ({ ...p, expenses: [...p.expenses, { key: nextKey.current++, label: `Expense ${p.expenses.length + 1}`, amount: 0 }] }))}>
                Add a line
              </FormAction>
            ) : undefined
          }
        >
          {ui.expenses.length === 0 && <GroupRow>No expense lines: operating expenses are zero.</GroupRow>}
          {ui.expenses.map((e, i) => (
            <div key={e.key} className="calc-set">
              <GroupRow
                action={
                  <FormAction tone="faint" label={`Remove expense line ${i + 1}`} onClick={() => setUi((p) => ({ ...p, expenses: p.expenses.filter((_, j) => j !== i) }))}>
                    Remove
                  </FormAction>
                }
              >
                Line {i + 1}
              </GroupRow>
              <TextField label="Name" value={e.label} onChange={(v) => setLine(i, { label: v })} issue={issues.get(`expenses.${i}.label`)} />
              <NumberField label="Amount" kind="money" prefix="$" unit="/yr" step={1000} value={e.amount} onChange={(v) => setLine(i, { amount: v })} issue={issues.get(`expenses.${i}.amount`)} />
            </div>
          ))}
        </FieldGroup>

        <FieldGroup title="Reserves and value">
          <NumberField
            label="Replacement reserves"
            kind="money"
            prefix="$"
            unit="/yr"
            step={1000}
            optional
            value={ui.reserves}
            onChange={set("reserves")}
            hint="optional; blank for none"
            issue={issues.get("reserves")}
          />
          <NumberField label="Cap rate" kind="pct" unit="%" step={0.25} value={ui.capRate} onChange={req("capRate")} hint="your assumption" issue={issues.get("capRate")} />
          <SelectField
            label="NOI to capitalize"
            value={ui.capitalize}
            options={[
              { value: "afterReserves", label: "After reserves" },
              { value: "beforeReserves", label: "Before reserves" },
            ]}
            onChange={(v) => setUi((p) => ({ ...p, capitalize: v }))}
          />
          <NumberField label="Price to test" kind="money" prefix="$" step={50000} optional value={ui.price} onChange={set("price")} hint="optional; blank for none" issue={issues.get("price")} />
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the value.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = incomeValueFigures(d, r);
  const split = incomeValueSplit(r);
  const hasArea = d.area !== null;

  return (
    <CalcSheet
      {...sheet}
      headline={incomeValueHeadline(r)}
      // the sentence names the NOI and the cap rate, so the lead figure stands without them
      lead={r.value === null ? f.lead : { label: f.lead.label, value: f.lead.value }}
      cells={incomeValueCells(d, r)}
      figures={
        <>
          {r.notes.length > 0 && (
            <Words>
              {r.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </Words>
          )}
          {split && (
            <Drawing title="Where the income goes" note="share of effective gross income">
              <SplitBar segments={split} total={r.egi} totalLabel="effective gross income" title="Effective gross income by use" />
            </Drawing>
          )}
        </>
      }
    >
      <CalcSection id="statement" title="The year, line by line." note={`One stabilized year · deductions shown negative · ${count(d.expenses.length, "expense line")}`}>
        <Schedule
          caption="Operating statement for one stabilized year"
          columns={[{ head: "Line" }, { head: "A year" }, ...(hasArea ? [{ head: "Per SF" }] : []), { head: "Of EGI" }]}
          rows={r.statement.map((s) => [
            s.kind === "total" ? `= ${s.label}` : s.label,
            usd(s.kind === "deduction" ? -s.amount : s.amount, false),
            ...(hasArea ? [s.perSf === null ? "" : usd(s.kind === "deduction" ? -s.perSf : s.perSf)] : []),
            pct(s.shareOfEgi, 1),
          ])}
        />
      </CalcSection>
      {r.sensitivity.length > 0 && (
        <CalcSection id="sensitivity" title="Value as the cap rate moves." note="25 and 50 basis points either side">
          <Schedule
            caption="Value at each cap rate"
            columns={[{ head: "Cap rate" }, { head: "Value" }, ...(hasArea ? [{ head: "Per SF" }] : [])]}
            rows={r.sensitivity.map((s) => [s.capRate === r.capRate ? `${pct(s.capRate)} (yours)` : pct(s.capRate), usd(s.value, false), ...(hasArea ? [s.valuePerSf === null ? "" : usd(s.valuePerSf)] : [])])}
          />
        </CalcSection>
      )}
      <CalcSection id="trace" title="Every formula it ran, in order." note="Unrounded; rounded only for display">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
