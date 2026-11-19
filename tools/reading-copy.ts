// Prints the written playbooks as one Markdown reading copy (for review away
// from the site). Default view: syndication, Federal + Texas. A record not written for
// syndication is printed whole, under a line saying which structures it is written for.
//   npx tsx tools/reading-copy.ts > reading-copy.md
import { computeMetrics } from "../lib/compute/metrics";
import { applies, DEFAULT_VARIANT } from "../lib/compute/variant";
import { getCorpus } from "../lib/content/load";
import { writtenForLine } from "../lib/export/playbook-md";
import { MODE_LABEL, PHASE_LABEL, STRUCTURE_LABEL, URGENCY_LABEL } from "../lib/labels";
import { STRUCTURES } from "../lib/schemas/common";

const { playbooks, rules } = getCorpus();
const ruleTitle = new Map(rules.map((r) => [r.id, r.title]));
const written = playbooks.filter((p) => p.depth === "full").sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === "process" ? -1 : 1));

const out: string[] = [
  "# Prompted CRE v3: reading copy of the written playbooks",
  "",
  "Generated from the repo for review. Steps that apply only to a fund or a JV are marked. A record written for fewer than three structures says so under its title. Every source was opened on the date shown.",
  "",
];
for (const pb of written) {
  out.push(`## ${pb.title}`, "");
  out.push(`*${pb.kind === "situation" ? "Situation" : "Playbook"} · ${PHASE_LABEL[pb.phase]}${pb.situation ? ` · ${URGENCY_LABEL[pb.situation.urgency]}` : ""}*`, "");
  const writtenFor = writtenForLine(pb);
  if (writtenFor) out.push(`*${writtenFor}*`, "");
  out.push(pb.summary, "");
  if (pb.situation) out.push(`**Trigger:** ${pb.situation.trigger}`, "");
  const shares = STRUCTURES.filter((s) => pb.written.structure.includes(s)).map((s) => {
    const m = computeMetrics(pb, { ...DEFAULT_VARIANT, structure: s });
    return `${STRUCTURE_LABEL[s]} ${m.agenticPct ?? "—"}% (${m.agent} of ${m.total})`;
  });
  out.push(`**Agent can do:** ${shares.join(" · ")}`, "");
  let n = 0;
  for (const step of pb.steps) {
    const allStructures = applies(step.when, DEFAULT_VARIANT) || step.when?.structure;
    if (!allStructures) continue;
    n += 1;
    const only = step.when?.structure ? ` (${step.when.structure.map((s) => STRUCTURE_LABEL[s]).join(", ")} only)` : "";
    const jur = step.when?.jurisdiction ? ` (${step.when.jurisdiction.join(", ")})` : "";
    out.push(`### ${n}. ${step.title}${only}${jur}`, "");
    out.push(`\`${MODE_LABEL[step.mode]}\`${step.approval === "signature" ? " · signature" : ""}${step.licensed ? ` · ${step.licensed}` : ""}${step.undo !== "reversible" ? ` · ${step.undo.replace(/-/g, " ")}` : ""} · basis: ${step.basis}`, "");
    out.push(step.instruction, "");
    out.push(`*Why ${step.mode.startsWith("agent") ? "an agent" : "a person"}:* ${step.modeBasis}`, "");
    if (step.cost) out.push(`*Cost:* ${step.cost.text}`, "");
    if (step.rules.length) out.push(`*Rules:* ${step.rules.map((r) => ruleTitle.get(r) ?? r).join("; ")}`, "");
    const srcs = step.sources.map((id) => pb.sources.find((s) => s.id === id)).filter((s) => s !== undefined);
    if (srcs.length) out.push(`*Sources:* ${srcs.map((s) => `[${s.publisher}: ${s.title}](${s.url})`).join(" · ")}`, "");
  }
}
console.log(out.join("\n"));
