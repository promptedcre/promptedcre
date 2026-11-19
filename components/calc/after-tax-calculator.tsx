"use client";

import { useState } from "react";
import { AFTER_TAX_EXAMPLE, afterTaxInput, runAfterTax, type AfterTaxInput, type AfterTaxResult } from "@/lib/calculators/after-tax";
import { usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, InputsPanel, NumberField, type FixLabels } from "./fields";
import { CellsPart, Drawing, SplitBar, type SplitSegment } from "./figures";
import { afterTaxCells, afterTaxFigures, afterTaxHeadline } from "./after-tax-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

const LABELS: FixLabels = {
  price: ["Price", "money"],
  closingCosts: ["Closing costs", "money"],
  landShare: ["Land share", "pct"],
  recoveryYears: "Recovery period",
  noi: ["Year-1 NOI", "money"],
  noiGrowth: ["NOI growth", "pct"],
  holdYears: "Hold",
  exitCap: ["Exit cap rate", "pct"],
  saleCostPct: ["Sale costs", "pct"],
  loan: ["Loan amount", "money"],
  rate: ["Interest rate", "pct"],
  amortYears: "Amortization",
  ioYears: "Interest-only period",
  ordinaryRate: ["Ordinary income rate", "pct"],
  niiRate: ["Net investment income rate", "pct"],
  unrecapturedRate: ["Unrecaptured section 1250 rate", "pct"],
  capitalGainRate: ["Capital gain rate", "pct"],
};

// Where the cash before tax goes: kept after tax, or paid as tax. Drawn only when every part is positive.
function cashSplit(r: AfterTaxResult): SplitSegment[] | null {
  if (!(r.preTaxCash > 0) || !(r.afterTaxCash > 0)) return null;
  return [
    { key: "kept", label: "Kept after tax", value: r.afterTaxCash, fill: "solid" },
    { key: "yearly", label: "Tax on yearly income", value: r.operatingTax, fill: "tint" },
    { key: "sale", label: "Tax on sale", value: r.sale.tax, fill: "outline" },
  ];
}

function YearTable({ r }: { r: AfterTaxResult }) {
  const s = r.sale;
  const losses = r.years.some((y) => y.lossCarried > 0);
  return (
    <Schedule
      caption="Taxable income, tax and cash flow by year, then the sale"
      columns={[
        { head: "Year" },
        { head: "NOI" },
        { head: "Interest" },
        { head: "Depreciation" },
        { head: "Taxable income" },
        ...(losses ? [{ head: "Loss carried" }] : []),
        { head: "Tax" },
        { head: "Before tax" },
        { head: "After tax" },
      ]}
      rows={[
        [0, "", "", "", "", ...(losses ? [""] : []), "", usd(-r.equity, false), usd(-r.equity, false)],
        ...r.years.map((y) => [
          y.year,
          usd(y.noi, false),
          usd(y.interest, false),
          usd(y.depreciation, false),
          usd(y.taxableIncome, false),
          ...(losses ? [usd(y.lossCarried, false)] : []),
          usd(y.tax, false),
          usd(y.beforeTax, false),
          usd(y.afterTax, false),
        ]),
        ["Sale", "", "", "", usd(s.gain, false), ...(losses ? [usd(s.lossUnused, false)] : []), usd(s.tax, false), usd(s.netBeforeTax, false), usd(s.netAfterTax, false)],
      ]}
    />
  );
}

export function AfterTaxCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [input, setInput] = useState<AfterTaxInput>(AFTER_TAX_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  const req = (k: keyof AfterTaxInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v ?? Number.NaN }) as AfterTaxInput);
  const key = JSON.stringify(input);
  const parsed = afterTaxInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runAfterTax(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== JSON.stringify(AFTER_TAX_EXAMPLE);

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setInput(AFTER_TAX_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Purchase">
          <NumberField label="Price" kind="money" prefix="$" step={50000} value={input.price} onChange={req("price")} issue={issues.get("price")} />
          <NumberField label="Closing costs" kind="money" prefix="$" step={5000} value={input.closingCosts} onChange={req("closingCosts")} hint="added to the basis" issue={issues.get("closingCosts")} />
          <NumberField label="Land share" kind="pct" unit="%" value={input.landShare} onChange={req("landShare")} hint="of the cost basis; not depreciated" issue={issues.get("landShare")} />
          <NumberField
            label="Recovery period"
            kind="number"
            unit="yrs"
            step={0.5}
            value={input.recoveryYears}
            onChange={req("recoveryYears")}
            hint="federal: 39 nonresidential, 27.5 residential"
            issue={issues.get("recoveryYears")}
          />
        </FieldGroup>
        <FieldGroup title="Operations">
          <NumberField label="Year-1 NOI" kind="money" prefix="$" step={5000} value={input.noi} onChange={req("noi")} issue={issues.get("noi")} />
          <NumberField label="NOI growth" kind="pct" unit="%/yr" value={input.noiGrowth} onChange={req("noiGrowth")} issue={issues.get("noiGrowth")} />
          <NumberField label="Hold" kind="int" unit="yrs" value={input.holdYears} onChange={req("holdYears")} hint="sold at the end of the last year" issue={issues.get("holdYears")} wide />
        </FieldGroup>
        <FieldGroup title="Sale">
          <NumberField label="Exit cap rate" kind="pct" unit="%" value={input.exitCap} onChange={req("exitCap")} hint="on the year after the sale" issue={issues.get("exitCap")} />
          <NumberField label="Sale costs" kind="pct" unit="%" value={input.saleCostPct} onChange={req("saleCostPct")} hint="share of the sale price" issue={issues.get("saleCostPct")} />
        </FieldGroup>
        <FieldGroup title="Loan">
          <NumberField label="Loan amount" kind="money" prefix="$" step={50000} value={input.loan} onChange={req("loan")} hint="0 for an all-cash deal" issue={issues.get("loan")} />
          <NumberField label="Interest rate" kind="pct" unit="%/yr" step={0.125} value={input.rate} onChange={req("rate")} issue={issues.get("rate")} />
          <NumberField label="Amortization" kind="int" unit="yrs" value={input.amortYears} onChange={req("amortYears")} hint="0 for interest only throughout" issue={issues.get("amortYears")} />
          <NumberField label="Interest-only period" kind="int" unit="yrs" value={input.ioYears} onChange={req("ioYears")} issue={issues.get("ioYears")} />
        </FieldGroup>
        <FieldGroup title="Tax rates" note="Every rate is yours to enter. The worked example uses top federal rates as examples; 0 turns a rate off.">
          <NumberField label="Ordinary income rate" kind="pct" unit="%" value={input.ordinaryRate} onChange={req("ordinaryRate")} hint="on yearly taxable income" issue={issues.get("ordinaryRate")} />
          <NumberField label="Net investment income rate" kind="pct" unit="%" value={input.niiRate} onChange={req("niiRate")} hint="added to every other rate" issue={issues.get("niiRate")} />
          <NumberField
            label="Unrecaptured section 1250 rate"
            kind="pct"
            unit="%"
            value={input.unrecapturedRate}
            onChange={req("unrecapturedRate")}
            hint="on the gain up to depreciation taken"
            issue={issues.get("unrecapturedRate")}
          />
          <NumberField label="Capital gain rate" kind="pct" unit="%" value={input.capitalGainRate} onChange={req("capitalGainRate")} hint="on the rest of the gain" issue={issues.get("capitalGainRate")} />
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the after-tax return.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = afterTaxFigures(d, r);
  const split = cashSplit(r);
  const s = r.sale;

  return (
    <CalcSheet
      {...sheet}
      headline={afterTaxHeadline(r)}
      lead={f.lead}
      cells={afterTaxCells(d, r)}
      figures={
        <>
          {split && (
            <Drawing title="The cash before tax, and where it goes" note={`${usd(r.totalTax, false)} of tax`}>
              <SplitBar segments={split} total={r.preTaxCash} totalLabel="returned before tax" title="Cash returned before tax, split into what is kept and the tax paid" />
            </Drawing>
          )}
          <CellsPart
            title="The sale"
            note={`year ${d.holdYears}`}
            cells={[
              { label: "Sale price", value: usd(s.price, false), sub: `${usd(s.costs, false)} of sale costs` },
              { label: "Adjusted basis", value: usd(s.adjustedBasis, false), sub: `after ${usd(s.depreciationTaken, false)} of depreciation` },
              { label: "Gain on sale", value: usd(s.gain, false), sub: s.gain < 0 ? "a loss: not credited here" : undefined },
              { label: "Unrecaptured section 1250 gain", value: usd(s.unrecaptured, false), sub: `taxed ${usd(s.taxOnUnrecaptured, false)}` },
              { label: "Rest of the gain", value: usd(s.rest, false), sub: `taxed ${usd(s.taxOnRest, false)}` },
              { label: "Net sale after tax", value: usd(s.netAfterTax, false), sub: `after a ${usd(s.loanPayoff, false)} payoff` },
            ]}
          />
        </>
      }
    >
      <CalcSection id="schedule" title="Taxable income, tax and the cash flows the IRRs come from." note={count(r.years.length, "year")}>
        <YearTable r={r} />
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="IRR as Excel defines it">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
