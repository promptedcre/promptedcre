import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * @deprecated A kicker above a heading is banned (DIRECTION section 1). Until its last caller is
 * rebuilt this draws one plain line, sentence case in muted ink, so nothing it said is lost:
 * move the words into the heading line, the lede or the facts line and delete the call.
 */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  /** @deprecated Ignored: the line is muted ink. */
  tone?: "agent" | "accent" | "faint" | "human";
  className?: string;
}) {
  return <p className={cx("type-label text-muted", className)}>{children}</p>;
}

const HEADING_ROLE = {
  hero: "type-hero",
  page: "type-page",
  l: "type-title-l",
  m: "type-title-m",
  s: "type-title-s",
  // The old name for the home cover's size.
  xl: "type-hero",
} as const;
const DEFAULT_ROLE = { 1: "page", 2: "l", 3: "m", 4: "s" } as const;

// Heading: h1 to h4 in the type roles. By level: h1 type-page, h2 type-title-l, h3
// type-title-m, h4 type-title-s; `size="hero"` is the home h1 only. Keep heading levels in
// order on a page and use one h1; pick `size` for looks, `level` for structure.
export function Heading({
  level,
  size,
  children,
  id,
  className,
}: {
  level: 1 | 2 | 3 | 4;
  size?: keyof typeof HEADING_ROLE;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={cx("m-0 text-text", HEADING_ROLE[size ?? DEFAULT_ROLE[level]], className)}>
      {children}
    </Tag>
  );
}

// Lede: the one paragraph under a page's title (type-lede: muted ink, the prose measure).
// Not for ordinary body copy, which is type-body.
export function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("type-lede measure m-0", className)}>{children}</p>;
}
