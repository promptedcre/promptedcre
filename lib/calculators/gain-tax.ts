// Tax on a gain from a sale, at the rates entered: the one place after-tax,
// exchange-1031 and sale-proceeds split a gain and price it, so the three cannot drift
// apart. A gain is split into the part up to the depreciation taken (unrecaptured
// section 1250 gain, as these calculators take it) and the rest; the first part is
// priced at the unrecaptured rate and the rest at the capital gain rate, the net
// investment income rate added to both as if all of the gain were above that tax's
// threshold. A loss has no parts and no tax. Every rate is an input. Pure arithmetic:
// no clock, no I/O, nothing rounded. Not tax advice.
//
// The three callers differ on purpose, and each difference is a parameter here:
// - after-tax carries a year's operating loss forward against the gain on sale, so it
//   passes that loss as `carriedLoss`; it offsets the rest of the gain first and the
//   unrecaptured part second, and what is left over is not credited. The other two
//   price one sale on its own and pass nothing (0).
// - exchange-1031 prices two gains with the same rates and depreciation: the gain
//   recognized now (from the depreciation part first) and the whole realized gain.
// - sale-proceeds lets all three rates be blank to figure no tax; it calls splitGain
//   alone then and taxGain only when the rates were entered.

export type GainRates = {
  capitalGain: number; // long-term capital gain rate on the rest of the gain
  unrecaptured: number; // rate on the part up to the depreciation taken
  nii: number; // net investment income tax rate, added to both
};

export type GainSplit = {
  unrecaptured: number; // the lesser of the depreciation taken and the gain; 0 on a loss
  rest: number; // the rest of the gain; 0 on a loss
};

export type GainTax = GainSplit & {
  lossCarriedIn: number; // the carried loss passed in
  lossUsedOnRest: number;
  lossUsedOnUnrecaptured: number;
  lossUnused: number; // carried loss larger than the gain: not credited
  taxOnUnrecaptured: number;
  taxOnRest: number;
  tax: number;
};

// The split alone. A gain of zero or less has no parts.
export function splitGain(gain: number, depreciationTaken: number): GainSplit {
  const positive = Math.max(0, gain);
  const unrecaptured = Math.min(depreciationTaken, positive);
  return { unrecaptured, rest: positive - unrecaptured };
}

// The split and the tax on it. `carriedLoss` is 0 for a sale priced on its own; only
// after-tax passes one (see above).
export function taxGain(gain: number, depreciationTaken: number, rates: GainRates, carriedLoss = 0): GainTax {
  const { unrecaptured, rest } = splitGain(gain, depreciationTaken);
  let carried = carriedLoss;
  const lossUsedOnRest = Math.min(carried, rest);
  carried -= lossUsedOnRest;
  const lossUsedOnUnrecaptured = Math.min(carried, unrecaptured);
  carried -= lossUsedOnUnrecaptured;
  const taxOnUnrecaptured = (unrecaptured - lossUsedOnUnrecaptured) * (rates.unrecaptured + rates.nii);
  const taxOnRest = (rest - lossUsedOnRest) * (rates.capitalGain + rates.nii);
  return {
    unrecaptured,
    rest,
    lossCarriedIn: carriedLoss,
    lossUsedOnRest,
    lossUsedOnUnrecaptured,
    lossUnused: carried,
    taxOnUnrecaptured,
    taxOnRest,
    tax: taxOnUnrecaptured + taxOnRest,
  };
}
