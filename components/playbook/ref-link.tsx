import type { ReactNode } from "react";
import { cx } from "@/components/ui";

// RefLink: a link in a list of references (a step's rules and its sources, the step a cost
// belongs to, the steps that use a rule). It is the foundation's link in the link ink
// (.link .link--accent, app/globals.css) without the standing underline: in a list where
// every line is a link, the ink and the place say so, and the underline arrives on hover
// and on keyboard focus. In running text use TextLink, which keeps its underline.
//
// It is one line of text, so where the pointer is a finger its hit area is made 44 px tall
// without moving anything (.ref-link, in ./page-styles).
export function RefLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      rel={/^https?:\/\//.test(href) ? "noreferrer" : undefined}
      className={cx("ref-link link link--accent no-underline hover:underline focus-visible:underline", className)}
    >
      {children}
    </a>
  );
}
