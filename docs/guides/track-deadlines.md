# Track deadlines

The firm's dated duties live in one calendar: `calendar.json` in the firm folder. Each
deadline has a title, a due date, where the date came from (a rule from the catalog, the
calculator, an audit, a playbook or a person) and a status: `open`, `done` or `dismissed`.
Add `--json` to any command to get the result as data. Point at the folder with `--firm <folder>`.

## Add a date by hand

    pcre deadline add --title "Renew the registered agent" --due 2027-01-15 --json

The id is made from the title and the date (`renew-the-registered-agent-2027-01-15`);
give your own with `--id`. Optional: `--rule <rule id>`, `--subject <id>` for one deal or
offering, `--basis` (how you worked the date out), `--note`, `--needs-review`.

## Add dates from the calculator

    pcre deadline compute --first-sale-date 2026-03-02 --json

The calculator turns the facts you give it into dates. A first sale on 2026-03-02 gives
`form-d-2026-03-17`, "Form D due at the SEC", due 2026-03-17, citing the rule
`us-fed.reg-d.form-d-filing`. Its basis says how the date was reached and, when it moved
past a weekend or holiday, the day it moved from and why. The other inputs are
`--first-texas-sale-date`, `--exchange-transfer-date`, `--return-due-date`,
`--appraisal-notice-date`, `--protest-year` and `--contract-effective-date`. Contract
periods need the whole input as JSON in `--input` or `--input-file` (read from the firm folder).
Running it again is safe: a date already on the calendar is reported under `existing` and left alone.

Every computed date is marked `needsReview: true`. The calculator follows the rule card,
but a rule can have exceptions the facts you gave it do not show. A person checks each
date against the rule before relying on it.

## What is due

    pcre deadline list --json
    pcre deadline list --within 30 --json

An open deadline is **overdue** when its date has passed, **due soon** when it falls within
30 days of today (today and day 30 count), and **upcoming** after that. These are worked out
from today's date every time; they are never stored. `daysLeft` is negative when overdue.
`--within <days>` keeps open deadlines due within that many days, plus everything overdue.
`--status done|dismissed|all` shows closed ones. `pcre deadline show <id>` shows one in full.

## Close and reopen

    pcre deadline done form-d-2026-03-17 --note "Filed; confirmation in the offering folder"
    pcre deadline dismiss texas-notice-2026-03-17 --by "Alex Example" --note "No Texas investors"
    pcre deadline reopen texas-notice-2026-03-17 --note "A Texas investor signed"

Done records the date and who. Dismissing says a deadline does not apply: only a person
can do it, and the reason is required. Reopen needs a reason and clears who closed it.
Each note is added under the earlier ones, and every change is in the firm's log.

## Export to a calendar app

    pcre deadline export --json

This writes `calendar.ics` in the firm folder (`--out <path>` for another place inside it;
`--status all` to include closed ones). Import the file in your calendar app, for example
through its "import" or "add calendar from file" menu. Each deadline is an all-day event
whose description holds the rule, the basis and the note. Export again after any change.

## When the engine refuses

- `already-exists`: that id is taken. Show it, or pick another `--id`.
- `not-found`: no such deadline, rule or subject. Check the spelling, or add the subject first.
- `invalid-input`: a flag is missing or malformed, a date does not exist, the calculator had
  nothing to work from (it names the dates it needs), or `--out` points outside the firm folder.
- `person-required`: only a person can dismiss. Ask them; once they say yes, record it in
  their name with `--by "Name"`.
- `note-required`: dismiss and reopen need `--note` saying why.
- `transition-refused`: the move does not fit the status, such as marking a done deadline done.
