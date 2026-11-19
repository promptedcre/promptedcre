"use client";

import { useId, useRef, useState } from "react";
import { MAX_UNITS, per100Text, PROPERTY_TAX_EXAMPLE, propertyTaxInput, runPropertyTax, type PropertyTaxInput, type PropertyTaxResult } from "@/lib/calculators/property-tax";
import { pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { CheckField, DateField, FieldGroup, FormAction, FormNote, GroupRow, InputsPanel, NumberField, TextField, type FixLabels } from "./fields";
import { Drawing, SplitBar } from "./figures";
import { propertyTaxCells, propertyTaxFigures, propertyTaxHeadline, propertyTaxProrationSplit, propertyTaxUnitSplit } from "./property-tax-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

// key: a stable id for the row, so removing one unit never hands its text to the next.
type UnitUi = { key: number; name: string; rate: number | null };
type Ui = {
  appraisedValue: number | null;
  assessmentRatio: number | null;
  units: UnitUi[];
  purchasePrice: number | null;
  protestReduction: number | null;
  closingDate: string | null;
  sellerOwnsClosingDay: boolean;
  taxUnpaidAtClosing: boolean;
};

const fromInput = (d: PropertyTaxInput): Ui => ({ ...d, units: d.units.map((u, i) => ({ key: i, ...u })) });

const n = (v: number | null) => v ?? Number.NaN;

// Blank required numbers become NaN, which validation names; blank optional ones stay null.
const toInput = (u: Ui): PropertyTaxInput =>
  ({
    appraisedValue: n(u.appraisedValue),
    assessmentRatio: n(u.assessmentRatio),
    units: u.units.map((x) => ({ name: x.name, rate: n(x.rate) })),
    purchasePrice: u.purchasePrice,
    protestReduction: u.protestReduction,
    closingDate: u.closingDate,
    sellerOwnsClosingDay: u.sellerOwnsClosingDay,
    taxUnpaidAtClosing: u.taxUnpaidAtClosing,
  }) as PropertyTaxInput;

const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(PROPERTY_TAX_EXAMPLE)));

const LABELS: FixLabels = {
  appraisedValue: ["Appraised value", "money"],
  assessmentRatio: "Assessment ratio",
  units: "Taxing units",
  "units.*.name": "Unit # name",
  "units.*.rate": ["Unit # rate", "pct"],
  purchasePrice: ["Purchase price", "money"],
  protestReduction: ["Protest reduction", "money"],
  closingDate: "Closing date",
};

const share = (v: number | null) => (v === null ? "none" : pct(v, 1));

// The drawings: the year's tax by taxing unit, and the same tax split at closing.
function Drawings({ r }: { r: PropertyTaxResult }) {
  const p = r.proration;
  if (!(r.totalTax > 0)) return null;
  return (
    <>
      <Drawing title="The year's tax by unit" note={count(r.units.length, "taxing unit")}>
        <SplitBar segments={propertyTaxUnitSplit(r)} total={r.totalTax} totalLabel="tax for the year" title="The year's tax by taxing unit" />
      </Drawing>
      {p && (
        <Drawing title="The year's tax split at closing" note={`closing ${p.closingDate}`}>
          <SplitBar segments={propertyTaxProrationSplit(r)} total={r.totalTax} totalLabel={`tax for ${p.year}`} title="The year's tax split between seller and buyer" />
          <p className="type-body-s m-0 mt-4 text-muted">
            {p.payer === "seller"
              ? `The tax is unpaid at closing, so the seller credits the buyer ${usd(p.credit)}.`
              : `The tax was paid before closing, so the buyer credits the seller ${usd(p.credit)}.`}
          </p>
        </Drawing>
      )}
    </>
  );
}

export function PropertyTaxCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(PROPERTY_TAX_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New units take ids past the worked example's.
  const nextKey = useRef(100);
  const unitsNote = useId();
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = propertyTaxInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runPropertyTax(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const set = (p: Partial<Ui>) => setUi((u) => ({ ...u, ...p }));
  const setUnit = (i: number, p: Partial<UnitUi>) => setUi((u) => ({ ...u, units: u.units.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const addUnit = () => setUi((u) => ({ ...u, units: [...u.units, { key: nextKey.current++, name: `Unit ${u.units.length + 1}`, rate: null }] }));

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(PROPERTY_TAX_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Value on the roll" note="The Texas 20 percent cap on yearly increases in appraised value is not modeled: the tax is figured on the value you enter.">
          <NumberField
            label="Appraised value"
            kind="money"
            prefix="$"
            step={50000}
            value={ui.appraisedValue}
            onChange={(v) => set({ appraisedValue: v })}
            hint="from the appraisal notice or roll"
            issue={issues.get("appraisedValue")}
            wideOnPhone
          />
          <NumberField
            label="Assessment ratio"
            kind="number"
            step={0.05}
            value={ui.assessmentRatio}
            onChange={(v) => set({ assessmentRatio: v })}
            hint="share of the value taxed; 1 where the full value is"
            issue={issues.get("assessmentRatio")}
            wideOnPhone
          />
        </FieldGroup>

        <FieldGroup
          title="Taxing units"
          noteId={unitsNote}
          note="Each unit's rate as a percent of value is the same figure as its rate per $100: $0.55 per $100 is 0.55%. The worked example's units and rates are made up."
          action={ui.units.length < MAX_UNITS ? <FormAction onClick={addUnit}>Add a unit</FormAction> : undefined}
        >
          {ui.units.map((x, i) => (
            <div key={x.key} className="calc-set">
              <GroupRow
                action={
                  <FormAction tone="faint" label={`Remove unit ${i + 1}`} onClick={() => setUi((u) => ({ ...u, units: u.units.filter((_, j) => j !== i) }))}>
                    Remove
                  </FormAction>
                }
              >
                Unit {i + 1}
              </GroupRow>
              <TextField label="Name" value={x.name} onChange={(v) => setUnit(i, { name: v })} issue={issues.get(`units.${i}.name`)} />
              <NumberField
                label="Rate"
                kind="pct"
                unit="%"
                describedBy={unitsNote}
                step={0.01}
                value={x.rate}
                onChange={(v) => setUnit(i, { rate: v })}
                issue={issues.get(`units.${i}.rate`)}
              />
            </div>
          ))}
          {ui.units.length === 0 && <FormNote>No taxing units: the tax is $0. Add a unit to estimate one.</FormNote>}
        </FieldGroup>

        <FieldGroup title="What-ifs" note="Leave either blank to skip it.">
          <NumberField
            label="Purchase price"
            kind="money"
            prefix="$"
            step={50000}
            optional
            value={ui.purchasePrice}
            onChange={(v) => set({ purchasePrice: v })}
            hint="the tax if the value were reset to it"
            issue={issues.get("purchasePrice")}
            wideOnPhone
          />
          <NumberField
            label="Protest reduction"
            kind="money"
            prefix="$"
            step={10000}
            optional
            value={ui.protestReduction}
            onChange={(v) => set({ protestReduction: v })}
            hint="off the appraised value"
            issue={issues.get("protestReduction")}
            wideOnPhone
          />
        </FieldGroup>

        <FieldGroup title="Closing proration" note="Leave the date blank to skip it. The year is the closing date's calendar year, 365 or 366 days.">
          <DateField label="Closing date" value={ui.closingDate} onChange={(v) => set({ closingDate: v })} issue={issues.get("closingDate")} wide />
          <CheckField label="The seller owns the closing day" checked={ui.sellerOwnsClosingDay} onChange={(v) => set({ sellerOwnsClosingDay: v })} />
          <CheckField label="The year's tax is still unpaid at closing" checked={ui.taxUnpaidAtClosing} onChange={(v) => set({ taxUnpaidAtClosing: v })} />
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the tax.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = propertyTaxFigures(d, r);

  return (
    <CalcSheet {...sheet} headline={propertyTaxHeadline(r)} lead={f.lead} cells={propertyTaxCells(d, r)} figures={<Drawings r={r} />}>
      {r.units.length > 0 && (
        <CalcSection id="schedule" title="Each taxing unit's tax." note={`${count(r.units.length, "unit")} · rates per $100 of taxable value`}>
          <Schedule
            caption="Tax by taxing unit, at the roll value, at the purchase price and after the protest"
            columns={[{ head: "Unit" }, { head: "Rate per $100" }, { head: "Tax" }, { head: "Share" }, { head: "At the price" }, { head: "Protest saving" }]}
            total
            rows={[
              ...r.units.map((u) => [u.name, per100Text(u.rate), usd(u.tax), share(u.share), u.taxAtPrice === null ? "not given" : usd(u.taxAtPrice), u.protestSaving === null ? "not given" : usd(u.protestSaving)]),
              ["Total", per100Text(r.combinedRate), usd(r.totalTax), share(r.totalTax > 0 ? 1 : null), r.purchase ? usd(r.purchase.totalTax) : "not given", r.protest ? usd(r.protest.saving) : "not given"],
            ]}
          />
        </CalcSection>
      )}
      <CalcSection id="trace" title="Every formula it ran, in order." note="An estimate from the inputs, not a tax bill">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
