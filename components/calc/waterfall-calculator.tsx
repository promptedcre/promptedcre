"use client";

import { useId, useRef, useState } from "react";
import { multiple, pct, usd } from "@/lib/calculators/trace";
import { BREAK_EVEN_MAX_FACTOR, runWaterfall, WATERFALL_EXAMPLE, waterfallInput, type BreakEvenPoint, type WaterfallInput } from "@/lib/calculators/waterfall";
import { count, issueMap, parseCash } from "./format";
import { CashField, CheckField, FieldGroup, FormAction, GroupRow, InputsPanel, NumberField, SelectField, TextField, type FixLabels } from "./fields";
import { Drawing, FillKey, SplitBar, WaterfallLadder } from "./figures";
import { CalcSheet, useHeld } from "./sheet";
import { waterfallCells, waterfallHeadline, waterfallLead, waterfallSplit, waterfallTiers } from "./shape";
import { CalcSection, Schedule, TableLabel, TraceView, type SheetSlots } from "./trace-view";

type Tier = WaterfallInput["tiers"][number];
// key: a stable id for the row, so removing one row never hands its text to the next.
type DealUi = { key: number; name: string; capital: number | null; cash: string };
type Ui = Omit<WaterfallInput, "deals" | "catchUp"> & {
  deals: DealUi[];
  tierKeys: number[];
  catchUpOn: boolean;
  catchUp: { sponsorShare: number | null; targetShareOfProfit: number | null };
};

const fromInput = (w: WaterfallInput): Ui => ({
  ...w,
  deals: w.deals.map((d, i) => ({ key: i, name: d.name, capital: d.contributions[0] ?? 0, cash: d.distributions.slice(1).join(", ") })),
  tierKeys: w.tiers.map((_, i) => i),
  catchUpOn: w.catchUp !== null,
  catchUp: { sponsorShare: w.catchUp?.sponsorShare ?? 1, targetShareOfProfit: w.catchUp?.targetShareOfProfit ?? 0.2 },
});

const toInput = (u: Ui): WaterfallInput => ({
  order: u.order,
  sponsorCoInvestPct: u.sponsorCoInvestPct,
  pref: u.pref,
  tiers: u.tiers,
  residualInvestorShare: u.residualInvestorShare,
  catchUp: u.catchUpOn
    ? { sponsorShare: u.catchUp.sponsorShare ?? Number.NaN, targetShareOfProfit: u.catchUp.targetShareOfProfit ?? Number.NaN }
    : null,
  deals: u.deals.map((d) => ({
    name: d.name,
    contributions: [d.capital ?? Number.NaN],
    distributions: [0, ...parseCash(d.cash)],
  })),
});

const n = (v: number | null) => v ?? Number.NaN;

// A difference between two rates, in percentage points: 0.0125 is "1.25 points".
const points = (v: number) => `${pct(v).slice(0, -1)} points`;

// A step on every deal's final-year cash, as a row head. The row at 0 is the result above.
const stepLabel = (step: number) => (step === 0 ? "As entered" : `${step > 0 ? "+" : "−"}${Math.abs(step)}%`);

// Where a break-even falls, said in final-year cash. `entered` is the final-year cash as entered,
// `contributed` all the capital put in.
function breakEvenText(point: BreakEvenPoint | null, entered: number, contributed: number): string {
  if (!(contributed > 0)) return "not stated, because no capital was put in.";
  if (!(entered > 0)) return "not stated, because no deal has final-year cash to move.";
  if (point === null) return `not reached at up to ${BREAK_EVEN_MAX_FACTOR} times the ${usd(entered, false)} of final-year cash entered.`;
  if (point.factor === 0) return "with no final-year cash at all: the earlier years already cover it.";
  return `at ${usd(point.finalCash, false)} of final-year cash, ${pct(point.factor, 0)} of the ${usd(entered, false)} entered.`;
}

// The worked example as the form writes it back, to tell when an input has changed.
const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(WATERFALL_EXAMPLE)));

const LABELS: FixLabels = {
  "deals.*.name": "Deal # name",
  "deals.*.contributions.*": ["Deal # capital at closing", "money"],
  "deals.*.distributions": "Deal # cash by year",
  "deals.*.distributions.*": ["Deal # cash by year", "money"],
  sponsorCoInvestPct: ["Operator co-invest", "pct"],
  "pref.rate": ["Pref rate", "pct"],
  catchUp: "Catch-up",
  "catchUp.sponsorShare": ["Catch-up to the operator", "pct"],
  "catchUp.targetShareOfProfit": ["Catch-up target share of profit", "pct"],
  "tiers.*.hurdle": "Tier # hurdle",
  "tiers.*.investorShare": ["Tier # share to investors", "pct"],
  residualInvestorShare: ["Above the last hurdle, to investors", "pct"],
};

export function WaterfallCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(WATERFALL_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New rows take ids past the worked example's.
  const nextKey = useRef(100);
  const tiersNote = useId();
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = waterfallInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { data: parsed.data, r: runWaterfall(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const setTier = (i: number, t: Partial<Tier>) => setUi((p) => ({ ...p, tiers: p.tiers.map((x, j) => (j === i ? { ...x, ...t } : x)) }));
  const setDeal = (i: number, d: Partial<DealUi>) => setUi((p) => ({ ...p, deals: p.deals.map((x, j) => (j === i ? { ...x, ...d } : x)) }));
  const cashIssue = (i: number) => [...issues.entries()].find(([k]) => k.startsWith(`deals.${i}.distributions`))?.[1];

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(WATERFALL_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        <FieldGroup
          title="Deals"
          action={
            ui.deals.length < 3 ? (
              <FormAction
                onClick={() =>
                  setUi((p) => ({
                    ...p,
                    deals: [...p.deals, { key: nextKey.current++, name: `Deal ${p.deals.length + 1}`, capital: 500_000, cash: "25000, 25000, 25000, 25000, 650000" }],
                  }))
                }
              >
                Add a deal
              </FormAction>
            ) : undefined
          }
        >
          {ui.deals.map((d, i) => (
            <div key={d.key} className="calc-set">
              <GroupRow
                action={
                  ui.deals.length > 1 ? (
                    <FormAction tone="faint" label={`Remove deal ${i + 1}`} onClick={() => setUi((p) => ({ ...p, deals: p.deals.filter((_, j) => j !== i) }))}>
                      Remove
                    </FormAction>
                  ) : undefined
                }
              >
                Deal {i + 1}
              </GroupRow>
              <TextField label="Name" value={d.name} onChange={(v) => setDeal(i, { name: v })} issue={issues.get(`deals.${i}.name`)} />
              <NumberField label="Capital at closing" kind="money" prefix="$" step={50000} value={d.capital} onChange={(v) => setDeal(i, { capital: v })} issue={issues.get(`deals.${i}.contributions.0`)} />
              <CashField label="Cash to distribute, by year" value={d.cash} onChange={(v) => setDeal(i, { cash: v })} hint="year 1 first, separated by commas" issue={cashIssue(i)} />
            </div>
          ))}
          <SelectField
            label="Order"
            value={ui.order}
            options={[
              { value: "whole-fund", label: "Whole fund" },
              { value: "deal-by-deal", label: "Deal by deal" },
            ]}
            onChange={(v) => setUi((p) => ({ ...p, order: v }))}
            hint="whole fund pools the deals before any promote; deal by deal pays each on its own"
          />
          <NumberField
            label="Operator co-invest"
            kind="pct"
            unit="%"
            step={1}
            value={ui.sponsorCoInvestPct}
            onChange={(v) => setUi((p) => ({ ...p, sponsorCoInvestPct: n(v) }))}
            hint="share of the capital"
            issue={issues.get("sponsorCoInvestPct")}
          />
        </FieldGroup>

        <FieldGroup title="Preferred return">
          <NumberField label="Pref rate" kind="pct" unit="%/yr" value={ui.pref.rate} onChange={(v) => setUi((p) => ({ ...p, pref: { ...p.pref, rate: n(v) } }))} issue={issues.get("pref.rate")} />
          <SelectField
            label="Pref accrues"
            value={ui.pref.compounding}
            options={[
              { value: "compound", label: "Compounding" },
              { value: "simple", label: "Simple" },
            ]}
            onChange={(v) => setUi((p) => ({ ...p, pref: { ...p.pref, compounding: v } }))}
          />
          <CheckField label="Catch-up to the operator after the pref" checked={ui.catchUpOn} onChange={(v) => setUi((p) => ({ ...p, catchUpOn: v }))} />
          {ui.catchUpOn && (
            <>
              <NumberField
                label="Catch-up to the operator"
                kind="pct"
                unit="%"
                step={5}
                value={ui.catchUp.sponsorShare}
                onChange={(v) => setUi((p) => ({ ...p, catchUp: { ...p.catchUp, sponsorShare: v } }))}
                issue={issues.get("catchUp.sponsorShare") ?? issues.get("catchUp")}
              />
              <NumberField
                label="Until it has"
                kind="pct"
                unit="%"
                step={1}
                value={ui.catchUp.targetShareOfProfit}
                onChange={(v) => setUi((p) => ({ ...p, catchUp: { ...p.catchUp, targetShareOfProfit: v } }))}
                hint="of all profit"
                issue={issues.get("catchUp.targetShareOfProfit")}
              />
            </>
          )}
        </FieldGroup>

        <FieldGroup
          title="Promote tiers"
          noteId={tiersNote}
          note="Each tier runs up to its hurdle. The investors take their share of it; the rest is promote."
          action={
            ui.tiers.length < 3 ? (
              <FormAction
                onClick={() =>
                  setUi((p) => ({ ...p, tiers: [...p.tiers, { kind: "irr", hurdle: 0.15, investorShare: 0.7 }], tierKeys: [...p.tierKeys, nextKey.current++] }))
                }
              >
                Add a tier
              </FormAction>
            ) : undefined
          }
        >
          {ui.tiers.map((t, i) => (
            <div key={ui.tierKeys[i] ?? `tier-${i}`} className="calc-set">
              <GroupRow
                action={
                  <FormAction tone="faint" label={`Remove tier ${i + 1}`} onClick={() => setUi((p) => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i), tierKeys: p.tierKeys.filter((_, j) => j !== i) }))}>
                    Remove
                  </FormAction>
                }
              >
                Tier {i + 1}
              </GroupRow>
              <SelectField
                label="Hurdle on"
                value={t.kind}
                options={[
                  { value: "irr", label: "IRR" },
                  { value: "multiple", label: "Multiple" },
                ]}
                onChange={(v) => setTier(i, { kind: v, hurdle: v === "irr" ? 0.12 : 1.8 })}
              />
              <NumberField
                label="Up to"
                kind={t.kind === "irr" ? "pct" : "multiple"}
                unit={t.kind === "irr" ? "%" : "x"}
                step={t.kind === "irr" ? 0.5 : 0.05}
                value={t.hurdle}
                onChange={(v) => setTier(i, { hurdle: n(v) })}
                issue={issues.get(`tiers.${i}.hurdle`)}
              />
              <NumberField
                label="To investors"
                kind="pct"
                unit="%"
                step={5}
                value={t.investorShare}
                onChange={(v) => setTier(i, { investorShare: n(v) })}
                describedBy={tiersNote}
                issue={issues.get(`tiers.${i}.investorShare`)}
                wide
              />
            </div>
          ))}
          <NumberField
            label="Above the last hurdle, to investors"
            kind="pct"
            unit="%"
            step={5}
            value={ui.residualInvestorShare}
            onChange={(v) => setUi((p) => ({ ...p, residualInvestorShare: n(v) }))}
            describedBy={tiersNote}
            issue={issues.get("residualInvestorShare")}
            wide
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
    problem: parsed.success ? null : { say: "Fix the inputs to run the waterfall.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { data, r } = held;

  const irrText = (v: number | null) => (v === null ? "none" : pct(v));
  // A tier that is not in the deal (no catch-up) has no row; a tier that got no cash keeps its row.
  const tierRows = r.tierSplit.filter((_, i) => i !== 1 || data.catchUp !== null);
  const entered = r.outcomes.find((o) => o.step === 0)?.finalCash ?? 0;
  // With no co-investment there is no multiple to show: the column is left out and the table above says why.
  const hasCoInvest = r.sponsor.multiple !== null;

  return (
    <CalcSheet
      {...sheet}
      headline={waterfallHeadline(r)}
      lead={waterfallLead(r)}
      cells={waterfallCells(r)}
      figures={
        <>
          <Drawing
            title="Down the tiers"
            note={
              <FillKey
                items={[
                  ["solid", "to investors"],
                  ["light", "promote"],
                ]}
              />
            }
          >
            <WaterfallLadder tiers={waterfallTiers(data, r)} total={r.totals.cash} />
          </Drawing>
          <Drawing title="Where the cash went" note="by party">
            <SplitBar segments={waterfallSplit(r)} total={r.totals.cash} totalLabel="distributed" title="Cash by party" />
          </Drawing>
        </>
      }
    >
      <CalcSection id="schedule" title="Cash to each party, year by year." note={`${count(r.periods.length, "period")} · year 0 is closing`}>
        <Schedule
          caption="Cash by year"
          columns={[{ head: "Year" }, { head: "Capital in" }, { head: "Cash out" }, { head: "Investors" }, { head: "LP" }, { head: "Co-invest" }, { head: "Promote" }, { head: "Operator" }]}
          rows={r.periods.map((p) => [
            p.year,
            p.contribution ? usd(p.contribution, false) : "",
            usd(p.cash, false),
            usd(p.toInvestors, false),
            usd(p.lp, false),
            usd(p.sponsorCoInvest, false),
            usd(p.promote, false),
            usd(p.sponsorTotal, false),
          ])}
        />
      </CalcSection>
      <CalcSection id="promote" title="The same cash before and after the promote." note="Fees are outside this calculator: enter cash after any fees the deal pays">
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
          <div className="min-w-0">
            <TableLabel note="the gap is what the promote takes">Return on the same cash</TableLabel>
            <Schedule
              caption="Return on all the cash before the promote, the investors' return after it, and the gap"
              columns={[{ head: "Return" }, { head: "IRR" }, { head: "Multiple" }]}
              rows={[
                ["Before the promote", irrText(r.beforePromote.irr), multiple(r.beforePromote.multiple)],
                ["To investors, after the promote", irrText(r.investorIrr), multiple(r.investorMultiple)],
                ["Gap", r.beforePromote.irrGap === null ? "not stated" : points(r.beforePromote.irrGap), multiple(r.beforePromote.multipleGap)],
              ]}
            />
            {r.beforePromote.irrGap === null && (
              <p className="type-body-s m-0 mt-3 text-faint">No gap in IRR is stated when capital is called after cash was paid out, or when a return has no IRR: compare the multiples.</p>
            )}
          </div>
          <div className="min-w-0">
            <TableLabel note="the operator is the sponsor in the playbooks">The operator&apos;s side</TableLabel>
            <Schedule
              caption="What the operator put in beside the investors and what came back, in dollars and as a multiple"
              columns={[{ head: "Operator" }, { head: "Amount" }]}
              rows={[
                ["Put in beside the investors", usd(r.sponsor.contributed, false)],
                ["Back on that co-investment", usd(r.sponsor.coInvestCash, false)],
                ["Promote", usd(r.sponsor.promote, false)],
                ["In all", usd(r.sponsor.total, false)],
                ["In all, as a multiple of what it put in", r.sponsor.multiple === null ? "none: nothing put in" : `${multiple(r.sponsor.multiple)} on ${usd(r.sponsor.contributed, false)}`],
              ]}
            />
          </div>
        </div>
      </CalcSection>
      <CalcSection id="tiers" title="Each tier's cash, by party." note={`${count(tierRows.length, "tier")} · investors are all contributed capital, the co-investment included`}>
        <Schedule
          caption="Cash in each tier, split between the investors and the promote"
          columns={[{ head: "Tier" }, { head: "Cash" }, { head: "To investors" }, { head: "Promote" }]}
          total
          rows={[
            ...tierRows.map((t) => [t.label, usd(t.cash, false), usd(t.toInvestors, false), usd(t.promote, false)]),
            ["All tiers", usd(r.totals.cash, false), usd(r.totals.toInvestors, false), usd(r.totals.promote, false)],
          ]}
        />
      </CalcSection>
      <CalcSection id="endings" title="The same deal at other endings." note="Final-year cash moved, every earlier year unchanged · arithmetic steps, not a forecast or a market level">
        <Schedule
          caption="Investor and operator results with every deal's final-year cash moved from 100 percent lower to 50 percent higher"
          columns={[
            { head: "Final-year cash" },
            { head: "In dollars" },
            { head: "Investor multiple" },
            { head: "Investor IRR" },
            { head: "Promote" },
            { head: "Operator, in all" },
            ...(hasCoInvest ? [{ head: "Operator multiple" }] : []),
          ]}
          rows={r.outcomes.map((o) => [
            stepLabel(o.step),
            usd(o.finalCash, false),
            multiple(o.investorMultiple),
            irrText(o.investorIrr),
            usd(o.promote, false),
            usd(o.sponsorTotal, false),
            ...(hasCoInvest ? [o.sponsorMultiple === null ? "none" : multiple(o.sponsorMultiple)] : []),
          ])}
        />
        <ul className="type-body-s measure m-0 mt-6 list-none space-y-2 p-0 text-muted">
          <li>
            <span className="text-text">Investors first have their capital back</span> {breakEvenText(r.breakEven.capitalBack, entered, r.totals.contributed)}
          </li>
          <li>
            <span className="text-text">The preferred return is first paid in full</span> {breakEvenText(r.breakEven.prefPaid, entered, r.totals.contributed)}
            {data.order === "deal-by-deal" && " Deal by deal, that is every deal's own preferred return; capital back counts all the deals together."}
          </li>
          <li>
            <span className="text-text">In whole-fund order with deals that end in different years,</span> a better ending can pay the investors less in all: more cash from the deal that
            ends first leaves less preferred return to accrue, so more of the later cash is shared with the promote. The promote can fall too, when the earlier cash narrows a tier it
            shares in. Each point above is then the first one met as final-year cash rises, found on a walk in steps of 1/64 of the cash entered, so a narrower stretch can be missed and a
            still better ending can lose it again.
          </li>
        </ul>
      </CalcSection>
      <CalcSection id="trace" title="Every tier and total, in order." note="Hurdles measured on the investor class · “sponsor” in these lines is the operator">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
