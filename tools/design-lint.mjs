#!/usr/bin/env node
// design-lint: mechanical checks for the design contract (DIRECTION.md sections 1, 3, 4, 5, 9).
//
//   npm run design:lint                      every .ts/.tsx/.css under app/ and components/
//   npm run design:lint -- components/home   only these files or folders
//   --strict       exit 1 while any error remains
//   --strict-all   exit 1 while any error or legacy finding remains
//   --json         machine-readable findings and summary
//   --rule <id>    only this rule (repeat or comma-separate for more)
//   --summary-only print the summary tables without the finding lines
//
// Escape hatch, on the line before the finding (a reason is required; the summary counts them):
//   // design-lint-disable-next-line color-literal -- themeColor needs a literal
//   {/* design-lint-disable-next-line kicker -- reason */}
//   /* design-lint-disable-next-line tiny-text -- reason */
//
// Severities: error = a ban; legacy = allowed until the end of the rebuild; check = a heuristic,
// a person decides. Plain Node, no dependencies, no network. It reads source text: it does not
// run Tailwind or React, so it sees what is written, not what renders.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TYPE_ROLES =
  "type-hero, type-page, type-title-l/m/s, type-lede, type-body, type-body-s, type-label, type-note, type-figure, type-code, type-data";

export const RULES = {
  "type-arbitrary-size": { severity: "error", message: `Arbitrary type size. Use a role utility: ${TYPE_ROLES}.` },
  "type-arbitrary-weight": {
    severity: "error",
    message: "Arbitrary weight, width or tracking. The type-* role utility sets all three; drop the override.",
  },
  "type-legacy-alias": {
    severity: "legacy",
    message: "Legacy type alias (allowed until the rebuild ends). Use the matching type-* role utility in new code.",
  },
  kicker: {
    severity: "error",
    message: "Kicker above a heading is banned. Fold what it says into the heading line, the breadcrumb or the facts line.",
  },
  "side-stripe": {
    severity: "error",
    message: "Side stripe of 2px or more. Use a 1px rule or a mark from components/ui; no colored bars on cards, rows or notes.",
  },
  "color-literal": {
    severity: "error",
    message: "Hard-coded color. Use a token from the theme blocks of app/globals.css (var(--name) or its Tailwind color).",
  },
  "white-hover": { severity: "error", message: "hover:bg-white is banned. Use the --fill-hover token." },
  "round-number": {
    severity: "check",
    message: "Circle around a number? Numbers sit square: drop rounded-full (corners come from --radius-box, --radius-control and --radius-chip).",
  },
  "tiny-text": { severity: "error", message: "Text under 12px. type-note (0.75rem) is the floor." },
  "arbitrary-space": {
    severity: "error",
    message: "Arbitrary spacing. Use the 4px scale through Tailwind steps 1, 2, 3, 4, 6, 8, 12, 16, 24, 32.",
  },
  "body-grid": {
    severity: "error",
    message: "Drafting grid outside a drawing. The grid lives only in the sheet-grid class; prose sits on plain ground.",
  },
  "blur-chrome": { severity: "error", message: "Backdrop blur is banned. Chrome is opaque with a 1px rule." },
  "glyph-icon": {
    severity: "check",
    message: "Text glyph used as an icon? Use the drawn set in components/ui/icon.tsx.",
  },
  "unlayered-style": {
    severity: "error",
    message: "Unlayered <style precedence> rules beat utilities. Start the string with @layer components { ... }.",
  },
  "mono-on-words": {
    severity: "check",
    message: "font-mono on plain words? Mono is for prompts, commands, paths, ids and measured figures.",
  },
  "lint-directive": {
    severity: "error",
    message: "Broken design-lint-disable-next-line: name known rule ids and give a reason after ' -- '.",
  },
};

export const HEURISTIC_RULES = Object.keys(RULES).filter((id) => RULES[id].severity === "check");

// Image routes render through next/og or as metadata, outside the page's CSS: tokens cannot reach them.
const EXEMPT_FILE = /(^|\/)app\/(?:.*\/)?(?:opengraph-image|twitter-image|icon|apple-icon)\.(?:tsx|ts)$|(^|\/)app\/manifest\.ts$/;

// ---------------------------------------------------------------------------------------------
// Source scanning: blank comments (keeping offsets), collect comments and string literals.

function scanSource(text, isCss) {
  const out = text.split("");
  const comments = [];
  const strings = [];
  const n = text.length;
  const stack = [{ mode: "code", depth: 0, inTemplate: false }];
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const top = stack[stack.length - 1];
    const c = text[i];
    if (top.mode === "template") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        strings.push({ start: top.start, end: i + 1, quote: "`", content: text.slice(top.start + 1, i) });
        stack.pop();
        i++;
        continue;
      }
      if (c === "$" && text[i + 1] === "{") {
        stack.push({ mode: "code", depth: 0, inTemplate: true });
        i += 2;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        const stop = end === -1 ? n : end + 2;
        comments.push({ start: i, end: stop, text: text.slice(i + 2, end === -1 ? n : end) });
        blank(i, stop);
        i = stop;
        continue;
      }
      i++;
      continue;
    }
    if (!isCss && c === "/" && text[i + 1] === "/") {
      let end = text.indexOf("\n", i);
      if (end === -1) end = n;
      comments.push({ start: i, end, text: text.slice(i + 2, end) });
      blank(i, end);
      i = end;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      comments.push({ start: i, end: stop, text: text.slice(i + 2, end === -1 ? n : end) });
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      // Single-line strings: an apostrophe in JSX text then costs at most the rest of its line.
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      const end = Math.min(j, n);
      strings.push({ start: i, end: end + 1, quote: c, content: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (!isCss && c === "`") {
      stack.push({ mode: "template", start: i });
      i++;
      continue;
    }
    if (c === "{") top.depth++;
    else if (c === "}") {
      if (top.inTemplate && top.depth === 0) {
        stack.pop();
        i++;
        continue;
      }
      top.depth--;
    }
    i++;
  }
  return { masked: out.join(""), comments, strings };
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo] + 1 };
  };
}

// The block that follows a header match: from the header's start to its matching "}".
function blockRanges(masked, re) {
  const ranges = [];
  for (const m of masked.matchAll(re)) {
    const open = masked.indexOf("{", m.index + m[0].length - 1);
    if (open === -1) continue;
    let depth = 0;
    let k = open;
    for (; k < masked.length; k++) {
      if (masked[k] === "{") depth++;
      else if (masked[k] === "}" && --depth === 0) break;
    }
    ranges.push([m.index, k + 1]);
  }
  return ranges;
}
const inRanges = (ranges, offset) => ranges.some(([a, b]) => offset >= a && offset < b);

// Balanced parentheses: the text inside the "(" at `open`.
function parenContent(text, open) {
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === "(") depth++;
    else if (text[k] === ")" && --depth === 0) return text.slice(open + 1, k);
  }
  return text.slice(open + 1);
}

// A JSX opening tag starting at `start` ("<Name ..."): its end offset (after ">") and whether it closes itself.
function jsxTag(text, start) {
  let depth = 0;
  let quote = null;
  for (let k = start + 1; k < text.length; k++) {
    const c = text[k];
    if (quote) {
      if (c === "\\") k++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth > 0 && (c === '"' || c === "'" || c === "`")) quote = c;
    else if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (depth === 0 && c === ">") return { end: k + 1, selfClosing: text[k - 1] === "/" };
    else if (depth === 0 && c === "<" && k > start + 1) return null;
  }
  return null;
}

// The JSX element whose opening tag holds `offset`, with its literal text and its {expressions}.
function enclosingElement(masked, offset) {
  const from = Math.max(0, offset - 3000);
  const before = masked.slice(from, offset);
  const re = /<([A-Za-z][\w.]*)/g;
  let last = null;
  for (const m of before.matchAll(re)) last = { index: from + m.index, name: m[1] };
  if (!last) return null;
  const tag = jsxTag(masked, last.index);
  if (!tag || tag.end <= offset) return null;
  if (tag.selfClosing) return { name: last.name, literal: "", expressions: [], selfClosing: true };
  // Children up to the matching close tag (same-name nesting counted).
  const esc = last.name.replace(/\./g, "\\.");
  const openRe = new RegExp(`<${esc}(?![\\w.])`, "g");
  const closeRe = new RegExp(`</${esc}\\s*>`, "g");
  let depth = 1;
  let k = tag.end;
  let childrenEnd = -1;
  while (depth > 0) {
    openRe.lastIndex = k;
    closeRe.lastIndex = k;
    const o = openRe.exec(masked);
    const c = closeRe.exec(masked);
    if (!c) break;
    if (o && o.index < c.index) {
      const t = jsxTag(masked, o.index);
      if (t && !t.selfClosing) depth++;
      k = t ? t.end : o.index + 1;
    } else {
      depth--;
      if (depth === 0) childrenEnd = c.index;
      k = c.index + c[0].length;
    }
  }
  if (childrenEnd === -1 || childrenEnd - tag.end > 4000) return null;
  let children = masked.slice(tag.end, childrenEnd);
  const expressions = [];
  let prev;
  do {
    prev = children;
    children = children.replace(/\{([^{}]*)\}/g, (_, e) => {
      expressions.push(e);
      return " ";
    });
  } while (children !== prev);
  const literal = children
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name: last.name, literal, expressions: expressions.filter((e) => e.trim()), selfClosing: false };
}

// Class tokens with their offsets inside a string literal.
function classTokens(str) {
  const tokens = [];
  const re = /\S+/g;
  for (const m of str.content.matchAll(re)) {
    const raw = m[0];
    const bare = raw.slice(raw.lastIndexOf(":") + 1).replace(/^!/, "");
    tokens.push({ raw, bare, offset: str.start + 1 + m.index + (raw.length - raw.replace(/^.*:/, "").length) });
  }
  return tokens;
}

function inClassContext(masked, str) {
  const before = masked.slice(Math.max(0, str.start - 400), str.start);
  if (/\bclass(?:Name)?\s*=\s*\{?\s*$/.test(before)) return true;
  if (/\b(?:cx|clsx|cn|twMerge|classNames)\(\s*(?:[^()]|\([^()]*\))*$/.test(before)) return true;
  if (/\b\w*(?:className|Class|CLASS|_CLS|Cls)\s*[:=]\s*$/.test(before)) return true;
  return false;
}

function looksLikeClassList(content) {
  const tokens = content.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  if (/[A-Z]/.test(content.replace(/\[[^\]]*\]|\$\{[^}]*\}/g, ""))) return false;
  if (!tokens.every((t) => /^[!\w:\-[\]/.%#(),&>~=*+@'"${}]+$/.test(t))) return false;
  return tokens.some((t) => /[-:[]/.test(t));
}

// px numbers (and rem/em as 16 px) in a CSS value; null when there are none.
function smallestPx(value) {
  let min = null;
  for (const m of value.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)) {
    const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16;
    if (min === null || px < min) min = px;
  }
  return min;
}

// ---------------------------------------------------------------------------------------------
// Resolving what a <style precedence> renders, to see whether it starts with @layer.

function resolveCssStart(text, masked, strings, offset, depth = 0) {
  if (depth > 6) return null;
  let k = offset;
  while (k < masked.length && /[\s{]/.test(masked[k])) k++;
  const c = masked[k];
  if (c === "`" || c === '"' || c === "'") {
    const s = strings.find((x) => x.start === k);
    if (!s) return null;
    const lead = s.content.trimStart();
    if (lead.startsWith("${")) {
      const inner = s.start + 1 + (s.content.length - lead.length) + 2;
      return resolveCssStart(text, masked, strings, inner, depth + 1);
    }
    return lead;
  }
  if (c === "[" || c === "(") return resolveCssStart(text, masked, strings, k + 1, depth + 1);
  const id = /^[A-Za-z_$][\w$]*/.exec(masked.slice(k));
  if (!id) return null;
  const name = id[0];
  const after = masked.slice(k + name.length).trimStart();
  const esc = name.replace(/\$/g, "\\$");
  if (after.startsWith("(")) {
    const fn = new RegExp(`function\\s+${esc}\\s*\\(`).exec(masked);
    const arrow = new RegExp(`(?:const|let|var)\\s+${esc}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?\\([^)]*\\)\\s*(?::[^=]+)?=>\\s*`).exec(masked);
    if (arrow && masked[arrow.index + arrow[0].length] !== "{")
      return resolveCssStart(text, masked, strings, arrow.index + arrow[0].length, depth + 1);
    const at = fn ? fn.index : arrow ? arrow.index : -1;
    if (at === -1) return null;
    const ret = /\breturn\s+/g;
    ret.lastIndex = at;
    const r = ret.exec(masked);
    return r ? resolveCssStart(text, masked, strings, r.index + r[0].length, depth + 1) : null;
  }
  const def = new RegExp(`(?:const|let|var)\\s+${esc}\\s*(?::[^=]+)?=\\s*`).exec(masked);
  return def ? resolveCssStart(text, masked, strings, def.index + def[0].length, depth + 1) : null;
}

// ---------------------------------------------------------------------------------------------
// Linting one file.

const LEGACY = new Set(["display-xl", "display-page", "display-l", "display-m", "display-s", "lede", "ann", "eyebrow", "figure"]);
const LEGACY_DISTINCT = new Set(["display-xl", "display-page", "display-l", "display-m", "display-s", "eyebrow"]);
const GLYPHS = "+›»×◆▸▾";
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

/**
 * Lint one file's text. `file` is a repo-relative path with forward slashes.
 * Returns { findings, disables } where disables counts valid directives and the findings they hid.
 */
export function lintSource(file, text) {
  const isCss = file.endsWith(".css");
  const isGlobals = /(^|\/)app\/globals\.css$/.test(file);
  const { masked, comments, strings } = scanSource(text, isCss);
  const pos = lineIndex(text);
  const raw = [];
  const add = (rule, offset, detail) => raw.push({ rule, offset, detail });

  const printRanges = blockRanges(masked, /@media\s+print\b[^{]*\{/g);
  // The theme token blocks of app/globals.css, the only places a color is written out: Night is
  // the first :root block, and every other theme is an `@utility theme-<name>` block (Paper).
  const rootRange = isGlobals ? blockRanges(masked, /:root\s*\{/g).slice(0, 1) : [];
  const themeRanges = isGlobals ? blockRanges(masked, /@utility\s+theme-[\w-]+\s*\{/g) : [];
  const utilityRanges = isGlobals ? blockRanges(masked, /@utility\s+[\w-]+\s*\{/g) : [];
  const sheetGridRanges = blockRanges(masked, /(?:\.sheet-grid\b[^{};]*|@utility\s+sheet-grid\s*)\{/g);
  const each = (re, fn) => {
    for (const m of masked.matchAll(re)) fn(m);
  };

  // type-arbitrary-size + tiny-text: utilities
  each(/(?<![\w-])text-\[(?:length:)?((?:-?\d*\.?\d+(?:px|rem|em))|(?:clamp|calc|min|max)\([^\]]*\))\]/g, (m) => {
    add("type-arbitrary-size", m.index, m[0]);
    const px = smallestPx(m[1]);
    if (px !== null && px < 12) add("tiny-text", m.index, m[0]);
  });
  // ...CSS declarations (style strings, stylesheets)
  each(/(?<![\w-])font-size\s*:\s*([^;}"'`\n]+)/g, (m) => {
    const px = smallestPx(m[1]);
    if (/\d\s*px/.test(m[1]) && !inRanges(utilityRanges, m.index)) add("type-arbitrary-size", m.index, m[0]);
    if (px !== null && px < 12) add("tiny-text", m.index, m[0]);
  });
  each(/(?<![\w-])font\s*:\s*([^;}"'`\n]+)/g, (m) => {
    const size = /(?:^|\s)(-?\d*\.?\d+)(px|rem|em)(?=\s|\/|$)/.exec(m[1]);
    if (!size) return;
    if (size[2] === "px" && !inRanges(utilityRanges, m.index)) add("type-arbitrary-size", m.index, m[0]);
    const px = size[2] === "px" ? Number(size[1]) : Number(size[1]) * 16;
    if (px < 12) add("tiny-text", m.index, m[0]);
  });
  // ...style objects and SVG attributes
  if (!isCss)
    each(/\bfontSize\s*[:=]\s*\{?\s*(["'`]?)([^,}\n"'`]*)\1/g, (m) => {
      const v = m[2].trim();
      if (!v || /var\(/.test(v)) return;
      const bare = /^\d*\.?\d+$/.test(v);
      if (bare || /\d\s*px/.test(v)) add("type-arbitrary-size", m.index, m[0]);
      const px = bare ? Number(v) : smallestPx(v);
      if (px !== null && px < 12) add("tiny-text", m.index, m[0]);
    });

  // type-arbitrary-weight
  each(/(?<![\w-])font-\[(?:weight:)?\d+\]/g, (m) => add("type-arbitrary-weight", m.index, m[0]));
  each(/(?<![\w-])font-stretch-(?:\[[^\]]+\]|\d+%)/g, (m) => add("type-arbitrary-weight", m.index, m[0]));
  each(/(?<![\w-])-?tracking-\[[^\]]+\]/g, (m) => add("type-arbitrary-weight", m.index, m[0]));

  // side-stripe
  each(/(?<![\w-])border-[lrse]-(\d+)(?![\w-])/g, (m) => Number(m[1]) >= 2 && add("side-stripe", m.index, m[0]));
  each(/(?<![\w-])border-[lrse]-\[(\d*\.?\d+)px\]/g, (m) => Number(m[1]) >= 2 && add("side-stripe", m.index, m[0]));
  each(/border-(?:left|right|inline-start|inline-end)(?:-width)?\s*:\s*(\d*\.?\d+)px/g, (m) => Number(m[1]) >= 2 && add("side-stripe", m.index, m[0]));
  each(/shadow-\[inset_(-?\d*\.?\d+)px_0(?:px)?_0/g, (m) => Math.abs(Number(m[1])) >= 2 && add("side-stripe", m.index, m[0]));
  each(/\binset\s+(-?\d*\.?\d+)px\s+0(?:px)?\s+0(?:px)?(?=[\s;,}"'`)])/g, (m) => Math.abs(Number(m[1])) >= 2 && add("side-stripe", m.index, m[0]));

  // color-literal
  const colorAllowed = (o) => inRanges(rootRange, o) || inRanges(themeRanges, o) || inRanges(printRanges, o);
  each(/(?<![\w&#%$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g, (m) => {
    if (colorAllowed(m.index)) return;
    const before = masked.slice(Math.max(0, m.index - 24), m.index);
    if (/\b(?:href|to|id|htmlFor|hash)\s*=\s*\{?\s*["'`]$/.test(before)) return;
    add("color-literal", m.index, m[0]);
  });
  each(/%23(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (m) => colorAllowed(m.index) || add("color-literal", m.index, m[0]));
  each(/(?<![\w-])(?:rgba?|hsla?|oklch|oklab|hwb)\(/gi, (m) => colorAllowed(m.index) || add("color-literal", m.index, m[0]));
  each(
    new RegExp(`(?<![\\w-])(?:bg|text|border(?:-[xytrblse])?|fill|stroke|ring|outline|from|via|to|shadow|decoration|accent|caret|divide)-(?:white|black|(?:${PALETTE})-\\d{2,3})(?![\\w-])`, "g"),
    (m) => {
      const before = masked.slice(Math.max(0, m.index - 6), m.index);
      if (/hover:$/.test(before) && m[0].startsWith("bg-white")) return; // white-hover reports it
      if (!colorAllowed(m.index)) add("color-literal", m.index, m[0]);
    },
  );

  // white-hover
  each(/hover:bg-white(?:\/\d+)?(?![\w-])/g, (m) => add("white-hover", m.index, m[0]));

  // arbitrary-space
  each(/(?<![\w-])-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-\[(-?\d*\.?\d+)(px|rem|em)\]/g, (m) =>
    add("arbitrary-space", m.index, m[0]),
  );

  // body-grid
  {
    const plain = masked.replace(/_/g, " ");
    each(/(?<!repeating-)linear-gradient\(/g, (m) => {
      const inner = parenContent(plain, m.index + m[0].length - 1);
      if (!/\b1px\s*,\s*transparent\s+1px\b/.test(inner) && !/transparent\s+1px\s*,/.test(inner)) return;
      if (!inRanges(sheetGridRanges, m.index)) add("body-grid", m.index, "linear-gradient(...)");
    });
  }

  // blur-chrome
  each(/(?<![\w-])backdrop-blur(?:-[\w[\]().%]+)?/g, (m) => add("blur-chrome", m.index, m[0]));
  each(/backdrop-filter\s*:[^;}]*blur|backdropFilter\s*:\s*["'`][^"'`]*blur/g, (m) => add("blur-chrome", m.index, m[0]));

  if (!isCss) {
    // kicker
    each(/<Eyebrow(?![\w.])/g, (m) => add("kicker", m.index, "<Eyebrow>"));
    each(/<(PageHead|SheetHeader)(?![\w.])/g, (m) => {
      const tag = jsxTag(masked, m.index);
      if (!tag) return;
      const attr = m[1] === "PageHead" ? "eyebrow" : "label";
      const a = new RegExp(`(?<![\\w-])${attr}\\s*=`).exec(masked.slice(m.index, tag.end));
      if (a) add("kicker", m.index + a.index, `${attr}= on <${m[1]}>`);
    });

    // glyph-icon
    each(new RegExp(`(?<=>)\\s*(?:\\{\\s*(["'\`])([${GLYPHS}])\\1\\s*\\}|([${GLYPHS}])|(&(?:rsaquo|raquo|times);))\\s*(?=<)`, "g"), (m) => {
      const g = m[2] ?? m[3] ?? m[4];
      add("glyph-icon", m.index + m[0].indexOf(g), g);
    });

    // unlayered-style
    each(/<style(?![\w-])/g, (m) => {
      const tag = jsxTag(masked, m.index);
      if (!tag) return;
      const open = masked.slice(m.index, tag.end);
      if (!/\bprecedence\b/.test(open)) return;
      const html = /__html\s*:\s*/.exec(open);
      const start = html ? m.index + html.index + html[0].length : tag.end;
      const lead = tag.selfClosing && !html ? null : resolveCssStart(text, masked, strings, start);
      if (lead === null) add("unlayered-style", m.index, "<style precedence> (string not resolved)");
      else if (!lead.startsWith("@layer")) add("unlayered-style", m.index, "<style precedence>");
    });

    for (const s of strings) {
      if (s.content.length > 2000) continue;
      const tokens = classTokens(s);
      if (!tokens.length) continue;
      // type-legacy-alias
      const classy = inClassContext(masked, s) || looksLikeClassList(s.content);
      for (const t of tokens) {
        if (!LEGACY.has(t.bare)) continue;
        if (LEGACY_DISTINCT.has(t.bare) ? s.quote === "`" || classy || tokens.length === 1 : classy)
          add("type-legacy-alias", t.offset, t.bare);
      }
      const rf = tokens.find((t) => t.bare === "rounded-full");
      const mono = tokens.find((t) => t.bare === "font-mono");
      if (!rf && !mono) continue;
      const el = enclosingElement(masked, s.start);
      // round-number
      if (rf) {
        const sq = squareSize(tokens);
        let numeric = false;
        if (el && !el.selfClosing) {
          if (/^\d{1,3}$/.test(el.literal)) numeric = true;
          else if (!el.literal && el.expressions.some((e) => /\b(?:i|idx|index|n|num|number|count|step|no|rank|position|order)\b|\+\s*1\b|padStart|toString\(\)/.test(e)))
            numeric = true;
        }
        if (numeric || sq) add("round-number", rf.offset, numeric ? "rounded-full around a number" : "rounded-full with a fixed square size");
      }
      // mono-on-words
      if (mono && el && !el.selfClosing && !el.expressions.length && /[A-Za-z]{2}/.test(el.literal)) {
        const codeLike = /[\d/_]|\w\.\w|--|[{}()<>$=#@~|\\]|\b[a-z]+[A-Z]\w*|\b\w+-\w+|^(?:pcre|npm|npx|node|git|curl)\b/;
        if (!codeLike.test(el.literal)) add("mono-on-words", mono.offset, el.literal.slice(0, 40));
      }
    }
  }

  // round-number in CSS rule blocks: border-radius 50% on a fixed square.
  each(/border-radius\s*:\s*(?:50%|9999px|999px)/g, (m) => {
    const open = masked.lastIndexOf("{", m.index);
    const close = masked.indexOf("}", m.index);
    const block = masked.slice(open + 1, close === -1 ? undefined : close);
    const w = /(?:^|[;\s])width\s*:\s*([\d.]+px)/.exec(block);
    const h = /(?:^|[;\s])height\s*:\s*([\d.]+px)/.exec(block);
    if (w && h && w[1] === h[1] && parseFloat(w[1]) >= 16) add("round-number", m.index, m[0]);
  });

  // Directives.
  const disabled = new Map();
  const findings = [];
  let directives = 0;
  for (const c of comments) {
    const m = /design-lint-disable-next-line\b(.*)$/s.exec(c.text);
    if (!m) continue;
    const body = m[1].replace(/\*\/\s*$/, "").trim();
    const [idsPart, ...rest] = body.split(/\s--\s?|\s--$/);
    const reason = rest.join(" -- ").trim();
    const ids = (idsPart ?? "")
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const where = pos(c.start);
    const unknown = ids.filter((id) => !RULES[id]);
    if (!ids.length || unknown.length || !reason || !/--/.test(body)) {
      const why = !ids.length ? "no rule id" : unknown.length ? `unknown rule ${unknown.join(", ")}` : "no reason after ' -- '";
      findings.push(finding(file, where, "lint-directive", `${RULES["lint-directive"].message} (${why})`, text));
      continue;
    }
    directives++;
    const target = pos(c.end).line + 1;
    const set = disabled.get(target) ?? new Set();
    ids.forEach((id) => set.add(id));
    disabled.set(target, set);
  }

  let suppressed = 0;
  const seen = new Set();
  for (const r of raw) {
    const where = pos(r.offset);
    const key = `${r.rule}:${r.offset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (disabled.get(where.line)?.has(r.rule)) {
      suppressed++;
      continue;
    }
    findings.push(finding(file, where, r.rule, RULES[r.rule].message, text, r.detail));
  }
  findings.sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule));
  return { findings, disables: { directives, suppressed } };
}

function squareSize(tokens) {
  const num = (v) => {
    const a = /^\[(\d*\.?\d+)px\]$/.exec(v);
    if (a) return Number(a[1]) >= 16;
    return /^\d+(?:\.\d+)?$/.test(v) && Number(v) >= 5;
  };
  for (const t of tokens) {
    const s = /^size-(.+)$/.exec(t.bare);
    if (s && num(s[1])) return true;
  }
  const w = tokens.map((t) => /^w-(.+)$/.exec(t.bare)?.[1]).filter(Boolean);
  const h = tokens.map((t) => /^h-(.+)$/.exec(t.bare)?.[1]).filter(Boolean);
  return w.some((x) => h.includes(x) && num(x));
}

function finding(file, where, rule, message, text, detail) {
  const lineText = text.split("\n")[where.line - 1] ?? "";
  return {
    file,
    line: where.line,
    column: where.column,
    rule,
    severity: RULES[rule].severity,
    message,
    detail: detail ?? null,
    excerpt: lineText.trim().slice(0, 160),
  };
}

// ---------------------------------------------------------------------------------------------
// Files, areas, summary, CLI.

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(TOOL_DIR, "..");
const EXTENSIONS = /\.(?:tsx|ts|css)$/;

function walk(target, out) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return false;
  }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target).sort()) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      walk(path.join(target, name), out);
    }
  } else if (EXTENSIONS.test(target) && !target.endsWith(".d.ts")) out.push(target);
  return true;
}

export function areaOf(file) {
  const parts = file.split("/");
  if (parts[0] === "app") return "app/";
  if (parts[0] === "components") return parts.length > 2 ? `components/${parts[1]}` : "components/ (root)";
  return parts.length > 1 ? `${parts[0]}/` : "(root)";
}

function parseArgs(argv) {
  const opts = { strict: false, strictAll: false, json: false, summaryOnly: false, rules: [], targets: [], errors: [] };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === "--strict") opts.strict = true;
    else if (a === "--strict-all") opts.strictAll = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--summary-only") opts.summaryOnly = true;
    else if (a === "--rule" || a.startsWith("--rule=")) {
      const v = a === "--rule" ? argv[++k] : a.slice(7);
      if (!v) opts.errors.push("--rule needs a rule id");
      else opts.rules.push(...v.split(",").map((x) => x.trim()).filter(Boolean));
    } else if (a === "--help" || a === "-h") opts.help = true;
    else if (a.startsWith("--")) opts.errors.push(`unknown option ${a}`);
    else opts.targets.push(a);
  }
  for (const r of opts.rules) if (!RULES[r]) opts.errors.push(`unknown rule ${r} (known: ${Object.keys(RULES).join(", ")})`);
  return opts;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function lpad(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function table(title, rows) {
  const w = Math.max(title.length, ...rows.map((r) => r[0].length)) + 2;
  const lines = [`${pad(title, w)}${lpad("error", 7)}${lpad("legacy", 8)}${lpad("check", 7)}${lpad("total", 7)}`];
  for (const [name, c] of rows) lines.push(`${pad(name, w)}${lpad(c.error, 7)}${lpad(c.legacy, 8)}${lpad(c.check, 7)}${lpad(c.error + c.legacy + c.check, 7)}`);
  return lines.join("\n");
}

/**
 * Run the lint. Returns the exit code; writes to io.out / io.err (default process streams).
 * io.cwd resolves the targets; paths in the output are relative to io.root (default: the repo).
 */
export function run(argv, io = {}) {
  const out = io.out ?? ((s) => process.stdout.write(s + "\n"));
  const err = io.err ?? ((s) => process.stderr.write(s + "\n"));
  const cwd = io.cwd ?? process.cwd();
  const root = io.root ?? REPO_ROOT;
  const opts = parseArgs(argv);
  if (opts.help) {
    out("usage: node tools/design-lint.mjs [files or folders] [--strict | --strict-all] [--json] [--rule <id>] [--summary-only]");
    return 0;
  }
  if (opts.errors.length) {
    opts.errors.forEach((e) => err(`design-lint: ${e}`));
    return 2;
  }
  const targets = opts.targets.length ? opts.targets.map((t) => path.resolve(cwd, t)) : ["app", "components"].map((d) => path.join(root, d));
  const files = [];
  for (const t of targets) if (!walk(t, files)) {
    err(`design-lint: no such file or folder: ${path.relative(cwd, t) || t}`);
    return 2;
  }

  const ruleFilter = opts.rules.length ? new Set(opts.rules) : null;
  const findings = [];
  let directives = 0;
  let suppressed = 0;
  let exempt = 0;
  let scanned = 0;
  for (const abs of [...new Set(files)]) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (EXEMPT_FILE.test(rel)) {
      exempt++;
      continue;
    }
    scanned++;
    const res = lintSource(rel, fs.readFileSync(abs, "utf8"));
    directives += res.disables.directives;
    suppressed += res.disables.suppressed;
    for (const f of res.findings) if (!ruleFilter || ruleFilter.has(f.rule)) findings.push(f);
  }

  const zero = () => ({ error: 0, legacy: 0, check: 0 });
  const byRule = Object.fromEntries(Object.keys(RULES).filter((r) => !ruleFilter || ruleFilter.has(r)).map((r) => [r, zero()]));
  const byArea = {};
  const totals = zero();
  for (const f of findings) {
    byRule[f.rule][f.severity]++;
    (byArea[areaOf(f.file)] ??= zero())[f.severity]++;
    totals[f.severity]++;
  }
  const failing = (opts.strict || opts.strictAll ? totals.error : 0) + (opts.strictAll ? totals.legacy : 0);
  const code = failing > 0 ? 1 : 0;
  const heuristicLine = `Heuristic rules (severity "check", a person decides): ${HEURISTIC_RULES.join(", ")}. Every rule reads source text, not the rendered page.`;

  if (opts.json) {
    out(
      JSON.stringify(
        {
          heuristicRules: HEURISTIC_RULES,
          note: heuristicLine,
          filesScanned: scanned,
          filesExempt: exempt,
          totals,
          disables: { directives, suppressed },
          byRule,
          byArea,
          findings,
          exitCode: code,
        },
        null,
        2,
      ),
    );
    return code;
  }

  out(heuristicLine);
  if (!opts.summaryOnly) {
    for (const f of findings) out(`${f.file}:${f.line}:${f.column}  ${pad(f.severity, 6)}  ${pad(f.rule, 21)}  ${f.message}${f.detail ? `  [${f.detail}]` : ""}`);
    if (findings.length) out("");
  }
  const ruleRows = Object.entries(byRule).filter(([, c]) => c.error + c.legacy + c.check > 0 || !ruleFilter);
  out(table("By rule", ruleRows));
  out("");
  out(table("By area", Object.entries(byArea).sort(([a], [b]) => a.localeCompare(b))));
  out("");
  out(
    `${scanned} files scanned (${exempt} image or manifest routes exempt). ` +
      `${totals.error} error, ${totals.legacy} legacy, ${totals.check} check. ` +
      `${directives} disable comments, hiding ${suppressed} findings.` +
      (opts.strict || opts.strictAll ? ` ${opts.strictAll ? "--strict-all" : "--strict"}: ${code ? "FAIL" : "pass"}.` : ""),
  );
  return code;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = run(process.argv.slice(2));
