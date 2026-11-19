# The engine: conventions for maintainers

The engine runs a firm's processes on the operator's own machine: playbook runs, audits
and deadlines. This page is the contract every process module follows.

## The shape

```
lib/engine/machine.ts     the state-machine core: transition(), EngineError, actors
lib/engine/processes.ts   every process as data: states, transitions, who, guards
lib/engine/store.ts       the firm folder: validated, atomic writes; the append-only log
lib/engine/actions.ts     defineAction(), execute(), logEvent(), record helpers
lib/engine/firm.ts        firm init / check / status / upgrade / log; process and guide readers
lib/engine/run.ts         Run a playbook        (run.*, subject.*)
lib/engine/audit.ts       Audit a firm          (audit.*, finding.*)
lib/engine/deadlines.ts   Track deadlines       (deadline.*)
lib/engine/index.ts       ACTIONS: the one list of everything the engine can do
cli/pcre.ts               the command line, generated from ACTIONS
cli/mcp.ts                the local MCP server, generated from ACTIONS
lib/schemas/firm.ts       every record's schema
```

Three rules hold it together:

1. **States and transitions live in `processes.ts` and nowhere else.** A module never
   compares a state to a string to decide whether a move is allowed. It checks its
   guards, then calls `transition(PROCESSES.x, from, action, ctx.actor, note)`, which
   refuses a move the definition does not allow.
2. **One action, both interfaces.** An action is defined once with `defineAction`. The
   command line and the MCP server are generated from `ACTIONS`, so nothing is wired twice.
3. **The firm folder is the only state.** Handlers read records, change them, write them
   and log. Nothing is cached between calls, so any session can pick up where another stopped.

## Writing an action

```ts
const done = defineAction({
  name: "run.done",                       // pcre run done   ·   MCP tool run_done
  summary: "Record a step as done.",      // one line: command help and tool description
  process: "step",                        // the machine it moves, or null
  mutates: true,
  input: z.object({
    playbook: z.string().describe("the playbook's slug"),
    step: z.string().describe("the step's id"),
    proof: z.string().min(1).optional().describe("where the evidence is"),
  }).strict(),
  positional: ["playbook", "step"],       // pcre run done <playbook> <step> --proof "..."
  run(ctx, args) { ... return { ... }; },
  text: (r) => `...`,                     // readable output; --json prints the result itself
});
```

- **Names** are `group.verb`, lowercase, verb may be hyphenated: `audit.approve-lookups`.
- **Inputs** are a flat `z.object({...}).strict()` of strings, enums, booleans and
  `z.coerce.number()`. No arrays or nested objects: each key becomes a `--flag`. Describe
  every field; the description is the flag's help and the tool's parameter text.
- **Results** are plain JSON: objects, arrays, strings, numbers, booleans, null. A list
  is `{ count, items }`. A change returns the record it changed and, where it helps, what
  can be done next.
- **Text** output is a few short lines a person can read at a glance. No tables wider
  than 100 characters.

## Who, when and why

- `ctx.actor` is who is acting: the agent, or a person (`--by "Name"`). The engine cannot
  prove who is typing; it records the claim, and the log keeps it. `actorLabel(ctx.actor)`
  is the string to store.
- `ctx.date` is the date to record an event under (`--date`, default today). `ctx.today`
  is the real date, for working out what is overdue. `ctx.now()` is the clock. A handler
  never calls `new Date()` itself, so tests can fix the day.
- A note is required wherever the definition says `needsNote`: the reason is part of the record.

## Guards and refusals

A guard is a named condition in `processes.ts` (`GUARDS` holds its plain-words meaning).
The module that owns the process checks it and refuses with

```ts
throw new EngineError("guard-failed", "<what is wrong, and what to do next>", { guard: "predecessors-resolved", ... });
```

Codes used everywhere: `not-found`, `already-exists`, `invalid-input`,
`transition-refused`, `person-required`, `note-required`, `firm-invalid`,
`secret-detected`, `no-firm`. Codes one process owns: `wrong-kind`, `not-in-variant` and
`subject-closed` (runs); `audit-closed`, `evidence-required`, `title-required` and
`wrong-state` (audits). A refusal always says what the caller can do about it, in words an
operator would use. On the command line a refusal exits 1; a command that was not
understood (`usage`, `invalid-input`, `unknown-command`) exits 2.

## Records and the log

Read and write through the helpers in `actions.ts` (`readProgress`, `writeProgress`,
`readAudits`, ...). A write validates against the schema, refuses anything shaped like a
tax id or an account number, and replaces the file in one step. Write the records first,
then call `logEvent` once for each state that changed:

```ts
logEvent(ctx, { action: "run.done", process: "step", target: "form-sponsor-entity/apply-for-ein", from: "todo", to: "done", note });
```

An action marked `mutates` holds the folder's lock (`.lock`) from its first read to its
last write, so the command line and the MCP server can work the same folder without
overwriting each other. A second writer waits a few seconds, then is refused with `busy`.
An action may run another action inside itself; the lock is taken once.

`target` reads `playbook/step`, `subject:playbook/step`, `audit-id/check`,
`audit-id/f-1`, or a deadline id. Schema changes are additive: a firm folder that
validates today must validate after every change.

## Tests

`__tests__/helpers/engine.ts` gives a temp firm folder (`makeCtx`, `exampleFirm`), `act()`
to run an action by name, `refusal()` to read an error code, and synthetic playbooks
(`step`, `book`, `corpusWith`). A process's tests use synthetic playbooks, so they do not
break when catalog text changes, and at least one test walks the process end to end.
