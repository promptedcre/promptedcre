"use client";

// The one place a calculator page picks its calculator. Each calculator is its
// own chunk, loaded with next/dynamic, so a page ships only the calculator it
// shows (still server-rendered, so it reads with scripts off).

import dynamic from "next/dynamic";
import type { CalcId } from "./meta";
import type { SheetSlots } from "./trace-view";

const DebtCalculator = dynamic(() => import("./debt-calculator").then((m) => m.DebtCalculator));
const ReturnsCalculator = dynamic(() => import("./returns-calculator").then((m) => m.ReturnsCalculator));
const WaterfallCalculator = dynamic(() => import("./waterfall-calculator").then((m) => m.WaterfallCalculator));
const DeadlineCalculator = dynamic(() => import("./deadline-calculator").then((m) => m.DeadlineCalculator));

type Common = SheetSlots & { tool?: string | null };

export type CalculatorProps = Common &
  (
    | { id: Exclude<CalcId, "deadline-calendar"> }
    | { id: "deadline-calendar"; ruleTitles: Record<string, string>; reviewNote: string }
  );

export function Calculator(props: CalculatorProps) {
  const common = { head: props.head, checked: props.checked, toolId: props.toolId, tool: props.tool };
  switch (props.id) {
    case "debt-sizing":
      return <DebtCalculator {...common} />;
    case "returns-sensitivity":
      return <ReturnsCalculator {...common} />;
    case "waterfall-promote":
      return <WaterfallCalculator {...common} />;
    case "deadline-calendar":
      return <DeadlineCalculator {...common} ruleTitles={props.ruleTitles} reviewNote={props.reviewNote} />;
  }
}
