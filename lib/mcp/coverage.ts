// The states PromptedCRE does not cover, when an ask names one (CH06). Coverage is federal and
// Texas, with Delaware for entity formation; an ask about any other state gets a "not
// covered" note beside whatever the words matched, never ranked results alone.
//
// A name matches in any case. A two-letter code matches only in capitals, on the ask as
// typed, and not in an ask typed all in capitals: "in", "or", "me" and "hi" are ordinary
// words, and "OK" is one even in capitals. Texas and Delaware are covered, so never named.

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const CODES_NEVER = new Set(["OK"]);

// Longest names first, so "West Virginia" is taken before "Virginia" can match inside it.
const NAMES = Object.values(STATES).sort((a, b) => b.length - a.length);

export function statesNotCovered(ask: string): string[] {
  const found = new Set<string>();
  let rest = ask;
  for (const name of NAMES) {
    const re = new RegExp(`(?<![A-Za-z])${name.replace(/ /g, "\\s+")}(?![A-Za-z])`, "gi");
    if (re.test(rest)) {
      found.add(name);
      rest = rest.replace(re, " ");
    }
  }
  if (rest !== rest.toUpperCase()) {
    for (const m of rest.matchAll(/(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])/g)) {
      const code = m[1] ?? "";
      const name = STATES[code];
      if (name && !CODES_NEVER.has(code)) found.add(name);
    }
  }
  return [...found];
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

// The note a search or a situation match carries when the ask names a state outside coverage.
export function coverageNote(ask: string): string | null {
  const names = statesNotCovered(ask);
  if (names.length === 0) return null;
  return `Not covered: ${joinNames(names)}. PromptedCRE covers federal and Texas rules, with Delaware for entity formation; nothing here is written for ${names.length === 1 ? "that state" : "those states"}, so any results below are word matches only.`;
}
