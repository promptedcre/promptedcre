// Formatting for the calculator figures. Pure, so server previews and the
// client calculators share it. The numbers themselves always come from the
// calculator functions in lib/calculators; this only writes them down.

import type { ZodError } from "zod";

// $5.27M, $330K, $940: a short money figure for a dimension label.
// About three significant figures. A value that rounds up to 1,000 of a unit
// is written in the next unit: 999,999 is $1M, never $1000K.
const UNITS: ReadonlyArray<readonly [number, string]> = [
  [1, ""],
  [1e3, "K"],
  [1e6, "M"],
  [1e9, "B"],
];

export function shortUsd(n: number): string {
  const a = Math.abs(n);
  let u = a >= 1e9 ? 3 : a >= 1e6 ? 2 : a >= 1e3 ? 1 : 0;
  for (;;) {
    const [div, suffix] = UNITS[u] ?? [1, ""];
    const x = a / div;
    // whole dollars, and whole thousands from $10K up
    const s = u === 0 || (u === 1 && x >= 10) ? String(Math.round(x)) : trim(x);
    if (Number(s) >= 1000 && u < UNITS.length - 1) {
      u += 1;
      continue;
    }
    const sign = n < 0 && Number(s) !== 0 ? "-" : "";
    return `${sign}$${s}${suffix}`;
  }
}

// Three significant figures, trailing zeros after the point dropped. Only a
// decimal part is trimmed: "100" stays "100" ("1" would be another number).
function trim(x: number): string {
  const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

// A list of yearly cash amounts as typed. Years are separated by a comma and a
// space, a semicolon or a space. A comma inside a figure groups thousands
// ("1,600,000" is one year, not three); a bare comma between longer figures
// ("60000,60000") still separates years.
const GROUPED = /^-?\$?-?\d{1,3}(,\d{3})+(\.\d+)?$/;
export function parseCash(s: string): number[] {
  return s
    .split(/[;\s]+|,\s+/)
    .filter(Boolean)
    .flatMap((t) => (GROUPED.test(t) ? [t.replace(/,/g, "")] : t.split(",").filter(Boolean)))
    .map((x) => Number(x.replace(/\$/g, "")));
}

// "1 line", "7 lines": a count with its noun, singular for one.
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Round numbers for an axis: 0 and a few steps up to at least max.
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

// "2026-07-06" → "Jul 6, 2026"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ""} ${d ?? ""}, ${y ?? ""}`;
}
// "2026-06-01" → "2026-06": a month on a dated axis, in the same ISO order as
// every date on the page ("Jun 26" read as the 26th of June).
export function monthLabel(iso: string): string {
  return iso.slice(0, 7);
}

export type FieldKind = "money" | "pct" | "number" | "int" | "multiple" | "year";

// A bound written the way the field shows it: 0.3 as 30% on a percent field.
function boundText(n: number, kind: FieldKind): string {
  if (kind === "pct") return `${Math.round(n * 1e6) / 1e4}%`;
  if (kind === "money") return `$${n.toLocaleString("en-US")}`;
  if (kind === "multiple") return `${n}x`;
  return String(n);
}

type Issue = ZodError["issues"][number];

// One validation issue in plain words, for the field it belongs to.
export function plainIssue(issue: Issue, kind: FieldKind = "number"): string {
  const i = issue as Issue & { minimum?: number | bigint; maximum?: number | bigint; inclusive?: boolean; expected?: string };
  switch (i.code) {
    case "invalid_type":
      if (i.expected === "int") return "Whole numbers only.";
      return i.expected === "number" ? "Enter a number." : "Fill this in.";
    case "too_small": {
      if (typeof i.minimum !== "number") return "Too short.";
      if (i.origin === "string") return "Fill this in.";
      if (i.origin === "array") return "Add at least one.";
      if (i.minimum === 0) return i.inclusive ? "Cannot be negative." : "Must be more than zero.";
      return i.inclusive ? `At least ${boundText(i.minimum, kind)}.` : `More than ${boundText(i.minimum, kind)}.`;
    }
    case "too_big": {
      if (typeof i.maximum !== "number") return "Too long.";
      if (i.origin === "string") return `At most ${i.maximum} characters.`;
      if (i.origin === "array") return `At most ${i.maximum}.`;
      return i.inclusive ? `At most ${boundText(i.maximum, kind)}.` : `Less than ${boundText(i.maximum, kind)}.`;
    }
    case "invalid_format":
      return "Enter a date.";
    default: {
      const m = issue.message;
      if (/received NaN|expected number/i.test(m)) return "Enter a number.";
      if (/expected int/i.test(m)) return "Whole numbers only.";
      return m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".");
    }
  }
}

// ---------- figures and words ----------
//
// The data face (Plex Mono) is for figures: an amount, a rate, a multiple, a date, a function
// call, an operator and what it joins. Words are set as words. A calculator's working mixes
// the two in one string ("$10,200,000.00 − $6,000,000.00 loan", "sum of 6 lease years"), so
// figureRuns splits a string into runs of one or the other and the page sets each in its face.

export type FigureRun = { text: string; figure: boolean };

// A bare count ("6", "120", "1–5") is a figure in a value cell or on a dimension line. In a
// formula it is a word of the phrase it sits in ("sum of 6 lease years"), unless an operator
// or a function call makes it part of the arithmetic ("× 12", "PV(0.58%, 240, $9,979.54)").
export type CountAs = "figure" | "word";

type TokKind = "fig" | "int" | "fn" | "op" | "word" | "open" | "close" | "space" | "punct";
type Tok = { text: string; kind: TokKind; fig: boolean; pair?: number; inCall: boolean };

const TOKEN_SOURCE = [
  // a date, as the site writes one
  String.raw`(?<date>\d{4}-\d{2}-\d{2})`,
  // a function call opens: PV(, max(, and a sum over a bracket
  String.raw`(?<fn>(?:PV|PMT|FV|IRR|IPMT|PPMT|XIRR|min|max|Σ)\()`,
  // a subscripted variable, and dollars a square foot as a unit
  String.raw`(?<sym>[A-Za-z]+_[A-Za-z]+|\$\/SF)`,
  // a number with what belongs to it: sign, dollar, thousands, decimals, %, x, K/M/B, a rate's /12, a unit
  String.raw`(?<num>[-−]?\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:–\d+)?(?:%|[xKMB](?![A-Za-z]))?(?:\/(?:\d+|SF|yr|mo)(?![A-Za-z]))*(?: (?:SF|bp)(?![A-Za-z]))?)`,
  // a power
  String.raw`(?<exp>\^(?:\([^)]*\)|[A-Za-z0-9]+)|²)`,
  String.raw`(?<op>[÷×−+=≥≤<>Σ√|])`,
  String.raw`(?<word>[A-Za-z][A-Za-z'’]*)`,
  String.raw`(?<open>\()`,
  String.raw`(?<close>\))`,
  String.raw`(?<space>\s+)`,
  String.raw`(?<punct>[\s\S])`,
].join("|");

// digits alone, a range of them, or one over another ("30/360"): a count, not a measured amount
const BARE_COUNT = /^\d+(?:–\d+)?(?:\/\d+)?$/;

function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  const re = new RegExp(TOKEN_SOURCE, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const g = m.groups ?? {};
    const s = m[0];
    let kind: TokKind = "punct";
    if (g.date !== undefined || g.sym !== undefined) kind = "fig";
    else if (g.fn !== undefined) kind = "fn";
    else if (g.num !== undefined) {
      const prev = out.at(-1);
      if (s.startsWith("-") && prev && (prev.kind === "word" || prev.kind === "int" || prev.kind === "fig")) {
        // a hyphen inside a compound ("year-6 NOI"), not a sign: read the number again without it
        out.push({ text: "-", kind: "punct", fig: false, inCall: false });
        re.lastIndex = m.index + 1;
        continue;
      }
      kind = BARE_COUNT.test(s) ? "int" : "fig";
    } else if (g.exp !== undefined || g.op !== undefined) kind = "op";
    else if (g.word !== undefined) kind = "word";
    else if (g.open !== undefined) kind = "open";
    else if (g.close !== undefined) kind = "close";
    else if (g.space !== undefined) kind = "space";
    out.push({ text: s, kind, fig: false, inCall: false });
  }
  return out;
}

const RUNS = new Map<string, FigureRun[]>();
const RUNS_KEPT = 4000;

export function figureRuns(text: string, counts: CountAs = "figure"): FigureRun[] {
  const key = `${counts}:${text}`;
  const hit = RUNS.get(key);
  if (hit) return hit;

  const toks = tokens(text);
  // the nearest token that is not a space, to the left (-1) or the right (1)
  const near = (i: number, step: 1 | -1): Tok | undefined => {
    for (let j = i + step; j >= 0 && j < toks.length; j += step) if (toks[j]?.kind !== "space") return toks[j];
    return undefined;
  };

  // Pair the brackets, and note what sits inside a function call.
  const stack: number[] = [];
  let calls = 0;
  toks.forEach((t, i) => {
    t.inCall = calls > 0;
    if (t.kind === "fn" || t.kind === "open") {
      stack.push(i);
      if (t.kind === "fn") calls += 1;
    } else if (t.kind === "close") {
      const o = stack.pop();
      if (o !== undefined) {
        t.pair = o;
        if (toks[o]?.kind === "fn") calls -= 1;
      }
    }
  });

  // What is plainly a figure, then the counts.
  toks.forEach((t, i) => {
    if (t.kind === "fig" || t.kind === "fn" || t.kind === "op") t.fig = true;
    else if (t.kind === "int") {
      const before = near(i, -1);
      const after = near(i, 1);
      t.fig = counts === "figure" || before?.kind === "op" || after?.kind === "op" || (t.inCall && before?.kind !== "word" && after?.kind !== "word");
    }
  });
  // A bracket belongs to the figures when it opens onto one (a later bracket is settled first); its partner follows it.
  for (let i = toks.length - 1; i >= 0; i -= 1) {
    const t = toks[i];
    if (t?.kind === "open") t.fig = near(i, 1)?.fig ?? false;
  }
  toks.forEach((t) => {
    if (t.kind === "close") t.fig = t.pair !== undefined && (toks[t.pair]?.fig ?? false);
  });
  // An operator between two words is a word of the phrase: "NOI − debt service", "term × rent".
  toks.forEach((t, i) => {
    if (t.kind === "op") t.fig = (near(i, -1)?.fig ?? false) || (near(i, 1)?.fig ?? false);
  });
  // A comma or a colon between two figures goes with them; so does the space.
  toks.forEach((t, i) => {
    if (t.kind !== "punct") return;
    let j = i + 1;
    while (toks[j] && (toks[j]?.kind === "space" || toks[j]?.kind === "punct")) j += 1;
    t.fig = (near(i, -1)?.fig ?? false) && (toks[j]?.fig ?? false);
  });
  toks.forEach((t, i) => {
    if (t.kind === "space") t.fig = (toks[i - 1]?.fig ?? false) && (toks[i + 1]?.fig ?? false);
  });

  const runs: FigureRun[] = [];
  for (const t of toks) {
    const last = runs.at(-1);
    if (last && last.figure === t.fig) last.text += t.text;
    else runs.push({ text: t.text, figure: t.fig });
  }
  if (RUNS.size >= RUNS_KEPT) RUNS.clear();
  RUNS.set(key, runs);
  return runs;
}

// "data" when a string is figures alone, "words" when it has none, "mixed" otherwise.
export function figureFace(runs: FigureRun[]): "data" | "words" | "mixed" {
  if (runs.every((r) => r.figure)) return "data";
  return runs.some((r) => r.figure) ? "mixed" : "words";
}

// The issues of one parse, keyed by their path ("pref.rate", "deals.0.name").
export function issueMap(error: ZodError | undefined): Map<string, Issue> {
  const out = new Map<string, Issue>();
  for (const i of error?.issues ?? []) {
    const key = i.path.map(String).join(".");
    if (!out.has(key)) out.set(key, i);
  }
  return out;
}
