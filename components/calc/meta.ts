// What the site says about each calculator beyond content/calculators.json:
// a one-line purpose and what its worked example is checked against, stated
// only as far as the tests in __tests__ really pin it.
// Pure data, so client and server code can both read it. The module
// calculators keep theirs in components/calc/<id>-info.tsx (module-info.ts).

import { moduleInfo } from "./module-info";

export type CalcId = "deadline-calendar" | "waterfall-promote" | "debt-sizing" | "returns-sensitivity";

export type CalcMeta = {
  purpose: string;
  // "excel": expected values computed in Excel and pinned in __tests__/calculators.test.ts.
  // "published": pinned against published schedules and a regulation's own example.
  // "independent": pinned against values computed a second way (Python) in its own test.
  // "none": a stub not yet checked against anything.
  checkedAgainst: "excel" | "published" | "independent" | "none";
  checkedShort: string;
  pinned: string[];
  tests: string[];
};

export const CALC_META: Record<CalcId, CalcMeta> = {
  "deadline-calendar": {
    purpose: "Turn a few known dates into the filing and contract deadlines that follow from them.",
    checkedAgainst: "published",
    checkedShort: "Published dates",
    pinned: [
      "The federal holiday list matches OPM's 2026 schedule, observed days included.",
      "The 1031 periods reproduce the regulation's own example, a transfer on November 16, 1992.",
      "In dated test cases, Form D and the Texas protest move past weekends and holidays, and the franchise report date past weekends.",
      "In this worked example every date cites its rule card and is flagged for review, and the closing date moves past a Sunday and Washington's Birthday.",
    ],
    tests: ["__tests__/deadlines.test.ts", "__tests__/franchise-deadline.test.ts"],
  },
  "waterfall-promote": {
    purpose: "Split a deal's cash between the investors and the operator's promote, tier by tier.",
    checkedAgainst: "excel",
    checkedShort: "Excel's IRR",
    pinned: [
      "The investor IRR is pinned, and Excel's IRR shows each tier stopping exactly at its hurdle: 8% for the pref, 12% for the first promote tier.",
      "No cash is created or lost: every year, the investors and the promote add up to the cash distributed.",
      "A simple and a compounding pref match a hand-worked case, a full catch-up brings the operator to its target share, and deal by deal pays more promote than whole fund when one deal loses money.",
      "The return before the promote, the operator's dollars, each tier's split, the seven outcome rows and the two break-even points match values computed a second way in Python, and on five test inputs every figure the calculator gave before those were added is unchanged.",
      "In whole-fund order with deals that end in different years, pinned cases show a better ending paying the investors less, a better ending lowering the promote, and a break-even reported at the first of two crossings. No gap between the two IRRs is stated when capital is called after cash has been paid out.",
    ],
    tests: ["__tests__/calculators.test.ts", "__tests__/calc-waterfall-outcomes.test.ts"],
  },
  "debt-sizing": {
    purpose: "Find the largest loan the lender's limits allow, and which limit sets it.",
    checkedAgainst: "excel",
    checkedShort: "Excel, to the cent",
    pinned: [
      "Each limit's loan and the largest loan are pinned to the cent against values computed in Excel.",
      "The interest-only and amortizing payments, interest and principal in years 1 and 3, and the balance at maturity match values Excel computed with PMT, IPMT, PPMT and FV.",
      "Coverage on the amortizing payment comes back at exactly the minimum, 1.25x, because coverage is the limit that binds.",
    ],
    tests: ["__tests__/calculators.test.ts"],
  },
  "returns-sensitivity": {
    purpose: "Measure a deal's IRR and multiple, and how they move with the exit cap rate and NOI growth.",
    checkedAgainst: "excel",
    checkedShort: "Excel's IRR",
    pinned: [
      "The unlevered and levered IRR match Excel's IRR to ten decimal places.",
      "The equity in at year 0 and the cash back in the sale year are pinned to the cent.",
      "The sensitivity table's two corners match Excel, and its center equals the levered IRR.",
    ],
    tests: ["__tests__/calculators.test.ts"],
  },
};

export function calcMeta(id: string): CalcMeta | null {
  return id in CALC_META ? CALC_META[id as CalcId] : (moduleInfo(id)?.meta ?? null);
}

// What the method section says a calculator's worked example is checked against.
export const CHECKED_NOTE: Record<CalcMeta["checkedAgainst"], string> = {
  excel: "Checked against Excel",
  published: "Checked against published dates",
  independent: "Checked by an independent calculation",
  none: "Not checked yet",
};

// How the worked example was checked, as a short answer under the label "Checked":
// "Against Excel's IRR", "By an independent calculation".
export function checkedHow(m: CalcMeta): string {
  switch (m.checkedAgainst) {
    case "excel":
      return `Against ${m.checkedShort}`;
    case "published":
      return "Against published dates";
    case "independent":
      return "By an independent calculation";
    case "none":
      return "Not checked yet";
  }
}

// The same as a sentence that stands alone in a list: "Checked against Excel's IRR".
export function checkedSentence(m: CalcMeta): string {
  const how = checkedHow(m);
  return m.checkedAgainst === "none" ? how : `Checked ${how.charAt(0).toLowerCase()}${how.slice(1)}`;
}
