"use client";

// The calculator form: one bordered block of ruled cells, a label over a value. A dashed
// line under a value is a blank to fill in (the way a drawing leaves one); under the
// pointer and with the caret in it, the blank becomes a field. Each input has one label;
// its unit, hint and error are tied to it with aria-describedby. Arrow keys step a number
// by a sensible amount. A value that does not read is underlined in red and named in a
// sentence under its own cell, never by a stripe down the side, and only once the reader
// has paused (the page decides when: see CalcState).

import { createContext, Fragment, useContext, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { Disclosure } from "@/components/ui/disclosure";
import { Icon, type IconName } from "@/components/ui/icon";
import { isCalendarDate, weekday } from "@/lib/calculators/dates";
import { usd } from "@/lib/calculators/trace";
import { count, parseCash, plainIssue, type FieldKind } from "./format";

type Issue = ZodError["issues"][number];

// What the page tells its form. `shown` is false for the first moments after a value stops
// reading, so a half-typed figure is not called an error while the caret is in it. `fixes`
// counts the inputs that do not read, once that is said: then the result on the page is the
// last one that read, and the form's own state line says so.
export const CalcState = createContext<{ shown: boolean; fixes: number }>({ shown: true, fixes: 0 });

// Spans both columns: always, or only on a phone (under 640 px).
type Span = { wide?: boolean; wideOnPhone?: boolean };
const cell = ({ wide, wideOnPhone }: Span, extra?: string) => cx("calc-cell", wide && "calc-cell--wide", wideOnPhone && "calc-cell--wide-phone", extra);

const ids = (...list: Array<string | false | null | undefined>) => list.filter(Boolean).join(" ") || undefined;

function useIssue(issue: Issue | undefined, kind?: FieldKind): string | null {
  const { shown } = useContext(CalcState);
  return issue && shown ? plainIssue(issue, kind) : null;
}

// The error sentence and the hint under a field.
function Under({ id, err, hint }: { id: string; err: string | null; hint?: string }) {
  return (
    <>
      {err && (
        <p id={`${id}-e`} className="calc-say type-body-s">
          <Icon name="risk" />
          <span>{err}</span>
        </p>
      )}
      {hint && (
        <p id={`${id}-h`} className="calc-hint type-note">
          {hint}
        </p>
      )}
    </>
  );
}

// A click anywhere on the blank puts the caret in it.
function focusInside(e: MouseEvent<HTMLDivElement>) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  e.currentTarget.querySelector<HTMLElement>("input, select")?.focus();
}

// ---------- numbers ----------

function toText(v: number | null, kind: FieldKind): string {
  if (v === null || !Number.isFinite(v)) return "";
  if (kind === "pct") return String(Math.round(v * 1e8) / 1e6);
  if (kind === "money") return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  // a count or a measure groups its thousands (40,000 SF); a year never does
  if (kind === "int" || kind === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 8 });
  return String(v);
}

function fromText(t: string, kind: FieldKind, optional: boolean): number | null {
  const clean = t.replace(/[$,%x\s]/gi, "");
  if (clean === "") return optional ? null : Number.NaN;
  const n = Number(clean);
  if (!Number.isFinite(n)) return Number.NaN;
  return kind === "pct" ? n / 100 : n;
}

const sameValue = (a: number | null, b: number | null) => a === b || (a !== null && b !== null && Number.isNaN(a) && Number.isNaN(b));

const DEFAULT_STEP: Record<FieldKind, number> = { money: 1000, pct: 0.25, number: 0.05, multiple: 0.05, int: 1, year: 1 };

// Empty means null when optional, otherwise NaN, which validation names.
export function NumberField({
  label,
  value,
  onChange,
  kind = "number",
  prefix,
  unit,
  optional = false,
  hint,
  step,
  issue,
  describedBy,
  wide = false,
  wideOnPhone = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  kind?: FieldKind;
  prefix?: string;
  unit?: string;
  optional?: boolean;
  hint?: string;
  // in the units the field shows: 0.25 on a percent field is a quarter point
  step?: number;
  issue?: Issue;
  // the id of a note that covers this field and its like (a group's note), said once for all of them
  describedBy?: string;
  wide?: boolean;
  wideOnPhone?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(() => toText(value, kind));
  // The text is the field's own, so a half-typed "1,0" survives. When the value
  // changes from outside (a reset, another control), the text follows it.
  const [seen, setSeen] = useState(value);
  if (!sameValue(seen, value)) {
    setSeen(value);
    if (!sameValue(fromText(text, kind, optional), value)) setText(toText(value, kind));
  }
  const err = useIssue(issue, kind);
  const by = step ?? DEFAULT_STEP[kind];

  const commit = (t: string) => {
    setText(t);
    onChange(fromText(t, kind, optional));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const cur = fromText(text, kind, true);
    const shown = cur === null || !Number.isFinite(cur) ? 0 : kind === "pct" ? cur * 100 : cur;
    const next = Math.round((shown + (e.key === "ArrowUp" ? by : -by) * (e.shiftKey ? 10 : 1)) * 1e6) / 1e6;
    e.preventDefault();
    const v = kind === "pct" ? next / 100 : next;
    setText(toText(v, kind));
    onChange(v);
  };
  const onBlur = () => {
    const v = fromText(text, kind, optional);
    if (v !== null && Number.isFinite(v)) setText(toText(v, kind));
  };

  return (
    <div className={cell({ wide, wideOnPhone })}>
      <label htmlFor={id} className="tblock-label">
        {label}
        {optional && <span className="sr-only"> (optional)</span>}
      </label>
      {/* A blank left blank reads "optional" alone: its dollar sign and unit come back with the caret. */}
      <div className="calc-entry" data-invalid={err ? "" : undefined} data-blank={optional && text.trim() === "" ? "" : undefined} onClick={focusInside}>
        {prefix && (
          <span id={`${id}-p`} className="calc-affix type-title-s flex-none text-faint">
            {prefix}
          </span>
        )}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={optional ? "optional" : undefined}
          aria-invalid={err ? true : undefined}
          aria-describedby={ids(err && `${id}-e`, prefix && `${id}-p`, unit && `${id}-u`, hint && `${id}-h`, describedBy)}
          onChange={(e) => commit(e.target.value)}
          onKeyDown={onKey}
          onBlur={onBlur}
          className="type-title-s min-w-[1ch] max-w-full tabular-nums [field-sizing:content]"
        />
        {unit && (
          <span id={`${id}-u`} className="calc-affix type-label flex-none text-faint">
            {unit}
          </span>
        )}
      </div>
      <Under id={id} err={err} hint={hint} />
    </div>
  );
}

// A date. The browser draws the field in the reader's own order (06/18/2026); every date the
// page prints is written year first, so the field reads its date back that way, with its
// weekday: the one date is never on the page in two spellings without a line that ties them.
export function DateField({
  label,
  value,
  onChange,
  hint,
  issue,
  describedBy,
  wide = false,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  hint?: string;
  issue?: Issue;
  // the id of a note that covers this field and its like (a group's note), said once for all of them
  describedBy?: string;
  wide?: boolean;
}) {
  const id = useId();
  const err = useIssue(issue);
  const read = value !== null && isCalendarDate(value);
  return (
    <div className={cell({ wide })}>
      <label htmlFor={id} className="tblock-label">
        {label}
      </label>
      <div className="calc-entry" data-invalid={err ? "" : undefined} onClick={focusInside}>
        <input
          id={id}
          type="date"
          value={value ?? ""}
          aria-invalid={err ? true : undefined}
          aria-describedby={ids(err && `${id}-e`, read && `${id}-r`, hint && `${id}-h`, describedBy)}
          onChange={(e) => onChange(e.target.value || null)}
          className="type-title-s tabular-nums"
        />
      </div>
      {read && (
        <p id={`${id}-r`} className="calc-echo type-note">
          <span className="sr-only">Read as </span>
          <span className="whitespace-nowrap tabular-nums text-text">{value}</span>, a {weekday(value)}
        </p>
      )}
      <Under id={id} err={err} hint={hint} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  issue,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  issue?: Issue;
  wide?: boolean;
}) {
  const id = useId();
  const err = useIssue(issue);
  return (
    <div className={cell({ wide })}>
      <label htmlFor={id} className="tblock-label">
        {label}
      </label>
      <div className="calc-entry" data-invalid={err ? "" : undefined} onClick={focusInside}>
        {/* a name longer than its blank ends in an ellipsis until the caret is in it */}
        <input
          id={id}
          value={value}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={err ? true : undefined}
          aria-describedby={ids(err && `${id}-e`, hint && `${id}-h`)}
          onChange={(e) => onChange(e.target.value)}
          className="type-title-s w-full flex-auto text-ellipsis"
        />
      </div>
      <Under id={id} err={err} hint={hint} />
    </div>
  );
}

// A list of yearly cash amounts, typed or pasted as one line (a row copied from a
// spreadsheet works: tabs and line breaks separate years too). Under it, the line is read
// back year by year, so a stray comma shows before it moves the answer.
export function CashField({
  label,
  value,
  onChange,
  hint,
  issue,
  first = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  issue?: Issue;
  // the year the first figure belongs to
  first?: number;
}) {
  const id = useId();
  const err = useIssue(issue);
  const years = parseCash(value);
  return (
    <div className={cell({ wide: true })}>
      <label htmlFor={id} className="tblock-label">
        {label}
      </label>
      <div className="calc-entry" data-invalid={err ? "" : undefined} onClick={focusInside}>
        <input
          id={id}
          value={value}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={err ? true : undefined}
          aria-describedby={ids(err && `${id}-e`, `${id}-r`, hint && `${id}-h`)}
          onChange={(e) => onChange(e.target.value)}
          className="type-title-s w-full flex-auto tabular-nums"
        />
      </div>
      <p id={`${id}-r`} className="calc-echo type-note">
        {years.length === 0 ? (
          "No years read yet."
        ) : (
          <>
            Read as {count(years.length, "year")}:{" "}
            {years.map((v, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                <span className="whitespace-nowrap">
                  Yr {first + i} <span className="tabular-nums text-text">{Number.isFinite(v) ? usd(v, false) : "not a number"}</span>
                </span>
              </Fragment>
            ))}
          </>
        )}
      </p>
      <Under id={id} err={err} hint={hint} />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  wide = false,
  wideOnPhone = false,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  hint?: string;
  wide?: boolean;
  wideOnPhone?: boolean;
}) {
  const id = useId();
  return (
    <div className={cell({ wide, wideOnPhone })}>
      <label htmlFor={id} className="tblock-label">
        {label}
      </label>
      <div className="calc-entry calc-entry--pick">
        <select id={id} value={value} aria-describedby={ids(hint && `${id}-h`)} onChange={(e) => onChange(e.target.value as T)} className="type-body">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" />
      </div>
      <Under id={id} err={null} hint={hint} />
    </div>
  );
}

export function CheckField({ label, checked, onChange, wide = true }: { label: string; checked: boolean; onChange: (v: boolean) => void; wide?: boolean }) {
  return (
    <div className={cell({ wide })}>
      <label className="calc-check type-body-s">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    </div>
  );
}

// A small action inside the form: add a row (a plus), remove one (a cross).
export function FormAction({
  children,
  onClick,
  tone = "accent",
  label,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "accent" | "faint";
  label?: string;
  icon?: IconName;
}) {
  return (
    <Button variant="quiet" size="sm" onClick={onClick} aria-label={label} className={cx("print:hidden", tone === "faint" && "text-muted")}>
      <Icon name={icon ?? (tone === "faint" ? "close" : "plus")} />
      {children}
    </Button>
  );
}

// A labeled group of cells: a head, then a two-column grid ruled with hairlines. `fold`
// makes it an optional part of the form that starts closed (a native fold: it opens with
// scripts off, and what is inside is still in the page).
export function FieldGroup({
  title,
  children,
  action,
  note,
  noteId,
  fold = false,
  open = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  note?: ReactNode;
  // an id for the note, so the fields it covers can name it (describedBy on a field)
  noteId?: string;
  fold?: boolean;
  open?: boolean;
}) {
  const id = useId();
  const body = (
    <>
      {note && (
        <p id={noteId} className="calc-group-note type-body-s">
          {note}
        </p>
      )}
      <div className="calc-cells">{children}</div>
    </>
  );
  if (fold) {
    return (
      <Disclosure summary={<span className="type-label">{title}</span>} open={open} className="calc-group">
        {action && <div className="calc-panel-note flex justify-end">{action}</div>}
        {body}
      </Disclosure>
    );
  }
  return (
    <div role="group" aria-labelledby={id} className="calc-group">
      <div className="calc-group-head">
        <span id={id} className="type-label">
          {title}
        </span>
        {action}
      </div>
      {body}
    </div>
  );
}

// A sub-heading row inside a group's grid, for a repeated item (a deal, a tier).
export function GroupRow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="calc-row">
      <span className="type-label">{children}</span>
      {action}
    </div>
  );
}

// A sentence inside a group's grid: what an empty list means, or what is wrong with the
// group as a whole (shown, like a field's own error, once the reader has paused).
export function FormNote({ children, issue }: { children?: ReactNode; issue?: Issue }) {
  const err = useIssue(issue);
  if (err) {
    return (
      <div className="calc-cell calc-cell--wide">
        <p className="calc-say type-body-s mt-0">
          <Icon name="risk" />
          <span>{children ?? err}</span>
        </p>
      </div>
    );
  }
  // Nothing wrong with the group, or nothing to say: no cell at all, never an empty one.
  if (issue !== undefined || children === undefined || children === null) return null;
  return <p className="calc-cell calc-cell--wide type-body-s m-0 text-faint">{children}</p>;
}

// The inputs panel: a title and a reset, then one line that says whose inputs these are (the
// worked example's or the reader's) and how to change them. Where the form stands between
// the answer and its figures (under 1024 px), that line also says when the answer above is
// the last one that read, and goes to the input that needs a fix; beside the answer, the
// list of fixes under it says so.
export function InputsPanel({ children, changed, onReset, title = "Inputs" }: { children: ReactNode; changed: boolean; onReset: () => void; title?: string }) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const { fixes } = useContext(CalcState);
  const goToFix = () => {
    const at = panel.current?.querySelector<HTMLElement>('[aria-invalid="true"], .calc-say');
    if (!at) return;
    // a field inside a closed fold cannot take the caret until the fold is open
    const fold = at.closest("details");
    if (fold) fold.open = true;
    if (at.matches("input, select")) at.focus();
    else at.scrollIntoView({ block: "center" });
  };
  return (
    <section ref={panel} aria-labelledby={id} className="calc-panel" data-stale={fixes > 0 ? "" : undefined}>
      <div className="calc-panel-head">
        <h2 id={id} className="type-title-s m-0 text-text">
          {title}
        </h2>
        <Button variant="quiet" size="sm" onClick={onReset} disabled={!changed} className="-mx-2 disabled:border-transparent print:hidden">
          <Icon name="replay" />
          Reset to the worked example
        </Button>
      </div>
      <p className="calc-panel-note type-note">
        <span className="calc-state">
          <span className="text-text">{changed ? "Your inputs." : "Worked example."}</span> <span className="print:hidden">Type over any value on a dashed line.</span>
        </span>
        {fixes > 0 && (
          <span className="calc-state-held">
            <Icon name="risk" />
            <span>
              <button type="button" className="link -my-3 py-3" onClick={goToFix}>
                {fixCount(fixes)}
              </button>
              . Showing the last result.
            </span>
          </span>
        )}
      </p>
      <noscript>
        <p className="calc-panel-note type-body-s">Scripts are off: this shows the worked example. Turn scripts on to change the inputs.</p>
      </noscript>
      {children}
    </section>
  );
}

// What to fix, in plain words: a label, or a label with the field's kind so a bound reads
// the way the field shows it (30%, not 0.3).
export type FixLabels = Record<string, string | [string, FieldKind]>;

const FIXES_SHOWN = 6;

// "Deal 1 capital at closing: Enter a number."
export function fixLine(issue: Issue, labels: FixLabels): { label: string; says: string } {
  const [label, kind] = labelFor(issue.path.map(String).join("."), labels);
  return { label, says: plainIssue(issue, kind) };
}

export function fixCount(n: number): string {
  return n === 1 ? "One input needs a fix" : `${n} inputs need a fix`;
}

// The list of what to fix. It stands above the last result that read, which stays on the
// page under it. It is not an alert: the page's one quiet live line says the count and the
// first fix once the reader has paused, so a screen reader hears it once.
export function FixList({ issues, labels, held = false }: { issues: Issue[]; labels: FixLabels; held?: boolean }) {
  const more = issues.length - FIXES_SHOWN;
  return (
    <Callout icon="risk" tone="risk" title={fixCount(issues.length)}>
      <ul className="type-body-s m-0 list-none space-y-1 p-0">
        {issues.slice(0, FIXES_SHOWN).map((i, n) => {
          const { label, says } = fixLine(i, labels);
          return (
            <li key={n}>
              <span className="text-text">{label}</span>: {says}
            </li>
          );
        })}
        {more > 0 && <li>And {more} more.</li>}
      </ul>
      <p className="type-body-s m-0 mt-2 text-faint">{held ? "The result comes back as soon as every input reads. Until then, this is the last result, before your edit." : "The result comes back as soon as every input reads."}</p>
    </Callout>
  );
}

// "deals.1.capital" falls back to the "deals.*.capital" label, numbered.
function labelFor(key: string, labels: FixLabels): [string, FieldKind] {
  const parts = key.split(".");
  const n = parts.find((p) => /^\d+$/.test(p));
  const generic = parts.map((p) => (/^\d+$/.test(p) ? "*" : p)).join(".");
  const hit = labels[key] ?? labels[generic];
  if (hit === undefined) return [key || "Inputs", "number"];
  const [text, kind] = typeof hit === "string" ? [hit, "number" as FieldKind] : hit;
  return [n !== undefined ? text.replace("#", String(Number(n) + 1)) : text, kind];
}
