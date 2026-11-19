// From the file, not the folder's barrel: the barrel also carries the whole /connect flow.
import { NotLiveChip } from "@/components/connect/connector-status";
import { cx } from "@/components/ui";
import { CopyFileButton, CopyTextButton } from "./copy-file";
import { PrintButton } from "./open-all";

// RecordActions: what a reader can do with a written record, in its head, in one row:
//   - "Run with your agent", the page's one filled button: it copies `prompt` (runPrompt in
//     lib/site.ts, the one sentence that names this playbook), with the page's one "Not live
//     yet" beside it (NotLiveChip, which draws nothing once site.connectorLive is true);
//   - "Copy the whole playbook": the record's Markdown file (lib/export/playbook-md.ts),
//     which works in any AI chat today;
//   - "Download the file" and "Print or save as PDF", as two small links.
// The two copy buttons and print need scripts. With scripts off the sentence the run button
// copies is printed in their place, so it can be copied by hand, and Download still works.
// `file` is the file's address, or null for a record that has none, which keeps the run
// button and print. None of it prints.
export function RecordActions({ prompt, slug, file, className }: { prompt: string; slug: string; file: string | null; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-3 print:hidden", className)}>
      <CopyTextButton text={prompt} label="Run with your agent: copies a prompt that names this playbook">
        Run with your agent
      </CopyTextButton>
      <p className="pb-nojs type-body-s m-0 min-w-0 text-muted">
        Paste into your agent: <span className="type-code break-words text-text">{prompt}</span>
      </p>
      <NotLiveChip>Goes live at launch</NotLiveChip>
      {file && <CopyFileButton href={file}>Copy the whole playbook</CopyFileButton>}
      <span className="inline-flex flex-wrap items-center gap-x-6">
        {file && (
          // A plain anchor: it works with scripts off, and ButtonLink cannot carry `download`.
          <a href={file} download={`${slug}.md`} className="link link--muted type-body-s inline-flex min-h-11 items-center md:min-h-0">
            Download the file<span className="sr-only">: this playbook as a Markdown file</span>
          </a>
        )}
        <PrintButton />
      </span>
    </div>
  );
}
