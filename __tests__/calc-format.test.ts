import { describe, expect, it } from "vitest";
import { count, longDate, monthLabel, niceTicks, parseCash, shortUsd } from "@/components/calc/format";

describe("shortUsd", () => {
  it("keeps whole values of 100 and more (a trailing zero is not a decimal)", () => {
    expect(shortUsd(100e6)).toBe("$100M");
    expect(shortUsd(150e6)).toBe("$150M");
    expect(shortUsd(200e6)).toBe("$200M");
    expect(shortUsd(500e6)).toBe("$500M");
    expect(shortUsd(100e3)).toBe("$100K");
    expect(shortUsd(150e3)).toBe("$150K");
    expect(shortUsd(250e3)).toBe("$250K");
    expect(shortUsd(100e9)).toBe("$100B");
    expect(shortUsd(150e9)).toBe("$150B");
    expect(shortUsd(100)).toBe("$100");
    expect(shortUsd(150)).toBe("$150");
  });

  it("writes the K, M and B ranges to about three figures", () => {
    expect(shortUsd(940)).toBe("$940");
    expect(shortUsd(1000)).toBe("$1K");
    expect(shortUsd(1250)).toBe("$1.25K");
    expect(shortUsd(1500)).toBe("$1.5K");
    expect(shortUsd(10_000)).toBe("$10K");
    expect(shortUsd(330_000)).toBe("$330K");
    expect(shortUsd(1e6)).toBe("$1M");
    expect(shortUsd(2.5e6)).toBe("$2.5M");
    expect(shortUsd(5_273_694)).toBe("$5.27M");
    expect(shortUsd(10e6)).toBe("$10M");
    expect(shortUsd(12.5e6)).toBe("$12.5M");
    expect(shortUsd(50e6)).toBe("$50M");
    expect(shortUsd(1e9)).toBe("$1B");
    expect(shortUsd(1.25e9)).toBe("$1.25B");
    expect(shortUsd(20e9)).toBe("$20B");
  });

  it("carries a value that rounds to 1,000 of a unit into the next unit", () => {
    expect(shortUsd(999)).toBe("$999");
    expect(shortUsd(999.4)).toBe("$999");
    expect(shortUsd(999.5)).toBe("$1K");
    expect(shortUsd(9_999.6)).toBe("$10K");
    expect(shortUsd(999_000)).toBe("$999K");
    expect(shortUsd(999_499)).toBe("$999K");
    expect(shortUsd(999_500)).toBe("$1M");
    expect(shortUsd(999_999)).toBe("$1M");
    expect(shortUsd(999.4e6)).toBe("$999M");
    expect(shortUsd(999.5e6)).toBe("$1B");
    expect(shortUsd(1000e6)).toBe("$1B");
  });

  it("signs negatives and never writes -$0", () => {
    expect(shortUsd(-1.5e6)).toBe("-$1.5M");
    expect(shortUsd(-150e6)).toBe("-$150M");
    expect(shortUsd(-940)).toBe("-$940");
    expect(shortUsd(0)).toBe("$0");
    expect(shortUsd(-0.3)).toBe("$0");
  });

  it("labels every axis tick with its own value", () => {
    for (const max of [6e6, 9e6, 150e6, 2.5e9, 900e3]) {
      for (const t of niceTicks(max)) {
        if (t === 0) continue;
        const label = shortUsd(t);
        const m = /^\$([\d.]+)([KMB]?)$/.exec(label);
        expect(m, label).not.toBeNull();
        const scale = { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m?.[2] ?? ""] ?? 1;
        expect(Number(m?.[1]) * scale).toBeCloseTo(t, -1);
      }
    }
  });
});

describe("parseCash", () => {
  it("reads a figure with thousands commas as one year", () => {
    expect(parseCash("1,600,000")).toEqual([1_600_000]);
    expect(parseCash("$60,000, $60,000, 1,600,000")).toEqual([60_000, 60_000, 1_600_000]);
    expect(parseCash("-25,000; 650,000.50")).toEqual([-25_000, 650_000.5]);
  });

  it("separates years by a comma and space, a bare comma, a semicolon or a space", () => {
    expect(parseCash("25000, 25000, 650000")).toEqual([25_000, 25_000, 650_000]);
    expect(parseCash("60000,60000")).toEqual([60_000, 60_000]);
    expect(parseCash("10000 600000")).toEqual([10_000, 600_000]);
    expect(parseCash("10000;600000")).toEqual([10_000, 600_000]);
    expect(parseCash("")).toEqual([]);
  });

  it("leaves a typo as NaN for validation to name", () => {
    expect(parseCash("12a").every((n) => Number.isNaN(n))).toBe(true);
  });
});

describe("count", () => {
  it("uses the singular for one", () => {
    expect(count(1, "playbook step")).toBe("1 playbook step");
    expect(count(6, "playbook step")).toBe("6 playbook steps");
    expect(count(0, "line")).toBe("0 lines");
  });
});

describe("dates", () => {
  it("labels a month in ISO order", () => {
    expect(monthLabel("2026-06-01")).toBe("2026-06");
    expect(monthLabel("2027-02-01")).toBe("2027-02");
  });

  it("writes a long date", () => {
    expect(longDate("2026-07-06")).toBe("Jul 6, 2026");
  });
});
