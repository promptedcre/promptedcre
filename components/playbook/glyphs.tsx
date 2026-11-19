import { GateGlyph, Icon, type GateKind } from "@/components/ui";

// The marks a step carries besides who does it. Each is a drawn glyph and a word, so none
// rests on its color: a pen for a signature, a half diamond for hard to undo, a filled
// diamond for irreversible (GateGlyph, components/ui), and the risk triangle from the icon
// set for a high-risk step. The glyph carries the color; the word is neutral ink.

// Gate: one gate with its word, shown or kept for a screen reader only.
export function Gate({ kind, label = true }: { kind: GateKind; label?: boolean }) {
  return <GateGlyph kind={kind} showLabel={label} />;
}

// RiskFlag: "High risk", with the triangle.
export function RiskFlag({ label = true }: { label?: boolean }) {
  return (
    <span className="type-label inline-flex items-center gap-1.5 whitespace-nowrap text-text" title={label ? undefined : "High risk"}>
      <Icon name="risk" className="text-danger" />
      {label ? "High risk" : <span className="sr-only">High risk</span>}
    </span>
  );
}
