// Test fixture, not the calculator: lib/calculators/waterfall.ts as it stood before the
// outcome outputs were added on 2026-11-14 (git show sync:lib/calculators/waterfall.ts).
// Only the two import paths below differ from that source. Read by
// __tests__/calc-waterfall-outcomes.test.ts to show that nothing that existed changed.
// Do not edit and do not import from application code.

import { z } from "zod";
import { irr } from "@/lib/calculators/finance";
import { multiple, pct, type TraceLine, usd } from "@/lib/calculators/trace";

// A distribution waterfall between the investor class (all contributed capital,
// including any sponsor co-invest) and the sponsor's promote. Hurdles are
// measured on the investor class. Years are the period; capital comes in at
// year 0 unless a contributions list says otherwise.

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

export type StreamResult = { periods: WaterfallPeriod[]; tierCash: number[] };

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
  return { periods, tierCash };
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
  return { periods, tierCash };
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
  trace: TraceLine[];
};

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
