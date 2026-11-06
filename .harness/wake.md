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
   project's STATE issue. The run removes it as its very last step. That removal is an event: if any
   issue still carries `wake`, the job starts the next run. A claim older than 3 hours is a run that
   died; the next decision clears it.
4. **The receipt.** The job fires the project's scheduled task (`/fire`, below) and posts the
   session link it returns on the STATE issue (the receipt the caps count) and on the woken issue.
   A fire that fails releases the claim, says so on the issue, and fails the job.
5. **The STATE issue.** It is one per repository, opened by the job as `github-actions[bot]`, with
   the label `coordinator-state` and the marker `<!-- coordinator-state -->`. Its body is the
   coordinator's volatile state (C17): each run reads it first and writes it last. Only an issue the
   job opened counts. It is found by author and marker, not by label or state: closed, it is reopened.
   Runs keep the marker line when they rewrite the body.

## Caps nobody resets (every timer capped)

- **Runs:** at most 8 per repository in any 24 hours, and 3 per woken issue. Both are counted from
  the job's own receipt comments, read from the whole repository (30 days back), so editing, closing
  or replacing the STATE issue never changes the count. A session acts as a person's account, so it can't post a receipt or
  backdate one. The ceiling lives in this kit-managed tool. The Actions variable `WAKE_DAILY_CAP` may
  lower it, never raise it. Deleting the job's comments is the one way around the count; no agent does
  that (C12: gates are never worked around), and the session's GitHub tools have no tool for it.
- **A capped wake** gets one note on its issue and keeps its label. The next run or the backstop
  picks it up after the window.
- **The daily backstop** is the workflow's schedule. It never starts a run on an empty day. It starts
  one only when a script sees work: an issue still labelled `wake`, a dead run's claim, or C15 stale
  work (`stale.mjs scan`). After 3 empty backstops in a row it stops, and the next run of any kind
  re-arms it. So a quiet project costs a few seconds a day for three days, then nothing.

## The run's contract

The scheduled task's saved prompt says this. Each run:

1. Reads the fire payload (a hint only), then the STATE issue, then the board and the queue (open
   issues labelled `wake`). It acts on what GitHub shows, never on the payload alone.
2. Works the queue under the project's rules (`core.md`, the rulebook). It removes `wake` from each
   issue it has handled. It may set `wake` on an issue to hand work to the next run. That counts
   against the same caps.
3. Writes the STATE issue body: what changed, what is open, the next action and who owns it.
4. Removes `coordinator-running` from the STATE issue as its last GitHub step, then ends. A run that
   cannot finish writes why in STATE and still removes the claim.

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
