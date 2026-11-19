import { STRUCTURE_LABEL } from "@/lib/labels";
import { STRUCTURES } from "@/lib/schemas/common";
import { VariantSwitch } from "./variant-switch";

export function StructureSwitch({ rootId }: { rootId: string }) {
  return (
    <VariantSwitch
      rootId={rootId}
      param="structure"
      attr="data-structure"
      label="Capital structure"
      options={STRUCTURES.map((s) => ({ value: s, label: STRUCTURE_LABEL[s] }))}
    />
  );
}
