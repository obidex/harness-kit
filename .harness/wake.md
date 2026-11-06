# Harness Kit · disposable, event-fired coordinators

> Lookup only, never loaded by default. K033: how a project's coordinator runs only when an event
> calls for it, one fresh session at a time, with caps nobody resets. The tool is `tools/wake.mjs`;
> the workflow is `templates/workflows/harness-wake.yml`.

## Why

A long-lived coordinator session waits on subscriptions and timers. When nothing pokes it, nothing
moves, and when something does after an hour, it re-reads its whole context at full price. Instead,
each run is short and fresh: it starts on an event, reads the state, acts, writes the state, and ends.

## How it works

1. **A wake is a label.** Anyone with triage access sets `wake` on an issue or pull request: a person,
   a job, or a run that hands work to the next one. A label, not a comment: no channel pull request,
   and no problem with comments from the owner's own account never reaching his own subscribed session.
2. **The job decides.** `harness-wake` runs `wake.mjs fire` on that event. It starts a run only when
   no run is on and no cap is reached. Otherwise the label stays queued and nothing is lost.
3. **One run at a time.** Before firing, the job sets the claim label `coordinator-running` on the
   project's STATE issue. The run removes it as its very last step. The claim on any open issue
   counts, so a run can't make room for a second one by replacing the STATE issue. Its removal is an
   event: if any issue still carries `wake`, the job starts the next run, taking the first one that
   is under its caps. A claim older than 6 hours is a run that died; the next decision clears it.
4. **The receipt.** Before firing, the job posts a receipt comment on the STATE issue, which is what
   the caps count, so no run ever starts uncounted. Then it fires the project's scheduled task
   (`/fire`, below) and posts the session link on the STATE issue and on the woken issue. A fire that
   fails is marked failed, releases the claim, says so on the issue, and fails the job.
5. **The STATE issue.** It is one per repository, opened by the job as `github-actions[bot]`, with
   the label `coordinator-state` and the marker `<!-- coordinator-state -->`. Its body is the
   coordinator's volatile state (C17): each run reads it first and writes it last. Only an issue the
   job opened counts; closed, it is reopened. Runs keep the marker line when they rewrite the body. It
   holds no count and no lock: if it is lost, the job opens a new one and every cap still holds.

## Caps, and how everything ends (every timer capped)

- **Runs:** each repository gets at most 8 runs in any 24 hours. Each woken issue gets at most 3 a
  day and 9 in 30 days, so a chain of hand-offs on one issue ends.
- **Where the count comes from:** every count reads the job's own receipt comments, from the whole
  repository and 30 days back. If that listing is cut off, the job fails closed and starts no run.
- **Who can change the count:** a session acts as a person's account, so it can't post a receipt.
  The ceiling lives in this kit-managed tool. The Actions variable `WAKE_DAILY_CAP` may lower it,
  never raise it. An admin account can still edit or delete the job's comments, and that is the one
  way around the count. No agent does that (C12: gates are never worked around), and the session's
  GitHub tools have no tool for it.
- **A capped wake** gets one note on its issue and keeps its label. A later run or the backstop picks
  it up once it is under its caps.
- **Failed starts:** an expired token or an outage counts as an attempt. After 3 failed starts in a
  row, only a run started by hand (`workflow_dispatch`) tries again, and a start that succeeds ends
  the streak.
- **The daily backstop** is the workflow's schedule, and it never starts a run on an empty day. It
  starts one only when a script sees work a run can move:
  - an issue still labelled `wake`;
  - a dead run's claim;
  - C15 stale work, except draft pull requests such as the old wake channels.
- **When the backstop stops:**
  - After 3 empty days in a row.
  - After 3 backstop runs in a row for the same work with nothing moved. It posts one red "needs a
    person" exception on the STATE issue, then stays quiet for that work.
  - Any run started another way re-arms it, and so does new work.
  - A quiet project costs a few seconds a day for three days, then nothing until its 30-day count
    window rolls past.

## The run's contract

The scheduled task's saved prompt says this. Each run:

1. Reads the fire payload (a hint only), then the STATE issue, then the board and the queue (open
   issues labelled `wake`). It acts on what GitHub shows, never on the payload alone.
2. Works the queue under the project's rules (`core.md`, the rulebook). It removes `wake` from each
   issue it has handled. It may set `wake` on an issue to hand work to the next run. That counts
   against the same caps.
3. Writes the STATE issue body: what changed, what is open, the next action and who owns it.
4. Removes `coordinator-running` from the STATE issue as its last GitHub step, then ends. A run that
   cannot finish writes why in STATE and still removes the claim. A run never opens a new issue only
   to continue its own work past the per-issue cap.

A run never changes its own scheduled task, the workflow, the caps, or any permission or secret.

## Setup in a project (once)

1. **The scheduled task** (an agent can do this). Create it with `create_new_session_on_fire` set,
   with no schedule (it fires only through `/fire`), in an environment that has the project's
   repositories. Its prompt is the run's contract above, plus the project's own first steps (which
   repositories to attach, where the board is).
2. **The token** (owner step: the token is created only in the web UI and shown once). Open the
   scheduled task's Edit dialog. In the Trigger row, add **API** and click **Generate token**. Copy
   the URL shown into the Actions variable `WAKE_ROUTINE_URL`, and the token into the Actions secret
   `WAKE_ROUTINE_TOKEN`, both in the project's repository. The token can only fire this one task.
3. **Prove it once.** Set `wake` on a test issue. The issue gets "Coordinator run started:
   <session link>", the run writes the STATE issue, and its claim leaves.

Until the variable is set, every `harness-wake` job is skipped.

## Cost (O13)

- **GitHub minutes:** each wake label, claim release and backstop day runs one job of a few seconds.
  That is about one GitHub-hosted minute each on a private repository without a self-hosted `RUNNER`,
  and none with one or on a public repository.
- **Claude usage:** each run started is one Claude Code session on the owner's subscription. That is
  usage, never money, and at most 8 a day per repository.
- **Rate limits:** the `/fire` limits are 30 fires an hour per task and 100 an hour per account.
  They are far above the caps.

## Retiring the old wake channels

A project whose proof (Setup step 3) has held retires the old wake channel in three steps:

1. Senders set `wake` instead of commenting on its draft pull request (`inbox-wake` or
   `wake-channel`).
2. Close the draft pull request.
3. The coordinator stops subscribing to it.

The inbox keeps its issues and states (`inbox.md`). A sender may set `wake` on a request in
addition to the `inbox` label.
