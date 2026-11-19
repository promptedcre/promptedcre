import { Children, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { REVIEW_LABEL } from "@/lib/labels";
import type { Review } from "@/lib/schemas/common";

type Tone = "muted" | "accent" | "agent" | "human" | "danger" | "warn";

// Chips in the drawing-set language (.tag in app/globals.css): a fact or a state in a ruled
// 2 px chip, sentence case, type-label. The frame and the square carry the color; the word
// is neutral ink. Solid for a fact, dashed for "not yet" or a variant, amber dashed for
// "not live yet". `warn` is a finding or "hard to undo", never a neutral label; `danger` is
// the redline (a refusal, act within hours).

// A chip reads in sentence case: a status passed in lower case ("tested", "check date") starts
// with a capital. Only a leading string is touched; a chip that opens with markup is left as it is.
function sentence(children: ReactNode): ReactNode {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (typeof children === "string") return cap(children);
  // toArray keys every element, so the rebuilt list renders without key warnings
  const parts = Children.toArray(children);
  return typeof parts[0] === "string" ? [cap(parts[0]), ...parts.slice(1)] : children;
}

// Tag: a small chip for a fact or a state. `dashed` marks "not yet" (outlined, not live,
// planned); `dot` adds a filled square in the tone's color, for a status. Not for who does a
// step: use RoleMark. Not for a person's review: use Stamp (or ReviewChip in a list).
export function Tag({
  children,
  tone = "muted",
  title,
  dashed = false,
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
  dashed?: boolean;
  dot?: boolean;
}) {
  return (
    <span title={title} className={cx("tag", `tag--${tone}`, dashed && "tag--dashed")}>
      {dot && <span aria-hidden className="tag-dot" />}
      {sentence(children)}
    </span>
  );
}

// ReviewChip: how far a record has been reviewed. A person's review has one color everywhere it
// is said (the drafting blue: this chip, the ledger, the stamp), never a lane color; AI-drafted
// is a dashed neutral outline. Show it once per record, not on every row of a list.
export function ReviewChip({ review }: { review: Review }) {
  return review === "ai-drafted" ? (
    <Tag dashed title="Review status">
      {REVIEW_LABEL[review]}
    </Tag>
  ) : (
    <Tag tone="accent" dot title="Review status">
      {REVIEW_LABEL[review]}
    </Tag>
  );
}
