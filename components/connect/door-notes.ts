import type { Playbook } from "@/lib/schemas/playbook";

export type DoorId = "start" | "audit";

// The short line under each door's name, from the copy deck. The audit door's
// count is measured from the written audit: how many checks it has, and how many
// of them cite a public source (the copy says "cited checks" only when all do).
export function doorNotes(playbooks: readonly Playbook[]): Record<DoorId, string> {
  const audit = playbooks
    .filter((p) => p.kind === "audit" && p.depth === "full")
    .sort((a, b) => a.order - b.order)[0];
  let auditNote = "Check where the entity stands, and get a list of what to fix.";
  if (audit) {
    const checks = audit.steps.length;
    const cited = audit.steps.filter((s) => s.basis === "cited").length;
    auditNote =
      cited === checks
        ? `${checks} cited checks of the entity's standing, and a list of what to fix.`
        : `${checks} checks of the entity's standing, ${cited} of them cited, and a list of what to fix.`;
  }
  return {
    start: "Form the entity, raise, and buy the first property, in order.",
    audit: auditNote,
  };
}
