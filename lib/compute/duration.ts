import type { Duration } from "../schemas/common";

// Effort is hands-on time and is summed. Elapsed is calendar time and follows
// the dependency chain. A business day counts as 7/5 of a calendar day when
// calendar totals are added up (stated on the Methodology page).

const EFFORT_MINUTES: Record<string, number> = { minutes: 1, hours: 60 };
const ELAPSED_HOURS: Record<string, number> = {
  hours: 1,
  days: 24,
  "business-days": 24 * 1.4,
  weeks: 168,
};

export function effortMinutes(d: Duration): { min: number; max: number } {
  const factor = EFFORT_MINUTES[d.unit];
  if (factor === undefined) throw new Error(`effort cannot be measured in ${d.unit}`);
  return { min: d.min * factor, max: d.max * factor };
}

export function elapsedHours(d: Duration): { min: number; max: number } {
  const factor = ELAPSED_HOURS[d.unit];
  if (factor === undefined) throw new Error(`elapsed time cannot be measured in ${d.unit}`);
  return { min: d.min * factor, max: d.max * factor };
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function formatMinutes(min: number, max: number): string {
  if (max < 60) return min === max ? `${trim(min)} min` : `${trim(min)}–${trim(max)} min`;
  const a = min / 60;
  const b = max / 60;
  return a === b ? `${trim(a)} h` : `${trim(a)}–${trim(b)} h`;
}

export function formatHours(min: number, max: number): string {
  if (max < 24) return min === max ? `${trim(min)} h` : `${trim(min)}–${trim(max)} h`;
  if (max < 24 * 21) {
    const a = Math.round((min / 24) * 10) / 10;
    const b = Math.round((max / 24) * 10) / 10;
    return a === b ? `${trim(a)} d` : `${trim(a)}–${trim(b)} d`;
  }
  const a = Math.round((min / 168) * 10) / 10;
  const b = Math.round((max / 168) * 10) / 10;
  return a === b ? `${trim(a)} wk` : `${trim(a)}–${trim(b)} wk`;
}

// The duration as authored, for a step's detail panel.
export function formatDuration(d: Duration): string {
  const unit: Record<string, string> = {
    minutes: "min",
    hours: "h",
    days: "calendar days",
    "business-days": "business days",
    weeks: "weeks",
  };
  const range = d.min === d.max ? trim(d.min) : `${trim(d.min)}–${trim(d.max)}`;
  return `${range} ${unit[d.unit]}`;
}
