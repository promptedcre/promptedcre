"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { SCENARIO_RISK_EXAMPLE, scenarioRiskInput, runScenarioRisk, type OptionStats, type ScenarioRiskInput } from "@/lib/calculators/scenario-risk";
import { num, pct } from "@/lib/calculators/trace";
import { count, issueMap } from "./format";
import { CheckField, FieldGroup, FormAction, FormNote, GroupRow, InputsPanel, NumberField, TextField, type FixLabels } from "./fields";
import { Words } from "./figures";
import { scenarioRiskFigures, scenarioRiskHeadline } from "./scenario-risk-info";
import { CalcSheet, useHeld } from "./sheet";
import { CalcSection, Schedule, TableLabel, TraceView, type SheetSlots } from "./trace-view";

// key: a stable id for the row, so removing one scenario never hands its text to the next.
type ScenarioUi = { key: number; label: string; probability: number | null; ret: number | null };
type OptionUi = { name: string; scenarios: ScenarioUi[] };
type Side = "a" | "b";
type Ui = { a: OptionUi; b: OptionUi; compare: boolean; threshold: number | null };

const MAX_SCENARIOS = 10;
const PATH: Record<Side, "optionA" | "optionB"> = { a: "optionA", b: "optionB" };

const optionUi = (o: ScenarioRiskInput["optionA"], base: number): OptionUi => ({
  name: o.name,
  scenarios: o.scenarios.map((s, i) => ({ key: base + i, label: s.label, probability: s.probability, ret: s.return })),
});

// A second option to start from when the worked example has none: blanks, not figures.
const BLANK_B: OptionUi = { name: "Option B", scenarios: [{ key: 50, label: "Base case", probability: 1, ret: null }] };

const fromInput = (d: ScenarioRiskInput): Ui => ({
  a: optionUi(d.optionA, 0),
  b: d.optionB ? optionUi(d.optionB, 20) : BLANK_B,
  compare: d.optionB !== null,
  threshold: d.threshold,
});

const toOption = (o: OptionUi): ScenarioRiskInput["optionA"] => ({
  name: o.name,
  scenarios: o.scenarios.map((s) => ({ label: s.label, probability: s.probability ?? Number.NaN, return: s.ret ?? Number.NaN })),
});

const toInput = (u: Ui): ScenarioRiskInput => ({
  optionA: toOption(u.a),
  optionB: u.compare ? toOption(u.b) : null,
  threshold: u.threshold,
});

// The worked example as the form writes it back, to tell when an input has changed.
const EXAMPLE_KEY = JSON.stringify(toInput(fromInput(SCENARIO_RISK_EXAMPLE)));

const LABELS: FixLabels = {
  "optionA.name": "First option's name",
  "optionA.scenarios": "First option's probabilities",
  "optionA.scenarios.*.label": "First option, scenario # name",
  "optionA.scenarios.*.probability": ["First option, scenario # probability", "pct"],
  "optionA.scenarios.*.return": ["First option, scenario # return", "pct"],
  "optionB.name": "Second option's name",
  "optionB.scenarios": "Second option's probabilities",
  "optionB.scenarios.*.label": "Second option, scenario # name",
  "optionB.scenarios.*.probability": ["Second option, scenario # probability", "pct"],
  "optionB.scenarios.*.return": ["Second option, scenario # return", "pct"],
  threshold: ["Threshold return", "pct"],
};

// One option's measures, a row each, for the side-by-side table.
function measureRows(options: OptionStats[], threshold: number | null): ReactNode[][] {
  const row = (label: string, f: (o: OptionStats) => string) => [label, ...options.map(f)];
  return [
    row("Expected return", (o) => pct(o.expected)),
    row("Standard deviation", (o) => pct(o.sd)),
    row("Variance (decimal²)", (o) => num(o.variance, 6)),
    row("Coefficient of variation", (o) => (o.cv === null ? "not defined" : num(o.cv, 4))),
    row("Lowest return", (o) => pct(o.low)),
    row("Highest return", (o) => pct(o.high)),
    row("Expected less one standard deviation", (o) => pct(o.bandLow)),
    row("Expected plus one standard deviation", (o) => pct(o.bandHigh)),
    ...(threshold === null ? [] : [row(`Chance below ${pct(threshold)}`, (o) => (o.belowThreshold === null ? "" : pct(o.belowThreshold)))]),
    row("Scenarios", (o) => String(o.scenarios.length)),
  ];
}

export function ScenarioRiskCalculator({ tool, ...slots }: { tool?: string | null } & SheetSlots) {
  const [ui, setUi] = useState<Ui>(() => fromInput(SCENARIO_RISK_EXAMPLE));
  const [formKey, setFormKey] = useState(0);
  // New rows take ids past the worked example's.
  const nextKey = useRef(100);
  const noteIds = { a: useId(), b: useId() };
  const input = toInput(ui);
  const key = JSON.stringify(input);
  const parsed = scenarioRiskInput.safeParse(input);
  const held = useHeld(key, parsed.success ? { d: parsed.data, r: runScenarioRisk(parsed.data) } : null);
  const issues = issueMap(parsed.error);
  const changed = key !== EXAMPLE_KEY;

  const setOption = (side: Side, o: Partial<OptionUi>) => setUi((p) => ({ ...p, [side]: { ...p[side], ...o } }));
  const setScenario = (side: Side, i: number, s: Partial<ScenarioUi>) =>
    setUi((p) => ({ ...p, [side]: { ...p[side], scenarios: p[side].scenarios.map((x, j) => (j === i ? { ...x, ...s } : x)) } }));

  // One group an option. `lead` is drawn first in it (the second option's own switch); with
  // `on` false the group holds the switch alone, so "Second option" is on the form once.
  const optionGroup = (side: Side, title: string, lead?: ReactNode, on = true) => {
    const o = ui[side];
    const at = PATH[side];
    const sumIssue = issues.get(`${at}.scenarios`);
    if (!on) return <FieldGroup title={title}>{lead}</FieldGroup>;
    return (
      <FieldGroup
        title={title}
        noteId={noteIds[side]}
        note="Your own scenarios and odds: the probabilities sum to 100%. Returns are a year's, and may be negative."
        action={
          o.scenarios.length < MAX_SCENARIOS ? (
            <FormAction
              onClick={() =>
                setUi((p) => ({
                  ...p,
                  [side]: { ...p[side], scenarios: [...p[side].scenarios, { key: nextKey.current++, label: `Scenario ${p[side].scenarios.length + 1}`, probability: null, ret: null }] },
                }))
              }
            >
              Add a scenario
            </FormAction>
          ) : undefined
        }
      >
        {lead}
        <TextField label="Option name" value={o.name} onChange={(v) => setOption(side, { name: v })} issue={issues.get(`${at}.name`)} wide />
        {o.scenarios.map((s, i) => (
          <div key={s.key} className="calc-set">
            <GroupRow
              action={
                o.scenarios.length > 1 ? (
                  <FormAction tone="faint" label={`Remove scenario ${i + 1} of ${title.toLowerCase()}`} onClick={() => setOption(side, { scenarios: o.scenarios.filter((_, j) => j !== i) })}>
                    Remove
                  </FormAction>
                ) : undefined
              }
            >
              Scenario {i + 1}
            </GroupRow>
            <TextField label="Name" value={s.label} onChange={(v) => setScenario(side, i, { label: v })} issue={issues.get(`${at}.scenarios.${i}.label`)} wide />
            <NumberField
              label="Probability"
              kind="pct"
              unit="%"
              step={5}
              value={s.probability}
              onChange={(v) => setScenario(side, i, { probability: v })}
              describedBy={noteIds[side]}
              issue={issues.get(`${at}.scenarios.${i}.probability`)}
            />
            <NumberField
              label="Return"
              kind="pct"
              unit="%"
              step={0.5}
              value={s.ret}
              onChange={(v) => setScenario(side, i, { ret: v })}
              describedBy={noteIds[side]}
              issue={issues.get(`${at}.scenarios.${i}.return`)}
            />
          </div>
        ))}
        <FormNote issue={sumIssue} />
      </FieldGroup>
    );
  };

  const inputs = (
    <InputsPanel
      changed={changed}
      onReset={() => {
        setUi(fromInput(SCENARIO_RISK_EXAMPLE));
        setFormKey((k) => k + 1);
      }}
    >
      <div key={formKey}>
        {optionGroup("a", "First option")}
        {optionGroup("b", "Second option", <CheckField label="Compare a second option" checked={ui.compare} onChange={(v) => setUi((p) => ({ ...p, compare: v }))} />, ui.compare)}
        <FieldGroup title="Threshold" note="A return you set yourself, such as the least you would accept. Leave it blank to skip.">
          <NumberField
            label="Threshold return"
            kind="pct"
            unit="%"
            step={0.5}
            optional
            value={ui.threshold}
            onChange={(v) => setUi((p) => ({ ...p, threshold: v }))}
            hint="the chance of a return below it"
            issue={issues.get("threshold")}
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
    problem: parsed.success ? null : { say: "Fix the inputs to weigh the scenarios.", issues: parsed.error.issues, labels: LABELS },
  };
  if (!held) return <CalcSheet {...sheet} headline={null} />;
  const { d, r } = held;

  const f = scenarioRiskFigures(d, r);

  return (
    <CalcSheet
      {...sheet}
      headline={scenarioRiskHeadline(r)}
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
      <CalcSection id="measures" title={r.options.length === 1 ? "The measures." : "The two options, side by side."} note="The standard deviation band describes spread, not odds">
        <Schedule
          caption={r.options.length === 1 ? "The option's measures" : "The two options' measures side by side"}
          columns={[{ head: "Measure" }, ...r.options.map((o) => ({ head: o.name }))]}
          rows={measureRows(r.options, r.threshold)}
        />
      </CalcSection>
      <CalcSection id="schedule" title="Each scenario, weighted." note={r.options.map((o) => `${o.name}: ${count(o.scenarios.length, "scenario")}`).join(" · ")}>
        <div className="space-y-10">
          {r.options.map((o) => (
            <div key={o.key}>
              <TableLabel note="the last row sums the weighted columns">{o.name}</TableLabel>
              <Schedule
                caption={`${o.name}: scenarios, weights and deviations`}
                columns={[
                  { head: "Scenario" },
                  { head: "Probability" },
                  { head: "Return" },
                  { head: "Weighted return" },
                  { head: "Deviation" },
                  { head: "Weighted sq. deviation" },
                  ...(r.threshold === null ? [] : [{ head: `Below ${pct(r.threshold)}` }]),
                ]}
                total
                rows={[
                  ...o.scenarios.map((s) => [
                    s.label,
                    pct(s.probability),
                    pct(s.return),
                    pct(s.weightedReturn, 4),
                    pct(s.deviation),
                    num(s.weightedSquaredDeviation, 6),
                    ...(r.threshold === null ? [] : [s.belowThreshold ? "yes" : "no"]),
                  ]),
                  [
                    "All scenarios",
                    pct(o.probabilitySum),
                    "",
                    pct(o.expected, 4),
                    "",
                    num(o.variance, 6),
                    ...(r.threshold === null || o.belowThreshold === null ? [] : [pct(o.belowThreshold)]),
                  ],
                ]}
              />
            </div>
          ))}
        </div>
      </CalcSection>
      <CalcSection id="trace" title="Every formula it ran, in order." note="Population variance; weights as given">
        <TraceView lines={r.trace} tool={tool} />
      </CalcSection>
    </CalcSheet>
  );
}
