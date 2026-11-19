"use client";

import { useState } from "react";
import { LEASE_RENT_EXAMPLE, leaseRentInput, runLeaseRent, type Escalation, type LeaseRentInput, type LeaseRentResult } from "@/lib/calculators/lease-rent";
import { num, pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { FieldGroup, InputsPanel, NumberField, SelectField, type FixLabels } from "./fields";
import { CellsPart, Drawing, SplitBar, type Headline, type SplitSegment } from "./figures";
import { leaseRentCells, leaseRentEscalation, leaseRentFigures, leaseRentHeadline } from "./lease-rent-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

const LABELS: FixLabels = {
  area: "Leased area",
  rentPerSf: ["Year-1 rent", "money"],
  termMonths: "Term",
  escalation: "Escalation",
  escalationRate: ["Yearly increase", "pct"],
  escalationStep: ["Yearly step", "money"],
  indexFloor: ["Floor", "pct"],
  indexCap: ["Cap", "pct"],
  freeMonths: "Free rent",
  tiPerSf: ["Improvement allowance", "money"],
  commissionShare: ["Leasing commission", "pct"],
  discountRate: ["Discount rate", "pct"],
};

const ESCALATION_OPTIONS: Array<{ value: Escalation; label: string }> = [
  { value: "percent", label: "Fixed percent a year" },
  { value: "step", label: "Fixed $/SF step a year" },
  { value: "index", label: "Index, with floor and cap" },
  { value: "none", label: "None: flat rent" },
];

// Where the total base rent goes: what the landlord gives up and what it keeps.
function rentSplit(r: LeaseRentResult): Headline[] {
  const share = (n: number) => `${pct(n, 1)} of total base rent`;
  return [
    { label: "Free rent", value: usd(r.freeRent, false), sub: share(r.shares.free) },
    { label: "Improvement allowance", value: usd(r.ti, false), sub: share(r.shares.ti) },
    { label: "Leasing commission", value: usd(r.commission, false), sub: share(r.shares.commission) },
    { label: "Net to the landlord", value: usd(r.netRent, false), sub: share(r.shares.net) },
  ];
}

// The same four parts as a bar, drawn only when none is below zero, so they add to the whole.
function rentBar(r: LeaseRentResult): SplitSegment[] | null {
  if (!(r.totalRent > 0) || r.freeRent < 0 || r.ti < 0 || r.commission < 0 || r.netRent < 0) return null;
  return [
    { key: "net", label: "Net to the landlord", value: r.netRent, fill: "solid" },
    { key: "free", label: "Free rent", value: r.freeRent, fill: "tint" },
    { key: "ti", label: "Improvement allowance", value: r.ti, fill: "light" },
    { key: "commission", label: "Leasing commission", value: r.commission, fill: "outline" },
  ];
}

export function LeaseRentCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [input, setInput] = useState<LeaseRentInput>(LEASE_RENT_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  const set = (k: keyof LeaseRentInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v }) as LeaseRentInput);
  const req = (k: keyof LeaseRentInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v ?? Number.NaN }) as LeaseRentInput);
  const key = JSON.stringify(input);
  const parsed = leaseRentInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runLeaseRent(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== JSON.stringify(LEASE_RENT_EXAMPLE);
  const esc = input.escalation;

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setInput(LEASE_RENT_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Lease">
          <NumberField label="Leased area" kind="int" unit="SF" step={1000} value={input.area} onChange={req("area")} issue={issues.get("area")} />
          <NumberField
            label="Year-1 rent"
            kind="money"
            prefix="$"
            unit="/SF/yr"
            step={0.25}
            value={input.rentPerSf}
            onChange={req("rentPerSf")}
            hint="base rent, before escalation"
            issue={issues.get("rentPerSf")}
          />
          <NumberField
            label="Term"
            kind="int"
            unit="months"
            step={6}
            wide
            value={input.termMonths}
            onChange={req("termMonths")}
            hint="a term that is not whole years ends with a partial lease year"
            issue={issues.get("termMonths")}
          />
        </FieldGroup>

        <FieldGroup title="Escalation" note="Rent changes on each lease anniversary. The rate or step is your assumption.">
          <SelectField label="How rent rises" value={esc} options={ESCALATION_OPTIONS} onChange={(v) => setInput((p) => ({ ...p, escalation: v }))} wide={esc === "none"} wideOnPhone />
          {esc === "percent" && (
            <NumberField
              label="Yearly increase"
              kind="pct"
              unit="%/yr"
              step={0.25}
              value={input.escalationRate}
              onChange={req("escalationRate")}
              hint="compounds each year"
              issue={issues.get("escalationRate")}
              wideOnPhone
            />
          )}
          {esc === "step" && (
            <NumberField
              label="Yearly step"
              kind="money"
              prefix="$"
              unit="/SF/yr"
              step={0.05}
              value={input.escalationStep}
              onChange={req("escalationStep")}
              hint="added each year; negative lowers it"
              issue={issues.get("escalationStep")}
              wideOnPhone
            />
          )}
          {esc === "index" && (
            <>
              <NumberField
                label="Assumed index change"
                kind="pct"
                unit="%/yr"
                step={0.25}
                value={input.escalationRate}
                onChange={req("escalationRate")}
                hint="an assumption, not a forecast"
                issue={issues.get("escalationRate")}
                wideOnPhone
              />
              <NumberField label="Floor" kind="pct" unit="%/yr" step={0.25} optional value={input.indexFloor} onChange={set("indexFloor")} hint="blank for none" issue={issues.get("indexFloor")} />
              <NumberField label="Cap" kind="pct" unit="%/yr" step={0.25} optional value={input.indexCap} onChange={set("indexCap")} hint="blank for none" issue={issues.get("indexCap")} />
            </>
          )}
        </FieldGroup>

        <FieldGroup title="Concessions" note="The allowance and the commission are paid at signing.">
          <NumberField
            label="Free rent"
            kind="int"
            unit="months"
            value={input.freeMonths}
            onChange={req("freeMonths")}
            hint="at the start of the term"
            issue={issues.get("freeMonths")}
          />
          <NumberField
            label="Improvement allowance"
            kind="money"
            prefix="$"
            unit="/SF"
            step={1}
            value={input.tiPerSf}
            onChange={req("tiPerSf")}
            hint="0 for none"
            issue={issues.get("tiPerSf")}
          />
          <NumberField
            label="Leasing commission"
            kind="pct"
            unit="%"
            step={0.5}
            wide
            value={input.commissionShare}
            onChange={req("commissionShare")}
            hint="a share of rent payable after free rent; enter what your agreement pays"
            issue={issues.get("commissionShare")}
          />
        </FieldGroup>

        <FieldGroup title="Discounting">
          <NumberField
            label="Discount rate"
            kind="pct"
            unit="%/yr"
            step={0.25}
            wide
            value={input.discountRate}
            onChange={req("discountRate")}
            hint="effective annual; the return you require, not a market figure"
            issue={issues.get("discountRate")}
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
    problem: parsed.success ? null : { say: "Fix the inputs to see the effective rent.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = leaseRentFigures(d, r);
  const partial = r.lastYearMonths < 12;
  const bar = rentBar(r);

  return (
    <CalcSheet
      {...sheet}
      headline={leaseRentHeadline(r)}
      lead={f.lead}
      cells={leaseRentCells(d, r)}
      figures={
        bar ? (
          <Drawing title="Where the total base rent goes" note={`over ${count(d.termMonths, "month")}`}>
            <SplitBar segments={bar} total={r.totalRent} totalLabel="total base rent" title="Total base rent by where it goes" />
          </Drawing>
        ) : (
          <CellsPart title="Where the total base rent goes" note={`${usd(r.totalRent, false)} over ${count(d.termMonths, "month")}`} cells={rentSplit(r)} />
        )
      }
    >
      <CalcSection
        id="schedule"
        title="Rent by lease year."
        note={`${count(r.leaseYears, "lease year")}${partial ? `, the last ${count(r.lastYearMonths, "month")}` : ""} · ${leaseRentEscalation(d, r)} · rent monthly, in advance`}
      >
        <Schedule
          caption="Base rent by lease year"
          columns={[{ head: "Year" }, { head: "Months" }, { head: "Rate, $/SF/yr" }, { head: "Scheduled" }, { head: "Free" }, { head: "Payable" }]}
          total
          rows={[
            ...r.years.map((y) => [y.year, y.freeMonths > 0 ? `${y.months} (${y.freeMonths} free)` : y.months, usd(y.rate), usd(y.scheduled, false), usd(y.free, false), usd(y.payable, false)]),
            ["Term", num(d.termMonths, 0), usd(r.averageRent), usd(r.totalRent, false), usd(r.freeRent, false), usd(r.rentPayable, false)],
          ]}
        />
        <p className="type-body-s m-0 mt-3 text-faint">The term row&apos;s rate is the average rent: total base rent over the area and the years of the term.</p>
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Excel's definitions of PV and PMT, payments in advance">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
