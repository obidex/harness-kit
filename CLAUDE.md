# CLAUDE.md — harness-kit

@.harness/core.md
@.harness/owner-defaults.md
@.harness/VERSION

This repository is the kit itself, so the rule files above are the source, not a pinned copy; there
is no `AGENTS.md` and no profile here. What is this repository's own:

- **Public.** Generic rules, tools and sanitized examples only: no project's names, hosts, people or
  secrets in any file, issue, PR or comment.
- **A rule change is a release.** A change to `.harness/` or `tools/` is a new `VERSION`, a
  `CHANGELOG.md` entry and, when always-loaded text or an adapter changed, a replay result
  (`replay/README.md`). Always-loaded text has byte caps (`tools/check-kit.mjs`) and must not grow.
- **Checks.** `node tools/check-kit.mjs`, `node tools/check-version.mjs origin/main` and every
  `node tools/test-*.mjs`, as `.github/workflows/check.yml` runs them.
- **Decisions.** `DECISIONS.md`, append-only (K…); a rule's record is its catalogue row.

In a Claude Projects cloud thread the repository's `.claude/settings.json`, hooks, skills and
`.mcp.json` do not load (adapter A15): set `git config user.name` and `user.email` in each clone
before the first commit, and edit files with the file tools (A16).
