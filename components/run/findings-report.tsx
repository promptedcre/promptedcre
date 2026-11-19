import { useId, type ReactNode } from "react";
import { ApprovalCells, Disclosure, TitleBlock, TitleCell, cx } from "@/components/ui";
import type { ParsedCheck, ParsedFindings, ParsedFindingRow } from "@/lib/demo/findings";
import { DocSheet, Fold, OUTCOME_WORD, OutcomeBox, SeverityChip, SourcesDisclosure, StatusChip, Who, breakAtSlash, capital, ownerLine, ownerPhrase } from "./doc-parts";
import { ScoreFigure, checksSummary } from "./score-figure";

export { ScoreFigure, scoreArithmetic } from "./score-figure";

// FindingsReport: an audit's findings.md (parseFindings) drawn as one sheet, result first:
// the score as a figure with one box per check, the findings with who fixes each and by
// when, the checks behind a fold, and one title block along the bottom edge with the
// firm, the dates, who drew it and the line a person signs. Pure: pass it the parsed file.
// The classes (rd-) are in run-styles.tsx.

// What a missed check can cost, as a rule card the check cites says it: the card's own
// sentence, the card's title and the link that opens it on /rules.
export type Stake = { text: string; rule: string; href: string };

// One line under a finding: the rule card's own sentence, then the card as its link.
export function StakeLine({ stake, className }: { stake: Stake; className?: string }) {
  return (
    <span className={cx("type-body-s block text-muted", className)}>
      {stake.text}{" "}
      <a href={stake.href} aria-label={`Rule card: ${stake.rule}`} className="link whitespace-nowrap">
        Rule card
      </a>
    </span>
  );
}

// A person named in the file stays a name; a role reads as one ("the CPA", "your agent").
const whoPhrase = (by: string) => (/[A-Z]/.test(by) ? by : ownerPhrase(by));

function FindingRow({ f, stake }: { f: ParsedFindingRow; stake?: Stake }) {
  const open = f.status === "open";
  return (
    <li className="rd-f">
      <span className="rd-f-id type-data">{f.id}</span>
      <span className="rd-f-sev">
        <SeverityChip severity={f.severity} />
      </span>
      <span className="rd-f-status">
        <StatusChip status={f.status} />
      </span>
      <p className={cx("rd-f-what type-body", !open && "rd-f-what--done")}>{f.what}</p>
      <p className="rd-f-who type-body-s">
        <Who who={f.owner} label={ownerLine(f.owner, f.status)} />
        {f.due ? (
          <span>
            by <time dateTime={f.due} className="type-data text-text">{f.due}</time>
          </span>
        ) : (
          open && <span>no date set</span>
        )}
      </p>
      {open && stake && <StakeLine stake={stake} className="rd-f-stake" />}
    </li>
  );
}

// A check as the report has it. The row's layout (rd-c: its number, then its outcome and who
// recorded it, then what it is; the outcome moves beside the check where the sheet is at
// least 44rem wide) is in run-styles.tsx: a report draws a row for every check, and a page
// can draw two reports.
function CheckRow({ c, sources }: { c: ParsedCheck; sources: boolean }) {
  return (
    <li className="rd-c">
      <span className="type-data text-faint">{c.n}</span>
      <p className="rd-c-o">
        <span className="type-label inline-flex items-center gap-2 text-text">
          <OutcomeBox outcome={c.outcome} />
          {capital(OUTCOME_WORD[c.outcome])}
        </span>
        {c.by && <Who who={c.by === "agent" ? "agent" : "person"} label={`by ${whoPhrase(c.by)}`} className="text-muted" />}
      </p>
      <div className="rd-c-b">
        <p className="type-body m-0 text-text">{c.title}</p>
        <p className="type-data m-0 mt-1 break-words text-faint">{c.id}</p>
        {c.evidence && (
          <p className="type-body-s m-0 mt-2 text-faint">
            Evidence <span className="type-data break-words text-muted">{breakAtSlash(c.evidence)}</span>
          </p>
        )}
        {c.note && (
          <p className="type-body-s m-0 mt-2 text-muted">
            <span className="text-faint">Note</span> {c.note}
          </p>
        )}
        {sources && <SourcesDisclosure sources={c.sources} ruleCards={c.ruleCards} />}
      </div>
    </li>
  );
}

// What the file is: the firm, its dates, who drew it, who approves it and where it is.
function ReportTitleBlock({ doc, file }: { doc: ParsedFindings; file: string }) {
  // The folder a findings file sits in is named after its audit: a path that carries the
  // audit's id says it already.
  const pathNamesAudit = file.includes(doc.auditId);
  return (
    <TitleBlock label="Title block" className="grid-cols-2 @[40rem]:grid-cols-4">
      <TitleCell label="Firm">{doc.firm}</TitleCell>
      {!pathNamesAudit && (
        <TitleCell label="Audit" mono>
          {doc.auditId}
        </TitleCell>
      )}
      {doc.subject && (
        <TitleCell label="Subject" mono>
          {doc.subject}
        </TitleCell>
      )}
      <TitleCell label="Opened" mono>
        {doc.opened}
      </TitleCell>
      <TitleCell label="Written" mono>
        {doc.written}
      </TitleCell>
      <TitleCell label="Audit state" tone="muted">
        {capital(doc.stateNote)} when written
      </TitleCell>
      <TitleCell label="File" mono className="col-span-2">
        {breakAtSlash(file)}
      </TitleCell>
      <ApprovalCells drawnBy="agent" />
    </TitleBlock>
  );
}

// checksCollapsed puts the checks behind a fold at every width ("The N checks, one by one":
// like every fold here it names what it holds, so the line still reads right on paper,
// where the fold prints open); by default they are folded on a phone and open from 768 px.
// sources={false} leaves each check's rules and sources out and says where they are
// listed (sourcesAt), for a page that draws two reports of one audit: the list is the same
// in both, so it is drawn once.
// docLabel={false} drops the sentence that says it is an example (see DocSheet).
// stakes, by finding id, puts under an open finding what its rule card says a miss can cost.
export function FindingsReport({
  doc,
  file = "findings.md",
  checksCollapsed = false,
  sources = true,
  sourcesAt,
  docLabel = true,
  stakes,
  className,
}: {
  doc: ParsedFindings;
  file?: string;
  checksCollapsed?: boolean;
  sources?: boolean;
  sourcesAt?: ReactNode;
  /** @deprecated The result always leads; the title block is the sheet's bottom edge. */
  resultFirst?: boolean;
  docLabel?: boolean;
  stakes?: Partial<Record<string, Stake>>;
  className?: string;
}) {
  const id = useId();
  const nFindings = doc.findings.length;
  const nChecks = doc.checks.length;
  const open = doc.findings.filter((f) => f.status === "open").length;
  const unchecked = doc.checks.filter((c) => c.outcome === "not-checked").length;
  const checks = (
    <>
      {!sources && sourcesAt && <p className="type-body-s m-0 mb-3 text-muted">{sourcesAt}</p>}
      <ol className="m-0 list-none border-b border-line p-0" aria-label={`Checks in ${doc.auditId}, with each outcome and who recorded it`}>
        {doc.checks.map((c) => (
          <CheckRow key={c.id} c={c} sources={sources} />
        ))}
      </ol>
    </>
  );
  return (
    <DocSheet
      title={doc.title}
      titleId={`${id}-title`}
      note={`${nFindings} ${nFindings === 1 ? "finding" : "findings"} · ${open} open`}
      titleBlock={<ReportTitleBlock doc={doc} file={file} />}
      footer={doc.footer}
      docLabel={docLabel}
      className={className}
    >
      <div className="rd-result">
        <div className="rd-score sheet-grid">
          <ScoreFigure doc={doc} />
        </div>
        <div className="rd-findings" data-reveal="">
          <h4 className="type-title-s m-0 text-text">Findings</h4>
          {nFindings === 0 ? (
            <p className="type-body m-0 mt-2 text-muted">No findings.</p>
          ) : (
            <ol className="rd-fl" aria-label={`Findings in ${doc.auditId}`}>
              {doc.findings.map((f) => (
                <FindingRow key={f.id} f={f} stake={stakes?.[f.id]} />
              ))}
            </ol>
          )}
        </div>
      </div>
      {checksCollapsed ? (
        <Disclosure
          className="border-t border-line px-4 md:px-6"
          summaryClassName="type-body-s font-medium"
          bodyClassName="pb-4"
          summary={
            <span className="flex flex-wrap items-baseline justify-between gap-x-6">
              <span>
                {nChecks === 1 ? "The 1 check" : `The ${nChecks} checks, one by one`}
              </span>
              {unchecked > 0 && <span className="type-label text-faint">{unchecked} not checked yet</span>}
            </span>
          }
        >
          {checks}
        </Disclosure>
      ) : (
        <Fold summary={checksSummary(doc)} className="border-t border-line px-4 md:px-6">
          <div className="pb-4 md:pt-5">
            <h4 className="type-title-s sr-only m-0 mb-3 text-text md:not-sr-only">Checks</h4>
            {checks}
          </div>
        </Fold>
      )}
    </DocSheet>
  );
}

// A sentence that says where a report's sources are listed, with its link. A plain anchor:
// on /run the report it points to sits in another scene, which :target shows, and only a
// real jump to the fragment sets :target.
export function SourcesElsewhere({ href, where }: { href: string; where: string }) {
  return (
    <>
      Each check&rsquo;s rules and sources are listed once, in{" "}
      <a href={href} className="link">
        {where}
      </a>
      .
    </>
  );
}
