"use client";

import { useEffect } from "react";

/** Fired on window when a switch's choice has just changed, and with it what the page shows. */
export const VARIANT_EVENT = "pcre:variant";
const EVENT = VARIANT_EVENT;

// VariantSync: the only script behind a VariantSwitch. The switch itself is radios and CSS, so it
// works with scripts off; this keeps the choice in the URL (?param=value), mirrors it on the
// root's data attribute, and keeps two switches for the same choice on one page in step.
// It renders nothing. Use VariantSwitch, which places it.
export function VariantSync({
  fieldsetId,
  rootId,
  param,
  attr,
  values,
}: {
  fieldsetId: string;
  rootId: string;
  param: string;
  attr: string;
  values: string[];
}) {
  const key = values.join("|");
  useEffect(() => {
    const set = document.getElementById(fieldsetId);
    if (!set) return;
    const allowed = key.split("|");
    const fallback = allowed[0] ?? "";
    const radios = Array.from(set.querySelectorAll<HTMLInputElement>("input[type=radio]"));
    // With scripts off, every switch for this choice on the page is one radio group, so one
    // choice holds. With scripts on, each switch becomes its own group and this keeps them equal.
    for (const r of radios) r.name = fieldsetId;

    const read = () => {
      const v = new URLSearchParams(window.location.search).get(param);
      return v && allowed.includes(v) ? v : fallback;
    };
    const apply = (v: string) => {
      for (const r of radios) r.checked = r.value === v;
      document.getElementById(rootId)?.setAttribute(attr, v);
    };
    const sync = () => apply(read());
    const choose = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !t.checked) return;
      const url = new URL(window.location.href);
      if (t.value === fallback) url.searchParams.delete(param);
      else url.searchParams.set(param, t.value);
      window.history.replaceState(window.history.state, "", url);
      window.dispatchEvent(new Event(EVENT));
    };

    sync();
    set.addEventListener("change", choose);
    window.addEventListener("popstate", sync);
    window.addEventListener(EVENT, sync);
    return () => {
      set.removeEventListener("change", choose);
      window.removeEventListener("popstate", sync);
      window.removeEventListener(EVENT, sync);
    };
  }, [fieldsetId, rootId, param, attr, key]);
  return null;
}
