import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reads the tokens of both themes from app/globals.css and checks WCAG contrast for every pair
// of ink and surface the site uses: 4.5:1 for text, 3:1 for large text, marks and a control's
// outline. Night is the first :root block. Paper is the `@utility theme-paper` block, written
// once and applied by the two theme rules and by the print remap. Print is Paper plus the few
// declarations the print remap writes after it.
const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const css = read("app", "globals.css");
const nightRoot = css.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? "";
const paperRoot = css.match(/@utility theme-paper\s*{([\s\S]*?)}/)?.[1] ?? "";
const printRoot = css.match(/@media print\s*{\s*:root\s*{([\s\S]*?)}/)?.[1] ?? "";

type Rgba = { r: number; g: number; b: number; a: number };
type Declared = { name: string; value: string };
type Tokens = { hex: Record<string, string>; rgba: Record<string, Rgba>; declared: Declared[] };

const noComments = (block: string) => block.replace(/\/\*[\s\S]*?\*\//g, "");
// Every custom property a block declares, whatever its value, with the colors among them parsed.
function tokensOf(block: string): Tokens {
  const declared = [...noComments(block).matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => ({ name: m[1]!, value: m[2]!.trim() }));
  const hex: Record<string, string> = {};
  const rgba: Record<string, Rgba> = {};
  for (const d of declared) {
    const layer = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(d.value);
    if (/^#[0-9a-fA-F]{6}$/.test(d.value)) hex[d.name] = d.value;
    else if (layer) rgba[d.name] = { r: Number(layer[1]), g: Number(layer[2]), b: Number(layer[3]), a: Number(layer[4]) };
    else if (d.value === "transparent") rgba[d.name] = { r: 0, g: 0, b: 0, a: 0 };
  }
  return { hex, rgba, declared };
}

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// A translucent layer painted over an opaque color.
function over(hex: string, layer: Rgba): string {
  const top = [layer.r, layer.g, layer.b];
  return toHex(toRgb(hex).map((c, i) => top[i]! * layer.a + c * (1 - layer.a)));
}
const layerOf = (hex: string, a: number): Rgba => {
  const [r, g, b] = toRgb(hex);
  return { r: r!, g: g!, b: b!, a };
};

function hue(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
// How far apart two hues are, the short way round the wheel.
const hueGap = (a: string, b: string) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

// Every ink that is ever set as text or drawn as a mark.
const FOREGROUNDS = ["text", "text-muted", "text-faint", "accent", "accent-strong", "agent", "agent-text", "human", "human-text", "danger", "warn"];
// Every surface text sits on: the ground, a sheet's paper, a well, the selected state, a control's fill.
const BACKGROUNDS = ["bg", "bg-raised", "bg-inset", "bg-panel", "bg-tile"];
const LINES = ["line", "line-strong", "line-bold"];
const ROLE_SCALES = ["agent-mid", "agent-deep", "human-mid", "human-deep"];
const CONTROLS = ["accent-ink", "human-ink", "fill-hover", "selection"];
const TRANSLUCENT = ["grid-minor", "grid-major", "scrim", "dim-line", "dim-ext"];
const HEX_TOKENS = [...BACKGROUNDS, ...FOREGROUNDS, ...LINES, ...ROLE_SCALES, ...CONTROLS];
// The marks: a role mark, a chip's frame and square, the cloud, a dimension, and pencil.
const MARKS = ["agent", "human", "accent", "danger", "warn", "text-faint"];
// What is not a color but still differs by theme.
const THEME_STATE = ["show-on-night", "show-on-paper", "highlight", "pencil-mark-opacity", "pencil-mark-filter", "shadow-box"];

type ThemeCase = {
  label: string;
  raw: string;
  tokens: Tokens;
  /** The inks this theme sets as words: 4.5:1 on every surface. */
  textInks: string[];
  /** The fills --accent-ink is written on: the primary button's states, then the marks. */
  inkFills: string[];
  /** The surfaces from the one furthest behind the page to the one nearest, and which way luminance runs. */
  ladder: string[];
  toward: "lighter" | "darker";
  /** A label (text-faint) on the ground and on a sheet, and on every other surface. */
  labelFloor: [onSheet: number, anywhere: number];
  /** The grid's heavier line and the pixel where two lines cross, as contrast against the sheet under them. */
  grid: { majorMin: number; majorMax: number; crossingMax: number };
};

const night: ThemeCase = {
  label: "Night",
  raw: nightRoot,
  tokens: tokensOf(nightRoot),
  // On a dark sheet every mark color is light enough to be set as words too.
  textInks: FOREGROUNDS,
  inkFills: ["text", "fill-hover", "text-muted", "accent", "accent-strong", "agent", "agent-text", "human", "human-text", "danger", "warn"],
  ladder: ["bg-inset", "bg", "bg-raised", "bg-panel", "bg-tile"],
  toward: "lighter",
  labelFloor: [6, 6],
  // Paper, not a pattern: a line barely lifts the dark sheet.
  grid: { majorMin: 1, majorMax: 1.1, crossingMax: 1.12 },
};
const paper: ThemeCase = {
  label: "Paper",
  raw: paperRoot,
  tokens: tokensOf(paperRoot),
  // On paper a mark is an ink at 3:1; --agent and --human are marks only, and a word takes
  // --agent-text or --human-text. The red pencil and the burnt orange are set as words too.
  textInks: ["text", "text-muted", "text-faint", "accent", "accent-strong", "agent-text", "human-text", "danger", "warn"],
  // Amber is the one fill that paper-colored ink cannot be read on: it takes --human-ink (below).
  inkFills: ["text", "fill-hover", "text-muted", "accent", "accent-strong", "agent", "agent-text", "human-text", "danger", "warn"],
  ladder: ["bg-raised", "bg", "bg-inset", "bg-panel", "bg-tile"],
  toward: "darker",
  labelFloor: [6, 4.5],
  // The faint blue of engineering paper: meant to be seen, and no more than that.
  grid: { majorMin: 1.1, majorMax: 1.2, crossingMax: 1.3 },
};

describe.each([night, paper])("$label: color tokens", (theme) => {
  const { hex, rgba, declared } = theme.tokens;
  const crossing = (sheet: string) => over(over(hex[sheet]!, rgba["grid-minor"]!), rgba["grid-major"]!);

  it("declares every token once with a hex value", () => {
    for (const name of HEX_TOKENS) {
      expect(hex[name], name).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(declared.filter((d) => d.name === name), name).toHaveLength(1);
    }
    for (const name of TRANSLUCENT) expect(rgba[name], name).toBeDefined();
  });

  it("writes the OKLCH each hex was computed from beside it", () => {
    for (const name of HEX_TOKENS) {
      expect(theme.raw, name).toMatch(new RegExp(`--${name}:\\s*#[0-9a-fA-F]{6};\\s*/\\*\\s*oklch\\(`));
    }
  });

  it("keeps every ink that is set as words at WCAG AA (4.5:1) on every surface", () => {
    for (const fg of theme.textInks) {
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(hex[fg]!, hex[bg]!);
        expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps them at AA over the drafting grid, on the ground and on a sheet's paper", () => {
    // The grid is drawn inside a drawing (.sheet-grid): on a sheet's paper, or on the ground.
    // The hardest pixel is where a major and a minor line cross.
    for (const sheet of ["bg", "bg-raised"]) {
      for (const fg of theme.textInks) {
        const ratio = contrast(hex[fg]!, crossing(sheet));
        expect(ratio, `${fg} over the grid on ${sheet} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the reading inks at AA on the agent and person tints", () => {
    // Rows and notes tinted green or amber (agent-deep, human-deep) carry plain, muted and
    // faint text as well as their own role color.
    for (const tint of ["agent-deep", "human-deep"]) {
      for (const fg of ["text", "text-muted", "text-faint", "agent-text", "human-text", "accent-strong"]) {
        const ratio = contrast(hex[fg]!, hex[tint]!);
        expect(ratio, `${fg} on ${tint} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps labels (text-faint) clearly readable, and a step below body text", () => {
    const [onSheet, anywhere] = theme.labelFloor;
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(hex["text-faint"]!, hex[bg]!);
      const floor = bg === "bg" || bg === "bg-raised" ? onSheet : anywhere;
      expect(ratio, `text-faint on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(floor);
    }
    // so a label reads as a label
    expect(contrast(hex["text-muted"]!, hex["text-faint"]!)).toBeGreaterThan(1.3);
  });

  it("draws the grid as paper, not a pattern", () => {
    for (const sheet of ["bg", "bg-raised"]) {
      // The heavier of the two lines, and the pixel where a major and a minor line cross.
      const major = contrast(over(hex[sheet]!, rgba["grid-major"]!), hex[sheet]!);
      expect(major, `major line on ${sheet} = ${major.toFixed(3)}`).toBeGreaterThanOrEqual(theme.grid.majorMin);
      expect(major, `major line on ${sheet} = ${major.toFixed(3)}`).toBeLessThan(theme.grid.majorMax);
      expect(contrast(crossing(sheet), hex[sheet]!), `crossing on ${sheet}`).toBeLessThan(theme.grid.crossingMax);
      // The minor line is the lighter of the two.
      expect(rgba["grid-minor"]!.a).toBeLessThan(rgba["grid-major"]!.a);
    }
  });

  it("keeps the ink on a filled control or mark at AA on every fill it sits on", () => {
    // text is the primary button; fill-hover its hover; text-muted its pressed state. The rest
    // are marks with a figure or a glyph written on them.
    for (const fill of theme.inkFills) {
      const ratio = contrast(hex["accent-ink"]!, hex[fill]!);
      expect(ratio, `accent-ink on ${fill} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
    // An amber fill takes the dark ink in both themes, through the rule on the fill itself.
    const onAmber = contrast(hex["human-ink"]!, hex.human!);
    expect(onAmber, `human-ink on human = ${onAmber.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.bg-human\s*{\s*--accent-ink:\s*var\(--human-ink\);\s*}/);
    // The hover is a fill of its own: never the sheet's paper, and a visible step from the rest state.
    expect(hex["fill-hover"]!.toLowerCase()).not.toBe("#ffffff");
    expect(hex["fill-hover"]).not.toBe(hex["bg-raised"]);
    expect(contrast(hex.text!, hex["fill-hover"]!)).toBeGreaterThan(1.1);
    expect(contrast(hex["fill-hover"]!, hex["text-muted"]!)).toBeGreaterThan(1.1);
  });

  it("keeps selected text at AA on the selection color, and the selection in sight", () => {
    const ratio = contrast(hex.text!, hex.selection!);
    expect(ratio, `text on selection = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    for (const bg of BACKGROUNDS) expect(contrast(hex.selection!, hex[bg]!), `selection on ${bg}`).toBeGreaterThan(1.15);
  });

  it("keeps marks, a control's outline and the focus ring at 3:1 where they are drawn", () => {
    for (const mark of MARKS) {
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(hex[mark]!, hex[bg]!);
        expect(ratio, `${mark} mark on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    }
    // A mark on its own lane's tint, and on the other's.
    for (const tint of ["agent-deep", "human-deep"]) {
      for (const mark of ["agent", "human"]) expect(contrast(hex[mark]!, hex[tint]!), `${mark} mark on ${tint}`).toBeGreaterThanOrEqual(3);
    }
    // The focus ring is drawn outside its control, on whatever surface the control sits on.
    for (const bg of BACKGROUNDS) expect(contrast(hex["accent-strong"]!, hex[bg]!), `focus ring on ${bg}`).toBeGreaterThanOrEqual(3);
    // A control's outline (a secondary button, a field) and a lane's border, on the ground and on a sheet's paper.
    for (const line of ["line-bold", "agent-mid", "human-mid"]) {
      for (const bg of ["bg", "bg-raised"]) {
        const ratio = contrast(hex[line]!, hex[bg]!);
        expect(ratio, `${line} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("steps the surfaces apart, and the lines beyond them, without a shadow", () => {
    // Depth is steps of paper: each must be told from its neighbour, and they run one way.
    const further = (a: string, b: string) => (theme.toward === "lighter" ? luminance(a) < luminance(b) : luminance(a) > luminance(b));
    theme.ladder.slice(1).forEach((b, i) => {
      const a = theme.ladder[i]!;
      expect(contrast(hex[a]!, hex[b]!), `${a} against ${b}`).toBeGreaterThan(1.04);
      expect(further(hex[a]!, hex[b]!), `${a} then ${b}, ${theme.toward}`).toBe(true);
    });
    // A row rule stands off the sheet it rules, a sheet's border off a row rule, emphasis off both.
    expect(further(hex["bg-raised"]!, hex.line!), "line beyond a sheet's paper").toBe(true);
    expect(further(hex.line!, hex["line-strong"]!), "line-strong beyond line").toBe(true);
    expect(further(hex["line-strong"]!, hex["line-bold"]!), "line-bold beyond line-strong").toBe(true);
  });

  it("holds the page back behind the search dialog", () => {
    const scrim = rgba.scrim!;
    expect(scrim.a).toBeGreaterThanOrEqual(0.6);
    expect(scrim.a).toBeLessThan(1);
    // Body text seen through the scrim no longer competes with the dialog in front of it.
    expect(contrast(over(hex.text!, scrim), over(hex.bg!, scrim))).toBeLessThan(3);
    // The dialog's own shadow is a token too, whatever its form.
    expect(declared.filter((d) => d.name === "shadow")).toHaveLength(1);
  });

  it("keeps warn from reading as a person's amber, and the redline from reading as warn", () => {
    expect(hueGap(hex.warn!, hex.human!)).toBeGreaterThanOrEqual(12);
    expect(contrast(hex.warn!, hex.human!)).toBeGreaterThan(1.2);
    expect(hueGap(hex.warn!, hex.danger!)).toBeGreaterThanOrEqual(12);
  });

  it("keeps a penciled line at 3:1: the revision cloud waiting to be drawn", () => {
    // .cloud-pencil is the faint ink at reduced strength; a cloud sits on the ground, a sheet or a well.
    const strength = Number(css.match(/\.cloud-pencil\s*{[^}]*opacity:\s*calc\(clamp\([^;]*\)\s*\*\s*([\d.]+)\);/)?.[1]);
    expect(strength).toBeGreaterThan(0);
    for (const bg of ["bg", "bg-raised", "bg-inset"]) {
      const ratio = contrast(over(hex[bg]!, layerOf(hex["text-faint"]!, strength)), hex[bg]!);
      expect(ratio, `cloud pencil on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the two themes", () => {
  const names = (t: Tokens) => t.declared.map((d) => d.name).sort();
  const isColor = (d: Declared) => /^#[0-9a-fA-F]{3,8}$|^rgba?\(/.test(d.value);

  it("define exactly the same set of tokens", () => {
    // Night's block also holds what no theme changes (motion, space, the frame, the hatch).
    // Its theme tokens are every color it declares, and the few named ones that are not colors.
    const nightTheme = night.tokens.declared.filter((d) => isColor(d) || THEME_STATE.includes(d.name));
    expect(nightTheme.length).toBeGreaterThan(30);
    expect(names(paper.tokens)).toEqual(nightTheme.map((d) => d.name).sort());
    // No name twice in either block.
    for (const t of [night.tokens, paper.tokens]) expect(new Set(names(t)).size).toBe(names(t).length);
    for (const name of [...HEX_TOKENS, ...TRANSLUCENT, ...THEME_STATE, "shadow"]) {
      expect(names(paper.tokens), name).toContain(name);
      expect(names(night.tokens), name).toContain(name);
    }
  });

  it("set the browser's color scheme to match: dark for Night, light for Paper", () => {
    expect(noComments(nightRoot)).toMatch(/(^|\s)color-scheme:\s*dark;/);
    expect(noComments(paperRoot)).toMatch(/(^|\s)color-scheme:\s*light;/);
  });

  it("write Paper once, and apply it for every visitor unless they chose Night", () => {
    expect(css.match(/@utility theme-paper\s*{/g)).toHaveLength(1);
    // Paper first, whatever the system asks for, unless the visitor chose Night (D218).
    expect(css).toMatch(/\n:root:where\(:not\(\[data-theme="night"\]\)\)\s*{\s*@apply theme-paper;\s*}/);
    expect(css).not.toMatch(/prefers-color-scheme/);
    // Paper when the visitor chose it, whatever the system asks for.
    expect(css).toMatch(/\n:root:where\(\[data-theme="paper"\]\)\s*{\s*@apply theme-paper;\s*}/);
    // Those two and the print remap are the only places it is applied, and no value is typed twice.
    expect(css.match(/@apply theme-paper;/g)).toHaveLength(3);
    expect(css.split(`--bg: ${paper.tokens.hex.bg};`)).toHaveLength(2);
    expect(css.split(`--text: ${paper.tokens.hex.text};`)).toHaveLength(2);
    // Night needs no rule of its own: it is the first :root block, and every theme rule after it
    // stays at the weight of :root, so the print remap (a plain :root, later still) wins on paper.
    expect(css).not.toMatch(/\[data-theme="night"\]\s*{/);
    expect(css.indexOf("@utility theme-paper")).toBeGreaterThan(css.indexOf(":root"));
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf(':root:where([data-theme="paper"])'));
  });

  it("pencil a sequence's generic mark so it still reads at 3:1", () => {
    const value = (t: Tokens, name: string) => t.declared.find((d) => d.name === name)?.value;
    // Night: the mark at reduced strength, as the motion kit was built.
    expect(value(night.tokens, "pencil-mark-opacity")).toBe("0.45");
    expect(value(night.tokens, "pencil-mark-filter")).toBe("none");
    // Paper: any paler ink on white drops under 3:1, so pencil is one graphite grey at full strength.
    expect(value(paper.tokens, "pencil-mark-opacity")).toBe("1");
    const grey = Number(/^brightness\(0\) invert\(([\d.]+)\)$/.exec(value(paper.tokens, "pencil-mark-filter") ?? "")?.[1]);
    expect(grey).toBeGreaterThan(0);
    const graphite = toHex([grey * 255, grey * 255, grey * 255]);
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(graphite, paper.tokens.hex[bg]!);
      expect(ratio, `graphite on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
    // The motion kit reads both tokens, with Night's values where there are none.
    const kit = read("components", "motion", "sequence-styles.tsx");
    expect(kit).toContain("opacity:var(--pencil-mark-opacity,.45) !important");
    expect(kit).toContain("filter:var(--pencil-mark-filter,none)");
  });

  it("show one face of a thing that differs by theme", () => {
    const value = (t: Tokens, name: string) => t.declared.find((d) => d.name === name)?.value;
    expect([value(night.tokens, "show-on-night"), value(night.tokens, "show-on-paper")]).toEqual(["visible", "hidden"]);
    expect([value(paper.tokens, "show-on-night"), value(paper.tokens, "show-on-paper")]).toEqual(["hidden", "visible"]);
  });

  it("run the highlighter over the line a person signs on, on Paper only", () => {
    const value = (t: Tokens, name: string) => t.declared.find((d) => d.name === name)?.value;
    expect(value(night.tokens, "highlight")).toBe("transparent");
    expect(value(paper.tokens, "highlight")).toBe("var(--human-deep)");
    expect(css).toMatch(/\.sigline\s*{[^}]*background-color:\s*var\(--highlight\);/);
    // The line, its cross and a person's amber all read on the highlighter.
    const { hex } = paper.tokens;
    for (const ink of ["text-faint", "human", "text"]) {
      const ratio = contrast(hex[ink]!, hex["human-deep"]!);
      expect(ratio, `${ink} on the highlighter = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
    // And the highlighter is told from the sheet it is drawn on: by its yellow, and a step of tone.
    expect(contrast(hex["human-deep"]!, hex["bg-raised"]!)).toBeGreaterThan(1.1);
    expect(toRgb(hex["human-deep"]!)[2]!).toBeLessThan(toRgb(hex["bg-raised"]!)[2]! - 48);
  });

  it("write each ground color out where a CSS variable cannot reach", () => {
    // The browser's theme color (app/layout.tsx) and the web manifest (app/manifest.ts) take
    // Paper's ground, the theme every visitor starts on (D218).
    const layout = read("app", "layout.tsx");
    expect(layout).toContain(`const GROUND = { night: "${night.tokens.hex.bg}", paper: "${paper.tokens.hex.bg}" } as const;`);
    expect(layout).toContain(`themeColor: GROUND.paper`);
    expect(layout).toContain(`colorScheme: "light dark"`);
    expect(read("app", "manifest.ts")).toContain(`const GROUND = "${paper.tokens.hex.bg}"`);
  });

  it("keep the visitor's choice under one key, read before the first paint", () => {
    const layout = read("app", "layout.tsx");
    const toggle = read("components", "ui", "theme-toggle.tsx");
    const key = /const KEY = "([\w-]+)";/.exec(toggle)?.[1];
    expect(key).toBe("pcre-theme");
    // The head script sets <html data-theme> from that key, and only to a theme that exists.
    expect(layout).toContain(`localStorage.getItem("${key}")`);
    expect(layout).toContain(`if(t==="paper"||t==="night")d.setAttribute("data-theme",t)`);
    // With scripts off the switch is not drawn: the system setting decides.
    expect(css).toMatch(/html:not\(\.js\) \.theme-toggle\s*{\s*display:\s*none !important;\s*}/);
  });
});

describe("paper in a printer (the print remap)", () => {
  const own = tokensOf(printRoot);
  // What the page prints with: Paper, then the print remap's own declarations.
  const print = { hex: { ...paper.tokens.hex, ...own.hex }, rgba: { ...paper.tokens.rgba, ...own.rgba } };
  for (const name of Object.keys(own.rgba)) delete print.hex[name];

  it("is the Paper theme first, whichever theme was on the screen", () => {
    expect(noComments(printRoot).trimStart()).toMatch(/^@apply theme-paper;/);
    // So every color token has a value for paper.
    const declared = new Set([...paper.tokens.declared, ...own.declared].map((d) => d.name));
    for (const name of [...Object.keys(night.tokens.hex), ...Object.keys(night.tokens.rgba)]) {
      expect(declared.has(name), `--${name} on paper`).toBe(true);
    }
  });

  it("changes only what a printed page needs and a screen does not", () => {
    // One sheet, no grid, and an ink that reads on a mark whether or not the mark's fill prints.
    expect(own.declared.map((d) => d.name).sort()).toEqual(["accent-ink", "agent", "bg", "bg-panel", "bg-raised", "bg-tile", "grid-major", "grid-minor"]);
    for (const surface of ["bg", "bg-raised", "bg-panel", "bg-tile"]) expect(print.hex[surface], surface).toBe("#ffffff");
    for (const line of ["grid-minor", "grid-major"]) expect(print.rgba[line]!.a, line).toBe(0);
  });

  it("keeps ink at AA on paper and on the inset", () => {
    for (const fg of ["text", "text-muted", "text-faint", "accent", "accent-strong", "agent-text", "human-text", "danger", "warn"]) {
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(print.hex[fg]!, print.hex[bg]!);
        expect(ratio, `print ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps marks at 3:1 on paper, and dark ink at AA on a printed mark", () => {
    // The revision cloud prints in --danger; marks and hatching print in their own ink.
    for (const mark of ["agent", "human", "accent", "danger", "warn", "line-bold"]) {
      const ratio = contrast(print.hex[mark]!, print.hex.bg!);
      expect(ratio, `print ${mark} on paper = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
    // A figure written on a mark is dark, so it reads on white paper when the fill is dropped,
    // and on the fill when it is printed.
    expect(contrast(print.hex["accent-ink"]!, print.hex.bg!)).toBeGreaterThanOrEqual(4.5);
    for (const [ink, fill] of [["accent-ink", "agent"], ["accent-ink", "human"], ["human-ink", "human"]] as const) {
      const ratio = contrast(print.hex[ink]!, print.hex[fill]!);
      expect(ratio, `print ${ink} on ${fill} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("motion and frame tokens", () => {
  const valueOf = (name: string) => night.tokens.declared.find((d) => d.name === name)?.value;

  it("declares the motion tokens a timeline and a CSS transition both read", () => {
    expect(valueOf("ease-out")).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(valueOf("ease-in-out")).toBe("cubic-bezier(0.65, 0, 0.35, 1)");
    expect(valueOf("dur-1")).toBe("120ms");
    expect(valueOf("dur-2")).toBe("200ms");
    expect(valueOf("dur-3")).toBe("320ms");
    expect(valueOf("dur-4")).toBe("600ms");
  });

  it("declares the frame tokens, and --draw with the finished drawing as its default", () => {
    expect(valueOf("header-h")).toBeDefined();
    expect(css).toMatch(/scroll-padding-top:\s*calc\(var\(--header-h\)/);
    expect(css).toMatch(/@property --draw\s*{[^}]*initial-value:\s*1;/);
  });

  it("names every type role, and keeps the old names as aliases until the rebuild ends", () => {
    for (const role of [
      "type-hero",
      "type-page",
      "type-title-l",
      "type-title-m",
      "type-title-s",
      "type-lede",
      "type-body",
      "type-body-s",
      "type-label",
      "type-note",
      "type-figure",
      "type-code",
      "type-data",
    ]) {
      expect(css, role).toMatch(new RegExp(`@utility ${role}\\s*{`));
    }
    for (const old of ["display-xl", "display-page", "display-l", "display-m", "display-s", "lede", "ann", "eyebrow", "figure"]) {
      expect(css, old).toMatch(new RegExp(`@utility ${old}\\s*{`));
    }
  });

  it("keeps the drafting grid off the page: only .sheet-grid draws it", () => {
    const body = css.match(/\bbody\s*{([\s\S]*?)}/)?.[1] ?? "";
    expect(body).not.toMatch(/grid-(?:minor|major)/);
    expect(css.match(/var\(--grid-major\)/g) ?? []).toHaveLength(2);
    expect(css).toMatch(/\.sheet-grid\s*{[^}]*var\(--grid-major\)/);
  });

  it("sets no type under the 12 px floor", () => {
    // Every font-size and font shorthand in the stylesheet, in rem, em or px.
    const sizes = [...css.matchAll(/font(?:-size)?:\s*[^;]*?(\d*\.?\d+)(rem|em|px)\b/g)].map((m) => Number(m[1]) * (m[2] === "px" ? 1 : 16));
    expect(sizes.length).toBeGreaterThan(20);
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(12);
  });
});

describe("where the stylesheet reads class names from", () => {
  // The tests, the docs and the tools quote class names as examples, banned ones among them.
  // Read from there, a class no page uses ends up in the stylesheet that ships.
  it("leaves out the tests, the docs and the tools", () => {
    for (const dir of ["__tests__", "docs", "tools"]) expect(css).toContain(`@source not "../${dir}";`);
  });
});
