# Changelog

Each version is the tag `v<version>` on this repository, never moved (K003). Projects pin one in
`.harness/VERSION` and move with `harness-update` pull requests.

## 0.9.0 · 2026-10-05 · a self-hosted lane for kit workflows; the stale-work check

- Every kit-installed workflow (`harness-audit`, `harness-inbox`, `harness-scrub`, `harness-stale`)
  runs on `${{ vars.RUNNER || 'ubuntu-latest' }}`: with the project's Actions variable `RUNNER` set
  to a self-hosted label, they use no GitHub-hosted minutes (K011). Privileged jobs still check out
  only the default branch's `.harness/tools` with `persist-credentials: false` and set up Node 22
  themselves; `harness-audit` takes the self-hosted lane only for a PR from the same repository (a
  fork's PR, or one whose fork was deleted, runs on `ubuntu-latest`). `.harness/hands.md` minutes
  table and the inbox cost updated.
- C15 stale-work check: installed workflow `harness-stale.yml` (daily and on dispatch, one 3-minute
  job) and `.harness/tools/stale.mjs` (`scan`, `report`). Lists open PRs idle 2 days (draft,
  conflicted, red, green-unmerged, waiting; bot PRs too), conflicted PRs idle 1 day, inbox requests
  queued or working idle 1 day, and `card` or `risk:*` issues idle 3 days (each overridable with an
  Actions variable) in one "Stale work" issue, edited in place, closed when empty, reopened when
  items return. Alerts go through `notify.mjs` (O10, K010): newly stale items open the problem
  `stale:<owner/name>` in the project's topic, named by the profile's `alerts.topic`, linking
  the issue; an empty list resolves it. Without `ALERTS_BOT_TOKEN` / `ALERTS_CHAT_ID` the problem is
  kept as an issue for the next tick. About 30 hosted minutes a month without a self-hosted
  `RUNNER`, none with one.
- Profile field `kit_updates.pr_body_lines`: standing authorization lines `hands-update` appends,
  each verbatim at column 1, to a project's kit update or rollback PR body, read from the project's
  default branch by the workflow itself (not the pinned kit's tool); a line outside the plain-text
  pattern or with a closing keyword is dropped with a warning; an already open update PR without
  the lines gets its body edited. The schema validator gains `maxLength` and `maxItems`.
- The "Stale work" issue counts only when filed by `github-actions[bot]`, so a planted marker issue
  cannot silence alerts.
- Audit C15 counts the installed `harness-stale.yml`; `tools/test-stale.mjs` joins the kit's checks.
## 0.8.0 · 2026-10-05 · one notification standard for every sender

- Owner default O10 rewritten: one bot, one Telegram group with topics ("Needs you" the only loud
  one, a topic per project, "Laptop & VPS", "Daily"); quiet hours 23:00-08:00 Damascus except a
  production outage; every PROBLEM answered by a RESOLVED (or STILL OPEN) reply to its own message; a
  silent problem open 3 hours escalates to "Needs you"; deduplication by key and caps per topic (K010).
- `.harness/tools/notify.mjs` (`setup`, `find`, `problem`, `resolve`, `tick`, `digest`, `send`,
  `test`): the one sender every workflow and host uses. The bot creates the topics and pins their ids
  in the group, so a sender needs only the token and the chat id. Problems live in a state file on a
  host, or as one issue each in a GitHub repository. `.harness/alerts.md`: the rules, how each sender
  uses it, who runs the clock, setup and cost.
- Control repository: `hands-report` alerts through `notify.mjs` and resolves on the next green run;
  the daily drift check also resolves `hands-settings`, ticks and posts the daily digest (no extra
  job); new `hands-alerts` (`find`, `setup`, `test`, `send`, `tick`, `digest` on dispatch; an hourly
  tick only when `ALERTS_TICK=on`, about 450 minutes a month). The group id lives in the file
  `ALERTS_CHAT_ID` there, over the older `TELEGRAM_CHAT_ID`.
- Audit O10: `notify.mjs` installed, and a file that calls the Telegram API itself is reported.

## 0.7.0 · 2026-10-05 · the inbox: cross-project requests as issues, picked up without the owner

- Owner default O14 and the `inbox` skill: work for another project is an issue labelled `inbox` in
  the repository that does it, with a stable ID, source, outcome, responsible coordinator, the
  covering owner decision or delegation, a state and completion evidence. It proceeds only on a
  verified cover; citing a decision never expands it (K009).
- `.harness/tools/inbox.mjs` (`send`, `pending`, `state`, `wake`): a resend with the same ID files
  nothing; `done` needs evidence and closes the issue.
- Installed workflow `harness-inbox.yml`: when an issue gets the `inbox` label or is reopened, one
  short job wakes the receiving coordinator's routine, only if that issue is a queued request, so the
  AI runs only when there is work and never twice for one request. Setup and cost: `.harness/inbox.md`.
- Audit O13 (a schedule more often than daily names its minute estimate) and O14 (inbox installed
  and the label declared).

## 0.6.0 · 2026-10-05 · settings applied on change, not hourly; metered resources need notice

- `hands-settings` no longer runs hourly with a job per repository. It runs on a dispatch right
  after a settings PR merges, and once a day as a drift check: one job (`hands.mjs drift`, which
  refuses every write under `HANDS_READ_ONLY`) compares every enrolled repository with its file, and
  only a repository that differs gets an apply job. One repository's failed check does not stop the
  others; a cancelled run starts no apply; a dispatch for a repository that is not enrolled fails.
  The report job runs only when something was applied or failed (K008).
- `apply` reads the settings back after writing and fails unless they match the file.
- `HANDS_PAUSED` (control-repo Actions variable) pauses chosen repositories, or all: the drift check
  skips them and apply refuses them. `.harness/hands.md` documents the emergency path (pause,
  repair, bring the file into agreement, resume) and the minutes each kit workflow costs.
- Owner default O13: nothing that uses GitHub-hosted minutes, a paid service, storage or another
  metered resource is added or increased without telling the owner first, with an estimate.

## 0.5.1 · 2026-10-04 · fixes from the first real hands runs

- The `report` jobs of `hands-settings` and `hands-update` also grant `contents: read`, which
  `hands-report` declares; without it GitHub refused to start either run (startup failure).
  `test-hands` now compares every permission a caller grants with what the called workflow declares.
- Audit O09 no longer judges a body changed in the last ten minutes: on a new PR it raced the
  scrubber and failed on the footer the scrubber was about to remove.

## 0.5.0 · 2026-10-04 · one App holds GitHub's hands; settings as code

- `.harness/templates/hands/`: the control repository's workflows. `hands-settings` applies each
  enrolled repo's `.github/harness-settings.json` (repository settings, rulesets with strict required
  checks, auto-merge, labels) hourly with the hands App; `hands-update` opens kit update PRs as the
  App with auto-merge; `hands-report` logs every write to a monthly issue and alerts a failure once
  by Telegram; `hands-check` validates the control repo's PRs (K007).
- `.harness/tools/hands.mjs` (`validate`, `control-check`, `discover`, `plan`, `apply`, `export`)
  and `.harness/settings.schema.json`.
- Adapter A14 "One App holds GitHub's hands"; the audit checks the settings file is valid and
  matches the live repository. A13 now judges the App's update PRs.
- Removed from projects: `harness-update.yml` and the `HARNESS_TOKEN` secret it used.
- `harness.mjs` refuses a lock path that leaves the project or passes through a symlink.
- Audit A13 and A14 never turn a project's strict audit red on update: no settings file yet, live
  drift until the next apply, and an update PR from the old token are UNKNOWN.

## 0.4.1 · 2026-10-04 · update PRs carry one identity

- `harness-update.yml` commits as the identity whose token opens the PR (unless
  `HARNESS_GIT_NAME`/`HARNESS_GIT_EMAIL` are set), so the squash merge carries no
  `Co-authored-by: harness-kit` line (O09). Seen on the first real unattended update.

## 0.4.0 · 2026-10-04 · attribution scrubber, App credential, the new tool applies itself

- Installed workflow `harness-scrub.yml` with `.harness/tools/scrub.mjs`: removes "Generated by
  Claude Code" lines, Claude co-author and session lines and claude.ai links from issue, PR,
  comment and review bodies right after they are posted (O09 enforced; K006). The audit's O09 also
  checks it is installed and that recent bodies carry no attribution.
- `harness-update.yml` mints a GitHub App token when `HARNESS_APP_ID` and `HARNESS_APP_KEY` are
  set, else uses `HARNESS_TOKEN` (A13).
- `update` and `rollback` hand the fetched kit to the target version's own `harness.mjs`, so new
  managed-file rules apply on the update that brings them. `harness.mjs paths` lists every path the
  old and new locks name, and `harness-update.yml` stages exactly those (it used to miss
  `.claude/skills/`).
- X02 resolved: the website aligns to O06 (K006).

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
