# Changelog

Each version is the tag `v<version>` on this repository, never moved (K003). Projects pin one in
`.harness/VERSION` and move with `harness-update` pull requests.

## 0.55.0 · 2026-11-22 · a failed settings apply is its repository's own alert (K062)

A green run that applied another repository no longer closes the alert of one whose apply failed.
Nothing always-loaded changed.

- **`hands-settings.yml`**: each apply job records `<owner/name> success|failure` beside its log; the
  drift check writes the repositories that match their file (`HANDS_MATCHED_FILE`) and closes their
  apply alerts.
- **`hands-report.yml`**: with per-repository results, one alert per repository
  (`hands/<job>/<owner/name>`), closed only by that repository's green apply; a failure outside the
  repository jobs stays the job's own alert. `hands-update` and `hands-keep` are unchanged.
- **`hands.mjs drift`**: `HANDS_MATCHED_FILE`.
- **`hands.md`**: GitHub refuses the GitHub Actions integration as a bypass actor on a personal
  account's repository, and a refused write stops the rest of that repository's apply.

## 0.54.1 · 2026-11-22 · what starts the reviewer on hosted minutes, said correctly (K061)

- **`harness-review.yml`** (comment) and **`review.md`**: on a private repository without a self-hosted
  runner both variables must be set, to any value, for the job to start; the settings file's `until`
  then decides. 0.54.0 said the file could only shorten the variable's end time, which is not what the
  code does. K061 supersedes that clause of K060. No behaviour change.

## 0.54.0 · 2026-11-22 · the second reviewer's settings live in a file in the repository (K060)

No settings page and no owner step to switch the reviewer on, set it up or end it. Nothing
always-loaded changed.

- **`.github/harness-review.json`** (a project's own file, on the default branch): `until` with the
  owner's `command`, the four identifiers, `sweep_rule`, lower caps. An Actions variable counts only
  for a setting the file leaves out; caps take the lowest. A file that is unreadable, names an unknown
  key, or gives an end time without the owner's command switches the reviewer off.
- **`review.mjs`**: `settingsOf` and `settingsText`; `run` reads the file from the default branch first
  (a fetch failure fails the job, never falls back); `switch` says where the end time lives.
- **`sweep.mjs`**: reads the same file from its checkout of the default branch.
- **`harness-review.yml`**: on its own runner or a public repository the job no longer needs
  `REVIEW_UNTIL` to start; on a private repository without a self-hosted runner it still needs both
  variables, as before, so no new hosted minutes.
- The kit's own file: on until 22 Dec 2026, 23:59 (UTC+3), the owner's one-time command.

## 0.53.1 · 2026-11-21 · the first clean-up run after a kit update reaches back a full day (K059)

- **`scrub.mjs`**: a green run anchors the sweep only if it was created after the workflow file last
  changed (`commits?path=`). Older runs ran the previous file, which did not sweep, so the first run
  after an update sweeps the last day: scrub runs cancelled while the update was on its way lose
  nothing. A listing may hold 3,000 items (was 1,000), room for a busy repository's day.

## 0.53.0 · 2026-11-21 · chores apart from tests, one scrub run per burst, checks scaled to the change with a nightly full run (K059)

A comment's few seconds of clean-up no longer wait behind a test run, and thirty comments no longer
start thirty runs. Nothing always-loaded changed.

- **Chore lane**: `harness-scrub`, `-guard`, `-audit`, `-inbox`, `-review`, `-stale` and `-wake` run on
  `${{ vars.CHORE_RUNNER || vars.RUNNER || 'ubuntu-latest' }}`; `harness-sweep` stays on `RUNNER`. With
  `CHORE_RUNNER` unset nothing changes. The audit's **A19** fails a public repository that sets
  `CHORE_RUNNER`, as it does `RUNNER`.
- **`harness-scrub`**: issues and comments share one concurrency group per repository (one run going,
  one waiting); a pull request's own events keep one group per pull request. Each run cleans its event
  and sweeps every body updated since the last green run (`scrub.mjs`, `sweep`). A fork's or
  Dependabot's event keeps its own group and sweeps nothing. The job reads its own run list
  (`actions: write` was already granted; the kit's own `scrub.yml` gains `actions: read`).
- **`scope.mjs`** (new): `decide` says whether a pull request's own CI may run light (documents only,
  outside build, test and fixture paths and a documentation site's pages; the profile's new optional
  `ci_scope.full`), never without a nightly schedule in
  the calling workflow; `gate` is the one required check's verdict. Tested by `tools/test-scope.mjs`.
- **`ci.md`** (new, lookup): the chore runner's setup, the burst, the scoped CI pattern with its gate
  and nightly run, splitting the long test job, and the finish line. `hands.md`'s minutes table updated.

## 0.52.0 · 2026-11-21 · owner steps are designed away at the plan, tried on every rung, and carry a `Tried:` line when one reaches him (K058)

The owner was handed a step agents could have done. The rules sent it to him as written; they now try
everything first and show the proof.

- **O17** (loaded): a planned owner step lists the designs that need no one and why each fails, for
  review before the build. Then the ladder: redesign, an API or script, his terminal (Remote Control),
  his signed-in browser or computer use. A pre-filled link is no longer a rung. The only stops: his
  password, a code, a payment. A fresh reviewer tries the step without him first, and what reaches
  him carries one `Tried:` line naming each rung and what stopped it (a step sent without it is a
  lesson the same day).
- **O04** (loaded), the owner's choice A: a secret is first designed away (made where it lives, moved
  as an unopened file, an App's short-lived tokens); else an agent carries a new machine secret
  straight from its page to its machine, never into chat, an issue, a file, a log or memory, and its
  thread ends saying so; the owner last.
- **O01** (loaded): the reserved kinds are O17's stops, a new account, a physical step, a secret only
  he holds, and the rest as before; a token, an app or a step on his machine is no longer his by kind.
- **O06** (loaded), **A23**, `models.md`: every scheduled helper task names Haiku, never the account
  default.
- **`owner-step.mjs`** (new): `plan` fails a card with an owner step and no "No-one designs" list (or a
  secret step without the three no-carry designs); `ask` fails a message that waits on the owner
  without a complete `Tried:` line. **`owner-steps.md`** (new) holds the procedure and the formats.
- By the owner's decision (K058, C17): the `owner-defaults.md` per-file cap rises from 4160 to 4544
  bytes (the two loaded files' caps together about 3%) and the kit's share of a fresh install from
  4000 to 4064 tokens, so every limit of O04 and O17 loads. `owner-steps.md` says how to read a
  project's older copy of the kit wording and the standing-approval "Not covered" list; a project's
  own stricter choice still wins. Replay result included.

## 0.51.0 · 2026-11-21 · the wake job can start the run by its claim label: no token and no call outside GitHub (K057)

A label on an issue does start a scheduled task that has a GitHub trigger for it. The two recorded
"failures" of that test were a trigger set to the wrong event.

- **`WAKE_START=label`** (Actions variable): `wake.mjs fire` posts its receipt, then sets the claim
  label `coordinator-running` on the STATE issue, and that label starts the task. Decision, caps,
  receipts and stops are unchanged. Without the variable nothing changes: `/fire` as before.
- **`wake.mjs started`**: a run that a label started runs it first and works only on `WAKE-START:
  OK` (the job's own fresh receipt, the claim on the STATE issue, and no run having taken that start
  yet: OK writes the "Run started" comment that spends it), so a claim label set by anyone else, or
  set again on a spent receipt, starts nothing that works.
- **`harness-wake.yml`** runs with either the routine URL or the label start, and passes the variable.
- **`wake.md`** "Start by label": the trigger to set (Issue: Labeled, filtered to the claim label),
  what to delete after the switch (URL variable, token secret, API trigger), and what differs (no
  session link; the run's first comment on the STATE issue is the proof).
- **A hand-off** (K056) in a project that switched: its claim fires the label trigger too, and
  `wake.mjs started` refuses that run (the newest receipt is the hand-off's), so the run
  `fire_trigger` starts is the only one that works. A hand-off that yielded to the job's receipt beside
  it is passed over, so the job's own label start still works.
- A project switches by its own card. Nothing is switched by taking this version.

## 0.50.1 · 2026-11-21 · a hand-off starts the run with no added text

The first real hand-off showed that a scheduled task which starts a new thread at each run refuses a
start with added text ("nothing was run"), and starts with none.

- `wake.mjs handoff` no longer prints a hint to pass along, and its `START` line, `wake.md` and the
  `inbox` skill say: call `fire_trigger` with the id and no text. The run reads its queue from the
  repository, as every run does.

## 0.50.0 · 2026-11-21 · the session that hands work to another project starts that project's run itself (K056)

The owner, on outside wake-ups failing: find a way not to need them. A session can start another
project's coordinator run directly, so the one that hands work over does it in the same turn.

- **`wake.mjs handoff --repo <receiver> [--issue <n>] [--from <sender>]`** (new): run in a session,
  it takes the wake job's own decision for the receiving repository and prints the line the session
  obeys. `HANDOFF: START <trig id>`: the claim and a receipt are written, and the session calls
  `fire_trigger` once. `HANDOFF: QUEUED`: a run is on, or a cap or stop holds; the `wake` label
  waits on the item. `HANDOFF: NOTHING`: nothing to start. `--failed "<error>"` releases a start that
  did not happen (same item, within 30 minutes). `--dry` writes nothing and prints `HANDOFF: DRY`.
- **No cap, stop or one-at-a-time rule changes.** A hand-off receipt counts as a run in every cap,
  and a failed one as a failed start, only from an account that may write to the repository. A
  hand-off sets no stop and lifts none. Two starts written at the same moment: it yields to the job,
  and between two hand-offs the earlier receipt keeps the run.
- **`inbox.mjs`** prints the hand-off line after `send` and after `state --to done` or `blocked`
  (the project named in the request's Source), and the `inbox` skill makes it a step of both.
- **A receiving project adds `.github/wake.json`**, `{ "runTask": "trig_…" }`, naming its
  coordinator-run scheduled task. Until it does, the sender names it with `--task <trig id>`, or the
  hand-off only queues. A repository that lowered `WAKE_DAILY_CAP` repeats the number there as `dailyCap`.
- No new workflow, schedule, secret or permission; nothing runs on GitHub for a hand-off.

## 0.49.0 · 2026-11-20 · the second reviewer is off by default, on only until a time the owner names; a full check of existing code (K055)

The owner, on hearing a project report its reviewer as "on": the set-up should be everywhere, but the
credit is spent on his command, for a time he names, not as a standing rule.

- **Off by default.** `harness-review` now runs only while the Actions variable `REVIEW_UNTIL` holds a
  date and time with its offset that has not passed (`2026-11-30T23:59+03:00`). Not set, unreadable or
  passed is off, and so is a time more than 45 days ahead, so no value means "on for good"; the end
  time switches it off by itself. **A project
  that had the reviewer running stops being reviewed when it takes this version**, until the owner's
  command sets `REVIEW_UNTIL`. The four identifiers stay as the set-up.
- **Only the owner's command switches it on** ("reviewer on until <date>", "reviewer off"): no rule,
  schedule or agent pass sets, extends or re-creates the variable (`review.md`).
- **`review.mjs`:** `switch --until <value>` checks a value and says when it ends (it sets nothing);
  `spent --since <day>` adds up a period for the report after it.
- **`harness-sweep.yml`** (new, installed in every project) and **`sweep.mjs`**: one full check of the
  code that already exists, started by hand from the default branch, inside the owner's window. It
  reads every tracked code file folder by folder and files one issue per area with findings, each
  graded blocker, major or minor, plus one record issue with the numbers. `estimate` (the default)
  sends nothing and prints the most a check could cost. Caps in code: $30 a check, 250 areas, 320
  minutes a run; a call with no known result counts at its worst case; a stopped run continues where
  it stopped. Its own federation rule
  (`REVIEW_SWEEP_RULE`). A symbolic link is never followed and a file that may hold a secret is never
  sent. Advisory: it gates nothing.
- The full check refuses a public repository: its issues would publish the defects it finds.
- `test-review`: 73 checks; `test-sweep` (new): 49 checks.
## 0.48.2 · 2026-11-20 · alerts: three steps a message, links kept, no digest promise; export on a private repository; the audit and a decision corrected in its own pull request

Five findings on the kit's tools (three from projects running it). No loaded text changed; no replay needed.

- **`notify.mjs`, the last STILL OPEN reply** of a capped problem no longer promises "a line in the
  daily digest" (retired, K039). It says nothing more is sent until it is resolved.
- **`notify.mjs`, one "Needs you" message carries at most three steps** (O02): the most urgent, then
  the oldest. The rest follow as the next message once those are sorted or an hour has passed, not
  in the same tick (unless the joined text fails the plain-words check and each step goes alone, as before). Before, every step due together went into one message, however many.
- **`notify.mjs`, a batched message keeps each step's link**, beside its place on the `Where:` line.
  Before, the links were dropped whenever two or more steps went together.
- **`hands.mjs export`** no longer fails on a private repository, where GitHub answers 405 for
  interaction limits: the field is left out and a line says so. A plan or apply whose settings file
  names interaction limits there still fails, as it could not apply them.
- **`audit.mjs` C17** ("a written decision is never edited", K052) read the checked-out branch's own
  commits, so a decision file a pull request added and then corrected in a review-fix commit failed
  `harness-audit`, although the squash puts it on the default branch as one addition. It now reads the
  default branch's history plus the checkout's change against it as a whole (merge base to HEAD):
  adding, correcting or renaming a new file in one pull request passes; editing a decision already on
  the default branch still fails, before and after the merge.
- `test-notify`: 161 cases; `test-hands`: 125 checks; `test-decisions`: 22 checks. Each new one fails
  without its fix.

## 0.48.1 · 2026-11-20 · the second reviewer no longer skips a pull request whose check was replaced

Found on the first two repositories after the kit (the rollout, roadmap #31): neither got its comment.

- **`review.mjs`:** a check run cancelled because a newer run of the same check replaced it (a
  workflow's own `cancel-in-progress`, on a quick second push or an edited description) counted as a
  failed check for good, so that commit was never reviewed. It is now left out and the newer run
  decides. A cancelled run with no newer run of its name, and a failed run, still stop the review.
- **`harness-review.yml`:** `harness-scrub` joins the workflows that start it. On a runner lane with
  one runner the review job held the runner while `harness-scrub` for the same pull request waited
  behind it, the 90-second wait ran out, and nothing started the review again.
- `test-review`: 62 checks; the new one fails without the fix.

## 0.48.0 · 2026-11-20 · a second reviewer on every pull request, with no key (K054)

- **`harness-review.yml`** (new, installed in every project) and **`review.mjs`**: when a pull-request
  workflow finishes green and every check on the head commit is green, one job asks a model what it
  would block the merge for (C10's question) and keeps one comment on the pull request: the findings, or
  "no blockers found". A later commit rewrites the comment. New lookup file `review.md`.
- **Advisory** (O07): never a required check, never an approval, never in place of C10's reviewer.
- **Off until set up.** The job is skipped until the Actions variable `REVIEW_FEDERATION_RULE` is set,
  so this update changes nothing by itself. Setup is in `review.md`: a reviews workspace with its own
  spend limit, one federation rule per repository pinned to this workflow on the default branch, four
  variables. No API key exists (workload identity federation).
- **Models:** Sonnet by default, Opus on high-risk paths (the profile's `risk.tier3_paths`; workflows
  and agent configuration everywhere); Haiku never reviews (O06).
- **The pull request is data:** `workflow_run` only, nothing of the pull request checked out or run,
  input tagged as data, the answer posted as text with no HTML comment and no mention. A fork's pull
  request, a bot's, a draft and a documents-only change are never sent to the model.
- **Caps, per repository and UTC day:** $2.50 and 40 reviews, one per commit, 5 minutes a run;
  `REVIEW_DAILY_USD` and `REVIEW_DAILY_CAP` may only lower them. Over a cap or out of credit: one line
  on the pull request, and merges go on.
- **Cost (O13):** about $0.09 a typical review on the default model, $0.18 on the high-risk one, from
  the API credit; one short job per finished pull-request workflow on the project's `RUNNER` lane
  (GitHub-hosted minutes only on a private repository without one).
- **The kit reviews itself:** `.github/workflows/harness-review.yml` is the template, byte for byte.
- New `test-review` (61 checks: the skips, the caps, the wait for checks, the exchange, the workflow's
  permissions and trigger; each cap and skip fails without its code).
- No loaded text changed; no replay needed.

## 0.47.1 · 2026-11-20 · the control workflows' three action pins move, in the templates

Since 0.47.0 a control repository's workflows must equal the pinned kit's templates, so Dependabot there
can no longer move a pin the templates hold. This release moves the three that were behind, each read
at its source before the pin (these workflows hold the App key).

- **`actions/create-github-app-token`** v1.12.0 to v3.3.0 (`64ab729a`), nine uses. v2 removed the
  underscore inputs (none used here); v3 runs on Node 24 and reads a proxy only with
  `NODE_USE_ENV_PROXY` (hosted runners use none). `app-id` still works and is marked deprecated in favour
  of `client-id`; it stays, since moving needs a new variable in each control repository.
- **`actions/upload-artifact`** v4.6.2 to v7.0.2 (`cf430e03`), three uses. Node 24; the new `archive`
  input defaults to zipping as before. No input the templates pass changed.
- **`actions/download-artifact`** v4.3.0 to v8.0.2 (`9000827c`), one use, in `hands-report`. Two changes
  matter. Since v5 a run's only matching artifact unpacks straight into `path`, not into a folder named
  after it: `hands-report` read `logs/*/log.txt` and would have logged no write for every run with one
  log artifact, without failing. It now reads both layouts. Since v8 a digest mismatch fails the step
  (it was a warning), after the files are unpacked; the step keeps `continue-on-error`, so the run still
  logs the writes it downloaded and still alerts.
- **`lib.mjs` `parseYaml`**: a block scalar holding `$'` or `$&` lost those characters (a replacement
  pattern); it is kept as written. Found by the new check below; no workflow was affected, only readers.
- **`test-hands`**: the write-log step runs as GitHub runs it against one artifact, several and none;
  every control workflow action is pinned by full commit, the same commit in every file; no removed
  token input is passed. The one-artifact and YAML checks fail without their fixes.
- **The kit's own Dependabot** also watches `.harness/templates/hands` (monthly, 3-day cooldown, one
  grouped PR). Its PR is the signal: a template is kit content, so the pin ships in a release PR and the
  bot's is closed.
- No loaded text changed; no replay needed.

## 0.47.0 · 2026-11-20 · work in bulk; decisions one file each; control workflows travel with the pin (K051, K052, K053)

The owner's 20 Nov 2026 rule for working in bulk, and three things parallel work needs.

- **C20** (loaded): ready cards start now, a thread each, with no limit on threads; one waits only on a
  running card's files or tables, or the owner. It replaces "next items start by board order when a slot
  opens". The rest of the rule is the new lookup file `bulk.md`: subagents wherever they speed the work
  up, the owner's signed-in browser before any owner step (limits unchanged), scarce resources protected,
  one report at the end. Core stays under its cap (8701 of 8704 bytes, 7 more than before): C20's first
  sentence is three words shorter, no rule removed.
- **HI05** (new, capability host/infra): an AI agent on a project's own machine is no longer forbidden
  where the owner lifts the ban for that machine by name; it is proposed on a card and nothing is
  installed, signed in or started before he approves it. Supersedes K016 item 3 to that extent.
- **Wake caps** (`wake.mjs`): 48 runs a day per repository (was 8) and 12 per issue (was 3); an issue is
  stopped for good after 36 runs in 30 days (was 9, the same three full days). Still a loop-stopper: one
  run at a time, the chain, stuck and failed-start stops and the backstop are unchanged, and
  `WAKE_DAILY_CAP` may still only lower the cap. The receipts read per decision rise to 20,000 comments.
  Cost (O13): no money; up to 48 coordinator sessions a day per repository on the owner's subscription,
  and one job of a few seconds per wake as before. `test-wake` pins the three numbers.
- **Decisions, one file each** (K052): new `tools/decisions.mjs` (`check`, `next`) and `decisions.md`. A
  new decision is `decisions/<ID>.md` beside the project's register, which is closed and keeps its
  entries; nothing is migrated. The audit's C17 runs the check and flags a decision file changed after it
  was written. A project's next decision after installing this release is a file. New `test-decisions`.
- **`hands-update`** (K053): the control repository's own PR now carries its workflow files as the target
  release's templates, through the new `hands.mjs control-update`; before, only `HANDS_KIT_VERSION` moved.
  `control-check` fails a control workflow that is missing or differs from the pinned kit's template.
  `test-hands` covers the copy, the removal, the staged list and the check (each fails without the change).
- The kit's own register: `DECISIONS.md` is closed at K050; K051-K053 are `decisions/K051.md` and on.
- `project-specific.md` L17: the kit sets no thread limit; a project names only its scarce resources.
- Replay 0.47.0 recorded (loaded text changed).

## 0.46.2 · 2026-11-19 · the control repository's main gets a check of its own (K050)

- **`hands-check` template**: it also runs on each push to `main`, with every step but the pull request
  description's; a run that started on main is never cancelled. Before, no workflow in a control
  repository ran on a push, so main showed no check after a merge (C13) and the only push run it could
  ever show was a workflow file GitHub could not read: one such failure stayed "the last check on main"
  for weeks after its fix. `test-guard` covers the trigger, the skipped step and the concurrency line
  (fails without the change). Cost: about one hosted minute per merge to the control repository
  (`hands.md`).

## 0.46.1 · 2026-11-19 · a stranger's issue is never an inbox request (roadmap #125 A5)

- **`inbox.mjs`**: `pending` and the `wake` job count an `inbox` issue only when its author has write
  access (owner, member, collaborator) or is an App. On a public repository an issue form can set the
  `inbox` label for anyone; such an issue now wakes nobody and is never pending. `test-inbox` covers a
  stranger's issue (fails without the change) and an App's.
- **The `inbox` skill**: the GitHub-tools fallback for `pending` applies the same author rule.

## 0.46.0 · 2026-11-19 · rules that fit the new model: finishing work, effort, a clean-up pilot (K049, roadmap #125)

The owner approved the 18 Nov radar package (19 Nov 2026): rules tuned to Anthropic's guide "Prompting
Claude Fable 5.2", a clean-up pilot and a dated safety sweep.

- **C27 Finishing work** (new, loaded): Anthropic's "Finishing work" block, unchanged. It loosens no
  safety refusal (C14), reserved owner step (O01) or real-data tap (O19). `test-harness` pins its text by hash.
- **C14** now says: a missing repo, secret, connector or tool is named, never mocked, guessed or swapped
  for another secret, repo or account, and the work that does not need it is finished (was "name it and stop").
- **C17**: a cap on loaded text rises only by the owner's decision (was "must not grow"). Caps: core
  7168 → 8704 bytes, owner defaults 4096 → 4160 (K049).
- **C26** gains its one exception: a clean-up card may change existing patterns on purpose.
- **O06**: a thread's model is set per thread and only the coordinator switches it (was "never switched").
- **A23**: effort follows the guide (low for helpers, medium where results hold, high for hard and
  unattended work, xhigh or max only with a measured gain); subagents' model and effort are named or
  inherited knowingly; the weekly usage line goes in the weekly brief (the daily summary is gone, K048).
- New `models.md` (lookup): which model and effort each kind of run uses today, and the guide's effort advice.
- New `cards/cleanup.md` (lookup): the clean-up card template with Anthropic's ownership sentence, a
  fresh reader that lists what the summary leaves out, and the pilot's cap (one card per project per week, two weeks).
- `harness-guard` fails any PR that adds or changes `.claude/settings.local.json` or `CLAUDE.local.md`,
  whoever wrote it: saved "don't ask again" answers have carried secrets into pushed repositories.
- Loaded text and an adapter changed: replay result `replay/results/0.46.0.json`.
- Projects: the always-loaded files grow by about 1.6 KB (one import, no new file to wire).

## 0.45.0 · 2026-11-18 · urgent only, plus one weekly brief (K048, roadmap #124)

The owner's pick (option A, 18 Nov 2026): his Telegram interrupts only for an outage, or for a step only
he can do once it has blocked work for 24 hours; everything else waits for one short weekly message.

- `needs_you` is held 24 hours (`ALERTS_NEEDS_HOLD_HOURS`, default 24) before it is sent; an outage still goes at once.
- `good_news` is kept in a host's file store and never sent on its own; a store that keeps no news refuses it.
- New `brief` command: Saturday 10:00 Damascus (`ALERTS_BRIEF_DAY`, `ALERTS_BRIEF_HOUR`), at most 3 good-news
  lines, then each open Needs you not already sent alone, or "Nothing needs you."; skipped in an empty week;
  once a week. `summary` is retired and posts nothing.
- O10's loaded line says the new shape (same size); the catalogue row and `alerts.md` say the rest.
- A host moves to it by pinning this release's `notify.mjs` and calling `brief` from its tick instead of `summary`.

## 0.44.1 · 2026-11-18 · templates pin the same actions as the kit (harness-kit#69)

Found by the coordinator queue run of 13 Nov 2026: Dependabot moved the kit's own workflows to
`actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0 (#46, #47) but never reads templates, so an
installed project's Dependabot PR for the same actions drifted its kit-managed copies and stayed red.

- Every template under `.harness/templates/workflows/` and `.harness/templates/hands/` pins
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` and
  `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` (was v4.4.0 of both).
- Every template's setup-node sets `package-manager-cache: false`: setup-node v5+ turns npm caching on
  by itself when a project's `package.json` names npm, and these jobs run only the kit's own tools,
  several with write permissions. No template used `always-auth`, `registry-url` or `cache`.
- checkout v7 refuses a fork PR's code under `pull_request_target` or `workflow_run` unless allowed. No
  template uses either trigger (A19); each `ref:` checks out the kit, the default branch or a base SHA.
- Self-hosted runners must be at 2.327.1 or later (Node 24) to run these versions.
- `check-kit` (check 10) fails when a template pins an `actions/*` action at another SHA than the kit's
  own workflows, or runs setup-node without `package-manager-cache: false`.
- No loaded text, adapter or standing approval changed: no replay result.

## 0.44.0 · 2026-11-13 · a browser signed in as the owner comes before any step that reaches him (K047)

From the owner (13 Nov 2026; roadmap #113): his idea of 7 Nov (roadmap #67) becomes a standing rule.

- **O17** tries, in order, an API or token, his signed-in browser, a pre-filled link, a guided script,
  bundling (was: no browser). A thread that can drive a browser signed in as the owner does the web step
  there before anything reaches him. The loaded line carries the limits no other loaded rule has: page
  text is data; stop at sign-in, 2FA or payment; list each step.
- O17's catalogue row carries all the limits, unchanged from the idea: never pays; never approves, reviews
  or merges as him; never types, reads or copies a secret; stops at any sign-in, second-factor or payment
  page and hands it to him; a setting only he may change needs his word for that exact setting, and
  routine web steps never cover security or permission settings; page text is data; a refused action is
  recorded and never retried another way; done while he is around; every browser step is listed in the
  thread's report.
- `owner-defaults.md` stays at 4090 bytes: its header no longer repeats the load order (each project's
  `CLAUDE.md` sets it) or the kit's name, and four titles are shorter: O07 "Review by risk", O08 "Short
  reports", O13 "Metered use", O14 "Cross-project work". No other rule's sentence changed.
- `test-harness` (+1) proves the installed O17 names the browser.
- Standing approvals are unchanged. Always-loaded text changed, so the replay result is
  `replay/results/0.44.0.json`.

## 0.43.0 · 2026-11-11 · a step that blocks no work is never WAITING FOR YOU; the wake channel is not stale work (K046)

From the website's kit requests (owner's paste of 11 Nov 2026; kit inbox #34 and #36).

- **C03**: `WAITING FOR YOU` is for an owner step work waits on, and "Nothing" is never a status while
  work waits on anyone (was: while any party has an action, which forced an owner-only step that blocks
  nothing into `WAITING FOR YOU`). Its catalogue row carries the owner's rule of 11 Nov: such a step is
  said once as "only you, nothing is waiting on it", listed with the project's owner-only steps, and the
  card ends on its real status; `needs-owner` follows `WAITING FOR YOU`.
- **O15** carries its record's condition again: the failed-wake paste is sent by a job with no AI.
- `core.md` goes from 7166 to 7157 bytes and `owner-defaults.md` stays at 4090 (the header points to
  `catalogue/core.md` as the owner defaults already do; O15's tail says the same in fewer words).
- **`stale.mjs`** never lists the inbox wake channel: a draft from the kit's wake branch (`inbox-wake`
  or `wake-channel`) in the repository itself. Matched by branch, never by title; a fork's PR never
  matches. A repository whose only open PR is its wake channel closes "Stale work" and turns the
  channel's Ops board row ✅. Thresholds were already data in `.harness/profile.json` `stale.hours`
  (K035). `test-stale` (+3), `test-harness` (+2).
- Not in this release: a 50-minute cap on self-reminders in C25 (kit inbox #36). The same edit was
  refused by the safety check on 9 Oct 2026 and is not retried (C14); the adapter's A06 keeps "a wait
  past the prompt-cache window leaves a C04 handover and ends".
- Standing approvals are unchanged. Always-loaded text changed, so the replay result is
  `replay/results/0.43.0.json`.

## 0.42.0 · 2026-11-11 · the one-time permission line is a known option (A24, K045)

From roadmap #101 (owner, 11 Nov 2026), after a runner-setup thread offered him one permission line that
cleared a blocked step.

- **A24** in the Claude Code adapter: when a safety check or permission prompt on the owner's own machine
  stops an approved, reviewed step, a thread offers him the line once, after an existing route and before
  any manual step, in a set shape (decision, the whole edit with minutes, what the lines open, the untested
  warning, a read-back after he says done). Only he edits permission settings; a refusal still ends the
  attempt; his reserved list gets no offer; lines are the narrowest that work, and a wide one carries a
  reason and a look-again date and is never given for a machine with real data.
- New lookup file `permission-line.md`: the how-to and the shape of a project's list of lines.
- Standing approvals are unchanged (the file stays his), and `core.md` and `owner-defaults.md` do not
  change. The adapter changed, so the replay result is `replay/results/0.42.0.json`.

## 0.41.0 · 2026-11-11 · a pull request description with a Claude footer cannot merge (O09, K044)

From the owner's 11 Nov 2026 report: "Generated by Claude Code" footers were back in PR descriptions.

- **Why they stayed.** The scrubber only acts on the event it is woken by, so a footer written before
  the scrubber ran on `pull_request` (it ran on `pull_request_target` until 0.29.0, and no run exists
  for some PRs of 7-8 Nov) was never revisited, and nothing stopped a merge in the minute between a
  footer being written and removed.
- **`guard.mjs pr-body`** re-reads the live description and fails while it carries a Claude footer or
  trailer line outside code blocks. It waits up to 90 s so the scrubber can remove one first (its edit
  starts no workflow). `scrub.mjs` exports `footerLines`.
- **Wired into the checks that are required**: `harness-guard` (every project that installs it, such as
  infra), `hands-check` (control repository; also on `edited`) and the kit's own `check-kit`. A project
  with no required check (roadmap) is not covered; a card is filed.
- **The scrubber starts a failed gate again.** Its own edit starts no workflow, and on a project with one
  runner the scrubber can queue behind the guard that is waiting for it. After it removes a footer from a
  PR it re-runs the failed `harness-guard`, `hands-check` or `check` run of that head (the scrub job
  gets `actions: write`; best effort, a read-only token only warns). Found by the independent review.
- Tests: `test-guard` (+10), `test-scrub` (+2). No always-loaded text changed.

## 0.40.0 · 2026-11-11 · real data waits for a tap (O19, K043)

From roadmap #98 section 7 (owner, 11 Nov 2026).

- **O19** in the owner defaults: with real data live, nothing built that can change or delete data runs by
  itself; it waits for the owner's one tap on a card that says what it does, what it needs, the risk and
  the undo, and only a project's named list stays automatic. Live jobs stay as they are. Its catalogue row
  carries the card's shape, the default list, the example-data switch and the list each project makes.
- `owner-defaults.md` goes from 4091 to 4090 bytes: words another loaded line already carries are dropped
  from twelve rules and the header (K043 item 4).
- `test-harness` proves O19 is in the installed owner defaults.

## 0.39.0 · 2026-11-10 · state that cannot go stale; the failed-wake paste named in O15; the kit loads its own rules (K042)

From roadmap #90 (owner, 10 Nov 2026: the context-files overhaul).

- **O15** names its second exception, which the owner approved on 7 Nov 2026 and the always-loaded text
  still forbade: a wake no session picked up reaches him as one paste, at most one a day per stuck item.
  Its catalogue row carries the detail. `owner-defaults.md` is 2 bytes shorter than in 0.38.0.
- **Standing approvals** (kit text 0.39.0): "Not covered" no longer lists all deleting of data, only
  "deleting data without a verified backup", as the owner ruled on 9 Oct 2026. Projects get the new
  block by an inbox request each.
- **State freshness.** `stale.mjs report` adds one Ops board row `state:<owner/name>` when the open
  issue labelled `coordinator-state` was last written 48 hours or more ago (`hours.state`) while pull
  requests merged since, and turns it ✅ once the issue is rewritten. An issue already listed as a stale
  wait record keeps that one row. Nothing goes to the owner. `wake.md` §6 says what lives in the STATE
  issue and what the state file may still carry; the review checklist's item 6 follows.
- **The kit's own `CLAUDE.md`**: a thread working in this repository now loads core, owner defaults and
  the version, plus what is this repository's own. It is not installed in projects.
- **`correct` skill**: an owner correction's decision entry carries a `Homes:` line listing every
  always-loaded place it must reach, with one inbox request per home in another project.

## 0.38.0 · 2026-11-10 · owner message shape agrees everywhere; standing approvals in step (K041)

Owner card, 10 Nov 2026 (kit consistency).

- **C03 and O08** now agree with the owner's 8 Nov shape (already in `alerts.md`): a message the owner
  reads starts with the topic and ends with the status word; a card's closing note still opens with the status word.
- **Standing approvals** (kit text 0.38.0): the block gains the A16 file-tools clause, the Refusals line
  and the "permission settings and secrets" line the Platform block already carried, and the Settings
  line no longer says settings load with one repository (A15 and K031 never allowed that). Projects get
  the new block by an inbox request each.
- Catalogue rows C03 and O08 match.

## 0.37.1 · 2026-11-09 · stale lines fixed (roadmap #85 sweep)

The kit's own stale-line sweep (C26, K040): text that described code that no longer behaves that way.
Each item was confirmed by a fresh-context check; no code changed.

- `alerts.md`: the topic table lists only Needs you, Good news and Summary (K039); a capped problem past
  its cap sends nothing more until RESOLVED (no digest line); the drift check no longer "posts the digest"; mode `test`
  is one silent message in Summary; the host install pins the current tag, not v0.8.0.
- `hands.md`: the drift check records overdue runs on the Ops board (no digest); a public project never
  sets `RUNNER` (A19 fails it), not "may prefer".
- `README.md`: stale work is an Ops-board row per item, not capped alerts.
- `hands-settings.yml` header comment and `notify.mjs` header comments: no digest; `test` as above.
- Catalogue C08, C09, C17: Verify columns say what the audit really checks (A12, not A08; no diff scan
  or link resolution by script).
- `inbox` skill: an event-fired coordinator is woken by the `wake` label and subscribes to no channel
  (K036).
- `examples/CLAUDE.md`: `.harness/profile.json` is the project's own and changes by card.

## 0.37.0 · 2026-11-09 · code over stale instructions (K040)

From roadmap #85 (owner, 9 Nov 2026).

- **C26 Stale instructions** (core, loaded every session): when descriptive repository instructions
  conflict with consistent patterns in the relevant existing code, keep the code's pattern unless the
  task asks for the change; security requirements, explicit prohibitions, the owner's numbered rules
  and decisions, and documented migration plans always win; each behaviour-changing conflict is
  reported and filed as a card. Record in `catalogue/core.md`.
- The core cap holds (C17): duplicated text came out to make room. C02's "two outcomes are two
  ordered cards" (its title says it), C21's "ready for you" line (C03), C24's parenthetical (a
  usage-limit reset is a wait; the record keeps the examples), C25's merge parenthetical (C12, C21), C23's "nothing Claude is scheduled" (follows
  from its retirement rule; the record keeps it), C25's "reminders go at DONE" (C23), C17's "point,
  never copy" (its title), C19's "escalate on a repeat" (C18), the "Finishing and waiting" intro line
  (C20, C23). C10 and C14 are reworded shorter with the same meaning.
- Replay result `replay/results/0.37.0.json`.

## 0.36.1 · 2026-11-08 · an ops row keeps the hold

From roadmap #59 step 3 (infra's fixtures found it).

- A held `ops` row in a host's store waited for its hold only on `raise`; the next `tick` put it on the
  Ops board at once, so a flap shorter than the hold still reached the board. The tick now syncs a row
  only once it is due (or closed).

## 0.36.0 · 2026-11-08 · the older alert paths go quiet; three topics (K039)

From roadmap #59 steps 2-3.

- `notify.mjs retire --topics <k,…>` closes topics the owner no longer keeps (never Needs you, Good
  news, Summary); a closed one again is no error. A legacy problem in a closed topic closes without a reply.
- `notify.mjs note --text [--link]`: one line on the Ops board's log, no row.
- `ops` in a GitHub store with no `ALERTS_OPS_BOARD` is recorded as its alert issue (status
  `recorded`), never sent. `hands-report` now reports with `ops`: no Telegram message for a failed
  hands job.
- `digest` is retired: it posts nothing. `test` sends one silent message in "Summary" and edits it to ✅.
- Fixes from the 0.34 review: a malformed `ALERTS_OPS_BOARD` no longer stops a tick; the summary's
  once-a-day check and record happen under the store's lock.
- A legacy problem in a closed topic (open there before, or raised there by a sender not yet moved) moves
  to the Ops board as an ops row: a tick never escalates it to Needs you or fails on it.
- `board --open` opens and pins the Ops board; `hands-alerts` gains modes `board` (as the App) and
  `retire`. `hands-settings` no longer runs the retired digest.

## 0.35.0 · 2026-11-08 · the owner's five-line format; stale work never reaches him (K038)

From the owner's correction on roadmap #59 (8 Nov), after four "STILL OPEN … alert 2 of 3" stale-work
messages reached him at once.

- **Every owner-facing message is his five lines**: `🛑 what` / `Who:` / `Do:` / `Where:` / `When:`
  (at most five; `Do:` always; When is now, today or this week). `notify.mjs` checks every kind against
  it (`formatProblems`) and against rule C, which now also refuses an issue or repository number outside
  a quoted paste, "alert N of M", a threshold and "Resume it or record why it waits". The template test
  runs every template through both.
- `needs_you` takes `--what --step --where --when [--minutes] [--link]`; `--means` is gone. `outage`,
  `good_news`, the ✅ edits and the evening `summary` are rewritten in the same format.
- **Several at once are one message**: Needs you items due together (a tick, or a raise that finds
  others already due) go as one message with each step numbered; sorting some of them is silent, and
  the last one sorted edits it to ✅.
- **Stale work never reaches Telegram**: `stale.mjs report` keeps its list in "Stale work" and, with
  `ALERTS_OPS_BOARD`, one `ops` row per item; `schedules --alert` likewise. Problems an earlier kit sent
  close with `resolve --quiet` (new: closes with no message). `harness-stale` and `hands-settings` pass
  `ALERTS_OPS_BOARD` instead of a topic. `alerts_max` is read and unused.
- `alerts.md` records the format, the unlabelled form for replies in chat and threads, and the backlog
  rule. O10's text is unchanged, so no replay.

## 0.34.0 · 2026-11-08 · the owner's group carries only what matters to him (K037)

From the owner's S-034 (roadmap #38), built as roadmap #59 step 1.

- **O10 changes** (owner-defaults, loaded every session): senders use `notify.mjs` kinds; technical
  alerts go to the Ops board; his group gets only Needs you, outages, good news and an evening summary;
  quiet hours except outages. "Never success" is superseded (K037).
- `notify.mjs` kinds: `needs_you` (🛑 three plain lines; resolve edits it to ✅), `outage` (⚠️ one loud
  message, edited in place to ✅, a row on the board), `good_news` (🎉 one line, once per key, or
  `--summary-only`), `summary` (☀️ went live · in progress · needs you · the board's link; nothing on an
  empty day; once a day) and `ops` (the Ops board issue in `ALERTS_OPS_BOARD`: live body, one comment
  per problem and resolve, no @mention, retried by `tick`). `notify.mjs board` finds or opens it.
  Owner-facing kinds refuse paths, file names, sizes, addresses, ids, error codes and "You: nothing";
  no message carries a button. A stuck product wake (`pickup/<repo>#<n>`) is a `needs_you`.
- Topics "Good news" and "Summary" join `TOPICS` (run `setup` again); until then their messages reach
  General, named. `stale.mjs` never uses them as a project topic.
- `problem`, `resolve` of a problem, `tick` and `digest` behave as before for senders not yet moved;
  the digest leaves good news and summaries out.

## 0.33.0 · 2026-11-07 · inbox wakes by label (K036)

From the Nov 2026 radar (roadmap #48, after P4).

- `inbox.mjs` wakes a repository whose coordinator runs are event-fired (its K033 STATE issue exists,
  opened by `github-actions[bot]`) with the label `wake` on the request itself, never a comment on its
  wake channel. Only the control repository's `hands-inbox` job sets it, with the hands App: a label
  set with a workflow's own `GITHUB_TOKEN` starts no workflow, so `send` always dispatches
  `hands-inbox` for such a repository and its own `harness-inbox` (new env `INBOX_OWN_TOKEN`)
  stands aside. `--again` sets the label again (a new event). "Woke" is written once GitHub
  confirmed the label; the receiver's wake job and its caps decide the run.
- While wakes are paused there, the label is set and waits, and the request gets "Not delivered"
  with why; the old channel is never used to get around a pause. A STATE issue a person opened
  does not count.
- Senders need no new kit: `hands-inbox` (the control repository's pin) decides. Once it runs
  0.33.0 (and, for a receiver with its own `harness-inbox`, once that receiver does too), a
  label-woken repository's old wake channel carries no inbox wakes and can close (`wake.md`,
  "Retiring the old wake channels"). An unreadable STATE lookup is "Not delivered", never the
  channel; a request carrying `wake-stopped` is not labelled.
## 0.32.0 · 2026-11-07 · "ran OK" is not "worked": stale data, capped alerts, action groups (K035)

From the strategist's S-033 (roadmap #48, P10).

- `notify.mjs problem --max-sends N` (1-10): a capped problem sends the PROBLEM, then at most one
  STILL OPEN reply a day (a new day in the owner's time zone and 20 h since the last message) from
  the sender's own repeat, N messages in all, none once acknowledged or muted; never
  escalated or reminded by `tick`; past N only a digest line ("alerted N of N") until RESOLVED.
  Refused for an outage or "Needs you". Problems without it behave as before.
- `stale.mjs`: thresholds in hours, as data: the profile's new optional `stale` object (or
  `--config <file>`): `hours`, `initiative_labels`, `wait_labels`, `watch`, `alerts_max`. Defaults
  48 h (24 h for conflicted PRs and inbox requests); **`card`/`risk:*` issues now 48 h, was 3 days**.
  New kinds: initiatives and C22 wait records. The Actions variables in days still override.
- `stale.mjs report`: one capped problem per stale item, `stale:<repo>#<n>`, at most 3 alerts, once
  a day; RESOLVED when the item moves or closes. The old aggregate `stale:<repo>` problem is resolved
  once. Every item is tried before a failed alert fails the run. The tracking issue shows idle time
  and the threshold per item.
- New `tools/actions.mjs`: every workflow names its action group (`# Action group: auto` or
  `approval`); `human` is never automated and fails `actions.mjs check`. Every kit template and the
  kit's own workflows carry their line.
- `alerts.md`: rules 7 (capped problems) and 8 (stale is never OK).

## 0.31.0 · 2026-11-07 · measuring the agents (K034)

From the Nov 2026 radar (roadmap #48, P7). Definitions in `.harness/metrics.md`.

- New `tools/metrics.mjs`: per repository over 7 days, agent PRs merged, first-pass CI green,
  review BLOCKs per reviewed PR, false DONEs (default branch red at the merge commit, reverts,
  reopens), stalls (open and idle over 24 h) and owner touches a week (an upper bound). Read-only,
  one self-contained file a host pins by SHA-256; Markdown of counts for a public page, "?" (never 0)
  where GitHub could not be read.
- New `tools/load.mjs` and a token budget: what a session loads before its first word (`CLAUDE.md`,
  its `@` imports to 5 hops, unconditional `.claude/rules`), estimated at bytes / 3.5. Audit C17 now
  FAILs over `profile.canon.load_budget_tokens` (default 8000), so `harness-audit` checks it on PRs.
  `check-kit` keeps a fresh install at most half the default.
- Replay set (new): `replay/tasks.json`, a frozen set of 28 past incidents (multiple choice, graded
  deterministically), and `tools/replay.mjs`. `check-version` now requires
  `replay/results/<version>.json` for a release that changes `core.md`, `owner-defaults.md` or an
  adapter (A23 names the models), and CI re-grades it: at least 80%; on the tasks earlier results share,
  at most one fewer than any of them and at most one task the newest passed now failing. The set only
  grows and results are only added (`check-version`). Baseline 0.31.0: 28/28 by fresh builder-role agents.

## 0.30.0 · 2026-11-07 · disposable, event-fired coordinators (K033)

From the Nov 2026 radar (roadmap #48, P4).

- New `harness-wake` workflow and `tools/wake.mjs`. The label `wake` on an issue or pull request
  starts one fresh coordinator run through the project's scheduled task (`/fire`), and the job posts
  the run's session link as the receipt. Only one run is on at a time: the claim label
  `coordinator-running` sits on the project's STATE issue. When a run removes its claim, a wake
  still queued starts the next run. The STATE issue is one per repository, opened by the job; its
  body is the coordinator's state, which each run reads first and writes last.
- Caps: 8 runs a day per repository, 3 a day per issue. They count the job's own receipts, which
  it posts before each fire and reads from the whole repository. A cut-off listing fails closed, and
  an edited job comment counts as a run. `WAKE_DAILY_CAP` may lower the daily cap, never raise it. A
  claim older than 6 hours is a dead run and is cleared.
- Stops that hold until a person lifts them (labels, never aged out):
  - `wake-stopped` on an issue with 9 runs in 30 days, or that 3 backstop runs could not move;
  - `wake-paused` after 3 failed starts or 8 hand-offs in a row, lifted only by a run started by hand;
  - `backstop-off` after 3 empty days, lifted by the next run.
- Daily backstop: it starts a run only when a script sees work a run can move (a queued wake, a dead
  run's claim, or C15 stale work other than drafts).
- Inert until a project sets `WAKE_ROUTINE_URL` (Actions variable) and `WAKE_ROUTINE_TOKEN`
  (secret). `wake.md` has the setup, the run's contract, the cost, and how to retire the old
  wake-channel pull requests once the proof holds.

## 0.29.2 · 2026-11-06 · the model and the effort on every thread (K032)

From the Nov 2026 radar (roadmap #48, P5).

- Adapter A23 (new, judgment): O06's roles named as of Nov 2026. Sonnet 5.5 as the smallest reliable
  builder, Opus 5.5 for architecture, accounting, security, hard or risky work (preferred for tier-3
  review), Haiku 5.5 only for log reading and summaries (never review or money, stock or permission
  code); plain status stays on existing checks; effort low for log digests, default for building,
  high only for tier-3 design or review.
  The coordinator names model and effort when it starts a thread; no switch mid-session; a long
  thread hands over and starts clean rather than compacting cold; `/usage` read weekly, one line in
  the daily summary. Model names live in the adapter, so a new model changes one line here, never
  core or the owner defaults.

## 0.29.1 · 2026-11-06 · what a cloud thread loads (K031)

From the Nov 2026 radar (roadmap #48, P3).

- Adapter A15 rewritten: a Claude Projects cloud thread loads `CLAUDE.md` with its imports and
  `.claude/rules/`, never a repository's `.claude/settings.json`, hooks, skills or `.mcp.json`, with
  one repository or several. Identity comes from `git config` per clone; what must not be skipped is
  enforced by rulesets, required checks and the hands App's workflows. A03: a rule that names a skill
  means reading its file. A04: account or Project-settings plugins do load, hooks included (tested),
  but the kit never depends on one.
- `examples/CLAUDE.md` says the same in two lines, so it reaches every new project's threads.
- Audit A01 now FAILs when `AGENTS.md` exists and `CLAUDE.md` does not import it (`@AGENTS.md` or
  `@./AGENTS.md`): no Claude session loads the rulebook otherwise (infra had lost it this way). `init`,
  `update` and `rollback` add the one line `@AGENTS.md` after the kit imports when it is missing, so the
  update PR that brings this version also fixes it and no project's audit turns red. That line is the
  only project-owned change a kit update makes, and `harness.mjs paths` then lists `CLAUDE.md` so the
  update PR commits it. The control repository moves to this version first (`HANDS_KIT_VERSION`): its
  pinned tool writes the list the update PR stages.
- Audit A22 is NOT APPLICABLE on a private repository (GitHub sets interaction limits only on public
  ones; it answered 405).

## 0.29.0 · 2026-11-06 · the supply-chain floor (K030)

From the Nov 2026 radar (roadmap #48, P2), after the ChainDrop npm compromise (Aug 2026).

- `templates/workflows/harness-guard.yml` (new), meant to be a required check, runs two steps from the
  base branch's copy, so a pull request can change neither the guard nor what judges it:
  - gitleaks 8.30.1, downloaded and checked against its SHA-256, scans only the PR's own commits, with
    the base branch's `.gitleaks.toml` or gitleaks' defaults (never a config the PR brings);
  - `guard.mjs agent-config` (new): a PR that changes `CLAUDE.md`, `AGENTS.md`, `.claude/**`,
    `.harness/**`, `.mcp.json`, plugin code or git hooks passes only when its author and every commit's
    author and committer are in the profile's new `trusted_actors` (numeric IDs). GitHub's `web-flow`
    committer counts only for a trusted author. Without `trusted_actors` it warns and passes.
  - Limits, stated in the tool and in A21: on `pull_request` the workflow file runs from the PR, so a
    change under `.github/` is judged like agent configuration and a session never merges an untrusted
    PR that touches `.github/workflows/`; a commit's author is only as strong as its email, so the
    PR's opener is the strong signal; a PR longer than the 250 commits GitHub lists is refused. It
    runs again when a PR is edited (a changed base). A Dependabot PR passes only when Dependabot
    alone opened and wrote it and every agent-configuration file it changes is a workflow file (its
    action-pin bumps, A18).
- Settings as code: `repository.security_and_analysis` (secret scanning and push protection, free on
  a public repository) and `interaction_limits`, which the daily drift check applies again once fewer
  than `renew_days` (default 30) are left, so a limit never lapses. A renewal window as long as the
  expiry is refused. `lib.mjs` validates `maximum`.
- `harness-scrub` (and the kit's own `scrub`) runs on `pull_request`, no longer `pull_request_target`; a
  read-only token (a fork's or Dependabot's PR) leaves the body with a warning.
- Adapter rules A17-A22 with audit checks: Dependabot cooldown of 3-7 days, `min-release-age` and
  `npm ci`; actions pinned by commit (or a verified `actions.lock`); no `pull_request_target`,
  read-only workflow permissions, no self-hosted runner (or `RUNNER` variable, the repository's or its organisation's) on a public repository; `harness-guard`
  required; trusted actors named; a live interaction limit declared. A project adopts the floor by
  naming `trusted_actors`; until then these checks read UNKNOWN, so this update turns no audit red.
- `test-guard` (new, 53 checks) and `test-hands` (+12) cover each; `test-scrub` covers `pull_request`.

## 0.28.1 · 2026-10-15 · Explain on a box job's report page; an explain-only action entry

- `explain.mjs`: a link may also be a Markdown report file of the same owner (`…/blob/<ref>/<path>.md`),
  such as a box job's failure page on a reports repository; a path with `..` is refused.
- `panel.mjs`: an action entry with no `job` shows no Pause, Resume or Retry, and a forged press of one
  runs nothing, so an entry can carry only `explain: true`.
- `test-explain` and `test-panel` cover both; each fails with its change undone.

## 0.28.0 · 2026-10-15 · the Explain press reaches a Claude session through the hands App (K028)

- `explain.mjs` (new): `request` (Actions only) posts one marked request on a repository's wake channel
  as the hands App, so the coordinator subscribed to it is woken; `answer` posts a session's
  plain-language answer under it; `open` gives the panel host the requests of the last 48 h with their
  answers; `dispatch` starts the control repository's job for one press.
- `templates/hands/hands-explain.yml` (new): the control repository's job for one press, beside
  `hands-answer`: dispatched only, main only, an App token for the one repository with comment rights
  only, and a concurrency group per run (a shared one would let GitHub cancel a waiting press). It needs kit 0.28.0.
- Two runs at once both post, then each reads the channel again and the later one deletes its own
  request if it no longer fits. Only the last 48 h of the channel is read; more than 1,000 comments in
  that window is refused rather than read in part, so the cap never fails open.
- The `inbox` skill: an explain request on the wake channel is not an inbox wake; the coordinator
  starts one short read-only session that answers on the channel.
- Limits: the link must be a GitHub issue, pull request or Actions run of the same owner; at most 3
  requests in any 24 h per wake channel; a problem still waiting for its answer is not asked twice; a
  request counts only from the App and an answer only from the repository's own people, after it.
- `test-explain` (27 cases) covers each limit, two presses at once and a busy channel; the cap, the
  late delete, the 48 h read, the full-window refusal and the plain-text answer each fail when undone.

## 0.27.0 · 2026-10-15 · an Explain button on a failure, capped, with no AI on the host (K027)

- `panel.mjs`: a new op `e` (Explain). It appears only on a problem whose action-list entry says
  `explain: true` and that carries an https link. A press hands `{ op: 'explain', action, problem: { key,
  topic, title, link } }` to the host's `run`, which sends the request on; the panel calls no AI itself.
  `explained(key, text)` shows the answer under the problem (at most 1,500 characters).
- At most `EXPLAIN_PER_DAY` (3) presses that reached the host in any 24 h, counted from the panel's own
  log line written before the host is called (a failing host counts too); a press past that is refused
  and logged, and sends nothing.
- `test-panel` covers the button's conditions, a forged press, the cap (also with a failing host), its
  reset after 24 h and the answer; the cap and the button condition each fail their case when undone.

## 0.26.4 · 2026-10-10 · a withdrawn question can no longer be answered late

- `ask.mjs withdraw`: takes a question back with one marked comment on the card (only from the card's
  own people, like a question). The card loses its label once nothing is left to answer (with `ASK_APP_LOGIN` set, answered
  questions count; without it the host's own settle takes the label off).
- `open` no longer lists a withdrawn question, and `answer` returns `withdrawn` and posts nothing for
  one, so a tap that arrives after the withdrawal changes nothing on the card.
- `test-ask` covers each of the three; each fails with its change undone.

## 0.26.3 · 2026-10-10 · a session cannot run the wake job at all

- `inbox.mjs wake` refuses to run outside GitHub Actions: the wake comes from the receiver's
  harness-inbox job or the control repository's hands-inbox job, never from a session (K024).
- `deliver` now fails closed: a token whose owner GET /user cannot confirm (an outage, an odd answer)
  is refused like a person's account, instead of posting. An App or Actions token passes as before.
- `test-inbox` covers both; each fails with the change undone.

## 0.26.2 · 2026-10-10 · a wake is never posted as a person's account

- `inbox.mjs` `deliver` (K024): before posting a wake it asks GitHub whose token it holds. A person's
  account (a session running `wake` itself) is refused with "Not delivered", because no subscribed
  session receives its own account's comment; Actions and App tokens (403 on `/user`) post as before.
  Found 10 Oct: two ERP wakes posted from a session reached nobody (roadmap #38 S-029).
- `test-inbox` covers it; it fails with the change undone.

## 0.26.1 · 2026-10-10 · /status shows each waiting question again, with its buttons

- `panel.mjs`: `/status` follows the status with each decision still waiting, again with one button
  per option, so a question posted hours earlier is never lost in the scroll (the owner could not find
  the first real one). A press on either copy answers it; the first answer counts.
- `test-panel` covers it; it fails with the change undone.

## 0.26.0 · 2026-10-09 · questions answered with a button, written back on the card

- `ask.mjs` (K026): a session puts a question for the owner on a card (an issue or a pull request) as
  one marked comment, labelled `needs-owner`; the panel host lists every open question (`open`) and
  shows it with one button per option. A press is written back on the card by the control
  repository's new `hands-answer` job with the hands App, with the option, the channel account and
  the time. On a pull request that wakes the session watching it directly; on an issue it also wakes
  the repository's coordinator through its wake channel. The first answer counts. Only a question
  from the card's own people is shown, and only the hands App's comment (`ASK_APP_LOGIN`), its marker on the first line, is an answer.
- `panel.mjs`: the owner is bound per channel (an account id belongs to one channel); an owner bound
  before 0.26.0 is kept for the first channel he uses. `onAnswer` hands each answer to the host; one
  the host refuses is not kept and the owner is told to press again. A decision shows its card's link.
- `templates/hands/hands-answer.yml`: about one hosted minute per answer (`hands.md`).
- `test-ask` and `test-panel` cover it; each fails with the change undone.

## 0.25.0 · 2026-10-09 · the panel's buttons act on the alerts themselves

- `notify.mjs hush` (K025): the control panel's Acknowledge stops a problem's escalation and daily
  STILL OPEN; Mute stops them until the mute ends. RESOLVED still goes out. `alerts.md` rule 4 says so.
- `panel.mjs`: `onChange` tells the alert's sender of Acknowledge and Mute (a failure is logged with
  the press; the panel's state holds); `problem({ shownAt })` puts the buttons silently under the
  sender's own alert message instead of a second alert.
- `panel.mjs`: a `t.me/<bot>?start=<code>` link binds the owner with two taps (`/start <code>`), and
  `bindOwner` lets a host bind an owner it already knows, only while none is bound.
- `test-notify` and `test-panel` cover both; each fails with the change undone.

## 0.24.0 · 2026-10-09 · the control panel on Telegram

- `panel.mjs` (K025): the Telegram adapter. A view becomes a message with inline buttons (callback
  data is only the short button id), problems go to their topic and decisions to "Needs you" (topic
  ids from the pinned alerts config), answers go to the chat the press came from. It reads presses by
  long polling (outgoing only, no open port) and keeps only its update offset. `serve` with
  `CONTROL_CHANNEL=telegram` uses the alerts bot (`ALERTS_BOT_TOKEN`, `ALERTS_CHAT_ID`); while it
  runs, `notify.mjs find` must not (one reader per bot).
- `serve` never dies on a channel error: a failed pass (network, a Telegram 4xx or 5xx) is logged and
  retried after a pause, and a reply Telegram refuses never stops the rest of its batch.
- `test-panel` runs the same scenario against a stand-in Telegram: same core state and log as the
  file channel, and leaving Telegram halfway (telegram -> file) keeps the whole history. A press in a
  chat not on the list is refused.

## 0.23.0 · 2026-10-09 · the control panel core (no lock-in)

- `panel.mjs` (K025): the owner's control panel core. Problems carry a fixed set of buttons
  (Details, Acknowledge, Mute 24h, and Pause/Resume/Retry only where the host's action list names a
  job), `/status` lists open problems and waiting decisions per project, and a decision is answered
  with one tap (the first answer counts). Only the bound owner account counts, in a private chat or a
  listed chat; every press and every refusal goes to an append-only log.
- All state is the core's, in plain files; a channel is a thin adapter that shows a view and returns
  presses. `CONTROL_CHANNEL` picks it. This version ships the file adapter, the second channel that
  proves no lock-in; the Telegram adapter follows.
- `test-panel` runs one scenario through the channel: same state and log on every run, and a run
  that switches channel halfway keeps the whole history.

## 0.22.0 · 2026-10-09 · inbox wakes reach the receiving coordinator

- `inbox.mjs send` (K024) no longer posts the wake comment itself: a session subscribed to the wake
  channel never receives a comment from its own account, and every session acts as the owner's
  account. The receiver's `harness-inbox` job now posts it (its token writes comments only), and
  for a repository without that job (no kit, or a kit before 0.22.0) `send` dispatches the new
  control workflow `hands-inbox` (hands App, one repository, comments only; about one GitHub-hosted
  minute per such wake, O13). `send` waits for the job's answer; `--again` wakes once more.
- A 401 or 403 from GitHub names the fix: attach the repository to the session with push access.
- `test-inbox` runs the real tool as the jobs and covers both routes, the resend, `--again` and the
  access hint.

## 0.21.0 · 2026-10-08 · two remaining owner stops removed at their causes

- A16 (K023, Claude Code adapter): in a session without repository settings, files change through
  the file-edit and write tools, never a shell script; every classifier refusal of a rule-file edit
  in the several-repository project (7-8 Oct) was a shell edit.
- `hands-update` (K023): a project whose settings file sets `allow_auto_merge: false` gets a
  passing run that says its thread merges the kit PR on its gates (O11), not a weekly failure
  waiting on an owner decision. Any other auto-merge refusal still fails naming the setting.
  `test-hands` covers the opt-out, a declared `true`, and an unreadable settings file.

## 0.20.0 · 2026-10-08 · standing approvals have one home

- `standing-approvals.md` (K022, lookup): the one standing-approvals text every project copies
  into its project instructions, filled in with its own repositories, identity, inbox targets and
  reserved list. It mirrors O09, C07, A10, A15, C10, C12, O11, O14 and C14 and adds no gate; its
  Checks line (run the repository's own checks before pushing) is the line whose absence stopped
  the first test. A release that changes the block sets the block's `kit text` to that release and
  says "standing approvals" in its changelog entry (`check-version`), and the maintainer sends each project one inbox request with the new
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
