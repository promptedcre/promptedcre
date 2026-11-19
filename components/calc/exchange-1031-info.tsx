import { EXCHANGE_1031_EXAMPLE, runExchange1031, type Exchange1031Input, type Exchange1031Result } from "@/lib/calculators/exchange-1031";
import { usd } from "@/lib/calculators/trace";
import { HeadlineFigures, type Headline } from "./figures";
import type { ModuleInfo } from "./module-info";

// What the site says about this calculator, and its worked example drawn for /calculators.
// Server-safe and pure; the client calculator imports the headline and figures from here.

export function exchange1031Headline(r: Exchange1031Result): string {
  const basis = `the replacement's basis is ${usd(r.replacementBasis, false)}`;
  if (r.isLoss) return `The ${usd(-r.realizedGain, false)} loss is not recognized; it carries into the replacement, whose basis is ${usd(r.replacementBasis, false)}.`;
  if (r.realizedGain === 0) return `There is no gain to defer; ${basis}.`;
  if (r.recognizedGain === 0) return `All of the ${usd(r.realizedGain, false)} gain is deferred; ${basis}.`;
  if (r.deferredGain === 0) return `Boot covers the whole ${usd(r.realizedGain, false)} gain, so all of it is recognized now; ${basis}.`;
  return `Of the ${usd(r.realizedGain, false)} gain, ${usd(r.recognizedGain, false)} is recognized now and ${usd(r.deferredGain, false)} is deferred; ${basis}.`;
}

export function exchange1031Figures(d: Exchange1031Input, r: Exchange1031Result): { lead: Headline; rest: Headline[] } {
  return {
    lead: r.isLoss
      ? { label: "Loss carried into basis", value: usd(-r.deferredGain, false), sub: "not recognized in an exchange" }
      : { label: "Gain deferred", value: usd(r.deferredGain, false), sub: `of a ${usd(r.realizedGain, false)} realized gain` },
    rest: [
      { label: "Recognized now", value: usd(r.recognizedGain, false), sub: r.isLoss ? "a loss is not recognized" : "the lesser of boot and gain" },
      { label: "Boot received", value: usd(r.boot, false), sub: "cash, other property, net debt relief" },
      { label: "Replacement basis", value: usd(r.replacementBasis, false), sub: `on a ${usd(d.replacementPrice, false)} price` },
      { label: "Tax now", value: usd(r.taxNow, false), sub: "at the rates entered" },
      { label: "Tax deferred", value: usd(r.taxDeferred, false), sub: "at the same rates" },
    ],
  };
}

// The cells the page prints under the lead figure: every one but those whose figure the
// headline already states, so a number is said once.
export function exchange1031Cells(d: Exchange1031Input, r: Exchange1031Result): Headline[] {
  return exchange1031Figures(d, r).rest.filter((h) => h.label !== "Recognized now" && h.label !== "Replacement basis");
}

export const exchange1031Info: ModuleInfo = {
  meta: {
    purpose: "Work out what a like-kind exchange defers: the gain realized, the boot after debt and cash net against each other, the gain recognized now, the gain deferred, the replacement's basis and the tax at rates you enter.",
    checkedAgainst: "independent",
    checkedShort: "Independent calculation",
    pinned: [
      "The worked example's amount realized, realized gain, netting, boot, recognized and deferred gain, basis both ways, sources and uses gap, tax now, tax on the whole gain and tax deferred match a separate Python calculation (decimal module, 2026-11-13) laid out as IRS Form 8824 lines 15 to 25, to the cent.",
      "The regulation's own illustrations in 26 CFR 1.1031(d)-2 (example 1, and example 2 for both parties) and 1.1031(b)-1 (example 1) come out to the recognized gain and basis the regulation states.",
      "Trading down in debt with cash added to cover it, with none, and with part of it; full boot; a loss; other property received; zero rates; and inputs that do not balance are pinned to the same Python calculation; a balanced closing entered in cents shows a gap of exactly zero.",
      "On five balanced closings, sources equal uses, recognized plus deferred equals realized, recognized never exceeds boot or gain, the two bases agree, tax now plus tax deferred equals the tax on the whole gain, and with no boot the basis equals its closed form; costs above the price, a rate of 100% and negative amounts are refused in plain words.",
    ],
    tests: ["__tests__/calc-exchange-1031.test.ts", "__tests__/calc-modules.test.ts"],
  },
  exampleLine: `a ${usd(EXCHANGE_1031_EXAMPLE.salePrice, false)} sale on a ${usd(EXCHANGE_1031_EXAMPLE.adjustedBasis, false)} basis, traded into a ${usd(EXCHANGE_1031_EXAMPLE.replacementPrice, false)} replacement with ${usd(EXCHANGE_1031_EXAMPLE.cashTaken, false)} taken out in cash`,
  headline: () => exchange1031Headline(runExchange1031(EXCHANGE_1031_EXAMPLE)),
  preview: () => {
    const f = exchange1031Figures(EXCHANGE_1031_EXAMPLE, runExchange1031(EXCHANGE_1031_EXAMPLE));
    return <HeadlineFigures lead={f.lead} rest={f.rest} compact />;
  },
};
