"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, type ComponentProps, type ReactNode } from "react";

// The header's client island: the two things the server cannot know or do. Which link is the
// page the reader is on (the address), and closing the menu when it should close. The header
// itself, its lists and its icons are a server component (components/site-header.tsx) and
// ship no script; this file is what a page loads for it.

type IsCurrent = (href: string, exact: boolean) => boolean;
const CurrentPage = createContext<IsCurrent>(() => false);

// HeaderPath: reads the address once for every link in the header. `sectionOf` maps a record
// page that lives under another section's path to that section ("/playbooks/<a situation>" is
// in "/situations"); the layout builds it from the catalog. It renders its children as they
// are, so the server's header stays the page's <header>.
export function HeaderPath({ sectionOf, children }: { sectionOf?: Readonly<Record<string, string>>; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isCurrent = useMemo<IsCurrent>(() => {
    const section = sectionOf?.[pathname];
    return (href, exact) => (exact ? pathname === href : section ? section === href : pathname === href || pathname.startsWith(`${href}/`));
  }, [pathname, sectionOf]);
  return <CurrentPage value={isCurrent}>{children}</CurrentPage>;
}

// NavLink: a link that carries aria-current="page" when it is the page (or, for a section,
// holds the page) the reader is on. The server renders it with the right state, so it is
// right with scripts off too. Its look, the current state included, is the caller's classes.
// `exact` matches the address alone; without it a section matches everything under it.
export function NavLink({ href, exact = false, ...rest }: Omit<ComponentProps<typeof Link>, "href" | "aria-current"> & { href: string; exact?: boolean }) {
  const on = useContext(CurrentPage)(href, exact);
  return <Link href={href} aria-current={on ? "page" : undefined} {...rest} />;
}

// MenuBehavior: closes the header's menu (the <details> with this id) when the reader goes
// somewhere, presses Escape (focus returns to the menu button), moves focus out of it, or
// presses outside it. Without scripts the menu still opens and closes from its own button.
export function MenuBehavior({ menuId }: { menuId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const d = document.getElementById(menuId);
    if (!(d instanceof HTMLDetailsElement)) return;
    const close = (refocus: boolean) => {
      if (!d.open) return;
      d.open = false;
      if (refocus) d.querySelector("summary")?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node && !d.contains(next)) close(false);
    };
    // A link in the menu was followed: to another page, to this one, or to the search palette.
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("a")) close(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !d.contains(e.target)) close(false);
    };
    d.addEventListener("keydown", onKey);
    d.addEventListener("focusout", onFocusOut);
    d.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      d.removeEventListener("keydown", onKey);
      d.removeEventListener("focusout", onFocusOut);
      d.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onPointerDown);
      // The reader went to another page: whatever was open closes.
      d.open = false;
    };
  }, [menuId, pathname]);

  return null;
}
