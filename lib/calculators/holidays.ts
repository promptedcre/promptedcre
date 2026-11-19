import { addDays, lastWeekday, nthWeekday, weekdayIndex, ymd } from "./dates";

export type Holiday = { date: string; name: string };

// Legal public holidays, 5 U.S.C. 6103(a).
export function federalHolidays(year: number): Holiday[] {
  return [
    { date: ymd(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), name: "Birthday of Martin Luther King, Jr." },
    { date: nthWeekday(year, 2, 1, 3), name: "Washington's Birthday" },
    { date: lastWeekday(year, 5, 1), name: "Memorial Day" },
    { date: ymd(year, 6, 19), name: "Juneteenth National Independence Day" },
    { date: ymd(year, 7, 4), name: "Independence Day" },
    { date: nthWeekday(year, 9, 1, 1), name: "Labor Day" },
    { date: nthWeekday(year, 10, 1, 2), name: "Columbus Day" },
    { date: ymd(year, 11, 11), name: "Veterans Day" },
    { date: nthWeekday(year, 11, 4, 4), name: "Thanksgiving Day" },
    { date: ymd(year, 12, 25), name: "Christmas Day" },
  ];
}

// The weekday each holiday is observed for most federal employees (OPM):
// a Saturday holiday on the Friday before, a Sunday holiday on the Monday after.
export function federalObserved(year: number): Holiday[] {
  const out: Holiday[] = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const h of federalHolidays(y)) {
      const w = weekdayIndex(h.date);
      const date = w === 6 ? addDays(h.date, -1) : w === 0 ? addDays(h.date, 1) : h.date;
      if (date.startsWith(`${year}-`)) out.push({ date, name: date === h.date ? h.name : `${h.name} (observed)` });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Texas national and state holidays, Tex. Gov't Code 662.003(a) and (b).
// Optional holidays (662.003(c)) are not included.
export function texasHolidays(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return [
    { date: ymd(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), name: "Martin Luther King, Jr., Day" },
    { date: ymd(year, 1, 19), name: "Confederate Heroes Day" },
    { date: nthWeekday(year, 2, 1, 3), name: "Presidents' Day" },
    { date: ymd(year, 3, 2), name: "Texas Independence Day" },
    { date: ymd(year, 4, 21), name: "San Jacinto Day" },
    { date: lastWeekday(year, 5, 1), name: "Memorial Day" },
    { date: ymd(year, 6, 19), name: "Emancipation Day in Texas" },
    { date: ymd(year, 7, 4), name: "Independence Day" },
    { date: ymd(year, 8, 27), name: "Lyndon Baines Johnson Day" },
    { date: nthWeekday(year, 9, 1, 1), name: "Labor Day" },
    { date: ymd(year, 11, 11), name: "Veterans Day" },
    { date: thanksgiving, name: "Thanksgiving Day" },
    { date: addDays(thanksgiving, 1), name: "Friday after Thanksgiving" },
    { date: ymd(year, 12, 24), name: "December 24" },
    { date: ymd(year, 12, 25), name: "Christmas Day" },
    { date: ymd(year, 12, 26), name: "December 26" },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function holidayOn(date: string, list: (year: number) => Holiday[]): Holiday | undefined {
  return list(Number(date.slice(0, 4))).find((h) => h.date === date);
}
