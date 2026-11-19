"use client";

import { useEffect } from "react";

function inputs(name: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`));
}

function check(name: string, value: string): boolean {
  const hit = inputs(name).find((i) => i.value === value);
  if (!hit) return false;
  hit.checked = true;
  return true;
}

// RadioSync: a small enhancer for a radio group whose choice is carried by CSS.
// The page reads fully without it. With scripts on, it keeps the choice in the URL:
//   via "param": ?mode=audit checks the audit radio on load, and choosing a radio
//     rewrites the query without a navigation (the default value drops the param).
//     Every group that shares `sync` follows the same choice, so a page's hero doors
//     and closing doors stay together.
//   via "hash": #codex checks the codex radio on load and when the hash changes,
//     and choosing a radio rewrites the hash without scrolling.
export function RadioSync({
  name,
  via,
  param = "mode",
  defaultValue,
  sync,
}: {
  name: string;
  via: "param" | "hash";
  param?: string;
  defaultValue?: string;
  sync?: string; // a key shared by groups that should move together
}) {
  useEffect(() => {
    const fromUrl = () => {
      if (via === "param") {
        const v = new URLSearchParams(window.location.search).get(param);
        if (v) check(name, v);
      } else {
        const v = decodeURIComponent(window.location.hash.slice(1));
        if (v) check(name, v);
      }
    };
    fromUrl();

    const onChange = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "radio" || t.name !== name || !t.checked) return;
      const url = new URL(window.location.href);
      if (via === "param") {
        if (t.value === defaultValue) url.searchParams.delete(param);
        else url.searchParams.set(param, t.value);
        if (sync) {
          document.querySelectorAll<HTMLInputElement>(`input[type="radio"][data-sync="${CSS.escape(sync)}"]`).forEach((other) => {
            if (other.name !== name && other.value === t.value) other.checked = true;
          });
        }
      } else {
        url.hash = t.value;
      }
      window.history.replaceState(window.history.state, "", url);
    };

    document.addEventListener("change", onChange);
    if (via === "hash") window.addEventListener("hashchange", fromUrl);
    return () => {
      document.removeEventListener("change", onChange);
      if (via === "hash") window.removeEventListener("hashchange", fromUrl);
    };
  }, [name, via, param, defaultValue, sync]);

  return null;
}
