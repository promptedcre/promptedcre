import { Fragment, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { CopyButton } from "./copy-button";

// A URL that may break after each slash of its path, never inside "https://".
function UrlBreaks({ url }: { url: string }) {
  const m = /^([^/]*\/\/)(.*)$/.exec(url);
  const head = m ? m[1] : "";
  const rest = m ? (m[2] ?? "") : url;
  const segs = rest.split("/");
  return (
    <span>
      <span className="whitespace-nowrap">
        {head}
        {segs[0]}
      </span>
      {segs.length > 1 && (
        <>
          /<wbr />
        </>
      )}
      {segs.slice(1).map((seg, j, all) => (
        <Fragment key={j}>
          {seg}
          {j < all.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </Fragment>
      ))}
    </span>
  );
}

// A bracketed address is one unit that moves to the next line whole, from the width at
// which it fits a line of the well: the mono face advances 0.6 em a character at the
// prompt's 0.875rem, and the well pads its line by 1rem a side. These are the well's own
// widths (it is a size container), as the classes Tailwind has for them. The first is cut
// for the address every door carries, the site's own /install: it needs 19.33rem, and a
// 390 px phone gives the well 19.75.
const WHOLE_FROM: readonly [rem: number, cls: string][] = [
  [19.5, "@[19.5rem]:inline-block @[19.5rem]:max-w-full"],
  [20, "@xs:inline-block @xs:max-w-full"],
  [24, "@sm:inline-block @sm:max-w-full"],
  [28, "@md:inline-block @md:max-w-full"],
  [32, "@lg:inline-block @lg:max-w-full"],
  [36, "@xl:inline-block @xl:max-w-full"],
  [42, "@2xl:inline-block @2xl:max-w-full"],
];
function wholeFrom(chars: number): string | undefined {
  const rem = chars * 0.6 * 0.875 + 2;
  return WHOLE_FROM.find(([width]) => width >= rem)?.[1];
}

// Set the URLs in a sentence in accent-strong. A URL in parentheses is kept with
// its brackets as one unit that moves to the next line whole, wherever a line of the
// well can hold it. In a narrower well (a small phone, two doors side by side on a
// tablet) it cannot fit a line: there it flows with the words and breaks after a slash,
// so the sentence carries on beside its last piece instead of starting a new line under
// it, and a long address wraps instead of pushing the page sideways. Used inside
// PromptWell, whose width the unit reads.
export function MonoWithUrls({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+?)(?=[)\s,"]|\.(?:\s|$)|$)/);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) {
          // Text around a bracketed URL gives its "(" and ")" to the URL's unit.
          const opens = (parts[i + 1] ?? "") !== "" && p.endsWith("(") && (parts[i + 2] ?? "").startsWith(")");
          const closes = i > 0 && p.startsWith(")") && (parts[i - 2] ?? "").endsWith("(");
          return <Fragment key={i}>{p.slice(closes ? 1 : 0, opens ? -1 : undefined)}</Fragment>;
        }
        const bracketed = (parts[i - 1] ?? "").endsWith("(") && (parts[i + 1] ?? "").startsWith(")");
        return (
          <span key={i} className={bracketed ? wholeFrom(p.length + 2) : undefined}>
            {bracketed && "("}
            <span className="text-accent-strong">
              <UrlBreaks url={p} />
            </span>
            {bracketed && ")"}
          </span>
        );
      })}
    </>
  );
}

// PromptWell: the sentence a person pastes into their agent, in a well (the inset
// surface, no frame: a well is a step down in the paper, not a box) and in the mono
// face, because it is copied letter for letter. No caret before it: it is a sentence,
// not a command line.
//
// With `copy` (the default) the Copy button is the well's own: when the well is wide it
// sits at the top right beside the sentence; when it is narrow (a phone, a two-column
// head) it takes its own row under the sentence, so the sentence keeps the full width.
// Nothing is reserved for the button until it renders (it needs scripts). With
// `copy={false}` the well is the sentence alone, for a place that sets its own Copy
// button beside it (the home page's doors).
export function PromptWell({
  text,
  id,
  copyLabel = "Copy the prompt",
  copy = true,
  className,
}: {
  text: string;
  id: string; // unique on the page: the fallback selects this element's text
  copyLabel?: string;
  copy?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("@container rounded-control bg-inset", className)}>
      <div className="relative p-4 @[38rem]:has-[button]:pr-28">
        {/* In a well too narrow for the address to keep a line, the lines break where they
            fill, so the address is cut once and the words carry on beside it; from 19.5rem the
            paragraph is set like any other. */}
        <p id={id} className="type-code m-0 text-wrap break-words text-text @[19.5rem]:text-pretty">
          <MonoWithUrls text={text} />
        </p>
        {copy && (
          <div className="mt-3 flex justify-end empty:hidden @[38rem]:absolute @[38rem]:right-3 @[38rem]:top-3 @[38rem]:mt-0">
            <CopyButton text={text} label={copyLabel} selectId={id} />
          </div>
        )}
      </div>
    </div>
  );
}

// PromptCard: a paste-in sentence with its label ("Paste this into your agent")
// and an optional note on the right of the label (a status chip). The playbook
// page sends a playbook this way; the doors use PromptWell under their tabs.
export function PromptCard({
  text,
  id,
  label = "Paste this into your agent",
  aside,
  className,
}: {
  text: string;
  id: string;
  label?: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="type-label m-0 text-faint">{label}</p>
        {aside}
      </div>
      <PromptWell text={text} id={id} />
    </div>
  );
}
