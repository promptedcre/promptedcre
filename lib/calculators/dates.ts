// Calendar arithmetic on ISO dates (YYYY-MM-DD), in whole UTC days.

const DAY_MS = 86_400_000;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// The earliest year a calendar date may carry. A year written 0001 to 0099 is
// almost always a two-digit year padded out, so it is refused rather than read.
export const MIN_YEAR = 100;

// Date.UTC reads a year from 0 to 99 as 1900 to 1999, so "0027-02-01" would land in
// 1927. Here a year from 0100 on is counted as written (setUTCFullYear), and a year
// before 0100 has no day number at all: toDays gives NaN and fromDays gives "", so a
// round-trip check (fromDays(toDays(s)) === s) refuses it instead of reading it as 19xx.
export function toDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const year = y ?? 1970;
  if (!(year >= MIN_YEAR)) return Number.NaN;
  const t = new Date(0); // 1970-01-01T00:00:00Z: no hours to carry
  t.setUTCFullYear(year, (m ?? 1) - 1, d ?? 1);
  return Math.round(t.getTime() / DAY_MS);
}

// Why an ISO date is not one the calendars accept, or null when it is: written
// YYYY-MM-DD, a year of 0100 or later (a deliberate floor: it refuses a padded
// two-digit year and nothing else), and a day the calendar holds (2027-02-30 is not).
export function calendarDateProblem(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso}: expected a date written like 2026-11-11`;
  if (Number(iso.slice(0, 4)) < MIN_YEAR) return `${iso} has a two-digit year; write all four digits, like 2026`;
  if (fromDays(toDays(iso)) !== iso) return `${iso} is not a real calendar date`;
  return null;
}

export function isCalendarDate(iso: string): boolean {
  return calendarDateProblem(iso) === null;
}

export function fromDays(days: number): string {
  if (!Number.isFinite(days)) return ""; // no day number (see toDays): no date
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromDays(toDays(iso) + n);
}

export function weekdayIndex(iso: string): number {
  return (((toDays(iso) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function weekday(iso: string): string {
  return WEEKDAYS[weekdayIndex(iso)] ?? "";
}

export function isWeekend(iso: string): boolean {
  const w = weekdayIndex(iso);
  return w === 0 || w === 6;
}

export function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// n-th given weekday (0 = Sunday) of a month, month 1-12
export function nthWeekday(year: number, month: number, dow: number, n: number): string {
  const first = ymd(year, month, 1);
  const offset = (dow - weekdayIndex(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

export function lastWeekday(year: number, month: number, dow: number): string {
  const nextFirst = month === 12 ? ymd(year + 1, 1, 1) : ymd(year, month + 1, 1);
  const last = addDays(nextFirst, -1);
  const back = (weekdayIndex(last) - dow + 7) % 7;
  return addDays(last, -back);
}

export function laterOf(a: string, b: string): string {
  return a >= b ? a : b;
}

export function earlierOf(a: string, b: string): string {
  return a <= b ? a : b;
}
