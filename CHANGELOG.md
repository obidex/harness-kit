# Changelog

Each version is the tag `v<version>` on this repository, never moved (K003). Projects pin one in
`.harness/VERSION` and move with `harness-update` pull requests.

## 0.20.0 · 2026-10-08 · standing approvals have one home

- `standing-approvals.md` (K022, lookup): the one standing-approvals text every project copies
  into its project instructions, filled in with its own repositories, identity, inbox targets and
  reserved list. It mirrors O09, C07, A10, A15, C10, C12, O11, O14 and C14 and adds no gate; its
  Checks line (run the repository's own checks before pushing) is the line whose absence stopped
  the first test. A release that changes the block says "standing approvals" in its changelog
  entry (`check-version`), and the maintainer sends each project one inbox request with the new
  text. A15 points to it. `check-kit` checks the block: markers, every fill-in explained, the rule
  IDs it mirrors, and no email address or repository link.

## 0.19.0 · 2026-10-08 · settings load only in a one-repository session

- A15 (K021, Claude Code adapter): a cloud thread applies a repository's `.claude/settings.json`
  (identity, allow and deny rules, attribution) only while its session has exactly one repository;
  attaching a second takes effect at the next resume and drops them, so commits turn Claude-authored
  and routine pushes and edits reach the auto-mode classifier. A project thread never attaches a
  second repository (other repositories go through the coordinator or the inbox); a project with
  several repositories sets identity with `git config` per clone and states standing approvals in
  its instructions; a commit is never re-authored; a refused routine command is fixed at its cause.
- A10: PR branches are brought up to date on the server with the expected head SHA, never by
  pushing a local merge of main.

## 0.18.0 · 2026-10-08 · waits wake themselves

- C25 (K020): a passing check may never wake a thread; no turn ends waiting on CI, a review or
  another thread without one self-reminder (or a watcher) at the expected finish. Each turn first
  reads the PR's checks, reviews and comments since the last turn, so a finding that arrived
  mid-turn is answered. A wake reads the real state and continues or sets one more: at most three
  per wait, then STOPPED with why. Merge decisions read the PR (required checks green, a review
  PASS recorded, no unanswered finding), never another thread's message alone. Reminders are
  deleted at DONE (C23). C04 and C21 point to it.
- A06 (Claude Code adapter): the reminder is one `send_later` to the session; a PR activity
  subscription is not a wait.
- core reworded (and three section headings shortened) to stay under its cap; no rule or obligation removed. `test-harness` checks the installed core
  carries C25; the audit's judgment step 2 checks waiting turns.

## 0.17.1 · 2026-10-08 · the inbox pickup never depends on running the tool

- The `inbox` skill: when a session refuses to run `inbox.mjs` (code from a fresh clone), the
  coordinator does each step with the GitHub tools (the State line, the Evidence line, a comment,
  closing as completed); never an ask to the owner. The refused command is still reported in
  `Found:` (C14). Seen on the website's first wake (K018).
- `inbox.mjs channel --open`: when the API may not make the branch (a session proxy refuses
  `git/refs`), it says the exact `git push` to make it and opens nothing; the refused API call is
  reported in `Found:` (C14). `test-inbox` covers it.

## 0.17.0 · 2026-10-08 · an idle wait names who acts next; outside checkers are not wait points

- C03 (K019): a fourth status word, `WAITING ON <who> — <what>`, naming the card's wake (C22);
  `WAITING FOR YOU` only when the owner acts next; "nothing" is never a status while any party has an
  action. C22's wait record adds who acts next and what wakes it.
- O18 (K019): a checker no session can wake is not a wait point. The independent reviewer runs its
  checklist (checksums rebuilt, owner-effort pass, no secret on the wrong machine), the step goes to
  the owner, the checker audits afterwards. Only money or production steps wait for it, and the
  owner's message says: tell the checker "check".
- core and owner defaults reworded to stay under their caps; no rule removed. `test-harness`
  checks the installed copies carry C03's four status words and O18; the audit's judgment step 2
  checks the wait endings.
## 0.16.0 · 2026-10-08 · the inbox wakes through a pull-request comment

- `inbox.mjs` (K018): `send` wakes the receiving coordinator by commenting on that repository's
  wake channel, its open draft pull request from `inbox-wake` (never merged), which the coordinator's
  session subscribes to: free, no schedule, no routine. "Woke" is written on the request only after
  GitHub accepted the comment; otherwise one "Not delivered" note and exit 3, and a resend of the
  same ID tries again. A request is woken once. A repository's existing `wake-channel` pull
  request serves too (one channel per repository). `wake` (the read-only workflow job) only reports
  when a channel is open, and keeps the routine fire for a project without one, even when its token
  may not list pull requests. New `channel [--open]` checks or opens the channel.
- `inbox.md` and the `inbox` skill: the coordinator subscribes to the channel as the first step of
  every session; setup is one command and one proof. `test-inbox` covers delivery, refusal, no
  channel, no double wake and opening the channel.

## 0.15.0 · 2026-10-08 · alerts hold 10 minutes and end with "You:"; precise audit exceptions

- `notify.mjs` (K017): in a host's file store a new problem is held and sent only if still open 10
  minutes after it was first seen (`ALERTS_HOLD_MINUTES`); one cleared sooner sends nothing, so a
  flapping check (a timer between runs) never reaches the group. GitHub stores and outages send at
  once. New status `held`.
- Every PROBLEM ends with one `You:` line from `--you` (`nothing`, `<who> is fixing it` or
  `Needs you: <exact step>`; anything else is refused; default `nothing` in a silent topic); the
  3-hour escalation ends with a `Needs you:` line. RESOLVED is the short reply `✅ Fixed after N min`.
  `alerts.md` states the format: no commands in messages, Damascus time only.
- `audit.mjs`: a baseline entry with `commits` is a known exception: A10 and O09 skip exactly those
  commits and still FAIL on any other; it never accepts the whole rule in `--strict`. A10 also counts
  a commit authored as Claude (a squash merge turns its author into a co-author trailer).
  `test-harness` and `test-notify` cover both.
- `stale.mjs`: a missed-schedule alert gives its times in Damascus time (`notify.mjs localTime`).

## 0.14.2 · 2026-10-08 · a refused auto-merge says which setting, and old kit PRs still close

- `hands-update`: a repository with auto-merge off made `gh pr merge --auto` fail before the PR was
  recorded, so the old kit PR stayed open, `hands-keep` never started and the run failed with a bare
  GraphQL error (the website, every run since 5 Oct). Now both paths (a PR opened now, or found open)
  record the PR, close superseded kit PRs, then turn auto-merge on; a refusal fails the step with a
  line naming `allow_auto_merge` in the project's settings file. A PR found open now also gets its
  superseded PRs closed and auto-merge retried. `test-hands` runs both helpers.

## 0.14.1 · 2026-10-08 · a stuck run never stops kit updates

- `hands-keep`: the newest run replaces an older one (`cancel-in-progress: true`). On 6 Oct one run
  stayed "waiting" for two days and every later run queued behind it and was cancelled, so no kit
  update PR was kept current.
- `hands-update`: opening a kit PR closes every other open kit PR of the App's in that repository as
  superseded (a comment names the new PR) and deletes its branch, so an old one left behind its base
  never hides the new version. `test-hands` runs the block.
- `stale.mjs schedules`: only a run that finished and was not cancelled counts as the last run. Runs
  created and cancelled behind a stuck one now raise "Scheduled run missed" 36 hours after the last
  real run, and at once when none of the newest 30 finished. `hands-update` turns `hands-keep` on
  even when closing a superseded PR failed.

## 0.14.0 · 2026-10-08 · work finishes on its own; automations retire with it

- New core section "Finishing, waiting and cleanup" (K016): C20 finish line (a coordinator finishes
  the approved batch, no improvement rounds after it, the next item by board order), C21 full
  handoff (a CI result leads to review check, gate, merge, card closed, coordinator told, batch
  continued; "ready for you" only for an owner-only decision), C22 wait record on every waiting card
  (condition, owner, PR and commit, next action, deadline; stalls to that owner, missing cards to the
  coordinator), C23 cleanup is part of done (every reminder, check-in, routine and PR watch names its
  work and what retires it), C24 failure caps (count failed recovery, not waiting).
- O06 model roles follow the owner's final rules: plain status by existing checks, Haiku at low
  effort for logs and summaries only when it saves real work, the smallest reliable model for
  building, Opus for architecture, accounting and security.
- New owner default O17 owner effort: an API or token, a pre-filled link, a guided script, then
  bundling; what is left states its action count and minutes.
- The owner defaults stay within their 4096-byte cap by shorter wording, with no rule removed.
- `test-harness` proves C20-C24, O06 and O17 reach the installed files.

## 0.13.0 · 2026-10-07 · threads close when they report DONE

- New owner default O16 (K015): a thread is resolved in the same turn it reports DONE. Anything due
  later (a report, a re-check) becomes a check-in scheduled on the coordinator, never an idle thread.
  WAITING FOR YOU is only for true owner steps.
- The owner defaults stay within their 4096-byte cap by shorter wording, with no rule removed. O10
  now points to `.harness/alerts.md` for the STILL OPEN replies and the 3-hour escalation, which
  `notify.mjs` performs. O09 names the scrubber, and O14 names the `inbox` skill for the fields.
- `test-harness` proves O16 reaches the installed owner defaults.

## 0.12.0 · 2026-10-07 · never a relay; Haiku only for read-only helpers

- New owner default O15 (K014): no automation, routine or thread asks the owner to wake, nudge or
  relay between sessions. What cannot reach a session records its state for the next scheduled
  check, at most a daily-summary line, never "Needs you".
- O06 model roles gain Haiku (K014): only for read-only helper subagents (code search, CI logs,
  summaries, watchers); never writing money, stock or permission code, never reviewing.
- The owner defaults stay within their 4096-byte cap: O01-O14 are reworded shorter with the same
  rules (O04, O09, O13 and O14 most), and the header drops its column list.
- `test-harness` proves O15 and the Haiku role reach the installed owner defaults.

## 0.11.1 · 2026-10-06 · only the config stays pinned; a new scheduled job is not "never run"

- `notify.mjs resolve` unpins the problem's message (and its escalation): a resolved problem never
  stays pinned. `notify.mjs setup` unpins any later message pinned over the config, which hid it from
  every sender, then clears every pin inside the topics; it creates no topic twice. Dispatch `setup` once in
  the control repository to clean a group up (K013).
- `stale.mjs schedules`: a test proves a workflow new to its repository, or moved there, raises nothing
  before its first due time is 36 hours past; its clock starts when it appeared (already the
  behaviour since 0.10.0).

## 0.11.0 · 2026-10-05 · kit update PRs keep themselves current

- New control-repository workflow `hands-keep` (K012): every open kit update PR of the App's that has
  fallen behind its base branch (a strict required-checks rule) is brought up to date through the App
  with GitHub's update-branch, so its checks run again and auto-merge goes on. No session updates
  such a PR by hand any more. `hands.mjs keep` does the work; conflicted, draft, other and older
  PRs (`HANDS_KEEP_HOURS`, default 72) are left alone. Every update is logged in the hands log; a
  refused one is one problem in "Kit & Hands".
- `hands-update` turns `hands-keep` on, and runs it once, whenever it opens or finds a kit update PR
  (its job gains `actions: write`, this repository's own token, for that alone); `hands-keep` turns
  itself off when none is left. Cost: about 2-4 GitHub-hosted minutes per kit update, at most about
  75 for a PR left open 3 days (`.harness/hands.md`).
- Control repository: copy `hands-keep.yml` and the new `hands-update.yml` from
  `.harness/templates/hands/`, then pin 0.11.0.

## 0.10.0 · 2026-10-05 · missed scheduled runs alert

- GitHub's scheduled runs are best-effort, so none is trusted silently. `stale.mjs schedules --repo
  <owner/name> [--alert]` reads every scheduled workflow (its cron, in UTC) and its last run on schedule or by hand (a push or PR run does not count);
  one whose next run is more than 36 hours overdue (`HARNESS_SCHEDULE_OVERDUE_HOURS`) is missed. With
  `--alert` it opens the problem `schedule:<owner/name>/<file>` in the project's topic through
  `notify.mjs`, and replies RESOLVED once the workflow has run again. A schedule GitHub
  turned off for inactivity counts; one turned off by hand does not.
- `hands-settings` (control repository): the daily drift check's job runs it for the control
  repository into "Kit & Hands" (`actions: read` added to that job). No new job and no new minutes.
  That run cannot report its own silence: a host's tick running the same command covers it.

## 0.9.1 · 2026-10-05 · pinned actions; hands-settings runs again; the audit issue closes

- Every action in the kit's templates and its own workflows is pinned to a full commit SHA (the same
  v4/v1 releases as before, so no behaviour changes): a moved tag can no longer reach a job's write
  token or a self-hosted runner. `check-kit` fails on any unpinned `uses:`.
- `harness-audit`: a scheduled run that passes again closes the "scheduled audit failing" issue with
  a link to the passing run, instead of leaving it open.
- `hands-settings` (control repository) was an invalid workflow since 0.8.0: one `run:` line held
  ": " in a plain YAML value, so GitHub rejected the file and neither the dispatch nor the daily
  drift check could run. The line is a block scalar now. `check-kit` and the control repository's own
  `hands-check` (`hands.mjs control-check`) fail on any plain value holding ": ", which GitHub's strict
  parser refuses and the kit's lenient parser accepted.

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
