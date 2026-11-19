// The date a page was built, as YYYY-MM-DD in United States Central time.
//
// The site prints "Counted <date>" beside numbers computed at build time. A build clock read
// in UTC is already tomorrow from 6 or 7 PM Central, and a count dated tomorrow reads as an
// error on a site whose pitch is precision. The catalog covers Federal and Texas law, so the
// date is read in the reader's own zone for that coverage.
const CENTRAL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function buildDate(now: Date = new Date()): string {
  return CENTRAL.format(now);
}
