import { groupByStructure } from "@/lib/compute/playbook-facts";
import { applicableSteps, DEFAULT_VARIANT, stepStructures } from "@/lib/compute/variant";
import type { Structure } from "@/lib/schemas/common";
import type { Playbook } from "@/lib/schemas/playbook";
import { ByStructure } from "./by-structure";
import { stepNumbers } from "./numbering";
import { RefLink } from "./ref-link";
import { pad2 } from "./words";

// The steps of one record that cite a rule, numbered as the structure in view
// numbers them. Drawn once when the numbers agree in every structure.

type User = { id: string; title: string; n: number };

function usersOf(pb: Playbook, ruleId: string, structure: Structure): User[] {
  return applicableSteps(pb, { ...DEFAULT_VARIANT, structure })
    .map((st, i) => ({ id: st.id, title: st.title, n: i + 1 }))
    .filter((u) => pb.steps.find((s) => s.id === u.id)?.rules.includes(ruleId));
}

// One group per structure the record is written for that differs: the page shows no other.
const groupsFor = (pb: Playbook, ruleId: string) =>
  groupByStructure((s) => usersOf(pb, ruleId, s), (users) => users.map((u) => `${u.id}:${u.n}`).join(" "), pb.written.structure);

// RuleUseNote: one line for a folded card's summary, "Used by steps 03, 07".
export function RuleUseNote({ pb, ruleId }: { pb: Playbook; ruleId: string }) {
  const noun = pb.kind === "audit" ? "check" : "step";
  return (
    <ByStructure
      groups={groupsFor(pb, ruleId)}
      render={(users) =>
        users.length === 0 ? `Used by a ${noun} outside this view` : `Used by ${users.length === 1 ? noun : `${noun}s`} ${users.map((u) => pad2(u.n)).join(", ")}`
      }
    />
  );
}

// RuleUsers: the same steps as links to each row, number and title, for RuleCard's usedBy
// slot: a short list a reader can recognise, not a row of numbers to decode. Each step is
// drawn once: it is marked with the structures it applies in, and only its number is drawn
// per structure where the numbers differ. A structure in which no numbered step cites the
// rule says so instead.
export function RuleUsers({ pb, ruleId, stepHref = (id) => `#step-${id}` }: { pb: Playbook; ruleId: string; stepHref?: (id: string) => string }) {
  const noun = pb.kind === "audit" ? "check" : "step";
  const numbers = stepNumbers(pb);
  const users = pb.steps.filter((s) => numbers.has(s.id) && s.rules.includes(ruleId));
  const none = pb.written.structure.filter((s) => !users.some((u) => numbers.get(u.id)?.[s] !== undefined));
  const written = new Set(pb.written.structure);
  return (
    <div>
      <p className="type-label m-0 text-faint">Used by</p>
      {/* Under a finger each link's hit area is 44 px tall (RefLink), so the rows stand that far apart. */}
      {users.length > 0 && (
        <ul className="m-0 mt-2 grid list-none gap-2 p-0 pointer-coarse:gap-6">
          {users.map((u) => {
            const own = numbers.get(u.id) ?? {};
            const shownIn = stepStructures(u).filter((s) => written.has(s));
            return (
              <li key={u.id} data-s={shownIn.join(" ")} className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-3">
                <span className="type-data text-faint">
                  <ByStructure groups={groupByStructure((s) => own[s] ?? 0, String, shownIn)} render={pad2} />
                </span>
                <RefLink href={stepHref(u.id)} className="type-body-s">
                  {u.title}
                </RefLink>
              </li>
            );
          })}
        </ul>
      )}
      {none.length > 0 && (
        <p data-s={none.length < pb.written.structure.length ? none.join(" ") : undefined} className="type-body-s m-0 mt-2 text-muted">
          A {noun} outside this view
        </p>
      )}
    </div>
  );
}
