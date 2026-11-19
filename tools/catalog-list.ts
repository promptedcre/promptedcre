// Prints the catalog as a Markdown title list for review (Gate B).
//   npx tsx tools/catalog-list.ts > catalog.md
import { getCorpus } from "../lib/content/load";
import { PHASE_LABEL, URGENCY_LABEL } from "../lib/labels";
import { PHASES } from "../lib/schemas/playbook";

const { playbooks, rules } = getCorpus();
const processes = playbooks.filter((p) => p.kind === "process");
const situations = playbooks.filter((p) => p.kind === "situation");
const full = playbooks.filter((p) => p.depth === "full");

// An outline's step titles, when it has them, print under it so the review copy
// shows every outline's planned steps, not only the audits'.
const stepTitles = (p: { outlineSteps: string[] }) => p.outlineSteps.map((title) => `  - ${title}`);

const lines: string[] = [
  "# Prompted CRE v3: catalog for review",
  "",
  `${processes.length} playbooks and ${situations.length} situations; ${full.length} written at full depth (marked ✓), the rest outlined. ${rules.length} rule cards.`,
  "",
];
for (const phase of PHASES) {
  const rows = processes.filter((p) => p.phase === phase);
  if (rows.length === 0) continue;
  lines.push(`## ${PHASE_LABEL[phase]}`, "");
  for (const p of rows) lines.push(`- ${p.depth === "full" ? "✓ " : ""}**${p.title}**: ${p.summary}`, ...stepTitles(p));
  lines.push("");
}
lines.push("## Situations", "");
for (const s of [...situations].sort((a, b) => a.order - b.order)) {
  const urgency = s.situation ? ` (${URGENCY_LABEL[s.situation.urgency]})` : "";
  lines.push(`- ${s.depth === "full" ? "✓ " : ""}**${s.title}**${urgency}: ${s.summary}`, ...stepTitles(s));
}
const audits = playbooks.filter((p) => p.kind === "audit").sort((a, b) => a.order - b.order);
if (audits.length > 0) {
  lines.push("", "## Audits", "");
  for (const a of audits) {
    lines.push(`- ${a.depth === "full" ? "✓ " : ""}**${a.title}** (${PHASE_LABEL[a.phase]}): ${a.summary}`, ...stepTitles(a));
  }
}
console.log(lines.join("\n"));
