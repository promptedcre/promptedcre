import { z } from "zod";
import { isoDate } from "../schemas/common";
import { fromDays, toDays } from "./dates";
import { defineModule } from "./module";
import { num, pct, type TraceLine, usd } from "./trace";

// A rent roll read as of one date: how much of the area and the rent expires in
// each calendar year and inside the hold, the weighted average remaining lease
// term, how concentrated the rent is, and in-place rent against market rent.
// Conventions: the analysis date is an input (never the clock); remaining term is
// whole days from the analysis date to the lease end, divided by 365; a row with
// no lease end and no rent is vacant; a row with no lease end and rent is
// month-to-month, and a lease that ended before the analysis date is a holdover:
// both count as expiring now, with no term left, in their own "now" bucket. Vacant
// space counts in area shares only. Nothing is rounded until it is shown.
//
// Optional downtime check (added 2026-11-14). On a building with one or two
// tenants vacancy is all or nothing, so a flat vacancy allowance can hide what the
// rent roll actually puts at risk. When the user gives the block, every row with rent
// whose lease ends before the hold's last day (month-to-month and holdover rows
// included) carries the user's own renewal probability and downtime in whole months;
// both are the user's judgment, never a built-in figure, and nothing here is a
// forecast or a market level. A zero-rent row, or a lease ending on the hold's last
// day, can lose nothing inside the hold and needs no entry. Conventions:
// - Vacancy starts the day after the lease end (on the analysis date for a holdover
//   or month-to-month row) and lasts the downtime: it ends on the same day of the
//   month that many months later, or on the last day of a shorter month. A lease
//   is assumed to roll once; the new lease is not rolled again inside the hold.
// - The rent lost is the row's in-place rent, held flat (no growth, no market rent).
// - Hold years run anniversary to anniversary from the analysis date. A vacant day
//   costs the row's annual rent ÷ the days in that hold year (365 or 366), so a
//   whole vacant hold year costs exactly one year's rent. Days past the hold's end
//   are not counted.
// - Expected loss is probability-weighted: (1 − renewal probability) × the loss if
//   the tenant leaves. The loss if every expiring tenant leaves is shown beside it.
// - Potential rent is the in-place rent of the occupied rows for every hold year;
//   space vacant at the analysis date adds nothing to it.
// - The equivalent flat vacancy is the expected loss ÷ potential rent over the hold:
//   the flat allowance that would take out the same dollars. A flat allowance the
//   user enters is applied to the same potential rent, and the difference is that
//   allowance less the expected loss (above zero: the flat figure covers more).

// How far past the analysis date a lease end may fall: long enough for a ground lease.
export const MAX_YEARS_OUT = 100;
export const MAX_ROWS = 100;

const DAYS_PER_YEAR = 365;

const shaped = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const realDate = (s: string) => shaped(s) && fromDays(toDays(s)) === s;

// A misshapen date is named once, by isoDate's own check; this one catches 2027-02-30.
const date = isoDate.refine((s) => !shaped(s) || realDate(s), { message: "not a real calendar date" });

// The same month and day, n years on; 29 February rolls to 1 March in a common year.
export function addYears(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return fromDays(Math.round(Date.UTC((y ?? 1970) + n, (m ?? 1) - 1, d ?? 1) / 86_400_000));
}

export const leaseRolloverRow = z
  .object({
    tenant: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe('the tenant\'s name or a label for the space ("Tenant A", "Vacant"); rows with the same name count as one tenant for concentration'),
    area: z.number().positive().describe("rentable area of the row, square feet"),
    annualRent: z.number().min(0).describe("in-place base rent, dollars a year; 0 with no lease end means the space is vacant"),
    leaseEnd: date
      .nullable()
      .describe("the last day of the lease, YYYY-MM-DD; null for vacant space or a month-to-month tenant; a date before the analysis date is a holdover"),
    marketRentPerSf: z
      .number()
      .positive()
      .nullable()
      .describe("market rent for the space, dollars per square foot per year, on the same expense basis as the in-place rent; null if not given"),
  })
  .strict();

// The same day of the month, n months on; a day the target month lacks becomes its last day.
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = (y ?? 1970) * 12 + ((m ?? 1) - 1) + n;
  const ty = Math.floor(target / 12);
  const tm = target - ty * 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromDays(Math.round(Date.UTC(ty, tm, Math.min(d ?? 1, last)) / 86_400_000));
}

export const MAX_DOWNTIME_MONTHS = 120;

export const downtimeLeaseInput = z
  .object({
    row: z
      .number()
      .int()
      .min(0)
      .max(MAX_ROWS - 1)
      .describe("which rent roll row this is, counted from 0 in the order the rows are listed; an occupied row"),
    renewalProbability: z
      .number()
      .min(0)
      .max(1)
      .describe("your own estimate of the chance this tenant renews or extends, as a decimal: 0.6 is 60%; a judgment, not a forecast"),
    downtimeMonths: z
      .number()
      .int()
      .min(0)
      .max(MAX_DOWNTIME_MONTHS)
      .describe("your own estimate of the whole months the space sits vacant before a new lease starts paying, if the tenant leaves"),
  })
  .strict();

export const downtimeCheckInput = z
  .object({
    leases: z
      .array(downtimeLeaseInput)
      .max(MAX_ROWS)
      .describe("one entry for every row with rent whose lease ends before the hold's last day (month-to-month and holdover rows included); a zero-rent row, or a lease ending later, needs none and if listed shows no loss"),
    flatVacancy: z
      .number()
      .min(0)
      .lt(1)
      .nullable()
      .describe("the flat vacancy allowance you were about to use, as a decimal share of potential rent: 0.05 is 5%; null leaves the comparison out"),
  })
  .strict();

export const leaseRolloverInput = z
  .object({
    analysisDate: date.describe("the date the rent roll is read as of, YYYY-MM-DD; every remaining term is measured from it"),
    holdYears: z
      .number()
      .int()
      .min(1)
      .max(50)
      .describe("the hold period in whole years from the analysis date; a lease whose end falls before the hold ends counts as expiring inside it"),
    rows: z.array(leaseRolloverRow).min(1).max(MAX_ROWS).describe(`the rent roll, one row per lease or vacant space, 1 to ${MAX_ROWS} rows`),
    // Optional, so an input written before this block existed still parses and gives the same figures.
    downtimeCheck: downtimeCheckInput
      .nullable()
      .optional()
      .describe(
        "optional check of a flat vacancy allowance against the rent the expiring leases put at risk during the hold, from your own renewal probability and downtime for each; null or left out skips it; it never changes the other figures",
      ),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!realDate(d.analysisDate)) return;
    const limit = addYears(d.analysisDate, MAX_YEARS_OUT);
    d.rows.forEach((r, i) => {
      if (r.leaseEnd !== null && realDate(r.leaseEnd) && r.leaseEnd > limit) {
        ctx.addIssue({ code: "custom", message: `the lease end must fall within ${MAX_YEARS_OUT} years of the analysis date, by ${limit}`, path: ["rows", i, "leaseEnd"] });
      }
    });
    const check = d.downtimeCheck;
    if (!check) return;
    const holdEnd = addYears(d.analysisDate, d.holdYears);
    const seen = new Set<number>();
    check.leases.forEach((l, k) => {
      const r = d.rows[l.row];
      const at = ["downtimeCheck", "leases", k, "row"];
      if (!r) ctx.addIssue({ code: "custom", message: `there is no row ${l.row}: the rent roll has rows 0 to ${d.rows.length - 1}`, path: at });
      else if (r.leaseEnd === null && r.annualRent === 0) ctx.addIssue({ code: "custom", message: `row ${l.row} is vacant: there is no lease to roll`, path: at });
      else if (seen.has(l.row)) ctx.addIssue({ code: "custom", message: `row ${l.row} is listed twice`, path: at });
      seen.add(l.row);
    });
    // An entry is required only where a judgment can change the figures: a row with
    // rent whose vacancy would start before the hold ends (month-to-month, holdover,
    // or a lease ending before the hold's last day). A zero-rent row, or a lease
    // ending on the hold's last day, can lose nothing; it may be listed, never must be.
    const holdLastDay = fromDays(toDays(holdEnd) - 1);
    d.rows.forEach((r, i) => {
      const atRisk = r.annualRent > 0 && (r.leaseEnd === null || r.leaseEnd < holdLastDay);
      if (atRisk && !seen.has(i)) {
        ctx.addIssue({ code: "custom", message: `row ${i} (${r.tenant}) expires inside the hold: give its renewal probability and downtime`, path: ["downtimeCheck", "leases"] });
      }
    });
  });

export type LeaseRolloverInput = z.infer<typeof leaseRolloverInput>;
export type LeaseRolloverRowInput = z.infer<typeof leaseRolloverRow>;

export type RowStatus = "lease" | "holdover" | "month-to-month" | "vacant";

export type RolloverRow = {
  tenant: string;
  area: number;
  annualRent: number;
  status: RowStatus;
  // the lease end, or the analysis date for a holdover or month-to-month row; null when vacant
  effectiveEnd: string | null;
  // years from the analysis date to the effective end (days ÷ 365); null when vacant
  remainingYears: number | null;
  insideHold: boolean;
  rentPerSf: number;
};

export type ExpiryBucket = {
  // "Now" for month-to-month and holdover rows, else the calendar year
  label: string;
  year: number | null;
  area: number;
  rent: number;
  areaShare: number;
  rentShare: number | null;
  cumulativeAreaShare: number;
  cumulativeRentShare: number | null;
  tenants: string[];
};

export type TenantShare = { tenant: string; area: number; rent: number; rentShare: number | null };

// row: the rent roll row it reads, counted from 0
export type MarkRow = { row: number; tenant: string; area: number; inPlacePerSf: number; marketPerSf: number; inPlace: number; market: number; difference: number };

export type MarkToMarket = {
  rows: MarkRow[];
  pricedArea: number;
  // the priced area as a share of the occupied area
  pricedShare: number;
  inPlace: number;
  market: number;
  // market less in-place: above zero means the in-place rent is below market
  difference: number;
  // the difference as a share of the priced rows' in-place rent; null when that rent is 0
  differenceShare: number | null;
};

// One expiring row in the downtime check. row: the rent roll row it reads, counted from 0.
export type DowntimeLease = {
  row: number;
  tenant: string;
  annualRent: number;
  renewalProbability: number;
  downtimeMonths: number;
  // false for a row the user listed that expires on or after the hold's end: no loss
  expiresInHold: boolean;
  // the first vacant day, and the first day a new lease pays (exclusive end); null when it does not expire in the hold
  vacancyStart: string | null;
  vacancyEnd: string | null;
  // vacant days that fall before the hold ends
  daysInHold: number;
  // the rent lost if the tenant leaves, and that times (1 − renewal probability)
  lossIfVacated: number;
  expectedLoss: number;
};

// One hold year, anniversary to anniversary; end is the next anniversary (exclusive).
export type DowntimeYear = {
  year: number;
  start: string;
  end: string;
  potentialRent: number;
  expectedLoss: number;
  lossIfNoneRenew: number;
  // expected loss ÷ potential rent; null when there is no rent
  lossShare: number | null;
  // the flat allowance on that year's potential rent, and it less the expected loss; null when no flat allowance is given
  flatAllowance: number | null;
  difference: number | null;
};

export type DowntimeCheck = {
  leases: DowntimeLease[];
  years: DowntimeYear[];
  potentialRent: number;
  expectedLoss: number;
  lossIfNoneRenew: number;
  // expected loss ÷ potential rent over the hold: the flat vacancy that takes out the same dollars; null when there is no rent
  equivalentFlatVacancy: number | null;
  flatVacancy: number | null;
  flatAllowance: number | null;
  // flat allowance less expected loss: above zero, the flat figure covers more than the rent roll's expected loss
  difference: number | null;
};

export type LeaseRolloverResult = {
  analysisDate: string;
  holdYears: number;
  holdEnd: string;
  totalArea: number;
  occupiedArea: number;
  vacantArea: number;
  occupiedShare: number;
  vacantShare: number;
  totalRent: number;
  rows: RolloverRow[];
  buckets: ExpiryBucket[];
  hold: { area: number; rent: number; areaShare: number; rentShare: number | null };
  waltByRent: number | null;
  waltByArea: number | null;
  tenants: TenantShare[];
  largestTenant: TenantShare | null;
  largestShare: number | null;
  topThreeShare: number | null;
  markToMarket: MarkToMarket | null;
  // null when the input carries no downtime check
  downtimeCheck: DowntimeCheck | null;
  trace: TraceLine[];
};

const yearOf = (iso: string) => Number(iso.slice(0, 4));
const years = (n: number) => `${num(n, 2)} years`;
const sf = (n: number) => `${num(n, 0)} SF`;

export function runLeaseRollover(raw: LeaseRolloverInput): LeaseRolloverResult {
  const d = leaseRolloverInput.parse(raw);
  const trace: TraceLine[] = [];
  const t0 = toDays(d.analysisDate);
  const holdEnd = addYears(d.analysisDate, d.holdYears);

  // 1. Each row: its status, effective end and remaining term.
  const rows: RolloverRow[] = d.rows.map((r) => {
    let status: RowStatus;
    if (r.leaseEnd === null) status = r.annualRent > 0 ? "month-to-month" : "vacant";
    else status = r.leaseEnd < d.analysisDate ? "holdover" : "lease";
    const effectiveEnd = status === "vacant" ? null : status === "lease" ? r.leaseEnd : d.analysisDate;
    const remainingYears = effectiveEnd === null ? null : Math.max(0, toDays(effectiveEnd) - t0) / DAYS_PER_YEAR;
    return {
      tenant: r.tenant,
      area: r.area,
      annualRent: r.annualRent,
      status,
      effectiveEnd,
      remainingYears,
      insideHold: effectiveEnd !== null && effectiveEnd < holdEnd,
      rentPerSf: r.annualRent / r.area,
    };
  });
  const occupied = rows.filter((r) => r.status !== "vacant");

  // 2. Occupancy and in-place rent.
  const totalArea = rows.reduce((s, r) => s + r.area, 0);
  const occupiedArea = occupied.reduce((s, r) => s + r.area, 0);
  const vacantArea = totalArea - occupiedArea;
  const occupiedShare = occupiedArea / totalArea;
  const vacantShare = vacantArea / totalArea;
  const totalRent = occupied.reduce((s, r) => s + r.annualRent, 0);
  const rentShareOf = (x: number) => (totalRent > 0 ? x / totalRent : null);
  trace.push(
    { label: "Total area", formula: `sum of the area on ${rows.length} rows`, value: sf(totalArea) },
    { label: "Occupied area", formula: "rows with a lease end or rent: leases, holdovers, month-to-month", value: sf(occupiedArea) },
    { label: "Vacant area", formula: `${sf(totalArea)} − ${sf(occupiedArea)}`, value: sf(vacantArea) },
    { label: "Occupied share", formula: `${sf(occupiedArea)} ÷ ${sf(totalArea)}`, value: pct(occupiedShare) },
    { label: "Vacant share", formula: `${sf(vacantArea)} ÷ ${sf(totalArea)}`, value: pct(vacantShare) },
    { label: "In-place rent", formula: `sum of base rent on ${occupied.length} occupied rows`, value: `${usd(totalRent, false)}/yr` },
  );
  for (const r of occupied) {
    trace.push({
      label: `${r.tenant}, ${sf(r.area)}: remaining term`,
      formula: r.status === "lease" ? `max(0, days from ${d.analysisDate} to ${r.effectiveEnd}) ÷ ${DAYS_PER_YEAR}` : `${r.status}: expiring now, no term left`,
      value: years(r.remainingYears ?? 0),
    });
  }

  // 3. Expirations: a "now" bucket, then every calendar year from the analysis year
  //    through the later of the last lease end and the year the hold's last day falls in.
  const leases = occupied.filter((r) => r.status === "lease");
  const firstYear = yearOf(d.analysisDate);
  const lastHoldYear = yearOf(fromDays(toDays(holdEnd) - 1));
  const lastYear = Math.max(lastHoldYear, ...leases.map((r) => yearOf(r.effectiveEnd ?? d.analysisDate)));
  const groups: Array<{ label: string; year: number | null; rows: RolloverRow[] }> = [
    { label: "Now", year: null, rows: occupied.filter((r) => r.status !== "lease") },
    ...Array.from({ length: lastYear - firstYear + 1 }, (_, k) => {
      const year = firstYear + k;
      return { label: String(year), year, rows: leases.filter((r) => yearOf(r.effectiveEnd ?? "") === year) };
    }),
  ];
  let cumArea = 0;
  let cumRent = 0;
  const buckets: ExpiryBucket[] = groups.map((g) => {
    const area = g.rows.reduce((s, r) => s + r.area, 0);
    const rent = g.rows.reduce((s, r) => s + r.annualRent, 0);
    cumArea += area;
    cumRent += rent;
    return {
      label: g.label,
      year: g.year,
      area,
      rent,
      areaShare: area / totalArea,
      rentShare: rentShareOf(rent),
      cumulativeAreaShare: cumArea / totalArea,
      cumulativeRentShare: rentShareOf(cumRent),
      tenants: g.rows.map((r) => r.tenant),
    };
  });
  for (const b of buckets) {
    if (b.area === 0) continue;
    trace.push({
      label: b.year === null ? "Expiring now (month-to-month, holdover)" : `Expiring in ${b.label}`,
      formula: `${b.tenants.join(", ")}: ${sf(b.area)} ÷ ${sf(totalArea)}; ${usd(b.rent, false)} ÷ ${usd(totalRent, false)}`,
      value: `${pct(b.areaShare)} area · ${b.rentShare === null ? "no rent" : `${pct(b.rentShare)} rent`}`,
    });
  }

  // 4. Inside the hold: occupied rows whose effective end falls before the hold ends.
  const inHold = occupied.filter((r) => r.insideHold);
  const holdArea = inHold.reduce((s, r) => s + r.area, 0);
  const holdRent = inHold.reduce((s, r) => s + r.annualRent, 0);
  const hold = { area: holdArea, rent: holdRent, areaShare: holdArea / totalArea, rentShare: rentShareOf(holdRent) };
  trace.push(
    { label: "Hold ends", formula: `${d.analysisDate} + ${d.holdYears} years`, value: holdEnd },
    { label: "Area expiring inside the hold", formula: `effective end before ${holdEnd}: ${sf(holdArea)} ÷ ${sf(totalArea)}`, value: pct(hold.areaShare) },
    {
      label: "Rent expiring inside the hold",
      formula: `${usd(holdRent, false)} ÷ ${usd(totalRent, false)}`,
      value: hold.rentShare === null ? "none" : pct(hold.rentShare),
    },
  );

  // 5. Weighted average remaining lease term, over occupied rows.
  const termRent = occupied.reduce((s, r) => s + (r.remainingYears ?? 0) * r.annualRent, 0);
  const termArea = occupied.reduce((s, r) => s + (r.remainingYears ?? 0) * r.area, 0);
  const waltByRent = totalRent > 0 ? termRent / totalRent : null;
  const waltByArea = occupiedArea > 0 ? termArea / occupiedArea : null;
  trace.push(
    {
      label: "Weighted average lease term, by rent",
      formula: waltByRent === null ? "no in-place rent to weight by" : `Σ(term × rent) ${num(termRent, 0)} ÷ ${usd(totalRent, false)}`,
      value: waltByRent === null ? "none" : years(waltByRent),
    },
    {
      label: "Weighted average lease term, by area",
      formula: waltByArea === null ? "no occupied area" : `Σ(term × area) ${num(termArea, 0)} ÷ ${sf(occupiedArea)}`,
      value: waltByArea === null ? "none" : years(waltByArea),
    },
  );

  // 6. Concentration: occupied rows grouped by tenant name, largest rent first (ties by name).
  const byName = new Map<string, TenantShare>();
  for (const r of occupied) {
    const t = byName.get(r.tenant) ?? { tenant: r.tenant, area: 0, rent: 0, rentShare: null };
    t.area += r.area;
    t.rent += r.annualRent;
    byName.set(r.tenant, t);
  }
  const tenants = [...byName.values()]
    .map((t) => ({ ...t, rentShare: rentShareOf(t.rent) }))
    .sort((a, b) => b.rent - a.rent || (a.tenant < b.tenant ? -1 : a.tenant > b.tenant ? 1 : 0));
  const largestTenant = tenants[0] ?? null;
  const topThree = tenants.slice(0, 3);
  const largestShare = largestTenant ? rentShareOf(largestTenant.rent) : null;
  const topThreeShare = topThree.length ? rentShareOf(topThree.reduce((s, t) => s + t.rent, 0)) : null;
  trace.push(
    {
      label: "Largest tenant's share of rent",
      formula: largestTenant ? `${largestTenant.tenant}: ${usd(largestTenant.rent, false)} ÷ ${usd(totalRent, false)}` : "no occupied rows",
      value: largestShare === null ? "none" : pct(largestShare),
    },
    {
      label: "Top three tenants' share of rent",
      formula: topThree.length ? `(${topThree.map((t) => usd(t.rent, false)).join(" + ")}) ÷ ${usd(totalRent, false)}` : "no occupied rows",
      value: topThreeShare === null ? "none" : pct(topThreeShare),
    },
  );

  // 7. In-place against market, on occupied rows that carry a market rent.
  const markRows: MarkRow[] = [];
  d.rows.forEach((r, i) => {
    const row = rows[i];
    if (!row || row.status === "vacant" || r.marketRentPerSf === null) return;
    const market = r.marketRentPerSf * row.area;
    markRows.push({ row: i, tenant: row.tenant, area: row.area, inPlacePerSf: row.rentPerSf, marketPerSf: r.marketRentPerSf, inPlace: row.annualRent, market, difference: market - row.annualRent });
  });
  let markToMarket: MarkToMarket | null = null;
  if (markRows.length > 0) {
    const pricedArea = markRows.reduce((s, m) => s + m.area, 0);
    const inPlace = markRows.reduce((s, m) => s + m.inPlace, 0);
    const market = markRows.reduce((s, m) => s + m.market, 0);
    const difference = market - inPlace;
    markToMarket = { rows: markRows, pricedArea, pricedShare: pricedArea / occupiedArea, inPlace, market, difference, differenceShare: inPlace > 0 ? difference / inPlace : null };
    for (const m of markRows) {
      trace.push({
        label: `${m.tenant}, ${sf(m.area)}: market less in-place`,
        formula: `${usd(m.marketPerSf)}/SF × ${sf(m.area)} − ${usd(m.inPlace, false)} (in place ${usd(m.inPlacePerSf)}/SF)`,
        value: usd(m.difference, false),
      });
    }
    trace.push(
      { label: "Market rent on the priced rows", formula: `Σ(market $/SF × area) over ${sf(pricedArea)}, ${pct(markToMarket.pricedShare)} of the occupied area`, value: `${usd(market, false)}/yr` },
      {
        label: "Market less in-place rent",
        formula: `${usd(market, false)} − ${usd(inPlace, false)}; above zero means the rents are below market`,
        value: `${usd(difference, false)}${markToMarket.differenceShare === null ? "" : ` (${pct(markToMarket.differenceShare)})`}`,
      },
    );
  } else {
    trace.push({ label: "Market less in-place rent", formula: "no occupied row has a market rent", value: "not given" });
  }

  // 8. Optional downtime check: the user's renewal probability and downtime on each expiring row.
  const downtimeCheck = d.downtimeCheck ? runDowntimeCheck(d.downtimeCheck, d.analysisDate, d.holdYears, holdEnd, rows, totalRent, trace) : null;

  return {
    analysisDate: d.analysisDate,
    holdYears: d.holdYears,
    holdEnd,
    totalArea,
    occupiedArea,
    vacantArea,
    occupiedShare,
    vacantShare,
    totalRent,
    rows,
    buckets,
    hold,
    waltByRent,
    waltByArea,
    tenants,
    largestTenant,
    largestShare,
    topThreeShare,
    markToMarket,
    downtimeCheck,
    trace,
  };
}

function runDowntimeCheck(
  check: z.infer<typeof downtimeCheckInput>,
  analysisDate: string,
  holdYears: number,
  holdEnd: string,
  rows: RolloverRow[],
  totalRent: number,
  trace: TraceLine[],
): DowntimeCheck {
  const yearBounds = Array.from({ length: holdYears }, (_, k) => ({ start: addYears(analysisDate, k), end: addYears(analysisDate, k + 1) }));
  const loss = yearBounds.map(() => ({ expected: 0, ifVacated: 0 }));
  const leases: DowntimeLease[] = [...check.leases]
    .sort((a, b) => a.row - b.row)
    .map((l) => {
      const r = rows[l.row] as RolloverRow; // the schema has checked the row exists and is occupied
      const base = { row: l.row, tenant: r.tenant, annualRent: r.annualRent, renewalProbability: l.renewalProbability, downtimeMonths: l.downtimeMonths };
      if (!r.insideHold || r.effectiveEnd === null) {
        return { ...base, expiresInHold: false, vacancyStart: null, vacancyEnd: null, daysInHold: 0, lossIfVacated: 0, expectedLoss: 0 };
      }
      const vacancyStart = r.status === "lease" ? fromDays(toDays(r.effectiveEnd) + 1) : analysisDate;
      const vacancyEnd = addMonths(vacancyStart, l.downtimeMonths);
      const vs = toDays(vacancyStart);
      const ve = toDays(vacancyEnd);
      let daysInHold = 0;
      let lossIfVacated = 0;
      yearBounds.forEach((y, k) => {
        const ys = toDays(y.start);
        const ye = toDays(y.end);
        const days = Math.max(0, Math.min(ve, ye) - Math.max(vs, ys));
        if (days === 0) return;
        const lost = (r.annualRent * days) / (ye - ys);
        daysInHold += days;
        lossIfVacated += lost;
        const slot = loss[k];
        if (slot) {
          slot.ifVacated += lost;
          slot.expected += (1 - l.renewalProbability) * lost;
        }
      });
      return { ...base, expiresInHold: true, vacancyStart, vacancyEnd, daysInHold, lossIfVacated, expectedLoss: (1 - l.renewalProbability) * lossIfVacated };
    });

  const flat = check.flatVacancy;
  const years: DowntimeYear[] = yearBounds.map((y, k) => {
    const expectedLoss = loss[k]?.expected ?? 0;
    const flatAllowance = flat === null ? null : flat * totalRent;
    return {
      year: k + 1,
      start: y.start,
      end: y.end,
      potentialRent: totalRent,
      expectedLoss,
      lossIfNoneRenew: loss[k]?.ifVacated ?? 0,
      lossShare: totalRent > 0 ? expectedLoss / totalRent : null,
      flatAllowance,
      difference: flatAllowance === null ? null : flatAllowance - expectedLoss,
    };
  });
  const potentialRent = totalRent * holdYears;
  const expectedLoss = leases.reduce((s, l) => s + l.expectedLoss, 0);
  const lossIfNoneRenew = leases.reduce((s, l) => s + l.lossIfVacated, 0);
  const equivalentFlatVacancy = potentialRent > 0 ? expectedLoss / potentialRent : null;
  const flatAllowance = flat === null ? null : flat * potentialRent;
  const difference = flatAllowance === null ? null : flatAllowance - expectedLoss;

  for (const l of leases) {
    trace.push({
      label: `${l.tenant}, row ${l.row}: expected rent lost to downtime`,
      formula: l.expiresInHold
        ? `(1 − ${l.renewalProbability} renewal probability) × ${usd(l.annualRent, false)}/yr over ${l.daysInHold} vacant days in the hold (vacant from ${l.vacancyStart}, a new lease paying from ${l.vacancyEnd}: ${l.downtimeMonths} ${l.downtimeMonths === 1 ? "month" : "months"}), each day ÷ the days in its hold year`
        : `expires on or after ${holdEnd}: no downtime inside the hold`,
      value: usd(l.expectedLoss, false),
    });
  }
  for (const y of years) {
    trace.push({
      label: `Hold year ${y.year}: expected downtime loss`,
      formula: `${y.start} to ${y.end}: ${usd(y.expectedLoss, false)} ÷ potential rent ${usd(y.potentialRent, false)}`,
      value: `${usd(y.expectedLoss, false)}${y.lossShare === null ? "" : ` (${pct(y.lossShare)})`}`,
    });
  }
  trace.push(
    { label: "Potential rent over the hold", formula: `in-place rent ${usd(totalRent, false)}/yr × ${holdYears} years, held flat`, value: usd(potentialRent, false) },
    { label: "Expected rent lost to downtime", formula: `Σ (1 − renewal probability) × loss if the tenant leaves, over ${leases.filter((l) => l.expiresInHold).length} expiring rows`, value: usd(expectedLoss, false) },
    { label: "Rent lost if no expiring tenant renews", formula: "the same downtime with every renewal probability set to 0", value: usd(lossIfNoneRenew, false) },
    {
      label: "Equivalent flat vacancy",
      formula: equivalentFlatVacancy === null ? "no in-place rent to divide by" : `${usd(expectedLoss, false)} ÷ ${usd(potentialRent, false)}`,
      value: equivalentFlatVacancy === null ? "none" : pct(equivalentFlatVacancy),
    },
  );
  if (flat === null || flatAllowance === null || difference === null) {
    trace.push({ label: "Flat allowance less expected loss", formula: "no flat vacancy allowance given", value: "not given" });
  } else {
    trace.push({
      label: "Flat allowance less expected loss",
      formula: `${pct(flat)} × ${usd(potentialRent, false)} = ${usd(flatAllowance, false)}, less ${usd(expectedLoss, false)}; above zero means the flat figure covers more`,
      value: usd(difference, false),
    });
  }
  return { leases, years, potentialRent, expectedLoss, lossIfNoneRenew, equivalentFlatVacancy, flatVacancy: flat, flatAllowance, difference };
}

// A made-up rent roll for a made-up building: round figures, one tenant in two
// suites, a holdover, a month-to-month tenant and a vacant suite.
export const LEASE_ROLLOVER_EXAMPLE: LeaseRolloverInput = {
  analysisDate: "2028-01-01",
  holdYears: 5,
  rows: [
    { tenant: "Tenant A", area: 50_000, annualRent: 500_000, leaseEnd: "2030-12-31", marketRentPerSf: 11 },
    { tenant: "Tenant B", area: 30_000, annualRent: 360_000, leaseEnd: "2034-06-30", marketRentPerSf: 11.5 },
    { tenant: "Tenant C", area: 10_000, annualRent: 140_000, leaseEnd: "2027-09-30", marketRentPerSf: 13 },
    { tenant: "Tenant D", area: 10_000, annualRent: 120_000, leaseEnd: null, marketRentPerSf: null },
    { tenant: "Tenant A", area: 5_000, annualRent: 60_000, leaseEnd: "2029-12-31", marketRentPerSf: 13 },
    { tenant: "Vacant", area: 15_000, annualRent: 0, leaseEnd: null, marketRentPerSf: null },
  ],
};

// The same made-up rent roll with the optional downtime check: the renewal
// probabilities, downtimes and flat allowance are made-up examples of a user's own
// judgment, not market figures. Row 1 (Tenant B) ends after the hold and needs no entry.
export const LEASE_ROLLOVER_DOWNTIME_EXAMPLE: LeaseRolloverInput = {
  ...LEASE_ROLLOVER_EXAMPLE,
  downtimeCheck: {
    leases: [
      { row: 0, renewalProbability: 0.5, downtimeMonths: 9 },
      { row: 2, renewalProbability: 0.25, downtimeMonths: 6 },
      { row: 3, renewalProbability: 0.75, downtimeMonths: 3 },
      { row: 4, renewalProbability: 0.5, downtimeMonths: 12 },
    ],
    flatVacancy: 0.05,
  },
};

export const leaseRolloverModule = defineModule({ id: "lease-rollover", input: leaseRolloverInput, run: runLeaseRollover, example: LEASE_ROLLOVER_EXAMPLE });
