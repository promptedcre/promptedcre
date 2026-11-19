import { z } from "zod";
import { defineModule } from "./module";
import { num, pct, type TraceLine, usd } from "./trace";

// Replacement reserves for a building's components: the straight-line reserve
// (cost today ÷ useful life) and what it is per square foot or per unit; then
// the replacements that fall inside a horizon, each priced at today's cost grown
// by inflation to its year, run against a reserve balance with a level yearly
// contribution, to find the first year the reserve runs short and the level
// contribution that never runs short.
// Conventions: years are whole years counted from today (year 1 is the coming
// year); a component is replaced in the year its age reaches its life, so its
// first replacement is in year max(1, life − age), and again every `life` years;
// year 1 is priced at today's cost and year t at (1 + inflation)^(t − 1) times it;
// the contribution and the spending both fall in the year and the balance is read
// at year end; the balance earns no interest. A null area or unit count means it
// was not given, and its per-figure is null. Nothing is rounded until it is shown.

export const MAX_COMPONENTS = 50;
export const MAX_HORIZON = 50;
// A year runs short when its year-end balance is below zero by half a cent or
// more, so a balance that is zero to the cent (floating-point dust at the level
// contribution) is not called a shortfall.
export const SHORT_BY = 0.005;

export const replacementReservesComponent = z
  .object({
    label: z.string().trim().min(1).max(80).describe('what the component is ("Roof", "HVAC units", "Paving")'),
    cost: z.number().min(0).describe("cost to replace the whole component today, dollars"),
    lifeYears: z.number().int().min(1).max(100).describe("useful life of a new component, whole years, 1 to 100"),
    ageYears: z
      .number()
      .int()
      .min(0)
      .max(200)
      .describe("the component's age today, whole years (age = life − remaining life); an age at or past its life means it is replaced in year 1"),
  })
  .strict();

export const replacementReservesInput = z
  .object({
    areaSf: z.number().positive().nullable().describe("rentable area, square feet, for the reserve per square foot; null if not given (give this, the unit count or both)"),
    units: z.number().int().positive().nullable().describe("number of units, for the reserve per unit; null if not given (give this, the area or both)"),
    components: z
      .array(replacementReservesComponent)
      .min(1)
      .max(MAX_COMPONENTS)
      .describe(`the building components, 1 to ${MAX_COMPONENTS}, each with its cost today, useful life and age`),
    inflation: z
      .number()
      .gt(-1)
      .max(1)
      .describe("yearly growth in replacement cost, a decimal (0.03 for 3%), more than -1 and at most 1; 0 keeps every cost at today's figure"),
    horizonYears: z.number().int().min(1).max(MAX_HORIZON).describe(`years to test the reserve over, whole years, 1 to ${MAX_HORIZON}`),
    startingBalance: z.number().min(0).describe("reserve balance today, dollars"),
    annualContribution: z.number().min(0).describe("amount added to the reserve each year, dollars a year"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.areaSf === null && d.units === null) {
      ctx.addIssue({ code: "custom", message: "give the area, the unit count or both", path: ["areaSf"] });
    }
  });

export type ReplacementReservesInput = z.infer<typeof replacementReservesInput>;
export type ReplacementReservesComponentInput = z.infer<typeof replacementReservesComponent>;

export type ComponentReserve = {
  label: string;
  cost: number;
  lifeYears: number;
  ageYears: number;
  // cost today ÷ useful life, dollars a year
  straightLine: number;
  // max(1, life − age): may fall after the horizon
  firstYear: number;
  // the years inside the horizon in which it is replaced (empty when none)
  replacementYears: number[];
};

export type Replacement = {
  year: number;
  // the component it replaces, counted from 0 in input order
  component: number;
  label: string;
  // cost today × (1 + inflation)^(year − 1)
  cost: number;
};

export type ReserveYear = {
  year: number;
  opening: number;
  contribution: number;
  spend: number;
  closing: number;
  cumulativeSpend: number;
  // the year-end balance is below zero by SHORT_BY or more
  short: boolean;
};

export type ReplacementReservesResult = {
  components: ComponentReserve[];
  straightLine: number;
  straightLinePerSf: number | null;
  straightLinePerUnit: number | null;
  replacements: Replacement[];
  totalSpend: number;
  years: ReserveYear[];
  endingBalance: number;
  // the first year the year-end balance falls below zero by SHORT_BY or more, and that balance; null when it never does
  firstShortfall: { year: number; balance: number } | null;
  // the lowest year-end balance and the first year it occurs
  lowestBalance: { year: number; balance: number };
  // the level yearly contribution that never runs short over the horizon
  levelContribution: number;
  // the year whose cumulative spending sets it; null when it is zero
  levelBindingYear: number | null;
  levelPerSf: number | null;
  levelPerUnit: number | null;
  // level contribution less the contribution given, floored at zero
  contributionGap: number;
  trace: TraceLine[];
};

const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

// A reserve per square foot: three decimals, since a reserve is often under a dollar.
export function perSfUsd(n: number): string {
  return `$${num(n, 3)}`;
}

// A balance in dollars and cents; one within half a cent of zero is written $0.00, never -$0.00.
export function balanceUsd(n: number, cents = true): string {
  return usd(Math.abs(n) < SHORT_BY ? 0 : n, cents);
}

export function runReplacementReserves(raw: ReplacementReservesInput): ReplacementReservesResult {
  const d = replacementReservesInput.parse(raw);
  const trace: TraceLine[] = [];
  const H = d.horizonYears;

  // 1. Straight-line reserve per component, the total, and per square foot and per unit.
  const components: ComponentReserve[] = d.components.map((c) => {
    const firstYear = Math.max(1, c.lifeYears - c.ageYears);
    const replacementYears: number[] = [];
    for (let t = firstYear; t <= H; t += c.lifeYears) replacementYears.push(t);
    return { label: c.label, cost: c.cost, lifeYears: c.lifeYears, ageYears: c.ageYears, straightLine: c.cost / c.lifeYears, firstYear, replacementYears };
  });
  for (const c of components) {
    trace.push({ label: `${c.label}: straight-line reserve`, formula: `${usd(c.cost)} ÷ ${yrs(c.lifeYears)}`, value: `${usd(c.straightLine)}/yr` });
  }
  const straightLine = components.reduce((s, c) => s + c.straightLine, 0);
  trace.push({
    label: "Straight-line reserve, total",
    formula: `sum over ${components.length} ${components.length === 1 ? "component" : "components"}`,
    value: `${usd(straightLine)}/yr`,
  });
  const straightLinePerSf = d.areaSf === null ? null : straightLine / d.areaSf;
  const straightLinePerUnit = d.units === null ? null : straightLine / d.units;
  if (straightLinePerSf !== null && d.areaSf !== null) {
    trace.push({ label: "Straight-line reserve per square foot", formula: `${usd(straightLine)} ÷ ${num(d.areaSf, 0)} SF`, value: `${perSfUsd(straightLinePerSf)}/SF/yr` });
  }
  if (straightLinePerUnit !== null && d.units !== null) {
    trace.push({ label: "Straight-line reserve per unit", formula: `${usd(straightLine)} ÷ ${num(d.units, 0)} units`, value: `${usd(straightLinePerUnit)}/unit/yr` });
  }

  // 2. When each component is replaced inside the horizon.
  for (const c of components) {
    trace.push({
      label: `${c.label}: replaced in`,
      formula: `first year max(1, ${c.lifeYears} − ${c.ageYears}) = ${c.firstYear}, then every ${yrs(c.lifeYears)}, through year ${H}`,
      value: c.replacementYears.length ? c.replacementYears.map((t) => `year ${t}`).join(", ") : `none inside ${yrs(H)}`,
    });
  }

  // 3. Each replacement priced at today's cost grown to its year.
  const replacements: Replacement[] = [];
  components.forEach((c, i) => {
    for (const t of c.replacementYears) replacements.push({ year: t, component: i, label: c.label, cost: c.cost * (1 + d.inflation) ** (t - 1) });
  });
  replacements.sort((a, b) => a.year - b.year || a.component - b.component);
  for (const x of replacements) {
    trace.push({
      label: `${x.label}, year ${x.year}: cost`,
      formula: `${usd(components[x.component]?.cost ?? 0)} × (1 + ${pct(d.inflation)})^(${x.year} − 1)`,
      value: usd(x.cost),
    });
  }
  const totalSpend = replacements.reduce((s, x) => s + x.cost, 0);
  trace.push({
    label: `Replacement spending over ${yrs(H)}`,
    formula: replacements.length ? `sum of ${replacements.length} ${replacements.length === 1 ? "replacement" : "replacements"}` : "no replacement falls inside the horizon",
    value: usd(totalSpend),
  });

  // 4. The reserve balance, year by year: opening + contribution − spending.
  const spendIn = new Array<number>(H + 1).fill(0);
  for (const x of replacements) spendIn[x.year] = (spendIn[x.year] ?? 0) + x.cost;
  const years: ReserveYear[] = [];
  let balance = d.startingBalance;
  let cumulative = 0;
  for (let t = 1; t <= H; t++) {
    const spend = spendIn[t] ?? 0;
    const opening = balance;
    balance = opening + d.annualContribution - spend;
    cumulative += spend;
    years.push({ year: t, opening, contribution: d.annualContribution, spend, closing: balance, cumulativeSpend: cumulative, short: balance <= -SHORT_BY });
    trace.push({ label: `Balance, end of year ${t}`, formula: `${balanceUsd(opening)} + ${usd(d.annualContribution)} − ${usd(spend)}`, value: balanceUsd(balance) });
  }
  const endingBalance = balance;

  // 5. The first year it runs short, and the lowest balance.
  const short = years.find((y) => y.short);
  const firstShortfall = short ? { year: short.year, balance: short.closing } : null;
  trace.push({
    label: "First year the reserve runs short",
    formula: short ? "the first year-end balance below zero by half a cent or more" : `no year-end balance falls below zero over ${yrs(H)}`,
    value: short ? `year ${short.year}, ${usd(short.closing)}` : "none",
  });
  let low = years[0] as ReserveYear;
  for (const y of years) if (y.closing < low.closing) low = y;
  const lowestBalance = { year: low.year, balance: low.closing };
  trace.push({ label: "Lowest year-end balance", formula: `lowest over ${yrs(H)}, the first year it occurs`, value: `year ${low.year}, ${balanceUsd(low.closing)}` });

  // 6. The level contribution that never runs short: the most any year's
  //    cumulative spending, less the starting balance, asks for per year so far.
  let levelContribution = 0;
  let levelBindingYear: number | null = null;
  for (const y of years) {
    const need = (y.cumulativeSpend - d.startingBalance) / y.year;
    if (need > levelContribution) {
      levelContribution = need;
      levelBindingYear = y.year;
    }
  }
  const bind = levelBindingYear === null ? null : years[levelBindingYear - 1];
  trace.push({
    label: "Level contribution that never runs short",
    formula: bind
      ? `max over years t of (spending through t − starting balance) ÷ t, set by year ${bind.year}: (${usd(bind.cumulativeSpend)} − ${usd(d.startingBalance)}) ÷ ${bind.year}`
      : `spending through any year never exceeds the starting balance of ${usd(d.startingBalance)}`,
    value: `${usd(levelContribution)}/yr`,
  });
  const levelPerSf = d.areaSf === null ? null : levelContribution / d.areaSf;
  const levelPerUnit = d.units === null ? null : levelContribution / d.units;
  if (levelPerSf !== null && d.areaSf !== null) {
    trace.push({ label: "Level contribution per square foot", formula: `${usd(levelContribution)} ÷ ${num(d.areaSf, 0)} SF`, value: `${perSfUsd(levelPerSf)}/SF/yr` });
  }
  if (levelPerUnit !== null && d.units !== null) {
    trace.push({ label: "Level contribution per unit", formula: `${usd(levelContribution)} ÷ ${num(d.units, 0)} units`, value: `${usd(levelPerUnit)}/unit/yr` });
  }
  const contributionGap = Math.max(0, levelContribution - d.annualContribution);
  trace.push({
    label: "Added contribution needed",
    formula: `max(0, ${usd(levelContribution)} − ${usd(d.annualContribution)} given)`,
    value: `${usd(contributionGap)}/yr`,
  });

  return {
    components,
    straightLine,
    straightLinePerSf,
    straightLinePerUnit,
    replacements,
    totalSpend,
    years,
    endingBalance,
    firstShortfall,
    lowestBalance,
    levelContribution,
    levelBindingYear,
    levelPerSf,
    levelPerUnit,
    contributionGap,
    trace,
  };
}

// A made-up building with round, made-up figures: five components, one already
// past its life, one at it, one replaced twice inside the horizon, and the roof
// at the end. Lives, costs, inflation and balances are examples, not standards.
export const REPLACEMENT_RESERVES_EXAMPLE: ReplacementReservesInput = {
  areaSf: 60_000,
  units: null,
  components: [
    { label: "Roof", cost: 300_000, lifeYears: 25, ageYears: 15 },
    { label: "HVAC units", cost: 120_000, lifeYears: 15, ageYears: 15 },
    { label: "Paving", cost: 90_000, lifeYears: 12, ageYears: 5 },
    { label: "Dock levelers", cost: 30_000, lifeYears: 10, ageYears: 12 },
    { label: "Exterior paint", cost: 50_000, lifeYears: 5, ageYears: 2 },
  ],
  inflation: 0.03,
  horizonYears: 10,
  startingBalance: 150_000,
  annualContribution: 40_000,
};

export const replacementReservesModule = defineModule({ id: "replacement-reserves", input: replacementReservesInput, run: runReplacementReserves, example: REPLACEMENT_RESERVES_EXAMPLE });
