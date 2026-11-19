// Time-value functions that follow Excel's definitions and sign conventions
// (cash received is positive, cash paid is negative). Cross-checked against
// Excel in __tests__/calculators.test.ts.

export function pmt(rate: number, nper: number, pv: number, fv = 0, type: 0 | 1 = 0): number {
  if (rate === 0) return -(pv + fv) / nper;
  const growth = (1 + rate) ** nper;
  return -(rate * (pv * growth + fv)) / ((1 + rate * type) * (growth - 1));
}

export function pv(rate: number, nper: number, payment: number, fv = 0, type: 0 | 1 = 0): number {
  if (rate === 0) return -(payment * nper + fv);
  const growth = (1 + rate) ** nper;
  return -(payment * (1 + rate * type) * ((growth - 1) / rate) + fv) / growth;
}

export function fv(rate: number, nper: number, payment: number, presentValue: number, type: 0 | 1 = 0): number {
  if (rate === 0) return -(presentValue + payment * nper);
  const growth = (1 + rate) ** nper;
  return -(presentValue * growth + payment * (1 + rate * type) * ((growth - 1) / rate));
}

// Interest portion of payment `per` (1-based), end-of-period payments.
export function ipmt(rate: number, per: number, nper: number, presentValue: number): number {
  if (per === 1) return -presentValue * rate;
  const payment = pmt(rate, nper, presentValue);
  const balanceBefore = -fv(rate, per - 1, payment, presentValue);
  return -balanceBefore * rate;
}

export function ppmt(rate: number, per: number, nper: number, presentValue: number): number {
  return pmt(rate, nper, presentValue) - ipmt(rate, per, nper, presentValue);
}

export function npv(rate: number, cashflows: number[]): number {
  return cashflows.reduce((sum, cf, t) => sum + cf / (1 + rate) ** t, 0);
}

function solve(f: (r: number) => number, df: (r: number) => number, guess: number): number | null {
  let r = guess;
  for (let i = 0; i < 100; i += 1) {
    const y = f(r);
    const d = df(r);
    if (!Number.isFinite(y) || !Number.isFinite(d) || d === 0) break;
    const next = r - y / d;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }
  // bisection fallback over a wide bracket
  let lo = -0.9999;
  let hi = 10;
  let flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-13) return mid;
    if (fm * flo < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

// Periodic IRR, like Excel's IRR. Null when the flows never change sign.
export function irr(cashflows: number[], guess = 0.1): number | null {
  const hasPos = cashflows.some((c) => c > 0);
  const hasNeg = cashflows.some((c) => c < 0);
  if (!hasPos || !hasNeg) return null;
  const f = (r: number) => npv(r, cashflows);
  const df = (r: number) => cashflows.reduce((s, cf, t) => s - (t * cf) / (1 + r) ** (t + 1), 0);
  return solve(f, df, guess);
}

const DAY_MS = 86_400_000;

export function isoToDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / DAY_MS;
}

// Annualized IRR for dated flows, like Excel's XIRR (365-day year from the first date).
export function xirr(flows: Array<{ date: string; amount: number }>, guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const first = isoToDays(flows[0]?.date ?? "");
  const t = flows.map((f) => (isoToDays(f.date) - first) / 365);
  const a = flows.map((f) => f.amount);
  if (!a.some((x) => x > 0) || !a.some((x) => x < 0)) return null;
  const f = (r: number) => a.reduce((s, x, i) => s + x / (1 + r) ** (t[i] ?? 0), 0);
  const df = (r: number) => a.reduce((s, x, i) => s - ((t[i] ?? 0) * x) / (1 + r) ** ((t[i] ?? 0) + 1), 0);
  return solve(f, df, guess);
}
