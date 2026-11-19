"use client";

import { useState } from "react";
import { runSaleProceeds, SALE_PROCEEDS_EXAMPLE, saleProceedsInput, type SaleProceedsInput } from "@/lib/calculators/sale-proceeds";
import { usd } from "@/lib/calculators/trace";
import { issueMap } from "./format";
import { FieldGroup, InputsPanel, NumberField, type FixLabels } from "./fields";
import { CellsPart, Drawing, SplitBar, Words, type Headline } from "./figures";
import { saleProceedsCells, saleProceedsFigures, saleProceedsHeadline, saleProceedsPageNotes, saleProceedsRowLabel, saleProceedsSplit } from "./sale-proceeds-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

const EXAMPLE_KEY = JSON.stringify(SALE_PROCEEDS_EXAMPLE);

type MoneyKey = "salePrice" | "sellingCostFixed" | "loanPayoff" | "otherPayoffs" | "originalCost" | "improvements" | "depreciationTaken";
type RateKey = "capitalGainRate" | "unrecapturedRate" | "niiRate";

const LABELS: FixLabels = {
  salePrice: ["Sale price", "money"],
  sellingCostRate: ["Selling cost rate", "pct"],
  sellingCostFixed: ["Fixed selling costs", "money"],
  loanPayoff: ["Loan payoff", "money"],
  otherPayoffs: ["Other payoffs", "money"],
  originalCost: ["Original cost", "money"],
  improvements: ["Capital improvements", "money"],
  depreciationTaken: ["Depreciation taken", "money"],
  capitalGainRate: ["Capital gain rate", "pct"],
  unrecapturedRate: ["Unrecaptured section 1250 rate", "pct"],
  niiRate: ["Net investment income tax", "pct"],
};

export function SaleProceedsCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [input, setInput] = useState<SaleProceedsInput>(SALE_PROCEEDS_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  // A required field left empty is NaN, which validation names; a tax rate left empty is null.
  const req = (k: MoneyKey | "sellingCostRate") => (v: number | null) => setInput((p) => ({ ...p, [k]: v ?? Number.NaN }) as SaleProceedsInput);
  const opt = (k: RateKey) => (v: number | null) => setInput((p) => ({ ...p, [k]: v }) as SaleProceedsInput);
  const key = JSON.stringify(input);
  const parsed = saleProceedsInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runSaleProceeds(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;
  const money = (k: MoneyKey, label: string, hint?: string, step = 50000, wide = false) => (
    <NumberField label={label} kind="money" prefix="$" step={step} value={input[k]} onChange={req(k)} issue={issues.get(k)} hint={hint} wide={wide} />
  );
  const rate = (k: RateKey, label: string, hint: string, wide = false) => (
    <NumberField label={label} kind="pct" unit="%" step={0.1} optional value={input[k]} onChange={opt(k)} issue={issues.get(k)} hint={hint} wide={wide} />
  );

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setInput(SALE_PROCEEDS_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="The sale">
          {money("salePrice", "Sale price", "with any loan the buyer takes over")}
          <NumberField
            label="Selling cost rate"
            kind="pct"
            unit="%"
            step={0.25}
            value={input.sellingCostRate}
            onChange={req("sellingCostRate")}
            issue={issues.get("sellingCostRate")}
            hint="share of the price, such as a commission"
          />
          {money("sellingCostFixed", "Fixed selling costs", "legal, title, survey; 0 if none", 5000, true)}
        </FieldGroup>
        <FieldGroup title="Paid off at closing" note="These come out of the cash. They do not change the gain.">
          {money("loanPayoff", "Loan payoff", "payoff letter total, or a loan taken over")}
          {money("otherPayoffs", "Other payoffs", "a second lien, property tax owed to closing, tenant deposits credited to the buyer", 5000)}
        </FieldGroup>
        <FieldGroup title="Basis">
          {money("originalCost", "Original cost", "with the acquisition costs added to basis")}
          {money("improvements", "Capital improvements", "added since the purchase; 0 if none", 10000)}
          {money("depreciationTaken", "Depreciation taken", "allowed or allowable, claimed or not; 0 if none", 10000, true)}
        </FieldGroup>
        <FieldGroup title="Tax rates" note="Example rates: the top federal rates the rule cards state. Enter your own, or clear all three to stop at cash before tax.">
          {rate("capitalGainRate", "Capital gain rate", "on gain beyond the depreciation")}
          {rate("unrecapturedRate", "Unrecaptured section 1250 rate", "on gain up to the building's straight-line depreciation")}
          {rate("niiRate", "Net investment income tax", "only if it applies to the seller; added to both rates; 0 leaves it out", true)}
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the sale.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = saleProceedsFigures(d, r);
  const split = saleProceedsSplit(r);
  // The result keeps every note; the page leaves out the ones its headline already states.
  const notes = saleProceedsPageNotes(r);
  const hasGain = r.gain > 0;
  const gainCells: Headline[] = [
    { label: "Gain from depreciation taken", value: usd(r.depreciationPart, false), sub: r.taxed ? "priced at the unrecaptured rate" : "the lesser of the depreciation and the gain" },
    { label: "Rest of the gain", value: usd(r.otherGain, false), sub: r.taxed ? "priced at the capital gain rate" : "the gain beyond the depreciation" },
  ];
  if (r.taxOnDepreciationPart !== null && r.taxOnOtherGain !== null) {
    gainCells.push(
      { label: "Tax on the depreciation part", value: usd(r.taxOnDepreciationPart, false), sub: "net investment income rate added" },
      { label: "Tax on the rest of the gain", value: usd(r.taxOnOtherGain, false), sub: "net investment income rate added" },
    );
  }

  return (
    <CalcSheet
      {...sheet}
      headline={saleProceedsHeadline(r)}
      lead={f.lead}
      cells={saleProceedsCells(d, r)}
      figures={
        <>
          {notes.length > 0 && (
            <Words>
              {notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </Words>
          )}
          {split && (
            <Drawing title="Where the price goes" note="share of the price">
              <SplitBar segments={split} total={d.salePrice} totalLabel="sale price" title="The sale price by where it goes" />
            </Drawing>
          )}
          {hasGain && <CellsPart title="How the gain splits" note={r.taxed ? "at the rates entered" : "no tax figured"} cells={gainCells} />}
        </>
      }
    >
      <CalcSection id="ladder" title="The same sale at five prices." note="5 and 10 percent either side · fixed costs, payoffs and basis held · a negative gain is a loss">
        <Schedule
          caption="Selling costs, gain, tax and cash at the price entered and at 5 and 10 percent either side"
          columns={[{ head: "Price" }, { head: "Selling costs" }, { head: "Gain" }, ...(r.taxed ? [{ head: "Tax" }] : []), { head: "Cash before tax" }, ...(r.taxed ? [{ head: "Cash after tax" }] : [])]}
          rows={r.ladder.map((row) => [
            saleProceedsRowLabel(row),
            usd(row.sellingCosts, false),
            usd(row.gain, false),
            ...(row.tax !== null ? [usd(row.tax, false)] : []),
            usd(row.cashBeforeTax, false),
            ...(row.cashAfterTax !== null ? [usd(row.cashAfterTax, false)] : []),
          ])}
        />
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="26 U.S.C. 1001, 1016, 1(h) and 1411; 26 CFR 1.263(a)-1(e)">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
