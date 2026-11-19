"use client";

import { useRef, useState } from "react";
import {
  balanceUsd,
  MAX_COMPONENTS,
  REPLACEMENT_RESERVES_EXAMPLE,
  replacementReservesInput,
  runReplacementReserves,
  type ReplacementReservesInput,
  type ReplacementReservesResult,
} from "@/lib/calculators/replacement-reserves";
import { usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, FormAction, GroupRow, InputsPanel, NumberField, TextField, type FixLabels } from "./fields";
import { CashFlowElevation, Drawing } from "./figures";
import { replacementReservesCells, replacementReservesFigures, replacementReservesHeadline } from "./replacement-reserves-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

// key: a stable id for the row, so removing one row never hands its text to the next.
type RowUi = { key: number; label: string; cost: number | null; lifeYears: number | null; ageYears: number | null };
type Ui = {
  areaSf: number | null;
  units: number | null;
  components: RowUi[];
  inflation: number | null;
  horizonYears: number | null;
  startingBalance: number | null;
  annualContribution: number | null;
};

const fromInput = (d: ReplacementReservesInput): Ui => ({ ...d, components: d.components.map((c, i) => ({ key: i, ...c })) });

const n = (v: number | null) => v ?? Number.NaN;

// Blank required numbers become NaN so validation names them; a blank area or unit count stays null.
const toInput = (u: Ui): ReplacementReservesInput =>
  ({
    areaSf: u.areaSf,
    units: u.units,
    components: u.components.map((c) => ({ label: c.label, cost: n(c.cost), lifeYears: n(c.lifeYears), ageYears: n(c.ageYears) })),
    inflation: n(u.inflation),
    horizonYears: n(u.horizonYears),
    startingBalance: n(u.startingBalance),
    annualContribution: n(u.annualContribution),
  }) as ReplacementReservesInput;

const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(REPLACEMENT_RESERVES_EXAMPLE)));

const LABELS: FixLabels = {
  areaSf: "Area",
  units: "Units",
  components: "Components",
  "components.*.label": "Component # name",
  "components.*.cost": ["Component # cost today", "money"],
  "components.*.lifeYears": "Component # useful life",
  "components.*.ageYears": "Component # age",
  inflation: ["Cost inflation", "pct"],
  horizonYears: "Horizon",
  startingBalance: ["Reserve balance today", "money"],
  annualContribution: ["Yearly contribution", "money"],
};

// The drawing: the reserve balance today and at each year end.
function Balance({ d, r }: { d: ReplacementReservesInput; r: ReplacementReservesResult }) {
  return (
    <Drawing title="Reserve balance" note={`today, then each year end at ${usd(d.annualContribution, false)} a year`}>
      <CashFlowElevation flows={[d.startingBalance, ...r.years.map((y) => y.closing)]} title="Reserve balance today (year 0) and at each year end; below the line is short" span={`${r.years.length} ${r.years.length === 1 ? "year" : "years"}`} />
      <p className="type-body-s m-0 mt-3 text-faint">Filled bars are a balance above zero; outlined bars below the line are a shortfall.</p>
    </Drawing>
  );
}

export function ReplacementReservesCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(REPLACEMENT_RESERVES_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New rows take ids past the worked example's.
  const nextKey = useRef(100);
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = replacementReservesInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runReplacementReserves(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const set = (p: Partial<Ui>) => setUi((u) => ({ ...u, ...p }));
  const setRow = (i: number, p: Partial<RowUi>) => setUi((u) => ({ ...u, components: u.components.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const addRow = () =>
    setUi((u) => ({
      ...u,
      components: [...u.components, { key: nextKey.current++, label: `Component ${u.components.length + 1}`, cost: 50_000, lifeYears: 10, ageYears: 0 }],
    }));

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(REPLACEMENT_RESERVES_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Building" note="Give the area, the unit count or both; each gives its own per-figure.">
          <NumberField label="Area" kind="int" unit="SF" step={1000} optional value={ui.areaSf} onChange={(v) => set({ areaSf: v })} hint="blank if not used" issue={issues.get("areaSf")} />
          <NumberField label="Units" kind="int" unit="units" optional value={ui.units} onChange={(v) => set({ units: v })} hint="blank if not used" issue={issues.get("units")} />
        </FieldGroup>

        <FieldGroup title="Reserve" note="Example values: the inflation rate and the balances are yours to set, not a standard.">
          <NumberField label="Reserve balance today" kind="money" prefix="$" step={5000} value={ui.startingBalance} onChange={(v) => set({ startingBalance: v })} issue={issues.get("startingBalance")} />
          <NumberField label="Yearly contribution" kind="money" prefix="$" unit="/yr" step={1000} value={ui.annualContribution} onChange={(v) => set({ annualContribution: v })} hint="added each year" issue={issues.get("annualContribution")} />
          <NumberField label="Cost inflation" kind="pct" unit="%/yr" value={ui.inflation} onChange={(v) => set({ inflation: v })} hint="growth in replacement cost" issue={issues.get("inflation")} />
          <NumberField label="Horizon" kind="int" unit="years" value={ui.horizonYears} onChange={(v) => set({ horizonYears: v })} hint="1 to 50" issue={issues.get("horizonYears")} />
        </FieldGroup>

        <FieldGroup
          title="Components"
          note="Each component's cost to replace today, its useful life when new and its age now (age = life − remaining life). An age at or past the life is replaced in year 1."
          action={ui.components.length < MAX_COMPONENTS ? <FormAction onClick={addRow}>Add a component</FormAction> : undefined}
        >
          {ui.components.map((x, i) => (
            <div key={x.key} className="calc-set">
              <GroupRow
                action={
                  ui.components.length > 1 ? (
                    <FormAction tone="faint" label={`Remove component ${i + 1}`} onClick={() => setUi((u) => ({ ...u, components: u.components.filter((_, j) => j !== i) }))}>
                      Remove
                    </FormAction>
                  ) : undefined
                }
              >
                Component {i + 1}
              </GroupRow>
              <TextField label="Name" value={x.label} onChange={(v) => setRow(i, { label: v })} issue={issues.get(`components.${i}.label`)} />
              <NumberField label="Cost today" kind="money" prefix="$" step={5000} value={x.cost} onChange={(v) => setRow(i, { cost: v })} issue={issues.get(`components.${i}.cost`)} />
              <NumberField label="Useful life" kind="int" unit="years" value={x.lifeYears} onChange={(v) => setRow(i, { lifeYears: v })} issue={issues.get(`components.${i}.lifeYears`)} />
              <NumberField label="Age now" kind="int" unit="years" value={x.ageYears} onChange={(v) => setRow(i, { ageYears: v })} issue={issues.get(`components.${i}.ageYears`)} />
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
    problem: parsed.success ? null : { say: "Fix the inputs to test the reserve.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = replacementReservesFigures(d, r);
  const byYear = new Map<number, string[]>();
  for (const x of r.replacements) byYear.set(x.year, [...(byYear.get(x.year) ?? []), x.label]);

  return (
    <CalcSheet {...sheet} headline={replacementReservesHeadline(r)} lead={f.lead} cells={replacementReservesCells(d, r)} figures={<Balance d={d} r={r} />}>
      <CalcSection id="schedule" title="The reserve, year by year." note={`${count(r.years.length, "year")} · contribution and spending fall in the year · no interest on the balance`}>
        <Schedule
          caption="Reserve balance by year: opening, contribution, replacements, spending and year-end balance"
          columns={[{ head: "Year" }, { head: "Opening" }, { head: "Contribution" }, { head: "Replaced" }, { head: "Spending" }, { head: "Year end" }, { head: "Short?" }]}
          rows={r.years.map((y) => [
            String(y.year),
            balanceUsd(y.opening, false),
            usd(y.contribution, false),
            byYear.get(y.year)?.join(", ") ?? "none",
            usd(y.spend, false),
            balanceUsd(y.closing, false),
            y.short ? "short" : "no",
          ])}
        />
      </CalcSection>
      <CalcSection id="components" title="Each component's reserve and replacement years." note="Straight-line reserve is cost today ÷ useful life">
        <Schedule
          caption="Each component's cost, life, age, straight-line reserve and the years it is replaced inside the horizon"
          columns={[{ head: "Component" }, { head: "Cost today" }, { head: "Life, yrs" }, { head: "Age, yrs" }, { head: "Reserve /yr" }, { head: "Replaced in" }]}
          rows={r.components.map((c) => [
            c.label,
            usd(c.cost, false),
            String(c.lifeYears),
            String(c.ageYears),
            usd(c.straightLine, false),
            c.replacementYears.length ? c.replacementYears.map((t) => `yr ${t}`).join(", ") : `after yr ${d.horizonYears}`,
          ])}
        />
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Year t costs today's cost × (1 + inflation)^(t − 1)">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
