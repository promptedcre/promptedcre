// A process is a small state machine written as data: its states, and the
// transitions between them with who may make each one. Nothing here knows about
// playbooks or files. lib/engine/processes.ts holds the definitions; each
// process module checks its own guards, then calls `transition`.

export type Who = "agent" | "person" | "either";

export type Actor = { kind: "agent" } | { kind: "person"; name: string };

export type Transition = {
  action: string;
  from: readonly string[];
  to: string;
  // "person": only a person may do it. "agent": an agent normally does it (a
  // person may too). "either": no preference.
  who: Who;
  // The engine makes this move by itself when its guards hold; no command does.
  automatic: boolean;
  needsNote: boolean;
  // Named conditions the process module checks before the transition. They are
  // listed here so the process map shows everything that can refuse a move.
  guards: readonly string[];
  what: string;
};

export type ProcessDef = {
  id: string;
  name: string;
  what: string;
  record: string; // where its state is kept in the firm folder
  initial: string;
  // "stored": the state is written in the record. "derived": it is worked out
  // from other records each time, so it can never drift from them.
  kind: "stored" | "derived";
  states: Readonly<Record<string, string>>;
  transitions: readonly Transition[];
};

// A refusal the caller can act on. `code` is stable; `message` is for people.
export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export const AGENT: Actor = { kind: "agent" };

// "agent" (any case) or nothing is the agent; anything else names a person. The engine
// takes the name as given: it is the caller's word that this person acted, not proof.
export function parseActor(by: string | null | undefined): Actor {
  const value = (by ?? "").trim();
  if (value === "" || value.toLowerCase() === "agent") return AGENT;
  return { kind: "person", name: value };
}

export function actorLabel(actor: Actor): string {
  return actor.kind === "agent" ? "agent" : actor.name;
}

export function isPerson(actor: Actor): actor is { kind: "person"; name: string } {
  return actor.kind === "person";
}

export function actionsFrom(def: ProcessDef, state: string): Transition[] {
  return def.transitions.filter((t) => t.from.includes(state));
}

// Checks one move against the definition and returns the transition to apply.
// Refuses an unknown action, a move the current state does not allow, an agent
// doing what only a person may, and a missing note where one is required.
export function transition(def: ProcessDef, from: string, action: string, actor: Actor, note?: string | null): Transition {
  if (!(from in def.states)) {
    throw new EngineError("unknown-state", `${def.name}: "${from}" is not one of its states.`, { process: def.id, state: from });
  }
  const named = def.transitions.filter((t) => t.action === action);
  if (named.length === 0) {
    throw new EngineError("no-such-action", `${def.name} has no action "${action}".`, {
      process: def.id,
      actions: [...new Set(def.transitions.map((t) => t.action))],
    });
  }
  const move = named.find((t) => t.from.includes(from));
  if (!move) {
    const allowed = actionsFrom(def, from).map((t) => t.action);
    throw new EngineError(
      "transition-refused",
      `${def.name}: cannot ${action} from "${from}". From "${from}" you can: ${allowed.length > 0 ? allowed.join(", ") : "nothing"}.`,
      { process: def.id, from, action, allowed },
    );
  }
  if (move.automatic) {
    throw new EngineError("automatic", `${def.name}: ${action} happens by itself; it is not something to request.`, { process: def.id, action });
  }
  if (move.who === "person" && !isPerson(actor)) {
    throw new EngineError("person-required", `${def.name}: only a person can ${action}. Ask the person and wait. Once they say yes, record it in their name with --by "<name>".`, {
      process: def.id,
      action,
    });
  }
  if (move.needsNote && !(note ?? "").trim()) {
    throw new EngineError("note-required", `${def.name}: ${action} needs a note saying why.`, { process: def.id, action });
  }
  return move;
}

// Problems in a definition itself; an empty list means it is well formed.
export function validateProcess(def: ProcessDef): string[] {
  const problems: string[] = [];
  const states = new Set(Object.keys(def.states));
  if (!states.has(def.initial)) problems.push(`${def.id}: initial state "${def.initial}" is not declared`);
  const seen = new Set<string>();
  for (const t of def.transitions) {
    if (!states.has(t.to)) problems.push(`${def.id}: ${t.action} goes to undeclared state "${t.to}"`);
    for (const f of t.from) {
      if (!states.has(f)) problems.push(`${def.id}: ${t.action} starts from undeclared state "${f}"`);
      const key = `${f}:${t.action}`;
      if (seen.has(key)) problems.push(`${def.id}: two transitions for ${t.action} from "${f}"`);
      seen.add(key);
    }
    if (!t.what.trim()) problems.push(`${def.id}: ${t.action} has no description`);
  }
  for (const s of states) {
    if (s !== def.initial && !def.transitions.some((t) => t.to === s)) problems.push(`${def.id}: nothing reaches state "${s}"`);
  }
  return problems;
}
