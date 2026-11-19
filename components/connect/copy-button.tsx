"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { toast } from "@/components/motion/page-motion";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";

const noop = () => () => {};

// Select the text of the element with this id, so one key press copies it.
function selectText(id: string | undefined) {
  const el = id ? document.getElementById(id) : null;
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// The key that copies on this machine, in words.
const copyKeys = () => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "Cmd+C" : "Ctrl+C");

function textareaCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

// CopyButton: copies `text`. It tries the clipboard, then a hidden textarea, and
// if both fail it selects the element named by `selectId` and says which keys copy it.
// It renders nothing until scripts run, so a page without them shows only the
// text, which can be selected by hand.
//
// The look is the site's button (app/globals.css .btn): `variant` "secondary" (outlined,
// the default) or "primary" (filled: the one action a screen is for); `size` "sm" (the
// default) or "md". Both are 44 px tall where they are tapped. `children` are the words on
// the button ("Copy the sentence"); left out, it says "Copy".
//
// Feedback (docs/MOTION.md, M6): the copy icon is redrawn as a check and the words say
// "Copied". The check is a stroke that follows --draw, so with reduced motion it simply
// appears. Both icons stay mounted, so the button never changes width for the icon.
//
// The button says where it stands in data-copy-state ("idle", "copied", "select"), so a
// place that keeps the text out of sight beside its button can show it when the text has
// to be copied by hand (the short doors at the foot of the home page do).
export function CopyButton({
  text,
  label,
  selectId,
  variant = "secondary",
  size = "sm",
  children = "Copy",
  toastText = "Copied. Paste it into your AI agent.",
  className,
}: {
  text: string;
  toastText?: string; // the notice after a copy (D224)
  label: string; // what is copied, for screen readers: "Copy the command"
  selectId?: string;
  variant?: "primary" | "secondary";
  size?: "md" | "sm";
  children?: ReactNode;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "select">("idle");
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  // Once the page has drawn the "select" state: a place that showed the text only now has
  // it on screen, and a selection made before that would have nothing to hold.
  useEffect(() => {
    if (state === "select") selectText(selectId);
  }, [state, selectId]);
  if (!hydrated) return null;

  const copy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = textareaCopy(text);
    if (ok) {
      setState("copied");
      window.setTimeout(() => setState("idle"), 1800);
      // D224: a short notice, and a light sweep along the box the button sits in, if it asks for one.
      toast(toastText);
      const box = document.getElementById(selectId ?? "")?.closest<HTMLElement>("[data-sweep]");
      if (box) {
        box.removeAttribute("data-swept");
        void box.offsetWidth;
        box.setAttribute("data-swept", "");
      }
      return;
    }
    // Select it now too: a second press finds the state unchanged, and no effect runs.
    selectText(selectId);
    setState("select");
  };

  const copied = state === "copied";
  const keys = state === "select" ? copyKeys() : "";
  // The button's name never changes; what happened is said once, in a status
  // region beside it.
  const said = copied ? "Copied" : state === "select" ? `Selected. Press ${keys} to copy.` : "";
  const fade: CSSProperties = { opacity: copied ? 0 : 1, transition: "opacity var(--dur-1) var(--ease-out)" };
  const stroke = { "--draw": copied ? 1 : 0, transition: "--draw var(--dur-2) var(--ease-out)" } as CSSProperties;
  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        data-copy-state={state}
        className={cx("btn", `btn--${variant}`, size === "sm" && "btn--sm", "print:hidden", className)}
      >
        <span aria-hidden="true" className="relative block size-4 flex-none">
          <span className="absolute inset-0" style={fade}>
            <Icon name="copy" className="block" />
          </span>
          <span className="absolute inset-0" style={stroke}>
            <Icon name="check" draw className="block" />
          </span>
        </span>
        <span aria-hidden="true">{copied ? "Copied" : state === "select" ? `Press ${keys}` : children}</span>
      </button>
      <span role="status" className="sr-only">
        {said}
      </span>
    </>
  );
}
