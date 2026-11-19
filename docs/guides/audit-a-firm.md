# Audit a firm

An audit is one pass through an audit playbook's checks, for a firm that already exists.
Each check records what is true, with where the proof is. A check never fixes anything:
what is wrong becomes a finding, with who fixes it and by when. An audit is not legal,
tax or investment advice; every check links to the rule and source behind it.

## The loop

1. `pcre audit open audit-entity-standing --json` opens an audit (add `--subject <id>` for one deal).
   Only an audit playbook written at full depth for the firm can be opened.
2. `pcre audit approve-lookups --by "Alex Example" --json`: the agent asks a person to
   approve read-only lookups of public records, once for the whole audit, and records the
   approval in their name once they say yes. The agent never logs in anywhere.
3. `pcre audit next --json` lists the checks ready now, each with its instruction, rules,
   sources and the exact `pcre audit record ...` command.
4. `pcre audit record <check> --outcome clear --evidence "state records, read 2026-11-12" --json`
5. Repeat 3 and 4 until `next` says `complete: true`.
6. `pcre audit score --json`, then `pcre audit report --json`.
7. `pcre audit close --json`. Findings can stay open after the audit closes.

Every command works on the current audit: the one you name with `--audit <id>`, or else
the most recently opened audit that is still open.

## The four outcomes

- `clear`: verified. Needs `--evidence`: the record and the date it was read, or a file path.
- `finding`: something is wrong or missing. Needs `--title`; opens finding `f-1`, `f-2`, ...
  Severity defaults to the check's risk, the owner to the check's role (or `principal`).
  Override with `--severity`, `--owner`, `--due`. More on the same check: `pcre finding add`.
- `unverified`: could not be confirmed. Needs `--note` saying why. It is the honest answer
  when the proof is not at hand, and it never counts as clear.
- `not-applicable`: the check does not fit this firm. Needs `--note`.

## Who can record what

- An agent can record any outcome on an agent check (mode `agent` or `agent-browser`).
- Only a person calls a human check clear. The agent asks them to check it, and once they
  say it is clear, records it in their name: `--by "Alex Example"`. The agent may record
  it `unverified` or as a finding.
- A check that reads a public record needs the lookup approval before an agent records it
  clear or as a finding. A check recorded in a person's name needs no approval.
- Only a person accepts a finding.
- The engine never records these under the agent's own name, and it takes the name it is
  given: that name is the agent's word, not proof. An agent gives a person's name only
  after that person said so.

## Findings

Three states: `open`, `fixed` (`pcre finding fix f-1 --note "<where the proof is>"`) and
`accepted` (a person lives with it: `pcre finding accept f-1 --note "<why>" --by "..."`).
`pcre finding reopen f-1 --note "<why>"` opens it again. A check with an open finding cannot
be recorded clear, unverified or not-applicable until each finding is fixed or accepted.
`pcre finding list --all --status open --json` shows every audit's open findings.

## The score

Counted from the records each time, never typed in: for example
`7 of 11 checks clear · 2 findings · 1 unverified · 1 not checked yet`. Checks that are
not applicable leave the count. The score says how much was verified, not that the firm
is compliant, and it covers only what the audit playbook covers: `covers` names it, and
`notCovered` lists the audits not written yet and the parts of a firm no audit looks at.

## The report

`pcre audit report` writes into `audit/<audit-id>/` in the firm folder: `findings.md`
(score, a findings table, every check with its outcome, evidence and sources) and a
`sheet-<owner>.md` for each role with an open finding, such as `sheet-counsel.md`. It
changes no record.

## Refusals

- `not-found`: no such audit, check, finding or audit playbook; or no audit yet (open one).
- `guard-failed`: a named condition is not met. The `guard` says which: `playbook-is-written`
  (an outline cannot be audited yet), `earlier-checks-recorded`, `lookups-approved`,
  `person-for-human-check`, `no-open-findings`, `every-check-recorded`.
- `already-exists`: an audit of this playbook is already open, or lookups are already approved.
- `audit-closed`: reopen it first with `pcre audit reopen --note "<why>"`.
- `evidence-required`, `title-required`, `note-required`: add the missing flag.
- `person-required`: ask the person; once they say yes, record it in their name with
  `--by "<name>"`. `wrong-state`: the check is not a
  finding, so `finding add` does not fit. `transition-refused`: the move is not allowed from
  where the record stands; the message lists what is.
