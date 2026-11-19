# Deploy checklist (William only)

You sign in, pay, push and deploy. An agent stages files, runs checks and makes code
edits when you say so; it never pushes, deploys or touches promptedcre.com. Run the
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
3. Export the release into a sibling folder, `../promptedcre-public`:

```bash
node tools/release.mjs
```

   It takes the last commit, leaves out the working files, runs the leak check on the
   files it will write, refuses to write while the README's install line has the
   placeholder, and prints what changed. `--dry-run` checks and compares without writing.
4. In `../promptedcre-public`, make its first commit and push it:

```bash
git init -b main
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
in `../promptedcre-public`. A second run on an unchanged commit reports no change.

## 3. Vercel

1. Create a **new** project and import the public repository. Do not import it into the
   gen-1 project, and do not add promptedcre.com to it yet.
2. Vercel detects Next.js. Leave the build and output settings at their defaults. Add
   no environment variables.
3. Node.js: `package.json` pins `24.x`, the version the site was built and tested on.
   Vercel's own default is 26.x, and the pin overrides it.
4. Turn on **Web Analytics** in the project (answer 18). The site already carries its
   component, drawn only in a build on Vercel. It counts page views without cookies.
5. Deploy. A new project's first deployment is a production deployment, served at the
   project's `vercel.app` address: public, and not promptedcre.com.

**Access.** New projects start with Standard Protection: preview deployments, including
branch pushes and per-deployment URLs, need a Vercel login. Production domains stay
public. An agent can't sign in, so test the connector on the project's `vercel.app`
production address, not on a branch preview.

**Indexing.** Vercel adds a noindex header only to previews and per-deployment URLs.
Search engines can index the `vercel.app` address once something links to it. If you
would rather they didn't before the domain moves, say so, and the agent adds a noindex
tag until then.

**Limits.** The MCP route is a Node.js function capped at 30 seconds. Every plan allows
at least 300.

**Call logs.** The connector writes one line per tool call to the runtime logs: the tool
and its outcome (ok, error, no-result or not-covered), never its arguments. Vercel keeps
runtime logs for 1 hour on Hobby and 1 day on Pro, and 30 days only with Observability
Plus. A weekly count of calls needs that add-on or a log drain, both paid, so deciding
whether to keep a longer record is yours. Until then the lines can be read in the
project's Logs view while they last.

## 4. The test window

Before promptedcre.com moves, test the deployment on its `vercel.app` address.

1. Tell the agent the address. It sets `url` in `lib/site.ts` to it (section 5), so the
   links the connector hands an agent point at the new site, not the old one. You commit,
   release (section 2) and push; Vercel redeploys.
2. The agent runs the automatic check and logs it in a folder outside the repository:

```bash
node tools/launch-check.mjs https://<url> --log <folder outside the repo>/launch-check.log
```

   It sends the pages and a connector call as GPTBot, ClaudeBot and PerplexityBot,
   checks the connector's answers to malformed requests, and runs the awkward set: an
   outline, the joint-venture-only record, a state outside coverage, a bad calculator
   input, the same call twice and a Form D date already past. While it runs, look at the
   project's firewall and bot settings (about 5 minutes): a bot faked from the laptop
   shows what those settings do to the name, not how real crawlers are treated.
3. The agent connects a fresh Claude Code session in an empty folder and runs one written
   playbook end to end against the deployed connector, then logs where it stalled:

```bash
claude mcp add --transport http promptedcre https://<url>/api/mcp
```

4. Ten operator questions, written or approved by you (about 10 minutes), go through
   Claude Code. Each is marked found, right tool and finished, with where it stalled. A
   question whose right record is not ranked first becomes a pinned search test and a
   ranking fix before Joey's run.
5. Fix what failed, release again, and check again.

The quick manual checks still hold: `node tools/mcp-call.mjs https://<url>/api/mcp list`
should print `server promptedcre 0.1.0` and sixteen tools, and `/install` should name the
`vercel.app` address.

## 5. Launch values

Four values live in `lib/site.ts`. The agent changes them and runs `npm run verify`; you
commit, release and push, and Vercel redeploys.

| Value | Set it to | What changes |
|---|---|---|
| `repoUrl` | the public repository's address | The rankings pages show the "Open a contest" links, the terms name the issue form, and the engine's install command appears |
| `url` | the `vercel.app` address for the test window, and `https://promptedcre.com` again in the deploy that moves the domain | Every absolute address: the paste-in sentence, the connector's links, the Markdown copies' "From" line, robots and the sitemap |
| `connectorLive` | `true` | Every page drops "Not live yet", the paste-in prompt becomes the primary action, and `/install` and `/llms.txt` stop telling agents the connector is not switched on. The `/api/mcp` route itself is not gated by this flag: it answers wherever the site runs, so flip the flag in the same deploy that makes the route public |
| `engineReleased` | `true` once the public repository is up (the engine is packaged: `bin/`, installed straight from GitHub) | `/install`, `/llms.txt` and the connector's instructions show the install command; `/connect` and `/run` link the repository; the site plan and the recorded-run page drop "Not released yet" |

## 6. Before the repository goes public

- **Rankings data license:** `rankings/DATA-LICENSE` is a draft that no attorney has
  reviewed. Answer 11 ships it as written, with a lawyer's read after.
- **Working files:** the release leaves them out (section 2). Nothing to remove by hand.
- **Issues:** check that Issues is on in the repository settings. The contest form
  needs it.
- Then make the repository public.

The bias disclosure was removed on 2026-11-18 at your word: no vendor pays PromptedCRE,
and the terms say so.

## 7. The domain

Your answer of 2026-11-18 moves promptedcre.com at launch, after the test window. promptedcre.com
stays on gen-1 until you move it. When you do:

1. Remove the domain from the gen-1 project.
2. Add it to this project.
3. Tell the agent to set `url` in `lib/site.ts` back to `https://promptedcre.com`, and
   release that in the same deploy.
