// What the site says about each module calculator (lib/calculators/modules.ts),
// read by calcMeta, the previews on /calculators and the calculator page. Pure
// and server-safe; each entry lives in its own components/calc/<id>-info.tsx.

import type { ReactNode } from "react";
import type { ModuleId } from "@/lib/calculators/modules";
import { afterTaxInfo } from "./after-tax-info";
import { capRateInfo } from "./cap-rate-info";
import { exchange1031Info } from "./exchange-1031-info";
import { expenseRecoveryInfo } from "./expense-recovery-info";
import { incomeValueInfo } from "./income-value-info";
import { leaseRentInfo } from "./lease-rent-info";
import { leaseRolloverInfo } from "./lease-rollover-info";
import { leverageInfo } from "./leverage-info";
import { loanPaymentsInfo } from "./loan-payments-info";
import type { CalcMeta } from "./meta";
import { npvIrrInfo } from "./npv-irr-info";
import { propertyTaxInfo } from "./property-tax-info";
import { rateResetInfo } from "./rate-reset-info";
import { replacementReservesInfo } from "./replacement-reserves-info";
import { saleProceedsInfo } from "./sale-proceeds-info";
import { scenarioRiskInfo } from "./scenario-risk-info";

export type ModuleInfo = {
  meta: CalcMeta;
  // the worked example's inputs in a few words, for a caption
  exampleLine: string;
  // the worked example's result in one sentence
  headline(): string;
  // the worked example drawn small, for /calculators and the home page
  preview(): ReactNode;
};

export const MODULE_INFO: Record<ModuleId, ModuleInfo> = {
  "income-value": incomeValueInfo,
  "cap-rate": capRateInfo,
  "loan-payments": loanPaymentsInfo,
  "rate-reset": rateResetInfo,
  leverage: leverageInfo,
  "npv-irr": npvIrrInfo,
  "after-tax": afterTaxInfo,
  "exchange-1031": exchange1031Info,
  "sale-proceeds": saleProceedsInfo,
  "lease-rent": leaseRentInfo,
  "expense-recovery": expenseRecoveryInfo,
  "lease-rollover": leaseRolloverInfo,
  "scenario-risk": scenarioRiskInfo,
  "replacement-reserves": replacementReservesInfo,
  "property-tax": propertyTaxInfo,
};

export function moduleInfo(id: string): ModuleInfo | null {
  return Object.hasOwn(MODULE_INFO, id) ? MODULE_INFO[id as ModuleId] : null;
}
