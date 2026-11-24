# Product

<!-- impeccable:product-schema 1 -->

This record was assembled on 2026-11-14 from the owner's recorded answers in
`docs/DECISIONS.md` (the number in brackets is the decision it comes from) and from
what the code does. No new interview was held for it. Anything not on record is listed
as undecided, not filled in.

## Platform

web

## Users

- **Real estate operators:** firms that raise capital and own property, new or
  established [29]. The playbooks are written for small-balance firms: deals of roughly
  $2M to $20M, raising $1M to $10M a deal or a first fund under $25M from individuals
  and family offices [27], in any commercial property type [4].
- They arrive with an AI agent already open (Claude, ChatGPT, Codex) and one of two
  jobs: **start a firm** (stand it up, raise, buy) or **audit the firm they already
  run** [31, 41]. Most are not developers.
- **The agent is a reader too.** It reads the same library through a read-only
  connector, `llms.txt` and the JSON exports [17].
- The first user of the local engine is the owner, running his own firms from his own
  machine [44].
- The word for the user is **operator**. "Sponsor" is not used for the user on the
  marketing layer. It is a real estate term and stays in catalog text wherever it is that
  term; titles and summaries that meant the user were renamed in a pass the owner read
  [29, 30, 104, 106, 107].
- **Full-service and vertically integrated firms** are who the two paid plans, Pro and
  Enterprise, are for. Both are coming soon, with no prices and, for now, no sign-up; the
  Free plan, everything live today, is for operators [120, 127].

## Product Purpose

An open library of step-by-step playbooks, rule cards, calculators, artifacts and
vendor rankings, written so an AI agent can do the steps it can and stop where a
person must sign. It exists so a small firm can run the work of standing up, raising,
buying and staying in good standing without guessing which steps are safe to hand to
an agent.

Success is concrete: the agent finishes its steps with a source beside each one; the
person knows exactly which steps are theirs; an audit ends with a findings file, a
calendar file, a sheet for counsel and one for the CPA, and a score [35, 36].

## Positioning

- Every step says **who does it** (an agent, an agent in a browser, a person online, a
  person offline) and **where it comes from** (a cited public source, or "common
  practice" said plainly).
- Every record shows its review status: practitioner-reviewed or AI-drafted [12].
- The engine **never records a person's step under the agent's name**. The agent hands
  the step over and records it in the person's name once they say it's done; that name is
  the agent's word, not proof. The recorded run shows the refusal and the handoff.
- Vendor rankings judge one thing, agent-readiness, on sealed evidence, and take no
  vendor money, ever [10, 20].
- The Free plan is free, with no sign-in, and the firm's memory stays in a file on the
  operator's own machine [17, 18, 38]. Pro (self-serve: live market data, models as skills,
  property lookups and links to a firm's own tools) and Enterprise (built with the firm: its
  own skills and workflows, a company brain and an agent harness) are coming, paid for by the
  firms that use them, never by a vendor [120 to 126].

## Operating Context

- The operator pastes one sentence into an AI chat. The agent connects to the library
  and works a playbook.
- Jurisdiction covered: federal and Texas, with Delaware for entity formation [13].
- Three capital structures, switchable: single-asset syndication, blind-pool fund,
  joint venture with one capital partner [8].
- The whole lifecycle is written at full depth: standing up the firm, raising, buying,
  operating, reporting and selling [7, 110].
- The local engine keeps a firm folder: JSON files plus one append-only log [46]. It is
  driven from a command line or a local MCP server [47].
- Playbooks print, and each written playbook can be copied whole into any AI chat.

## Capabilities and Constraints

- **Live since 2026-11-19:** the hosted connector is switched on (`connectorLive` in
  `lib/site.ts`) and the engine is released from the public repository (`engineReleased`)
  [D246]. Every line that says what is live follows those two flags. The paid plans exist
  only as cards; nothing of them is built, and the site takes no sign-up for them [120, 127].
- **Numbers are measured.** Every count on the site is computed from the catalog at
  build (`lib/compute/site-facts.ts`). None is typed by hand.
- **Hosts** are labeled as tested only after a real run [42]. Claude Code is tested;
  Claude, ChatGPT, Codex, Grok and Muse are documented from each maker's own help and not
  run yet (Grok and Muse since D223). Each shows its own icon [58, 60].
- **Not advice.** Nothing is legal, tax or investment advice, and no attorney reviewed
  version one [28].
- The pages read with scripts off, hold a 12 px text floor, and never carry meaning by
  color alone.
- **Undecided (the owner's):** who is named as behind the site and as reviewer; whether
  the audit door leads.

## Brand Commitments

- Name: **PromptedCRE**, one word [74]; the mark is five floor slabs stepping out and
  back as a prompt's caret, in the agent's green, and a cursor slab in the person's amber
  with the person's cut corner [76].
- Headline: **"Give your AI CRE superpowers."**, its last word penciled then inked once as
  the page opens, and under it "The playbooks, rules and math your AI agent needs to do real
  estate work, from forming the firm to selling the building." [118, 119, 128]
- The header's "Connect your agent" opens /plans: three cards and nothing else, Free (live),
  Pro and Enterprise (coming soon), each line on a card a name alone. Free's "Set up your
  agent" leads on to /connect [121, 134, 135].
- Two themes, each composed on its own: **Paper**, the drawing set on a desk in daylight,
  which every visitor starts on [75], and **Night**, the dark drawing set, on the toggle.
- One box to start from: the sentence to paste ("Read promptedcre.com/install and set me
  up."), Claude Code's command and the connector's address, with "Already run a firm?
  Audit it" under it [56, 57, 61].
- Section names: Playbooks, Scenarios, Audit, Software [65, 73].
- Clean room: Ultrametric's idea and order may be taken, never its code, wording, data or
  design [39, D218].
- Voice: plain words, short sentences, says what is not done. The headline is the only
  loud line.

## Evidence on Hand

- A recorded engine run on a fictional firm, pinned by tests, ending in a finished
  audit: `content/demo/run.json` (regenerate with `npm run demo:record`).
- The catalog itself: playbooks, situations, audits, rule cards, calculators,
  artifacts, documents and four ranked vendor markets, all under `content/` and
  `rankings/`, with citations checked by `npm run citations`.
- Company icons for the hosts and the ranked vendors, each fetched from the company's own
  site, with its source, date and hash in `lib/logos.ts` [60].
- **Absent, and never to be invented:** customers, testimonials, press, usage numbers,
  partner badges or endorsements, screenshots of other products, photographs.

## Product Principles

1. Say who does each step and where it comes from.
2. Stop where a person signs.
3. Tell the truth about state: what works today, what is not live, what nobody has
   reviewed.
4. Measure, do not claim. A number on the page is a count from the catalog.
5. Write for two readers at once: the operator and the operator's agent.

## Accessibility & Inclusion

- Readable and usable with scripts off, on a phone, by keyboard, and in print.
- No meaning by color alone: the agent and person marks differ in shape as well.
- Text never below 12 px. Motion has a reduced-motion path that keeps the meaning.
