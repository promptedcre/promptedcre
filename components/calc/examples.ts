// Each calculator's worked example, run through its own function once per
// process and shared by everything on the server that shows it: the previews
// on /calculators and the home page. Pure; the client calculators run the same
// function again as the reader types.

import { computeDeadlines, DEADLINES_EXAMPLE } from "@/lib/calculators/deadlines";
import { DEBT_EXAMPLE, sizeDebt } from "@/lib/calculators/debt";
import { RETURNS_EXAMPLE, runReturns } from "@/lib/calculators/returns";
import type { TraceLine } from "@/lib/calculators/trace";
import { runWaterfall, WATERFALL_EXAMPLE } from "@/lib/calculators/waterfall";
import { CALC_META, type CalcId } from "./meta";

const RUNS = {
  "deadline-calendar": () => computeDeadlines(DEADLINES_EXAMPLE),
  "waterfall-promote": () => runWaterfall(WATERFALL_EXAMPLE),
  "debt-sizing": () => sizeDebt(DEBT_EXAMPLE),
  "returns-sensitivity": () => runReturns(RETURNS_EXAMPLE),
} satisfies Record<CalcId, () => { trace: TraceLine[] }>;

type Results = { [K in CalcId]: ReturnType<(typeof RUNS)[K]> };

const cache: Partial<Results> = {};

export function isCalcId(id: string): id is CalcId {
  return id in CALC_META;
}

// The worked example's result, computed the first time it is asked for.
export function workedExample<K extends CalcId>(id: K): Results[K] {
  const hit = cache[id];
  if (hit !== undefined) return hit;
  const run = RUNS[id] as () => Results[K];
  const r = run();
  cache[id] = r;
  return r;
}
