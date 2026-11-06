# CLAUDE.md — <project name>

@.harness/core.md
@.harness/owner-defaults.md
@.harness/VERSION
@AGENTS.md

The kit files above are a pinned copy: the version line is `.harness/VERSION`, the project's facts
are in `.harness/profile.json`, and `.harness/kit.lock.json` lists every kit-managed file. Never edit
those here: changes come through the kit's maintenance PRs (`hands-update`). `AGENTS.md` is this
project's own rulebook. This file adds only what is Claude-specific.

In a Claude Projects cloud thread the repository's `.claude/settings.json`, hooks, skills and
`.mcp.json` do not load (adapter A15): set `git config user.name` and `user.email` in each clone
before the first commit, and when a rule names a skill (`correct`, `inbox`), read
`.claude/skills/<name>/SKILL.md` and follow it.
