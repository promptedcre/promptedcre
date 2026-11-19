import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

type Variant = "primary" | "secondary" | "quiet";
type Size = "md" | "sm";

// The look lives in app/globals.css (.btn): primary is filled with dark ink, secondary is
// outlined, quiet is text alone. Every size is at least 44 px tall under 768 px, where it is
// tapped; from 768 px md is 40 px and sm 32 px. Hover takes --fill-hover, never white.
// `className` is for layout; a height utility on it still wins over the class.
function classes(variant: Variant, size: Size, className?: string) {
  return cx("btn", `btn--${variant}`, size === "sm" && "btn--sm", className);
}

// Arrow: the drawn arrow from the icon set, the way a drawing points.
export function Arrow({ className }: { className?: string }) {
  return <Icon name="arrow-right" className={className} />;
}

// Button: an action that stays on the page (copy, replay, open). One primary per screenful.
// Not for going somewhere: use ButtonLink, so it is a real link that works with scripts off.
export function Button({
  variant = "primary",
  size = "md",
  arrow = false,
  className,
  children,
  type = "button",
  ...rest
}: Omit<ComponentProps<"button">, "className" | "children"> & {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button type={type} className={classes(variant, size, className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

// ButtonLink: a link that looks like a button, for the one or two actions a section asks for.
// Not for links inside running text: use TextLink. Only one primary per screenful.
// `aria-current="page"` marks the control for the page the reader is on.
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  arrow = true,
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}) {
  const cls = classes(variant, size, className);
  const inner = (
    <>
      {children}
      {arrow && <Arrow />}
    </>
  );
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={cls} rel="noreferrer" {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {inner}
    </Link>
  );
}

const LINK_TONE = {
  text: "",
  accent: "link--accent",
  muted: "link--muted",
} as const;

// TextLink: an underlined link in running text or a row (.link in app/globals.css): the ink of
// the text with a drafting-blue underline, its offset and thickness from the tokens. External
// URLs open as plain anchors. Not for primary actions: use ButtonLink. `mono` sets it in Plex
// Mono, for a URL or an id.
export function TextLink({
  href,
  children,
  tone = "text",
  mono = false,
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: keyof typeof LINK_TONE;
  mono?: boolean;
  className?: string;
}) {
  const cls = cx("link", LINK_TONE[tone], mono && "link--mono", className);
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={cls} rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
