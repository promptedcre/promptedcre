import { useId } from "react";

// The specimens' stand-in devices. Server components, no script. Each is drawn in SVG or
// with a border so it prints, takes its color from a token, and follows the motion
// contract (docs/MOTION.md): data-ink for what goes from pencil to ink, data-draw for what
// the ink draws. Where a drawn line should show in pencil before it is inked, the device
// carries the pencil line as a second element under the ink (class sp-pencil): it shows
// only while the step is in pencil, and the ink is drawn over it.

/** Who does a step: a solid block for the agent, the same block with its corner cut for a person. */
export function SpecimenMark({ person, className }: { person: boolean; className?: string }) {
  return (
    <svg
      data-ink=""
      viewBox="0 0 14 18"
      className={`sp-mark ${person ? "sp-mark--person" : "sp-mark--agent"}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={person ? "M1 1H8L13 6V17H1Z" : "M1 1H13V17H1Z"} />
    </svg>
  );
}

const CHECK = "M2.5 8.5L6.5 12.5L13.5 4";

/** A check stroke that draws itself: the generic SVG drawable (pathLength="1" and data-draw), over its pencil line. */
export function SpecimenCheck() {
  return (
    <svg viewBox="0 0 16 16" className="sp-check" aria-hidden="true" focusable="false">
      <path className="sp-pencil" d={CHECK} />
      <path d={CHECK} pathLength="1" data-draw="" />
    </svg>
  );
}

function Arrowhead() {
  return (
    <svg viewBox="0 0 7 10" focusable="false">
      <path d="M0 0V10L7 5Z" fill="currentColor" />
    </svg>
  );
}

/**
 * A connector between two positions, as a step of its own: a line with a head, drawn by
 * a wipe (down the page in one column, across it in the handoff's row from 768 px) over
 * its pencil line, and the word "Then", which inks when the line has arrived. The head
 * sits at the far end, so the wipe uncovers it last. Decoration: the order of the list
 * says the same thing, so it is hidden from a screen reader.
 */
export function SpecimenConnector({ step, toPerson = false, propertyLine = false }: { step: string; toPerson?: boolean; propertyLine?: boolean }) {
  return (
    <li data-seq-step={step} aria-hidden="true" className={`sp-conn ${toPerson ? "text-human" : "text-accent"}`}>
      {propertyLine && <span className="sp-pline" />}
      <span className="sp-conn-track">
        <span className="sp-conn-line sp-pencil">
          <Arrowhead />
        </span>
        <span data-draw="" className="sp-conn-line">
          <Arrowhead />
        </span>
      </span>
      <span data-ink="text" className={`sp-conn-word type-note ${toPerson ? "text-human-text" : "text-accent"}`}>
        Then
      </span>
    </li>
  );
}

/**
 * A ruled line that is drawn from the left: the generic wipe (data-draw="x") over a dashed
 * pencil line. `sign` makes it the line a person signs on.
 */
export function SpecimenRule({ sign = false }: { sign?: boolean }) {
  return (
    <span className={sign ? "sp-under sp-under--sign" : "sp-under"} aria-hidden="true">
      <span data-draw="x" />
    </span>
  );
}

/**
 * A stand-in for the revision cloud: scallops around its positioned parent, drawn
 * clockwise from the top left as --draw goes from 0 to 1, over the same outline in pencil.
 * The pencil outline shows for as long as the ink has not gone all the way round (its
 * opacity is worked out from --draw), so it needs nothing from the step it sits in.
 *
 * Two ways to place it, the two ways a real cloud can sit in a sequence:
 *   - by itself (the default): the SVG is the drawable, and it goes inside the step that
 *     draws it (the handoff specimen);
 *   - `wrapped`: the positioned parent is the drawable (it carries data-draw, and the SVG
 *     reads --draw from it), the way components/ui's RevisionCloud wraps what it circles.
 *     A step inside claims it with data-seq-draws="around" (the scene specimen).
 *
 * It is one SVG with no viewBox, so its units are CSS pixels and nothing stretches. The
 * scallops are a row of round dots along a rectangle (a dashed stroke with round caps),
 * joined to the rectangle's body and then outlined by cutting a slightly smaller copy out
 * of the middle; the pen is a second mask, a plain stroke around the same rectangle whose
 * dash follows --draw. The sizes live in specimen-styles.tsx (.sp-cloud-*).
 */
export function SpecimenCloud({ wrapped = false }: { wrapped?: boolean }) {
  const id = useId();
  const shape = `${id}-cloud-shape`;
  const pen = `${id}-cloud-pen`;
  return (
    <svg data-draw={wrapped ? undefined : ""} className="sp-cloud" aria-hidden="true" focusable="false">
      <defs>
        <mask id={shape} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <rect className="sp-cloud-body" fill="white" />
          <rect className="sp-cloud-lobes" stroke="white" />
          <rect className="sp-cloud-body sp-cloud-cut" fill="black" />
          <rect className="sp-cloud-lobes sp-cloud-cut" stroke="black" />
        </mask>
        <mask id={pen} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <rect className="sp-cloud-pen" pathLength="1" stroke="white" />
        </mask>
      </defs>
      <rect className="sp-cloud-pencil" width="100%" height="100%" mask={`url(#${shape})`} />
      <g mask={`url(#${pen})`}>
        <rect className="sp-cloud-ink" width="100%" height="100%" mask={`url(#${shape})`} />
      </g>
    </svg>
  );
}

/** The glyph inside a score box: a check for clear, a slash for a finding. Hatching, not a glyph, says unverified. */
export function SpecimenBoxGlyph({ outcome }: { outcome: string }) {
  const d = outcome === "clear" ? "M3 8.5L6.5 12L13 4.5" : outcome === "finding" ? "M4 12.5L12 3.5" : null;
  if (!d) return null;
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={d} pathLength="1" data-draw="" />
    </svg>
  );
}
