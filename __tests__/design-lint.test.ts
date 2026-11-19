import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { HEURISTIC_RULES, RULES, areaOf, lintSource, run } from "../tools/design-lint.mjs";

type Finding = { rule: string; severity: string; line: number; column: number };

const lint = (src: string, file = "components/x/fixture.tsx") => lintSource(file, src).findings as Finding[];
const rules = (src: string, file?: string) => lint(src, file).map((f) => f.rule);
const has = (src: string, rule: string, file?: string) => rules(src, file).includes(rule);

describe("design-lint rules: a hit and a near miss each", () => {
  it("type-arbitrary-size", () => {
    expect(has(`<p className="text-[15px] text-muted">a</p>`, "type-arbitrary-size")).toBe(true);
    expect(has(`<h1 className="text-[clamp(40px,3.95vw,58px)]">a</h1>`, "type-arbitrary-size")).toBe(true);
    expect(has("const S = `.pg{font:600 13px/1 var(--font-sans)}`;", "type-arbitrary-size")).toBe(true);
    expect(has(`<p style={{ fontSize: "14px" }}>a</p>`, "type-arbitrary-size")).toBe(true);
    expect(has(`<p className="text-[var(--x)] text-accent type-body">a</p>`, "type-arbitrary-size")).toBe(false);
    // Allowed inside a utility definition in app/globals.css, not elsewhere in it.
    expect(has("@utility type-note {\n  font-size: 12px;\n}\n", "type-arbitrary-size", "app/globals.css")).toBe(false);
    expect(has(".x {\n  font-size: 13px;\n}\n", "type-arbitrary-size", "app/globals.css")).toBe(true);
  });

  it("type-arbitrary-weight", () => {
    expect(rules(`<p className="font-[580] font-stretch-110% tracking-[-0.02em]">a</p>`).filter((r) => r === "type-arbitrary-weight")).toHaveLength(3);
    expect(has(`<p className="font-mono font-medium tracking-tight">a</p>`, "type-arbitrary-weight")).toBe(false);
  });

  it("type-legacy-alias is legacy severity, and only in class lists", () => {
    const hit = lint(`<p className="ann text-faint">a</p>`);
    expect(hit.map((f) => [f.rule, f.severity])).toEqual([["type-legacy-alias", "legacy"]]);
    expect(has(`<p className={cx("display-m m-0", c)}>a</p>`, "type-legacy-alias")).toBe(true);
    expect(has(`<figure className="m-0">a</figure>`, "type-legacy-alias")).toBe(false);
    expect(has(`const copy = "Read the figure and the lede";`, "type-legacy-alias")).toBe(false);
  });

  it("kicker", () => {
    expect(has(`<Eyebrow>Scene 2</Eyebrow>`, "kicker")).toBe(true);
    expect(has(`<PageHead\n  eyebrow="Library"\n  title="Rules"\n/>`, "kicker")).toBe(true);
    expect(has(`<SheetHeader label="Questions" title="Asked" />`, "kicker")).toBe(true);
    expect(has(`import { Eyebrow } from "@/components/ui";\n<PageHead title="Rules" lede={x} />\n<SheetHeader title="Asked" />`, "kicker")).toBe(false);
  });

  it("side-stripe", () => {
    expect(has(`<div className="border-l-2 border-l-agent">a</div>`, "side-stripe")).toBe(true);
    expect(has(`<div className="border-l-[3px]">a</div>`, "side-stripe")).toBe(true);
    expect(has(`<div className="shadow-[inset_3px_0_0_var(--danger)]">a</div>`, "side-stripe")).toBe(true);
    expect(has("const S = `.a[open]{box-shadow:inset 3px 0 0 var(--agent)}`;", "side-stripe")).toBe(true);
    expect(has("const S = `.n{border-left:2px solid var(--line)}`;", "side-stripe")).toBe(true);
    expect(
      has("<div className=\"border-l border-l-agent border-l-[1px]\">a</div>\nconst S = `.m{box-shadow:inset 0 0 0 1px var(--agent)}`;", "side-stripe"),
    ).toBe(false);
  });

  it("color-literal", () => {
    expect(has(`const S = "color:#ff8b76";`, "color-literal")).toBe(true);
    expect(has(`<div className="bg-[rgba(15,27,47,.94)]">a</div>`, "color-literal")).toBe(true);
    expect(has(`const u = "url(data:image/svg+xml,stroke='%23ff8b76')";`, "color-literal")).toBe(true);
    expect(has(`<div className="bg-slate-900">a</div>`, "color-literal")).toBe(true);
    expect(
      has(`<a href="#add">a</a><svg fill="none" stroke="currentColor"><path fill="transparent" /></svg>`, "color-literal"),
    ).toBe(false);
    // The first :root block and print remaps of app/globals.css hold the literals; a later :root does not.
    const css = ":root {\n  --bg: #070d18;\n  --dim: rgba(1, 2, 3, 0.4);\n}\n@media print {\n  :root { --bg: #ffffff; }\n}\n";
    expect(has(css, "color-literal", "app/globals.css")).toBe(false);
    expect(has(css + ":root {\n  --x: #123456;\n}\n", "color-literal", "app/globals.css")).toBe(true);
  });

  it("color-literal: a theme's token block is the other place a color is written out", () => {
    // Night is the first :root block; every other theme is an `@utility theme-<name>` block of app/globals.css.
    const paper = "@utility theme-paper {\n  color-scheme: light;\n  --bg: #f3f6fa;\n  --scrim: rgba(243, 246, 250, 0.82);\n}\n";
    expect(has(paper, "color-literal", "app/globals.css")).toBe(false);
    // The rules that apply a theme hold no literal of their own, so nothing is allowed there.
    const applied = paper + ":root:where([data-theme=\"paper\"]) {\n  @apply theme-paper;\n  --x: #123456;\n}\n";
    expect(lint(applied, "app/globals.css").map((f) => [f.rule, f.line])).toEqual([["color-literal", 8]]);
    // Nowhere new: not another utility, not a theme block in any other stylesheet or in a component.
    expect(has("@utility type-note {\n  color: #123456;\n}\n", "color-literal", "app/globals.css")).toBe(true);
    expect(has("@utility themes {\n  --bg: #123456;\n}\n", "color-literal", "app/globals.css")).toBe(true);
    expect(has(paper, "color-literal", "app/other.css")).toBe(true);
    expect(has("const S = `@utility theme-paper{--bg:#f3f6fa}`;", "color-literal")).toBe(true);
  });

  it("white-hover", () => {
    expect(has(`<button className="hover:bg-white/10">a</button>`, "white-hover")).toBe(true);
    expect(has(`<button className="hover:bg-panel">a</button>`, "white-hover")).toBe(false);
  });

  it("round-number (check)", () => {
    const hit = lint(`{steps.map((s, i) => <span className="rounded-full border">{i + 1}</span>)}`);
    expect(hit.map((f) => [f.rule, f.severity])).toEqual([["round-number", "check"]]);
    expect(has(`const NUM = "rounded-full size-6 border";`, "round-number")).toBe(true);
    expect(has(`<span className="rounded-full size-2 bg-agent" />\n<span className="rounded-full border">Label</span>`, "round-number")).toBe(false);
  });

  it("tiny-text", () => {
    expect(has(`<p className="text-[11px]">a</p>`, "tiny-text")).toBe(true);
    expect(has("const S = `.t{font-size:10px}`;", "tiny-text")).toBe(true);
    expect(has(`<text fontSize={11}>a</text>`, "tiny-text")).toBe(true);
    expect(has(`<p className="text-[12px]">a</p>`, "tiny-text")).toBe(false);
  });

  it("arbitrary-space", () => {
    expect(rules(`<p className="py-[7px] md:-mt-[3px] gap-[0.4rem]">a</p>`).filter((r) => r === "arbitrary-space")).toHaveLength(3);
    expect(has(`<p className="py-2 scroll-mt-[76px] top-[3px] w-[40em]">a</p>`, "arbitrary-space")).toBe(false);
  });

  it("body-grid", () => {
    const grid = "linear-gradient(var(--grid-major) 1px, transparent 1px)";
    expect(has(`body {\n  background-image: ${grid};\n}\n`, "body-grid", "app/globals.css")).toBe(true);
    expect(has(`<div className="bg-[linear-gradient(90deg,var(--g)_1px,transparent_1px)]">a</div>`, "body-grid")).toBe(true);
    expect(has(`.sheet-grid {\n  background-image: ${grid};\n}\n`, "body-grid", "app/globals.css")).toBe(false);
    expect(has("const S = `.h{background:repeating-linear-gradient(135deg,var(--agent) 0 1px,transparent 1px 4px)}`;", "body-grid")).toBe(false);
  });

  it("blur-chrome", () => {
    expect(has(`<header className="backdrop-blur-[10px]">a</header>`, "blur-chrome")).toBe(true);
    expect(has("const S = `.h{backdrop-filter: blur(4px)}`;", "blur-chrome")).toBe(true);
    expect(has(`<header className="bg-bg blur-sm">a</header>`, "blur-chrome")).toBe(false);
  });

  it("glyph-icon (check)", () => {
    expect(has(`<span aria-hidden="true">›</span>`, "glyph-icon")).toBe(true);
    expect(has(`<span aria-hidden="true">{"+"}</span>`, "glyph-icon")).toBe(true);
    expect(has(`<span>Rules › Index</span><span>+1 more</span>`, "glyph-icon")).toBe(false);
  });

  it("unlayered-style", () => {
    const style = `<style href="x" precedence="default">{CSS}</style>`;
    expect(has("const CSS = `.a{color:var(--text)}`;\n" + style, "unlayered-style")).toBe(true);
    expect(has("function css() {\n  return `\n.a{}`;\n}\n<style href={`x`} precedence=\"default\">{css()}</style>", "unlayered-style")).toBe(true);
    expect(has("const CSS = `@layer components{.a{color:var(--text)}}`;\n" + style, "unlayered-style")).toBe(false);
    expect(has("const A = `@layer components{.a{}}`;\nconst CSS = [A].join(\"\");\n" + style, "unlayered-style")).toBe(false);
    expect(has(`<style>{".a{}"}</style>`, "unlayered-style")).toBe(false);
  });

  it("mono-on-words (check)", () => {
    expect(has(`<span className="font-mono text-faint">Not recorded</span>`, "mono-on-words")).toBe(true);
    expect(
      has(
        `<code className="font-mono">pcre audit --json</code>\n<span className="font-mono">{id}</span>\n<span className="font-mono">content/demo/run.json</span>`,
        "mono-on-words",
      ),
    ).toBe(false);
  });

  it("reports file:line:column", () => {
    const [f] = lint(`const a = 1;\n  <p className="py-[7px]">a</p>`);
    expect([f?.line, f?.column]).toEqual([2, 17]);
  });
});

describe("design-lint disable comments", () => {
  it("hides the next line's finding when a reason is given, and counts it", () => {
    const src = `// design-lint-disable-next-line color-literal -- themeColor needs a literal\nconst t = "#070d18";\nconst u = "#070d18";`;
    const res = lintSource("app/layout.tsx", src);
    expect(res.findings.map((f: Finding) => [f.rule, f.line])).toEqual([["color-literal", 3]]);
    expect(res.disables).toEqual({ directives: 1, suppressed: 1 });
  });

  it("works as a JSX comment and for several rules", () => {
    const src = `{/* design-lint-disable-next-line kicker, tiny-text -- styleguide specimen */}\n<Eyebrow className="text-[11px]">a</Eyebrow>`;
    expect(rules(src)).toEqual(["type-arbitrary-size"]);
    expect(lintSource("components/x/f.tsx", src).disables).toEqual({ directives: 1, suppressed: 2 });
  });

  it("refuses a disable without a reason or with an unknown rule", () => {
    const noReason = lint(`// design-lint-disable-next-line color-literal\nconst t = "#070d18";`);
    expect(noReason.map((f) => f.rule).sort()).toEqual(["color-literal", "lint-directive"]);
    const unknown = lint(`// design-lint-disable-next-line colour -- typo\nconst t = "#070d18";`);
    expect(unknown.map((f) => f.rule).sort()).toEqual(["color-literal", "lint-directive"]);
  });
});

describe("design-lint command line", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-lint-"));
  fs.mkdirSync(path.join(dir, "components", "home"), { recursive: true });
  fs.writeFileSync(path.join(dir, "components", "home", "bad.tsx"), `export const A = () => <p className="text-[15px]">a</p>;\n`);
  fs.writeFileSync(path.join(dir, "components", "old.tsx"), `export const B = () => <p className="ann">a</p>;\n`);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const call = (argv: string[]) => {
    const lines: string[] = [];
    const code = run(argv, { out: (s: string) => lines.push(s), err: (s: string) => lines.push(s), cwd: dir, root: dir });
    return { code, text: lines.join("\n") };
  };

  it("default mode prints the heuristics line and summary, and exits 0", () => {
    const { code, text } = call(["components"]);
    expect(code).toBe(0);
    expect(text.split("\n")[0]).toContain(HEURISTIC_RULES.join(", "));
    expect(text).toContain("components/home/bad.tsx:1:38");
    expect(text).toMatch(/By rule/);
    expect(text).toMatch(/components\/home\s+1\s+0\s+0\s+1/);
    expect(text).toMatch(/components\/ \(root\)\s+0\s+1\s+0\s+1/);
  });

  it("--strict fails on errors only; --strict-all also fails on legacy", () => {
    expect(call(["components", "--strict"]).code).toBe(1);
    expect(call(["components/old.tsx", "--strict"]).code).toBe(0);
    expect(call(["components/old.tsx", "--strict-all"]).code).toBe(1);
  });

  it("--json and --rule", () => {
    const { code, text } = call(["components", "--json", "--rule", "type-legacy-alias"]);
    expect(code).toBe(0);
    const j = JSON.parse(text);
    expect(j.findings).toHaveLength(1);
    expect(j.findings[0]).toMatchObject({ file: "components/old.tsx", line: 1, rule: "type-legacy-alias", severity: "legacy" });
    expect(j.heuristicRules).toEqual(HEURISTIC_RULES);
    expect(call(["--rule", "no-such-rule"]).code).toBe(2);
  });

  it("sets the process exit code when run as a command", () => {
    const tool = path.join(process.cwd(), "tools", "design-lint.mjs");
    const res = spawnSync(process.execPath, [tool, path.join(dir, "components"), "--strict"], { encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("--strict: FAIL");
  });

  it("knows every rule it reports, with a severity", () => {
    for (const r of Object.values(RULES) as { severity: string; message: string }[]) {
      expect(["error", "legacy", "check"]).toContain(r.severity);
      expect(r.message.length).toBeGreaterThan(10);
    }
    expect(areaOf("app/run/page.tsx")).toBe("app/");
    expect(areaOf("components/run/run-board.tsx")).toBe("components/run");
  });
});
