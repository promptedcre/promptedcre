// Prints the worked examples' results as JSON, plus the vectors Excel needs.
// Used with tools/crosscheck/excel.ps1 to cross-check the math in Excel.
//   npx tsx tools/crosscheck/examples.ts > examples.json
import { DEBT_EXAMPLE, sizeDebt } from "../../lib/calculators/debt";
import { fv, ipmt, pmt, ppmt, pv, xirr } from "../../lib/calculators/finance";
import { RETURNS_EXAMPLE, runReturns } from "../../lib/calculators/returns";
import { runWaterfall, WATERFALL_EXAMPLE } from "../../lib/calculators/waterfall";

const debt = sizeDebt(DEBT_EXAMPLE);
const ret = runReturns(RETURNS_EXAMPLE);
const corners = [
  { exitCap: 0.06, noiGrowth: 0.04 },
  { exitCap: 0.07, noiGrowth: 0.02 },
].map((c) => ({ ...c, irr: runReturns({ ...RETURNS_EXAMPLE, ...c }).leveredIrr }));

const wf = runWaterfall(WATERFALL_EXAMPLE);
const last = wf.periods.length - 1;
const residual = wf.tierCash[wf.tierCash.length - 1] ?? 0;
const tier2 = wf.tierCash[2] ?? 0;
const investorFlows = wf.periods.map((p) => p.toInvestors - p.contribution);
// investor cash through the end of each tier (the residual and tier 2 only paid in the final year)
const throughTier2 = investorFlows.map((x, t) => (t === last ? x - residual * WATERFALL_EXAMPLE.residualInvestorShare : x));
const throughTier1 = throughTier2.map((x, t) => (t === last ? x - tier2 * (WATERFALL_EXAMPLE.tiers[0]?.investorShare ?? 0) : x));

const dated = [
  { date: "2026-01-15", amount: -1_000_000 },
  { date: "2026-07-15", amount: 50_000 },
  { date: "2027-01-15", amount: 50_000 },
  { date: "2027-12-31", amount: 1_100_000 },
];

console.log(
  JSON.stringify(
    {
      functions: {
        pmt: pmt(0.005, 360, 1_000_000),
        ipmt1: ipmt(0.005, 1, 360, 1_000_000),
        ipmt120: ipmt(0.005, 120, 360, 1_000_000),
        ppmt120: ppmt(0.005, 120, 360, 1_000_000),
        fv60: fv(0.005, 60, -5995.51, 1_000_000),
        pv: pv(0.005, 360, -5000),
        xirr: xirr(dated),
      },
      debt: {
        loanByDscr: debt.byConstraint.dscr,
        loan: debt.loan,
        binding: debt.binding,
        ioPayment: debt.ioPayment,
        amortPayment: debt.amortPayment,
        balloon: debt.balloon,
        year1Interest: debt.schedule[0]?.interest,
        year3Interest: debt.schedule[2]?.interest,
        year3Principal: debt.schedule[2]?.principal,
        dscr: debt.dscr,
      },
      returns: {
        unleveredFlows: ret.unleveredFlows,
        leveredFlows: ret.leveredFlows,
        unleveredIrr: ret.unleveredIrr,
        leveredIrr: ret.leveredIrr,
        equityMultiple: ret.equityMultiple,
        corners,
      },
      waterfall: {
        investorFlows,
        throughTier1,
        throughTier2,
        investorIrr: wf.investorIrr,
        promote: wf.totals.promote,
        tierCash: wf.tierCash,
      },
      dated,
    },
    null,
    2,
  ),
);
