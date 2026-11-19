"use client";

import { useId, useRef, useState } from "react";
import { addDays } from "@/lib/calculators/dates";
import {
  addYears,
  LEASE_ROLLOVER_DOWNTIME_EXAMPLE,
  LEASE_ROLLOVER_EXAMPLE,
  leaseRolloverInput,
  MAX_ROWS,
  runLeaseRollover,
  type DowntimeCheck,
  type LeaseRolloverInput,
  type RowStatus,
} from "@/lib/calculators/lease-rollover";
import { num, pct, usd } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { DateField, FieldGroup, FormAction, FormNote, GroupRow, InputsPanel, NumberField, TextField, type FixLabels } from "./fields";
import { CellsPart, Drawing, SplitBar, type Headline } from "./figures";
import { leaseRolloverFigures, leaseRolloverHeadline, leaseRolloverSplit } from "./lease-rollover-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TableLabel, TraceView, type SheetSlots } from "./trace-view";

// key: a stable id for the row, so removing one row never hands its text to the next.
type RowUi = { key: number; tenant: string; area: number | null; annualRent: number | null; leaseEnd: string | null; marketRentPerSf: number | null };
// The optional downtime check: the reader's own odds and downtime for each lease that
// expires in the hold, kept by row id, and the flat allowance to set them against.
type OddsUi = { chance: number | null; months: number | null };
type Ui = { analysisDate: string | null; holdYears: number | null; rows: RowUi[]; odds: Record<number, OddsUi>; flat: number | null };

const fromInput = (d: LeaseRolloverInput): Ui => ({
  analysisDate: d.analysisDate,
  holdYears: d.holdYears,
  rows: d.rows.map((r, i) => ({ key: i, ...r })),
  odds: Object.fromEntries((d.downtimeCheck?.leases ?? []).map((l) => [l.row, { chance: l.renewalProbability, months: l.downtimeMonths }])),
  flat: d.downtimeCheck?.flatVacancy ?? null,
});

const n = (v: number | null | undefined) => v ?? Number.NaN;
const isDate = (s: string | null): s is string => s !== null && /^\d{4}-\d{2}-\d{2}$/.test(s);

// The rows the check needs an entry for: a row with rent whose lease ends before the
// hold's last day (month-to-month and holdover rows included). Read off the form alone.
function atRisk(u: Ui): Array<{ index: number; row: RowUi }> {
  if (!isDate(u.analysisDate) || u.holdYears === null || !Number.isInteger(u.holdYears) || u.holdYears < 1 || u.holdYears > 50) return [];
  const lastDay = addDays(addYears(u.analysisDate, u.holdYears), -1);
  if (!lastDay) return [];
  return u.rows.flatMap((row, index) => ((row.annualRent ?? 0) > 0 && (row.leaseEnd === null || (isDate(row.leaseEnd) && row.leaseEnd < lastDay)) ? [{ index, row }] : []));
}

// The check is part of the input once the reader has started it; left blank, it is left out.
const started = (u: Ui, risk: ReturnType<typeof atRisk>) => u.flat !== null || risk.some(({ row }) => u.odds[row.key]?.chance != null || u.odds[row.key]?.months != null);

// Blank required numbers become NaN and a blank date stays null, so validation names them.
const toInput = (u: Ui): LeaseRolloverInput => {
  const risk = atRisk(u);
  return {
    analysisDate: u.analysisDate,
    holdYears: n(u.holdYears),
    rows: u.rows.map((r) => ({ tenant: r.tenant, area: n(r.area), annualRent: n(r.annualRent), leaseEnd: r.leaseEnd, marketRentPerSf: r.marketRentPerSf })),
    downtimeCheck: started(u, risk)
      ? { leases: risk.map(({ index, row }) => ({ row: index, renewalProbability: n(u.odds[row.key]?.chance), downtimeMonths: n(u.odds[row.key]?.months) })), flatVacancy: u.flat }
      : null,
  } as LeaseRolloverInput;
};

const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(LEASE_ROLLOVER_EXAMPLE)));
const EXAMPLE_ROWS = JSON.stringify(LEASE_ROLLOVER_EXAMPLE.rows);

const LABELS: FixLabels = {
  analysisDate: "Analysis date",
  holdYears: "Hold",
  rows: "Rent roll",
  "rows.*.tenant": "Row # tenant",
  "rows.*.area": "Row # area",
  "rows.*.annualRent": ["Row # rent", "money"],
  "rows.*.leaseEnd": "Row # lease end",
  "rows.*.marketRentPerSf": ["Row # market rent", "money"],
  "downtimeCheck.leases": "Downtime check",
  "downtimeCheck.leases.*.renewalProbability": ["Downtime check, lease # chance of renewal", "pct"],
  "downtimeCheck.leases.*.downtimeMonths": "Downtime check, lease # months of downtime",
  "downtimeCheck.flatVacancy": ["Flat vacancy allowance", "pct"],
};

const STATUS: Record<RowStatus, string> = { lease: "Lease", holdover: "Holdover", "month-to-month": "Month-to-month", vacant: "Vacant" };
const share = (v: number | null) => (v === null ? "none" : pct(v, 1));
// A chance as the reader entered it: 62.5%, never rounded to a whole percent.
const asEntered = (p: number) => `${Math.round(p * 1e6) / 1e4}%`;
const signed = (x: number) => `${x > 0 ? "+" : ""}${usd(x, false)}`;

// The downtime check's totals, as cells. Shown only while the check is filled in and reads.
function checkCells(c: DowntimeCheck): Headline[] {
  const cells: Headline[] = [
    { label: "Expected rent lost to downtime", value: usd(c.expectedLoss, false), sub: "each lease's lost rent times the chance it does not renew" },
    { label: "Rent lost if no one renews", value: usd(c.lossIfNoneRenew, false), sub: "the same downtime with every chance of renewal at zero" },
    { label: "Potential rent over the hold", value: usd(c.potentialRent, false), sub: "today's in-place rent for every hold year, held flat" },
    { label: "Matching flat vacancy", value: c.equivalentFlatVacancy === null ? "none" : pct(c.equivalentFlatVacancy), sub: "takes out the same dollars as the expected loss" },
  ];
  if (c.flatVacancy !== null && c.flatAllowance !== null && c.difference !== null) {
    cells.push(
      { label: "Your flat allowance", value: asEntered(c.flatVacancy), sub: `${usd(c.flatAllowance, false)} of the same potential rent` },
      {
        label: "Flat allowance less expected loss",
        value: signed(c.difference),
        sub: c.difference > 0 ? "the flat figure covers more than the expected loss" : c.difference < 0 ? "the flat figure falls short of the expected loss" : "the two are equal",
      },
    );
  }
  return cells;
}

export function LeaseRolloverCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(LEASE_ROLLOVER_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New rows take ids past the worked example's.
  const nextKey = useRef(100);
  const rollNote = useId();
  const checkNote = useId();
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = leaseRolloverInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runLeaseRollover(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;
  const risk = atRisk(ui);
  const checking = started(ui, risk);

  const setRow = (i: number, p: Partial<RowUi>) => setUi((u) => ({ ...u, rows: u.rows.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const setOdds = (rowKey: number, p: Partial<OddsUi>) => setUi((u) => ({ ...u, odds: { ...u.odds, [rowKey]: { chance: null, months: null, ...u.odds[rowKey], ...p } } }));
  const addRow = () =>
    setUi((u) => ({
      ...u,
      rows: [
        ...u.rows,
        {
          key: nextKey.current++,
          tenant: `Tenant ${u.rows.length + 1}`,
          area: 10_000,
          annualRent: 100_000,
          leaseEnd: u.analysisDate && /^\d{4}-\d{2}-\d{2}$/.test(u.analysisDate) ? addYears(u.analysisDate, 3) : null,
          marketRentPerSf: null,
        },
      ],
    }));
  // The example check names rows of the example rent roll, so it is offered only while the roll is still that one.
  const exampleFits = JSON.stringify(input.rows) === EXAMPLE_ROWS && ui.analysisDate === LEASE_ROLLOVER_EXAMPLE.analysisDate && ui.holdYears === LEASE_ROLLOVER_EXAMPLE.holdYears;
  const loadExampleCheck = () => {
    const example = fromInput(LEASE_ROLLOVER_DOWNTIME_EXAMPLE);
    // the example's entries are keyed by row number; the form's rows carry their own ids
    setUi((u) => ({ ...u, odds: Object.fromEntries(u.rows.flatMap((row, i) => (example.odds[i] ? [[row.key, example.odds[i]]] : []))), flat: example.flat }));
    setFormKey((k) => k + 1);
  };
  const clearCheck = () => {
    setUi((u) => ({ ...u, odds: {}, flat: null }));
    setFormKey((k) => k + 1);
  };

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(LEASE_ROLLOVER_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup title="Read as of">
          <DateField label="Analysis date" value={ui.analysisDate} onChange={(v) => setUi((u) => ({ ...u, analysisDate: v }))} hint="terms run from this day" issue={issues.get("analysisDate")} />
          <NumberField label="Hold" kind="int" unit="years" value={ui.holdYears} onChange={(v) => setUi((u) => ({ ...u, holdYears: v }))} hint="from the analysis date" issue={issues.get("holdYears")} />
        </FieldGroup>

        {/* What every row's cells take is said here once; each cell names this note, so a row carries no hints of its own. */}
        <FieldGroup
          title="Rent roll"
          noteId={rollNote}
          note="Vacant space: base rent 0 and a blank lease end. Month-to-month: rent and a blank lease end. Market rent: the same expense basis as the base rent; blank if not known. Rows with the same tenant name count as one tenant."
          action={ui.rows.length < MAX_ROWS ? <FormAction onClick={addRow}>Add a row</FormAction> : undefined}
        >
          {ui.rows.map((x, i) => (
            <div key={x.key} className="calc-set">
              <GroupRow
                action={
                  ui.rows.length > 1 ? (
                    <FormAction tone="faint" label={`Remove row ${i + 1}`} onClick={() => setUi((u) => ({ ...u, rows: u.rows.filter((_, j) => j !== i) }))}>
                      Remove
                    </FormAction>
                  ) : undefined
                }
              >
                Row {i + 1}
              </GroupRow>
              <TextField label="Tenant" value={x.tenant} onChange={(v) => setRow(i, { tenant: v })} issue={issues.get(`rows.${i}.tenant`)} />
              <NumberField label="Area" kind="int" unit="SF" step={500} value={x.area} onChange={(v) => setRow(i, { area: v })} issue={issues.get(`rows.${i}.area`)} />
              <NumberField
                label="Base rent"
                kind="money"
                prefix="$"
                unit="/yr"
                step={5000}
                value={x.annualRent}
                onChange={(v) => setRow(i, { annualRent: v })}
                describedBy={rollNote}
                issue={issues.get(`rows.${i}.annualRent`)}
              />
              <DateField label="Lease end" value={x.leaseEnd} onChange={(v) => setRow(i, { leaseEnd: v })} describedBy={rollNote} issue={issues.get(`rows.${i}.leaseEnd`)} />
              <NumberField
                label="Market rent"
                kind="money"
                prefix="$"
                unit="/SF/yr"
                step={0.25}
                optional
                value={x.marketRentPerSf}
                onChange={(v) => setRow(i, { marketRentPerSf: v })}
                describedBy={rollNote}
                issue={issues.get(`rows.${i}.marketRentPerSf`)}
                wide
              />
            </div>
          ))}
        </FieldGroup>

        <FieldGroup
          fold
          open={checking}
          title="Check a flat vacancy allowance against rollover (optional)"
          noteId={checkNote}
          note="For each lease that expires in the hold, enter your own chance of renewal and the whole months the space would sit empty if the tenant leaves: there is no default for either. The check shows the rent those expirations put at risk and the flat vacancy that would match it. Leave it all blank to skip the check."
          action={
            checking ? (
              <FormAction tone="faint" onClick={clearCheck}>
                Clear the check
              </FormAction>
            ) : exampleFits ? (
              <FormAction icon="arrow-down" onClick={loadExampleCheck}>
                Load the example check
              </FormAction>
            ) : undefined
          }
        >
          {risk.length === 0 && <FormNote>No lease with rent expires inside the hold, so there is nothing to check.</FormNote>}
          <FormNote issue={issues.get("downtimeCheck.leases")} />
          {risk.map(({ index, row }, k) => (
            <div key={row.key} className="calc-set">
              <GroupRow>
                Row {index + 1}: {row.tenant}
              </GroupRow>
              <NumberField
                label="Chance of renewal"
                kind="pct"
                unit="%"
                step={5}
                value={ui.odds[row.key]?.chance ?? null}
                onChange={(v) => setOdds(row.key, { chance: v })}
                describedBy={checkNote}
                issue={checking ? issues.get(`downtimeCheck.leases.${k}.renewalProbability`) : undefined}
              />
              <NumberField
                label="Months of downtime"
                kind="int"
                unit="months"
                value={ui.odds[row.key]?.months ?? null}
                onChange={(v) => setOdds(row.key, { months: v })}
                describedBy={checkNote}
                issue={checking ? issues.get(`downtimeCheck.leases.${k}.downtimeMonths`) : undefined}
              />
            </div>
          ))}
          {risk.length > 0 && (
            <NumberField
              label="Flat vacancy allowance"
              kind="pct"
              unit="%"
              step={0.5}
              optional
              value={ui.flat}
              onChange={(v) => setUi((u) => ({ ...u, flat: v }))}
              hint="the flat share of potential rent you were going to use; blank skips the comparison"
              issue={issues.get("downtimeCheck.flatVacancy")}
              wide
            />
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
    problem: parsed.success ? null : { say: "Fix the inputs to read the rent roll.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = leaseRolloverFigures(d, r);
  const mark = new Map((r.markToMarket?.rows ?? []).map((m) => [m.row, m.difference]));
  const check = r.downtimeCheck;
  const flatGiven = check !== null && check.flatVacancy !== null;

  return (
    <CalcSheet
      {...sheet}
      headline={leaseRolloverHeadline(r)}
      lead={f.lead}
      cells={f.rest}
      figures={
        <>
          {r.totalRent > 0 && (
            <Drawing title="Where the in-place rent ends" note={`hold ends ${r.holdEnd}`}>
              <SplitBar segments={leaseRolloverSplit(r)} total={r.totalRent} totalLabel="in-place rent a year" title="In-place rent by when it expires" />
            </Drawing>
          )}
          {check && <CellsPart title="A flat vacancy allowance against rollover" note="on your own renewal chances and downtime" cells={checkCells(check)} />}
        </>
      }
    >
      <CalcSection id="schedule" title="What expires, year by year." note={`${count(r.buckets.length, "row")} · "Now" is month-to-month and holdover · the hold ends ${r.holdEnd}`}>
        <Schedule
          caption="Expirations by year, by area and by rent"
          columns={[{ head: "Year" }, { head: "Area SF" }, { head: "Area share" }, { head: "Rent" }, { head: "Rent share" }, { head: "Cumulative area" }, { head: "Cumulative rent" }, { head: "Tenants" }]}
          rows={r.buckets.map((b) => [
            b.label,
            num(b.area, 0),
            pct(b.areaShare, 1),
            usd(b.rent, false),
            share(b.rentShare),
            pct(b.cumulativeAreaShare, 1),
            share(b.cumulativeRentShare),
            // names as the reader typed them: words, whatever digits a name holds
            <>{b.tenants.length ? b.tenants.join(", ") : "none"}</>,
          ])}
        />
      </CalcSection>
      <CalcSection id="rent-roll" title="Each row, read as of the analysis date." note="Market less in-place: above zero means the rent is below market">
        <Schedule
          caption="Each row's status, term and rent against market"
          columns={[{ head: "Tenant" }, { head: "Status" }, { head: "Area SF" }, { head: "Rent $/SF" }, { head: "Ends" }, { head: "Term, yrs" }, { head: "Inside the hold" }, { head: "Market less in-place" }]}
          rows={r.rows.map((x, i) => [
            x.tenant,
            STATUS[x.status],
            num(x.area, 0),
            usd(x.rentPerSf),
            x.effectiveEnd ?? "none",
            x.remainingYears === null ? "none" : num(x.remainingYears, 2),
            x.status === "vacant" ? "none" : x.insideHold ? "yes" : "no",
            mark.has(i) ? usd(mark.get(i) ?? 0, false) : "not given",
          ])}
        />
      </CalcSection>
      {check && (
        <CalcSection id="downtime" title="The downtime check, by hold year and by lease." note="Rollover loss lands in the years leases expire, so a flat figure can be fine on average and short in one year">
          <div className="space-y-10">
            <div>
              <TableLabel>By hold year</TableLabel>
              <Schedule
                caption="Potential rent, expected loss and the flat allowance for each hold year"
                columns={[
                  { head: "Year" },
                  { head: "From" },
                  { head: "Until" },
                  { head: "Potential rent" },
                  { head: "Expected loss" },
                  { head: "Loss if none renew" },
                  { head: "Loss share" },
                  ...(flatGiven ? [{ head: "Flat allowance" }, { head: "Allowance less loss" }] : []),
                ]}
                rows={check.years.map((y) => [
                  y.year,
                  y.start,
                  y.end,
                  usd(y.potentialRent, false),
                  usd(y.expectedLoss, false),
                  usd(y.lossIfNoneRenew, false),
                  y.lossShare === null ? "none" : pct(y.lossShare),
                  ...(flatGiven ? [y.flatAllowance === null ? "none" : usd(y.flatAllowance, false), y.difference === null ? "none" : signed(y.difference)] : []),
                ])}
              />
            </div>
            <div>
              <TableLabel note="the vacant window each lease would leave, the days of it inside the hold, and the rent lost">By lease</TableLabel>
              <Schedule
                caption="Each expiring lease's renewal chance, downtime, vacant window and rent lost"
                columns={[
                  { head: "Tenant" },
                  { head: "Row" },
                  { head: "Rent a year" },
                  { head: "Chance of renewal" },
                  { head: "Downtime, months" },
                  { head: "Expires in the hold" },
                  { head: "Vacant from" },
                  { head: "New lease paying from" },
                  { head: "Days in the hold" },
                  { head: "Loss if vacated" },
                  { head: "Expected loss" },
                ]}
                rows={check.leases.map((l) => [
                  l.tenant,
                  l.row + 1,
                  usd(l.annualRent, false),
                  asEntered(l.renewalProbability),
                  l.downtimeMonths,
                  l.expiresInHold ? "yes" : "no",
                  l.vacancyStart ?? "none",
                  l.vacancyEnd ?? "none",
                  l.daysInHold,
                  usd(l.lossIfVacated, false),
                  usd(l.expectedLoss, false),
                ])}
              />
            </div>
          </div>
        </CalcSection>
      )}
      <CalcSection id="trace" title="Every formula it ran, in order." note="Terms are days ÷ 365">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
