import { afterTaxModule } from "./after-tax";
import { capRateModule } from "./cap-rate";
import { exchange1031Module } from "./exchange-1031";
import { expenseRecoveryModule } from "./expense-recovery";
import { incomeValueModule } from "./income-value";
import { leaseRentModule } from "./lease-rent";
import { leaseRolloverModule } from "./lease-rollover";
import { leverageModule } from "./leverage";
import { loanPaymentsModule } from "./loan-payments";
import type { CalcModule, CalcResult } from "./module";
import { npvIrrModule } from "./npv-irr";
import { propertyTaxModule } from "./property-tax";
import { rateResetModule } from "./rate-reset";
import { replacementReservesModule } from "./replacement-reserves";
import { saleProceedsModule } from "./sale-proceeds";
import { scenarioRiskModule } from "./scenario-risk";

// The calculators that share one module shape (lib/calculators/module.ts) and
// one connector tool, calc_run. The first four calculators keep their own
// functions and tools and are not listed here. Order is the catalog's.

export const MODULE_IDS = [
  "income-value",
  "cap-rate",
  "loan-payments",
  "rate-reset",
  "leverage",
  "npv-irr",
  "after-tax",
  "exchange-1031",
  "sale-proceeds",
  "lease-rent",
  "expense-recovery",
  "lease-rollover",
  "scenario-risk",
  "replacement-reserves",
  "property-tax",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const MODULES = {
  "income-value": incomeValueModule,
  "cap-rate": capRateModule,
  "loan-payments": loanPaymentsModule,
  "rate-reset": rateResetModule,
  leverage: leverageModule,
  "npv-irr": npvIrrModule,
  "after-tax": afterTaxModule,
  "exchange-1031": exchange1031Module,
  "sale-proceeds": saleProceedsModule,
  "lease-rent": leaseRentModule,
  "expense-recovery": expenseRecoveryModule,
  "lease-rollover": leaseRolloverModule,
  "scenario-risk": scenarioRiskModule,
  "replacement-reserves": replacementReservesModule,
  "property-tax": propertyTaxModule,
} satisfies Record<ModuleId, CalcModule>;

export function isModuleCalc(id: string): id is ModuleId {
  return Object.hasOwn(MODULES, id);
}

export function getModule(id: ModuleId): CalcModule {
  return MODULES[id] as CalcModule;
}

// Parses raw input against the module's schema (throws a ZodError) and runs it.
export function runModule(id: ModuleId, raw: unknown): CalcResult {
  const m = getModule(id);
  return m.run(m.input.parse(raw));
}
