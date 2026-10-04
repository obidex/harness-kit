# Changelog

Each version is the tag `v<version>` on this repository, never moved (K003). Projects pin one in
`.harness/VERSION` and move with `harness-update` pull requests.

## 0.3.0 · 2026-10-04 · prevention principle and the correct skill

- Core C19: every owner correction or repeated failure ends with its prevention, at the highest level
  worth its cost; the audit reports corrections that recurred (judgment review step 8).
- Kit skill `correct` (`/correct`), adapted from pstack (MIT, credited in the file): the prevention
  ladder, diagnosis of repeats before escalating, two-sided proof (catches a real failure, accepts
  correct code), existing defects kept on release tracking, and a prevention register in a lookup
  doc, never in always-loaded files (K005).
- The installer now also manages `.claude/skills/<name>/` for each skill the kit ships in
  `.harness/templates/skills/`.

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
