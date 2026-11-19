import { FINDING_OWNERS, FINDING_STATUSES, SEVERITIES } from "../schemas/firm";

// Parsers for the files the engine writes, so a page can draw them as designed
// documents instead of printing the raw text. Each parser mirrors its writer:
//   findings.md and sheet-<owner>.md: findingsFile() and ownerSheet() in lib/engine/audit.ts
//   calendar.ics: toIcs() in lib/engine/ics.ts
// Pure: no fs, no Date. Each one throws an error that names the line it could
// not read, so a change in the engine's format fails a test instead of drawing
// garbage.

export type Severity = (typeof SEVERITIES)[number];
export type FindingOwner = (typeof FINDING_OWNERS)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];

// What the report prints for a check: "not checked yet" is read as "not-checked".
export type ParsedCheckOutcome = "clear" | "finding" | "unverified" | "not-applicable" | "not-checked";

export type ParsedLink = { title: string; url: string };

export type ParsedScore = {
  line: string;
  clear: number;
  // Checks recorded as a finding (one check can hold more than one finding).
  findings: number;
  unverified: number;
  notChecked: number;
  notApplicable: number;
  // The checks the score is out of: every check that applies, less not-applicable.
  total: number;
};

export type ParsedFindingRow = {
  id: string;
  severity: Severity;
  what: string;
  owner: FindingOwner;
  due: string | null;
  status: FindingStatus;
};

export type ParsedCheck = {
  n: number;
  title: string;
  id: string;
  outcome: ParsedCheckOutcome;
  date: string | null;
  by: string | null;
  evidence: string | null;
  note: string | null;
  // The check's rule cards and sources that have a link, in the order printed.
  sources: ParsedLink[];
  // Rule cards the writer printed without a link ("rule card <id>"): their ids.
  ruleCards: string[];
};

export type ParsedFindings = {
  title: string;
  auditId: string;
  // Set when the audit is of one subject (a deal or an offering) of the firm.
  subject: string | null;
  firm: string;
  opened: string;
  // "still open", or "closed YYYY-MM-DD", as of when the file was written.
  stateNote: string;
  closed: string | null;
  written: string;
  score: ParsedScore;
  findings: ParsedFindingRow[];
  checks: ParsedCheck[];
  footer: string;
};

export type ParsedSheetFinding = {
  id: string;
  title: string;
  severity: Severity;
  // "What was found": the finding's detail, or its title when it has none.
  found: string;
  check: { id: string; title: string | null };
  due: string | null;
  sources: ParsedLink[];
  ruleCards: string[];
};

export type ParsedSheet = {
  owner: FindingOwner;
  auditId: string;
  playbookTitle: string;
  firm: string;
  written: string;
  findings: ParsedSheetFinding[];
  footer: string;
};

export type CalendarEvent = {
  uid: string | null;
  summary: string;
  date: string;
  description: string | null;
};

// ---- Shared ----

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

// A cursor over the lines of a markdown file, so every error names its line.
class Lines {
  private readonly lines: string[];
  i = 0;
  constructor(
    private readonly file: string,
    text: string,
  ) {
    const normalized = text.replace(/\r\n/g, "\n");
    if (!normalized.endsWith("\n")) throw new Error(`${file}: the file does not end with a newline, so it may be cut short.`);
    this.lines = normalized.slice(0, -1).split("\n");
  }
  get done(): boolean {
    return this.i >= this.lines.length;
  }
  peek(offset = 0): string | undefined {
    return this.lines[this.i + offset];
  }
  fail(expected: string, at = this.i): never {
    const line = this.lines[at];
    throw new Error(`${this.file} line ${at + 1}: expected ${expected}, but read ${line === undefined ? "the end of the file" : JSON.stringify(line)}.`);
  }
  next(expected: string): string {
    const line = this.lines[this.i];
    if (line === undefined) this.fail(expected);
    this.i += 1;
    return line;
  }
  match(re: RegExp, expected: string): RegExpExecArray {
    const m = re.exec(this.peek() ?? "");
    if (!m || this.done) this.fail(expected);
    this.i += 1;
    return m;
  }
  exact(text: string): void {
    if (this.peek() !== text) this.fail(text === "" ? "a blank line" : JSON.stringify(text));
    this.i += 1;
  }
}

// One markdown link, or a rule card printed without one. A URL may hold one
// level of balanced parentheses.
const LINK = /^\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/;
const RULE_CARD = /^rule card (\S+)/;

type Links = { sources: ParsedLink[]; ruleCards: string[] };

function readLink(text: string, links: Links): string | null {
  const link = LINK.exec(text);
  if (link) {
    links.sources.push({ title: link[1] ?? "", url: link[2] ?? "" });
    return text.slice(link[0].length);
  }
  const card = RULE_CARD.exec(text);
  if (card) {
    links.ruleCards.push(card[1] ?? "");
    return text.slice(card[0].length);
  }
  return null;
}

// "[a](u) · [b](v) · rule card x", as linksFor() joins them in the findings file.
function readLinkList(text: string, lines: Lines, at: number): Links {
  const links: Links = { sources: [], ruleCards: [] };
  let rest = text;
  for (;;) {
    const after = readLink(rest, links);
    if (after === null) lines.fail('a list of "[title](url)" links joined by " · "', at);
    if (after === "") return links;
    if (!after.startsWith(" · ")) lines.fail('a list of "[title](url)" links joined by " · "', at);
    rest = after.slice(3);
  }
}

// ---- findings.md ----

const AUDIT_LINE = /^Audit (\S+) of (?:subject (\S+) of )?(.+)\. Opened (\d{4}-\d{2}-\d{2}); (still open|closed (\d{4}-\d{2}-\d{2}))\. Written (\d{4}-\d{2}-\d{2})\.$/;
const CHECK_LINE = /^(\d+)\. \*\*(.+)\*\* \(`([^`]+)`\): (.+)$/;
const RECORDED = /^(clear|finding|unverified|not-applicable)(?:, (\d{4}-\d{2}-\d{2}), by (.+))?$/;
const TABLE_HEAD = "| id | severity | what | who fixes it | due | status |";
const TABLE_RULE = "|---|---|---|---|---|---|";

// The score line, as scoreOf() joins it: "7 of 11 checks clear · 3 findings · 1 unverified".
function readScoreLine(line: string, lines: Lines, at: number): Omit<ParsedScore, "line" | "notApplicable"> {
  const parts = line.split(" · ");
  const head = /^(\d+) of (\d+) (checks?) clear$/.exec(parts[0] ?? "");
  if (!head) lines.fail('a score line that starts "<n> of <n> checks clear"', at);
  const total = Number(head[2]);
  if ((total === 1) !== (head[3] === "check")) lines.fail(`"${total} ${total === 1 ? "check" : "checks"}" in the score line`, at);
  const out = { clear: Number(head[1]), findings: 0, unverified: 0, notChecked: 0, total };
  let order = 0;
  for (const part of parts.slice(1)) {
    const finding = /^(\d+) (findings?)$/.exec(part);
    const unverified = /^(\d+) unverified$/.exec(part);
    const unchecked = /^(\d+) not checked yet$/.exec(part);
    const [n, rank] = finding ? [Number(finding[1]), 1] : unverified ? [Number(unverified[1]), 2] : unchecked ? [Number(unchecked[1]), 3] : [NaN, 0];
    // Each part appears once, in the writer's order, and only when it is not zero.
    if (!(n > 0) || rank <= order) lines.fail('a score line whose parts are "<n> findings", "<n> unverified" and "<n> not checked yet", in that order', at);
    if (finding && (n === 1) !== (finding[2] === "finding")) lines.fail(`"${n} ${n === 1 ? "finding" : "findings"}" in the score line`, at);
    order = rank;
    if (finding) out.findings = n;
    else if (unverified) out.unverified = n;
    else out.notChecked = n;
  }
  return out;
}

function readFindingRow(lines: Lines): ParsedFindingRow {
  const at = lines.i;
  const row = lines.next("a row of the findings table");
  if (!row.startsWith("| ") || !row.endsWith(" |")) lines.fail("a row of the findings table", at);
  // cell() escapes a pipe inside a cell as "\|", so " | " only ever separates cells.
  const cells = row.slice(2, -2).split(" | ").map((c) => c.replace(/\\\|/g, "|"));
  if (cells.length !== 6) lines.fail("a findings table row with 6 cells", at);
  const [id = "", severity = "", what = "", owner = "", due = "", status = ""] = cells;
  if (!/^f-\d+$/.test(id)) lines.fail('a finding id such as "f-1" in the first cell', at);
  if (!oneOf(SEVERITIES, severity)) lines.fail(`a severity (${SEVERITIES.join(", ")})`, at);
  if (!oneOf(FINDING_OWNERS, owner)) lines.fail(`an owner (${FINDING_OWNERS.join(", ")})`, at);
  if (due !== "not set" && !ISO.test(due)) lines.fail('a due date (YYYY-MM-DD or "not set")', at);
  if (!oneOf(FINDING_STATUSES, status)) lines.fail(`a status (${FINDING_STATUSES.join(", ")})`, at);
  return { id, severity, what, owner, due: due === "not set" ? null : due, status };
}

function readCheck(lines: Lines, n: number): ParsedCheck {
  const at = lines.i;
  const head = lines.match(CHECK_LINE, `check ${n}: "${n}. **<title>** (\`<id>\`): <outcome>"`);
  if (Number(head[1]) !== n) lines.fail(`check number ${n}`, at);
  const said = head[4] ?? "";
  let outcome: ParsedCheckOutcome;
  let date: string | null = null;
  let by: string | null = null;
  if (said === "not checked yet") outcome = "not-checked";
  else {
    const rec = RECORDED.exec(said);
    if (!rec) lines.fail('an outcome: "not checked yet", or clear, finding, unverified or not-applicable followed by ", <date>, by <who>"', at);
    outcome = rec[1] as ParsedCheckOutcome;
    // Every recorded outcome carries its date and who recorded it.
    if (!rec[2]) lines.fail(`", <date>, by <who>" after "${outcome}"`, at);
    date = rec[2];
    by = rec[3] ?? null;
  }
  const check: ParsedCheck = { n, title: head[2] ?? "", id: head[3] ?? "", outcome, date, by, evidence: null, note: null, sources: [], ruleCards: [] };
  // Evidence and a note may run over several lines: the writer prints them as given.
  let last: "evidence" | "note" | null = null;
  for (;;) {
    const lineAt = lines.i;
    const line = lines.next(`"   Sources: ..." for check ${n}`);
    if (line.startsWith("   Sources: ")) {
      const rest = line.slice("   Sources: ".length);
      if (rest !== "none listed for this check") Object.assign(check, readLinkList(rest, lines, lineAt));
      return check;
    }
    if (line.startsWith("   Evidence: ") && check.evidence === null && check.note === null && outcome !== "not-checked") {
      check.evidence = line.slice("   Evidence: ".length);
      last = "evidence";
    } else if (line.startsWith("   Note: ") && check.note === null && outcome !== "not-checked") {
      check.note = line.slice("   Note: ".length);
      last = "note";
    } else if (last !== null && line !== "" && !CHECK_LINE.test(line)) {
      check[last] = `${check[last] ?? ""}\n${line}`;
    } else lines.fail(`"   Evidence: ...", "   Note: ..." or "   Sources: ..." for check ${n}`, lineAt);
  }
}

export function parseFindings(text: string): ParsedFindings {
  // Typed explicitly so a call to lines.fail() (never returns) narrows the code after it.
  const lines: Lines = new Lines("findings.md", text);
  const title = lines.match(/^# (.+)$/, '"# <audit playbook title>"')[1] ?? "";
  lines.exact("");
  const audit = lines.match(AUDIT_LINE, '"Audit <id> of <firm>. Opened <date>; still open|closed <date>. Written <date>."');
  lines.exact("");
  const scoreAt = lines.i;
  const scoreLine = lines.match(/^\*\*Score:\*\* (.+)$/, '"**Score:** <score line>"')[1] ?? "";
  lines.exact("");
  lines.exact("## Findings");
  lines.exact("");
  const findings: ParsedFindingRow[] = [];
  if (lines.peek() === "No findings.") lines.exact("No findings.");
  else {
    lines.exact(TABLE_HEAD);
    lines.exact(TABLE_RULE);
    do findings.push(readFindingRow(lines));
    while (lines.peek() !== "" && !lines.done);
  }
  lines.exact("");
  lines.exact("## Checks");
  lines.exact("");
  const checks: ParsedCheck[] = [];
  do checks.push(readCheck(lines, checks.length + 1));
  while (lines.peek() !== "" && !lines.done);
  lines.exact("");
  const footer = lines.next("the footer line");
  if (footer.trim() === "") lines.fail("the footer line", lines.i - 1);
  if (!lines.done) lines.fail("the end of the file after the footer");

  const count = (o: ParsedCheckOutcome) => checks.filter((c) => c.outcome === o).length;
  const notApplicable = count("not-applicable");
  const counted = { clear: count("clear"), findings: count("finding"), unverified: count("unverified"), notChecked: count("not-checked"), total: checks.length - notApplicable };
  const printed = readScoreLine(scoreLine, lines, scoreAt);
  for (const key of ["clear", "findings", "unverified", "notChecked", "total"] as const) {
    if (printed[key] !== counted[key]) {
      lines.fail(`a score that agrees with the checks below it (${key}: the checks give ${counted[key]}, the score line says ${printed[key]})`, scoreAt);
    }
  }
  return {
    title,
    auditId: audit[1] ?? "",
    subject: audit[2] ?? null,
    firm: audit[3] ?? "",
    opened: audit[4] ?? "",
    stateNote: audit[5] ?? "",
    closed: audit[6] ?? null,
    written: audit[7] ?? "",
    score: { line: scoreLine, ...counted, notApplicable },
    findings,
    checks,
    footer,
  };
}

// ---- sheet-<owner>.md ----

const SHEET_LINE = /^From audit (\S+) \((.+)\) of (.+), written (\d{4}-\d{2}-\d{2})\. (\d+) (finding is|findings are) yours to fix\.$/;
const SHEET_FINDING = new RegExp(`^## (f-\\d+): (.+) \\((${SEVERITIES.join("|")})\\)$`);

function readSheetFinding(lines: Lines): ParsedSheetFinding {
  const head = lines.match(SHEET_FINDING, '"## <id>: <title> (<severity>)"');
  lines.exact("");
  const foundAt = lines.i;
  const first = lines.next('"What was found: ..."');
  if (!first.startsWith("What was found: ")) lines.fail('"What was found: ..."', foundAt);
  // The detail is printed as given and may run over several lines.
  const found = [first.slice("What was found: ".length)];
  while (!(lines.peek() === "" && lines.peek(1)?.startsWith("From the check: "))) found.push(lines.next('a blank line, then "From the check: ..."'));
  lines.exact("");
  const fromAt = lines.i;
  const from = lines.next('"From the check: ..."').slice("From the check: ".length);
  const named = /^(.+) \(`([^`]+)`\)$/.exec(from);
  if (!named && !/^\S+$/.test(from)) lines.fail('"From the check: <title> (`<id>`)" or "From the check: <id>"', fromAt);
  lines.exact("");
  const links: Links = { sources: [], ruleCards: [] };
  if (lines.peek() === "Rules and sources behind it: none listed for this check.") lines.exact("Rules and sources behind it: none listed for this check.");
  else {
    lines.exact("Rules and sources behind it:");
    do {
      const at = lines.i;
      const line = lines.next('"- <link>"');
      if (!line.startsWith("- ") || readLink(line.slice(2), links) !== "") lines.fail('"- [title](url)" or "- rule card <id>"', at);
    } while (lines.peek() !== "" && !lines.done);
  }
  lines.exact("");
  const due = lines.match(/^Due: (no date set|\d{4}-\d{2}-\d{2})$/, '"Due: <YYYY-MM-DD>" or "Due: no date set"')[1] ?? "";
  return {
    id: head[1] ?? "",
    title: head[2] ?? "",
    severity: head[3] as Severity,
    found: found.join("\n"),
    check: named ? { id: named[2] ?? "", title: named[1] ?? null } : { id: from, title: null },
    due: due === "no date set" ? null : due,
    ...links,
  };
}

export function parseSheet(text: string): ParsedSheet {
  const lines: Lines = new Lines("sheet", text);
  const ownerAt = lines.i;
  const owner = lines.match(/^# Open findings for the (\S+)$/, '"# Open findings for the <owner>"')[1] ?? "";
  if (!oneOf(FINDING_OWNERS, owner)) lines.fail(`an owner (${FINDING_OWNERS.join(", ")})`, ownerAt);
  lines.exact("");
  const headAt = lines.i;
  const head = lines.match(SHEET_LINE, '"From audit <id> (<playbook>) of <firm>, written <date>. <n> finding(s) is/are yours to fix."');
  const count = Number(head[5]);
  if ((count === 1) !== (head[6] === "finding is")) lines.fail(`"${count} ${count === 1 ? "finding is" : "findings are"}"`, headAt);
  const findings: ParsedSheetFinding[] = [];
  while (lines.peek() === "" && lines.peek(1)?.startsWith("## ")) {
    lines.exact("");
    findings.push(readSheetFinding(lines));
  }
  if (findings.length !== count) lines.fail(`${count} finding(s), as the line at the top says, but the sheet holds ${findings.length}`, headAt);
  lines.exact("");
  const footer = lines.next("the footer line");
  if (footer.trim() === "") lines.fail("the footer line", lines.i - 1);
  if (!lines.done) lines.fail("the end of the file after the footer");
  return { owner, auditId: head[1] ?? "", playbookTitle: head[2] ?? "", firm: head[3] ?? "", written: head[4] ?? "", findings, footer };
}

// ---- calendar.ics ----

type Content = { at: number; name: string; params: Record<string, string>; value: string };

// Splits "NAME;PARAM=x;PARAM="y:z":value" at the first colon outside quotes.
function readContentLine(line: string, at: number): Content {
  const fail = (): never => {
    throw new Error(`calendar line ${at}: expected "NAME[;PARAM=VALUE]:value", but read ${JSON.stringify(line)}.`);
  };
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) fail();
  const [name = "", ...rawParams] = line.slice(0, colon).split(";");
  if (!/^[A-Za-z0-9-]+$/.test(name)) fail();
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq < 1) fail();
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, "$1");
  }
  return { at, name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

// TEXT values (RFC 5545 3.3.11): \\ \; \, and \n or \N; any other escape is an error.
function unescapeText(value: string, at: number): string {
  return value.replace(/\\(.)?/g, (whole, ch: string | undefined) => {
    if (ch === "\\" || ch === ";" || ch === ",") return ch;
    if (ch === "n" || ch === "N") return "\n";
    throw new Error(`calendar line ${at}: "${whole}" is not a text escape this parser reads (\\\\, \\;, \\, or \\n).`);
  });
}

function readEvent(props: Content[], beginAt: number): CalendarEvent {
  const one = (name: string): Content | null => {
    const found = props.filter((p) => p.name === name);
    if (found.length > 1) throw new Error(`calendar line ${found[1]?.at ?? beginAt}: a second ${name} in the event that begins on line ${beginAt}.`);
    return found[0] ?? null;
  };
  const start = one("DTSTART");
  const summary = one("SUMMARY");
  if (!start) throw new Error(`calendar line ${beginAt}: the event that begins here has no DTSTART.`);
  if (!summary) throw new Error(`calendar line ${beginAt}: the event that begins here has no SUMMARY.`);
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(start.value);
  if (start.params.VALUE !== "DATE" || !day) {
    throw new Error(`calendar line ${start.at}: expected an all-day date ("DTSTART;VALUE=DATE:YYYYMMDD"), but read DTSTART with ${JSON.stringify(start.value)}.`);
  }
  const description = one("DESCRIPTION");
  const uid = one("UID");
  return {
    uid: uid ? uid.value : null,
    summary: unescapeText(summary.value, summary.at),
    date: `${day[1]}-${day[2]}-${day[3]}`,
    description: description ? unescapeText(description.value, description.at) : null,
  };
}

// The VEVENT blocks of a calendar file, in file order. With excerpt, the text
// may be the first lines of a calendar file (the recorded demo keeps 30): the
// closing END:VCALENDAR may be missing, and an event cut off before its
// END:VEVENT is left out rather than drawn half-read.
export function parseCalendar(text: string, options: { excerpt?: boolean } = {}): CalendarEvent[] {
  const raw = text.split(/\r\n|\n|\r/);
  if (raw.at(-1) === "") raw.pop();
  // Unfold (RFC 5545 3.1): a line that starts with a space or a tab continues
  // the one before it, less that first character.
  const logical: { at: number; text: string }[] = [];
  raw.forEach((line, i) => {
    const prev = logical.at(-1);
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (!prev) throw new Error(`calendar line ${i + 1}: a folded continuation with no line before it: ${JSON.stringify(line)}.`);
      prev.text += line.slice(1);
    } else logical.push({ at: i + 1, text: line });
  });
  const first = logical[0];
  if (!first || first.text !== "BEGIN:VCALENDAR") {
    throw new Error(`calendar line 1: expected "BEGIN:VCALENDAR", but read ${first ? JSON.stringify(first.text) : "an empty file"}.`);
  }
  const events: CalendarEvent[] = [];
  let event: { beginAt: number; props: Content[] } | null = null;
  let ended = false;
  for (const { at, text: line } of logical.slice(1)) {
    if (ended) throw new Error(`calendar line ${at}: expected nothing after "END:VCALENDAR", but read ${JSON.stringify(line)}.`);
    const c = readContentLine(line, at);
    if (c.name === "BEGIN") {
      if (c.value !== "VEVENT" || event) throw new Error(`calendar line ${at}: expected ${event ? '"END:VEVENT"' : 'a calendar property or "BEGIN:VEVENT"'}, but read ${JSON.stringify(line)}.`);
      event = { beginAt: at, props: [] };
    } else if (c.name === "END") {
      if (c.value === "VEVENT" && event) {
        events.push(readEvent(event.props, event.beginAt));
        event = null;
      } else if (c.value === "VCALENDAR" && !event) ended = true;
      else throw new Error(`calendar line ${at}: expected ${event ? '"END:VEVENT"' : '"END:VCALENDAR"'}, but read ${JSON.stringify(line)}.`);
    } else if (event) event.props.push(c);
  }
  if (!ended && !options.excerpt) {
    const last = logical.at(-1)?.at ?? 1;
    throw new Error(`calendar line ${last}: expected ${event ? `"END:VEVENT" for the event that begins on line ${event.beginAt}` : '"END:VCALENDAR"'}, but the file ends here.`);
  }
  return events;
}
