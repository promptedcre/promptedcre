import { useId } from "react";
import { ApprovalCells, TitleBlock, TitleCell, cx } from "@/components/ui";
import type { ParsedSheet } from "@/lib/demo/findings";
import { DocSheet, Fold, SeverityChip, SourceItems, breakAtSlash, capital, ownerPhrase } from "./doc-parts";

// OwnerSheet: a sheet-<owner>.md (parseSheet) drawn as the to-do sheet for one person. Each
// open finding reads down the sheet at its full width: what it is, then one ruled row of
// facts (what was found, the check it came from, when it is due), then the rules and
// sources behind it, in two balanced columns where the sheet is wide and folded on a phone.
// One title block along the bottom edge holds the line that person signs. Pure.
//
// Nothing sits beside anything of another height: a finding of two lines beside a list of
// eight sources left a hole in every sheet, and so did two sheets side by side.
//
// On paper it is the page handed to that person: the sheet stays on one page when it fits
// one, so the facts are set in a row and the title block in one band there, as they are
// on a wide screen.

// `docLabel={false}` drops the sentence that says it is an example (see DocSheet).
export function OwnerSheet({
  doc,
  file,
  docLabel = true,
  className,
}: {
  doc: ParsedSheet;
  file?: string;
  /** @deprecated The sheet is open at every width; only its list of sources folds on a phone. */
  fold?: boolean;
  docLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const who = ownerPhrase(doc.owner);
  const n = doc.findings.length;
  const dues = doc.findings.flatMap((f) => (f.due ? [f.due] : [])).sort();
  const path = file ?? `sheet-${doc.owner}.md`;
  return (
    <DocSheet
      title={`Open findings for ${who}`}
      titleId={`${id}-title`}
      note={
        n === 0 ? (
          "Nothing to fix"
        ) : (
          <>
            {n} {n === 1 ? "finding" : "findings"} to fix
            {dues[0] ? (
              <>
                , {n === 1 ? "due" : "first due"} <span className="type-data whitespace-nowrap">{dues[0]}</span>
              </>
            ) : (
              `, ${n === 1 ? "no date set" : "no dates set"}`
            )}
          </>
        )
      }
      titleBlock={
        <TitleBlock label={`Title block: open findings for ${who}`} className="grid-cols-2 @[56rem]:grid-cols-6 print:grid-cols-6">
          <TitleCell label="Firm">{doc.firm}</TitleCell>
          <TitleCell label="Written" mono>
            {doc.written}
          </TitleCell>
          <TitleCell label="File" mono className="col-span-2">
            {breakAtSlash(path)}
          </TitleCell>
          <ApprovalCells drawnBy="agent" signer={capital(who)} />
        </TitleBlock>
      }
      footer={doc.footer}
      docLabel={docLabel}
      className={cx("print:break-inside-avoid", className)}
    >
      {n === 0 && <p className="sheet-part type-body m-0 text-muted">No finding is open for {who}.</p>}
      {doc.findings.map((f) => {
        const sources = f.sources.length + f.ruleCards.length;
        return (
          <section key={f.id} aria-labelledby={`${id}-${f.id}`} className="sheet-part">
            {/* What the finding is and its facts stay on one page of paper. */}
            <div className="print:break-inside-avoid">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="type-data text-faint">{f.id}</span>
                <SeverityChip severity={f.severity} />
              </div>
              <h4 id={`${id}-${f.id}`} className="type-title-s m-0 mt-2 text-text">
                {f.title}
              </h4>
              <dl className="m-0 mt-4 grid gap-x-8 gap-y-4 @[52rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] print:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]">
                <div className="min-w-0">
                  <dt className="type-label text-faint">What was found</dt>
                  <dd className="type-body measure m-0 mt-1 whitespace-pre-line text-text">{f.found}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="type-label text-faint">From the check</dt>
                  <dd className="type-body-s m-0 mt-1 text-muted">
                    {f.check.title ?? f.check.id}
                    {f.check.title && <span className="type-data mt-1 block break-words text-faint">{f.check.id}</span>}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="type-label text-faint">Due</dt>
                  <dd className="m-0 mt-1">
                    {f.due ? (
                      <time dateTime={f.due} className="type-data text-text">
                        {f.due}
                      </time>
                    ) : (
                      <span className="type-body-s text-muted">No date set</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            {/* Below 768 px the fold is the part's last row: its line sits between two rules,
                and the list it opens keeps the part's own space under it. */}
            <div className="mt-4 border-t border-line max-md:-mb-4 md:mt-6 md:pt-4">
              <Fold summary={`Rules and sources behind it: ${sources}`}>
                <div className="max-md:pb-4">
                  <p className="type-label m-0 mb-3 hidden text-faint md:block">Rules and sources behind it: {sources}</p>
                  {sources === 0 ? <p className="type-body-s m-0 text-faint">None listed for this check.</p> : <SourceItems sources={f.sources} ruleCards={f.ruleCards} columns />}
                </div>
              </Fold>
            </div>
          </section>
        );
      })}
    </DocSheet>
  );
}
