"use client";

import { useState } from "react";
import { RETURNS_EXAMPLE, returnsInput, runReturns, type ReturnsInput } from "@/lib/calculators/returns";
import { usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, InputsPanel, NumberField, type FixLabels } from "./fields";
import { CashFlowElevation, Drawing, SensitivityGrid } from "./figures";
import { CalcSheet, useHeld } from "./sheet";
import { returnsHeadline, returnsHeadlines } from "./shape";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

const EXAMPLE_KEY = JSON.stringify(RETURNS_EXAMPLE);

const LABELS: FixLabels = {
  price: ["Price", "money"],
  closingCostPct: ["Closing costs", "pct"],
  noi: ["Year-1 NOI", "money"],
  noiGrowth: ["NOI growth", "pct"],
  holdYears: "Hold",
  exitCap: ["Exit cap rate", "pct"],
  saleCostPct: ["Sale costs", "pct"],
  loan: ["Loan amount", "money"],
  rate: ["Interest rate", "pct"],
  amortYears: "Amortization",
  ioYears: "Interest-only period",
};

export function ReturnsCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [input, setInput] = useState<ReturnsInput>(RETURNS_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  const req = (k: keyof ReturnsInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v ?? Number.NaN }) as ReturnsInput);
  const key = JSON.stringify(input);
  const parsed = returnsInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { r: runReturns(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setInput(RETURNS_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Purchase">
          <NumberField label="Price" kind="money" prefix="$" step={50000} value={input.price} onChange={req("price")} issue={issues.get("price")} />
          <NumberField label="Closing costs" kind="pct" unit="%" value={input.closingCostPct} onChange={req("closingCostPct")} hint="share of the price" issue={issues.get("closingCostPct")} />
        </FieldGroup>
        <FieldGroup title="Operations">
          <NumberField label="Year-1 NOI" kind="money" prefix="$" step={5000} value={input.noi} onChange={req("noi")} issue={issues.get("noi")} />
          <NumberField label="NOI growth" kind="pct" unit="%/yr" value={input.noiGrowth} onChange={req("noiGrowth")} hint="stands in for rent growth" issue={issues.get("noiGrowth")} />
          <NumberField label="Hold" kind="int" unit="yrs" value={input.holdYears} onChange={req("holdYears")} issue={issues.get("holdYears")} wide />
        </FieldGroup>
        <FieldGroup title="Sale">
          <NumberField label="Exit cap rate" kind="pct" unit="%" value={input.exitCap} onChange={req("exitCap")} hint="on the year after the sale" issue={issues.get("exitCap")} />
          <NumberField label="Sale costs" kind="pct" unit="%" value={input.saleCostPct} onChange={req("saleCostPct")} issue={issues.get("saleCostPct")} />
        </FieldGroup>
        <FieldGroup title="Loan">
          <NumberField label="Loan amount" kind="money" prefix="$" step={50000} value={input.loan} onChange={req("loan")} hint="0 for an all-cash deal" issue={issues.get("loan")} />
          <NumberField label="Interest rate" kind="pct" unit="%/yr" step={0.125} value={input.rate} onChange={req("rate")} issue={issues.get("rate")} />
          <NumberField label="Amortization" kind="int" unit="yrs" value={input.amortYears} onChange={req("amortYears")} issue={issues.get("amortYears")} />
          <NumberField label="Interest-only period" kind="int" unit="yrs" value={input.ioYears} onChange={req("ioYears")} issue={issues.get("ioYears")} />
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the returns.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { r } = held;
  const h = returnsHeadlines(r);
  const interestOnly = new Set(r.interestOnlyYears);

  return (
    <CalcSheet
      {...sheet}
      headline={returnsHeadline(r)}
      lead={h.lead}
      cells={h.rest}
      figures={
        <>
          <Drawing title="Equity in, cash back, by year" note={`sale at ${usd(r.exitValue, false)}`}>
            <CashFlowElevation flows={r.leveredFlows} title="Levered cash flows" span={`${count(r.years.length, "year")} held`} />
          </Drawing>
          <Drawing title="Levered IRR, by exit cap and NOI growth" note="outlined: your inputs">
            <SensitivityGrid
              rows={r.sensitivity.exitCaps}
              cols={r.sensitivity.growths}
              values={r.sensitivity.irr}
              base={[2, 2]}
              rowLabel="Exit cap"
              colLabel="Growth"
              caption="Levered IRR by exit cap rate (rows) and NOI growth (columns)"
            />
          </Drawing>
        </>
      }
    >
      <CalcSection
        id="schedule"
        title="The cash flows the IRRs come from."
        note={`${count(r.years.length, "year")} held${interestOnly.size > 0 ? " · a year marked interest only pays down no principal" : ""}`}
      >
        <Schedule
          caption="Cash flows by year"
          columns={[{ head: "Year" }, { head: "NOI" }, { head: "Debt service" }, { head: "Net sale" }, { head: "Loan payoff" }, { head: "Unlevered" }, { head: "Levered" }]}
          rows={[
            [0, "", "", "", "", usd(r.unleveredFlows[0] ?? 0, false), usd(r.leveredFlows[0] ?? 0, false)],
            ...r.years.map((y) => [
              y.year,
              usd(y.noi, false),
              interestOnly.has(y.year) ? `${usd(y.debtService, false)} interest only` : usd(y.debtService, false),
              y.saleProceeds ? usd(y.saleProceeds, false) : "",
              y.loanPayoff ? usd(y.loanPayoff, false) : "",
              usd(y.unlevered, false),
              usd(y.levered, false),
            ]),
          ]}
        />
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="IRR as Excel defines it">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
