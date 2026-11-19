import { HOSTS, type Host } from "@/lib/hosts";

// lib/hosts.ts gives each host's steps as lines wrapped for the plain-text /install
// page. The picker numbers them, so the lines are put back together and split where
// a sentence ends, without changing a word:
//   - a line indented two spaces is a config line and joins the code block of the step before it;
//   - a line that starts with a lowercase program name, has a flag or a URL, and does
//     not end in punctuation is a command, and is a step of its own;
//   - everything else is prose: joined, then one step per sentence;
//   - a sentence that opens with "Or" is another way to do the step before it, not the next
//     thing to do, so it stays with that step and takes no number.

export type SetupStep = {
  text: string | null; // the sentence, or null for a step that is only a command
  code: string | null; // a command or config lines, shown in the mono face with a copy button
  codeKind: "command" | "config" | null;
  alt: string | null; // another way to do this same step ("Or in the IDE extension: ..."), said under it
};

const isConfig = (line: string) => line.startsWith("  ");
const isCommand = (line: string) =>
  /^[a-z][\w.-]*\s/.test(line) && !/[.,:;)]$/.test(line.trim()) && /\s--|:\/\//.test(line);
const isAlternative = (sentence: string) => /^Or\s/.test(sentence);

// One step per sentence: a full stop followed by a space and a capital letter.
const sentences = (prose: string) =>
  prose
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

export function setupSteps(lines: readonly string[]): SetupStep[] {
  const steps: SetupStep[] = [];
  let prose: string[] = [];
  const flush = () => {
    if (prose.length === 0) return;
    for (const s of sentences(prose.join(" "))) {
      const last = steps.at(-1);
      if (last && isAlternative(s)) last.alt = last.alt ? `${last.alt} ${s}` : s;
      else steps.push({ text: s, code: null, codeKind: null, alt: null });
    }
    prose = [];
  };
  for (const raw of lines) {
    if (isConfig(raw)) {
      flush();
      const line = raw.slice(2);
      const last = steps.at(-1);
      if (last && last.codeKind === "config" && last.code !== null) last.code = `${last.code}\n${line}`;
      else if (last && last.code === null && last.alt === null) {
        last.code = line;
        last.codeKind = "config";
      } else steps.push({ text: null, code: line, codeKind: "config", alt: null });
    } else if (isCommand(raw)) {
      flush();
      steps.push({ text: null, code: raw.trim(), codeKind: "command", alt: null });
    } else {
      prose.push(raw.trim());
    }
  }
  flush();
  return steps;
}

// Our own two-letter monograms: kept for anything that still draws a tile of ours. Hosts now
// show their own icons (Logo, lib/logos.ts, D218).
const MONOGRAM: Record<string, string> = { "claude-code": "CC", claude: "Cl", chatgpt: "GP", codex: "Cx", grok: "Gk", muse: "Mu" };
export const monogramFor = (h: Pick<Host, "id" | "name">) => MONOGRAM[h.id] ?? h.name.slice(0, 2);

export const mcpUrlFor = (siteUrl: string) => `${siteUrl}/api/mcp`;

// "6 hosts · 1 tested · 3 documented · 2 not checked yet", counted from HOSTS.
export function hostCounts(hosts: readonly Host[] = HOSTS) {
  const tested = hosts.filter((h) => h.status === "tested").length;
  const documented = hosts.filter((h) => h.status === "documented").length;
  return { total: hosts.length, tested, documented, unchecked: hosts.length - tested - documented };
}
