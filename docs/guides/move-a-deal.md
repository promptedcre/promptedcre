# Move a deal from screen to close

A **deal** is a subject of kind `deal` in the firm folder's `progress.json`. Like any
subject it carries its own runs, so two deals can work the same playbook side by side.
A deal is `active` until it is closed: `completed` when it was bought, `dropped` when a
person decided not to go on. A deal closed some other way, with no outcome, reads as
dropped, and `deal show` says no outcome was recorded.

## The track and the stage

The **track** is the catalog's acquisition playbooks that are written in full and
featured, in catalog order: screen, underwrite, letter of intent, purchase contract, due
diligence, finance and close. `pcre deal show <id> --json` lists them with each run's state.

The **stage** is worked out from the deal's runs every time; it is never stored. It is the
first playbook on the track that is not complete. Once a playbook is complete, the stage
stays on it until a person decides to go on, because the next playbook is not started
until then. When every playbook is complete the stage is empty and the deal is ready to close.

## The loop

1. `pcre deal add deal-elm --label "The warehouse on Elm" --property-type industrial --json`
   adds the deal and starts the first playbook for it. `--structure fund` reads the deal's
   runs as a fund deal at a firm that is otherwise a syndication.
2. `pcre run next --subject deal-elm --json` lists the stage's steps that can be done now.
   Do each one and record it with the `pcre run done ...` line it gives (see the guide
   "Run a playbook" for who may record what).
3. When the stage is complete, a person decides whether to go on:
   `pcre deal advance deal-elm --by "Alex Example" --note "Fits the buy box" --json`.
   This records the decision and starts the next playbook.
4. Repeat 2 and 3 until the last playbook is complete, then
   `pcre deal complete deal-elm --json`.

`pcre deal show deal-elm --json` always ends with `next`: the exact command to run now.
`pcre deal list --json` shows every active deal with its stage, the steps ready now and
its open deadlines; `--all` adds completed and dropped deals.

## Dropping a deal

`pcre deal drop deal-elm --by "Alex Example" --note "Rent roll does not support the price" --json`
works at any stage. Only a person can drop a deal, and the reason is required: months
later, the note is what tells the firm why it walked away and whether to look again. The
deal's runs stay on record. `pcre deal reopen deal-elm --note "Seller came back" --json`
makes it active again.

## Decisions

`decisions.json` is a log a person signs. Every advance and every drop adds an entry with
the date, who decided, the playbook, the note and the deal. Other decisions are added by
hand: `pcre decision add --decision "Order a phase one report" --subject deal-elm --by "Alex Example" --json`.
An agent can draft a decision but cannot record one. `pcre decision list --subject deal-elm --json`
reads the log oldest first; `--playbook <slug>` filters by playbook.

## Deadlines for a deal

Dates that belong to a deal carry its id: `pcre deadline add --title "Earnest money due" --due 2026-11-20 --subject deal-elm --json`.
Contract periods come from the deadline calculator once the contract's effective date is
known: `pcre deadline compute --subject deal-elm --input-file deals/elm/contract.json --json`.
The file (read from the firm folder) gives every calculator field, with `null` for the
dates that do not apply, plus the periods the contract sets:

    { "firstSaleDate": null, "firstTexasSaleDate": null, "exchangeTransferDate": null,
      "returnDueDate": null, "appraisalNoticeDate": null, "protestYear": null,
      "contractEffectiveDate": "2026-12-01",
      "contractPeriods": [
        { "label": "Feasibility period ends", "days": 30, "roll": "none" },
        { "label": "Closing", "days": 60, "roll": "next-business-day" } ] }

Every computed date is flagged for a person to check against the contract itself.
`deal list` and `deal show` count the deal's open deadlines.

## When the engine refuses

| code | what it means | what to do |
|---|---|---|
| `not-found` | no such deal, subject or playbook, or the catalog has no track | the message gives the add command |
| `already-exists` | the id is taken | pick another id, or `pcre deal show <id>` |
| `wrong-kind` | the subject is not a deal | work its runs with `pcre run next --subject <id>` |
| `guard-failed` | `stage-complete`: the stage still has open steps, or was never started | `pcre run next <playbook> --subject <id>`, or the start command given |
| `guard-failed` | `next-playbook-written`: no next playbook, or it is not written for this deal | on the last playbook, `pcre deal complete <id>` |
| `guard-failed` | `track-complete`: playbooks are still open | the message names them |
| `guard-failed` | `playbook-is-written`: the first playbook is not written for this deal | add the deal with a structure it is written for |
| `person-required`, `note-required` | only a person may, or a reason is needed | ask the person; once they decide, record it in their name with `--by "<name>"`. Or add `--note "..."` |
| `transition-refused` | the deal's state does not allow it | reopen a completed or dropped deal first |

## Commands

`pcre deal add | list | show | advance | drop | complete | reopen` · `pcre decision add | list`.
Every command takes `--firm <folder>`, `--by <who>`, `--date YYYY-MM-DD` and `--json`.
