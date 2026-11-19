"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// The site's small, CSS-first motion (D224, the owner's BoardUI round), mounted once by the
// layout. None of it is GSAP and none of it hides anything from a reader without scripts, with
// reduced motion or on paper: the hidden "before" states in app/globals.css apply only under
// html.js[data-motion="full"], on screens.
//
//   - Reveals: an element with data-reveal comes into focus once (blur and fade to clear, a
//     few px of rise) as soon as any of it passes the bottom eighth of the screen, however tall
//     it is; data-revealed marks it done.
//   - The header lifts: <header data-scrolled> once the page is scrolled.
//   - Toasts: toast("Copied. ...") shows one short notice in a polite live region.

const TOAST_EVENT = "pcre:toast";
const TOAST_MS = 2600;

/** Show one short notice ("Copied. Paste it into your AI agent."). Safe to call anywhere. */
export function toast(text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { text } }));
}

function revealAll(root: ParentNode, io: IntersectionObserver | null) {
  root.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])").forEach((el) => {
    if (io) io.observe(el);
    else el.setAttribute("data-revealed", "");
  });
}

export function PageMotion() {
  const pathname = usePathname();
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);

  // Reveals: watch every data-reveal on the page, again after each client navigation.
  useEffect(() => {
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) continue;
                e.target.setAttribute("data-revealed", "");
                io?.unobserve(e.target);
              }
            },
            // Any part of it past the bottom eighth of the screen: a share threshold would never
            // be met by an element taller than the screen several times over.
            { threshold: 0, rootMargin: "0px 0px -12% 0px" },
          )
        : null;
    revealAll(document, io);
    // Content that arrives later (a fold opened, a filtered list) is watched too.
    const mo = new MutationObserver(() => revealAll(document, io));
    mo.observe(document.body, { childList: true, subtree: true });
    document.documentElement.setAttribute("data-reveal-ready", "");
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, [pathname]);

  // The header lifts once the page is scrolled.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("body > header");
    if (!header) return;
    const set = () => header.toggleAttribute("data-scrolled", window.scrollY > 8);
    set();
    window.addEventListener("scroll", set, { passive: true });
    return () => window.removeEventListener("scroll", set);
  }, []);

  // Toasts: one at a time; a new one replaces the last.
  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (!text) return;
      setNote({ id: Date.now(), text });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNote(null), TOAST_MS);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => {
      window.removeEventListener(TOAST_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="toast-region print:hidden" role="status" aria-live="polite">
      {note && (
        <p key={note.id} className="toast type-body-s m-0">
          {note.text}
        </p>
      )}
    </div>
  );
}
