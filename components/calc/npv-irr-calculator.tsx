"use client";

import { useState } from "react";
import { NPV_IRR_EXAMPLE, npvIrrInput, runNpvIrr, type NpvIrrInput } from "@/lib/calculators/npv-irr";
import { pct, usd } from "@/lib/calculators/trace";
import { count, issueMap, parseCash } from "./format";
import { CashField, FieldGroup, InputsPanel, NumberField, type FixLabels } from "./fields";
import { CashFlowElevation, Drawing, SplitBar, Words } from "./figures";
import { npvIrrCells, npvIrrFigures, npvIrrHeadline, npvIrrSplit } from "./npv-irr-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

// The yearly flows are typed as one line of figures; everything else is a number field.
type Ui = Omit<NpvIrrInput, "operatingFlows" | "equity" | "requiredReturn"> & {
  equity: number | null;
  requiredReturn: number | null;
  flows: string;
};

const fromInput = (d: NpvIrrInput): Ui => ({
  equity: d.equity,
  requiredReturn: d.requiredReturn,
  flows: d.operatingFlows.map((x) => x.toLocaleString("en-US")).join(", "),
  saleProceeds: d.saleProceeds,
  financeRate: d.financeRate,
  reinvestmentRate: d.reinvestmentRate,
});

const toInput = (u: Ui): NpvIrrInput => ({
  equity: u.equity ?? Number.NaN,
  operatingFlows: parseCash(u.flows),
  saleProceeds: u.saleProceeds,
  requiredReturn: u.requiredReturn ?? Number.NaN,
  financeRate: u.financeRate,
  reinvestmentRate: u.reinvestmentRate,
});

// The worked example as the form writes it back, to tell when an input has changed.
const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(NPV_IRR_EXAMPLE)));

const LABELS: FixLabels = {
  equity: ["Equity at year 0", "money"],
  operatingFlows: "Operating cash flow, by year",
  "operatingFlows.*": ["Operating cash flow, year #", "money"],
  saleProceeds: ["Net sale proceeds", "money"],
  requiredReturn: ["Required return", "pct"],
  financeRate: ["Finance rate", "pct"],
  reinvestmentRate: ["Reinvestment rate", "pct"],
};

export function NpvIrrCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(NPV_IRR_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  const set = (k: Exclude<keyof Ui, "flows">) => (v: number | null) => setUi((p) => ({ ...p, [k]: v }));
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = npvIrrInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runNpvIrr(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const flowsIssue = [...issues.entries()].find(([k]) => k.startsWith("operatingFlows"))?.[1];
  const changed = key !== EXAMPLE_KEY;

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(NPV_IRR_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Equity">
          <NumberField label="Equity at year 0" kind="money" prefix="$" step={50000} value={ui.equity} onChange={set("equity")} hint="paid in at closing" issue={issues.get("equity")} />
          <NumberField
            label="Required return"
            kind="pct"
            unit="%/yr"
            step={0.5}
            value={ui.requiredReturn}
            onChange={set("requiredReturn")}
            hint="your hurdle; NPV is discounted at it"
            issue={issues.get("requiredReturn")}
          />
        </FieldGroup>
        <FieldGroup title="Cash back">
          <CashField
            label="Operating cash flow, by year"
            value={ui.flows}
            onChange={(v) => setUi((p) => ({ ...p, flows: v }))}
            hint="year 1 first, separated by commas; after debt service, before the sale; a negative year is a capital call"
            issue={flowsIssue}
          />
          <NumberField
            label="Net sale proceeds, final year"
            kind="money"
            prefix="$"
            step={50000}
            optional
            value={ui.saleProceeds}
            onChange={set("saleProceeds")}
            hint="after selling costs and the loan payoff; empty for no sale"
            issue={issues.get("saleProceeds")}
            wide
          />
        </FieldGroup>
        <FieldGroup title="Modified IRR" note="Optional: enter both rates, or leave both empty to skip it.">
          <NumberField
            label="Finance rate"
            kind="pct"
            unit="%/yr"
            optional
            value={ui.financeRate}
            onChange={set("financeRate")}
            hint="discounts negative flows to year 0"
            issue={issues.get("financeRate")}
          />
          <NumberField
            label="Reinvestment rate"
            kind="pct"
            unit="%/yr"
            optional
            value={ui.reinvestmentRate}
            onChange={set("reinvestmentRate")}
            hint="carries positive flows to the final year"
            issue={issues.get("reinvestmentRate")}
          />
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the NPV and IRR.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = npvIrrFigures(d, r);
  const split = npvIrrSplit(r);
  const n = r.holdYears;

  return (
    <CalcSheet
      {...sheet}
      headline={npvIrrHeadline(r)}
      lead={f.lead}
      cells={npvIrrCells(d, r)}
      figures={
        <>
          {r.notes.length > 0 && (
            <Words>
              {r.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </Words>
          )}
          <Drawing title="Where the equity's value comes from" note={r.irr === null ? "no IRR" : `discounted at the ${pct(r.irr)} IRR`}>
            {split ? (
              <SplitBar segments={split} total={r.equity} totalLabel="of equity" title="The equity at the IRR, split between operations and the sale" />
            ) : (
              <p className="type-body-s m-0 text-muted">
                {r.atIrr === null
                  ? "No IRR was found, so there is nothing to split."
                  : `Operations are worth ${usd(r.atIrr.operations, false)} at the IRR and the sale ${usd(r.atIrr.sale, false)}: one part is negative, so the split is not drawn.`}
              </p>
            )}
          </Drawing>
          <Drawing title="Equity in, cash back, by year">
            <CashFlowElevation flows={r.flows} title="Cash flows to equity" span={`${count(n, "year")} held`} />
          </Drawing>
        </>
      }
    >
      <CalcSection id="schedule" title="The cash flows the NPV and IRR come from." note="Every flow at the end of its year">
        <Schedule
          caption="Cash flows to equity by year, with their present values"
          columns={[{ head: "Year" }, { head: "Operating" }, { head: "Net sale" }, { head: "Cash flow" }, { head: `PV at ${pct(r.requiredReturn)}` }, { head: "PV at the IRR" }, { head: "Cumulative" }]}
          rows={[
            [0, "", "", usd(r.flows[0] ?? 0, false), usd(r.flows[0] ?? 0, false), r.irr === null ? "none" : usd(r.flows[0] ?? 0, false), usd(r.flows[0] ?? 0, false)],
            ...r.years.map((y) => [
              y.year,
              usd(y.operating, false),
              y.sale ? usd(y.sale, false) : "",
              usd(y.cashFlow, false),
              usd(y.pvAtRequired, false),
              y.pvAtIrr === null ? "none" : usd(y.pvAtIrr, false),
              usd(y.cumulative, false),
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
