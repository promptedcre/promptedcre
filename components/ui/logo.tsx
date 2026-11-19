import { LOGOS, logoLetters, logoSrc } from "@/lib/logos";
import { cx } from "./cx";
import { Icon } from "./icon";

const SIZE = { sm: ["logo--sm", 16], md: ["logo--md", 20], lg: ["logo--lg", 28] } as const;

// Logo: a company's own icon, from lib/logos.ts (D218), always beside its name in text. It is
// decoration (aria-hidden, empty alt): the name next to it is the label, so an icon is never
// the only way to tell what something is. With no icon on file it draws a letter tile of ours;
// `government` draws one neutral glyph of ours instead (a seal is never used).
export function Logo({
  id,
  name,
  size = "md",
  government = false,
  className,
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZE;
  government?: boolean;
  className?: string;
}) {
  const [sizeClass, px] = SIZE[size];
  const src = logoSrc(id);
  if (src) {
    const entry = LOGOS[id];
    return (
      <span aria-hidden="true" className={cx("logo", sizeClass, entry?.light && "logo--light", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a 128 px file shown at 16 to 28 px; no resizing service needed */}
        <img src={src} alt="" width={px} height={px} loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cx("logo logo--tile", sizeClass, className)}>
      {government ? <Icon name="agency" /> : size === "sm" ? logoLetters(name).slice(0, 1) : logoLetters(name)}
    </span>
  );
}
