"use client";

// The module calculators' counterpart to calculator.tsx: each is its own chunk,
// loaded with next/dynamic, so a page ships only the calculator it shows
// (still server-rendered, so it reads with scripts off).

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ModuleId } from "@/lib/calculators/modules";
import type { SheetSlots } from "./trace-view";

type Props = SheetSlots & { tool?: string | null };

const CALCULATORS: Record<ModuleId, ComponentType<Props>> = {
  "income-value": dynamic(() => import("./income-value-calculator").then((m) => m.IncomeValueCalculator)),
  "cap-rate": dynamic(() => import("./cap-rate-calculator").then((m) => m.CapRateCalculator)),
  "loan-payments": dynamic(() => import("./loan-payments-calculator").then((m) => m.LoanPaymentsCalculator)),
  "rate-reset": dynamic(() => import("./rate-reset-calculator").then((m) => m.RateResetCalculator)),
  leverage: dynamic(() => import("./leverage-calculator").then((m) => m.LeverageCalculator)),
  "npv-irr": dynamic(() => import("./npv-irr-calculator").then((m) => m.NpvIrrCalculator)),
  "after-tax": dynamic(() => import("./after-tax-calculator").then((m) => m.AfterTaxCalculator)),
  "exchange-1031": dynamic(() => import("./exchange-1031-calculator").then((m) => m.Exchange1031Calculator)),
  "sale-proceeds": dynamic(() => import("./sale-proceeds-calculator").then((m) => m.SaleProceedsCalculator)),
  "lease-rent": dynamic(() => import("./lease-rent-calculator").then((m) => m.LeaseRentCalculator)),
  "expense-recovery": dynamic(() => import("./expense-recovery-calculator").then((m) => m.ExpenseRecoveryCalculator)),
  "lease-rollover": dynamic(() => import("./lease-rollover-calculator").then((m) => m.LeaseRolloverCalculator)),
  "scenario-risk": dynamic(() => import("./scenario-risk-calculator").then((m) => m.ScenarioRiskCalculator)),
  "replacement-reserves": dynamic(() => import("./replacement-reserves-calculator").then((m) => m.ReplacementReservesCalculator)),
  "property-tax": dynamic(() => import("./property-tax-calculator").then((m) => m.PropertyTaxCalculator)),
};

export function ModuleCalculator({ id, ...props }: Props & { id: ModuleId }) {
  const C = CALCULATORS[id];
  return <C {...props} />;
}
