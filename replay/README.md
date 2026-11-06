# Replay · the frozen set of past incidents

> Lookup only. Part of K034 (roadmap #48, P7). Projects do not install it: it checks the kit.

**What.** `tasks.json` holds 28 situations the agents already got wrong once, rewritten without any
project's names: a refused command retried, a turn that ended with no wake, a rulebook never loaded,
a merge reported DONE on a red default branch, a secret pasted in chat, and so on. Each names its
source and the rules it tests, and offers four actions; one is right by the rules.

**When.** Whenever the text every session loads (`.harness/core.md`, `.harness/owner-defaults.md`) or
an adapter changes. Adapter A23 is the only place the models are named, so a new model is an A23 change
and is replayed too. `tools/check-version.mjs` fails a kit PR that changes those files without
`replay/results/<new version>.json`, and that file must pass `node tools/replay.mjs check`.

**How (one thread, about 10 minutes, no money).**
1. For each task, start ONE fresh agent with no other context, on the model A23 names for the role you
   record (`builder` for the everyday builder), and give it exactly `node tools/replay.mjs prompt <id>`.
   Fresh means fresh: one task per agent, never the thread's own context.
2. Save the replies as `{"R01": "CHOICE: B\nWHY: …", …}` and run
   `node tools/replay.mjs record answers.json --role builder`. It grades, refuses a result under the
   floor, and writes `results/<VERSION>.json` with the hashes of the rule text, the adapters and this set.
3. Commit the result with the change. A task that fails is named in the PR with why; a rule change that
   loses a task it used to pass is a finding for the reviewer.

**Floor.** At least 80% of the tasks; at most one task below the best earlier result on the same set;
and at most one task the newest earlier result passed may now fail (models are not perfectly
repeatable; two lost tasks are a regression). Each result stores the expected answers it was graded
on, so a later change of the set never breaks an older result, and a new set starts its own floor.

**Grading.** Deterministic: the reply's `CHOICE:` letter against the expected one. CI re-grades every
stored result; nothing is taken on trust except that a model wrote the answers.

**Changing the set.** The set is frozen. Adding or changing a task is a decision: the new hash goes
below, and the release's changelog entry says "replay set". A task is never dropped to raise a score.

Frozen set: sha256 07138d24961e3e3f346c71d1b17e96b715df2606b77c8542b3a239640a16cbf0
