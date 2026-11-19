import { addDays } from "../calculators/dates";

// The calendar file a person imports into their calendar app (RFC 5545). Pure:
// the same deadlines and the same clock give the same bytes, so a file can be
// compared with the last one and a test can pin its exact text.

export type IcsItem = {
  id: string;
  title: string;
  due: string; // YYYY-MM-DD
  rule: string | null;
  ruleTitle?: string | null;
  basis: string | null;
  note: string | null;
  needsReview: boolean;
  status?: "open" | "done" | "dismissed";
};

export const REVIEW_SENTENCE = "Check this date before relying on it.";

const CRLF = "\r\n";
const MAX_OCTETS = 75;
const encoder = new TextEncoder();

// TEXT values escape backslash first, so the escapes added after it stay single.
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Folds one content line at 75 octets. A continuation starts with a space, which
// counts toward its 75. Splits only between code points, so a multi-byte
// character is never cut in half.
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (octets + size > MAX_OCTETS) {
      parts.push(current);
      current = ` ${ch}`;
      octets = 1 + size;
    } else {
      current += ch;
      octets += size;
    }
  }
  parts.push(current);
  return parts.join(CRLF);
}

const compactDate = (iso: string) => iso.replace(/-/g, "");

// 2026-11-12T12:00:00.000Z -> 20261112T120000Z
function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

function description(item: IcsItem): string {
  const lines: string[] = [];
  if (item.rule) lines.push(`Rule: ${item.rule}${item.ruleTitle ? ` (${item.ruleTitle})` : ""}`);
  if (item.basis) lines.push(`How the date was worked out: ${item.basis}`);
  if (item.note) lines.push(`Note: ${item.note}`);
  if (item.needsReview) lines.push(REVIEW_SENTENCE);
  return lines.join("\n");
}

function summary(item: IcsItem): string {
  if (item.status === "done") return `Done: ${item.title}`;
  if (item.status === "dismissed") return `Dismissed: ${item.title}`;
  return item.title;
}

export function toIcs(items: readonly IcsItem[], opts: { now: Date; productId: string }): string {
  const dtstamp = stamp(opts.now);
  const sorted = [...items].sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${opts.productId}`, "CALSCALE:GREGORIAN"];
  for (const item of sorted) {
    const text = description(item);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@promptedcre`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compactDate(item.due)}`,
      // DTEND is exclusive: an all-day event ends the next day.
      `DTEND;VALUE=DATE:${compactDate(addDays(item.due, 1))}`,
      `SUMMARY:${escapeText(summary(item))}`,
      ...(text ? [`DESCRIPTION:${escapeText(text)}`] : []),
      ...(item.status === "dismissed" ? ["STATUS:CANCELLED"] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
