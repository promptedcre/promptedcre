"use client";

import { useRef, useState } from "react";
import { LEVERAGE_EXAMPLE, leverageInput, runLeverage, type LeverageInput, type LeverageResult } from "@/lib/calculators/leverage";
import { multiple, pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { CheckField, FieldGroup, FormAction, InputsPanel, NumberField, type FixLabels } from "./fields";
import { Caution, CellsPart, Words } from "./figures";
import { leverageCells, leverageFigures, leverageHeadline, ltvText } from "./leverage-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TraceView, type SheetSlots } from "./trace-view";

type Quote = NonNullable<LeverageInput["compare"]>;
type QuoteUi = { [K in keyof Quote]: number | null };
// key: a stable id for the row, so removing one level never hands its value to the next.
type LevelUi = { key: number; value: number | null };
type Ui = Omit<LeverageInput, "ltvLevels" | "compare"> & { levels: LevelUi[]; compareOn: boolean; compare: QuoteUi };

const MAX_LEVELS = 8;
const EXAMPLE_QUOTE = LEVERAGE_EXAMPLE.compare as Quote;

const fromInput = (d: LeverageInput): Ui => ({
  price: d.price,
  pgi: d.pgi,
  vacancy: d.vacancy,
  opex: d.opex,
  rate: d.rate,
  amortYears: d.amortYears,
  levels: d.ltvLevels.map((value, key) => ({ key, value })),
  compareOn: d.compare !== null,
  compare: { ...(d.compare ?? EXAMPLE_QUOTE) },
});

const nan = (v: number | null) => v ?? Number.NaN;
const toInput = (u: Ui): LeverageInput => ({
  price: u.price,
  pgi: u.pgi,
  vacancy: u.vacancy,
  opex: u.opex,
  rate: u.rate,
  amortYears: u.amortYears,
  ltvLevels: u.levels.map((l) => nan(l.value)),
  compare: u.compareOn
    ? {
        loan1: nan(u.compare.loan1),
        fee1: nan(u.compare.fee1),
        loan2: nan(u.compare.loan2),
        rate2: nan(u.compare.rate2),
        amortYears2: nan(u.compare.amortYears2),
        fee2: nan(u.compare.fee2),
        holdYears: nan(u.compare.holdYears),
      }
    : null,
});

// The worked example as the form writes it back, to tell when an input has changed.
const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(LEVERAGE_EXAMPLE)));

const LABELS: FixLabels = {
  price: ["Price", "money"],
  pgi: ["Potential gross income", "money"],
  vacancy: ["Vacancy and collection loss", "pct"],
  opex: ["Operating expenses", "money"],
  rate: ["Interest rate", "pct"],
  amortYears: "Amortization",
  ltvLevels: "Loan-to-value levels",
  "ltvLevels.*": ["Level #", "pct"],
  compare: "Loan quotes",
  "compare.loan1": ["Quote 1 loan", "money"],
  "compare.fee1": ["Quote 1 fees", "money"],
  "compare.loan2": ["Quote 2 loan", "money"],
  "compare.rate2": ["Quote 2 interest rate", "pct"],
  "compare.amortYears2": "Quote 2 amortization",
  "compare.fee2": ["Quote 2 fees", "money"],
  "compare.holdYears": "Hold",
};

function LevelTable({ r }: { r: LeverageResult }) {
  return (
    <Schedule
      caption="Cash return, coverage and break-evens at each loan-to-value level"
      columns={[
        { head: "Loan-to-value" },
        { head: "Loan" },
        { head: "Debt service" },
        { head: "Cash flow" },
        { head: "Cash-on-cash" },
        { head: "DSCR" },
        { head: "Debt yield" },
        { head: "Break-even occupancy" },
        { head: "Break-even share of rent" },
      ]}
      rows={r.levels.map((l) => [
        ltvText(l.ltv),
        usd(l.loan, false),
        usd(l.debtService, false),
        usd(l.cashFlow, false),
        pct(l.cashOnCash),
        l.dscr === null ? "none" : multiple(l.dscr),
        l.debtYield === null ? "none" : pct(l.debtYield),
        pct(l.breakEvenOccupancy),
        pct(l.breakEvenRentShare),
      ])}
    />
  );
}

function Comparison({ r }: { r: LeverageResult }) {
  const c = r.comparison;
  if (!c) {
    return (
      <Words>
        <p>No loan quotes to compare: tick the box under the inputs to price a larger loan&apos;s extra dollars.</p>
      </Words>
    );
  }
  return (
    <CellsPart
      title="The larger loan's extra dollars"
      note={`over a ${c.holdMonths / 12}-year hold`}
      cells={[
        { label: "Extra cash at closing", value: usd(c.extraProceeds, false), sub: "after each quote's fees" },
        { label: "Extra payment", value: usd(c.extraPayment), sub: "a month" },
        { label: "Extra balance at payoff", value: usd(c.extraBalance, false), sub: `after ${c.holdMonths} months` },
        { label: "Cost, nominal", value: c.nominal === null ? "none" : pct(c.nominal), sub: "12 × the monthly rate" },
        { label: "Cost, effective", value: c.effective === null ? "none" : pct(c.effective), sub: "compounded monthly" },
        { label: "Cap rate, for comparison", value: pct(r.capRate), sub: "the unlevered one-year return" },
      ]}
    >
      {c.note && <p>{c.note.charAt(0).toUpperCase() + c.note.slice(1)}.</p>}
      {c.swapped && <p>Quote 2 lends less than quote 1, so it was compared as the smaller loan.</p>}
      <p>Compare the cost with the unlevered return or with what the equity would earn elsewhere, not with the levered return.</p>
    </CellsPart>
  );
}

export function LeverageCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(LEVERAGE_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New levels take ids past the worked example's.
  const nextKey = useRef(100);
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = leverageInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runLeverage(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const req = (k: "price" | "pgi" | "vacancy" | "opex" | "rate" | "amortYears") => (v: number | null) => setUi((p) => ({ ...p, [k]: v ?? Number.NaN }) as Ui);
  const setQ = (k: keyof Quote) => (v: number | null) => setUi((p) => ({ ...p, compare: { ...p.compare, [k]: v } as QuoteUi }));
  const setLevel = (i: number) => (v: number | null) => setUi((p) => ({ ...p, levels: p.levels.map((l, j) => (j === i ? { ...l, value: v } : l)) }));
  const addLevel = () =>
    setUi((p) => {
      const last = p.levels.at(-1)?.value ?? 0;
      const next = Math.min(0.95, Math.round(((Number.isFinite(last) ? last : 0) + 0.05) * 100) / 100);
      return { ...p, levels: [...p.levels, { key: nextKey.current++, value: next }] };
    });

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(LEVERAGE_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Property, one stabilized year">
          <NumberField label="Price" kind="money" prefix="$" step={50000} value={ui.price} onChange={req("price")} hint="equity is the price less the loan" issue={issues.get("price")} />
          <NumberField label="Potential gross income" kind="money" prefix="$" unit="/yr" step={5000} value={ui.pgi} onChange={req("pgi")} hint="every space leased" issue={issues.get("pgi")} />
          <NumberField label="Vacancy and collection loss" kind="pct" unit="%" value={ui.vacancy} onChange={req("vacancy")} hint="share of potential gross income" issue={issues.get("vacancy")} />
          <NumberField label="Operating expenses" kind="money" prefix="$" unit="/yr" step={5000} value={ui.opex} onChange={req("opex")} hint="treated as fixed" issue={issues.get("opex")} />
        </FieldGroup>
        <FieldGroup title="Loan">
          <NumberField label="Interest rate" kind="pct" unit="%/yr" step={0.125} value={ui.rate} onChange={req("rate")} hint="divided by 12 for each month" issue={issues.get("rate")} />
          <NumberField label="Amortization" kind="int" unit="yrs" value={ui.amortYears} onChange={req("amortYears")} hint="0 for interest only" issue={issues.get("amortYears")} />
        </FieldGroup>
        <FieldGroup
          title="Loan-to-value levels"
          note="From lowest to highest, each once; 0% is all cash."
          action={
            <span className="flex gap-4">
              {ui.levels.length < MAX_LEVELS && <FormAction onClick={addLevel}>Add a level</FormAction>}
              {ui.levels.length > 1 && (
                <FormAction tone="faint" label={`Remove level ${ui.levels.length}`} onClick={() => setUi((p) => ({ ...p, levels: p.levels.slice(0, -1) }))}>
                  Remove the last
                </FormAction>
              )}
            </span>
          }
        >
          {ui.levels.map((l, i) => (
            <NumberField key={l.key} label={`Level ${i + 1}`} kind="pct" unit="% LTV" step={5} value={l.value} onChange={setLevel(i)} issue={issues.get(`ltvLevels.${i}`)} />
          ))}
          {ui.levels.length % 2 === 1 && <div aria-hidden="true" className="bg-raised" />}
        </FieldGroup>
        <FieldGroup title="Two loan quotes" note="Quote 1 carries the loan's rate and amortization above. Whichever quote lends more is the larger loan.">
          <CheckField label="Price the extra dollars a larger loan lends" checked={ui.compareOn} onChange={(v) => setUi((p) => ({ ...p, compareOn: v }))} />
          {ui.compareOn && (
            <>
              <NumberField label="Quote 1 loan" kind="money" prefix="$" step={50000} value={ui.compare.loan1} onChange={setQ("loan1")} issue={issues.get("compare.loan1")} />
              <NumberField label="Quote 1 fees" kind="money" prefix="$" step={1000} value={ui.compare.fee1} onChange={setQ("fee1")} hint="paid at closing" issue={issues.get("compare.fee1")} />
              <NumberField label="Quote 2 loan" kind="money" prefix="$" step={50000} value={ui.compare.loan2} onChange={setQ("loan2")} issue={issues.get("compare.loan2")} />
              <NumberField label="Quote 2 fees" kind="money" prefix="$" step={1000} value={ui.compare.fee2} onChange={setQ("fee2")} hint="paid at closing" issue={issues.get("compare.fee2")} />
              <NumberField label="Quote 2 interest rate" kind="pct" unit="%/yr" step={0.125} value={ui.compare.rate2} onChange={setQ("rate2")} issue={issues.get("compare.rate2")} />
              <NumberField label="Quote 2 amortization" kind="int" unit="yrs" value={ui.compare.amortYears2} onChange={setQ("amortYears2")} hint="0 for interest only" issue={issues.get("compare.amortYears2")} />
              <NumberField label="Hold" kind="int" unit="yrs" value={ui.compare.holdYears} onChange={setQ("holdYears")} hint="years until the loan is paid off" issue={issues.get("compare.holdYears")} wide />
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
    problem: parsed.success ? null : { say: "Fix the inputs to run the leverage test.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = leverageFigures(d, r);
  const short = r.levels.filter((l) => l.negativeCashFlow);
  const over = r.levels.filter((l) => l.breakEvenOccupancy > 1);

  return (
    <CalcSheet
      {...sheet}
      headline={leverageHeadline(r)}
      // the sentence gives the cap rate and the constant, so the lead figure stands without them
      lead={{ label: f.lead.label, value: f.lead.value }}
      cells={leverageCells(d, r)}
      figures={
        <>
          {(short.length > 0 || over.length > 0) && (
            <Words>
              {short.length > 0 && (
                <Caution>
                  <span className="text-text">Cash flow below zero</span> at {short.map((l) => ltvText(l.ltv)).join(", ")} loan-to-value: the NOI does not cover the debt service.
                </Caution>
              )}
              {over.length > 0 && (
                <Caution>
                  <span className="text-text">Break-even occupancy above 100%</span> at {over.map((l) => ltvText(l.ltv)).join(", ")}: a full building does not cover expenses and debt service.
                </Caution>
              )}
            </Words>
          )}
          <Comparison r={r} />
          <Words>
            <p className="text-faint">
              One stabilized year. Equity is the price less the loan, with closing costs and reserves left out; expenses are treated as fixed. The worked example&apos;s rents, rates and
              quotes are illustrations, not market figures.
            </p>
          </Words>
        </>
      }
    >
      <CalcSection id="schedule" title="Each loan-to-value level." note={`${count(r.levels.length, "level")} · one loan constant, ${pct(r.loanConstant)} · a minus sign: cash flow below zero`}>
        <LevelTable r={r} />
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Excel's definitions of PMT, FV and IRR">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
