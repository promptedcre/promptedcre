import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Tag } from "@/components/chips";
import { Disclosure, Icon, RoleMark, Sheet, TextLink, cx } from "@/components/ui";
import type { ParsedCheckOutcome, ParsedLink, Severity } from "@/lib/demo/findings";

// Shared parts of the documents the recorded run wrote, each drawn as one sheet. Pure.

// Who a finding's owner is, as a bare word: "cpa" reads "CPA".
const OWNER_WORD: Record<string, string> = { cpa: "CPA" };
export function ownerWord(owner: string): string {
  return OWNER_WORD[owner] ?? owner;
}

// The same person inside a sentence: "the CPA", "counsel", "the principal", "your agent".
const OWNER_PHRASE: Record<string, string> = { cpa: "the CPA", counsel: "counsel", agent: "your agent" };
export function ownerPhrase(owner: string): string {
  return OWNER_PHRASE[owner] ?? `the ${owner}`;
}

export const DOC_LABEL = "From the recorded run on the example firm. The firm and its people are fictional.";

// A data word standing alone as a label or a chip takes its capital ("open" reads "Open");
// inside a sentence it stays as written.
export const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// Whose finding it is, as the findings file has it: its "who fixes it" column and its
// status. An open one reads "The CPA fixes it"; a settled one "Was the principal's to fix".
// The file does not say who settled a finding, so the line does not either.
export function ownerLine(owner: string, status: string): string {
  const who = ownerPhrase(owner);
  return status === "open" ? `${capital(who)} fixes it` : `Was ${who}'s to fix`;
}

// Fold: the site's one disclosure (components/ui), closed below 768 px behind a one-line
// summary and simply open from 768 px up, where the summary is not drawn. Nothing inside is
// removed: it opens with or without scripts, find-in-page opens it, and it prints open.
export function Fold({
  summary,
  children,
  className,
  summaryClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
}) {
  return (
    <Disclosure summary={summary} openFrom="md" className={className} summaryClassName={cx("type-body-s font-medium", summaryClassName)}>
      {children}
    </Disclosure>
  );
}

// DocSheet: one document, one sheet (components/ui Sheet): the title in the head, parts
// ruled off one another inside, one title block along the bottom edge, and the file's own
// last line as the foot. Never a box inside it. It is a size container (rd), so what is
// inside lays itself out by the sheet's width, not the window's. `docLabel={false}` drops
// the sentence that says it is an example, for a page that says it once above its sheets.
export function DocSheet({
  title,
  titleId,
  note,
  titleBlock,
  footer,
  docLabel = true,
  className,
  children,
}: {
  title: ReactNode;
  titleId: string;
  note?: ReactNode;
  titleBlock: ReactNode;
  footer?: ReactNode;
  docLabel?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const foot =
    docLabel || footer ? (
      <>
        {footer}
        {docLabel && <span className="block">{DOC_LABEL}</span>}
      </>
    ) : undefined;
  return (
    <Sheet as="article" title={title} titleId={titleId} level={3} note={note} flush titleBlock={titleBlock} footer={foot} className={cx("rd", className)}>
      {children}
    </Sheet>
  );
}

// A file path, with a place to break after each slash.
export function breakAtSlash(text: string): ReactNode {
  const parts = text.split("/");
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ));
}

// ---- Outcomes of a check: shape and line first, color second ----
// Clear is solid drafting blue, a finding is solid in the finding's ink, unverified is
// hatched, not applicable is an empty ruled box, not checked is a dashed outline. Agent
// green and person amber stay for who.

export const OUTCOME_WORD: Record<ParsedCheckOutcome, string> = {
  clear: "clear",
  finding: "finding",
  unverified: "unverified",
  "not-applicable": "not applicable",
  "not-checked": "not checked",
};

const PRINTS = "[print-color-adjust:exact]";
const OUTCOME_BOX: Record<ParsedCheckOutcome, string> = {
  clear: `bg-accent ${PRINTS}`,
  finding: `bg-warn ${PRINTS}`,
  unverified: "hatch-unverified",
  "not-applicable": "border border-line-bold",
  "not-checked": "border border-dashed border-faint",
};

// OutcomeBox: a check's outcome as a small box, beside the word that says it. `size` in
// px; null leaves the size to className.
export function OutcomeBox({ outcome, size = 14, className }: { outcome: ParsedCheckOutcome; size?: number | null; className?: string }) {
  const dims: CSSProperties | undefined = size === null ? undefined : { width: size, height: size };
  return <span aria-hidden="true" className={cx("inline-block flex-none", OUTCOME_BOX[outcome], className)} style={dims} />;
}

// ---- Severity, status and who ----

// SeverityChip: how serious a finding is, in a word. High is the redline and carries the
// risk mark, so it never rests on its color; medium takes the finding's ink; low is neutral.
export function SeverityChip({ severity }: { severity: Severity }) {
  if (severity === "high") {
    return (
      <Tag tone="danger">
        <Icon name="risk" className="text-danger" />
        High
      </Tag>
    );
  }
  return <Tag tone={severity === "medium" ? "warn" : "muted"}>{capital(severity)}</Tag>;
}

// Where a finding stands: open is a dashed outline (not yet), anything else is settled.
export function StatusChip({ status }: { status: string }) {
  return status === "open" ? (
    <Tag dashed>{capital(status)}</Tag>
  ) : (
    <Tag tone="accent" dot>
      {capital(status)}
    </Tag>
  );
}

// Who: the agent's mark or a person's cut corner, and the words beside it in neutral ink.
export function Who({ who, label, className }: { who: string; label?: string; className?: string }) {
  return <RoleMark mode={who === "agent" ? "A" : "H"} size="sm" label={label ?? ownerWord(who)} className={cx("whitespace-normal", className)} />;
}

// ---- Sources ----

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// `columns` sets the list in two balanced columns where its sheet is at least 52rem wide
// (a sheet is a size container), for a list that has the sheet's whole width to itself.
// The list's own rules (.rd-src, run-styles) space it, keep a source whole, never split
// between two columns or two pages (plain blocks, so that paper can), and leave the host
// off on paper under an outside link, because the site's print rule prints the whole
// address after it.
export function SourceItems({ sources, ruleCards = [], columns = false }: { sources: ParsedLink[]; ruleCards?: string[]; columns?: boolean }) {
  return (
    <>
      <ul className={cx("rd-src", columns && "rd-src--cols")}>
        {sources.map((src, i) => (
          <li key={`${src.url}-${i}`} className="type-body-s">
            <TextLink href={src.url}>{src.title}</TextLink>
            <span className="type-data text-faint">{host(src.url)}</span>
          </li>
        ))}
      </ul>
      {ruleCards.length > 0 && (
        <p className={cx("type-body-s m-0 text-muted", columns ? "mt-6" : "mt-3")}>
          Rule cards: <span className="type-data break-words">{ruleCards.join(", ")}</span>
        </p>
      )}
    </>
  );
}

// A count that opens to the list; works without scripts. The engine's report lists a
// check's rule cards and its sources on one line, so the count is of both together:
// the audit page's schedule says "5 sources · 2 rules" for the same check that reads
// "7 rules and sources" here.
export function SourcesDisclosure({ sources, ruleCards = [] }: { sources: ParsedLink[]; ruleCards?: string[] }) {
  const n = sources.length + ruleCards.length;
  if (n === 0) return <p className="type-body-s m-0 text-faint">No sources listed for this check</p>;
  return (
    <Disclosure size="sm" summary={`${n} ${n === 1 ? "rule or source" : "rules and sources"}`} summaryClassName="type-body-s text-muted" bodyClassName="pb-2 pt-1">
      <SourceItems sources={sources} ruleCards={ruleCards} />
    </Disclosure>
  );
}
