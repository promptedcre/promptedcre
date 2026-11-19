// Every calculator returns a trace: the formulas it ran, in order, with values.

export type TraceLine = { label: string; formula: string; value: string };

// True when a formatted number is zero at the digits shown ("0", "0.00", "0,000.00"),
// so a tiny negative left by floating point prints as zero, never as minus zero.
const roundsToZero = (digits: string) => /^[0.,]+$/.test(digits);
const unsign = (s: string) => (s.startsWith("-") && roundsToZero(s.slice(1)) ? s.slice(1) : s);

export function usd(n: number, cents = true): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const sign = n < 0 && !roundsToZero(abs) ? "-" : "";
  return `${sign}$${abs}`;
}

export function pct(n: number, digits = 2): string {
  return `${unsign((n * 100).toFixed(digits))}%`;
}

export function num(n: number, digits = 2): string {
  return unsign(n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
}

export function multiple(n: number): string {
  return `${unsign(n.toFixed(2))}x`;
}

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
