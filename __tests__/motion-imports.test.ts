import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// GSAP must cost a page nothing until a sequence is about to play (DIRECTION section 6,
// constraint 4), and the motion kit's own first-load cost must stay small. A build is the
// proof; this is the guard that runs with every test run: a static read of the import
// graph. It fails when
//   - any file in app/, components/ or lib/ imports "gsap" or "@gsap/*" other than
//     lib/motion/loader.ts, or the loader imports them with anything but import();
//   - a server component can reach a browser module of the kit without passing through
//     a "use client" file;
//   - the enhancer's first-load graph grows beyond the few small modules listed below
//     (the choreographies, the plan and the timeline builder must come through the loader);
//   - the pure barrel, lib/motion/index.ts, re-exports a browser module.

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib"];
const LOADER = "lib/motion/loader.ts";
const ENHANCER = "components/motion/sequence-enhancer.tsx";
// What a page with a sequence carries from the start: the enhancer and what it imports statically.
const FIRST_LOAD = [ENHANCER, "lib/motion/controller.ts", "lib/motion/decide.ts", "lib/motion/dom.ts", LOADER, "lib/motion/prepaint.ts"];
// What arrives only when a sequence is about to play or be stepped through.
const ON_DEMAND = ["lib/motion/playback.ts", "lib/motion/player.ts", "lib/motion/read.ts"];
// The modules that only make sense in a browser.
const BROWSER_ONLY = [LOADER, "lib/motion/controller.ts", "lib/motion/dom.ts", ...ON_DEMAND];

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const abs = (file: string) => path.join(ROOT, file);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

type Import = { specifier: string; kind: "static" | "type" | "dynamic" };

// Comments out, so a sentence that says import("gsap") is not an import.
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

function parseImports(text: string): Import[] {
  const code = stripComments(text);
  const found: Import[] = [];
  // import x from "y"; import { a } from "y"; import type { A } from "y"; export { a } from "y"; export * from "y"
  for (const m of code.matchAll(/(?:^|[\n;])\s*(import|export)\s+(type\s+)?(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']/g)) {
    found.push({ specifier: m[3] ?? "", kind: m[2] ? "type" : "static" });
  }
  // typeof import("y") is a type; import("y") is a dynamic import.
  for (const m of code.matchAll(/(typeof\s+)?import\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ specifier: m[2] ?? "", kind: m[1] ? "type" : "dynamic" });
  }
  return found;
}

const isGsap = (specifier: string) => specifier === "gsap" || specifier.startsWith("gsap/") || specifier.startsWith("@gsap/");
const isClient = (text: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*["']use client["']/.test(text);

// The graph is walked once per entry, so every answer about a file is kept.
function memo<K, V>(compute: (key: K) => V): (key: K) => V {
  const cache = new Map<K, V>();
  return (key) => {
    if (!cache.has(key)) cache.set(key, compute(key));
    return cache.get(key) as V;
  };
}

const read = memo((file: string) => fs.readFileSync(file, "utf8"));
const importsOf = memo((file: string) => parseImports(read(file)));
const clientFile = memo((file: string) => isClient(read(file)));

const resolveBase = memo((base: string): string | null => {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
});

function resolve(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? path.join(ROOT, specifier.slice(2)) : specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : null;
  return base ? resolveBase(base) : null;
}

// The repository files a module pulls in, following its imports (never a type-only one).
//   server: static and dynamic imports, stopping at a "use client" file (the server only
//           ever holds a reference to one of those);
//   eager:  static imports only: what the bundler must ship in the same load.
function reach(entry: string, mode: "server" | "eager"): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const imp of importsOf(file)) {
      if (imp.kind === "type" || (mode === "eager" && imp.kind === "dynamic")) continue;
      const target = resolve(file, imp.specifier);
      if (target && !seen.has(target) && !(mode === "server" && clientFile(target))) queue.push(target);
    }
  }
  return seen;
}

const importersOf = (target: string, files: string[], kinds: Import["kind"][]) =>
  files.filter((f) => importsOf(f).some((i) => kinds.includes(i.kind) && resolve(f, i.specifier) === abs(target))).map(rel);

const sources = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
const motionFiles = sources.filter((f) => /^(lib\/motion|components\/motion|app\/styleguide\/motion)\//.test(rel(f)));

describe("GSAP stays out of first-load JavaScript", () => {
  it("reads imports the way the bundler does", () => {
    const sample = [
      'import a from "one";',
      'import type { B } from "two";',
      'import { c, type D } from "three";',
      'export { e } from "four";',
      'export * from "five";',
      'import "six";',
      'const g = import("seven");',
      'type H = typeof import("eight").h;',
      '// import("nine") in a comment',
      '/* import ten from "ten" */',
      'const url = "https://example.com/x";',
    ].join("\n");
    expect(parseImports(sample)).toEqual([
      { specifier: "one", kind: "static" },
      { specifier: "two", kind: "type" },
      { specifier: "three", kind: "static" },
      { specifier: "four", kind: "static" },
      { specifier: "five", kind: "static" },
      { specifier: "six", kind: "static" },
      { specifier: "seven", kind: "dynamic" },
      { specifier: "eight", kind: "type" },
    ]);
    expect(isClient('"use client";\nimport x from "y";')).toBe(true);
    expect(isClient('// a note\n\n"use client";')).toBe(true);
    expect(isClient('import x from "y";\n"use client";')).toBe(false);
  });

  it("finds the motion kit's files", () => {
    const names = motionFiles.map(rel);
    for (const expected of [...FIRST_LOAD, ...ON_DEMAND, "components/motion/sequence-root.tsx", "app/styleguide/motion/page.tsx"]) {
      expect(names).toContain(expected);
    }
  });

  it("imports gsap in one file only, and there only with import()", () => {
    const offenders: string[] = [];
    for (const file of sources) {
      for (const imp of importsOf(file)) {
        if (!isGsap(imp.specifier) || imp.kind === "type") continue;
        if (rel(file) !== LOADER) offenders.push(`${rel(file)} imports "${imp.specifier}"`);
        else if (imp.kind !== "dynamic") offenders.push(`${LOADER} imports "${imp.specifier}" statically`);
      }
    }
    expect(offenders).toEqual([]);
    const loaded = importsOf(abs(LOADER)).filter((i) => isGsap(i.specifier) && i.kind === "dynamic");
    expect(loaded.map((i) => i.specifier).sort()).toEqual(["@gsap/react", "gsap", "gsap/DrawSVGPlugin"]);
  });

  // The page's server graph is most of the site: allow for a busy machine.
  it("keeps the kit's browser modules behind a use-client file", { timeout: 60_000 }, () => {
    const servers = motionFiles.filter((f) => /^(components\/motion|app\/styleguide\/motion)\//.test(rel(f)) && !clientFile(f));
    expect(servers.length).toBeGreaterThan(3);
    for (const entry of servers) {
      const reached = [...reach(entry, "server")].map(rel);
      for (const browserOnly of BROWSER_ONLY) expect(reached, `${rel(entry)} reaches ${browserOnly} on the server`).not.toContain(browserOnly);
    }
    // One client component is the way in, and one module holds the loader.
    expect(clientFile(abs(ENHANCER))).toBe(true);
    expect(importersOf("lib/motion/controller.ts", sources, ["static", "dynamic"])).toEqual([ENHANCER]);
    expect(importersOf(LOADER, sources, ["static", "dynamic"])).toEqual(["lib/motion/controller.ts"]);
  });

  it("ships only the enhancer and five small modules with the page; the rest comes through the loader", () => {
    expect([...reach(abs(ENHANCER), "eager")].map(rel).sort()).toEqual([...FIRST_LOAD].sort());
    // The playing code has one way in: the loader's import().
    expect(importersOf("lib/motion/playback.ts", sources, ["dynamic"])).toEqual([LOADER]);
    expect(importersOf("lib/motion/playback.ts", sources, ["static"])).toEqual([]);
    for (const file of ["lib/motion/player.ts", "lib/motion/read.ts"]) {
      expect(importersOf(file, sources, ["static", "dynamic"]).every((f) => ON_DEMAND.includes(f)), `${file} is imported outside the on-demand modules`).toBe(true);
    }
    // And what it pulls in is the kit's own pure modules, nothing of the site.
    const playing = [...reach(abs("lib/motion/playback.ts"), "eager")].map(rel).sort();
    expect(playing).toEqual(
      ["lib/motion/choreographies.ts", "lib/motion/decide.ts", "lib/motion/dom.ts", "lib/motion/plan.ts", "lib/motion/playback.ts", "lib/motion/player.ts", "lib/motion/read.ts", "lib/motion/tokens.ts"].sort(),
    );
  });

  it("keeps the pure barrel pure", () => {
    const barrel = abs("lib/motion/index.ts");
    const targets = importsOf(barrel).map((i) => resolve(barrel, i.specifier)).filter((t): t is string => t !== null).map(rel);
    expect(targets.length).toBeGreaterThan(3);
    for (const browserOnly of BROWSER_ONLY) expect(targets).not.toContain(browserOnly);
    // Nothing the barrel exports touches the page or the loader, however deep. (prepaint.ts
    // holds the pre-paint script as text; it names the document without ever reading one.)
    const reached = [...reach(barrel, "server")].map(rel);
    for (const browserOnly of BROWSER_ONLY) expect(reached).not.toContain(browserOnly);
    for (const file of reached.filter((f) => f !== "lib/motion/prepaint.ts")) {
      expect(stripComments(read(abs(file))), `${file} reads the page`).not.toMatch(/\b(document|window)\./);
    }
  });
});
