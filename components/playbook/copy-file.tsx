"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/motion/page-motion";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";

async function load(href: string): Promise<string> {
  const r = await fetch(href);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}

// How long "Copied" stays before the button offers to copy again: the same as the site's other copy control.
const SAID_FOR_MS = 1800;

type State = "idle" | "copied" | "failed";

// Copies what `read` gives. A promise inside the clipboard item keeps the click's permission
// while a file loads; a browser without one is given the text by writeText.
async function copy(read: () => Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const blob = read().then((t) => new Blob([t], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    }
  } catch {
    // fall through to writeText
  }
  try {
    await navigator.clipboard.writeText(await read());
    return true;
  } catch {
    return false;
  }
}

// The button both copy controls draw. The feedback every copy control on the site gives
// (docs/MOTION.md, M6; the same as components/connect/copy-button.tsx): the copy icon fades
// as the check is drawn over it. The check is a stroke that follows --draw, so with reduced
// motion it simply appears, and both icons stay mounted, so the button never changes width
// for the icon. It needs scripts, so with scripts off it is not shown (pb-js); it is in the
// server HTML, so nothing moves when scripts arrive. What happened is said once, in a status
// line beside it: "Copied" for a screen reader, and on a refusal a line anyone can see,
// with the way out (`failed`).
function CopyControl({
  read,
  variant,
  label,
  failed,
  children,
}: {
  read: () => Promise<string>;
  variant: "primary" | "secondary";
  label?: string;
  failed: ReactNode;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), SAID_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copied = state === "copied";
  const fade: CSSProperties = { opacity: copied ? 0 : 1, transition: "opacity var(--dur-1) var(--ease-out)" };
  const stroke = { "--draw": copied ? 1 : 0, transition: "--draw var(--dur-2) var(--ease-out)" } as CSSProperties;
  return (
    <>
      <Button variant={variant} onClick={async () => {
          const ok = await copy(read);
          setState(ok ? "copied" : "failed");
          // D224: the site's one notice after a copy.
          if (ok) toast("Copied. Paste it into any AI chat.");
        }} aria-label={label} className="pb-js print:hidden">
        <span aria-hidden="true" className="relative block size-4 flex-none">
          <span className="absolute inset-0" style={fade}>
            <Icon name="copy" className="block" />
          </span>
          <span className="absolute inset-0" style={stroke}>
            <Icon name="check" draw className="block" />
          </span>
        </span>
        <span aria-hidden={label ? true : undefined}>{copied ? "Copied" : children}</span>
      </Button>
      <span role="status" className={cx(state === "failed" ? "type-body-s flex basis-full items-start gap-2 text-text print:hidden" : "sr-only")}>
        {state === "failed" && <Icon name="risk" className="mt-0.5 text-warn" />}
        {copied ? "Copied" : state === "failed" ? <span className="min-w-0">{failed}</span> : ""}
      </span>
    </>
  );
}

// CopyFileButton: copies the record's Markdown file (served at `href`) for pasting into any
// AI chat. The file is fetched on click, so the page does not carry it twice. If the browser
// refuses, the line beside it says so and names the Download link, which needs no script.
export function CopyFileButton({ href, variant = "secondary", children }: { href: string; variant?: "primary" | "secondary"; children: ReactNode }) {
  return (
    <CopyControl read={() => load(href)} variant={variant} failed="Could not copy. Use Download the file instead.">
      {children}
    </CopyControl>
  );
}

// CopyTextButton: copies one sentence the server wrote (a playbook's run prompt, from
// runPrompt in lib/site.ts). `label` is the control's full name when the words on it say
// less; it starts with those words. If the browser refuses, the sentence is shown in the
// line beside it, to copy by hand.
export function CopyTextButton({ text, label, variant = "primary", children }: { text: string; label?: string; variant?: "primary" | "secondary"; children: ReactNode }) {
  return (
    <CopyControl
      read={() => Promise.resolve(text)}
      variant={variant}
      label={label}
      failed={
        <>
          Could not copy. Copy it from here: <span className="type-code break-words text-text">{text}</span>
        </>
      }
    >
      {children}
    </CopyControl>
  );
}
