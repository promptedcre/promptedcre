import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebtCalculator } from "@/components/calc/debt-calculator";
import { CashFlowElevation, DeadlineTimeline, FigureCells, LeadFigure, LimitBars, SensitivityGrid, SplitBar, WaterfallLadder } from "@/components/calc/figures";
import { rollBetween, rollUp, shapeOf } from "@/components/calc/roll";
import { debtFigures } from "@/components/calc/shape";
import { CALC_CSS } from "@/components/calc/styles";
import { DEBT_EXAMPLE, sizeDebt } from "@/lib/calculators/debt";
import { usd } from "@/lib/calculators/trace";

// The calculators' live charts (decision 96): bars that grow in when a drawing is first seen,
// a readout per value, and figures that roll to their new values after an edit. What these
// hold: the server's HTML is the finished drawing with the worked example's own figures; every
// hidden "before" state lives only under full motion on a screen; and a rolling figure only
// ever passes between the two computed values, landing on the new string exactly.

// Text as React writes it into markup.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("a rolling figure", () => {
  it("rolls money from the old value to the new and lands on the new string exactly", () => {
    const roll = rollBetween("$5,273,694", "$6,000,000");
    expect(roll).not.toBeNull();
    expect(roll?.(0)).toBe("$5,273,694");
    expect(roll?.(0.5)).toBe("$5,636,847");
    expect(roll?.(1)).toBe("$6,000,000");
  });

  it("rolls rates, multiples, and two figures held in one frame of words", () => {
    expect(rollBetween("7.05%", "9.15%")?.(0.5)).toBe("8.10%");
    expect(rollBetween("1.25x", "1.75x")?.(0.5)).toBe("1.50x");
    expect(rollBetween("2.00x on $4,200,000", "3.00x on $4,400,000")?.(0.5)).toBe("2.50x on $4,300,000");
    expect(rollBetween("$1,234.56 a month", "$2,234.56 a month")?.(0.25)).toBe("$1,484.56 a month");
  });

  it("writes the new figure's decimals and groups thousands wherever either end does", () => {
    expect(rollBetween("6.5%", "7.25%")?.(0)).toBe("6.50%");
    expect(rollBetween("$999", "$1,999")?.(0.5)).toBe("$1,499");
    expect(rollBetween("$1,999", "$999")?.(0.5)).toBe("$1,499");
  });

  it("passes zero as $0, never as minus zero", () => {
    const roll = rollBetween("-$1,000", "$1,000");
    expect(roll?.(0)).toBe("-$1,000");
    expect(roll?.(0.25)).toBe("-$500");
    expect(roll?.(0.4999)).toBe("$0");
    expect(roll?.(0.5)).toBe("$0");
    expect(roll?.(1)).toBe("$1,000");
  });

  it("does not roll what changes its words, a date, or a bare count: the new string shows at once", () => {
    const pairs: Array<[string, string]> = [
      ["none", "7.05%"],
      ["7.05%", "none"],
      ["$330K", "$1.2M"],
      ["$5,000", "5,000 SF"],
      ["2027-04-15", "2027-05-03"],
      ["Moved from 2027-04-13: $1,000", "Moved from 2027-04-14: $2,000"],
      ["3 of 12", "4 of 12"],
      ["Year 3", "Year 4"],
      ["Years 1 to 3", "Years 1 to 4"],
      ["The same", "$12,000"],
    ];
    for (const [from, to] of pairs) expect(rollBetween(from, to), `${from} to ${to}`).toBeNull();
    expect(rollBetween("$5,000", "$5,000")).toBeNull();
  });

  it("keeps every frame in the new figure's frame, and only between the two values", () => {
    const from = "$4,200,000 in, 7.05% IRR";
    const to = "$4,950,000 in, 9.80% IRR";
    const roll = rollBetween(from, to);
    const frame = shapeOf(to)?.frame;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const text = roll?.(Math.min(p, 1)) ?? "";
      expect(shapeOf(text)?.frame).toEqual(frame);
      const [money = 0, rate = 0] = (shapeOf(text)?.nums ?? []).map((n) => n.value);
      expect(money).toBeGreaterThanOrEqual(4_200_000);
      expect(money).toBeLessThanOrEqual(4_950_000);
      expect(rate).toBeGreaterThanOrEqual(7.05);
      expect(rate).toBeLessThanOrEqual(9.8);
    }
  });

  it("counts up from zero the first time, and leaves words and dates alone", () => {
    const up = rollUp("$5,273,694");
    expect(up?.(0)).toBe("$0");
    expect(up?.(1)).toBe("$5,273,694");
    expect(rollUp("-$12,345.67")?.(0)).toBe("$0.00");
    expect(rollUp("12.90%")?.(0.5)).toBe("6.45%");
    expect(rollUp("none")).toBeNull();
    expect(rollUp("2027-04-15")).toBeNull();
    expect(rollUp("$0")).toBeNull();
  });
});

describe("a live chart's server HTML is the finished drawing", () => {
  const split = renderToStaticMarkup(
    createElement(SplitBar, {
      title: "Cash by party",
      total: 1_000_000,
      totalLabel: "distributed",
      segments: [
        { key: "lp", label: "LP investors", value: 600_000, fill: "solid" },
        { key: "co", label: "Operator co-invest", value: 0, fill: "tint" },
        { key: "promote", label: "Promote", value: 400_000, fill: "light" },
      ],
    }),
  );

  it("reads as one image with the drawing's text alternative, and is not hidden from a screen reader", () => {
    expect(split).toContain('role="img"');
    expect(split).toContain(`aria-label="${esc("Cash by party: LP investors $600,000, Promote $400,000; distributed $1,000,000.")}"`);
    // nothing above the drawing hides it; the readout box inside it is for the eye only
    expect(split.slice(0, split.indexOf('role="img"'))).not.toContain("aria-hidden");
    expect(split).toMatch(/<span aria-hidden="true" class="calc-tip print:hidden">/);
    // the keyboard stop is added only once the script that answers it has arrived
    expect(split).not.toMatch(/tabindex/i);
    // one live line per page, the calculator's own (CalcSheet)
    expect(split).not.toContain("aria-live");
  });

  it("marks each bar to grow and names each value for the readout, from the same numbers", () => {
    expect(split.match(/data-grow="x"/g)).toHaveLength(2);
    expect(split).toContain(`data-read="LP investors" data-read-value="${esc("$600,000 · 60.0% of $1,000,000")}"`);
    expect(split).toContain(`data-read="Promote" data-read-value="${esc("$400,000 · 40.0% of $1,000,000")}"`);
    // no hidden state in the markup itself: the bars are full size until CSS, under full motion, says otherwise
    expect(split).not.toMatch(/style="[^"]*(?:transform|opacity|scale|filter)/);
    expect(split).toContain(">$600,000</span>");
  });

  it("grows a column up from the line or down from it, and names each year", () => {
    const html = renderToStaticMarkup(createElement(CashFlowElevation, { flows: [-4_200_000, 310_000, 325_000, 5_090_529], title: "Levered cash flows", span: "3 years held" }));
    expect(html.match(/data-grow="up"/g)).toHaveLength(3);
    expect(html.match(/data-grow="down"/g)).toHaveLength(1);
    expect(html).toContain(`data-read="Year 0" data-read-value="${esc(usd(-4_200_000, false))}"`);
    expect(html).toContain(`aria-label="${esc("Levered cash flows, by year: year 0 -$4,200,000, year 1 $310,000, year 2 $325,000, year 3 $5,090,529.")}"`);
  });

  it("names each tier, each limit and each date, and keeps the grid a table", () => {
    const ladder = renderToStaticMarkup(
      createElement(WaterfallLadder, {
        total: 1_500_000,
        tiers: [
          { label: "Return of capital", total: 1_000_000, investors: 1_000_000, promote: 0 },
          { label: "Above the pref", total: 500_000, investors: 400_000, promote: 100_000 },
        ],
      }),
    );
    expect(ladder).toContain(`data-read="2. Above the pref" data-read-value="${esc("$500,000 · $400,000 to investors · $100,000 promote")}"`);
    expect(ladder.match(/data-grow="x"/g)).toHaveLength(3);

    const limits = renderToStaticMarkup(
      createElement(LimitBars, {
        loan: 5_000_000,
        limits: [
          { key: "dscr", label: "Coverage", detail: "DSCR at least 1.25x", amount: 5_000_000, binding: true },
          { key: "ltv", label: "Loan-to-value", detail: "at most 70.0%", amount: 5_600_000, binding: false },
        ],
      }),
    );
    expect(limits).toContain(`data-read="Coverage" data-read-value="${esc("$5,000,000 · DSCR at least 1.25x · binds")}"`);

    const timeline = renderToStaticMarkup(
      createElement(DeadlineTimeline, {
        items: [
          { id: "a", label: "Identify the replacement", date: "2027-02-14", rolledFrom: null },
          { id: "b", label: "Close the replacement", date: "2027-06-28", rolledFrom: "2027-06-26" },
        ],
      }),
    );
    expect(timeline).toContain(`data-read="2. Close the replacement" data-read-value="${esc("2027-06-28 · moved from 2027-06-26")}"`);
    expect(timeline.match(/data-grow="pop"/g)).toHaveLength(2);

    const grid = renderToStaticMarkup(
      createElement(SensitivityGrid, {
        rows: [0.06, 0.065],
        cols: [0.02, 0.03],
        values: [
          [0.081, 0.092],
          [0.07, null],
        ],
        base: [1, 0],
        rowLabel: "Exit cap",
        colLabel: "Growth",
        caption: "Levered IRR by exit cap rate (rows) and NOI growth (columns)",
      }),
    );
    expect(grid).toContain('role="group"');
    expect(grid).toContain("<table");
    expect(grid.match(/data-read-start=""/g)).toHaveLength(1);
    expect(grid).toContain(`data-read="Exit cap 6.50% · growth 2.0%" data-read-value="${esc("7.0% · your inputs")}"`);
    // three shaded cells fill in; the cell with no value has no shade to fill
    expect(grid.match(/data-grow="tint"/g)).toHaveLength(3);
    expect(grid.match(/--calc-shade:/g)).toHaveLength(3);
  });

  it("prints the worked example's own figures, the lead set to count up once", () => {
    const r = sizeDebt(DEBT_EXAMPLE);
    const f = debtFigures(DEBT_EXAMPLE, r);
    const html = renderToStaticMarkup(createElement(DebtCalculator, { tool: "calc_sizeDebt" }));
    expect(html).toContain(`<span class="calc-count">${esc(f.lead.value)}</span>`);
    for (const cell of f.rest) expect(html, cell.label).toContain(`<span>${esc(cell.value)}</span>`);
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    // the same pieces, alone
    expect(renderToStaticMarkup(createElement(LeadFigure, { lead: f.lead }))).toContain(`<span class="calc-count">${esc(f.lead.value)}</span>`);
    expect(renderToStaticMarkup(createElement(FigureCells, { cells: f.rest }))).toContain(`<span>${esc(f.rest[0]?.value ?? "")}</span>`);
  });
});

describe("every hidden state lives under full motion, on a screen", () => {
  // The @media screen block of the calculator's stylesheet, and the rest.
  const at = CALC_CSS.indexOf("@media screen{");
  let end = -1;
  for (let i = at, depth = 0; i < CALC_CSS.length; i += 1) {
    if (CALC_CSS[i] === "{") depth += 1;
    else if (CALC_CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const screen = CALC_CSS.slice(at + "@media screen{".length, end);
  const elsewhere = CALC_CSS.slice(0, at) + CALC_CSS.slice(end + 1);
  const rules = screen
    .split("}")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => ({ selector: (r.split("{")[0] ?? "").trim(), body: r.split("{")[1] ?? "" }));

  it("finds the block", () => {
    expect(at).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(at);
    expect(rules.length).toBeGreaterThan(3);
  });

  it("hides a part only before it is seen, only with scripts on and full motion, and never once the page's motion has given up", () => {
    const hiding = rules.filter((r) => /transform:scale\(0\)|opacity:0|filter:blur|background-color:transparent/.test(r.body));
    expect(hiding.map((r) => r.selector)).toHaveLength(4);
    for (const r of hiding) {
      expect(r.selector.startsWith('html.js[data-motion="full"]:not([data-reveal-off]) ')).toBe(true);
      expect(r.selector).toContain(":not([data-seen])");
    }
    // the parts that grow and the lead figure, each by the attribute the figures write
    expect(hiding.some((r) => r.selector.includes('.calc-chart:not([data-seen]) :is([data-grow="x"],[data-grow="up"],[data-grow="down"])'))).toBe(true);
    expect(hiding.some((r) => r.selector.includes('.calc-chart:not([data-seen]) [data-grow="pop"]'))).toBe(true);
    expect(hiding.some((r) => r.selector.includes('.calc-chart:not([data-seen]) [data-grow="tint"]'))).toBe(true);
    expect(hiding.some((r) => r.selector.includes(".calc-count:not([data-seen])"))).toBe(true);
  });

  it("leaves nothing waiting to be seen outside the screen block, so paper and reduced motion get the finished drawing", () => {
    expect(elsewhere).not.toContain("data-seen");
    expect(elsewhere).not.toMatch(/scale\(0\)|filter:blur/);
    expect(elsewhere).not.toMatch(/animation:/);
    // the readout's soft arrival and the lead's focus run only under full motion
    for (const r of rules.filter((x) => /transition:|animation:/.test(x.body))) expect(r.selector.startsWith('html.js[data-motion="full"]')).toBe(true);
  });
});
