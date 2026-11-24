# Deploy checklist (the owner's steps)

You sign in, pay, push and deploy. An agent stages files, runs checks and makes code
edits when you say so; it pushes, deploys or touches promptedcre.com only when you ask it
to, and never signs in, enters a code or pays for you. Run the
commands from the repository folder unless a step says otherwise. The Vercel facts below
were checked against Vercel's documentation on 2026-11-12 (deployment protection,
environments, Node.js versions, function duration) and on 2026-11-18 (runtime log
retention, Web Analytics).

No API keys, databases, environment variables or paid services are needed.

## 1. Commit the work here

This repository is the working copy, and it stays private with its full history. Commit
your reviewed changes here first (or tell the agent to); the pre-commit hook runs the leak
check on the staged files and refuses the commit if the denylist is missing from this
machine. A release is always made from a commit, never from uncommitted files.

## 2. The public copy

The public repository starts from a fresh first commit and never holds the working files:
`docs/BUILD-PLAN.md`, `docs/DECISIONS.md`, `CLAUDE.md`, `.claude/` (the rankings
procedures) and `MORNING_REPORT.md` (answers 6 and 7). `tools/release.mjs` makes it, the
same way every time.

The first time:

1. Done on 2026-11-18: the PromptedCRE organization on GitHub (card G),
   [promptedcre](https://github.com/promptedcre), and in it the empty repository
   `promptedcre/promptedcre`, with no README, license or .gitignore. It stays private until
   section 6.
2. Done on 2026-11-18: `repoUrl` in `lib/site.ts` and the install line in `README.md` name
   it.
3. Done on 2026-11-18: the release, exported into a sibling folder, `../promptedcre-public`:

```bash
node tools/release.mjs
```

   It takes the last commit, leaves out the working files, runs the leak check on the
   files it will write, refuses to write while the README's install line has the
   placeholder, and prints what changed. `--dry-run` checks and compares without writing.
4. Done on 2026-11-18: in `../promptedcre-public`, its first commit and push. The folder
   carries its own commit identity, so no personal name enters the public history (set it
   once, before the first commit; this machine has no global git identity):

```bash
git init -b main
```

```bash
git config user.name "PromptedCRE"
```

```bash
git config user.email "build@promptedcre.invalid"
```

```bash
git add -A
```

```bash
git commit -m "PromptedCRE"
```

```bash
git remote add origin https://github.com/promptedcre/promptedcre.git
```

```bash
git push -u origin main
```

Every later release: commit here, run `node tools/release.mjs` again, then commit and push
in `../promptedcre-public`; Vercel deploys each push to `main`. A second run on an
unchanged commit reports no change. If Git's GitHub sign-in window fails ("User cancelled
dialog", then a "Username" prompt), run `$env:GCM_GUI_PROMPT = 'false'` in that terminal
first and push again.

## 3. Vercel

Done on 2026-11-19: a **new** project, `promptedcre-v3`, imported from the public
repository (not the gen-1 project), with Vercel's GitHub app installed on the organization
for this one repository, so each push to `main` deploys. Vercel's free plan cannot deploy a
private repository owned by a GitHub organization, so the repository went public first
(section 6).

1. Vercel detects Next.js. The build and output settings stay at their defaults, with no
   environment variables.
2. Node.js: `package.json` pins `24.x`, the version the site was built and tested on.
   Vercel's own default is 26.x, and the pin overrides it.
3. **Web Analytics** is on (answer 18), on the free tier. The site carries its component,
   drawn only in a build on Vercel. It counts page views without cookies.
4. The project's `vercel.app` address serves the same production deployment as the domain.

**The plan it runs on.** The project is on Vercel's free Hobby plan. Vercel's terms (section
4, read on 2026-11-23) limit Hobby to "personal or non-commercial use" and let Vercel disable
a Hobby site without notice. Since 2026-11-23 the site names two paid plans as coming soon,
with no prices and no sign-up. Your choice that day was to stay on Hobby and move to Pro
($20 a month) when Pro opens for sale; if Vercel ever disables the site before then,
upgrading is the first thing to try.

**Access.** New projects start with Standard Protection: preview deployments, including
branch pushes and per-deployment URLs, need a Vercel login. Production domains stay
public. An agent can't sign in, so test the connector on the project's `vercel.app`
production address, not on a branch preview.

**Indexing.** Vercel adds a noindex header only to previews and per-deployment URLs.
Search engines can index the `vercel.app` address once something links to it; the pages'
canonical address is `url` (section 5).

**Limits.** The MCP route is a Node.js function capped at 30 seconds. Every plan allows
at least 300.

**Call logs.** The connector writes one line per tool call to the runtime logs: the tool
and its outcome (ok, error, no-result or not-covered), never its arguments. Vercel keeps
runtime logs for 1 hour on Hobby and 1 day on Pro, and 30 days only with Observability
Plus. A weekly count of calls needs that add-on or a log drain, both paid, so deciding
whether to keep a longer record is yours. Until then the lines can be read in the
project's Logs view while they last.

## 4. The launch checks

On 2026-11-19 the domain moved right after the automatic check passed (31 of 31), so the
first outside user could start sooner. The checks run against the project's `vercel.app`
address, which serves the same deployment as the domain.

1. Done on 2026-11-19: the agent runs the automatic check and logs it in a folder outside
   the repository:

```bash
node tools/launch-check.mjs https://<url> --log <folder outside the repo>/launch-check.log
```

   It sends the pages and a connector call as GPTBot, ClaudeBot and PerplexityBot,
   checks the connector's answers to malformed requests, and runs the awkward set: an
   outline, the joint-venture-only record, a state outside coverage, a bad calculator
   input, the same call twice and a Form D date already past. While it runs, look at the
   project's firewall and bot settings (about 5 minutes): a bot faked from the laptop
   shows what those settings do to the name, not how real crawlers are treated.
2. The agent connects a fresh Claude Code session in an empty folder and runs one written
   playbook end to end against the deployed connector, then logs where it stalled:

```bash
claude mcp add --transport http promptedcre https://www.promptedcre.com/api/mcp
```

3. Ten operator questions, written or approved by you (about 10 minutes), go through
   Claude Code. Each is marked found, right tool and finished, with where it stalled. A
   question whose right record is not ranked first becomes a pinned search test and a
   ranking fix.
4. Fix what failed, release again, and check again.

The quick manual check still holds: `node tools/mcp-call.mjs https://<project>.vercel.app/api/mcp list`
should print `server promptedcre 0.1.0` and sixteen tools.

## 5. Launch values

Four values live in `lib/site.ts`, all set by 2026-11-19. To change one, the agent edits
it and runs `npm run verify`; it is committed, released and pushed, and Vercel redeploys.

| Value | Now | What it drives |
|---|---|---|
| `repoUrl` | `https://github.com/promptedcre/promptedcre` | The rankings pages' "Open a contest" links, the terms' issue form, and the engine's install command |
| `url` | `https://www.promptedcre.com`: www serves the site and promptedcre.com redirects to it | Every absolute address: metadata, the connector's links and address, the Markdown copies' "From" line, robots and the sitemap. The sentence a person pastes keeps the short form, promptedcre.com/install |
| `connectorLive` | `true` | Every page drops "Not live yet", the paste-in prompt is the primary action, and `/install` and `/llms.txt` tell agents the connector is on. The `/api/mcp` route itself is not gated by this flag |
| `engineReleased` | `true` (the engine is packaged: `bin/`, installed straight from GitHub) | `/install`, `/llms.txt` and the connector's instructions show the install command; `/connect` and `/run` link the repository; the site plan and the recorded-run page drop "Not released yet" |

## 6. The repository goes public

Done on 2026-11-19: the repository is public, after these were in place.

- **Rankings data license:** `rankings/DATA-LICENSE` is a draft that no attorney has
  reviewed. Answer 11 ships it as written, with a lawyer's read after.
- **Working files:** the release leaves them out (section 2). Nothing to remove by hand.
- **Issues:** on in the repository settings. The contest form needs it.

The bias disclosure was removed on 2026-11-18 at your word: no vendor pays PromptedCRE,
and the terms say so.

## 7. The domain

Done on 2026-11-19 at your word: www.promptedcre.com and promptedcre.com moved from the
gen-1 project to `promptedcre-v3` with Vercel's own move. www serves the site and
promptedcre.com redirects to it (308), Vercel's recommended setup and the one gen-1 used,
so `url` is `https://www.promptedcre.com`. The gen-1 project stays at its own `vercel.app`
address as a way back, and its repository is archived on GitHub (read-only; unarchive to
undo). To go back, move the two domains to the gen-1 project in Vercel.
