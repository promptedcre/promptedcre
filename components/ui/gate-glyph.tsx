import type { ReactNode } from "react";
import { cx } from "./cx";

export type GateKind = "signature" | "irreversible" | "hard-to-undo";

const GATE: Record<GateKind, { word: string; tone: string; path: ReactNode }> = {
  signature: {
    word: "Signature",
    tone: "text-human",
    path: (
      <path
        d="M2 14l1.2-3.6L10.8 2.8a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2L5.6 12.8 2 14z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
  },
  irreversible: {
    word: "Irreversible",
    tone: "text-danger",
    path: <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="currentColor" />,
  },
  "hard-to-undo": {
    word: "Hard to undo",
    tone: "text-warn",
    path: (
      <>
        <path d="M8 2 14 8 8 14 2 8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 2 2 8l6 6z" fill="currentColor" />
      </>
    ),
  },
};

export const GATE_WORD: Record<GateKind, string> = {
  signature: GATE.signature.word,
  irreversible: GATE.irreversible.word,
  "hard-to-undo": GATE["hard-to-undo"].word,
};

// GatePath: a gate's shape alone, for a 16 x 16 viewBox. The one source of the three shapes:
// GateGlyph draws it inline, and the playbook page's sprite (components/playbook/glyphs.tsx)
// draws it once in a <symbol> that every row points to.
export function GatePath({ kind }: { kind: GateKind }) {
  return <>{GATE[kind].path}</>;
}

// The gates on a step, from its catalog fields, in reading order.
export function stepGates(step: { approval: string; undo: string }): GateKind[] {
  const out: GateKind[] = [];
  if (step.approval === "signature") out.push("signature");
  if (step.undo === "irreversible") out.push("irreversible");
  else if (step.undo === "hard-to-undo") out.push("hard-to-undo");
  return out;
}

// GateGlyph: a pen (signature), a filled diamond (irreversible) or a half diamond (hard to undo) on a
// person's step. The glyph carries the color; its word is neutral ink, shown or kept for a screen
// reader. Not a status chip: use Tag for "not live yet" and the like.
export function GateGlyph({
  kind,
  showLabel = true,
  className,
}: {
  kind: GateKind;
  showLabel?: boolean;
  className?: string;
}) {
  const g = GATE[kind];
  return (
    <span className={cx("type-label inline-flex items-center gap-1.5 whitespace-nowrap text-text", className)} title={showLabel ? undefined : g.word}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className={cx("size-3.5 flex-none", g.tone)}>
        {g.path}
      </svg>
      {showLabel ? g.word : <span className="sr-only">{g.word}</span>}
    </span>
  );
}
