// Leak-check matcher, shared by check.mjs, selftest.mjs and the unit tests.
//
// The denylist is a local file outside the repo, one entry per line:
//   <category>\t<value>
// Categories:
//   phrase     case-insensitive word sequence (names, companies, street addresses)
//   phrase-cs  case-sensitive word sequence (names made of everyday words)
//   id         exact token (record ids)
//   email      email address
//   domain     email or web domain; also matches its subdomains and addresses
//   phone      ten digits
//   money      amount in cents
//   pct        percentage, decimal string
//   area       square feet, integer
//   acres      acres, decimal string
//
// Hits report file, line, column, category and length. Never the matched text.

export const CATEGORIES = [
  "phrase",
  "phrase-cs",
  "id",
  "email",
  "domain",
  "phone",
  "money",
  "pct",
  "area",
  "acres",
];

const WORD = /[A-Za-z0-9&']+/g;

export function phraseTokens(text, caseSensitive = false) {
  const tokens = (text.match(WORD) ?? []).map((t) => t.replace(/^'+|'+$/g, "")).filter(Boolean);
  return caseSensitive ? tokens : tokens.map((t) => t.toLowerCase());
}

export function normalizeDecimal(value) {
  const n = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return String(Number(n.toFixed(4)));
}

export function normalizeAllow(text) {
  return phraseTokens(text).join(" ");
}

export function parseDenylist(text, allowPhrases = []) {
  const allow = new Set(allowPhrases.map(normalizeAllow).filter(Boolean));
  const dl = {
    phrases: new Map(), // first token -> [{ tokens, cs }]
    phrasesCs: new Map(),
    ids: new Set(),
    emails: new Set(),
    domains: new Set(),
    phones: new Set(),
    money: new Set(),
    pct: new Set(),
    area: new Set(),
    acres: new Set(),
    count: 0,
  };
  const addPhrase = (map, tokens) => {
    if (tokens.length === 0) return;
    const first = tokens[0];
    if (!map.has(first)) map.set(first, []);
    map.get(first).push(tokens);
    dl.count += 1;
  };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith("#")) continue;
    const tab = raw.indexOf("\t");
    if (tab < 0) continue;
    const cat = raw.slice(0, tab);
    const value = raw.slice(tab + 1).trim();
    if (!value) continue;
    switch (cat) {
      case "phrase": {
        const tokens = phraseTokens(value);
        if (!allow.has(tokens.join(" "))) addPhrase(dl.phrases, tokens);
        break;
      }
      case "phrase-cs": {
        const tokens = phraseTokens(value, true);
        if (!allow.has(tokens.join(" ").toLowerCase())) addPhrase(dl.phrasesCs, tokens);
        break;
      }
      case "id":
        dl.ids.add(value);
        dl.count += 1;
        break;
      case "email":
        dl.emails.add(value.toLowerCase());
        dl.count += 1;
        break;
      case "domain":
        if (!allow.has(normalizeAllow(value))) {
          dl.domains.add(value.toLowerCase());
          dl.count += 1;
        }
        break;
      case "phone":
        if (/^\d{10}$/.test(value)) {
          dl.phones.add(value);
          dl.count += 1;
        }
        break;
      case "money":
        if (/^\d+$/.test(value)) {
          dl.money.add(value);
          dl.count += 1;
        }
        break;
      case "pct":
      case "acres": {
        const v = normalizeDecimal(value);
        if (v) {
          dl[cat].add(v);
          dl.count += 1;
        }
        break;
      }
      case "area":
        if (/^\d+$/.test(value)) {
          dl.area.add(String(Number(value)));
          dl.count += 1;
        }
        break;
      default:
        break;
    }
  }
  return dl;
}

const SCALE = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

function cents(numberText, suffix) {
  const n = Number(numberText.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const scale = suffix ? SCALE[suffix.toLowerCase()] ?? 1 : 1;
  return String(Math.round(n * scale * 100));
}

function matchPhrases(tokens, map, hits, line, cat) {
  for (let i = 0; i < tokens.length; i += 1) {
    const candidates = map.get(tokens[i].key);
    if (!candidates) continue;
    for (const cand of candidates) {
      if (i + cand.length > tokens.length) continue;
      let ok = true;
      for (let j = 1; j < cand.length; j += 1) {
        if (tokens[i + j].key !== cand[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const start = tokens[i].index;
        const last = tokens[i + cand.length - 1];
        hits.push({ line, col: start + 1, cat, len: last.index + last.text.length - start });
      }
    }
  }
}

function lineTokens(lineText, caseSensitive) {
  const out = [];
  for (const m of lineText.matchAll(WORD)) {
    const text = m[0].replace(/^'+|'+$/g, "");
    if (!text) continue;
    const lead = m[0].indexOf(text);
    out.push({ text, index: m.index + lead, key: caseSensitive ? text : text.toLowerCase() });
  }
  return out;
}

function domainHit(host, domains) {
  const parts = host.toLowerCase().split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (domains.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export function scanText(text, dl) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, idx) => {
    const line = idx + 1;
    if (!lineText) return;
    const add = (index, len, cat) => hits.push({ line, col: index + 1, cat, len });

    if (dl.phrases.size > 0) matchPhrases(lineTokens(lineText, false), dl.phrases, hits, line, "phrase");
    if (dl.phrasesCs.size > 0) matchPhrases(lineTokens(lineText, true), dl.phrasesCs, hits, line, "phrase-cs");

    if (dl.ids.size > 0) {
      for (const m of lineText.matchAll(/[A-Za-z0-9]{15,18}/g)) {
        if (dl.ids.has(m[0])) add(m.index, m[0].length, "id");
      }
    }

    for (const m of lineText.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
      if (dl.emails.has(m[0].toLowerCase())) add(m.index, m[0].length, "email");
      else if (domainHit(m[1], dl.domains)) add(m.index, m[0].length, "domain");
    }
    if (dl.domains.size > 0) {
      for (const m of lineText.matchAll(/(?<![@A-Za-z0-9.-])((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})(?![A-Za-z0-9-])/g)) {
        if (domainHit(m[1], dl.domains)) add(m.index, m[1].length, "domain");
      }
    }

    if (dl.phones.size > 0) {
      for (const m of lineText.matchAll(/(?<![\d])(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?![\d])/g)) {
        if (dl.phones.has(`${m[1]}${m[2]}${m[3]}`)) add(m.index, m[0].length, "phone");
      }
    }

    if (dl.money.size > 0) {
      for (const m of lineText.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(thousand|million|billion|mm|bn|k|m|b)?(?![A-Za-z])/gi)) {
        const c = cents(m[1], m[2]);
        if (c && dl.money.has(c)) add(m.index, m[0].length, "money");
      }
    }
    if (dl.money.size > 0 || dl.area.size > 0) {
      // bare comma-grouped numbers (10,000 and up) may be dollar or square-foot figures
      for (const m of lineText.matchAll(/(?<![\d.,$])(\d{1,3}(?:,\d{3})+)(?![\d,])/g)) {
        const whole = m[1].replace(/,/g, "");
        if (dl.money.has(`${whole}00`)) add(m.index, m[0].length, "money");
        else if (dl.area.has(String(Number(whole)))) add(m.index, m[0].length, "area");
      }
    }
    if (dl.pct.size > 0) {
      for (const m of lineText.matchAll(/(\d+\.\d+)\s?%/g)) {
        const v = normalizeDecimal(m[1]);
        if (v && dl.pct.has(v)) add(m.index, m[0].length, "pct");
      }
    }
    if (dl.area.size > 0) {
      for (const m of lineText.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,})\s?(?:sf|rsf|nrsf|sq\.?\s?ft\.?|square\s+feet)(?![A-Za-z])/gi)) {
        const v = String(Number(m[1].replace(/,/g, "")));
        if (dl.area.has(v)) add(m.index, m[0].length, "area");
      }
    }
    if (dl.acres.size > 0) {
      for (const m of lineText.matchAll(/(\d+\.\d+)\s?(?:ac|acres?)(?![A-Za-z])/gi)) {
        const v = normalizeDecimal(m[1]);
        if (v && dl.acres.has(v)) add(m.index, m[0].length, "acres");
      }
    }
  });
  // one report per location and category
  const seen = new Set();
  return hits.filter((h) => {
      const key = `${h.line}:${h.col}:${h.cat}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Renders a denylist entry back into natural text, for the self-test only.
export function render(cat, value) {
  switch (cat) {
    case "money": {
      const dollars = Number(value) / 100;
      return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: dollars % 1 ? 2 : 0 })}`;
    }
    case "pct":
      return `${value}%`;
    case "area":
      return `${Number(value).toLocaleString("en-US")} SF`;
    case "acres":
      return `${value} AC`;
    case "phone":
      return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
    case "domain":
      return `someone@${value}`;
    default:
      return value;
  }
}
