// Rolling figures (decision 96): when an input changes, a computed figure counts from its old
// value to its new one instead of jumping, and the lead figure counts up from zero the first
// time it is seen. Pure: strings in, the strings between them out. The only numbers ever
// written are the two the calculator computed and the eased steps between them, and the last
// step is the new string itself, character for character.
//
// A figure is read as numbers in a frame of words: "$5,273,694", "7.05%", "1.25x",
// "2.00x on $4,200,000". Only a measured number rolls: one with a dollar sign, a decimal part,
// thousands grouping, or a % or an x after it. A bare count ("3 of 12", "Year 4") stays in the
// frame as a word, and a string holding a date never rolls. When the frame changes ("$330K" to
// "$1.2M", "none" to "7.05%", "Year 3" to "Year 4") the new string is simply shown.

/** The text at a progress from 0 (the old value) to 1 (the new string, exactly). */
export type Roll = (progress: number) => string;

type Num = { value: number; decimals: number; grouped: boolean; dollar: boolean; minus: string };
type Shape = { frame: string[]; nums: Num[] };

const DATE = /\d{4}-\d{2}-\d{2}/;
// a sign, a dollar sign, the digits (grouped or not) and a decimal part
const NUMBER = /([-−])?(\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g;

// The figure as words around its measured numbers; null when nothing in it rolls.
export function shapeOf(text: string): Shape | null {
  if (DATE.test(text)) return null;
  const frame: string[] = [];
  const nums: Num[] = [];
  let from = 0;
  for (const m of text.matchAll(NUMBER)) {
    const [whole, sign, dollar, int = "", dec] = m;
    const at = m.index ?? 0;
    const after = text.charAt(at + whole.length);
    const grouped = int.includes(",");
    // a bare count is a word of the frame: it has to match, and it never rolls
    if (!dollar && dec === undefined && !grouped && after !== "%" && after !== "x") continue;
    frame.push(text.slice(from, at));
    const size = Number(`${int.replace(/,/g, "")}${dec === undefined ? "" : `.${dec}`}`);
    nums.push({ value: sign ? -size : size, decimals: dec?.length ?? 0, grouped, dollar: Boolean(dollar), minus: sign ?? "-" });
    from = at + whole.length;
  }
  if (nums.length === 0) return null;
  frame.push(text.slice(from));
  return { frame, nums };
}

// One number in its own format: its decimals, its grouping, its dollar sign, and no minus on a
// figure that rounds to zero ("$0", never "-$0").
function write(n: number, spec: Num): string {
  const fixed = Math.abs(n).toFixed(spec.decimals);
  const [int = "0", dec] = fixed.split(".");
  const digits = spec.grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  const sign = n < 0 && /[1-9]/.test(fixed) ? spec.minus : "";
  return `${sign}${spec.dollar ? "$" : ""}${digits}${dec === undefined ? "" : `.${dec}`}`;
}

function compose(shape: Shape, specs: Num[], values: number[]): string {
  let out = shape.frame[0] ?? "";
  specs.forEach((spec, k) => {
    out += write(values[k] ?? 0, spec) + (shape.frame[k + 1] ?? "");
  });
  return out;
}

const sameFrame = (a: Shape, b: Shape) =>
  a.nums.length === b.nums.length && a.frame.every((f, i) => f === b.frame[i]) && a.nums.every((n, i) => n.dollar === b.nums[i]?.dollar);

/** From one figure to the next, or null when the two do not share a frame (then the new one is shown at once). */
export function rollBetween(from: string, to: string): Roll | null {
  if (from === to) return null;
  const a = shapeOf(from);
  const b = shapeOf(to);
  if (!a || !b || !sameFrame(a, b)) return null;
  // the new figure's format, grouped wherever either end groups ("$999" to "$1,500" passes "$1,250")
  const specs = b.nums.map((n, k) => ({ ...n, grouped: n.grouped || (a.nums[k]?.grouped ?? false) }));
  return (p) => (p >= 1 ? to : compose(b, specs, b.nums.map((n, k) => (a.nums[k]?.value ?? 0) + (n.value - (a.nums[k]?.value ?? 0)) * Math.max(0, p))));
}

/** From zero up to the figure, for its first appearance; null when nothing in it rolls ("none", a date). */
export function rollUp(to: string): Roll | null {
  const b = shapeOf(to);
  if (!b || b.nums.every((n) => n.value === 0)) return null;
  return (p) => (p >= 1 ? to : compose(b, b.nums, b.nums.map((n) => n.value * Math.max(0, p))));
}
