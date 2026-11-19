"use client";

import Link from "next/link";
import { useState } from "react";
import { EXCHANGE_1031_EXAMPLE, exchange1031Input, runExchange1031, type Exchange1031Input, type Exchange1031Result } from "@/lib/calculators/exchange-1031";
import { usd } from "@/lib/calculators/trace";
import { issueMap } from "./format";
import { FieldGroup, InputsPanel, NumberField, type FixLabels } from "./fields";
import { Caution, CellsPart, Drawing, SplitBar, Words } from "./figures";
import { exchange1031Cells, exchange1031Figures, exchange1031Headline } from "./exchange-1031-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, TraceView, type SheetSlots } from "./trace-view";

const LABELS: FixLabels = {
  salePrice: ["Sale price", "money"],
  sellingCosts: ["Selling costs", "money"],
  adjustedBasis: ["Adjusted basis", "money"],
  debtPaidOff: ["Debt paid off", "money"],
  depreciationTaken: ["Depreciation taken", "money"],
  replacementPrice: ["Replacement price", "money"],
  newDebt: ["New debt", "money"],
  cashAdded: ["Cash added", "money"],
  exchangeCosts: ["Exchange costs", "money"],
  cashTaken: ["Cash taken out", "money"],
  otherProperty: ["Other property received", "money"],
  capitalGainRate: ["Capital gain rate", "pct"],
  unrecapturedRate: ["Unrecaptured section 1250 rate", "pct"],
  niiRate: ["Net investment income tax", "pct"],
};

// The three common-practice tests for a full deferral, each in a plain sentence.
function checkLines(r: Exchange1031Result, d: Exchange1031Input): Array<{ ok: boolean; text: string }> {
  return [
    {
      ok: r.checks.equalOrGreaterValue,
      text: r.checks.equalOrGreaterValue
        ? `The replacement's ${usd(d.replacementPrice, false)} price is at least the ${usd(r.amountRealized, false)} amount realized.`
        : `The replacement's ${usd(d.replacementPrice, false)} price is below the ${usd(r.amountRealized, false)} amount realized. That alone is not boot: boot comes from the cash, other property and debt above.`,
    },
    {
      ok: r.checks.allEquityReinvested,
      text: r.checks.allEquityReinvested
        ? "No cash or other property is taken out: all the net equity goes into the replacement."
        : `${usd(r.takenOut, false)} in cash and other property is taken out, and it is boot.`,
    },
    {
      ok: r.checks.debtReplaced,
      text: r.checks.debtReplaced
        ? "New debt and cash added cover the debt paid off, so the debt relief is not boot."
        : `${usd(r.netLiabilityRelief, false)} of the debt paid off is covered by neither new debt nor cash added, and it is boot.`,
    },
  ];
}

export function Exchange1031Calculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [input, setInput] = useState<Exchange1031Input>(EXCHANGE_1031_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  const req = (k: keyof Exchange1031Input) => (v: number | null) => setInput((p) => ({ ...p, [k]: v ?? Number.NaN }) as Exchange1031Input);
  const key = JSON.stringify(input);
  const parsed = exchange1031Input.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runExchange1031(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== JSON.stringify(EXCHANGE_1031_EXAMPLE);
  const money = (k: keyof Exchange1031Input, label: string, hint?: string, step = 50000) => (
    <NumberField label={label} kind="money" prefix="$" step={step} value={input[k]} onChange={req(k)} issue={issues.get(k)} hint={hint} />
  );
  const rate = (k: keyof Exchange1031Input, label: string, hint?: string) => (
    <NumberField label={label} kind="pct" unit="%" step={0.1} value={input[k]} onChange={req(k)} issue={issues.get(k)} hint={hint} />
  );

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setInput(EXCHANGE_1031_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Property given up">
          {money("salePrice", "Sale price")}
          {money("sellingCosts", "Selling costs", "commission, title, closing", 5000)}
          {money("adjustedBasis", "Adjusted basis", "cost plus improvements less depreciation")}
          {money("debtPaidOff", "Debt paid off", "at closing, or taken over by the buyer")}
          <NumberField
            label="Depreciation taken"
            kind="money"
            prefix="$"
            step={50000}
            value={input.depreciationTaken}
            onChange={req("depreciationTaken")}
            issue={issues.get("depreciationTaken")}
            hint="allowed or allowable; 0 if none"
            wide
          />
        </FieldGroup>
        <FieldGroup title="Replacement property">
          {money("replacementPrice", "Replacement price")}
          {money("newDebt", "New debt", "a new loan, or one taken over")}
          {money("cashAdded", "Cash added", "your own cash, beyond the proceeds", 10000)}
          {money("exchangeCosts", "Exchange costs", "intermediary, title, closing; not loan fees", 5000)}
        </FieldGroup>
        <FieldGroup title="Taken out of the exchange">
          {money("cashTaken", "Cash taken out", "after every cost is paid", 10000)}
          {money("otherProperty", "Other property received", "its fair market value; 0 if none", 10000)}
        </FieldGroup>
        <FieldGroup title="Tax rates" note="Example rates: the federal maximums the rule cards state. Enter your own; 0 leaves a rate out.">
          {rate("capitalGainRate", "Capital gain rate", "on gain beyond the depreciation")}
          {rate("unrecapturedRate", "Unrecaptured section 1250 rate", "on gain up to the depreciation")}
          {rate("niiRate", "Net investment income tax", "added to both rates")}
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the exchange.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = exchange1031Figures(d, r);

  return (
    <CalcSheet
      {...sheet}
      headline={exchange1031Headline(r)}
      // the sentence gives the gain the deferral is out of, so the lead figure stands without it
      lead={r.isLoss ? f.lead : { label: f.lead.label, value: f.lead.value }}
      cells={exchange1031Cells(d, r)}
      figures={
        <>
          {!r.balanced && (
            <Words>
              <Caution>
                <span className="text-text">Check the inputs:</span> the money in and the money out differ by {usd(r.sourcesUsesGap)}, so they do not describe one closing. The basis shown
                follows the regulation; the price-based cross-check is {usd(r.replacementBasisFromCost, false)}.
              </Caution>
            </Words>
          )}
          {r.realizedGain > 0 && (
            <Drawing title="Where the gain goes">
              <SplitBar
                title="The realized gain"
                totalLabel="realized gain"
                total={r.realizedGain}
                segments={[
                  { key: "now", label: "Recognized now", value: r.recognizedGain, fill: "solid" },
                  { key: "later", label: "Deferred", value: r.deferredGain, fill: "tint" },
                ]}
              />
            </Drawing>
          )}
          <CellsPart
            title="How the debt nets"
            note="liabilities relieved count as cash received"
            cells={[
              { label: "Debt paid off", value: usd(r.liabilitiesRelieved, false) },
              { label: "Covered by new debt", value: usd(r.offsetByNewDebt, false) },
              { label: "Covered by cash added", value: usd(r.offsetByCashAdded, false) },
              { label: "Net debt relief (boot)", value: usd(r.netLiabilityRelief, false) },
            ]}
          />
          <Words title="Checks for a full deferral">
            <ul className="m-0 list-none space-y-2 p-0">
              {checkLines(r, d).map((c, i) => (
                <li key={i} className="flex gap-3">
                  <span className="type-label w-8 flex-none text-text">{c.ok ? "Yes" : "No"}</span>
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-faint">
              The 45-day identification and 180-day exchange periods are dated in the{" "}
              <Link href="/calculators/deadline-calendar" className="link link--muted">
                deadline calendar
              </Link>
              .
            </p>
          </Words>
        </>
      }
    >
      <CalcSection id="trace" title="Every formula it ran, in order." note="26 CFR 1.1031(b)-1 and 1.1031(d)-2">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
