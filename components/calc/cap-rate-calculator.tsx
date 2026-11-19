"use client";

import { useRef, useState } from "react";
import { CAP_RATE_EXAMPLE, capRateInput, runCapRate, type CapRateInput } from "@/lib/calculators/cap-rate";
import { pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, FormAction, FormNote, GroupRow, InputsPanel, NumberField, TextField, type FixLabels } from "./fields";
import { Words } from "./figures";
import { capRateFigures, capRateHeadline } from "./cap-rate-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

// key: a stable id for the row, so removing one sale never hands its text to the next.
type CompUi = { key: number; label: string; price: number | null; noi: number | null };
type Ui = Omit<CapRateInput, "comps"> & { comps: CompUi[] };

const MAX_COMPS = 20;

const fromInput = (d: CapRateInput): Ui => ({ ...d, comps: d.comps.map((c, i) => ({ key: i, ...c })) });

const toInput = (u: Ui): CapRateInput => ({
  comps: u.comps.map((c) => ({ label: c.label, price: c.price ?? Number.NaN, noi: c.noi ?? Number.NaN })),
  ltv: u.ltv,
  rate: u.rate,
  amortYears: u.amortYears,
  equityDividendRate: u.equityDividendRate,
  minDscr: u.minDscr,
});

// The worked example as the form writes it back, to tell when an input has changed.
const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(CAP_RATE_EXAMPLE)));

const LABELS: FixLabels = {
  comps: "Methods",
  "comps.*.label": "Sale # name",
  "comps.*.price": ["Sale # price", "money"],
  "comps.*.noi": ["Sale # NOI", "money"],
  ltv: ["Loan-to-value", "pct"],
  rate: ["Interest rate", "pct"],
  amortYears: "Amortization",
  equityDividendRate: ["Equity dividend rate", "pct"],
  minDscr: ["Lender's minimum coverage", "multiple"],
};

export function CapRateCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(CAP_RATE_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New rows take ids past the worked example's.
  const nextKey = useRef(100);
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = capRateInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runCapRate(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const set = (k: Exclude<keyof Ui, "comps">) => (v: number | null) => setUi((p) => ({ ...p, [k]: v }) as Ui);
  const setComp = (i: number, c: Partial<CompUi>) => setUi((p) => ({ ...p, comps: p.comps.map((x, j) => (j === i ? { ...x, ...c } : x)) }));

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(CAP_RATE_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup
          title="Comparable sales"
          note="Each sale's first-year NOI on the same expense basis as your property. Remove every sale to skip this method."
          action={
            ui.comps.length < MAX_COMPS ? (
              <FormAction
                onClick={() =>
                  setUi((p) => ({ ...p, comps: [...p.comps, { key: nextKey.current++, label: `Sale ${p.comps.length + 1}`, price: null, noi: null }] }))
                }
              >
                Add a sale
              </FormAction>
            ) : undefined
          }
        >
          {ui.comps.map((c, i) => (
            <div key={c.key} className="calc-set">
              <GroupRow
                action={
                  <FormAction tone="faint" label={`Remove sale ${i + 1}`} onClick={() => setUi((p) => ({ ...p, comps: p.comps.filter((_, j) => j !== i) }))}>
                    Remove
                  </FormAction>
                }
              >
                Sale {i + 1}
              </GroupRow>
              <TextField label="Name" value={c.label} onChange={(v) => setComp(i, { label: v })} issue={issues.get(`comps.${i}.label`)} wide />
              <NumberField label="Price" kind="money" prefix="$" step={50000} value={c.price} onChange={(v) => setComp(i, { price: v })} issue={issues.get(`comps.${i}.price`)} />
              <NumberField label="NOI" kind="money" prefix="$" unit="/yr" step={5000} value={c.noi} onChange={(v) => setComp(i, { noi: v })} issue={issues.get(`comps.${i}.noi`)} />
            </div>
          ))}
          {ui.comps.length === 0 && <FormNote>No sales: extraction is skipped.</FormNote>}
        </FieldGroup>

        <FieldGroup title="Loan" note="Leave all three blank to skip the band of investment and the lender's formula.">
          <NumberField label="Loan-to-value" kind="pct" unit="%" step={1} optional value={ui.ltv} onChange={set("ltv")} issue={issues.get("ltv")} />
          <NumberField label="Interest rate" kind="pct" unit="%/yr" step={0.125} optional value={ui.rate} onChange={set("rate")} issue={issues.get("rate")} />
          <NumberField
            label="Amortization"
            kind="int"
            unit="yrs"
            optional
            value={ui.amortYears}
            onChange={set("amortYears")}
            hint="payments monthly; 0 for interest only"
            issue={issues.get("amortYears")}
            wide
          />
        </FieldGroup>

        <FieldGroup title="Equity and lender" note="Leave a field blank to skip its method. These are your own figures, not market levels.">
          <NumberField
            label="Equity dividend rate"
            kind="pct"
            unit="%"
            step={0.25}
            optional
            value={ui.equityDividendRate}
            onChange={set("equityDividendRate")}
            hint="year-one cash after debt service ÷ equity"
            issue={issues.get("equityDividendRate")}
          />
          <NumberField
            label="Lender's minimum coverage"
            kind="multiple"
            unit="x"
            optional
            value={ui.minDscr}
            onChange={set("minDscr")}
            hint="DSCR"
            issue={issues.get("minDscr")}
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
    problem: parsed.success ? null : { say: "Fix the inputs to build the cap rate.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = capRateFigures(d, r);
  const e = r.extraction;

  return (
    <CalcSheet
      {...sheet}
      headline={capRateHeadline(r)}
      lead={f.lead}
      cells={f.rest}
      figures={
        r.notes.length > 0 ? (
          <Words>
            {r.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </Words>
        ) : undefined
      }
    >
      {e && (
        <CalcSection id="schedule" title="The sales, one rate each." note={`${count(e.count, "sale")} · the last row weights by price`}>
          <Schedule
            caption="Comparable sales and their cap rates"
            columns={[{ head: "Sale" }, { head: "Price" }, { head: "NOI" }, { head: "Cap rate" }, { head: "Share of price" }]}
            total
            rows={[
              ...r.comps.map((c) => [c.label, usd(c.price, false), usd(c.noi, false), pct(c.capRate), pct(c.priceShare, 1)]),
              ["All sales", usd(e.totalPrice, false), usd(e.totalNoi, false), pct(e.weighted), pct(1, 1)],
            ]}
          />
        </CalcSection>
      )}
      <CalcSection id="trace" title="Every formula it ran, in order." note="Excel's definition of PMT; payments monthly">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
