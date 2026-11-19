// Builds the local leak-check denylist from a private knowledge base.
//   node tools/leakcheck/generate.mjs [--sources <config.json>] [--out <denylist.txt>]
//
// The config and the output stay outside the repo (see paths.mjs). This script is
// generic: every folder name, field name and term comes from the config or the
// source files. It prints counts per category, never a term.
import fs from "node:fs";
import path from "node:path";
import { DENYLIST, SOURCES } from "./paths.mjs";
import { normalizeDecimal, phraseTokens } from "./lib.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const SOURCES_PATH = opt("--sources", SOURCES);
const OUT_PATH = opt("--out", DENYLIST);

// Everyday English plus generic real estate, legal and place vocabulary. A term
// made only of these words is too common to match case-insensitively.
const COMMON = new Set(
  `a about above across act add after again against age ago agree air all allow almost alone along already also
although always am among amount an and another answer any anyone anything appear apply approach area arm around
arrive art as ask at available away back bad bag ball bank bar base be beat because become bed before begin behind
believe benefit best better between beyond big bill billion bit black blood blue board body book born both box boy
break bring brother brown budget build building business but buy by call campaign can capital car card care career
carry case catch cause cell center central century certain chair challenge chance change charge chase check child
choice choose church city civil claim class clear close cold collection college color come commercial common
community company compare computer concern condition consider consumer contain continue control cost could country
county couple course court cover create crime culture cup current customer cut dark data daughter day dead deal
death decade decide decision deep defense degree describe design despite detail determine develop development die
difference different difficult direction director discover discuss do doctor dog door down draw dream drive drop
during each early east easy eat economic economy edge education effect effort eight either else employee end
energy enjoy enough enter entire environment especially establish even evening event ever every evidence exactly
example executive exist expect experience expert explain eye face fact factor fail fall family far fast father fear
federal feel few field fight figure fill final finally financial find fine finish fire firm first fish five floor
fly focus follow food foot for force foreign forget form former forward four free friend from front full fund
future game garden gas general get girl give glass go goal good government grant great green ground group grow
growth guess hair half hand hang happen happy hard have he head health hear heart heat heavy help her here high
him his history hit hold home hope hospital hot hotel hour house how however huge human hundred hunter husband idea
identify if image impact important improve in include increase indeed individual industry information inside
instead interest international into investment involve issue it item its job join just keep key kid kind kitchen
know knowledge land language large last late later law lawyer lay lead leader learn least leave left leg legal
less let letter level life light like likely line list listen little live local long look lose loss lot love low
machine main maintain major make man manage management manager many mark market material matter may maybe me mean
measure media medical meet meeting member memory message method middle might million mind minute miss mission model
modern moment money month more morning most mother move movement much music must my name nation national natural
nature near need network never new news next nice night nine no none nor north not note nothing notice now number
of off offer office officer official often oil old on once one only open operation opportunity option or order
organization other our out outside over own owner page paper parent part partner party pass past pattern pay peace
people per perform period person personal phone pick picture piece place plan plant play player point police policy
poor popular position positive possible power practice prepare present president pressure pretty prevent price
private probably problem process produce product production professional program project property protect provide
public pull purpose push put quality question quite race radio raise range rate rather reach read ready real
reality really reason receive recent record red reduce region relate remain remember remove report represent
require research resource respond response rest result return reveal rich right rise risk road rock role room rose
rule run safe same save say scene school science score sea season seat second section security see seek seem sell
send senior sense series serious serve service set seven several share she short should show side sign similar
simple since single sister sit site situation six size skill small smith so social society some someone something
son song soon sort sound source south space speak special specific spend sport spring staff stage stand standard
star start state statement station stay step still stock stone stop store story strategy street strong structure
student study style subject success such summer support sure surface system table take talk task tax teach team
technology tell ten term test than thank that the their them then there these they thing think third this those
though thousand three through time to today together too top total town trade training travel tree trial trip true
trust try turn two type under understand unit until up upon us use value very view visit voice vote wait walk wall
want war watch water way we wear week weight well west what when where whether which while white who whole why wide
wife will win wind window wish with within without woman wood word work worker world would write wrong yard year
yes yet you young your
acquisition acquisitions advisor advisors affiliates agency agreement amendment apartment apartments appraisal asset
assets assignment avenue bay bldg blvd boulevard broker brokerage buyer buyers capital cap cash circle closing co
commission construction contract corp corporate corporation court cre crossing dealer deed depot diligence dist
distribution dock dr equity escrow est estate estates exchange expressway facility farms finance flex freeway fwy
funds gateway global grp holding holdings hwy highway hub inc income industrial industries invest investments
investor investors landlord lane lease leasing lender lending limited llc llp ln loop lp ltd manufacturing
mezzanine mortgage multifamily net offering operating park parkway partners partnership pkwy place plaza pl portfolio
port properties rd realty regional rent rental resources retail ridge sales services seller sellers shopping
solutions square st storage suite supply systems tenant tenants terminal title tower trading trustee valley ventures
village warehouse way wholesale yards
texas houston dallas austin san antonio fort worth paso arlington plano irving laredo lubbock garland frisco
mckinney katy sugar pasadena pearland conroe humble tomball cypress baytown league braunfels round waco tyler
beaumont corpus christi midland odessa amarillo brownsville mcallen killeen nashville atlanta tennessee georgia
florida california oklahoma louisiana delaware america american northeast northwest southeast southwest downtown
january february march april june july august september october november december
monday tuesday wednesday thursday friday saturday sunday
unknown unnamed none various individual individuals private pending tbd tba n/a na self personal misc
miscellaneous other others confidential undisclosed anonymous sample example test`
    .split(/\s+/)
    .filter(Boolean),
);

const STREET_SUFFIX =
  "St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Pkwy|Parkway|Hwy|Highway|Fwy|Freeway|Ct|Court|Cir|Circle|Way|Pl|Place|Trl|Trail|Loop|Pike|Expy|Expressway|Plz|Plaza|Sq|Square|Ter|Terrace";
const ADDRESS = new RegExp(
  `\\b(\\d{2,6})\\s+((?:[NSEW]{1,2}\\.?\\s+)?(?:[A-Za-z0-9'\\-]+\\.?\\s+){0,4}?)(?:${STREET_SUFFIX})\\b\\.?(?:\\s+(\\d{1,4}))?`,
  "g",
);
const LEGAL = /\b((?:[A-Z][\w&'.-]*,?\s+){0,6}?[A-Z][\w&'.-]*),?\s+(?:LLC|L\.L\.C\.|LP|L\.P\.|LLP|Inc\.?|Ltd\.?|Trust)\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE = /(?<!\d)(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g;
const RECORD_ID = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const FREE_MAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "me.com", "live.com",
  "msn.com", "comcast.net", "att.net", "sbcglobal.net", "protonmail.com", "proton.me", "mac.com",
]);
const LEGAL_SUFFIX = /\s*,?\s*(llc|l\s*l\s*c|lp|l\s*p|llp|inc|ltd|trust|co|corp|corporation|company)\.?$/i;

const out = {
  phrase: new Set(),
  "phrase-cs": new Set(),
  id: new Set(),
  email: new Set(),
  domain: new Set(),
  phone: new Set(),
  money: new Set(),
  pct: new Set(),
  area: new Set(),
  acres: new Set(),
};

let allow = new Set();

function distinctive(token) {
  return token.length >= 3 && !COMMON.has(token.toLowerCase()) && !/^\d+$/.test(token);
}

// role: person | org | text | address
function addPhrase(raw, role) {
  if (!raw) return;
  const text = String(raw).replace(LEGAL_SUFFIX, "").trim();
  const cs = phraseTokens(text, true);
  const ci = cs.map((t) => t.toLowerCase());
  if (ci.length === 0) return;
  const key = ci.join(" ");
  if (allow.has(key) || key.length < 4) return;
  const hasDistinct = cs.some(distinctive);
  if (ci.length === 1) {
    // a lone word is matched by exact case to avoid hitting everyday prose
    if ((role === "org" || role === "text") && hasDistinct && cs[0].length >= 5) out["phrase-cs"].add(cs.join(" "));
    return;
  }
  if (hasDistinct) out.phrase.add(key);
  else if ((role === "person" || role === "org") && cs.join(" ").length >= 6) out["phrase-cs"].add(cs.join(" "));
}

function addAddresses(text) {
  let found = false;
  for (const m of String(text).matchAll(ADDRESS)) {
    const words = phraseTokens(m[2]).filter((w) => !/^(n|s|e|w|ne|nw|se|sw)$/.test(w));
    if (words.length === 0) continue;
    const core = [m[1], ...words];
    if (m[1].length >= 3 || words.some(distinctive)) {
      out.phrase.add(core.join(" "));
      found = true;
    }
  }
  return found;
}

function addContacts(text) {
  for (const m of String(text).matchAll(EMAIL)) {
    const email = m[0].toLowerCase().replace(/\.$/, "");
    out.email.add(email);
    const domain = email.split("@")[1];
    if (domain && !FREE_MAIL.has(domain) && !/\.(gov|mil|edu|us)$/.test(domain) && !allow.has(domain)) {
      out.domain.add(domain);
    }
  }
  for (const m of String(text).matchAll(PHONE)) out.phone.add(`${m[1]}${m[2]}${m[3]}`);
}

function addEntities(text) {
  for (const m of String(text).matchAll(LEGAL)) {
    const tokens = phraseTokens(m[1], true);
    if (tokens.length >= 2 && tokens.some(distinctive)) addPhrase(m[1], "org");
  }
}

function addText(value) {
  const text = String(value);
  addContacts(text);
  addAddresses(text);
  addEntities(text);
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(text)) {
    // a slug: its words as one phrase
    addPhrase(text.replace(/-/g, " "), "text");
    return;
  }
  // the leading run of capitalized words, e.g. a counterparty at the start of a deal name
  const lead = [];
  for (const tok of text.split(/\s+/)) {
    if (/^[A-Z][A-Za-z0-9&'.-]*$/.test(tok) || /^&$/.test(tok)) lead.push(tok);
    else break;
  }
  if (lead.length > 0) addPhrase(lead.join(" "), "text");
}

function addByRole(value, role) {
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const s = String(v);
    addContacts(s);
    switch (role) {
      case "person":
        addPhrase(s.replace(/<[^>]*>/g, "").replace(EMAIL, ""), "person");
        break;
      case "org":
        addPhrase(s, "org");
        break;
      case "address":
        if (!addAddresses(s)) addText(s);
        break;
      case "id":
        if (RECORD_ID.test(s.trim())) out.id.add(s.trim());
        break;
      case "email":
      case "phone":
        break;
      default:
        addText(s);
    }
  }
}

// A small YAML-frontmatter reader: scalars, inline lists, block lists, one nested level.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const data = {};
  let current = null;
  for (const line of m[1].split(/\r?\n/)) {
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top) {
      current = top[1];
      const raw = top[2].trim();
      if (raw.startsWith("[") && raw.endsWith("]")) {
        data[current] = raw.slice(1, -1).split(",").map(unquote).filter(Boolean);
      } else data[current] = raw ? unquote(raw) : [];
      continue;
    }
    const item = line.match(/^\s+-\s+(.*)$/) ?? line.match(/^\s+[\w-]+:\s+(.*)$/);
    if (item && current) {
      if (!Array.isArray(data[current])) data[current] = data[current] ? [data[current]] : [];
      data[current].push(unquote(item[1]));
    }
  }
  return data;
}

function unquote(s) {
  return String(s).trim().replace(/^["']|["']$/g, "");
}

function moneyCents(numberText, suffix) {
  const scale = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, billion: 1e9 };
  const n = Number(String(numberText).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * (suffix ? scale[suffix.toLowerCase()] ?? 1 : 1) * 100);
}

function addMoney(cents) {
  if (cents === null) return;
  const dollars = cents / 100;
  let distinct;
  if (dollars >= 1e6) distinct = cents % 10_000_000 !== 0;
  else if (dollars >= 1e4) distinct = cents % 1_000_000 !== 0;
  else if (dollars >= 1e3) distinct = cents % 100_000 !== 0;
  else distinct = ![0, 25, 50, 75].includes(cents % 100);
  if (distinct) out.money.add(String(cents));
}

function addPct(value) {
  const v = normalizeDecimal(value);
  if (v && /\.\d{2,}$/.test(v) && !/[05]$/.test(v)) out.pct.add(v);
}

function addArea(value) {
  const n = Number(String(value).replace(/,/g, ""));
  if (Number.isInteger(n) && n >= 1000 && n % 1000 !== 0) out.area.add(String(n));
}

function addAcres(value) {
  const v = normalizeDecimal(value);
  if (v && /\.\d{2,}$/.test(v)) out.acres.add(v);
}

function addFigures(text) {
  const t = String(text);
  for (const m of t.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(thousand|million|billion|mm|k|m|b)?(?![A-Za-z])/gi)) {
    addMoney(moneyCents(m[1], m[2]));
  }
  for (const m of t.matchAll(/(\d+\.\d+)\s?%/g)) addPct(m[1]);
  for (const m of t.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,})\s?(?:sf|rsf|nrsf|sq\.?\s?ft\.?|square\s+feet)(?![A-Za-z])/gi)) addArea(m[1]);
  for (const m of t.matchAll(/(\d+\.\d+)\s?(?:ac|acres?)(?![A-Za-z])/gi)) addAcres(m[1]);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function addCsv(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return;
  const kinds = header.map((h) => {
    const k = h.toLowerCase();
    if (/acre/.test(k)) return "acres";
    if (/(^|[^a-z])(sf|sq|square|rba|gla|size)([^a-z]|$)/.test(k)) return "area";
    if (/cap|rate|irr|yield|pct|percent|%/.test(k)) return "pct";
    if (/price|amount|cost|value|loan|equity|noi|basis|proceeds|rent|debt/.test(k)) return "money";
    if (/city|state|zip|market|submarket|date|year|type|status/.test(k)) return "skip";
    return "text";
  });
  for (const row of rows) {
    row.forEach((cell, i) => {
      const v = cell.trim();
      if (!v) return;
      const kind = kinds[i] ?? "text";
      const num = Number(v.replace(/[$,%\s]/g, ""));
      if (kind === "money" && Number.isFinite(num)) addMoney(Math.round(num * 100));
      else if (kind === "pct" && Number.isFinite(num)) addPct(num > 0 && num < 1 ? (num * 100).toFixed(4) : num);
      else if (kind === "area" && Number.isFinite(num)) addArea(num);
      else if (kind === "acres" && Number.isFinite(num)) addAcres(num);
      else if (kind === "text") {
        addFigures(v);
        if (!addAddresses(v)) addText(v);
      }
    });
  }
}

function walk(dir, exclude, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exclude, files);
    else if (/\.(md|csv)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

function main() {
  if (!fs.existsSync(SOURCES_PATH)) {
    console.error(`No source config at the configured path. Create it first (see tools/leakcheck/README.md).`);
    return 1;
  }
  const config = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const root = config.root;
  if (!root || !fs.existsSync(root)) {
    console.error("The source config's root folder does not exist.");
    return 1;
  }
  const committedAllow = fs.existsSync(new URL("./allow.txt", import.meta.url))
    ? fs.readFileSync(new URL("./allow.txt", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#"))
    : [];
  allow = new Set([...(config.allowTerms ?? []), ...committedAllow].map((t) => phraseTokens(t).join(" ")));
  for (const t of config.allowTerms ?? []) if (t.includes(".")) allow.add(t.toLowerCase());

  const exclude = new Set(config.exclude ?? [".git", "node_modules"]);
  const fieldMap = config.frontmatter ?? {};
  const confidential = (config.confidential ?? []).map((p) => path.normalize(p));
  const files = walk(root, exclude);
  let scanned = 0;

  for (const file of files) {
    const relPath = path.relative(root, file);
    const isConfidential = confidential.some((c) => relPath === c || relPath.startsWith(c.endsWith(path.sep) ? c : c + path.sep));
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    scanned += 1;
    if (file.toLowerCase().endsWith(".csv")) {
      if (isConfidential) addCsv(text);
      continue;
    }
    const fm = frontmatter(text);
    const folder = relPath.split(path.sep)[0] + "/";
    const roles = fieldMap[folder] ?? {};
    for (const [field, role] of Object.entries(roles)) {
      if (fm[field] !== undefined) addByRole(fm[field], role);
    }
    if (config.bodyScan !== false) {
      addContacts(text);
      addAddresses(text);
      addEntities(text);
    }
    if (isConfidential) addFigures(text);
  }

  for (const t of config.extraTerms ?? []) {
    const tokens = phraseTokens(t);
    if (tokens.length) out.phrase.add(tokens.join(" "));
  }

  const lines = [
    `# Prompted CRE leak-check denylist. Generated ${new Date().toISOString().slice(0, 10)}.`,
    "# Local only: never commit, print, paste or summarize this file.",
  ];
  for (const [cat, set] of Object.entries(out)) {
    for (const value of [...set].sort()) lines.push(`${cat}\t${value}`);
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${lines.join("\n")}\n`, "utf8");

  const counts = Object.entries(out)
    .map(([cat, set]) => `${cat} ${set.size}`)
    .join(", ");
  console.log(`Denylist written outside the repo from ${scanned} source files: ${counts}.`);
  return 0;
}

process.exit(main());
