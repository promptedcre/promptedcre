# Run a playbook

A **run** is one playbook worked step by step, either for the firm itself or for one
**subject**: a deal, an offering, an investor or a property. The run lives in the firm
folder's `progress.json`. Its state is worked out from its steps every time you ask:
`open` while any step that applies is still to do or blocked, `complete` once every one
is done, skipped or not applicable. Only the steps that fit the firm's structure,
property type and states count; a fund-only step never shows up in a syndication run.

## The loop

1. `pcre run start form-sponsor-entity --json` opens the run.
2. `pcre run next --json` lists every step that can be done now, across all open runs.
   Each item says who does it, whether an agent can, what approval it needs, the
   instruction, the rules and sources behind it, and the exact `pcre run done ...` line.
3. Do the step: draft, look up, file or sign, as the instruction says.
4. Record it: `pcre run done form-sponsor-entity draft-certificate --proof "docs/certificate-draft.pdf" --json`.
   The reply lists the steps that became ready.
5. Repeat until `run next` says `complete: true`.

`pcre run show form-sponsor-entity --json` shows the whole run: every step, its status,
what it waits on, and who recorded it.

## Who can record what

- **Agent steps** (`agent`, `agent-browser`): the agent does them and records them.
- **Human steps** (`human-online`, `human-offline`): a person does them. The agent can
  prepare everything, then hands the step over: what to do and where. Once the person
  says it is done, it is recorded in their name: `--by "Alex Example"`.
- **Approval** comes in three kinds:
  - `every-run`: each time, a person approves. The agent asks and waits; once they say
    yes, it adds `--approved-by "Alex Example"`. Or the person records the step with `--by`.
  - `standing`: a person approves once for the whole run. The agent asks once; once they
    say yes, it records `pcre run approve form-sponsor-entity --by "Alex Example" --json`.
    After that the agent records those steps without asking again.
  - `signature`: a person signs. The agent says what to sign and where; once they say it
    is signed, the step is recorded in their name with `--by`. No one signs for them.
- The engine never records these under the agent's own name, and it takes the name it is
  given: that name is the agent's word that the person did or approved it, not proof. So
  an agent gives a person's name only after that person said so.
- Only a person can **skip** a step, and skipping needs a `--note` saying why. Anyone can
  mark a step **not applicable**, also with a note.

## Subjects: one deal, its own runs

```
pcre subject add deal-elm --kind deal --label "The warehouse on Elm" --property-type industrial --json
pcre run start screen-deal-buy-box --subject deal-elm --json
pcre run next --subject deal-elm --json
pcre run done screen-deal-buy-box log-lead-collect-package --subject deal-elm --proof "deals/elm/package.pdf" --json
pcre subject close deal-elm --note "Passed: outside the buy box" --json
```

Each deal keeps its own runs, so two deals can work the same playbook side by side. A
subject can carry its own `--structure` (a fund deal at a syndication firm). A closed
subject's runs stay on record but leave `run next` and take no new runs.

## Recording history for a firm that already exists

Steps done before the engine are recorded with the date they happened and where the
proof is: `pcre run done form-sponsor-entity file-texas-certificate --by "Alex Example" --date 2026-01-15 --proof "records/certificate.pdf" --json`.
Records written before the engine (status, date and note only) are read as runs as they
stand; nothing needs converting. A step that was never done but no longer matters is
skipped or marked not applicable, with a note.

## When the engine refuses

| code | what it means | what to do |
|---|---|---|
| `not-found` | no such playbook, step, subject or run | the message gives the start or add command |
| `already-exists` | the run or subject is already there | `pcre run show ...` |
| `wrong-kind` | the playbook is an audit | `pcre audit open ...` |
| `guard-failed` | `playbook-is-written`: an outline or a variant not researched | an outline: pick a written playbook, or wait for the research. A structure it is not written for: if the deal itself has one it is written for, start the run with `--subject` for a subject added with that `--structure` (a subject keeps the structure it was added with, so a deal already added without it needs a new subject id); if not, the playbook does not cover the deal |
| `guard-failed` | `predecessors-resolved`: earlier steps are open | do the steps named, or `run next` |
| `guard-failed` | `person-for-human-step` or `approval-recorded` | hand it to the person and wait; once they say it is done or approved, record it in their name with `--by` or `--approved-by` |
| `not-in-variant` | the step does not fit this run | nothing to record |
| `transition-refused` | the step's status does not allow that move | reopen it first, with a note |
| `person-required`, `note-required` | only a person may, or a reason is needed | ask the person; once they say yes, record it in their name with `--by "<name>"`. Or add `--note "..."` |
| `subject-closed` | the subject is closed | `pcre subject reopen ... --note "..."` |

## Commands

`pcre subject add | list | close | reopen` · `pcre run start | list | show | next | done | block | unblock | skip | not-applicable | reopen | approve`.
Every command takes `--firm <folder>`, `--by <who>`, `--date YYYY-MM-DD` and `--json`;
`pcre run done --help` lists the rest.
