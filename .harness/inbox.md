# Harness Kit · the inbox

> Lookup only, never loaded by default. Cross-project requests (O14, K009): the issue shape, the
> pickup wiring, setup and cost. The procedure is the `inbox` skill.

## The issue

One request is one issue labelled `inbox` in the repository that does the work, filed with
`inbox.mjs send`. Its body holds a hidden marker `<!-- inbox-id: … -->` and seven lines: ID,
Source, Outcome, Responsible coordinator, Covered by, State (`queued`, `working`, `blocked`,
`done`) and Evidence. Only `inbox.mjs` edits them. The ID is stable, so a redelivered request finds
the existing issue and files nothing. `done` closes the issue with its evidence; replies and
progress are comments on it.

A request proceeds only if an existing, verified owner decision or standing delegation covers its
scope; citing a decision never expands it.

## Pickup (K018)

1. The sender files the request with `inbox.mjs send`, which then comments the wake on the
   receiving repository's **wake channel**: its open draft pull request from the branch
   `inbox-wake`, never merged.
2. The receiving coordinator's session is subscribed to that pull request, so the comment reaches it
   as a GitHub event, at no cost and with no schedule. It runs the `inbox` skill.
3. "Woke" is written on the request only after GitHub accepted the wake comment. Otherwise the
   request gets one "Not delivered" note and `send` ends non-zero; nothing is lost: a resend of the
   same ID tries the wake again, and the coordinator's own `pending` check at the start of a turn
   finds it. A request is woken once; nothing ever asks a person to wake or relay (O15).
4. `harness-inbox.yml` (on the `inbox` label) runs `inbox.mjs wake`: a request already woken, picked
   up or done wakes nobody. A project without the channel may still fire a routine from it
   (`INBOX_ROUTINE_URL`, `INBOX_ROUTINE_TOKEN`); a routine fire is not proof the session ran, so the
   channel is the standard.

## Setup in a project (once)

1. The settings file declares the label:
   `{ "name": "inbox", "color": "5319e7", "description": "Cross-project request (Harness Kit inbox)" }`.
2. The coordinator opens the channel in its own repository:
   `node .harness/tools/inbox.mjs channel --repo <owner/name> --open` (a project without the kit runs
   the kit's copy of the tool). `channel` without `--open` checks it.
3. The coordinator subscribes its session to that pull request (`subscribe_pr_activity`) as the
   first step of every session, and the project's own instructions say so, so a new coordinator
   does it too.
4. Prove it once: a test request sent with `inbox.mjs send` shows "Woke" on the request and the
   coordinator picks it up with no one prompting it.

## Cost (O13)

The wake channel costs nothing: one comment per request on a pull request that never runs again.
`harness-inbox` runs one job of a few seconds per labelled or reopened inbox issue, on
`${{ vars.RUNNER || 'ubuntu-latest' }}`: about one GitHub-hosted minute per request on a private
repository without a self-hosted `RUNNER`; none with the Actions variable `RUNNER` set to a
self-hosted runner's label, or on a public repository; nothing when no request arrives. A request
left queued or working for a day is listed by the stale-work check (`harness-stale`, C15). Each
pickup is one routine run, which counts against the owner's Claude subscription usage like any
session.
