import type { ReactNode } from "react";
import { cx } from "./cx";

type Box = "div" | "section" | "header" | "footer" | "article" | "nav" | "aside";

// Container: the page width, 1128 px of content inside a 1240 px frame, 20 px gutters on a phone.
// Wrap every page's content in one. Do not nest two; inside a Band, the Band already supplies one.
export function Container({
  children,
  className,
  as: Tag = "div",
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: Box;
  id?: string;
}) {
  return (
    <Tag id={id} className={cx("mx-auto w-full max-w-[1240px] px-5 md:px-10 lg:px-14", className)}>
      {children}
    </Tag>
  );
}

const BAND_TONE = {
  plain: "",
  raised: "border-y border-line-strong bg-raised",
  ruled: "border-y border-line-strong",
} as const;

// Band: a full-width stripe (a closing call, a "where it stands" strip) with a Container inside.
// Not for ordinary sections: those sit in the page's Container and are separated by space, not stripes.
export function Band({
  children,
  className,
  tone = "ruled",
  contained = true,
  id,
  label,
}: {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof BAND_TONE;
  contained?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <section id={id} aria-label={label} className={cx("w-full", BAND_TONE[tone], className)}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}
