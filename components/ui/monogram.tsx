import { cx } from "./cx";

const SIZE = { sm: "monogram--sm", md: "monogram--md", lg: "monogram--lg" } as const;

// Monogram: our own two-letter tile (CC, Cl, GP, Cx), for where a tile of ours is wanted. A
// company's own icon is drawn by Logo (D218). Always beside the product's name in text; never
// alone as the only label, and never a third-party mark.
// `active` gives the tile the agent's line (a host that was tested); the letters stay neutral ink.
export function Monogram({
  children,
  size = "md",
  active = false,
  className,
}: {
  children: string;
  size?: keyof typeof SIZE;
  active?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cx("monogram", SIZE[size], active && "monogram--active", className)}>
      {children}
    </span>
  );
}
