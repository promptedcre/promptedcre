import { z } from "zod";
import { isoDate } from "../schemas/common";
import { fromDays, toDays } from "./dates";
import { annualSchedule } from "./debt";
import { fv, pmt, pv } from "./finance";
import { defineModule } from "./module";
import { pct, type TraceLine, usd } from "./trace";

// One loan, four ways to pay it back: a level payment, equal principal, interest
// only and a stepped payment that rises on each loan anniversary. Payments are
// monthly, in arrears, at the nominal annual rate divided by twelve. Nothing is
// rounded until it is shown.
//
// An optional block checks the interest between two dates on the day-count basis
// the loan documents state: simple interest on a balance that does not move. It
// never changes the monthly schedule, which stays on the annual rate over twelve.

// The ids an agent sends.
export const ACCRUAL_BASES = ["actual-360", "actual-365", "30-360"] as const;
export type AccrualBasis = (typeof ACCRUAL_BASES)[number];

// The same three as a person reads them: on the page, in the trace and in the notes.
export const ACCRUAL_BASIS_LABEL: Record<AccrualBasis, string> = { "actual-360": "actual/360", "actual-365": "actual/365", "30-360": "30/360" };

// The most days the two dates may be apart: a short stretch, never a schedule.
export const ACCRUAL_MAX_DAYS = 366;

// A date the calendar holds: 2027-02-30 is not one.
const isCalendarDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && fromDays(toDays(iso)) === iso;

const accrualInput = z
  .object({
    basis: z
      .enum(ACCRUAL_BASES)
      .describe("the day-count basis the loan documents state: actual-360 (actual days over 360), actual-365 (actual days over 365, in a leap year too) or 30-360 (30-day months over 360); read it off the loan documents"),
    from: isoDate.describe("the first day interest runs, written YYYY-MM-DD; this day counts"),
    to: isoDate.describe("the day interest stops, written YYYY-MM-DD; this day does not count; later than from, and no more than 366 days later"),
    balance: z
      .number()
      .positive()
      .nullable()
      .describe("the principal the interest runs on, dollars, taken as unchanged between the two dates; null uses the loan amount"),
  })
  .strict()
  .superRefine((a, ctx) => {
    let real = true;
    for (const k of ["from", "to"] as const) {
      const v: unknown = a[k];
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        real = false; // already refused by the field's own check
      } else if (Number(v.slice(0, 4)) < 100) {
        // The day arithmetic cannot read a year before 0100, so it is refused, not miscounted.
        real = false;
        ctx.addIssue({ code: "custom", message: "the year must be 0100 or later", path: [k] });
      } else if (!isCalendarDate(v)) {
        real = false;
        ctx.addIssue({ code: "custom", message: `${v} is not a real calendar date`, path: [k] });
      }
    }
    if (!real) return;
    const days = toDays(a.to) - toDays(a.from);
    if (days <= 0) {
      ctx.addIssue({ code: "custom", message: "must be later than the first day interest runs", path: ["to"] });
    } else if (days > ACCRUAL_MAX_DAYS) {
      ctx.addIssue({ code: "custom", message: `must be within ${ACCRUAL_MAX_DAYS} days of the first day; these dates are ${days} days apart`, path: ["to"] });
    }
  });

export type AccrualInput = z.infer<typeof accrualInput>;

export const loanPaymentsInput = z
  .object({
    loan: z.number().positive().describe("loan amount, dollars"),
    rate: z.number().min(0).max(0.3).describe("annual interest rate as a decimal: 0.06 is 6%; the monthly rate is this divided by 12"),
    amortYears: z.number().int().min(1).max(40).describe("amortization period in whole years; level and equal-principal payments are figured over it"),
    termYears: z.number().int().min(1).max(40).describe("loan term in whole years, when the balance falls due; cannot exceed the amortization"),
    steppedFirstPayment: z
      .number()
      .positive()
      .nullable()
      .describe("stepped loan: the monthly payment in loan year 1, dollars; null leaves the stepped loan out"),
    steppedGrowth: z
      .number()
      .min(0)
      .max(0.5)
      .describe("stepped loan: how much the monthly payment rises on each loan anniversary, as a decimal: 0.04 is 4%; ignored when there is no stepped loan"),
    // Optional, so an input written before this block existed still parses.
    accrual: accrualInput
      .nullable()
      .optional()
      .describe(
        "optional check of the interest between two dates on the loan's day-count basis, as simple interest on an unchanged balance (closing to the first payment date, or the last payment to a payoff); null or left out skips it; it never changes the monthly schedule",
      ),
  })
  .strict()
  .refine((d) => d.termYears <= d.amortYears, { message: "term cannot exceed amortization", path: ["termYears"] });

export type LoanPaymentsInput = z.infer<typeof loanPaymentsInput>;

export type StructureKey = "level" | "equal-principal" | "interest-only" | "stepped";

export type LoanYear = {
  year: number;
  beginBalance: number;
  payment: number; // the twelve payments made in the year, summed
  interest: number;
  principal: number; // negative when the balance grew
  endBalance: number;
  balanceGrows: boolean; // at least one month in the year paid less than its interest
};

export type StructureResult = {
  key: StructureKey;
  label: string;
  firstPayment: number; // month 1
  lastPayment: number; // the term's last month; 0 when the loan was paid off before it
  years: LoanYear[];
  balanceAtMaturity: number;
  totalPaid: number;
  totalInterest: number;
  totalPrincipal: number; // the loan less the balance at maturity
  loanConstant: number; // year-1 payments over the loan
  negAmYears: number[]; // loan years in which the balance grows
  peakBalance: number; // the highest balance at closing or at a year end
  peakYear: number; // 0 means at closing
  paidOffMonth: number | null; // the month the balance reached zero, if it did
};

export type AccrualResult = {
  basis: AccrualBasis;
  from: string; // the first day interest runs; counted
  to: string; // the day interest stops; not counted
  actualDays: number; // calendar days from `from` to `to`
  countedDays: number; // the days interest is charged for: the actual days, or 30-day months on 30-360
  balance: number; // the balance used: the one given, or the loan
  interest: number; // balance × rate × counted days ÷ 360 (365 on actual-365)
  dailyInterest: number; // balance × rate ÷ 360 (365 on actual-365)
  yearCostRate: number; // what the stated rate costs over a 365-day year on the basis, as a share of the balance
  notes: string[]; // 30-360 only: one line for each reason a date could count differently under another thirty-day-month rule
};

export type LoanPaymentsResult = {
  monthlyRate: number;
  amortMonths: number;
  termMonths: number;
  level: StructureResult;
  equalPrincipal: StructureResult;
  interestOnly: StructureResult;
  stepped: StructureResult | null;
  effectiveAnnualRate: number; // (1 + rate ÷ 12)^12 − 1: the stated rate compounded monthly
  accrual: AccrualResult | null; // null when the block was not given
  trace: TraceLine[];
};

// A balance within a millionth of a dollar of zero is zero, so a loan paid off
// to the cent never shows as "-$0.00".
const clean = (n: number) => (Math.abs(n) < 1e-6 ? 0 : n);

// Month by month: interest on the opening balance, then the payment. A payment
// that would take the balance below zero pays it off exactly, and nothing is
// paid after that.
function monthByMonth(loan: number, i: number, months: number, paymentFor: (month: number) => number) {
  const years: LoanYear[] = [];
  const payments: number[] = [];
  let balance = loan;
  let paidOffMonth: number | null = null;
  for (let m = 1; m <= months; m += 1) {
    if ((m - 1) % 12 === 0) years.push({ year: (m - 1) / 12 + 1, beginBalance: balance, payment: 0, interest: 0, principal: 0, endBalance: balance, balanceGrows: false });
    const y = years[years.length - 1] as LoanYear;
    const interest = balance * i;
    let payment = balance > 0 ? paymentFor(m) : 0;
    let next = balance + interest - payment;
    if (balance > 0 && next <= 1e-9) {
      payment = balance + interest;
      next = 0;
      paidOffMonth = m;
    }
    y.payment += payment;
    y.interest += interest;
    y.principal += payment - interest;
    y.endBalance = clean(next);
    if (payment < interest) y.balanceGrows = true;
    payments.push(payment);
    balance = next;
  }
  return { years, payments, paidOffMonth };
}

function summarize(key: StructureKey, label: string, loan: number, years: LoanYear[], first: number, last: number, paidOffMonth: number | null): StructureResult {
  const totalPaid = years.reduce((s, y) => s + y.payment, 0);
  const totalInterest = years.reduce((s, y) => s + y.interest, 0);
  const balanceAtMaturity = years.at(-1)?.endBalance ?? loan;
  let peakBalance = loan;
  let peakYear = 0;
  for (const y of years) {
    if (y.endBalance > peakBalance) {
      peakBalance = y.endBalance;
      peakYear = y.year;
    }
  }
  return {
    key,
    label,
    firstPayment: first,
    lastPayment: last,
    years,
    balanceAtMaturity,
    totalPaid,
    totalInterest,
    totalPrincipal: loan - balanceAtMaturity,
    loanConstant: (years[0]?.payment ?? 0) / loan,
    negAmYears: years.filter((y) => y.balanceGrows).map((y) => y.year),
    peakBalance,
    peakYear,
    paidOffMonth,
  };
}

export function yearList(ys: number[]): string {
  if (ys.length === 0) return "none";
  if (ys.length === 1) return `year ${ys[0]}`;
  const consecutive = ys.every((y, k) => k === 0 || y === (ys[k - 1] as number) + 1);
  return consecutive ? `years ${ys[0]} to ${ys.at(-1)}` : `years ${ys.join(", ")}`;
}

const dayCount = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const dateParts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
};

// Interest between two dates, as simple interest on a balance that does not move.
// The first day counts and the last does not. The loan documents control: this
// checks a lender's figure and is not a payoff quote.
function accrue(a: AccrualInput, loan: number, rate: number, trace: TraceLine[]): AccrualResult {
  const rp = pct(rate, 4);
  const actualDays = toDays(a.to) - toDays(a.from);
  trace.push({ label: "Between dates: actual days", formula: `${a.from} to ${a.to}; the first day counts, the last does not`, value: dayCount(actualDays) });

  const notes: string[] = [];
  let countedDays = actualDays;
  if (a.basis === "30-360") {
    // The plain thirty-day-month count: a 31st on either date is a 30th, and
    // February is left as it is.
    const p1 = dateParts(a.from);
    const p2 = dateParts(a.to);
    const d1 = Math.min(p1.d, 30);
    const d2 = Math.min(p2.d, 30);
    countedDays = 360 * (p2.y - p1.y) + 30 * (p2.m - p1.m) + (d2 - d1);
    trace.push({
      label: "Between dates: days counted",
      formula: `360 × (${p2.y} − ${p1.y}) + 30 × (${p2.m} − ${p1.m}) + (${d2} − ${d1})${p1.d === 31 || p2.d === 31 ? ", a 31st counted as a 30th" : ""}`,
      value: dayCount(countedDays),
    });
    // One line for each reason a date is flagged, the earlier date's reason first.
    // Two dates flagged for the same reason share a line.
    const dates = [
      [a.from, p1],
      [a.to, p2],
    ] as const;
    const reasons = [
      { flagged: dates.filter(([, p]) => p.d === 31).map(([iso]) => iso), one: "is a 31st", both: "are each a 31st", then: "counted here as a 30th" },
      {
        flagged: dates.filter(([, p]) => p.m === 2 && p.d >= 28).map(([iso]) => iso),
        one: "is in the last days of February",
        both: "are both in the last days of February",
        then: "which this count does not adjust",
      },
    ]
      .filter((x) => x.flagged.length > 0)
      .sort((x, y) => ((x.flagged[0] ?? "") < (y.flagged[0] ?? "") ? -1 : 1));
    for (const x of reasons) {
      const two = x.flagged.length === 2;
      notes.push(
        `${x.flagged.join(" and ")} ${two ? x.both : x.one}, ${x.then}. Check the day count against the loan documents: their own thirty-day-month rule can count ${two ? "these dates" : "this date"} differently.`,
      );
    }
  } else {
    trace.push({ label: "Between dates: days counted", formula: `${ACCRUAL_BASIS_LABEL[a.basis]} charges the actual days`, value: dayCount(countedDays) });
  }

  const yearDays = a.basis === "actual-365" ? 365 : 360;
  const balance = a.balance ?? loan;
  trace.push({ label: "Between dates: balance the interest runs on", formula: a.balance === null ? "none given: the loan amount" : "as given, unchanged between the dates", value: usd(balance) });

  const dailyInterest = (balance * rate) / yearDays;
  trace.push({ label: "Between dates: a day's interest", formula: `${usd(balance)} × ${rp} ÷ ${yearDays}`, value: usd(dailyInterest) });

  // The days over the year first, so a whole year on its own basis is exactly balance × rate.
  const interest = balance * rate * (countedDays / yearDays);
  trace.push({ label: "Between dates: interest", formula: `${usd(balance)} × ${rp} × ${countedDays} ÷ ${yearDays}`, value: usd(interest) });

  const yearCostRate = a.basis === "actual-360" ? (rate * 365) / 360 : rate;
  trace.push({
    label: "Between dates: a year's cost on the basis",
    formula: a.basis === "actual-360" ? `${rp} × 365 ÷ 360, over a 365-day year` : "the stated rate, over a 365-day year",
    value: pct(yearCostRate, 4),
  });

  return { basis: a.basis, from: a.from, to: a.to, actualDays, countedDays, balance, interest, dailyInterest, yearCostRate, notes };
}

export function runLoanPayments(raw: LoanPaymentsInput): LoanPaymentsResult {
  const d = loanPaymentsInput.parse(raw);
  const L = d.loan;
  const i = d.rate / 12;
  const n = d.amortYears * 12;
  const T = d.termYears * 12;
  const ip = pct(i, 4);
  const trace: TraceLine[] = [];

  trace.push({ label: "Monthly rate", formula: `${pct(d.rate, 4)} ÷ 12`, value: ip });
  trace.push({ label: "Months of amortization", formula: `${d.amortYears} years × 12`, value: String(n) });
  trace.push({ label: "Months in the term", formula: `${d.termYears} years × 12`, value: String(T) });

  // ---------- level payment ----------
  const levelPayment = -pmt(i, n, L);
  trace.push({ label: "Level payment, a month", formula: i === 0 ? `${usd(L)} ÷ ${n}` : `PMT(${ip}, ${n}, ${usd(L)})`, value: usd(levelPayment) });
  const levelYears: LoanYear[] = annualSchedule(L, d.rate, d.amortYears, 0, d.termYears).map((y) => ({ ...y, endBalance: clean(y.endBalance), balanceGrows: false }));
  const level = summarize("level", "Level payment", L, levelYears, levelPayment, levelPayment, null);
  // The balance at maturity is the closed form; the month-by-month schedule agrees with it (tested).
  level.balanceAtMaturity = clean(-fv(i, T, -levelPayment, L));
  level.totalPrincipal = L - level.balanceAtMaturity;
  trace.push({ label: "Level: loan constant, a year", formula: `12 × ${usd(levelPayment)} ÷ ${usd(L)}`, value: pct(level.loanConstant, 4) });
  trace.push({
    label: "Level: balance due at maturity",
    formula: T === n ? "term equals amortization, so the loan is paid off" : `FV(${ip}, ${T}, ${usd(levelPayment)}, ${usd(L)})`,
    value: usd(level.balanceAtMaturity),
  });
  if (T < n) {
    trace.push({ label: "Level: the same balance as the payments left, discounted", formula: `PV(${ip}, ${n - T}, ${usd(levelPayment)})`, value: usd(pv(i, n - T, -levelPayment)) });
  }
  trace.push({ label: "Level: total interest over the term", formula: `${T} × ${usd(levelPayment)} − (${usd(L)} − ${usd(level.balanceAtMaturity)})`, value: usd(level.totalInterest) });

  // ---------- equal principal ----------
  const slice = L / n;
  const ep = monthByMonth(L, i, T, (m) => slice + L * (1 - (m - 1) / n) * i);
  const equalPrincipal = summarize("equal-principal", "Equal principal", L, ep.years, ep.payments[0] ?? 0, ep.payments.at(-1) ?? 0, null);
  trace.push({ label: "Equal principal: principal each month", formula: `${usd(L)} ÷ ${n}`, value: usd(slice) });
  trace.push({ label: "Equal principal: first payment", formula: `${usd(slice)} + ${ip} × ${usd(L)}`, value: usd(equalPrincipal.firstPayment) });
  trace.push({
    label: `Equal principal: payment in month ${T}`,
    formula: `${usd(slice)} + ${ip} × ${usd(L * (1 - (T - 1) / n))}`,
    value: usd(equalPrincipal.lastPayment),
  });
  trace.push({ label: "Equal principal: year-1 loan constant", formula: `${usd(equalPrincipal.years[0]?.payment ?? 0)} ÷ ${usd(L)}`, value: pct(equalPrincipal.loanConstant, 4) });
  trace.push({ label: "Equal principal: balance due at maturity", formula: `${usd(L)} × (1 − ${T} ÷ ${n})`, value: usd(equalPrincipal.balanceAtMaturity) });
  trace.push({
    label: "Equal principal: total interest over the term",
    formula: `${T} months of ${ip} × the balance at the start of the month, summed`,
    value: usd(equalPrincipal.totalInterest),
  });

  // ---------- interest only ----------
  const ioPayment = L * i;
  const ioYears: LoanYear[] = annualSchedule(L, d.rate, 0, 0, d.termYears).map((y) => ({ ...y, endBalance: L, balanceGrows: false }));
  const interestOnly = summarize("interest-only", "Interest only", L, ioYears, ioPayment, ioPayment, null);
  trace.push({ label: "Interest only: payment, a month", formula: `${usd(L)} × ${ip}`, value: usd(ioPayment) });
  trace.push({ label: "Interest only: loan constant, a year", formula: "the annual rate", value: pct(interestOnly.loanConstant, 4) });
  trace.push({ label: "Interest only: balance due at maturity", formula: "no principal is paid: the full loan", value: usd(interestOnly.balanceAtMaturity) });
  trace.push({ label: "Interest only: total interest over the term", formula: `${T} × ${usd(ioPayment)}`, value: usd(interestOnly.totalInterest) });

  // ---------- stepped payment ----------
  let stepped: StructureResult | null = null;
  if (d.steppedFirstPayment !== null) {
    const P1 = d.steppedFirstPayment;
    const g = d.steppedGrowth;
    const run = monthByMonth(L, i, T, (m) => P1 * (1 + g) ** Math.floor((m - 1) / 12));
    stepped = summarize("stepped", "Stepped payment", L, run.years, run.payments[0] ?? 0, run.payments.at(-1) ?? 0, run.paidOffMonth);
    const firstInterest = L * i;
    trace.push({
      label: "Stepped: first payment against month-1 interest",
      formula: `${usd(stepped.firstPayment)} vs ${ip} × ${usd(L)} = ${usd(firstInterest)}`,
      value: stepped.firstPayment < firstInterest ? "balance grows" : "balance falls",
    });
    trace.push({
      label: `Stepped: payment in month ${T}`,
      formula:
        run.paidOffMonth !== null && run.paidOffMonth < T
          ? `paid off in month ${run.paidOffMonth}; nothing is due after it`
          : `${usd(P1)} × (1 + ${pct(g)})^${d.termYears - 1}${run.paidOffMonth === T ? ", capped at the balance left" : ""}`,
      value: usd(stepped.lastPayment),
    });
    trace.push({ label: "Stepped: years the balance grows", formula: "a year in which any month pays less than its interest", value: yearList(stepped.negAmYears) });
    trace.push({
      label: "Stepped: highest balance",
      formula: stepped.peakYear === 0 ? "never above the loan" : `at the end of year ${stepped.peakYear}`,
      value: usd(stepped.peakBalance),
    });
    trace.push({ label: "Stepped: year-1 loan constant", formula: `${usd(stepped.years[0]?.payment ?? 0)} ÷ ${usd(L)}`, value: pct(stepped.loanConstant, 4) });
    trace.push({ label: "Stepped: balance due at maturity", formula: `balance + interest − payment, month by month, ${T} times`, value: usd(stepped.balanceAtMaturity) });
    trace.push({
      label: "Stepped: total interest over the term",
      formula: `${T} months of ${ip} × the balance at the start of the month, summed`,
      value: usd(stepped.totalInterest),
    });
  }

  // ---------- the stated rate, compounded monthly ----------
  const effectiveAnnualRate = (1 + i) ** 12 - 1;
  trace.push({ label: "Effective annual rate", formula: `(1 + ${ip})^12 − 1`, value: pct(effectiveAnnualRate, 4) });

  // ---------- interest between two dates ----------
  const accrual = d.accrual ? accrue(d.accrual, L, d.rate, trace) : null;

  return { monthlyRate: i, amortMonths: n, termMonths: T, level, equalPrincipal, interestOnly, stepped, effectiveAnnualRate, accrual, trace };
}

// Made-up dates: a closing on the 12th, with interest to the first of the next
// month, on a basis picked for the example. A real loan's documents state its own.
export const ACCRUAL_EXAMPLE: AccrualInput = {
  basis: "actual-360",
  from: "2027-03-12",
  to: "2027-04-01",
  balance: null,
};

export const LOAN_PAYMENTS_EXAMPLE: LoanPaymentsInput = {
  loan: 1_500_000,
  rate: 0.07,
  amortYears: 30,
  termYears: 10,
  steppedFirstPayment: 8_000,
  steppedGrowth: 0.03,
  accrual: ACCRUAL_EXAMPLE,
};

export const loanPaymentsModule = defineModule({ id: "loan-payments", input: loanPaymentsInput, run: runLoanPayments, example: LOAN_PAYMENTS_EXAMPLE });
