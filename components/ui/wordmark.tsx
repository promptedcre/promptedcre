import Link from "next/link";
import { site } from "@/lib/site";
import { cx } from "./cx";

// The slabs of the mark on its 22 px grid: five floors that step out and back as a prompt's
// caret (the agent's steps, in the agent's ink), and a sixth at ground level, the cursor, in
// the person's ink with the person's cut corner: where the agent stops and a person signs.
// Concept 1 of 2026-11-15, finished in the drawing set's notation (D218). app/icon.svg and
// app/favicon.ico draw the same geometry at their own sizes.
const SLABS = [1, 4, 7, 4, 1].map((x, i) => ({ x, y: 1.5 + i * 4 }));
const CURSOR = "M13 17.5H19.5L21 19V20.5H13Z";

export function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className={cx("flex-none", className)}>
      {SLABS.map((s) => (
        <rect key={s.y} x={s.x} y={s.y} width="8" height="3" style={{ fill: "var(--agent)" }} />
      ))}
      <path d={CURSOR} style={{ fill: "var(--human)" }} />
    </svg>
  );
}

// Wordmark: the mark and the name, PromptedCRE, linking home. Header and footer only. Not a
// logo to repeat in content; in running text write the product name. Its lettering
// (.wordmark in app/globals.css) is the brand's own, outside the type roles: "Prompted" at
// the brand's weight, "CRE" lighter. The caller sets only its size.
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label={`${site.name} home`} className={cx("wordmark", className)}>
      <BrandMark />
      <span>
        {site.wordmark.left}
        <span className="wordmark-light">{site.wordmark.right}</span>
      </span>
    </Link>
  );
}
