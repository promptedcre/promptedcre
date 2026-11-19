"use client";

import { useState } from "react";
import {
  ACCRUAL_BASES,
  ACCRUAL_BASIS_LABEL,
  ACCRUAL_EXAMPLE,
  LOAN_PAYMENTS_EXAMPLE,
  loanPaymentsInput,
  runLoanPayments,
  yearList,
  type AccrualBasis,
  type AccrualInput,
  type LoanPaymentsInput,
  type StructureResult,
} from "@/lib/calculators/loan-payments";
import { pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { DateField, FieldGroup, InputsPanel, NumberField, SelectField, type FixLabels } from "./fields";
import { CellsPart, Words } from "./figures";
import { loanPaymentsAccrualFigures, loanPaymentsAccrualNote, loanPaymentsFigures, loanPaymentsHeadline, loanPaymentsRateNote } from "./loan-payments-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TableLabel, TraceView, type SheetSlots } from "./trace-view";

const LABELS: FixLabels = {
  loan: ["Loan amount", "money"],
  rate: ["Interest rate", "pct"],
  amortYears: "Amortization",
  termYears: "Term",
  steppedFirstPayment: ["Year-1 payment", "money"],
  steppedGrowth: ["Yearly step", "pct"],
  "accrual.basis": "Day-count basis",
  "accrual.from": "First day of interest",
  "accrual.to": "Interest stops on",
  "accrual.balance": ["Balance between the dates", "money"],
};

// The basis is a term of the loan documents. "none" leaves the check out. Each
// basis is written as it is everywhere a person reads it: actual/360, never the id.
type BasisChoice = AccrualBasis | "none";
const LEAVE_OUT = "Leave this check out";
const BASIS_MEANS: Record<AccrualBasis, string> = { "actual-360": "actual days over 360", "actual-365": "actual days over 365", "30-360": "30-day months over 360" };
const BASIS_OPTIONS: Array<{ value: BasisChoice; label: string }> = [
  { value: "none", label: LEAVE_OUT },
  ...ACCRUAL_BASES.map((b) => ({ value: b, label: `${ACCRUAL_BASIS_LABEL[b]}: ${BASIS_MEANS[b]}` })),
];

function YearTable({ s }: { s: StructureResult }) {
  const stepped = s.key === "stepped";
  return (
    <Schedule
      caption={`${s.label} loan by year`}
      columns={[
        { head: "Year" },
        { head: "Begins at" },
        { head: "Paid" },
        { head: "Interest" },
        { head: "Principal" },
        { head: "Ends at" },
        ...(stepped ? [{ head: "Balance" }] : []),
      ]}
      rows={s.years.map((y) => [
        y.year,
        usd(y.beginBalance, false),
        usd(y.payment, false),
        usd(y.interest, false),
        usd(y.principal, false),
        usd(y.endBalance, false),
        ...(stepped ? [y.balanceGrows ? "grows" : y.endBalance < y.beginBalance ? "falls" : "flat"] : []),
      ])}
    />
  );
}

export function LoanPaymentsCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [input, setInput] = useState<LoanPaymentsInput>(LOAN_PAYMENTS_EXAMPLE);
  const [formKey, setFormKey] = useState(0);
  const set = (k: keyof LoanPaymentsInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v }) as LoanPaymentsInput);
  const req = (k: keyof LoanPaymentsInput) => (v: number | null) => setInput((p) => ({ ...p, [k]: v ?? Number.NaN }) as LoanPaymentsInput);
  // The dates block as typed. Leaving the check out keeps what was typed, so
  // choosing a basis again brings the same dates back.
  const block = input.accrual ?? null;
  const [kept, setKept] = useState<AccrualInput>(ACCRUAL_EXAMPLE);
  const setBlock = (x: { from?: string | null; to?: string | null; balance?: number | null }) =>
    setInput((p) => (p.accrual ? ({ ...p, accrual: { ...p.accrual, ...x } } as LoanPaymentsInput) : p));
  const chooseBasis = (v: BasisChoice) => {
    if (v === "none") {
      if (block) setKept(block);
      setInput((p) => ({ ...p, accrual: null }));
    } else {
      setInput((p) => ({ ...p, accrual: { ...(p.accrual ?? kept), basis: v } }));
    }
  };
  const key = JSON.stringify(input);
  const parsed = loanPaymentsInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runLoanPayments(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== JSON.stringify(LOAN_PAYMENTS_EXAMPLE);

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setInput(LOAN_PAYMENTS_EXAMPLE);
        setKept(ACCRUAL_EXAMPLE);
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Loan">
          <NumberField label="Loan amount" kind="money" prefix="$" step={50000} value={input.loan} onChange={req("loan")} issue={issues.get("loan")} />
          <NumberField label="Interest rate" kind="pct" unit="%/yr" step={0.125} value={input.rate} onChange={req("rate")} hint="divided by 12 for each month" issue={issues.get("rate")} />
          <NumberField label="Amortization" kind="int" unit="yrs" value={input.amortYears} onChange={req("amortYears")} hint="level and equal principal pay over this" issue={issues.get("amortYears")} />
          <NumberField label="Term" kind="int" unit="yrs" value={input.termYears} onChange={req("termYears")} hint="the balance is due at its end" issue={issues.get("termYears")} />
        </FieldGroup>
        <FieldGroup title="Stepped payment" note="Leave the year-1 payment blank to compare only the other three.">
          <NumberField
            label="Year-1 payment"
            kind="money"
            prefix="$"
            unit="/mo"
            step={250}
            optional
            value={input.steppedFirstPayment}
            onChange={set("steppedFirstPayment")}
            issue={issues.get("steppedFirstPayment")}
          />
          <NumberField label="Yearly step" kind="pct" unit="%/yr" step={0.5} value={input.steppedGrowth} onChange={req("steppedGrowth")} hint="rises on each loan anniversary" issue={issues.get("steppedGrowth")} />
        </FieldGroup>
        <FieldGroup
          fold
          title="Interest between two dates (optional)"
          note={`Read the basis off the loan documents, or choose "${LEAVE_OUT}". The payment tables above use the rate over 12 whatever basis is chosen here.`}
        >
          <SelectField label="Day-count basis" value={block ? block.basis : "none"} options={BASIS_OPTIONS} onChange={chooseBasis} wide />
          {block && (
            <>
              <DateField label="First day of interest" value={block.from} onChange={(v) => setBlock({ from: v })} hint="this day counts" issue={issues.get("accrual.from")} />
              <DateField label="Interest stops on" value={block.to} onChange={(v) => setBlock({ to: v })} hint="not counted here; some loan documents count it" issue={issues.get("accrual.to")} />
              <NumberField
                label="Balance between the dates"
                kind="money"
                prefix="$"
                step={50000}
                optional
                wide
                value={block.balance}
                onChange={(v) => setBlock({ balance: v })}
                hint="blank uses the loan amount"
                issue={issues.get("accrual.balance")}
              />
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
    problem: parsed.success ? null : { say: "Fix the inputs to compare the payments.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const structures = [r.level, r.equalPrincipal, r.interestOnly, ...(r.stepped ? [r.stepped] : [])];
  const s = r.stepped;
  const a = r.accrual;
  const termYears = r.termMonths / 12;
  const f = loanPaymentsFigures(d, r);

  return (
    <CalcSheet
      {...sheet}
      headline={loanPaymentsHeadline(r)}
      lead={f.lead}
      cells={f.rest}
      figures={
        <>
          {s ? (
            <CellsPart
              title="The stepped loan"
              note="payment against interest, month by month"
              cells={[
                { label: "Balance grows in", value: yearList(s.negAmYears), sub: s.negAmYears.length > 0 ? "a month pays less than its interest" : "every payment covers its interest" },
                { label: "Highest balance", value: usd(s.peakBalance, false), sub: s.peakYear === 0 ? "the loan itself" : `end of year ${s.peakYear}` },
                ...(s.paidOffMonth !== null ? [{ label: "Paid off", value: `month ${s.paidOffMonth}`, sub: "nothing due after it" }] : []),
              ]}
            />
          ) : (
            <Words>
              <p>No stepped loan: enter a year-1 payment to add one.</p>
            </Words>
          )}
          {a && (
            <CellsPart title="Interest between the two dates" note={loanPaymentsAccrualNote(a)} cells={loanPaymentsAccrualFigures(d.rate, a)}>
              {a.notes.length > 0 ? a.notes.map((n) => <p key={n}>{n}</p>) : null}
            </CellsPart>
          )}
        </>
      }
    >
      <CalcSection id="structures" title={`${count(structures.length, "structure")}, one loan.`} note={loanPaymentsRateNote(r)}>
        <Schedule
          caption="The loan structures side by side"
          columns={[{ head: "Structure" }, { head: "First payment" }, { head: `Month ${r.termMonths}` }, { head: "Year-1 constant" }, { head: "Interest, term" }, { head: "Due at maturity" }]}
          rows={structures.map((x) => [x.label, usd(x.firstPayment), usd(x.lastPayment), pct(x.loanConstant), usd(x.totalInterest, false), usd(x.balanceAtMaturity, false)])}
        />
      </CalcSection>
      <CalcSection id="schedule" title="Each loan, year by year." note={`${count(termYears, "year")} · payments monthly, in arrears`}>
        <div className="space-y-10">
          {structures.map((x) => (
            <div key={x.key}>
              <TableLabel note={x.key === "stepped" ? "principal below zero: the balance grew" : undefined}>{x.label}</TableLabel>
              <YearTable s={x} />
            </div>
          ))}
        </div>
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Excel's definitions of PMT, FV and PV">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
