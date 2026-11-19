import { cx } from "./cx";

// The one drawn icon set. Every chevron, plus, copy, check, arrow, search, menu, close, print,
// download, external and risk mark on the site comes from here: never a text glyph, never a
// second hand-drawn svg. Each icon is drawn on a 16 x 16 grid as open strokes; the `icon`
// class (app/globals.css) sets a 1.5 px stroke with square caps in the current text color,
// and keeps it 1.5 px at either size.
const ICONS = {
  "arrow-right": ["M3 8h9.5", "M9 4l4 4-4 4"],
  "arrow-left": ["M13 8H3.5", "M7 4L3 8l4 4"],
  "arrow-down": ["M8 3v9.5", "M4 9l4 4 4-4"],
  "arrow-up": ["M8 13V3.5", "M4 7l4-4 4 4"],
  "chevron-right": ["M6 3.5L10.5 8 6 12.5"],
  "chevron-left": ["M10 3.5L5.5 8l4.5 4.5"],
  "chevron-down": ["M3.5 6L8 10.5 12.5 6"],
  "chevron-up": ["M3.5 10L8 5.5l4.5 4.5"],
  plus: ["M8 3.5v9", "M3.5 8h9"],
  minus: ["M3.5 8h9"],
  close: ["M4 4l8 8", "M12 4l-8 8"],
  check: ["M3.5 8.5l3 3 6-7"],
  copy: ["M6 5V2.75h7.25V10H11", "M2.75 5.75h7.5v7.5h-7.5z"],
  search: ["M11.25 7a4.25 4.25 0 1 1-8.5 0 4.25 4.25 0 0 1 8.5 0z", "M10.25 10.25l3 3"],
  menu: ["M2.75 4.5h10.5", "M2.75 8h10.5", "M2.75 11.5h10.5"],
  print: ["M4.75 5.5V2.75h6.5V5.5", "M4.75 11.25h-2v-5.5h10.5v5.5h-2", "M4.75 9.25h6.5v4h-6.5z"],
  download: ["M8 2.75v7", "M4.75 6.75L8 10l3.25-3.25", "M2.75 13.25h10.5"],
  external: ["M4.5 11.5L11 5", "M6 4.5h5.5V10"],
  file: ["M3.75 2.75h5.5l3 3v7.5h-8.5z", "M9.25 2.75v3h3"],
  calendar: ["M2.75 4.25h10.5v9H2.75z", "M2.75 7.25h10.5", "M5.5 2.5V5", "M10.5 2.5V5"],
  // The risk mark: a triangle, so "High risk" never rests on its color.
  risk: ["M8 2.5l6 10.75H2z", "M8 6.75v3", "M8 11.4v.2"],
  // A note: square, like everything else here.
  info: ["M2.75 2.75h10.5v10.5H2.75z", "M8 7.9v2.6", "M8 5.2v.1"],
  play: ["M5 3.25L12.25 8 5 12.75z"],
  pause: ["M5.75 3.5v9", "M10.25 3.5v9"],
  replay: ["M3.67 5.5a5 5 0 1 1-.65 2.94", "M3.25 2.5v3.25H6.5"],
  // A public agency: a pediment, three columns and a base. Ours, never a seal.
  agency: ["M2.5 6L8 2.75 13.5 6z", "M4.5 7.75v4", "M8 7.75v4", "M11.5 7.75v4", "M2.5 13.25h11"],
  // The search palette's kinds (D224): a playbook's steps, a scenario's jolt, a calculator, a
  // rule's scale, a ranked market's grid, and the connector's plug.
  steps: ["M6 4h7.25", "M6 8h7.25", "M6 12h7.25", "M2.75 4h1", "M2.75 8h1", "M2.75 12h1"],
  bolt: ["M9.25 2.5L4 9h4l-1.25 4.5L12 7H8z"],
  calculator: ["M3.75 2.75h8.5v10.5h-8.5z", "M5.5 5h5", "M5.5 8h1", "M7.5 8h1", "M9.5 8h1", "M5.5 10.75h1", "M7.5 10.75h1", "M9.5 10.75h1"],
  scale: ["M8 2.75v10.5", "M4.5 13.25h7", "M3.25 5h9.5", "M3.25 5L1.75 9h3z", "M12.75 5l-1.5 4h3z"],
  grid: ["M2.75 2.75h4.5v4.5h-4.5z", "M8.75 2.75h4.5v4.5h-4.5z", "M2.75 8.75h4.5v4.5h-4.5z", "M8.75 8.75h4.5v4.5h-4.5z"],
  plug: ["M6 2.75v3", "M10 2.75v3", "M4.5 5.75h7v2.5a3.5 3.5 0 0 1-7 0z", "M8 11.75v1.5"],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

/** Every icon in the set, for a specimen page. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

// Icon: one icon from the set, 16 px (beside text) or 20 px (in a 44 px control). Decoration by
// default (aria-hidden): the control or the words beside it carry the name. Give `label` only
// when the icon stands alone. `draw` marks it as a drawable device: its strokes follow --draw
// (0 not drawn, 1 drawn), which is how "Copy" redraws as a check.
export function Icon({
  name,
  size = 16,
  label,
  draw = false,
  className,
}: {
  name: IconName;
  size?: 16 | 20;
  label?: string;
  draw?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      focusable="false"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-draw={draw ? "" : undefined}
      className={cx("icon", className)}
    >
      {ICONS[name].map((d) => (
        <path key={d} d={d} pathLength={draw ? 1 : undefined} />
      ))}
    </svg>
  );
}
