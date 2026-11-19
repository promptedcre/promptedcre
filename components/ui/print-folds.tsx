"use client";

import { useEffect } from "react";

// PrintFolds: every fold prints open. The print rules in app/globals.css open closed
// <details> through ::details-content; a browser without that selector gets this
// instead: before printing it opens each closed fold, and after printing it closes
// the same ones again, so the page on screen is as the reader left it. The layout
// renders it once. Renders nothing.
export function PrintFolds() {
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports?.("selector(::details-content)")) return;
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = Array.from(document.querySelectorAll<HTMLDetailsElement>("details:not([open])"));
      for (const d of opened) d.open = true;
    };
    const after = () => {
      for (const d of opened) d.open = false;
      opened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
