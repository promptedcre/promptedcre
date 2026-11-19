// Live previews for /calculators: each calculator's own worked example, run
// through the real function when the page is built, drawn with the same
// figures the calculator page uses. Server component; no client code.

import type { ReactNode } from "react";
import { DEADLINES_EXAMPLE } from "@/lib/calculators/deadlines";
import { DEBT_EXAMPLE } from "@/lib/calculators/debt";
import { RETURNS_EXAMPLE } from "@/lib/calculators/returns";
import { usd } from "@/lib/calculators/trace";
import { WATERFALL_EXAMPLE } from "@/lib/calculators/waterfall";
import { workedExample } from "./examples";
import { moduleInfo } from "./module-info";
import { DeadlineSchedule, HeadlineFigures, LimitBars, SplitBar } from "./figures";
import { debtHeadline, debtLimitBars, returnsHeadline, returnsHeadlines, waterfallHeadline, waterfallSplit } from "./shape";

export type Preview = { headline: string; figure: ReactNode };

// The worked example's result in one sentence and one drawing.
export function calculatorPreview(id: string): Preview | null {
  switch (id) {
    case "waterfall-promote": {
      const r = workedExample("waterfall-promote");
      return {
        headline: waterfallHeadline(r),
        figure: <SplitBar segments={waterfallSplit(r)} total={r.totals.cash} totalLabel="distributed" title="Cash by party" minLabelPct={16} />,
      };
    }
    case "debt-sizing": {
      const r = workedExample("debt-sizing");
      return { headline: debtHeadline(r), figure: <LimitBars limits={debtLimitBars(DEBT_EXAMPLE, r)} loan={r.loan} compact /> };
    }
    case "returns-sensitivity": {
      const r = workedExample("returns-sensitivity");
      const h = returnsHeadlines(r);
      return { headline: returnsHeadline(r), figure: <HeadlineFigures lead={h.lead} rest={h.rest} compact /> };
    }
    case "deadline-calendar": {
      const { items } = workedExample("deadline-calendar");
      const first = items[0];
      return {
        headline: first ? `${items.length} dates from ${Object.values(DEADLINES_EXAMPLE).filter((v) => typeof v === "string").length} known ones, the first on ${first.weekday}, ${first.date}.` : "No dates.",
        figure: <DeadlineSchedule items={items} compact />,
      };
    }
    default: {
      const info = moduleInfo(id);
      return info ? { headline: info.headline(), figure: info.preview() } : null;
    }
  }
}

// For a caption: the worked example's inputs in a few words.
export function exampleLine(id: string): string | null {
  switch (id) {
    case "waterfall-promote": {
      const d = WATERFALL_EXAMPLE.deals[0];
      return d ? `${usd(d.contributions[0] ?? 0, false)} in, ${usd(d.distributions.reduce((s, x) => s + x, 0), false)} out over ${d.distributions.length - 1} years` : null;
    }
    case "debt-sizing":
      return `${usd(DEBT_EXAMPLE.noi, false)} NOI on an ${usd(DEBT_EXAMPLE.value, false)} property`;
    case "returns-sensitivity":
      return `${usd(RETURNS_EXAMPLE.price, false)} price, ${RETURNS_EXAMPLE.holdYears}-year hold`;
    case "deadline-calendar":
      return "a raise, a 1031 exchange, a tax protest and a purchase contract";
    default:
      return moduleInfo(id)?.exampleLine ?? null;
  }
}
