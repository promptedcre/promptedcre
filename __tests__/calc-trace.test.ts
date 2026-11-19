import { describe, expect, it } from "vitest";
import { multiple, num, pct, usd } from "@/lib/calculators/trace";

// A value that rounds to zero at the digits shown prints as zero, never as minus zero;
// every other value prints as it always has.

describe("trace formatting never prints minus zero", () => {
  it("usd: floating-point residue below zero prints as zero", () => {
    expect(usd(-7e-12)).toBe("$0.00");
    expect(usd(-0.004)).toBe("$0.00");
    expect(usd(-0.4, false)).toBe("$0");
    expect(usd(-0)).toBe("$0.00");
  });

  it("usd: a value that rounds away from zero keeps its sign", () => {
    expect(usd(-0.005)).toBe("-$0.01");
    expect(usd(-0.6, false)).toBe("-$1");
    expect(usd(-1_234.5)).toBe("-$1,234.50");
    expect(usd(1_234_567.891)).toBe("$1,234,567.89");
    expect(usd(1_234_567.891, false)).toBe("$1,234,568");
    expect(usd(0)).toBe("$0.00");
  });

  it("pct: a tiny negative rate prints as zero at the digits asked for", () => {
    expect(pct(-1e-9)).toBe("0.00%");
    expect(pct(-0.00004)).toBe("0.00%");
    expect(pct(-0.00004, 4)).toBe("-0.0040%");
    expect(pct(-1e-7, 4)).toBe("0.0000%");
    expect(pct(-0.0001, 0)).toBe("0%");
  });

  it("pct: ordinary values are unchanged", () => {
    expect(pct(0.065)).toBe("6.50%");
    expect(pct(-0.0123)).toBe("-1.23%");
    expect(pct(0.0976718976, 4)).toBe("9.7672%");
    expect(pct(0)).toBe("0.00%");
  });

  it("num and multiple follow the same rule", () => {
    expect(num(-1e-9)).toBe("0.00");
    expect(num(-1_234.567)).toBe("-1,234.57");
    expect(num(1.25)).toBe("1.25");
    expect(multiple(-1e-9)).toBe("0.00x");
    expect(multiple(-0.5)).toBe("-0.50x");
    expect(multiple(1.8)).toBe("1.80x");
  });
});
