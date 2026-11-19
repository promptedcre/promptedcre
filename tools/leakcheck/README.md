# Leak check

Keeps private names, addresses, contact details and figures from a private
knowledge base out of this repository.

- `generate.mjs` reads a source config and writes a denylist. Both live outside
  the repo (default folder `~/.finn/promptedcre/`; override with
  `PROMPTEDCRE_DENYLIST` and `PROMPTEDCRE_DENYLIST_SOURCES`). The script is generic;
  every folder, field and term comes from the config or the source files.
- `check.mjs` scans the working tree (or, with `--staged`, the staged files) and
  reports `file:line:col category (length)`. It never prints a matched term.
- `selftest.mjs` plants random denylist entries in synthetic text and confirms
  each one is caught.
- `install-hook.mjs` installs a local pre-commit hook that runs the staged check
  and fails closed when the denylist is missing.
- `allow.txt` lists public names that must never be blocked.

On a machine without a denylist the check and self-test skip with a notice. On
the owner's machine (the local folder exists) a missing denylist fails.

Source config shape (`denylist-sources.json`, local only):

```json
{
  "root": "<path to the knowledge base>",
  "exclude": [".git", "node_modules"],
  "frontmatter": { "<folder>/": { "<field>": "person|org|address|text|email|phone|id" } },
  "bodyScan": true,
  "confidential": ["<file or folder whose figures must never leak>"],
  "extraTerms": ["<extra names to block>"],
  "allowTerms": ["<names to never block, such as the owner's own>"]
}
```

Regenerate after the knowledge base changes: `npm run leakcheck:generate`.
Never commit, print, paste or summarize the denylist.
