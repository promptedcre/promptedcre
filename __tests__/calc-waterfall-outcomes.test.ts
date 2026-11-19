import { describe, expect, it } from "vitest";
import { z } from "zod";
import { irr } from "@/lib/calculators/finance";
import {
  BREAK_EVEN_MAX_FACTOR,
  OUTCOME_STEPS,
  runStream,
  runWaterfall,
  tierLabels,
  WATERFALL_EXAMPLE,
  waterfallInput,
  type WaterfallInput,
  type WaterfallResult,
} from "@/lib/calculators/waterfall";
// The calculator's source as it stood before these outputs were added.
import * as before from "./fixtures/waterfall-sync";

// The waterfall calculator's added outputs: the return before the promote, the
// sponsor's side in dollars, each tier's cash by party, the same deal at seven
// endings, and two break-even points.
//
// Expected values were computed on 2026-11-14 in Python, a second and independent
// way: a plain re-implementation of the waterfall written from the method (every
// hurdle balance recomputed from the whole history of contributions and investor
// cash, decimal arithmetic at 60 digits, the IRR by bisection on net present
// value, each break-even by bisection and, for a single deal, as a closed form).
// For the whole-fund inputs whose deals end in different years, Python walked the
// factor upward from zero in steps of 1/1000 to the first one that met the test and
// bisected below it, so the point pinned is the first, and the first of them was
// also worked by hand.
// It is not a port of the TypeScript. Every input here is synthetic: round,
// made-up figures. None is a market level.

const cents = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.005);
};
// A break-even is found by bisection to well inside one cent of final-year cash.
const withinACent = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(0.01);
};
const rate = (actual: number | null | undefined, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual ?? Number.NaN).toBeCloseTo(expected, 9);
};

// A simple pref, a catch-up and a multiple tier; the sponsor puts in nothing.
const SIMPLE_CATCH_UP: WaterfallInput = {
  order: "whole-fund",
  deals: [{ name: "Sample deal B", contributions: [2_000_000], distributions: [0, 100_000, 100_000, 100_000, 3_000_000] }],
  sponsorCoInvestPct: 0,
  pref: { rate: 0.06, compounding: "simple", investorShare: 1 },
  catchUp: { sponsorShare: 0.5, targetShareOfProfit: 0.2 },
  tiers: [{ kind: "multiple", hurdle: 1.5, investorShare: 0.8 }],
  residualInvestorShare: 0.6,
};

// Two deals of different lengths, a compounding pref shared 90/10, an IRR tier and a multiple tier.
const TWO_DEALS_FUND: WaterfallInput = {
  order: "whole-fund",
  deals: [
    { name: "Sample North", contributions: [600_000], distributions: [0, 30_000, 30_000, 700_000] },
    { name: "Sample South", contributions: [400_000, 100_000], distributions: [0, 0, 20_000, 20_000, 20_000, 1_100_000] },
  ],
  sponsorCoInvestPct: 0.05,
  pref: { rate: 0.07, compounding: "compound", investorShare: 0.9 },
  catchUp: null,
  tiers: [
    { kind: "irr", hurdle: 0.1, investorShare: 0.8 },
    { kind: "multiple", hurdle: 1.6, investorShare: 0.7 },
  ],
  residualInvestorShare: 0.5,
};
const TWO_DEALS_BY_DEAL: WaterfallInput = { ...TWO_DEALS_FUND, order: "deal-by-deal" };

// A base case in which investors do not get their capital back.
const LOSING: WaterfallInput = {
  order: "whole-fund",
  deals: [{ name: "Sample deal E", contributions: [1_000_000], distributions: [0, 20_000, 20_000, 700_000] }],
  sponsorCoInvestPct: 0.2,
  pref: { rate: 0.08, compounding: "simple", investorShare: 1 },
  catchUp: null,
  tiers: [],
  residualInvestorShare: 0.8,
};

const CASES: Array<[string, WaterfallInput]> = [
  ["the worked example", WATERFALL_EXAMPLE],
  ["a simple pref, a catch-up, a multiple tier, no co-investment", SIMPLE_CATCH_UP],
  ["two deals, whole fund", TWO_DEALS_FUND],
  ["two deals, deal by deal", TWO_DEALS_BY_DEAL],
  ["a deal that loses money", LOSING],
];

// The same input with every deal's final-year cash multiplied by one factor.
const scaled = (input: WaterfallInput, factor: number): WaterfallInput => ({
  ...input,
  deals: input.deals.map((d) => ({ ...d, distributions: d.distributions.map((v, i) => (i === d.distributions.length - 1 ? v * factor : v)) })),
});
const finalCash = (input: WaterfallInput) => input.deals.reduce((s, d) => s + (d.distributions.at(-1) ?? 0), 0);
const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// The streams the chosen order runs, from the exported stream: one per deal, or one for the whole fund.
function streamsOf(input: WaterfallInput) {
  if (input.order === "deal-by-deal") return input.deals.map((d) => runStream(d.contributions, d.distributions, input));
  const years = Math.max(...input.deals.map((d) => Math.max(d.contributions.length, d.distributions.length)));
  const at = (key: "contributions" | "distributions") => Array.from({ length: years }, (_, t) => total(input.deals.map((d) => d[key][t] ?? 0)));
  return [runStream(at("contributions"), at("distributions"), input)];
}
// What is still owed in the first tier after the last year: deal by deal, in every deal's own first tier.
const owedAfter = (input: WaterfallInput) => total(streamsOf(input).map((s) => s.prefOwed));
// The two break-even tests as the calculator settles them: capital is back on all capital
// together in either order; the pref is paid when capital is back and nothing is owed.
function capitalIsBack(input: WaterfallInput): boolean {
  const periods = streamsOf(input).flatMap((s) => s.periods);
  return total(periods.map((p) => p.toInvestors)) >= total(periods.map((p) => p.contribution)) - 1e-6;
}
const prefIsPaid = (input: WaterfallInput) => capitalIsBack(input) && owedAfter(input) <= 1e-6;
// Every step of 1/64 of the final-year cash entered that lies more than a cent below a factor.
const stepsBelow = (input: WaterfallInput, factor: number) =>
  Array.from({ length: Math.ceil(factor * 64) + 1 }, (_, k) => k / 64).filter((f) => f < factor - 0.01 / finalCash(input));

// Whole fund, deals that end in different years: the corner in which a better ending can
// pay one side less, and a break-even test can be met, lost and met again.
const WHOLE_FUND = { order: "whole-fund", sponsorCoInvestPct: 0.1, catchUp: null } as const;
// The second deal's capital is called after the first has paid out (a contribution in a
// later year: through the connector's tool, not the page).
const TWO_CROSSINGS: WaterfallInput = {
  ...WHOLE_FUND,
  deals: [
    { name: "Sample early", contributions: [1_000_000], distributions: [0, 1_500_000] },
    { name: "Sample late", contributions: [0, 0, 0, 0, 0, 0, 1_000_000], distributions: [0, 0, 0, 0, 0, 0, 0, 300_000] },
  ],
  pref: { rate: 0.08, compounding: "compound", investorShare: 1 },
  tiers: [],
  residualInvestorShare: 0.1,
};
const TWO_CROSSINGS_AT_THE_CASH_ENTERED: WaterfallInput = {
  ...WHOLE_FUND,
  deals: [
    { name: "Sample early", contributions: [1_000_000], distributions: [0, 3_000_000] },
    { name: "Sample late", contributions: [0, 0, 0, 0, 0, 0, 1_000_000], distributions: [0, 0, 0, 0, 0, 0, 0, 1_000_000] },
  ],
  pref: { rate: 0.12, compounding: "compound", investorShare: 1 },
  tiers: [],
  residualInvestorShare: 0.3,
};
// Both deals funded at closing, as the page enters them; nothing above the pref goes to investors.
const INVESTORS_FALL: WaterfallInput = {
  ...WHOLE_FUND,
  deals: [
    { name: "Sample early", contributions: [1_000_000], distributions: [0, 1_500_000] },
    { name: "Sample late", contributions: [1_000_000], distributions: [0, 0, 0, 0, 0, 800_000] },
  ],
  pref: { rate: 0.08, compounding: "compound", investorShare: 1 },
  tiers: [],
  residualInvestorShare: 0,
};
// A simple pref, one IRR tier shared 80/20, and everything above it to investors.
const PROMOTE_FALLS: WaterfallInput = {
  ...WHOLE_FUND,
  deals: [
    { name: "Sample long", contributions: [500_000], distributions: [0, 20_000, 50_000, 80_000, 400_000] },
    { name: "Sample short", contributions: [500_000], distributions: [0, 20_000, 1_500_000] },
  ],
  pref: { rate: 0.12, compounding: "simple", investorShare: 1 },
  tiers: [{ kind: "irr", hurdle: 0.15, investorShare: 0.8 }],
  residualInvestorShare: 1,
};
// One deal that calls capital again after it has paid cash out.
const CALLED_AFTER_CASH: WaterfallInput = {
  ...WHOLE_FUND,
  deals: [{ name: "Sample recall", contributions: [500_000, 0, 0, 0, 0, 3_000_000], distributions: [0, 4_000_000, 50_000, 200_000, 0, 0] }],
  pref: { rate: 0.08, compounding: "compound", investorShare: 1 },
  tiers: [],
  residualInvestorShare: 0.7,
};

describe("waterfall outcomes: the worked example against Python (2026-11-14)", () => {
  const r = runWaterfall(WATERFALL_EXAMPLE);

  it("states the return before the promote and the gap to the investors' return", () => {
    rate(r.beforePromote.irr, 0.1414574280041413);
    rate(r.beforePromote.multiple, 1.84);
    rate(r.beforePromote.irrGap, 0.0124672941303082);
    rate(r.beforePromote.multipleGap, 0.09382054144);
    // unchanged, and the base the gap is measured from
    rate(r.investorIrr, 0.1289901338738331);
    rate(r.investorMultiple, 1.74617945856);
  });

  it("states the sponsor's side in dollars and as a multiple", () => {
    cents(r.sponsor.contributed, 100_000);
    cents(r.sponsor.coInvestCash, 174_617.945856);
    cents(r.sponsor.promote, 93_820.54144);
    cents(r.sponsor.total, 268_438.487296);
    rate(r.sponsor.multiple, 2.68438487296);
  });

  it("splits each tier's cash between the investors and the promote", () => {
    const expected = [
      [1_417_332.0192, 1_417_332.0192, 0],
      [0, 0, 0],
      [329_798.528, 263_838.8224, 65_959.7056],
      [92_869.4528, 65_008.61696, 27_860.83584],
    ];
    expect(r.tierSplit).toHaveLength(expected.length);
    expected.forEach(([cash, toInvestors, promote], i) => {
      cents(r.tierSplit[i]?.cash, cash ?? Number.NaN);
      cents(r.tierSplit[i]?.toInvestors, toInvestors ?? Number.NaN);
      cents(r.tierSplit[i]?.promote, promote ?? Number.NaN);
    });
  });

  it("runs the same deal at seven endings", () => {
    // step, final-year cash, all cash, investor multiple, investor IRR, promote, sponsor total, sponsor multiple
    const expected = [
      [-100, 0, 240_000, 0.24, -0.3985672898401878, 0, 24_000, 0.24],
      [-75, 400_000, 640_000, 0.64, -0.1017207999761862, 0, 64_000, 0.64],
      [-50, 800_000, 1_040_000, 1.04, 0.0089193785816632, 0, 104_000, 1.04],
      [-25, 1_200_000, 1_440_000, 1.43546640384, 0.0829554570652827, 4_533.59616, 148_080.236544, 1.48080236544],
      [0, 1_600_000, 1_840_000, 1.74617945856, 0.1289901338738331, 93_820.54144, 268_438.487296, 2.68438487296],
      [25, 2_000_000, 2_240_000, 2.02617945856, 0.1646309602124347, 213_820.54144, 416_438.487296, 4.16438487296],
      [50, 2_400_000, 2_640_000, 2.30617945856, 0.1962192703266519, 333_820.54144, 564_438.487296, 5.64438487296],
    ];
    expect(r.outcomes).toHaveLength(7);
    expected.forEach((e, i) => {
      const row = r.outcomes[i];
      expect(row?.step).toBe(e[0]);
      cents(row?.finalCash, e[1] ?? Number.NaN);
      cents(row?.cash, e[2] ?? Number.NaN);
      rate(row?.investorMultiple, e[3] ?? Number.NaN);
      rate(row?.investorIrr, e[4] ?? Number.NaN);
      cents(row?.promote, e[5] ?? Number.NaN);
      cents(row?.sponsorTotal, e[6] ?? Number.NaN);
      rate(row?.sponsorMultiple, e[7] ?? Number.NaN);
    });
  });

  it("finds the two break-even points, stated as final-year cash", () => {
    // capital back: $1,000,000 less four years of $60,000
    withinACent(r.breakEven.capitalBack?.finalCash, 760_000);
    expect(r.breakEven.capitalBack?.factor).toBeCloseTo(0.475, 8);
    // pref paid: $1,000,000 x 1.08^5 less the four $60,000 payments grown at 8%
    withinACent(r.breakEven.prefPaid?.finalCash, 1_177_332.0192);
    expect(r.breakEven.prefPaid?.factor).toBeCloseTo(0.735832512, 8);
  });

  it("adds four lines to the trace, after the lines that were there", () => {
    const was = before.runWaterfall(WATERFALL_EXAMPLE).trace;
    expect(r.trace.slice(0, was.length)).toStrictEqual(was);
    expect(r.trace.slice(was.length).map((l) => [l.label, l.value])).toStrictEqual([
      ["IRR before the promote", "14.15%"],
      ["Gap to the investor IRR", "1.25 points"],
      ["Final-year cash that returns the investors' capital", "$760,000.00"],
      ["Final-year cash that pays the preferred return", "$1,177,332.02"],
    ]);
  });
});

describe("waterfall outcomes: other inputs against Python (2026-11-14)", () => {
  it("a simple pref, a catch-up and a multiple tier", () => {
    const r = runWaterfall(SIMPLE_CATCH_UP);
    rate(r.beforePromote.irr, 0.1412725813450764);
    rate(r.beforePromote.irrGap, 0.0250023862192835);
    rate(r.beforePromote.multipleGap, 0.135);
    expect(r.tierSplit.map((t) => [Math.round(t.cash), Math.round(t.toInvestors), Math.round(t.promote)])).toStrictEqual([
      [2_480_000, 2_480_000, 0],
      [320_000, 160_000, 160_000],
      [450_000, 360_000, 90_000],
      [50_000, 30_000, 20_000],
    ]);
    expect(r.outcomes.map((o) => Math.round(o.promote))).toStrictEqual([0, 0, 0, 35_000, 270_000, 570_000, 870_000]);
    rate(r.outcomes[0]?.investorIrr, -0.5673376822839652);
    rate(r.outcomes[6]?.investorIrr, 0.1937905094869332);
    withinACent(r.breakEven.capitalBack?.finalCash, 1_700_000);
    withinACent(r.breakEven.prefPaid?.finalCash, 2_180_000);
  });

  it("two deals of different lengths, whole fund", () => {
    const r = runWaterfall(TWO_DEALS_FUND);
    rate(r.beforePromote.irr, 0.1523808185405367);
    rate(r.beforePromote.irrGap, 0.0381697216680774);
    cents(r.sponsor.total, 323_046.9305630625);
    rate(r.sponsor.multiple, 5.8735805556920455);
    cents(r.tierSplit[0]?.promote, 157_773.07827);
    cents(r.tierSplit[2]?.toInvestors, 171_656.59557);
    cents(r.tierSplit[3]?.cash, 127_698.4728375);
    cents(r.outcomes[0]?.promote, 12_000);
    cents(r.outcomes[3]?.promote, 147_000);
    cents(r.outcomes[5]?.promote, 445_964.23233125);
    cents(r.outcomes[6]?.sponsorTotal, 782_727.0910271875);
    rate(r.outcomes[6]?.investorMultiple, 1.9495434535625);
    rate(r.outcomes[1]?.investorIrr, -0.1793428974407762);
    withinACent(r.breakEven.capitalBack?.finalCash, 1_102_222.2222222222);
    withinACent(r.breakEven.prefPaid?.finalCash, 1_475_988.813082785);
  });

  it("the same two deals, deal by deal: one deal still owes its pref at the cash entered", () => {
    const r = runWaterfall(TWO_DEALS_BY_DEAL);
    rate(r.beforePromote.irrGap, 0.0494446142118904);
    cents(r.sponsor.total, 390_837.8415355952);
    cents(r.tierSplit[4]?.promote, 125_644.3773309524);
    cents(r.outcomes[3]?.promote, 160_097.8717366667);
    cents(r.outcomes[6]?.promote, 672_680.143502381);
    rate(r.outcomes[5]?.sponsorMultiple, 10.4917479332229437);
    withinACent(r.breakEven.capitalBack?.finalCash, 1_102_222.2222222222);
    withinACent(r.breakEven.prefPaid?.finalCash, 1_929_210);
    expect(r.breakEven.prefPaid?.factor).toBeGreaterThan(1);
  });
});

describe("waterfall outcomes: identities", () => {
  for (const [name, input] of CASES) {
    describe(name, () => {
      const r = runWaterfall(input);
      const co = input.sponsorCoInvestPct;

      it("the tier split adds up, tier by tier and column by column", () => {
        expect(r.tierSplit.map((t) => t.label)).toStrictEqual(r.tierLabels);
        expect(r.tierSplit.map((t) => t.cash)).toStrictEqual(r.tierCash);
        for (const t of r.tierSplit) cents(t.toInvestors + t.promote, t.cash);
        cents(total(r.tierSplit.map((t) => t.cash)), r.totals.cash);
        cents(total(r.tierSplit.map((t) => t.toInvestors)), r.totals.toInvestors);
        cents(total(r.tierSplit.map((t) => t.promote)), r.totals.promote);
      });

      it("the sponsor's dollars are the co-investment cash plus the promote", () => {
        expect(r.sponsor.promote).toBe(r.totals.promote);
        expect(r.sponsor.total).toBe(r.totals.sponsorTotal);
        cents(r.sponsor.contributed, co * r.totals.contributed);
        cents(r.sponsor.coInvestCash, co * r.totals.toInvestors);
        cents(r.sponsor.coInvestCash + r.sponsor.promote, r.sponsor.total);
        if (co === 0) expect(r.sponsor.multiple).toBeNull();
        else rate(r.sponsor.multiple, r.sponsor.total / r.sponsor.contributed);
      });

      it("the return before the promote is the return on all the cash and, on this input, not below the investors'", () => {
        const all = irr(r.periods.map((p) => p.cash - p.contribution));
        expect(r.beforePromote.irr).toBe(all);
        rate(r.beforePromote.multiple, r.totals.cash / r.totals.contributed);
        rate(r.beforePromote.multipleGap, r.beforePromote.multiple - r.investorMultiple);
        expect(r.beforePromote.multipleGap).toBeGreaterThanOrEqual(-1e-12);
        if (all === null || r.investorIrr === null) expect(r.beforePromote.irrGap).toBeNull();
        else {
          rate(r.beforePromote.irrGap, all - r.investorIrr);
          expect(r.beforePromote.irrGap ?? Number.NaN).toBeGreaterThanOrEqual(-1e-12);
        }
      });

      it("the row at step 0 is the result itself, and every row is a plain re-run", () => {
        expect(r.outcomes.map((o) => o.step)).toStrictEqual([...OUTCOME_STEPS]);
        const base = r.outcomes.find((o) => o.step === 0);
        expect(base).toStrictEqual({
          step: 0,
          finalCash: finalCash(input),
          cash: r.totals.cash,
          investorMultiple: r.investorMultiple,
          investorIrr: r.investorIrr,
          promote: r.totals.promote,
          sponsorTotal: r.totals.sponsorTotal,
          sponsorMultiple: r.sponsor.multiple,
        });
        for (const o of r.outcomes) {
          const moved = scaled(input, 1 + o.step / 100);
          const again = runWaterfall(moved);
          cents(o.finalCash, finalCash(moved));
          cents(o.cash, again.totals.cash);
          rate(o.investorMultiple, again.investorMultiple);
          if (again.investorIrr === null) expect(o.investorIrr).toBeNull();
          else rate(o.investorIrr, again.investorIrr);
          cents(o.promote, again.totals.promote);
          cents(o.sponsorTotal, again.totals.sponsorTotal);
          if (co === 0) expect(o.sponsorMultiple).toBeNull();
          else rate(o.sponsorMultiple, again.totals.sponsorTotal / (co * again.totals.contributed));
        }
      });

      it("on this input, cash, investor cash and the promote do not fall as the step rises", () => {
        for (let i = 1; i < r.outcomes.length; i += 1) {
          const lower = r.outcomes[i - 1];
          const higher = r.outcomes[i];
          expect(lower && higher).toBeTruthy();
          if (!lower || !higher) continue;
          expect(higher.finalCash).toBeGreaterThanOrEqual(lower.finalCash);
          expect(higher.cash).toBeGreaterThanOrEqual(lower.cash);
          expect(higher.investorMultiple).toBeGreaterThanOrEqual(lower.investorMultiple - 1e-12);
          expect(higher.promote).toBeGreaterThanOrEqual(lower.promote - 1e-6);
        }
      });

      it("each break-even is met at the point, not one cent below it, and at no searched step below it", () => {
        const { capitalBack, prefPaid } = r.breakEven;
        expect(capitalBack).not.toBeNull();
        expect(prefPaid).not.toBeNull();
        if (!capitalBack || !prefPaid) return;
        const base = finalCash(input);
        const oneCent = 0.01 / base;
        cents(capitalBack.finalCash, capitalBack.factor * base);
        cents(prefPaid.finalCash, prefPaid.factor * base);
        expect(prefPaid.factor).toBeGreaterThanOrEqual(capitalBack.factor);
        // met at the point, not met one cent of final-year cash below it
        expect(runWaterfall(scaled(input, capitalBack.factor)).investorMultiple).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(runWaterfall(scaled(input, capitalBack.factor - oneCent)).investorMultiple).toBeLessThan(1);
        expect(owedAfter(scaled(input, prefPaid.factor))).toBeLessThanOrEqual(1e-6);
        expect(owedAfter(scaled(input, prefPaid.factor - oneCent))).toBeGreaterThan(1e-6);
        // and at no step of 1/64 of the cash entered below the point
        for (const f of stepsBelow(input, capitalBack.factor)) expect(capitalIsBack(scaled(input, f)), `capital back at ${f}`).toBe(false);
        for (const f of stepsBelow(input, prefPaid.factor)) expect(prefIsPaid(scaled(input, f)), `pref paid at ${f}`).toBe(false);
      });

      it("is pure: the same input gives the same result and is left as it was", () => {
        const snapshot = JSON.stringify(input);
        expect(runWaterfall(input)).toStrictEqual(r);
        expect(JSON.stringify(input)).toBe(snapshot);
      });
    });
  }

  it("has no gap when every share goes to the investors and there is no catch-up", () => {
    const r = runWaterfall({
      ...WATERFALL_EXAMPLE,
      pref: { ...WATERFALL_EXAMPLE.pref, investorShare: 1 },
      catchUp: null,
      tiers: [{ kind: "irr", hurdle: 0.12, investorShare: 1 }],
      residualInvestorShare: 1,
    });
    expect(r.totals.promote).toBe(0);
    expect(r.beforePromote.irrGap).toBeCloseTo(0, 12);
    expect(r.beforePromote.multipleGap).toBeCloseTo(0, 12);
    for (const t of r.tierSplit) expect(t.promote).toBe(0);
  });

  it("gives no sponsor multiple when the sponsor puts in nothing", () => {
    const r = runWaterfall(SIMPLE_CATCH_UP);
    expect(r.sponsor.contributed).toBe(0);
    expect(r.sponsor.coInvestCash).toBe(0);
    expect(r.sponsor.multiple).toBeNull();
    cents(r.sponsor.total, 270_000);
    expect(r.outcomes.every((o) => o.sponsorMultiple === null)).toBe(true);
    // the dollars are still there to read
    expect(r.outcomes.map((o) => Math.round(o.sponsorTotal))).toStrictEqual([0, 0, 0, 35_000, 270_000, 570_000, 870_000]);
  });
});

describe("waterfall outcomes: whole fund, deals that end in different years, against Python (2026-11-14)", () => {
  const multiples = (r: WaterfallResult) => r.outcomes.map((o) => o.investorMultiple);
  const promotes = (r: WaterfallResult) => r.outcomes.map((o) => o.promote);
  const eachRate = (actual: number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((e, i) => rate(actual[i], e));
  };
  const eachCents = (actual: number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((e, i) => cents(actual[i], e));
  };
  const rises = (xs: number[]) => xs.every((x, i) => i === 0 || x >= (xs[i - 1] ?? Number.NaN) - 1e-9);

  it("a better ending can pay the investors less in all", () => {
    const r = runWaterfall(INVESTORS_FALL);
    // more cash in year 1 leaves less pref to accrue, and the year-5 cash above what is owed is all promote
    eachRate(multiples(r), [0, 0.2875, 0.575, 0.8625, 1.15, 1.1313696768, 1.08]);
    eachCents(promotes(r), [0, 0, 0, 0, 0, 612_260.6464, 1_290_000]);
    expect(rises(r.outcomes.map((o) => o.cash))).toBe(true);
    expect(rises(multiples(r))).toBe(false);
    withinACent(r.breakEven.capitalBack?.finalCash, 2_000_000);
    withinACent(r.breakEven.prefPaid?.finalCash, 2_379_283.130936776666);
  });

  it("a better ending can lower the promote", () => {
    const r = runWaterfall(PROMOTE_FALLS);
    // at 25 percent lower the 15% hurdle is not reached in year 2, accrues two more years, and the 80/20 tier is wider
    eachCents(promotes(r), [0, 0, 0, 23_948.4375, 19_125, 19_125, 19_125]);
    eachRate(multiples(r), [0.17, 0.645, 1.12, 1.5710515625, 2.050875, 2.525875, 3.000875]);
    expect(rises(multiples(r))).toBe(true);
    expect(rises(promotes(r))).toBe(false);
  });

  it("deal by deal, the same inputs only rise", () => {
    for (const input of [INVESTORS_FALL, PROMOTE_FALLS, TWO_CROSSINGS, TWO_CROSSINGS_AT_THE_CASH_ENTERED]) {
      const r = runWaterfall({ ...input, order: "deal-by-deal" });
      expect(rises(r.outcomes.map((o) => o.cash)), input.deals[0]?.name).toBe(true);
      expect(rises(multiples(r)), input.deals[0]?.name).toBe(true);
      expect(rises(promotes(r)), input.deals[0]?.name).toBe(true);
    }
  });

  it("a break-even is the first point at which its test is met when it is met, lost and met again", () => {
    const r = runWaterfall(TWO_CROSSINGS);
    // by hand: while the pref is still owed in year 7, investor cash is $972,000 + $450,000 x the factor,
    // which reaches $2,000,000 at 2.28444 times the $1,800,000 entered
    withinACent(r.breakEven.capitalBack?.finalCash, 4_112_000);
    expect(r.breakEven.capitalBack?.factor).toBeCloseTo(1_028_000 / 450_000, 8);
    withinACent(r.breakEven.prefPaid?.finalCash, 4_186_538.966943858039);
    expect(r.breakEven.prefPaid?.factor).toBeCloseTo(2.325854981635, 8);
    expect(r.trace.slice(-2).map((l) => l.value)).toStrictEqual(["$4,112,000.00", "$4,186,538.97"]);
    // above the point the capital is lost again and comes back a second time, which is where a search by doubling lands
    cents(runWaterfall(scaled(TWO_CROSSINGS, 2.3)).totals.toInvestors, 2_007_000);
    cents(runWaterfall(scaled(TWO_CROSSINGS, 4)).totals.toInvestors, 1_961_332.0498003968);
    cents(runWaterfall(scaled(TWO_CROSSINGS, 5.7)).totals.toInvestors, 1_998_000);
    cents(runWaterfall(scaled(TWO_CROSSINGS, 5.72)).totals.toInvestors, 2_001_600);
    for (const f of stepsBelow(TWO_CROSSINGS, r.breakEven.capitalBack?.factor ?? Number.NaN)) expect(capitalIsBack(scaled(TWO_CROSSINGS, f)), `capital back at ${f}`).toBe(false);
    for (const f of stepsBelow(TWO_CROSSINGS, r.breakEven.prefPaid?.factor ?? Number.NaN)) expect(prefIsPaid(scaled(TWO_CROSSINGS, f)), `pref paid at ${f}`).toBe(false);
  });

  it("a break-even can sit below the cash entered while the cash entered fails the test", () => {
    const input = TWO_CROSSINGS_AT_THE_CASH_ENTERED;
    const r = runWaterfall(input);
    // capital is back at 64 percent of the $4,000,000 entered, and not at all of it
    withinACent(r.breakEven.capitalBack?.finalCash, 2_560_000);
    expect(r.breakEven.capitalBack?.factor).toBeCloseTo(0.64, 8);
    withinACent(r.breakEven.prefPaid?.finalCash, 2_569_051.237718812798);
    rate(r.investorMultiple, 0.994367401945);
    expect(owedAfter(input)).toBeLessThanOrEqual(1e-6);
    expect(prefIsPaid(input)).toBe(false);
    cents(runWaterfall(scaled(input, 1.02)).totals.toInvestors, 2_008_000);
    for (const f of stepsBelow(input, r.breakEven.capitalBack?.factor ?? Number.NaN)) expect(capitalIsBack(scaled(input, f)), `capital back at ${f}`).toBe(false);
  });
});

describe("waterfall outcomes: capital called after cash has been paid out", () => {
  it("states no gap between the IRRs, because neither series has one IRR", () => {
    const r = runWaterfall(CALLED_AFTER_CASH);
    // the two rates are still what the IRR function returns, and are not the same root
    expect(r.beforePromote.irr).toBe(irr(r.periods.map((p) => p.cash - p.contribution)));
    expect(r.beforePromote.irr).not.toBeNull();
    expect(r.investorIrr).not.toBeNull();
    expect((r.beforePromote.irr ?? Number.NaN) - (r.investorIrr ?? Number.NaN)).toBeLessThan(0);
    expect(r.beforePromote.irrGap).toBeNull();
    // the multiples still compare (Python, 2026-11-14)
    rate(r.beforePromote.multiple, 4_250_000 / 3_500_000);
    rate(r.investorMultiple, 0.896285714286);
    rate(r.beforePromote.multipleGap, 0.318);
    const gap = r.trace.find((l) => l.label === "Gap to the investor IRR");
    expect(gap?.value).toBe("n/a");
    expect(gap?.formula).toMatch(/^not stated: capital is called after cash is paid out/);
  });

  it("states none either when a second deal is funded after the first has paid out", () => {
    for (const input of [TWO_CROSSINGS, TWO_CROSSINGS_AT_THE_CASH_ENTERED]) expect(runWaterfall(input).beforePromote.irrGap).toBeNull();
  });
});

describe("waterfall break-evens: closed forms on a single deal with a first-tier investor share of 1", () => {
  // The balance still owed in the first tier going into the final year's distribution,
  // worked a second way from the earlier years' investor cash.
  function owedGoingIn(input: WaterfallInput, r: WaterfallResult): number {
    const last = r.periods.length - 1;
    const p = input.pref;
    if (p.compounding === "compound") {
      return r.periods.reduce((s, q, t) => s + (q.contribution - (t === last ? 0 : q.toInvestors)) * (1 + p.rate) ** (last - t), 0);
    }
    let unreturned = 0;
    let unpaid = 0;
    r.periods.forEach((q, t) => {
      if (t > 0) unpaid += p.rate * unreturned;
      unreturned += q.contribution;
      if (t === last) return;
      const toPref = Math.min(q.toInvestors, unpaid);
      unpaid -= toPref;
      unreturned -= Math.min(q.toInvestors - toPref, unreturned);
    });
    return unpaid + unreturned;
  }

  const single: Array<[string, WaterfallInput, number, number]> = [
    ["a compounding pref (the worked example)", WATERFALL_EXAMPLE, 760_000, 1_177_332.0192],
    ["a simple pref with a catch-up", SIMPLE_CATCH_UP, 1_700_000, 2_180_000],
    ["a simple pref on a deal that loses money", LOSING, 960_000, 1_200_000],
  ];

  for (const [name, input, capital, pref] of single) {
    it(name, () => {
      const r = runWaterfall(input);
      const earlier = total(r.periods.slice(0, -1).map((p) => p.toInvestors));
      // capital back: what was contributed less the investor cash of the earlier years
      withinACent(r.breakEven.capitalBack?.finalCash, Math.max(r.totals.contributed - earlier, 0));
      withinACent(r.breakEven.capitalBack?.finalCash, capital);
      // pref paid: the first-tier balance still owed going into the final year's distribution
      withinACent(r.breakEven.prefPaid?.finalCash, owedGoingIn(input, r));
      withinACent(r.breakEven.prefPaid?.finalCash, pref);
    });
  }

  it("puts capital back above the cash entered when the base case loses money", () => {
    const r = runWaterfall(LOSING);
    expect(r.investorMultiple).toBeLessThan(1);
    expect(r.breakEven.capitalBack?.factor).toBeCloseTo(960_000 / 700_000, 8);
    expect(r.breakEven.capitalBack?.factor).toBeGreaterThan(1);
    expect(r.breakEven.prefPaid?.factor).toBeCloseTo(1_200_000 / 700_000, 8);
  });
});

describe("waterfall outcomes: edges", () => {
  const one = (distributions: number[], contributions = [1_000_000]): WaterfallInput => ({
    ...WATERFALL_EXAMPLE,
    deals: [{ name: "Sample edge deal", contributions, distributions }],
  });

  it("leaves a deal with no final-year cash unchanged; with none anywhere, every row is the same and there is no break-even", () => {
    const r = runWaterfall(one([0, 500_000, 0]));
    const base = r.outcomes.find((o) => o.step === 0);
    for (const o of r.outcomes) expect({ ...o, step: 0 }).toStrictEqual(base);
    expect(r.outcomes.every((o) => o.finalCash === 0)).toBe(true);
    expect(r.breakEven).toStrictEqual({ capitalBack: null, prefPaid: null });
    expect(r.trace.slice(-2).map((l) => l.value)).toStrictEqual(["n/a", "n/a"]);
  });

  it("moves only the deals that have final-year cash", () => {
    const input: WaterfallInput = {
      ...WATERFALL_EXAMPLE,
      order: "deal-by-deal",
      deals: [
        { name: "Sample with an ending", contributions: [500_000], distributions: [0, 25_000, 25_000, 800_000] },
        { name: "Sample with none", contributions: [500_000], distributions: [0, 300_000, 0] },
      ],
    };
    const r = runWaterfall(input);
    expect(r.outcomes.map((o) => o.finalCash)).toStrictEqual([0, 200_000, 400_000, 600_000, 800_000, 1_000_000, 1_200_000]);
    expect(r.outcomes.map((o) => o.cash)).toStrictEqual([350_000, 550_000, 750_000, 950_000, 1_150_000, 1_350_000, 1_550_000]);
  });

  it("takes each deal's own last entry as its final year, in either order", () => {
    for (const input of [TWO_DEALS_FUND, TWO_DEALS_BY_DEAL]) {
      const r = runWaterfall(input);
      // $700,000 in year 3 of one deal and $1,100,000 in year 5 of the other
      expect(r.outcomes.map((o) => o.finalCash)).toStrictEqual([0, 450_000, 900_000, 1_350_000, 1_800_000, 2_250_000, 2_700_000]);
      expect(r.outcomes.map((o) => o.cash)).toStrictEqual([120_000, 570_000, 1_020_000, 1_470_000, 1_920_000, 2_370_000, 2_820_000]);
    }
  });

  it("puts a break-even at zero when it is met with no final-year cash at all", () => {
    // $1,200,000 in year 1 returns the capital and pays a year of 8% pref
    const r = runWaterfall(one([0, 1_200_000, 100_000]));
    expect(r.breakEven.capitalBack).toStrictEqual({ factor: 0, finalCash: 0 });
    expect(r.breakEven.prefPaid).toStrictEqual({ factor: 0, finalCash: 0 });
  });

  it("states no break-even when no capital was contributed", () => {
    const r = runWaterfall(one([0, 100], [0]));
    expect(r.totals.contributed).toBe(0);
    expect(r.breakEven).toStrictEqual({ capitalBack: null, prefPaid: null });
    expect(r.trace.slice(-2).map((l) => l.value)).toStrictEqual(["n/a", "n/a"]);
  });

  it("looks as far as 64 times the final-year cash entered, and no further", () => {
    expect(BREAK_EVEN_MAX_FACTOR).toBe(64);
    // $25,000 of final-year cash: capital is back at 40 times it, the pref ($1,000,000 x 1.08^2) at 46.656 times
    const far = runWaterfall(one([0, 0, 25_000]));
    withinACent(far.breakEven.capitalBack?.finalCash, 1_000_000);
    expect(far.breakEven.capitalBack?.factor).toBeCloseTo(40, 6);
    withinACent(far.breakEven.prefPaid?.finalCash, 1_166_400);
    expect(far.breakEven.prefPaid?.factor).toBeCloseTo(46.656, 6);
    // $10,000 of final-year cash would need 100 times
    const beyond = runWaterfall(one([0, 0, 10_000]));
    expect(beyond.breakEven).toStrictEqual({ capitalBack: null, prefPaid: null });
    // capital back within reach, the pref not: $1,000,000 against $1,166,400, at up to $1,024,000
    const between = runWaterfall(one([0, 0, 16_000]));
    expect(between.breakEven.capitalBack?.factor).toBeCloseTo(62.5, 6);
    expect(between.breakEven.prefPaid).toBeNull();
  });
});

describe("waterfall: nothing that existed changed", () => {
  // Counts the numbers and strings compared, so the report can say how many.
  const leaves = (v: unknown): number => (Array.isArray(v) ? total(v.map(leaves)) : v !== null && typeof v === "object" ? total(Object.values(v).map(leaves)) : 1);

  it("every field of the old result has the same value in the new one", () => {
    let compared = 0;
    for (const [name, input] of CASES) {
      const was = before.runWaterfall(input) as unknown as Record<string, unknown>;
      const now = runWaterfall(input) as unknown as Record<string, unknown>;
      expect(Object.keys(was).sort()).toStrictEqual(
        ["alternative", "investorIrr", "investorMultiple", "periods", "promoteShareOfProfit", "sponsorIrr", "tierCash", "tierLabels", "totals", "trace"].sort(),
      );
      for (const key of Object.keys(was)) {
        // the trace gained lines after the ones that were there; every earlier line is unchanged
        const value = key === "trace" ? (now.trace as unknown[]).slice(0, (was.trace as unknown[]).length) : now[key];
        expect(value, `${name}: ${key}`).toStrictEqual(was[key]);
        compared += leaves(was[key]);
      }
    }
    // ten fields on each of five inputs: 438 numbers and strings in all
    expect(compared).toBe(438);
  });

  it("the exported stream, labels, example and input schema are the same", () => {
    for (const [name, input] of CASES) {
      expect(tierLabels(input), name).toStrictEqual(before.tierLabels(input));
      for (const d of input.deals) {
        const was = before.runStream(d.contributions, d.distributions, input);
        const now = runStream(d.contributions, d.distributions, input);
        expect(now.periods, name).toStrictEqual(was.periods);
        expect(now.tierCash, name).toStrictEqual(was.tierCash);
      }
    }
    expect(WATERFALL_EXAMPLE).toStrictEqual(before.WATERFALL_EXAMPLE);
    // the connector's tool listing carries this schema: not one character may change
    const schema = (s: z.ZodType) => JSON.stringify(z.toJSONSchema(s, { target: "draft-2020-12" }));
    expect(schema(waterfallInput)).toBe(schema(before.waterfallInput));
    // and an input that was invalid is still invalid
    expect(() => runWaterfall({ ...WATERFALL_EXAMPLE, catchUp: { sponsorShare: 0.2, targetShareOfProfit: 0.2 } })).toThrow();
  });
});
