import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

// Sheet: a drawing. One 1 px border on the sheet's paper (--bg-raised), an optional head with
// the sheet's title, the drawing area, and one title block along the bottom edge. Inside it
// there are rules, never another box: divide it with SheetPart, not with a bordered panel. A
// Sheet placed inside a Sheet loses its border and becomes a part of it.
//
// `grid` draws the drafting grid in the drawing area. The grid belongs to drawings (a board, a
// figure, a plan) and nowhere else: prose, lists and forms sit on plain ground. A Sheet sets
// --dim-surface to its paper, so a dimension label or the property line's label breaks its
// line cleanly inside it.
export function Sheet({
  as: Tag = "section",
  title,
  titleId,
  level = 3,
  note,
  actions,
  grid = false,
  flush = false,
  titleBlock,
  footer,
  id,
  label,
  labelledBy,
  className,
  bodyClassName,
  style,
  children,
}: {
  as?: "section" | "article" | "figure" | "div";
  /** The sheet's title, in the head (type-title-m). */
  title?: ReactNode;
  titleId?: string;
  level?: 2 | 3 | 4;
  /** A quiet line to the right of the title. */
  note?: ReactNode;
  /** Controls to the right of the title. */
  actions?: ReactNode;
  /** The drawing area carries the drafting grid. */
  grid?: boolean;
  /** No padding on the drawing area: the children lay themselves out (SheetPart rows, a table). */
  flush?: boolean;
  /** One TitleBlock, drawn as the sheet's bottom edge. */
  titleBlock?: ReactNode;
  /** A last quiet line under everything (a caption, where the figures come from). */
  footer?: ReactNode;
  id?: string;
  label?: string;
  labelledBy?: string;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const H = `h${level}` as const;
  const head = title || note || actions;
  return (
    <Tag
      id={id}
      aria-label={label}
      aria-labelledby={labelledBy ?? (title && titleId ? titleId : undefined)}
      className={cx("sheet", className)}
      style={style}
    >
      {head && (
        <div className="sheet-head">
          {title && (
            <H id={titleId} className="sheet-title">
              {title}
            </H>
          )}
          {(note || actions) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              {note && <p className="sheet-note">{note}</p>}
              {actions}
            </div>
          )}
        </div>
      )}
      <div className={cx(flush ? "min-w-0" : "sheet-body", grid && "sheet-grid", bodyClassName)}>{children}</div>
      {titleBlock && <div className="sheet-tb">{titleBlock}</div>}
      {footer && <div className="sheet-foot">{footer}</div>}
    </Tag>
  );
}

// SheetPart: a ruled part of a Sheet (use it with `flush` on the Sheet). The first part has no
// rule above it; every later one is ruled off the part before. It replaces the bordered panel
// that used to sit inside a bordered panel.
export function SheetPart({
  as: Tag = "div",
  grid = false,
  reveal = false,
  className,
  children,
}: {
  as?: "div" | "section" | "li";
  grid?: boolean;
  /** Come into focus once as it enters the screen (data-reveal, components/motion/page-motion.tsx). */
  reveal?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag data-reveal={reveal ? "" : undefined} className={cx("sheet-part", grid && "sheet-grid", className)}>
      {children}
    </Tag>
  );
}
