# Changelog

Each version is the tag `v<version>` on this repository, never moved (K003). Projects pin one in
`.harness/VERSION` and move with `harness-update` pull requests.

## 0.2.0 · 2026-10-04 · card H2, prove the kit

- Audit: `.harness/tools/audit.mjs` (structural, one result per rule) and `.harness/audit/README.md`
  (the judgment review). Installed workflow `harness-audit.yml` runs it on relevant pull requests,
  with a baseline so only new FAILs fail.
- Initializer and updater: `.harness/tools/harness.mjs` (`init`, `update`, `rollback`, `status`,
  `latest`) and `.harness/kit.lock.json` in each project. Installed workflow `harness-update.yml`
  opens the maintenance PR and turns on auto-merge.
- `CLAUDE.md` also imports `.harness/VERSION`, so a session can state its kit version.
- The profile no longer carries `kit.version`: the version's one home is `.harness/VERSION`.

## 0.1.0 · 2026-10-04 · card H1, extract and classify

- Core, owner defaults, profile schema, the web-app and public-website presets, the Claude Code +
  GitHub adapter, the rule catalogue and the rules left project-specific.
