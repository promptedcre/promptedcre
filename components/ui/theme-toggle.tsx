"use client";

import { useEffect } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

type Theme = "night" | "paper";

// The saved choice. The head script in app/layout.tsx reads the same key before the first paint;
// __tests__/tokens.test.ts fails if the two spellings ever differ.
const KEY = "pcre-theme";

const isTheme = (v: unknown): v is Theme => v === "night" || v === "paper";

/** The theme every visitor starts on, whatever the system asks for (D218): Paper. */
function systemTheme(): Theme {
  return "paper";
}

/** The theme on screen now. The stylesheet is the authority: each theme sets color-scheme. */
function shownTheme(): Theme {
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  if (scheme === "light") return "paper";
  if (scheme === "dark") return "night";
  const chosen = document.documentElement.getAttribute("data-theme");
  return isTheme(chosen) ? chosen : systemTheme();
}

// The browser's own surfaces (a phone's address bar) take their color from the theme-color
// metas in the layout, which follow the system. When the visitor's choice is the other theme,
// one more meta, first in the head, names that theme's ground, read from the live --bg token.
function syncBrowserChrome() {
  const root = document.documentElement;
  const mine = document.head.querySelector<HTMLMetaElement>("meta[data-theme-choice]");
  if (!isTheme(root.getAttribute("data-theme"))) {
    mine?.remove();
    return;
  }
  const ground = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (!ground) return;
  const meta = mine ?? document.createElement("meta");
  meta.name = "theme-color";
  meta.content = ground;
  if (!mine) {
    meta.setAttribute("data-theme-choice", "");
    document.head.prepend(meta);
  }
}

/** Draw `choice`, or go back to the system's theme when it is null. Every color lands at once. */
function draw(choice: Theme | null) {
  const root = document.documentElement;
  root.setAttribute("data-theme-turning", "");
  if (choice) root.setAttribute("data-theme", choice);
  else root.removeAttribute("data-theme");
  // Settle the new colors while transitions are off, then let them run again.
  getComputedStyle(root).getPropertyValue("color");
  requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-theme-turning")));
  syncBrowserChrome();
}

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

function turnTo(next: Theme, from?: { x: number; y: number }) {
  // A choice that matches the default is no choice: forget it, and start from Paper again.
  const choice = next === systemTheme() ? null : next;
  try {
    if (choice) window.localStorage.setItem(KEY, choice);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage is off (a private window, a blocked cookie jar): the choice holds for this page.
  }
  // D224: the new theme spreads in a circle from where it was asked for, through the browser's
  // own view transition. Without one, or with reduced motion, it lands at once, as before.
  const doc = document as ViewTransitionDoc;
  const full = document.documentElement.getAttribute("data-motion") === "full";
  if (!from || !full || typeof doc.startViewTransition !== "function") {
    draw(choice);
    return;
  }
  const r = Math.hypot(Math.max(from.x, window.innerWidth - from.x), Math.max(from.y, window.innerHeight - from.y));
  const vt = doc.startViewTransition(() => draw(choice));
  vt.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${r}px at ${from.x}px ${from.y}px)`] },
        { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
}

// ThemeToggle: the switch between Night and Paper, for the header. One quiet button that says
// what it will do: an arrow, a small sheet in the ink of the text (so on Night it is a light
// sheet and on Paper a dark one: the paper it turns to), and the theme's name, "Paper" while
// Night is on screen and "Night" while Paper is. The arrow keeps it an action beside any label
// ("Theme" next to a bare "Paper" would read as the theme that is on). Its accessible name
// states the theme that is on: "Night theme. Switch to Paper".
//
// It needs no state. Both names are rendered and the stylesheet shows the one for the theme on
// screen (.theme-toggle in app/globals.css), so the server's HTML is already right, the word is
// right before React arrives, and nothing shifts when it does. With scripts off it is not
// drawn: the page is Paper.
//
// It starts from Paper, for every visitor (D218; `systemTheme` names that start). Turning to
// Night saves the choice (localStorage "pcre-theme") and sets <html data-theme>; turning back to
// Paper clears the choice, which is "the default" without a third state.
// `className` is for layout only.
export function ThemeToggle({ className }: { className?: string }) {
  useEffect(() => {
    syncBrowserChrome();
    // Another tab changed the choice: draw it here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) draw(isTheme(e.newValue) ? e.newValue : null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <button
      type="button"
      title="Switch between the Night and Paper themes"
      className={cx("theme-toggle btn btn--quiet btn--sm", className)}
      onClick={(e) => {
        // A key press has no pointer: the circle starts from the button's own centre.
        const box = e.currentTarget.getBoundingClientRect();
        const from = e.detail === 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: e.clientX, y: e.clientY };
        turnTo(shownTheme() === "paper" ? "night" : "paper", from);
      }}
    >
      <Icon name="arrow-right" />
      <i aria-hidden="true" className="theme-sheet" />
      <span className="theme-toggle-faces">
        <span data-face="night">
          <span className="sr-only">Night theme. Switch to </span>
          Paper
        </span>
        <span data-face="paper">
          <span className="sr-only">Paper theme. Switch to </span>
          Night
        </span>
      </span>
    </button>
  );
}
