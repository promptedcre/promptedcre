import type { Condition, Jurisdiction, PropertyType, Structure } from "../schemas/common";
import { PROPERTY_TYPES, STRUCTURES } from "../schemas/common";
import type { Playbook, Step } from "../schemas/playbook";

export type Variant = {
  structure: Structure;
  propertyType: PropertyType;
  jurisdictions: Jurisdiction[];
};

// v1 covers Federal + Texas; Delaware appears only where formation is the subject.
export const DEFAULT_JURISDICTIONS: Jurisdiction[] = ["us-federal", "us-tx"];

export const DEFAULT_VARIANT: Variant = {
  structure: "syndication",
  propertyType: "industrial",
  jurisdictions: DEFAULT_JURISDICTIONS,
};

export function allVariants(jurisdictions: Jurisdiction[] = DEFAULT_JURISDICTIONS): Variant[] {
  return STRUCTURES.flatMap((structure) =>
    PROPERTY_TYPES.map((propertyType) => ({ structure, propertyType, jurisdictions })),
  );
}

export function applies(when: Condition | undefined, v: Variant): boolean {
  if (!when) return true;
  if (when.structure && !when.structure.includes(v.structure)) return false;
  if (when.propertyType && !when.propertyType.includes(v.propertyType)) return false;
  if (when.jurisdiction && !when.jurisdiction.some((j) => v.jurisdictions.includes(j))) return false;
  return true;
}

export function applicableSteps(pb: Playbook, v: Variant): Step[] {
  return pb.steps.filter((s) => applies(s.when, v));
}

// A variant is researched when its structure and every jurisdiction in view were written.
export function isResearched(pb: Playbook, v: Variant): boolean {
  if (pb.depth !== "full") return false;
  if (!pb.written.structure.includes(v.structure)) return false;
  return v.jurisdictions.every((j) => pb.written.jurisdiction.includes(j) || j === "us-de");
}

// The view a record's Markdown copy is made for, and the one its page opens on: the default
// view when the record is written for it and has a step there, otherwise the same view in
// the first structure, in the catalog's order, that the record is written for and has a step
// in. null for an outline, and for a record with no such structure in the default coverage
// (Federal + Texas).
export function openingVariant(pb: Playbook): Variant | null {
  for (const structure of [DEFAULT_VARIANT.structure, ...STRUCTURES]) {
    const v: Variant = { ...DEFAULT_VARIANT, structure };
    if (isResearched(pb, v) && applicableSteps(pb, v).length > 0) return v;
  }
  return null;
}

// The structure of that view: the one a record's page opens on, and the one a page quotes
// when it prints a single figure for a record. The default structure where openingVariant
// has none to give.
export function openingStructure(pb: Playbook): Structure {
  return (openingVariant(pb) ?? DEFAULT_VARIANT).structure;
}

// The structures a record's page shows and lets a reader choose between: the ones it is
// written for and has a step in, in the catalog's order, so the first is openingStructure.
// A page never offers a view the record has no steps for.
export function writtenStructures(pb: Playbook): Structure[] {
  return STRUCTURES.filter((structure) => {
    const v: Variant = { ...DEFAULT_VARIANT, structure };
    return isResearched(pb, v) && applicableSteps(pb, v).length > 0;
  });
}

// Structures a step applies to, for the data-s attribute the switcher reads.
export function stepStructures(step: Step): Structure[] {
  return step.when?.structure ?? [...STRUCTURES];
}
