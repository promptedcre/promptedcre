import { RoleMark } from "@/components/ui";
import type { Playbook, StepMode } from "@/lib/schemas/playbook";

const MODES: StepMode[] = ["agent", "agent-browser", "human-online", "human-offline"];

// StepKey: what the marks beside the steps mean, for the modes the record uses: a square
// for an agent, hatched for an agent in a browser or a person offline, and a person's mark
// with its top-right corner cut, so who does a step never rests on color alone. The marks
// are the foundation's RoleMark; the words are neutral ink. An audit's rows are checks, and
// the key says so.
export function StepKey({ pb }: { pb: Playbook }) {
  const modes = new Set(pb.steps.map((s) => s.mode));
  const person = modes.has("human-online") || modes.has("human-offline");
  return (
    <ul className="pb-key" aria-label="Key to the marks">
      {MODES.filter((m) => modes.has(m)).map((m) => (
        <li key={m}>
          <RoleMark mode={m} />
        </li>
      ))}
      {person && <li className="type-label text-faint">A person&rsquo;s {pb.kind === "audit" ? "check" : "step"} has a cut corner</li>}
    </ul>
  );
}
