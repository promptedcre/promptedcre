import { describe, expect, it } from "vitest";
import { paragraphs, parseInline } from "@/lib/text";

describe("inline text", () => {
  it("parses code, strong and https links, leaving the rest as text", () => {
    expect(parseInline("File **Form D** via `EDGAR`, see [the rule](https://example.test/r).")).toEqual([
      { t: "text", v: "File " },
      { t: "strong", v: "Form D" },
      { t: "text", v: " via " },
      { t: "code", v: "EDGAR" },
      { t: "text", v: ", see " },
      { t: "link", v: "the rule", href: "https://example.test/r" },
      { t: "text", v: "." },
    ]);
  });

  it("never turns non-https links or HTML into markup", () => {
    expect(parseInline("[x](javascript:alert(1)) <b>y</b>")).toEqual([
      { t: "text", v: "[x](javascript:alert(1)) <b>y</b>" },
    ]);
  });

  it("splits paragraphs on blank lines", () => {
    expect(paragraphs("one\n\ntwo\n  \nthree")).toEqual(["one", "two", "three"]);
  });
});
