# Harness Kit · disposable, event-fired coordinators

> Lookup only, never loaded by default. K033: how a project's coordinator runs only when an event
> calls for it, one fresh session at a time, with caps nobody resets. The tool is `tools/wake.mjs`;
> the workflow is `templates/workflows/harness-wake.yml`. K056: a session that hands work to another
> project starts that project's run itself ("Hand-off between projects").

## Why

A long-lived coordinator session waits on subscriptions and timers. When nothing pokes it, nothing
moves, and when something does after an hour, it re-reads its whole context at full price. Instead,
each run is short and fresh: it starts on an event, reads the state, acts, writes the state, and ends.

## How it works

1. **A wake is a label.** Anyone with triage access sets `wake` on an issue or pull request: a person,
   a job, or a run that hands work to the next one. A label set with a workflow's own `GITHUB_TOKEN`
   starts no workflow, so it waits for the next backstop. A job that must wake at once uses an App
   token. A label, not a comment: no channel pull request,
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
6. **State that cannot go stale (K042).** Everything volatile lives in the STATE issue and nowhere
   else: Now, Next, what waits with its wake, what needs the owner, the last five results. It is
   rewritten at the end of every coordinator run, with no PR. The repository's state file
   (`canon.state`, usually `docs/STATE.md`) keeps only slow facts (programme, live flags, endpoints,
   plans): no counts, "last updated" dates, commit SHAs, kit versions or "built since" lists; each
   of those is a pointer to its generated source or a query, and the file's first line points to the
   STATE issue. A project that opened its STATE issue by hand uses the same label, so the daily
   stale-work job finds it: `stale.mjs report` adds one Ops board row (`state:<owner/name>`) when
   the issue was last written 48 hours or more ago while pull requests merged since, and turns it ✅
   once it is rewritten. Nothing goes to the owner.

## Caps, and how everything ends (every timer capped)

**Counts.**
- Each repository gets at most 48 runs in any 24 hours, and each issue at most 12 (8 and 3 until K051).
  The caps stop a loop; they are set well above a full day of parallel work, so they never throttle it.
- Every count reads the job's own receipt comments (and a hand-off's, K056), from the whole repository and 30 days back.
  If that listing is cut off, the job fails closed. The job never edits its own comments, so an
  edited one counts as a run whatever it says now.
- The Actions variable `WAKE_DAILY_CAP` may lower the cap, never raise it.

**Stops that hold until a person lifts them.** These are labels, so they never age out of the count:

| Label | Set on | When | Lifted by |
| --- | --- | --- | --- |
| `wake-stopped` | an issue | It started 36 runs in 30 days, or 3 backstop runs in a row for the same work changed nothing. The job removes its `wake` label, posts "needs a person" on it, and turns one run red. | A person removing the label |
| `wake-paused` | the STATE issue | 3 failed starts in a row (an expired token, an outage); 8 runs in a row started only by hand-offs, with no outside wake between; or 3 backstop runs for a run that keeps dying. One red run. | A run started by hand (Actions → harness-wake → Run workflow) |
| `backstop-off` | the STATE issue | 3 empty backstop days in a row | The next run of any kind |

So a stuck wake, owner-only work, a run that always dies, a self-feeding chain and a broken token
each end in one exception, never in a monthly repeat.

**Who can lift a stop.** The labels and receipts are protected only by rules. The owner's account,
which agents also act as, can remove a label, edit a comment or start the workflow by hand. No agent
does any of these to lift a stop (C12: gates are never worked around), and the run's contract
forbids it. Edited receipts still count against the daily cap. While wakes are paused, the backstop
counts empty days and then rests too.

**A capped wake** keeps its label and gets one note. A later run or the backstop picks it up once it
is under its daily cap.

**The daily backstop** never starts a run on an empty day. It starts one only for work a script can
see:
- an issue still labelled `wake`;
- a dead run's claim;
- C15 stale work, except draft pull requests such as the old wake channels.

## Hand-off between projects (K056)

The label wake needs a job and an outside call. A session needs neither: it can start another
project's run task itself. So **whoever finishes something another project waits on starts that
project's coordinator run in the same turn**: an inbox request sent, an inbox request answered or
blocked, a blocker closed, an action proven.

1. In the sending session, with the receiving repository attached (push access):
   `node .harness/tools/wake.mjs handoff --repo <receiving owner/name> [--issue <its item>] [--from <own owner/name>]`.
   `inbox.mjs` prints this line, filled in, after `send` and after `state --to done` or `blocked`.
2. The tool reads the receiver's claim, receipts and stops and takes the same decision as the wake
   job: one run at a time, the same caps, every stop. Its last line is what the session obeys:
   - `HANDOFF: START <trig id> …`: the claim is set and the receipt written on the receiver's STATE
     issue. Call `fire_trigger` once with that id and the printed hint as text. Never twice. If the
     call is refused or fails, run the command again with `--failed "<the error>"` (it releases the
     claim, marks the start failed and leaves `wake` on the item), and try no other way (C14).
   - `HANDOFF: QUEUED …`: no start now (a run is on, a cap, a stop, no task named). The `wake` label
     is on the item; the run that is on takes it before it ends, or the next start does.
   - `HANDOFF: NOTHING …`: nothing there to start or queue. Go on.
3. The run started this way is an ordinary run under the contract below; it removes the claim last.

**What the receiver provides.** `.github/wake.json` on its default branch, `{ "runTask": "trig_…" }`:
the id of its coordinator-run scheduled task (Setup, step 1). Until it has one, the sender may
name the task with `--task <trig id>`; the receiver's own file always wins. With neither, a
hand-off only queues.
A repository whose coordinator keeps its STATE issue by hand is read through the label
`coordinator-state`; one with no STATE issue gets `NOTHING`.

**Counts and stops.** A hand-off receipt counts as a run in every cap, and its failed start as a
failed start, when its author may write to the repository (owner, member or collaborator); a
stranger's comment counts for nothing. A hand-off sets no stop and lifts none, `backstop-off`
included (only a run the job fires re-arms the backstop): paused, stopped or capped, it queues. It
is an outside wake, so it ends a chain of runs that only started each other. No timer is added: a
hand-off happens at the moment work changes hands, or not at all.

**Two starts at the same moment.** A session is outside the job's one-at-a-time queue, so after its
receipt the hand-off waits a few seconds and reads the receipts again. Beside a receipt of the job
it always yields; between two hand-offs the earlier receipt keeps the run. The one that yields
starts nothing, leaves the claim alone and prints `QUEUED`. `--failed` releases only the start for
the same item, and only within 30 minutes of it.

**Where the job's outside call is refused**, a queued label or a released claim still starts the
job, and its failed starts add up to `wake-paused` as before. A hand-off then only queues until a
person lifts the pause: every stop holds for it too.

**Not for** events no session causes (a person's tap, a job without AI): those stay with the label.

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

A run never changes its own scheduled task, the workflow or the caps. It never removes
`wake-stopped`, `wake-paused` or `backstop-off`, never edits the job's comments, never starts the
workflow by hand, and never touches any permission or secret.

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
  usage, never money, and at most 48 a day per repository.
- **Rate limits:** the `/fire` limits are 30 fires an hour per task and 100 an hour per account.
  They are far above the caps.

## Retiring the old wake channels

A project whose proof (Setup step 3) has held retires the old wake channel in three steps:

1. Senders set `wake` instead of commenting on its draft pull request (`inbox-wake` or
   `wake-channel`). For inbox requests this is automatic once the control repository runs kit
   0.33.0 or later (`inbox.md`, "Pickup by label", K036), and, for a project with its own
   `harness-inbox` job, once that project runs 0.33.0 too (an older one answers first, through the
   channel). Any other poster of that pull request (a project's own jobs) moves to the label first.
2. Close the draft pull request.
3. The coordinator stops subscribing to it.

The inbox keeps its issues and states (`inbox.md`). A sender may set `wake` on a request in
addition to the `inbox` label.
