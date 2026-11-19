"use client";

import { useRef, useState } from "react";
import { EXPENSE_RECOVERY_EXAMPLE, expenseRecoveryInput, MAX_YEARS, runExpenseRecovery, type ExpenseRecoveryInput, type LeaseType } from "@/lib/calculators/expense-recovery";
import { usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { CheckField, FieldGroup, FormAction, InputsPanel, NumberField, SelectField, type FixLabels } from "./fields";
import { Drawing, SplitBar, Words } from "./figures";
import { expenseRecoveryCells, expenseRecoveryFigures, expenseRecoveryHeadline, expenseRecoverySplit } from "./expense-recovery-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

// key: a stable id for the row, so removing a year never hands its value to the next.
type YearUi = { key: number; amount: number | null };
type PctUi = { sales: number | null; rate: number | null; breakpoint: number | null; baseRent: number | null };
type Ui = Omit<ExpenseRecoveryInput, "expenses" | "percentageRent"> & { expenses: YearUi[]; pctOn: boolean; pct: PctUi };

const BLANK_PCT: PctUi = { sales: null, rate: null, breakpoint: null, baseRent: null };

const fromInput = (d: ExpenseRecoveryInput): Ui => ({
  buildingArea: d.buildingArea,
  tenantArea: d.tenantArea,
  leaseType: d.leaseType,
  baseYearExpenses: d.baseYearExpenses,
  expenseStop: d.expenseStop,
  cap: d.cap,
  expenses: d.expenses.map((amount, i) => ({ key: i, amount })),
  pctOn: d.percentageRent !== null,
  pct: d.percentageRent ? { ...d.percentageRent } : BLANK_PCT,
});

const toInput = (u: Ui): ExpenseRecoveryInput => ({
  buildingArea: u.buildingArea,
  tenantArea: u.tenantArea,
  expenses: u.expenses.map((e) => e.amount ?? Number.NaN),
  leaseType: u.leaseType,
  baseYearExpenses: u.baseYearExpenses,
  expenseStop: u.expenseStop,
  cap: u.cap,
  percentageRent: u.pctOn
    ? { sales: u.pct.sales ?? Number.NaN, rate: u.pct.rate ?? Number.NaN, breakpoint: u.pct.breakpoint, baseRent: u.pct.baseRent }
    : null,
});

// The worked example as the form writes it back, to tell when an input has changed.
const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(EXPENSE_RECOVERY_EXAMPLE)));

const LABELS: FixLabels = {
  buildingArea: "Building area",
  tenantArea: "Tenant area",
  expenses: "Expenses by year",
  "expenses.*": ["Year # expenses", "money"],
  leaseType: "Lease type",
  baseYearExpenses: ["Base-year expenses", "money"],
  expenseStop: ["Expense stop", "money"],
  cap: ["Cap on the yearly increase", "pct"],
  percentageRent: "Percentage rent",
  "percentageRent.sales": ["Sales for the year", "money"],
  "percentageRent.rate": ["Percentage", "pct"],
  "percentageRent.breakpoint": ["Stated breakpoint", "money"],
  "percentageRent.baseRent": ["Base rent", "money"],
};

const LEASE_OPTIONS: Array<{ value: LeaseType; label: string }> = [
  { value: "net", label: "Net: share of all expenses" },
  { value: "baseYear", label: "Base year: share of the increase" },
  { value: "expenseStop", label: "Expense stop: share above a stop" },
  { value: "gross", label: "Gross: the landlord pays" },
];

export function ExpenseRecoveryCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(EXPENSE_RECOVERY_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New years take ids past the worked example's.
  const nextKey = useRef(100);
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = expenseRecoveryInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runExpenseRecovery(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const req = (k: "buildingArea" | "tenantArea") => (v: number | null) => setUi((p) => ({ ...p, [k]: v ?? Number.NaN }) as Ui);
  const opt = (k: "baseYearExpenses" | "expenseStop" | "cap") => (v: number | null) => setUi((p) => ({ ...p, [k]: v }) as Ui);
  const setPct = (k: keyof PctUi) => (v: number | null) => setUi((p) => ({ ...p, pct: { ...p.pct, [k]: v } }));
  const setYear = (i: number, amount: number | null) => setUi((p) => ({ ...p, expenses: p.expenses.map((x, j) => (j === i ? { ...x, amount } : x)) }));

  const lastAmount = ui.expenses[ui.expenses.length - 1]?.amount ?? 0;
  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(EXPENSE_RECOVERY_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Building and tenant" note="Rentable area, as the lease measures it. The share is the tenant's area over the building's.">
          <NumberField label="Building area" kind="number" unit="SF" step={1000} value={ui.buildingArea} onChange={req("buildingArea")} issue={issues.get("buildingArea")} />
          <NumberField label="Tenant area" kind="number" unit="SF" step={1000} value={ui.tenantArea} onChange={req("tenantArea")} issue={issues.get("tenantArea")} />
        </FieldGroup>

        <FieldGroup title="Lease terms" note="Read these off the lease; nothing here is a market norm.">
          <SelectField label="Lease type" value={ui.leaseType} options={LEASE_OPTIONS} onChange={(v) => setUi((p) => ({ ...p, leaseType: v }))} wide />
          {ui.leaseType === "baseYear" && (
            <NumberField
              label="Base-year expenses"
              kind="money"
              prefix="$"
              unit="/yr"
              step={5000}
              optional
              value={ui.baseYearExpenses}
              onChange={opt("baseYearExpenses")}
              hint="blank uses year 1's expenses"
              issue={issues.get("baseYearExpenses")}
            />
          )}
          {ui.leaseType === "expenseStop" && (
            <NumberField
              label="Expense stop"
              kind="money"
              prefix="$"
              unit="/SF/yr"
              step={0.25}
              optional
              value={ui.expenseStop}
              onChange={opt("expenseStop")}
              hint="per square foot of building area"
              issue={issues.get("expenseStop")}
            />
          )}
          <NumberField
            label="Cap on the yearly increase"
            kind="pct"
            unit="%/yr"
            optional
            value={ui.cap}
            onChange={opt("cap")}
            hint="over the year before, as capped; not cumulative; blank for none"
            issue={issues.get("cap")}
            wide={ui.leaseType === "net" || ui.leaseType === "gross"}
          />
        </FieldGroup>

        <FieldGroup
          title="Recoverable expenses by year"
          note="The building's total, dollars a year, year 1 first. No gross-up for vacancy is applied."
          action={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {ui.expenses.length < MAX_YEARS && (
                <FormAction onClick={() => setUi((p) => ({ ...p, expenses: [...p.expenses, { key: nextKey.current++, amount: lastAmount }] }))}>Add a year</FormAction>
              )}
              {ui.expenses.length > 1 && (
                <FormAction tone="faint" onClick={() => setUi((p) => ({ ...p, expenses: p.expenses.slice(0, -1) }))}>
                  Remove the last year
                </FormAction>
              )}
            </span>
          }
        >
          {ui.expenses.map((e, i) => (
            <NumberField
              key={e.key}
              label={`Year ${i + 1}`}
              kind="money"
              prefix="$"
              unit="/yr"
              step={5000}
              value={e.amount}
              onChange={(v) => setYear(i, v)}
              issue={issues.get(`expenses.${i}`)}
              wide={i === ui.expenses.length - 1 && ui.expenses.length % 2 === 1}
            />
          ))}
        </FieldGroup>

        <FieldGroup title="Percentage rent">
          <CheckField label="The lease has a percentage rent clause" checked={ui.pctOn} onChange={(v) => setUi((p) => ({ ...p, pctOn: v }))} />
          {ui.pctOn && (
            <>
              <NumberField label="Sales for the year" kind="money" prefix="$" unit="/yr" step={50000} value={ui.pct.sales} onChange={setPct("sales")} issue={issues.get("percentageRent.sales")} />
              <NumberField label="Percentage" kind="pct" unit="%" value={ui.pct.rate} onChange={setPct("rate")} hint="of sales over the breakpoint" issue={issues.get("percentageRent.rate")} />
              <NumberField
                label="Stated breakpoint"
                kind="money"
                prefix="$"
                unit="/yr"
                step={50000}
                optional
                value={ui.pct.breakpoint}
                onChange={setPct("breakpoint")}
                hint="blank for the natural breakpoint"
                issue={issues.get("percentageRent.breakpoint")}
              />
              <NumberField
                label="Base rent"
                kind="money"
                prefix="$"
                unit="/yr"
                step={5000}
                optional
                value={ui.pct.baseRent}
                onChange={setPct("baseRent")}
                hint="for the natural breakpoint"
                issue={issues.get("percentageRent.baseRent")}
              />
            </>
          )}
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the reimbursement.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = expenseRecoveryFigures(d, r);
  const split = expenseRecoverySplit(r);
  const capCols = r.capped;

  return (
    <CalcSheet
      {...sheet}
      headline={expenseRecoveryHeadline(r)}
      lead={f.lead}
      cells={expenseRecoveryCells(d, r)}
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
            <Drawing title="Who pays the tenant's share" note="all years">
              <SplitBar segments={split} total={r.totals.tenantShare} totalLabel="tenant's share of expenses" title="The tenant's share of expenses by who pays it" />
            </Drawing>
          )}
        </>
      }
    >
      <CalcSection id="schedule" title="Year by year." note={`${count(r.years.length, "year")} · dollars a year`}>
        <Schedule
          caption="Expenses, reimbursement and what the landlord bears by year"
          columns={[{ head: "Year" }, { head: "Expenses" }, ...(capCols ? [{ head: "Passed through" }] : []), { head: "Tenant's share" }, { head: "Reimbursed" }, { head: "Landlord bears" }, ...(capCols ? [{ head: "Cap effect" }] : [])]}
          total
          rows={[
            ...r.years.map((y) => [
              y.year,
              usd(y.expenses, false),
              ...(capCols ? [usd(y.passedThrough, false)] : []),
              usd(y.tenantShare, false),
              usd(y.reimbursement, false),
              usd(y.landlordBears, false),
              ...(capCols ? [usd(y.capEffect, false)] : []),
            ]),
            [
              "Total",
              usd(r.totals.expenses, false),
              ...(capCols ? [""] : []),
              usd(r.totals.tenantShare, false),
              usd(r.totals.reimbursement, false),
              usd(r.totals.landlordBears, false),
              ...(capCols ? [usd(r.totals.capEffect, false)] : []),
            ],
          ]}
        />
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Unrounded; rounded only for display">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
