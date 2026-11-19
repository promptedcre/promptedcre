import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

const TONE = {
  note: "",
  agent: "callout--agent",
  person: "callout--person",
  warn: "callout--warn",
  risk: "callout--risk",
} as const;

// Callout: a note set apart from the text around it: an icon, and what it says. No colored
// side stripe and no box. The icon carries the tone (blue for a note, amber for a person's
// reason, red for a risk); the words stay in the reading ink. `icon` is a name from the icon
// set, or any mark (a RoleMark with its label hidden, for "why a person does it").
export function Callout({
  icon = "info",
  tone = "note",
  title,
  children,
  className,
}: {
  icon?: IconName | ReactElement;
  tone?: keyof typeof TONE;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("callout", TONE[tone], className)}>
      <span className="callout-icon" aria-hidden="true">
        {typeof icon === "string" ? <Icon name={icon} /> : icon}
      </span>
      <div className="callout-body">
        {title && <p className="callout-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
