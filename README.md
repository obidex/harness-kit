# Harness Kit

One standard for how the owner's AI agents plan, build, verify, release and maintain, kept here
and installed as a pinned copy in every project. Public: generic rules, tools and sanitized
examples only.

- `.harness/` — the kit's layers; start with `.harness/README.md`.
- `DECISIONS.md` — append-only register; `K001` is the founding decision.
- `examples/` — a sanitized profile and a `CLAUDE.md` entry file.
- `.harness/tools/` — what projects run: `harness.mjs` (install, update, roll back) and `audit.mjs`
  (the structural audit); `.harness/audit/README.md` explains the audit.
- `tools/` — the kit's own checks, run in CI: `check-kit.mjs` (every rule has a complete record),
  `check-version.mjs` (a kit change is a new version), `test-harness.mjs` (install, update and
  rollback end to end); `probe-loading.sh` proves a project's sessions load the kit.
- `CHANGELOG.md` — what each version (tag `v<version>`) changed.
