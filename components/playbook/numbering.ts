import { applicableSteps, DEFAULT_VARIANT } from "@/lib/compute/variant";
import type { Structure } from "@/lib/schemas/common";
import type { Playbook } from "@/lib/schemas/playbook";

// How a record's steps are numbered on its page: per structure, in step order, at the
// default property type and jurisdictions. The step cards, the list of steps above them and
// the board all number from here, so "07" names the same step wherever it is written.

export type Numbers = Partial<Record<Structure, number>>;

export const viewOf = (structure: Structure) => ({ ...DEFAULT_VARIANT, structure });

// Each step's number in each structure it applies to. Structures the record was not written
// for number nothing, and a step that applies in no structure at the default jurisdictions
// (a Delaware step, say) has no entry at all.
export function stepNumbers(pb: Playbook): Map<string, Numbers> {
  const out = new Map<string, Numbers>();
  for (const structure of pb.written.structure) {
    applicableSteps(pb, viewOf(structure)).forEach((step, i) => {
      out.set(step.id, { ...(out.get(step.id) ?? {}), [structure]: i + 1 });
    });
  }
  return out;
}
