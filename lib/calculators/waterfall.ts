import { z } from "zod";
import { irr } from "./finance";
import { multiple, pct, type TraceLine, usd } from "./trace";

// A distribution waterfall between the investor class (all contributed capital,
// including any sponsor co-invest) and the sponsor's promote. Hurdles are
// measured on the investor class. Years are the period; capital comes in at
// year 0 unless a contributions list says otherwise.
//
// Fees are outside this calculator: distributable cash is entered after any fees
// the deal pays. Beside the split it reports the same cash before the promote,
// the sponsor's side in dollars, each tier's cash by party, the same deal at other
// final-year cash amounts, and two break-even points. Every rate, share and hurdle
// is an input; none is built in.

const tier = z
  .object({
    kind: z.enum(["irr", "multiple"]),
    hurdle: z.number().positive(), // 0.12 for a 12% IRR, 1.8 for a 1.8x multiple
    investorShare: z.number().gt(0).max(1), // share of this tier's cash to investors; the rest is promote
  })
  .strict();

const deal = z
  .object({
    name: z.string().min(1).max(40),
    contributions: z.array(z.number().min(0)).min(1), // by year, index 0 is closing
    distributions: z.array(z.number().min(0)).min(1), // distributable cash by year
  })
  .strict();

export const waterfallInput = z
  .object({
    order: z.enum(["deal-by-deal", "whole-fund"]),
    deals: z.array(deal).min(1).max(5),
    sponsorCoInvestPct: z.number().min(0).max(1).describe("sponsor share of the equity, decimal"),
    pref: z
      .object({
        rate: z.number().min(0).max(0.5).describe("preferred return, annual decimal, e.g. 0.08"),
        compounding: z.enum(["compound", "simple"]),
        investorShare: z.number().gt(0).max(1),
      })
      .strict(),
    catchUp: z
      .object({
        sponsorShare: z.number().gt(0).max(1), // share of catch-up cash to the sponsor
        targetShareOfProfit: z.number().gt(0).lt(1), // sponsor's target share of all profit
      })
      .strict()
      .nullable(),
    tiers: z.array(tier).max(4),
    residualInvestorShare: z.number().min(0).max(1),
  })
  .strict()
  .refine((d) => !d.catchUp || d.catchUp.sponsorShare > d.catchUp.targetShareOfProfit, {
    message: "the catch-up share must exceed the sponsor's target share",
    path: ["catchUp"],
  });

export type WaterfallInput = z.infer<typeof waterfallInput>;
type Cfg = Omit<WaterfallInput, "order" | "deals">;

export type WaterfallPeriod = {
  year: number;
  contribution: number;
  cash: number;
  toInvestors: number;
  promote: number;
  lp: number;
  sponsorCoInvest: number;
  sponsorTotal: number;
};

export type StreamResult = {
  periods: WaterfallPeriod[];
  tierCash: number[];
  tierToInvestors: number[]; // each tier's cash to the investor class
  tierPromote: number[]; // each tier's cash to the promote
  prefOwed: number; // first tier: capital and pref still owed after the last year
};

const EPS = 1e-7;

export function tierLabels(cfg: Cfg): string[] {
  const split = (s: number) => `${Math.round(s * 100)}/${Math.round((1 - s) * 100)}`;
  const labels = [`Return of capital and ${pct(cfg.pref.rate)} pref (${cfg.pref.compounding}), ${split(cfg.pref.investorShare)}`];
  labels.push(
    cfg.catchUp
      ? `Catch-up, ${Math.round(cfg.catchUp.sponsorShare * 100)}% to sponsor until it has ${pct(cfg.catchUp.targetShareOfProfit, 0)} of profit`
      : "Catch-up (none)",
  );
  for (const t of cfg.tiers) {
    labels.push(`Up to ${t.kind === "irr" ? `${pct(t.hurdle)} IRR` : multiple(t.hurdle)}, ${split(t.investorShare)}`);
  }
  labels.push(`Above the last hurdle, ${split(cfg.residualInvestorShare)}`);
  return labels;
}

export function runStream(contributions: number[], distributions: number[], cfg: Cfg): StreamResult {
  const years = Math.max(contributions.length, distributions.length);
  const r = cfg.pref.rate;
  const compound = cfg.pref.compounding === "compound";
  let prefAcc = 0; // compound: future value of contributions less investor cash, at the pref rate
  let unreturned = 0; // simple: capital not yet returned
  let unpaidPref = 0; // simple: accrued pref not yet paid
  const acc = cfg.tiers.map(() => 0); // IRR tiers: the same account at each hurdle rate
  let contribCum = 0;
  let investorCum = 0;
  let promoteCum = 0;
  const tierCash = new Array(cfg.tiers.length + 3).fill(0) as number[];
  const tierToInvestors = new Array(cfg.tiers.length + 3).fill(0) as number[];
  const tierPromote = new Array(cfg.tiers.length + 3).fill(0) as number[];
  const periods: WaterfallPeriod[] = [];

  const payInvestors = (amount: number) => {
    if (amount <= 0) return;
    if (compound) prefAcc -= amount;
    else {
      const toPref = Math.min(amount, unpaidPref);
      unpaidPref -= toPref;
      unreturned -= Math.min(amount - toPref, unreturned);
    }
    cfg.tiers.forEach((t, k) => {
      if (t.kind === "irr") acc[k] = (acc[k] ?? 0) - amount;
    });
    investorCum += amount;
  };
  const prefNeed = () => (compound ? Math.max(prefAcc, 0) : unpaidPref + unreturned);

  for (let t = 0; t < years; t += 1) {
    if (t > 0) {
      if (compound) prefAcc *= 1 + r;
      else unpaidPref += r * unreturned;
      cfg.tiers.forEach((tr, k) => {
        if (tr.kind === "irr") acc[k] = (acc[k] ?? 0) * (1 + tr.hurdle);
      });
    }
    const c = contributions[t] ?? 0;
    if (compound) prefAcc += c;
    else unreturned += c;
    cfg.tiers.forEach((tr, k) => {
      if (tr.kind === "irr") acc[k] = (acc[k] ?? 0) + c;
    });
    contribCum += c;

    const cash = distributions[t] ?? 0;
    let rem = cash;
    let inv = 0;
    let promo = 0;
    const take = (index: number, total: number, investorShare: number) => {
      const toInv = total * investorShare;
      payInvestors(toInv);
      promoteCum += total - toInv;
      inv += toInv;
      promo += total - toInv;
      tierCash[index] = (tierCash[index] ?? 0) + total;
      tierToInvestors[index] = (tierToInvestors[index] ?? 0) + toInv;
      tierPromote[index] = (tierPromote[index] ?? 0) + (total - toInv);
      rem -= total;
    };

    // 1. return of capital and pref
    const need1 = prefNeed();
    if (rem > EPS && need1 > EPS) take(0, Math.min(rem, need1 / cfg.pref.investorShare), cfg.pref.investorShare);

    // 2. catch-up, once the pref is met
    if (cfg.catchUp && rem > EPS && prefNeed() <= EPS) {
      const { sponsorShare: g, targetShareOfProfit: tau } = cfg.catchUp;
      const profit = investorCum + promoteCum - contribCum;
      const needX = (tau * profit - promoteCum) / (g - tau);
      if (needX > EPS) take(1, Math.min(rem, needX), 1 - g);
    }

    // 3. hurdle tiers
    cfg.tiers.forEach((tr, k) => {
      if (rem <= EPS) return;
      const need = tr.kind === "irr" ? Math.max(acc[k] ?? 0, 0) : Math.max(tr.hurdle * contribCum - investorCum, 0);
      if (need > EPS) take(2 + k, Math.min(rem, need / tr.investorShare), tr.investorShare);
    });

    // 4. everything above the last hurdle
    if (rem > EPS) take(cfg.tiers.length + 2, rem, cfg.residualInvestorShare);

    const co = cfg.sponsorCoInvestPct;
    periods.push({
      year: t,
      contribution: c,
      cash,
      toInvestors: inv,
      promote: promo,
      lp: inv * (1 - co),
      sponsorCoInvest: inv * co,
      sponsorTotal: inv * co + promo,
    });
  }
  return { periods, tierCash, tierToInvestors, tierPromote, prefOwed: prefNeed() };
}

function addPeriods(parts: StreamResult[], years: number): StreamResult {
  const periods: WaterfallPeriod[] = [];
  for (let t = 0; t < years; t += 1) {
    const sum = (key: keyof WaterfallPeriod) => parts.reduce((s, p) => s + (p.periods[t]?.[key] ?? 0), 0);
    periods.push({
      year: t,
      contribution: sum("contribution"),
      cash: sum("cash"),
      toInvestors: sum("toInvestors"),
      promote: sum("promote"),
      lp: sum("lp"),
      sponsorCoInvest: sum("sponsorCoInvest"),
      sponsorTotal: sum("sponsorTotal"),
    });
  }
  const tierCash = parts[0]?.tierCash.map((_, i) => parts.reduce((s, p) => s + (p.tierCash[i] ?? 0), 0)) ?? [];
  const addTier = (key: "tierToInvestors" | "tierPromote") => parts[0]?.[key].map((_, i) => parts.reduce((s, p) => s + (p[key][i] ?? 0), 0)) ?? [];
  // Deal by deal, each deal has its own first tier: what is still owed is the sum.
  const prefOwed = parts.reduce((s, p) => s + p.prefOwed, 0);
  return { periods, tierCash, tierToInvestors: addTier("tierToInvestors"), tierPromote: addTier("tierPromote"), prefOwed };
}

function runOrder(d: WaterfallInput, order: WaterfallInput["order"]): StreamResult {
  const years = Math.max(...d.deals.map((x) => Math.max(x.contributions.length, x.distributions.length)));
  if (order === "deal-by-deal") {
    return addPeriods(
      d.deals.map((x) => runStream(x.contributions, x.distributions, d)),
      years,
    );
  }
  const sumAt = (key: "contributions" | "distributions", t: number) => d.deals.reduce((s, x) => s + (x[key][t] ?? 0), 0);
  const contributions = Array.from({ length: years }, (_, t) => sumAt("contributions", t));
  const distributions = Array.from({ length: years }, (_, t) => sumAt("distributions", t));
  return runStream(contributions, distributions, d);
}

// The same deal at other endings: every deal's final-year cash (the last entry of
// its distributions) moved by these percents and the whole waterfall run again in
// the same order. Arithmetic steps for comparison, not forecasts and not market levels.
// All distributable cash rises with the step. For one deal, and deal by deal, so do
// investor cash and the promote. In whole-fund order with deals that end in different
// years they need not: more cash from the deal that ends first leaves less pref and
// less of each hurdle to accrue, the later cash is split differently, and a higher
// step can leave the investors, or the promote, with less.
export const OUTCOME_STEPS = [-100, -75, -50, -25, 0, 25, 50] as const;

// A break-even is looked for up to this multiple of the final-year cash entered.
export const BREAK_EVEN_MAX_FACTOR = 64;
// Where the search has to walk, it moves the factor upward in steps of this size: 1/64 of
// the final-year cash entered.
const BREAK_EVEN_STEP = 1 / 64;
// The search stops when the final-year cash is known this closely, in dollars.
const BREAK_EVEN_TOLERANCE = 0.001;
// A balance this small, in dollars, counts as paid.
const PAID = 1e-6;

export type WaterfallOutcome = {
  step: number; // percent change in every deal's final-year cash
  finalCash: number; // final-year cash after the step, summed over the deals
  cash: number; // all distributable cash
  investorMultiple: number;
  investorIrr: number | null;
  promote: number;
  sponsorTotal: number; // co-investment cash plus promote
  sponsorMultiple: number | null; // null when the sponsor contributed nothing
};

export type TierSplit = { label: string; cash: number; toInvestors: number; promote: number };

// A point on the scale of final-year cash: every deal's final-year cash times `factor`.
export type BreakEvenPoint = { factor: number; finalCash: number };

export type WaterfallResult = {
  periods: WaterfallPeriod[];
  tierLabels: string[];
  tierCash: number[];
  totals: { contributed: number; cash: number; toInvestors: number; promote: number; lp: number; sponsorTotal: number };
  investorIrr: number | null;
  investorMultiple: number;
  sponsorIrr: number | null;
  promoteShareOfProfit: number | null;
  alternative: { order: WaterfallInput["order"]; promote: number };
  // The same cash with no promote taken, and what the promote costs the investors.
  // irrGap is null when either IRR is, and when either yearly series changes sign more
  // than once (capital called after cash has been paid out), where an IRR is not unique.
  beforePromote: { irr: number | null; multiple: number; irrGap: number | null; multipleGap: number };
  // The sponsor's side in dollars and as a multiple of what it put in.
  sponsor: { contributed: number; coInvestCash: number; promote: number; total: number; multiple: number | null };
  tierSplit: TierSplit[]; // one row per tier label, in order
  outcomes: WaterfallOutcome[]; // one row per OUTCOME_STEPS entry; the row at 0 is this result
  // The first final-year cash, looking upward from zero, at which investors have their
  // capital back, and at which capital is back and nothing is owed in the first tier
  // (deal by deal: in any deal's first tier; capital back is measured on all capital
  // together in either order). Null when there is no final-year cash to scale, no
  // capital was contributed, or the point is not reached by BREAK_EVEN_MAX_FACTOR times
  // the cash entered. firstMet says how far "first" can be relied on.
  breakEven: { capitalBack: BreakEvenPoint | null; prefPaid: BreakEvenPoint | null };
  trace: TraceLine[];
};

const finalCashOf = (d: WaterfallInput) => d.deals.reduce((s, x) => s + (x.distributions[x.distributions.length - 1] ?? 0), 0);

// The same input with every deal's final-year cash multiplied by one factor.
// Contributions and every earlier year's cash are untouched.
function withFinalCash(d: WaterfallInput, factor: number): WaterfallInput {
  return {
    ...d,
    deals: d.deals.map((x) => ({ ...x, distributions: x.distributions.map((v, i) => (i === x.distributions.length - 1 ? v * factor : v)) })),
  };
}

function outcomeOf(step: number, finalCash: number, s: StreamResult, co: number): WaterfallOutcome {
  const sum = (key: keyof WaterfallPeriod) => s.periods.reduce((a, p) => a + p[key], 0);
  const contributed = sum("contribution");
  const sponsorTotal = sum("sponsorTotal");
  return {
    step,
    finalCash,
    cash: sum("cash"),
    investorMultiple: sum("toInvestors") / contributed,
    investorIrr: irr(s.periods.map((p) => p.toInvestors - p.contribution)),
    promote: sum("promote"),
    sponsorTotal,
    sponsorMultiple: co * contributed > 0 ? sponsorTotal / (co * contributed) : null,
  };
}

const capitalIsBack = (s: StreamResult) => s.periods.reduce((a, p) => a + p.toInvestors, 0) >= s.periods.reduce((a, p) => a + p.contribution, 0) - PAID;
const prefIsPaid = (s: StreamResult) => capitalIsBack(s) && s.prefOwed <= PAID;

// For one deal, and deal by deal, investor cash only rises and each first-tier balance
// only falls as the final-year cash grows: a deal's final-year cash is the last cash its
// own account sees. A break-even test that is met there stays met above.
const onlyRises = (d: WaterfallInput) => d.order === "deal-by-deal" || d.deals.length === 1;

// The first factor on every deal's final-year cash at which `met` holds, looking upward
// from `from`, up to BREAK_EVEN_MAX_FACTOR. `from` itself if it meets the test. Null
// when nothing tried does.
//
// Where the test stays met once met (onlyRises), the factor is found by bisection
// between `from` and the largest factor, and it is the least.
//
// In whole-fund order with several deals it need not stay met: when the deals end in
// different years, cash paid earlier lowers the pref owed later, and the test can be
// met, lost and met again as the factor rises. There the factor is walked upward on a
// fixed grid, every BREAK_EVEN_STEP, to the first step that meets the test, and placed
// by bisection between that step and the last factor tried below it.
// What the walk guarantees: the test fails at `from` and at every grid step between
// `from` and the factor returned, holds at the factor returned, and fails within
// BREAK_EVEN_TOLERANCE dollars of final-year cash below it. So the factor returned is
// the first crossing at the grid's resolution, 1/64 of the final-year cash entered.
// What it does not: a stretch that meets the test and lies wholly between two
// neighbouring grid steps is missed, and the test can fail again above the factor
// returned.
function firstMet(d: WaterfallInput, met: (s: StreamResult) => boolean, from: number): number | null {
  const at = (factor: number) => met(runOrder(withFinalCash(d, factor), d.order));
  if (at(from)) return from;
  let lo = from;
  let above: number | null = null; // a factor above `lo` that meets the test
  if (onlyRises(d)) {
    if (at(BREAK_EVEN_MAX_FACTOR)) above = BREAK_EVEN_MAX_FACTOR;
  } else {
    const steps = Math.round(BREAK_EVEN_MAX_FACTOR / BREAK_EVEN_STEP);
    for (let k = Math.floor(from / BREAK_EVEN_STEP) + 1; k <= steps && above === null; k += 1) {
      if (at(k * BREAK_EVEN_STEP)) above = k * BREAK_EVEN_STEP;
      else lo = k * BREAK_EVEN_STEP;
    }
  }
  if (above === null) return null;
  let hi: number = above;
  const base = finalCashOf(d);
  for (let i = 0; i < 100 && (hi - lo) * base > BREAK_EVEN_TOLERANCE; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function breakEvens(d: WaterfallInput, totals: { contributed: number; cash: number }): WaterfallResult["breakEven"] {
  const base = finalCashOf(d);
  // With no final-year cash to scale, or no capital to return, neither point is defined.
  if (!(base > 0) || !(totals.contributed > 0)) return { capitalBack: null, prefPaid: null };
  const point = (factor: number | null): BreakEvenPoint | null => (factor === null ? null : { factor, finalCash: finalCashOf(withFinalCash(d, factor)) });
  // Investors never get more than all the cash, so capital cannot be back below the
  // factor at which all the cash equals what was contributed. The search starts on the
  // grid, a step or more under that factor, and is not run when that start is out of range.
  const allCashCovers = (totals.contributed - (totals.cash - base)) / base;
  const start = Math.max(0, (Math.floor(allCashCovers / BREAK_EVEN_STEP) - 1) * BREAK_EVEN_STEP);
  const capital = start > BREAK_EVEN_MAX_FACTOR ? null : firstMet(d, capitalIsBack, start);
  // The pref is not paid until capital is back, so its search starts where that one ended.
  const pref = capital === null ? null : firstMet(d, prefIsPaid, capital);
  return { capitalBack: point(capital), prefPaid: point(pref) };
}

// How many times a yearly series changes sign, zeros skipped. With one change it has one IRR.
function signChanges(flows: number[]): number {
  let changes = 0;
  let last = 0;
  for (const v of flows) {
    const sign = Math.sign(v);
    if (sign === 0) continue;
    if (last !== 0 && sign !== last) changes += 1;
    last = sign;
  }
  return changes;
}

// A difference between two rates, in percentage points.
function points(n: number): string {
  const s = (n * 100).toFixed(2);
  return `${/^-0\.0+$/.test(s) ? s.slice(1) : s} points`;
}

export function runWaterfall(raw: WaterfallInput): WaterfallResult {
  const d = waterfallInput.parse(raw);
  const main = runOrder(d, d.order);
  const otherOrder = d.order === "deal-by-deal" ? "whole-fund" : "deal-by-deal";
  const other = runOrder(d, otherOrder);
  const sum = (key: keyof WaterfallPeriod) => main.periods.reduce((s, p) => s + p[key], 0);
  const totals = {
    contributed: sum("contribution"),
    cash: sum("cash"),
    toInvestors: sum("toInvestors"),
    promote: sum("promote"),
    lp: sum("lp"),
    sponsorTotal: sum("sponsorTotal"),
  };
  const co = d.sponsorCoInvestPct;
  const investorIrr = irr(main.periods.map((p) => p.toInvestors - p.contribution));
  const sponsorIrr = irr(main.periods.map((p) => p.sponsorTotal - p.contribution * co));
  const profit = totals.cash - totals.contributed;
  const labels = tierLabels(d);
  const otherPromote = other.periods.reduce((s, p) => s + p.promote, 0);

  const trace: TraceLine[] = labels
    .map((label, i) => ({ label, formula: "cash distributed in this tier", value: usd(main.tierCash[i] ?? 0) }))
    .filter((_, i) => (main.tierCash[i] ?? 0) > 0 || i === 0);
  trace.push(
    { label: "Investor IRR", formula: "IRR(contributions out, investor cash in)", value: investorIrr === null ? "n/a" : pct(investorIrr) },
    { label: "Investor multiple", formula: `${usd(totals.toInvestors)} ÷ ${usd(totals.contributed)}`, value: multiple(totals.toInvestors / totals.contributed) },
    { label: "Sponsor promote", formula: "sum of the sponsor's tier shares", value: usd(totals.promote) },
    {
      label: "Promote as a share of profit",
      formula: `${usd(totals.promote)} ÷ ${usd(profit)}`,
      value: profit > 0 ? pct(totals.promote / profit) : "n/a",
    },
    { label: `Promote if run ${otherOrder}`, formula: "same inputs, other order", value: usd(otherPromote) },
  );

  // The same cash with no promote taken. With nothing contributed the multiples here and
  // in the outcome rows divide by zero, as the investor multiple always has.
  const beforeFlows = main.periods.map((p) => p.cash - p.contribution);
  const beforeIrr = irr(beforeFlows);
  const beforeMultiple = totals.cash / totals.contributed;
  // The gap between the two IRRs is stated only when each series changes sign once. Then
  // each has one IRR, and the investors', who never get more than all the cash, is never
  // the higher. When capital is called after cash has been paid out, a series can have
  // more than one, the two rates need not be the same root, and their difference says
  // nothing; the multiples still compare.
  const oneIrrEach = signChanges(beforeFlows) <= 1 && signChanges(main.periods.map((p) => p.toInvestors - p.contribution)) <= 1;
  const irrGap = beforeIrr === null || investorIrr === null || !oneIrrEach ? null : beforeIrr - investorIrr;

  // The sponsor's side: what it put in beside the investors, and what came back.
  const sponsorContributed = co * totals.contributed;
  const sponsor = {
    contributed: sponsorContributed,
    coInvestCash: sum("sponsorCoInvest"),
    promote: totals.promote,
    total: totals.sponsorTotal,
    multiple: sponsorContributed > 0 ? totals.sponsorTotal / sponsorContributed : null,
  };

  const tierSplit: TierSplit[] = labels.map((label, i) => ({
    label,
    cash: main.tierCash[i] ?? 0,
    toInvestors: main.tierToInvestors[i] ?? 0,
    promote: main.tierPromote[i] ?? 0,
  }));

  const outcomes: WaterfallOutcome[] = OUTCOME_STEPS.map((step) => {
    if (step === 0) return outcomeOf(step, finalCashOf(d), main, co);
    const moved = withFinalCash(d, 1 + step / 100);
    return outcomeOf(step, finalCashOf(moved), runOrder(moved, d.order), co);
  });

  const breakEven = breakEvens(d, totals);

  trace.push(
    { label: "IRR before the promote", formula: "IRR(contributions out, all distributable cash in)", value: beforeIrr === null ? "n/a" : pct(beforeIrr) },
    {
      label: "Gap to the investor IRR",
      formula:
        beforeIrr === null || investorIrr === null
          ? "IRR before the promote − investor IRR"
          : oneIrrEach
            ? `${pct(beforeIrr)} − ${pct(investorIrr)}`
            : "not stated: capital is called after cash is paid out, so an IRR is not unique; compare the multiples",
      value: irrGap === null ? "n/a" : points(irrGap),
    },
    {
      label: "Final-year cash that returns the investors' capital",
      formula: `first final-year cash, looking upward from zero, at which investor cash reaches ${usd(totals.contributed)}, earlier years unchanged`,
      value: breakEven.capitalBack === null ? "n/a" : usd(breakEven.capitalBack.finalCash),
    },
    {
      label: "Final-year cash that pays the preferred return",
      formula: `first final-year cash, looking upward from zero, at which capital is back and nothing is owed in ${d.order === "deal-by-deal" ? "any deal's first tier" : "the first tier"}, earlier years unchanged`,
      value: breakEven.prefPaid === null ? "n/a" : usd(breakEven.prefPaid.finalCash),
    },
  );

  return {
    periods: main.periods,
    tierLabels: labels,
    tierCash: main.tierCash,
    totals,
    investorIrr,
    investorMultiple: totals.toInvestors / totals.contributed,
    sponsorIrr,
    promoteShareOfProfit: profit > 0 ? totals.promote / profit : null,
    alternative: { order: otherOrder, promote: otherPromote },
    beforePromote: { irr: beforeIrr, multiple: beforeMultiple, irrGap, multipleGap: beforeMultiple - totals.toInvestors / totals.contributed },
    sponsor,
    tierSplit,
    outcomes,
    breakEven,
    trace,
  };
}

export const WATERFALL_EXAMPLE: WaterfallInput = {
  order: "whole-fund",
  deals: [
    {
      name: "Example deal",
      contributions: [1_000_000],
      distributions: [0, 60_000, 60_000, 60_000, 60_000, 1_600_000],
    },
  ],
  sponsorCoInvestPct: 0.1,
  pref: { rate: 0.08, compounding: "compound", investorShare: 1 },
  catchUp: null,
  tiers: [{ kind: "irr", hurdle: 0.12, investorShare: 0.8 }],
  residualInvestorShare: 0.7,
};
