# DECISIONS — the Harness Kit register

> Append-only, newest last. A `K###` number is never reused. Change a decision by appending a new
> entry that names the one it supersedes; never edit an entry's rule. Each entry: the rule, its
> source, its status (`LOCKED` settled · `STANDING` live rule · `BOUNDARY` a deliberate limit for now).
> This repository is public: entries hold only generic rules, never business data or private excerpts.

## K001 · 2026-10-04 · LOCKED — the owner's founding message

**Source:** the owner's message that opened card H1 in the Harness Kit project (project thread
`cmsg_01C7xQzuv2D5T8yCbVzmNegvUYr4PkVJxxSiiY9SiJRUZx`, 2026-10-04 10:18 UTC). He approved it by
pasting it ("Owner-approved by pasting this message; record that source as this repo's first
DECISIONS entry"). Recorded verbatim below; every later entry derives from it or supersedes part of it.

<details><summary>The message, verbatim</summary>

```text
Owner-approved by pasting this message; record that source as this repo's first DECISIONS entry.
PROJECT · HARNESS KIT — one standard for how the owner's AI agents plan, build, verify, release and maintain, kept in one home and installed in every project.

OWNER STEPS (how to work with the owner):
- Do the work yourself. Ask the owner only for what nothing else can do: creating an account, token or app on his behalf, a payment, a physical action, or a decision only he can make.
- Batch everything you need from him into ONE message, posted as WAITING FOR YOU, at most a few steps. Each step is exact to the click and keystroke: the link to open, the button names, the text to paste, and what he should see when it worked. Never vague, never "configure X".
- A decision comes as A/B (at most C) with a one-line trade-off each and your recommendation; he replies with a letter.
- Never ask him to paste a secret into chat; secrets go into GitHub or the tool itself.

Owner decisions (2–4 Oct): one general kit; projects get a pinned copy of kit-managed files, updated by automated, authorized maintenance PRs (no plugin: cloud threads don't load plugins); this repo is public and holds only generic rules, tools and sanitized examples (no business data, audit reports or private excerpts); its own project; read-only on other repos until a pilot is approved. The kit does not manage .claude/settings.json (an initial boundary, recorded as such).

STRUCTURE (layers, not systems):
- core: the stages (plan, build, verify, release, maintain; maintain may be not-applicable; small fixes use a compressed cycle), task lifecycle, evidence, scope, handovers, failure handling, proportionate verification. Short; the full rule catalogue is for lookup, never preloaded.
- owner defaults: act within existing authorization and ask only for what stays reserved or unavailable; model roles (Sonnet for bounded work, Opus for hard or risky work, independent verification by risk; optional reviewers never an availability dependency); short headline reports; no Claude attribution; Telegram only for unresolved failures and action-required events.
- project profile: stack, commands, branches and required checks, environments, modules, business rules, permissions, enabled capabilities, exceptions.
- platform adapters: how Claude Code and GitHub load instructions, skills and settings, and their current limits. Platform lessons live here, not in core.
- types are named presets of capabilities (database, auth, public interface, deployments, recurring jobs, sensitive data, bilingual, host/infra). Build only the presets in use: "web app" (the ERP) and "public website" (the website). Others ("research and documents", "automation and servers") get defined only when a real project needs them, by what makes them different.
- Shared content lives in .harness/; the Claude entry files load it through the supported mechanism; prove loading in a fresh session and after a resume.

CARD H1 · EXTRACT AND CLASSIFY (read the harnesses of obidex/jahjah-internal and obidex/jahjah-website, read-only)
- Output: the short core; the owner defaults; the profile schema; the two presets; the Claude Code + GitHub adapter; a list of rules deliberately left project-specific, each with why.
- Each rule: ID, applicability condition, expected outcome, source, and its verification method (a script check or judgment).
- The external "AI Harness" course: a bounded search; if found, adopt only clear improvements, a reason each; not a prerequisite.

CARD H2 · PROVE THE KIT
- Audit: cheap structural checks that run when relevant files change, and a judgment review that samples recent active work. Results are PASS / FAIL / UNKNOWN / NOT APPLICABLE, each with evidence; missing access is UNKNOWN, never a pass. Measure behaviour, not paperwork: sampled cards end in a valid outcome or a durable handover; repository enforcement really requires the intended checks; jobs have timeouts, bounded retries, failure handling and deduplicated alerts; state reflects real progress; conflicting rules are flagged for judgment.
- Run the audit read-only on both projects. The reports stay private (attached in this project's chat, never committed here).
- A minimal initializer and updater, proven in a disposable sandbox repo: install; load in a fresh session and after a resume; update to a new immutable kit version via a PR with checks and automatic merge; keep project-owned files untouched; roll back. Prove the unattended PR → checks → merge path with a properly authorized mechanism (PRs opened with GITHUB_TOKEN may need approval); if it needs a GitHub App or token, the owner creates it once, following OWNER STEPS above.
DONE: core, defaults, schema, presets, adapter, audit, initializer and updater proven in the sandbox, two private reports, and one page for the owner with at most 3 decisions (A/B plus a recommendation).
NEXT, not now: H3 pilots one bounded part in one real project (loading, updating, local rules kept, rollback); H4 enrolls the second project, and new projects through the same initializer; H5 turns lessons into tested releases. Cards record their kit version.
```

</details>

**Status:** LOCKED. Its "does not manage `.claude/settings.json`" clause is a `BOUNDARY`, recorded as
an initial limit, not a permanent rule.

## K002 · 2026-10-04 · STANDING — how card H1 shaped the kit

**Source:** card H1 under K001's authorization (decided by the thread, within the approved plan).

1. Rule IDs are permanent addresses by layer: `C##` core, `O##` owner defaults, `<CAP>##` capability
   rules (`DB AU PI DP RJ SD BL HI`), `WA##` / `PW##` preset rules, `A##` adapter, `L##` rules left
   project-specific. Every rule has a catalogue record: applies when, expected outcome, source,
   verification (`script:` or `judgment:`).
2. Only `.harness/core.md` and `.harness/owner-defaults.md` are loaded into every session; the
   catalogue, capabilities, presets and adapter are lookup material (K001: "never preloaded").
3. The project profile is a JSON file validated by `.harness/profile.schema.json`, so H2's
   structural audit can read it without extra tooling.
4. Sources cite the two first projects by role, `ERP` and `WEB`, with file, section and decision
   number only; no excerpt of their business rules is copied here.
5. From the external harness-engineering course search, exactly one improvement is adopted: every
   `Found:` names its failure class (context · constraint · verification · planning) — see C14.
   Stop-time verification hooks were judged useful but need `.claude/settings.json`, which K001
   keeps out of scope; they wait for that boundary to move.

**Status:** STANDING.

## K003 · 2026-10-04 · STANDING — how card H2 installs, updates and audits the kit

**Source:** card H2 under K001's authorization (decided by the thread, within the approved plan).

1. **Versions are tags.** A kit version is the tag `v<X.Y.Z>`, created by the `release` workflow when
   `main` carries a `.harness/VERSION` with no tag yet. Tags are never moved or deleted. A pull
   request that changes `.harness/**` must raise `VERSION` and add a `CHANGELOG.md` entry
   (`tools/check-version.mjs`).
2. **One home for the installed version.** `.harness/VERSION`, imported by `CLAUDE.md` so a session
   can state it. The profile's `kit.version` is removed (C17: one home per fact).
3. **What the kit owns in a project.** Every file under `.harness/` except `profile.json` and
   `kit.lock.json`, plus `.github/workflows/harness-*.yml`. `.harness/kit.lock.json` lists them with
   their hashes and records the commit each version's tag named. Everything else is project-owned:
   `update` and `rollback` never write it; `init` writes `CLAUDE.md` and `profile.json` only when
   they are absent or lack the kit's imports.
4. **Update and rollback are one path.** `harness-update` opens a pull request that moves the pin to
   a version (the newest by default, an older one to roll back) and turns on auto-merge; the
   project's required checks decide. The updater refuses when a kit-managed file was edited in the
   project, or when the installed version's tag now names a different commit.
5. **Audit.** A structural script decides what a machine can decide; a fresh-context judgment review
   samples recent work for the rest. Results are `PASS · FAIL · UNKNOWN · NOT APPLICABLE` with
   evidence. A project may accept today's FAILs as a baseline so CI fails only on new ones (the C18
   ratchet). Reports about a real project are private and never committed here (K001).
6. **Boundary kept.** The kit still does not manage `.claude/settings.json` (K001); the audit only
   reads it.

**Status:** STANDING.

## K004 · 2026-10-04 · STANDING — prevention after every correction, and the correct skill

**Source:** the owner's message that opened this card in the Harness Kit project (project thread
`cmsg_01C7xQzuv2D5T8yCbVzmNegvQzZmTJb3SdjckXHE42UCPW`, 2026-10-04 15:51 UTC). He approved it by
pasting it ("Owner-approved by pasting this message; record that source in DECISIONS"). Recorded
verbatim below.

<details><summary>The message, verbatim</summary>

```text
Owner-approved by pasting this message; record that source in DECISIONS.
H1/H2 are merged (kit 0.2.0). Add ONE core entry and one skill:
1. Core principle: every owner correction or repeated failure ends with its prevention, at the highest level worth its cost. Escalate when an issue happens twice or is costly; a one-off small mistake is fixed, not ruled. Owner review is not a prevention level; independent AI review only for risky areas. Each prevention is recorded once with where it lives; the audit reports corrections that recurred.
2. A /correct skill adapted from pstack's (cursor/plugins, pstack/skills/correct/SKILL.md, MIT; credit the source in the file): assume every contributor is an agent that sees only the files it opened, copies the nearest example and takes the shortest path that compiles; fix each mistake class at the highest level that works — architecture and one source of truth (delete old ways an agent would copy) → types → a lint or CI check whose error names the fix (failing only on new occurrences when the pattern is already common) → a behaviour test (reject tests that pass with empty functions) → a rule last, only for judgment calls; prove each new check fails on a real past mistake; same command locally and in CI; keep a rule table pairing each rule with what enforces it and drop a rule once its mistake can't happen. Exceptions carry a reason and an expiry checked by the reviewer, never an owner approval. Evidence: commits and reverts, review and verifier findings, threads' Found lines, owner corrections.
3. Then post the H2 one-page summary for the owner (at most 3 decisions, A/B plus a recommendation) if it is not posted yet.
```

</details>

How it was applied (decided by the thread, within the message):

1. **C19 Prevention** is the one new core entry. Core grows by it although C17 caps always-loaded
   text; the owner asked for exactly this entry. C18 still says *where* a correction lives (narrowest
   home first); C19 says *how strongly* it is enforced. The ladder itself lives once, in the skill.
2. **The skill ships with the kit.** `.harness/templates/skills/correct/SKILL.md`, installed in each
   project as `.claude/skills/correct/SKILL.md`. This extends K003 §3: the kit also owns
   `.claude/skills/<name>/` for each name it ships, and nothing else under `.claude/`. The installer's
   existing clash guard refuses to overwrite a project's own skill of the same name.
3. **Agents may load it themselves** (pstack's `disable-model-invocation` is dropped), since C19
   applies after every correction, not only when someone types `/correct`.
4. **The rule table lives in the project's rulebook** (`AGENTS.md` or what the profile names), as in
   pstack: `Rule · What enforces it · Where it lives · Proven by`. That row is C19's single record.
5. Item 3 (the H2 owner page) was already posted by card H2; nothing here.

**Status:** STANDING.

## K005 · 2026-10-04 · STANDING — correct before merging 0.3.0, proof of updates, H3 bounds

**Source:** the owner's follow-up in the Harness Kit project chat (message
`cmsg_01C7xQzuv2D5T8yCbVzmNegvEjkm3SSyHvwyMP4WdLpkhD`, 2026-10-04 16:09 UTC). He approved it by
pasting it ("Owner-approved by pasting this message; record that source in DECISIONS"). Recorded
verbatim below. It supersedes K004 §4 (the rule table's home).

<details><summary>The message, verbatim</summary>

```text
Owner-approved by pasting this message; record that source in DECISIONS.
Before merging PR #3 (v0.3.0):
1. /correct: replace "a repeated mistake moves up a level in the same change" with diagnosis first: a repeat may mean the existing check was not run, was wired wrong or covered the wrong boundary, and that is fixed before escalating. Prioritize by impact and recurrence, not frequency alone. The prevention register lives in lookup docs, never in always-loaded files. Serious existing defects stay tracked for release even when a new check blocks only new occurrences. Each prevention needs proof that it catches a representative failure AND accepts correct behaviour.
2. The one-page summary for the owner links evidence of a real unattended GitHub update: an update PR opened by the updater, required checks run, automatic merge. Local installer tests are not that proof. Anything not yet proven is marked unfinished; a release counts as "proven" only after evidence, never because its PR merged.
3. H3 stays one bounded task with a pinned kit version. The ERP's launch never depends on adopting the kit, and nothing changes the ERP's governing workflow during its final verification.
```

</details>

How it was applied:

1. **Item 1** is in `.harness/templates/skills/correct/SKILL.md` (§1 diagnosis and priority, §3
   two-sided proof and existing defects, §4 register) and C19's catalogue record. The prevention
   register is a project lookup doc, `docs/preventions.md` unless the project names another; never
   `CLAUDE.md`, `AGENTS.md` or anything they import. This replaces K004 §4.
2. **Item 2** binds card H2's owner page and every later release claim: "proven" needs linked
   evidence of the unattended path (an update PR opened by the updater, its required checks run, its
   automatic merge); a merged PR or a local test is not that evidence, and unproven items say
   unfinished. The H2 card owns the page.
3. **Item 3 bounds card H3.** One bounded task in one project, on a pinned kit version. The ERP's
   launch never depends on adopting the kit, and nothing in H3 changes the ERP's governing workflow
   while the ERP is in its final verification.

**Status:** STANDING.

## K006 · 2026-10-04 · STANDING — the owner's three H2 answers, and the scrubber

**Source:** the owner's message in the project chat on 2026-10-04 answering card H2's owner page,
verbatim: "done. 1A 2A 3A. For 2A: no Claude attribution anywhere, enforced automatically: a small
workflow removes "Generated by Claude Code" lines and claude.ai thread links from PR bodies, issue
bodies and comments right after they are posted, in every enrolled repo. Before the kit reaches real
projects, propose a lasting update credential that needs no yearly renewal."

1. **1A, the unattended identity.** For now an owner-created fine-grained token in the
   `HARNESS_TOKEN` secret opens maintenance PRs (A13). Before the kit reaches a real project, H2
   proposes a lasting credential needing no yearly renewal; `harness-update.yml` already prefers a
   GitHub App (variable `HARNESS_APP_ID`, secret `HARNESS_APP_KEY`) when one is configured, so the
   switch is a settings change, not a release.
2. **2A, attribution.** O09 is enforced, not trusted: the kit installs `harness-scrub.yml`, which
   runs `.harness/tools/scrub.mjs` on every issue, PR, comment and review as it is posted or edited
   and removes "Generated by/with Claude Code" lines, Claude co-author and session lines and
   claude.ai links. It never checks out PR code, and its own edit starts no workflow. The audit's
   O09 also reads recent bodies and fails on any attribution left.
3. **3A, X02.** The website aligns to O06 (Sonnet or Opus by task) when it adopts the kit; no
   exception is recorded.
4. **The new version's tool applies it.** `update` and `rollback` check the lock and the tag, then
   hand the fetched kit to its own `harness.mjs` (`harness-apply/1`), so a release that changes what
   the kit manages takes effect on the update that installs it. Versions before 0.4.0 lack that
   entry point and are applied by the running tool.

**Status:** STANDING.

## K007 · 2026-10-04 · STANDING — one GitHub App holds the owner's GitHub hands

**Source:** the owner's message in the project chat on 2026-10-04 answering decision 4, verbatim:
"4A. Make this GitHub App the single "GitHub hands" for all the owner's projects, so repository
housekeeping never comes back to him: One-time owner setup, as short as possible: prefer GitHub's
App-manifest flow so the name and permissions are prefilled; exact clicks; the private key goes
straight into a repository secret, never into chat. Batch every remaining owner step into that one
sitting. Settings as code: each enrolled repo keeps its settings, rulesets (incl. strict required
checks), auto-merge, labels and required checks in a file; a workflow on main applies them with the
App after review, so a settings change is a PR that merges itself and the owner never clicks
repository settings again. The App is used only by reviewed workflows on main, never by an AI
session directly; least privilege per job; every use logged; failures alert by Telegram. Report
which owner steps this removes (rulesets, auto-merge, repo settings, update PRs) and what still
needs him (creating a new repo, payments, physical machines)."

1. **One App, one control repo.** The owner creates one GitHub App, installs it on all his
   repositories, and keeps its key only in the `hands` environment of a private control repository,
   restricted to `main`. The kit ships that repository's workflows in `.harness/templates/hands/`;
   they run only on a schedule or a manual dispatch from `main`, never on a pull request, so no
   session or PR code reaches the key (`hands.mjs control-check`, in check-kit and `hands-check`).
2. **Registration by prefilled URL, not the manifest flow.** The manifest flow returns the private
   key to whatever exchanges its code, which would be a session or a page; the URL-parameter form
   prefills the name and permissions and the owner downloads the key himself into the environment
   secret. Same clicks, the key never leaves GitHub and his browser.
3. **Least privilege per job.** Each job mints a token for one repository with only what it needs:
   `hands-settings` administration and issues write, `hands-update` contents, pull requests and
   workflows write, the log job issues write on the control repo.
4. **Settings as code (A14).** A project's `.github/harness-settings.json` (schema
   `.harness/settings.schema.json`) names its repository settings, rulesets with strict required
   checks, auto-merge and labels. `hands-settings` applies it hourly from the default branch, so a
   reviewed PR that changes the file is the only way settings change. The tool refuses auto-merge
   without an active ruleset requiring checks, and a required check no PR workflow defines.
5. **Updates by the App.** `hands-update` replaces each repo's `harness-update.yml` and the
   `HARNESS_TOKEN` token: it opens the update PR as the App and turns on auto-merge. Maintenance
   commits are the App's, the owner's own identity, never Claude's (O09).
6. **Logged and alerted.** Every write is a line in the control repo's monthly "hands log" issue; a
   failed run opens one tracking issue and sends one Telegram message per failure (O10).
7. **The trust boundary is a kit release.** The control repo runs the kit at the tag it pins, with
   the key; a kit change reaches the key only through a reviewed release and a reviewed pin bump.

**Status:** STANDING.

## K008 · 2026-10-05 · STANDING — settings apply on change; metered resources need notice

**Source:** the owner's message in the project chat on 2026-10-05 (items 1 and 2), verbatim:
"COST FIRST, now: hands-settings runs hourly on GitHub-hosted runners (about 4 jobs × 24 × 30 ≈
2,900 minutes a month with ERP and website enrolled, close to the whole GitHub Pro allowance).
Change it today: apply only when a settings file changes on a default branch (an authorized
trigger), plus one daily drift check, with no per-repo jobs for unchanged repos. Keep the App key in
its current environment; don't move it onto a general CI worker. Report the old and new monthly
minute estimate." and "RESOURCE RULE (owner, all projects): nothing that uses GitHub-hosted minutes,
paid services, storage or other metered resources is added or increased without telling the owner
first with an estimate. Inventory every workflow in harness-kit, harness-hands and the sandbox that
runs on GitHub-hosted runners, with monthly minutes, and put the rule in the kit's owner defaults so
every project inherits it."

1. **The authorized trigger is a dispatch.** A project's push cannot start a workflow in the control
   repository without a credential in the project, and the key stays in the `hands` environment.
   So the session that merges a settings PR dispatches `hands-settings` for that repository; only
   write access to the control repository can, and only its reviewed `main` runs. Supersedes the
   "hourly" in K007 item 4.
2. **One daily drift check.** One job compares every enrolled repository with its file; only
   those that differ get a write job. A missed dispatch is applied within a day. GitHub hides a
   ruleset's bypass list from a read-only token, which would read as drift every day, so the
   check's token carries administration write and the tool itself refuses every write
   (`HANDS_READ_ONLY`). The job runs only the pinned kit, which already holds the key there.
3. **Read back.** Every apply re-reads the live settings and fails unless they match the file.
4. **Emergency stop.** `HANDS_PAUSED` names repositories the hands leave alone; the path back is
   pause, repair, bring the file into agreement, resume (`.harness/hands.md`).
5. **O13** carries the resource rule to every project.

**Status:** STANDING.

## K009 · 2026-10-05 · STANDING — the inbox for cross-project requests

**Source:** the owner's message in the project chat on 2026-10-05 (item 4), verbatim: "INBOX: a
cross-project request is an issue labelled `inbox` in the repo that does the work, with the source
link and a stable ID (no duplicates), the requested outcome, the responsible coordinator, the
covering owner decision or delegation, a state (queued / working / blocked / done) and completion
evidence. Replies and progress stay on that issue; the sender reads the result there. A request
proceeds only if an existing, verified owner decision or standing delegation covers its scope;
citing a decision never expands it. Prove pickup without the owner: an idle receiving coordinator is
woken through supported tooling (scripts detect pending work, the AI runs only when there is some),
does the work, posts evidence, and the sender sees it done; a redelivered request creates no
duplicate. Then put the inbox rules and pickup wiring into the installer so new projects inherit
them."

1. **The issue is the record.** Fields live in the body, edited only by `inbox.mjs`; the hidden
   `inbox-id` marker makes `send` idempotent.
2. **Pickup is event-driven.** GitHub's `issues: labeled` starts one short job; it fires the
   receiving coordinator's routine through the routine's API trigger only for a queued request.
   Routines' own GitHub triggers cover pull requests and releases, not issues, hence the job.
3. **The token is the owner's.** A routine's API token is created only in claude.ai by the owner and
   lives as the repository's Actions secrets; the job sends it only to a routine fire URL.
4. **Verified cover.** The receiving coordinator opens the cited decision and checks the outcome
   is inside its words before any work; otherwise the request is `blocked` and goes to the batch.

**Status:** STANDING.

## K010 · 2026-10-05 · STANDING — one notification standard for every sender

**Source:** the owner's message in the project chat on 2026-10-05 (thread
`cmsg_01C7xQzuv2D5T8yCbVzmNegvSqVu1ebs9vGbV82HCoLP13`), summarized without private names: one bot
and one private Telegram group with Topics: "Needs you" (loud, action-required only), one topic per
project, "Kit & Hands", "Laptop & VPS" (silent) and "Daily" (one silent digest a day); the bot
creates the topics itself and the owner only creates the group, turns on Topics and adds the bot as
admin. Every PROBLEM gets a RESOLVED or STILL OPEN posted as a reply to its original message; a
silent problem still open after 3 hours escalates to "Needs you". Quiet hours 23:00-08:00 Damascus:
everything silent except a production outage. Every sender uses it, with deduplication and caps; the
kit's installer carries it into each project; added Actions minutes are reported before they are
turned on.

1. **One tool.** `notify.mjs` holds every rule; no workflow or script calls Telegram itself (audit
   O10). Supersedes the direct Telegram call in `hands-report` (K007).
2. **The group holds its own config.** `setup` creates the topics and pins their ids, so senders
   carry only the token and the chat id; the bot is the only writer.
3. **State where the sender lives.** A host keeps a state file; GitHub keeps one issue per problem,
   so the record is readable by agents and costs nothing. The Telegram message id rides in the issue.
4. **The clock is a tick.** Escalation, STILL OPEN and held messages need a periodic `tick`. Hosts
   tick from cron for free; the control repository ticks itself in its daily job; an hourly Actions
   tick across repositories exists but is off until the owner turns it on (O13).
5. **Quiet escalation waits.** An escalation due in quiet hours is posted at 08:00, so it is heard.

## K011 · 2026-10-05 · STANDING — owner rules for every project; a self-hosted lane; the stale-work check

**Source:** the owner's message in the project chat on 2026-10-05, verbatim fragment: "Bring in the
owner rules it lacks: models per task (Sonnet for bounded work, Opus for hard decisions and risky
review), the real-check rule, turn-ending, the stale-work check, Telegram alerts within caps, no
Claude attribution (with the scrubber), the resource rule, the inbox. Keep the website's existing
CI; propose the laptop lane only where measurements show a real benefit."

1. **A self-hosted lane for every kit-installed workflow.** Each `harness-*` job runs on
   `${{ vars.RUNNER || 'ubuntu-latest' }}`, the convention the projects' own CI already uses. The
   measured benefit: a busy private project gets about 700 issue and PR comments a month, so
   `harness-scrub` alone would add about 900 GitHub-hosted minutes a month on `ubuntu-latest`, while
   that project's CI already runs on its self-hosted VPS runner. With `RUNNER` set, the kit's jobs use
   no hosted minutes; without it, nothing changes. Privileged jobs check out only the default
   branch's `.harness/tools` with `persist-credentials: false`; `harness-audit`, which runs a PR's
   code, takes the self-hosted lane only for a PR from the same repository. A project's existing CI
   is not touched.
2. **The stale-work check runs per project, on that lane** (`harness-stale.yml`, `stale.mjs`, C15),
   not as one hosted job in the control repository: the project's runner is unmetered, the job needs
   only the project's own `GITHUB_TOKEN`, and the list belongs next to the work. Once a day it
   lists idle PRs (green-unmerged, red, conflicted, draft; bot PRs too), inbox requests left queued
   or working, and `card` or `risk:*` issues, in one tracking issue updated in place and closed when
   empty (RJ02).
3. **Alerts within the one standard (O10, K010).** The check sends nothing itself: when its list
   holds items not announced before, it opens the problem `stale:<owner/name>` through `notify.mjs`
   in the project's topic (the profile's `alerts.topic`, since a kit-installed workflow cannot
   hard-code it; the Actions variable `ALERTS_TOPIC` overrides it), linking the "Stale work" issue; an empty list resolves it. Deduplication, caps,
   quiet hours and escalation are `notify.mjs`'s, not repeated here. An undelivered alert fails the
   run and its items stay unannounced, so the next run asks again.
4. **Kit update PRs carry a project's standing authorization lines** (`kit_updates.pr_body_lines` in
   the profile), read by the workflow itself and validated against a plain-text pattern with no
   closing keywords, so a project's guard on `.github/**` or `.claude/**` PRs does not block every
   unattended update. The project records the decision that grants the line.
5. **Order of adoption.** H3 is the kit pilot on the website (WEB), a private repository whose CI
   runs on a self-hosted VPS runner; the web app (ERP) adopts the kit after its verification, as H4.
   The "laptop lane" in the source is proposed only where measurements show a real benefit; the
   `RUNNER` lane here is the project's existing self-hosted runner, not a new one.

**Status:** STANDING.

## K012 · 2026-10-05 · STANDING — kit update PRs keep themselves current

**Source:** the owner's message in the project chat on 2026-10-05 (item 4), verbatim: "Kit-update PRs
must keep themselves current: when the base branch moves, the updater brings its PR up to date (the
App's update-branch call) instead of a thread doing it by hand."

1. **Why it is needed.** A strict required-checks rule (A11) makes a PR "behind" whenever its base
   branch moves, and GitHub's auto-merge then waits forever: it never updates the branch. Two kit
   update PRs sat that way on 2026-10-05 until a session updated them by hand.
2. **Who updates.** `hands-keep` in the control repository, with an App token (A13: a commit made
   with a workflow's own `GITHUB_TOKEN` starts no checks, so the PR would wait again). It calls
   GitHub's update-branch for each open kit update PR (`harness/kit-X.Y.Z`, opened by the App, from
   the same repository) that is behind, pinned to the head it saw; the project's checks run on the
   new head and auto-merge goes on. It never touches another PR, a draft or a conflicted one. A
   project cannot reach the control repository on its own push without a credential (K008.1), so
   the check is a schedule, not an event.
3. **Cost (O13).** The workflow is on only while a kit update PR is open: `hands-update` turns it on
   and runs it once when it opens or finds one; the first run that finds none turns it off with the
   control repository's own token. Hourly while on, one one-minute job, plus one report job when it
   writes, fails or turns off: about 2-4 GitHub-hosted minutes per kit update; a PR left open longer
   than `HANDS_KEEP_HOURS` (72) is left to the stale-work check, so one stuck PR costs at most about
   75. A workflow turned off by hand (as this one turns itself off) is not a missed schedule.
4. **Token.** The job's token covers the App's repositories (it lists them first) with contents,
   pull-requests and workflows write: update-branch merges the base into the PR's branch, which may
   carry workflow changes. It is used for that call only, and every update is logged in the hands log.

**Status:** STANDING.

## K013 · 2026-10-06 · STANDING — resolved problems never stay pinned; a moved job is not "never run"

**Source:** the owner's message in the project chat on 2026-10-06 ("Overnight alerts, 6 Oct — fix the
noise"), items 2 and 4: "Unpin it; only the config message stays pinned. Resolved problems never stay
pinned." and "A newly enrolled or moved scheduled job starts its overdue clock from when it was
enrolled, not from 'never'."

1. **Pins.** Senders find the topics in the chat's pinned message (the newest pinned one by sending
   date), so a later message pinned over the config hides it. `resolve` unpins its problem's
   messages; `setup` unpins any message over the config, then reads it, and clears every pin inside
   the topics (the config lives in General). Proven in `tools/test-notify.mjs`.
2. **Overdue clock.** A missed-run check starts at the newest run on schedule or by hand or, with none,
   when the workflow appeared in its repository (`stale.mjs`; the VPS's own check follows the same
   rule). Proven in `tools/test-stale.mjs`.

**Status:** STANDING.

## K014 · 2026-10-07 · STANDING — never a relay; Haiku only for read-only helpers

**Source:** the owner's messages in the project chat on 2026-10-07. At 17:50 UTC, as a standing
rule: no automation, routine or thread ever asks him to wake, nudge or relay between sessions; if
something cannot reach a session it records state, the next scheduled check picks it up, at most a
daily-summary entry, never "Needs you". At 20:08 UTC (item 3), choosing to add it to the kit's owner
defaults, "trimming words to stay within the size limit", and: "model roles gain Haiku 5.5 [...]
Haiku only for read-only helper subagents (code search, CI log reading, summaries, watchers); never
for writing code that touches money, stock or permissions, nor for reviews."

1. **O15 Never a relay.** A wake that fails is not the owner's job to repair by hand: the sender
   records the state where the next scheduled check reads it (an issue, a label, a state file), and
   the check acts on it. A routine never puts "ask the owner" in its fallback. Prefer wakes that cost
   nothing per fire (an event the receiving session is subscribed to) over routines that spend plan
   usage on every fire.
2. **Haiku in O06.** Haiku is a helper, never the thread's model for building: it runs read-only
   subagents (code search, CI log reading, summaries, watchers). It never writes code touching money,
   stock or permissions and never reviews (C10 and O07 reviews stay Sonnet or Opus). Whether it
   stretches plan usage is measured in the projects that use it, not assumed.
3. **Cap.** The always-loaded owner defaults stay within 4096 bytes (C17): the two additions are paid
   for by shorter wording of O01-O14, with no rule removed.

**Status:** STANDING.

## K015 · 2026-10-07 · STANDING — a thread closes when it reports DONE

**Source:** the owner's message in the project chat on 2026-10-07 at 20:39 UTC (item 2), as a
standing rule for all coordinators: "a thread is resolved in the same turn it reports DONE. Anything
due later (a report, a re-check) becomes a scheduled check-in on the coordinator, never an idle
thread. "Waiting on you" only for true owner steps. [...] Add this rule to the kit's owner defaults so
the ERP and website coordinators follow it too."

1. **O16.** Reporting DONE and resolving the thread happen in the same turn. A later report or
   re-check is not a reason to keep a thread open: the coordinator schedules it as its own check-in
   and starts or wakes a thread when it fires.
2. **WAITING FOR YOU** (C03) is used only when the owner has a real step to take, never to park a
   thread.
3. **Cap.** The owner defaults stay within 4096 bytes (C17) by shorter wording, with no rule
   removed. Details that `notify.mjs` performs (STILL OPEN replies, the 3-hour escalation) are in
   `.harness/alerts.md`, which O10 points to.

**Status:** STANDING.

## K016 · 2026-10-08 · STANDING — work finishes on its own; automations retire with it

**Source:** the owner's final rules in the project chat on 2026-10-08 at 00:01 UTC,
which replace the VPS parts of his repair of 2026-10-07 23:26 UTC: "The
first rule: assigned work always finishes on its own; automations never run forever." Items 1-6 of
that message, and item 7 of the earlier repair (the owner-effort pass), which they do not replace.

1. **C20-C24** in core: the finish line, the full handoff ("kit rule in each repo's agent
   instructions"), the wait record, cleanup as part of done, and failure caps that count failed
   recovery, not waiting.
2. **O06** follows item 5 (models). **O17** is the owner-effort pass.
3. **No AI runs from a server.** The cancelled parts (a recovery controller on a server, delivery
   with `claude -p --cloud`, signing a server into Claude, work windows, away mode, parking messages)
   are not kit rules; everything stays in the projects.
4. **Cap.** core stays under 7168 bytes and the owner defaults under 4096 by shorter wording, with no
   rule removed.

**Status:** STANDING.

## K017 · 2026-10-08 · STANDING — an alert holds 10 minutes, ends with "You:"; audit exceptions name commits

**Source:** the strategist's check of the owner's failed notifications, posted by the owner in the
Platform project on 2026-10-08 at 08:45 UTC (three repairs).

1. **Hold.** An alert fires only if its condition still holds 10 minutes later: host stores hold a
   new problem 10 minutes; a problem cleared sooner is never sent. GitHub stores (ticked daily) and
   outages (confirmed by their sender) are not held.
2. **Format.** No commands in messages; every PROBLEM ends with one `You:` line (`nothing`,
   `<who> is fixing it`, `Needs you: <exact step>`), enforced by `notify.mjs`; RESOLVED is the short
   reply `✅ Fixed after N min`; Damascus time only.
3. **Known exceptions.** A commit carrying Claude attribution that reached a default branch stays
   (history is never rewritten); the project records it in its audit baseline by SHA with the reason.
   The audit skips that commit only, so a new one still fails.

**Status:** STANDING.

## K018 · 2026-10-08 · STANDING — the inbox wakes through a pull-request comment

**Source:** the owner's strategist-line message in the Platform project on 2026-10-08 at 14:09 UTC,
item 4: "Every target project gets a proven free wake for inbox items." Seen: an ERP request sat
queued 8 hours with no pickup (no wake at all), and the website's routine fire was accepted while
its session never ran (two requests since 7 Oct got no pickup).

1. **Channel.** Each receiving repository keeps one draft pull request from the branch `inbox-wake`,
   never merged. The sender comments the wake on it; the coordinator's session subscribes to it as
   its first step, so the wake is a GitHub event at no cost (the same pattern as the Platform
   roadmap's wake channel).
2. **Delivery is recorded only when it lands.** "Woke" goes on the request only after GitHub
   accepted the comment; otherwise one "Not delivered" note and a non-zero exit, and the request
   stays queued for a resend or the coordinator's own check. Never a person in the loop (O15).
3. **Routines.** The routine fire stays only for a project without the channel; it is not proof of
   a pickup.

## K019 · 2026-10-08 · STANDING — an idle wait names who acts next; outside checkers are not wait points

**Source:** the strategist's two fixes, posted by the owner in the Platform project on 2026-10-08 at
14:17 UTC (item 2). A thread sat idle with "WAITING FOR YOU — nothing yet" while the next action was
another party's, and owner steps waited on a checker that no session can wake.

1. **Status words (C03, C22).** `WAITING FOR YOU — <exact action>` only when the owner acts next.
   Any other wait ends `WAITING ON <who> — <what>` and names how the card will be woken when that
   clears, which is its C22 wait record (now: who acts next, what wakes it). "Nothing" is never a
   status while any party has an action.
2. **Outside checkers (O18).** A checker that no session can wake (a chat only the owner runs) is
   never a wait point. The project's independent reviewer runs that checker's checklist (rebuilt
   checksums match, the owner-effort pass, no secret on the wrong machine), then the step goes to the
   owner; the checker audits afterwards through its own line, and its findings return as evidence.
3. **Exception.** Only a step that spends money or touches production waits for the checker, and the
   owner's message for it says: tell the checker "check".
4. **Cap.** core and owner defaults stay under their caps by shorter wording, with no rule removed.

**Status:** STANDING.

## K020 · 2026-10-08 · STANDING — waits wake themselves

**Source:** the strategist's finding, posted by the owner in the Platform project on 2026-10-08 at
16:08 UTC. Two threads idled on events that had already happened: one waited "on CI" after its
required check had passed (a pass never woke it) and never acted on three review findings that
arrived mid-turn; a merge-batch thread waited for another thread's "go" message instead of reading
the pull request's state.

1. **Self-reminder (C25).** A turn never ends waiting on CI, a review or another thread without one
   self-reminder (or a watcher) at the expected finish. On wake it reads the real state (checks,
   reviews, new comments since its last turn) and continues, or sets one more. At most three per
   wait, then STOPPED with why. Reminders are deleted when the card is DONE (C23).
2. **Read first.** Each turn starts by reading the PR's comments and reviews since the last turn, so
   findings that arrived mid-turn are never lost.
3. **Merge from the PR.** A thread that merges decides from the PR's state (required checks green, a
   review PASS recorded, no unanswered finding) and wakes itself the same way; never from another
   thread's message alone.
4. **Proof.** One pull request in a project goes from push to merged with no owner or coordinator
   nudge, and its reminders are gone afterwards.
5. **Cap.** core stays under its cap by shorter wording, with no rule removed.

**Status:** STANDING.

## K021 · 2026-10-08 · STANDING — settings load only in a one-repository session

**Source:** the owner's permissions repair, posted in the Platform project on 2026-10-08 at 19:21
UTC. Routine work stopped for owner sentences: a product thread attached a second repository to read
the board, lost its repository settings at the next resume, committed as Claude, then had its
re-author, push and harness edit refused by the auto-mode classifier; threads in a project with
several repositories never had settings, and edits to rule files were refused unpredictably.

1. **One repository per thread (A15).** A thread never attaches a second repository; reads and
   writes elsewhere go through the coordinator or the inbox (O14).
2. **Identity.** From the repository settings, or in a project with several repositories from
   `git config` in each clone before the first commit. A commit is never re-authored.
3. **Standing approvals.** A project with several repositories states its owner's standing
   approvals (identity, edits, push, merge on the gates, talk) in its project instructions; they
   mirror existing rules and add no gate.
4. **Branch updates (A10).** On the server with the expected head SHA, never a pushed local merge.
5. **Refusals.** A refused routine command is a settings fault fixed at its cause (a fresh
   one-repository thread, or an allow rule the owner adds), never an owner sentence per push. C14
   still holds: the refused command is reported, never retried or reworded.

**Status:** STANDING.

## K022 · 2026-10-08 · STANDING — standing approvals have one home

**Source:** the owner's order of 2026-10-08, 20:12 UTC, in the Platform project: near-zero owner
involvement in every project; the standing approvals proven once (kit 0.19.0 landed with no
refusal) are published in the kit as the single source, and projects copy them and stay in step
with each release.

1. **One text (`standing-approvals.md`).** The block is the same in every project; a project fills
   in only its repositories, identity, inbox targets, reserved list and settings line. It mirrors
   O09, C07, A10, A15, C10, C12, O11, O14 and C14, and adds no gate.
2. **The reserved list stays the owner's.** At least spending money, going live in production and
   any action the safety check refuses (C14), plus secrets, the settings file, root steps on
   machines and deleting data.
3. **In step.** A release that changes the block says so in its changelog (`check-version`); the
   maintainer sends each project one inbox request (O14) with its filled-in new block, and its
   coordinator replaces the old one.
4. **Public kit.** The block carries placeholders only; `check-kit` refuses an email address or a
   repository link in it.

**Status:** STANDING.

## K023 · 2026-10-08 · STANDING — two remaining owner stops removed at their causes

**Source:** the owner's order of 2026-10-08, 20:12 UTC, item 3: count every remaining
owner-sentence stop and fix each at its cause (count on the Platform maintenance card).

1. **Shell edits (A16).** In a session without repository settings, files change through the
   file-edit and write tools. Every classifier refusal of a rule-file edit in the
   several-repository project was a shell edit; no file-tool edit was refused.
2. **Declared auto-merge off.** A project whose settings file sets `allow_auto_merge: false` has
   chosen thread merges on the gates (O11); `hands-update` passes and says so, instead of failing
   weekly until the owner decides something already inside his rules.

**Status:** STANDING.

## K024 · 2026-10-09 · STANDING — an inbox wake is posted by a job, never by a session

**Source:** the Platform maintenance repair of 2026-10-09 (Platform roadmap maintenance card): no
inbox request sent through a wake channel was ever picked up, in either product, while the same
mechanism on the Platform board, fed by a workflow, always woke its coordinator.

1. **Cause.** Every session acts as the owner's own GitHub account, and a session subscribed to a
   pull request never receives a comment its own account posted (tested: a comment by the session's
   account on a subscribed pull request produced no event; a check run 2 s later did). So a wake
   comment posted by `inbox.mjs send` from a session never reached the receiving coordinator.
2. **Fix.** An Actions job posts the wake: the receiver's `harness-inbox` job (started by the `inbox`
   label), or, for a repository without that job, the control repository's `hands-inbox` job with
   the hands App, dispatched by `send` (O13: about one hosted minute per such wake). `send` waits
   for the job's answer on the request; `--again` wakes a still-queued request once more.
3. **Access.** A cloud session reaches a repository's API only when the repository is attached to
   it with push access; a 401 or 403 says so.

**Status:** STANDING.

## K025 · 2026-10-09 · STANDING — the control panel's state is never the channel's

**Source:** the owner's request of 2026-10-05 (Telegram as a control panel) and his order of
2026-10-09, 12:03 UTC, to build it "so leaving Telegram later stays easy" (Platform roadmap card
"Telegram control panel").

1. **Core.** Problems, decisions, the fixed action list, status and the log of every action live in
   the core (`panel.mjs`), as plain files on the host. A channel adapter only shows a view and turns
   a press into an event; it stores nothing the core needs.
2. **Switching.** The channel is one setting (`CONTROL_CHANNEL`) plus its adapter. A scenario test
   must end with the same state and log on every shipped channel, and with the whole history when the
   channel changes halfway.
3. **Safety.** A press names a view and one fixed operation, never a command; only the bound owner
   account counts; refusals are logged.

**Status:** STANDING.

## K026 · 2026-10-09 · STANDING — the owner's answer is written by the App, on the card that asked

**Source:** the owner's request of 2026-10-05 (decision buttons, plan section 4.4) and the Platform
strategist's S-026 item 1, accepted by the Platform coordinator on 2026-10-09 (pre-written answers:
a press recorded on the card through the hands App, with the channel account and the time).

1. **Where.** A question lives on the card that needs it (an issue or a pull request), as one marked
   comment by the card's own people; the card is labelled `needs-owner` until every question on it
   is answered. Chat holds nothing the answer needs.
2. **Who writes the answer.** Only the control repository's `hands-answer` job, with the hands App,
   started by the panel host after the owner's press. Only the hands App's comment counts as an answer; the
   first one counts. The host checks each against its own record of presses and reports one it has
   none for (a session can start the job too).
3. **Who is woken.** A session watching the pull request the question is on (it receives the App's
   comment, K024); for an issue, the repository's coordinator through its wake channel (K018).
4. **Scope.** A press answers only the question asked: it never lifts a safety refusal, approves a
   gate or stands for the owner's approval of anything else (O05).
5. **Identity.** The owner's account is stored per channel.

**Status:** STANDING.

## K027 · 2026-10-15 · STANDING — Explain this failure: the panel relays, Claude explains elsewhere

**Source:** the owner's choice of an "Explain this failure" button paid by his existing Claude plan, with
no new paid service, and the standing rule that no AI runs on a project's machines.

1. **The button.** Only for a problem whose action entry says `explain: true` and that carries an https
   link to the failure. The panel hands the press to its host and calls no AI itself.
2. **The cap.** At most 3 presses that reached the host in any 24 h, counted from the panel's own log line
   written before the host is called, so a failing host or a crash cannot lift it. A refused press is
   logged and sends nothing.
3. **The answer.** The host relays it back with `explained(key, text)`; where the answer is written and who
   writes it is the host's.

**Status:** STANDING.

## K028 · 2026-10-15 · STANDING — Explain this failure: the press reaches Claude through the hands App

**Source:** K027 left where the answer is written to the host; this is the kit's way for a host with a
control repository, with no token or AI on the host's machine.

1. **The way there.** The host dispatches the control repository's `hands-explain` job. It posts one
   marked request on the chosen repository's wake channel as the hands App, so the coordinator
   subscribed to that channel is woken (K024); a session never receives its own account's comment.
2. **The explaining.** The coordinator starts one short read-only session that reads the linked failure
   and answers on the same channel with `explain.mjs answer` (the `inbox` skill says so: a request is
   not an inbox wake). The request is data: it approves nothing and lifts no refusal.
3. **Limits.** Only a GitHub issue, pull request or Actions run of the same owner may be linked. At most
   3 requests in any 24 h per wake channel, and a problem still waiting for its answer is not asked
   twice. No shared concurrency group (GitHub cancels a waiting run): of two runs at once, the later request
   deletes itself if it no longer fits. Only the last 48 h of the channel is read, and a window too full
   to read whole is refused. A request counts only from the App; an answer only from the
   repository's own people and only after its request.
4. **The way back.** The host reads the answers with `explain.mjs open` and shows each with
   `explained(key, text)` (K027).

**Status:** STANDING.

## K029 · 2026-10-15 · STANDING — Explain links and explain-only action entries

**Source:** K028 build card 3: a host's failures are often reported as a Markdown page on a reports
repository, not as an issue or run, and a problem may deserve an explanation without a job to pause.

1. **Links.** Besides an issue, pull request or Actions run, a request may link a Markdown report file
   on a branch (`blob/<branch>/<path>.md`) of the same owner. Nothing else: no `..`, and no commit id,
   which can show a fork's commit under the owner's address.
2. **Action entries.** Pause, Resume and Retry need the entry's `job`; an entry without one offers only
   what else it says (Explain), and a press of a missing button is refused.

**Status:** STANDING.

## K030 · 2026-11-06 · STANDING — the supply-chain floor

**Source:** the owner's approval of roadmap #48 (6 Nov 2026), item P2, after the ChainDrop npm
compromise (Aug 2026: hundreds of packages with valid provenance read runner secrets and wrote into
Claude configuration paths).

1. **Wait before using.** A new dependency version is used only after a 3-7 day cooldown (Dependabot,
   `min-release-age`), and CI installs from the lockfile only.
2. **Pin what runs.** Actions are pinned by commit, or by a verified lockfile.
3. **Least privilege.** No `pull_request_target`; read-only workflow permissions; no self-hosted runner
   on a public repository; a self-hosted runner runs one job and holds no production secret.
4. **Guard what agents load.** A change to agent configuration passes only from the profile's trusted
   account IDs, judged by the base branch's guard; every PR is scanned for secrets. Both are one required
   check, `harness-guard`.
5. **Free protections stay on.** Push protection on public repositories; interaction limits declared
   and renewed before they lapse.
6. **Adoption.** A project adopts the floor by naming `trusted_actors`; before that the audit reports
   what is missing as UNKNOWN, so a kit update never turns a project red.

**Status:** STANDING.

## K031 · 2026-11-06 · STANDING — a cloud thread runs on instructions; enforcement lives in GitHub

From the Nov 2026 radar (roadmap #48, P3; owner's approval of #48, 6 Nov 2026).

1. **What loads.** A Claude Projects cloud thread loads `CLAUDE.md`, its imports and `.claude/rules/`.
   It does not load a repository's `.claude/settings.json`, hooks, skills or `.mcp.json`. So the kit
   puts every rule a thread must follow in what loads (core, owner defaults, the rulebook through
   `@AGENTS.md`), and audit A01 checks the rulebook import. Adding that one line is the only change a
   kit update makes to a project-owned file, so the update that brings the check also satisfies it.
2. **What enforces.** Anything that must not be skipped (no push to the default branch, no force
   push, required checks, the attribution scrubber, the trusted-author guard) is a ruleset, a required
   check or a hands App workflow, never only a deny rule in settings.
3. **Plugins.** Plugins the owner enables on the account or in Project settings load in cloud threads,
   hooks included (tested 6 Nov 2026). The kit never depends on one; a project may use them as an
   extra layer.

**Status:** STANDING.


## K032 · 2026-11-06 · STANDING — the model and the effort are named per thread

From the Nov 2026 radar (roadmap #48, P5; owner's approval of #48, 6 Nov 2026).

1. **O06's roles, named.** The adapter (A23) only names O06's roles: Sonnet 5.5 as the smallest
   reliable builder, Opus 5.5 for architecture, accounting, security, hard or risky work (preferred for
   tier-3 review, O07), Haiku 5.5 only for log reading and summaries. A23 adds no role O06 or O07 lacks. A
   new model release changes A23, never core or the owner defaults.
2. **Effort too.** Low for log reading, the default for building, high only for tier-3
   design and review.
3. **Fixed per thread.** Named when the thread starts, never switched; a long thread hands over and
   starts clean instead of compacting a cold context.
4. **Measured.** The coordinator reads `/usage` weekly and reports one line in the daily summary.

**Status:** STANDING.


## K033 · 2026-11-07 · STANDING — coordinators are disposable and event-fired

From the Nov 2026 radar (roadmap #48, P4; owner's approval of #48, 6 Nov 2026). It fixes the
15 Oct to 3 Nov idle gap, when no session was poked and nothing moved for 19 days.

1. **A run per event.** A coordinator is a short, fresh session started by the project's scheduled
   task through `/fire`. It reads its STATE issue and the board, acts, writes STATE, releases its
   claim, and ends. No long-lived session waits on timers.
2. **A label, not a comment, is the wake.** `harness-wake` decides and fires. A job, not a session,
   posts the receipt with the run's session link, so the receipts can be trusted for counting.
3. **One run at a time.** The claim label on the STATE issue. The claim's release is itself the
   event that starts the next queued run, so nothing polls.
4. **Caps live outside the agents' reach.** The ceiling sits in kit-managed code, and the count
   comes from the job's own receipts across the repository, posted before each fire. A variable can
   only lower it. Per-issue limits end a chain of hand-offs.
5. **Everything ends.** Every stop is a label that holds until a person lifts it, never a count that
   ages out:
   - an issue that ran too often or made no progress is `wake-stopped`;
   - failed starts or a run of hand-offs `wake-paused` everything until a person starts a run by hand;
   - an idle backstop rests until the next run.
   Each stop is one exception to a person, never a monthly repeat. This keeps the owner rule: every
   timer capped, nothing runs forever.
6. **Owner step.** A per-task `/fire` token is created only in the web UI (no API). It is the one
   owner step per project, sent as one silver-plate step when the project adopts this.
7. **Native GitHub triggers on scheduled tasks are not used.** They start a session for every
   matching event, with no claim, cap or receipt, and their hourly limits drop events silently.

**Status:** STANDING.


## K034 · 2026-11-07 · STANDING — the agents are measured

From the Nov 2026 radar (roadmap #48, P7; owner's approval of #48, 6 Nov 2026).

1. **Numbers from GitHub, not from the agents.** Six counts per repository (`.harness/metrics.md`),
   computed by a read-only script from what GitHub recorded. Each has one written definition; a
   number that could not be read shows "?", never zero. Owner touches are an upper bound and say so.
2. **The health page carries them.** A host runs the pinned script daily with a read token and
   publishes the counts; no AI on the host.
3. **One budget for everything a session loads.** Per-file byte caps let the total grow by adding
   files; the audit now also totals the always-loaded set against a token budget (default 8000,
   estimated). The kit's own share stays at most half of it.
4. **Rule and model changes are replayed.** A frozen set of past incidents, graded by script, runs
   on fresh agents for any release that changes the loaded text or an adapter (where A23 names the
   models). The release carries the result and CI re-grades it. The set changes only by a release
   that says "replay set", and a task is never dropped to raise a score.
5. **What it is not.** The replay is a regression floor, multiple choice on known incidents: it
   catches a rule change that breaks a lesson already learned, not new kinds of failure. The
   numbers come from the health page; their trend is read by the coordinator, not alerted on.

**Status:** STANDING.

## K035 · 2026-11-07 · STANDING — "ran OK" is not "worked": stale data, capped alerts, action groups

From the strategist's S-033 (roadmap #38, 7 Nov 2026; owner: "start this now"), built as roadmap #48
P10 (owner's approval of #48, 6 Nov 2026). The coordinators went quiet for three weeks with every job
green: nothing checked whether work moved.

1. **Stale progress is watched where the work is.** `stale.mjs` lists open PRs, cards, inbox
   requests and, where the profile names their labels, a board's initiatives and its C22 wait records
   (the STATE issue, a queued wake), each idle past its threshold. A wait record counts only while an
   initiative is open. Thresholds are hours and are data (the profile's `stale` object, or a
   `--config` file for a repository without a profile), default 48 h (24 h for conflicts and inbox
   requests); the 0.13 Actions variables in days still override.
2. **Every alert is capped.** One problem per stale item, opened with `notify.mjs --max-sends 3`:
   the PROBLEM, then at most one STILL OPEN reply a day while it stays stale, 3 messages in all, never
   escalated to "Needs you"; then one line in the daily digest until RESOLVED. A problem is still one
   key, still silent in its topic, still closed by a RESOLVED reply (O10). The one aggregate
   `stale:<repo>` problem of 0.31 and earlier is resolved once and not used again.
3. **Stale is never OK.** A check reading an outside source flags data older than its threshold as
   STALE and opens a capped problem; a source it could not read is never reported as "nothing found"
   (`alerts.md` rule 8). The kit states the rule; each host applies it to its own checks.
4. **Action groups.** Every automated action is `auto` (checks, reports, alerts, wakes),
   `approval` (changes behind a gate: merges on green checks, settings from merged files, kit-update
   PRs, customer-facing or master-data changes, a machine step dispatched by hand) or `human`
   (payments, spending, supplier commitments, design picks, destructive accounting). `human` is never
   automated. Each workflow names its group in a comment line; `actions.mjs check` fails a workflow
   with none, an unknown one, or `human`. Jobs that are not workflows carry their group in the
   project's automation registry.
5. **No new timer, no AI.** The checks run inside runs that already exist: `harness-stale`'s daily
   job, a board's daily backstop, a host's own tick.

## K036 · 2026-11-07 · STANDING — an inbox wake to an event-fired coordinator is a label

From the Nov 2026 radar (roadmap #48, after P4; owner's approval of #48, 6 Nov 2026).

1. **The label, not the channel.** A repository whose coordinator runs are event-fired (K033; its
   STATE issue exists, opened by the wake job) gets an inbox wake as the label `wake` on the request
   itself. Its wake job, caps and stops then decide, exactly as for any other wake.
2. **Still only a job wakes (K024).** The hands App sets the label from `hands-inbox`. A label set
   with a workflow's own `GITHUB_TOKEN` starts no workflow, so the receiver's own `harness-inbox`
   stands aside for such a repository. A person's token is refused, as for the channel.
3. **A pause is never routed around.** While `wake-paused` holds, the label waits and the request
   says "Not delivered"; the old channel is not used instead (C12).
4. **One switch, in one place.** The control repository's kit pin decides, so senders need no new
   release; the old channel retires once nothing else posts on it.

**Status:** STANDING.

## K037 · 2026-11-08 · STANDING — the owner's group carries only what matters to him; technical alerts go to the Ops board

**Source:** the owner's correction relayed by the strategist as S-034 (roadmap #38, 7 Nov 2026; his
picks D1 A · D2 A · D3 A, "start this now"), built as roadmap #59 step 1. Gist: the Telegram alerts
and their buttons were useless to a human (technical text, "You: nothing", buttons with no job);
alerts meant for the AI go where the AI reads and acts on them; his group carries only what matters
to him, and he prefers good news. Supersedes K010's "never success" and O10's old text; the rest of
K010 (one tool, quiet hours, the group holds its own config, the tick) stands.

1. **Two channels.** Technical alerts go to one Ops board issue (`ops` kind): its body is the live
   state, each comment one problem or one resolve, and nothing on it can mention anyone. The owner's
   group gets only `needs_you` (an action only he can do, three plain lines), `outage` (users notice;
   one message, edited in place to ✅), `good_news` (🎉 something people can use went live) and the
   ☀️ evening summary at 20:00 Damascus, skipped on a day with nothing to say.
2. **Senders name a kind, never a channel** (no lock-in): the channel can change in `notify.mjs`
   alone. `problem` stays until every sender has moved (roadmap #59 step 3), then retires.
3. **Plain words are enforced, not hoped for.** Owner-facing kinds refuse paths, file names, sizes,
   addresses, ids, error codes and "You: nothing"; no message carries a button. A refusal fails the
   sender's run, so its fixture catches it before the owner ever would.
4. **One message per event.** An outage and a Needs you end by editing their own message to ✅ (an edit
   is silent); a kind is never escalated or reminded, because the evening summary lists what still
   waits on him.
5. **Still one tool, no new cost.** Everything stays in `notify.mjs`; the board is a GitHub issue (not
   metered); the summary runs from an existing host tick. No AI on any machine.

**Status:** STANDING.

**K038** · The owner's five-line format, one message for several, and stale work off his Telegram
(8 Nov 2026; owner correction on roadmap #59, comment 6720635142; refines K037).

1. **Why.** Four stale-work alerts reached the owner at once ("STILL OPEN … alert 2 of 3" for old infra
   and roadmap items). In his words: long, not to the point, not actionable, not rare. Stale work is the
   agents' backlog, not his.
2. **Format.** Every owner-facing message is at most five lines: an emoji and what is wrong in business
   words, then `Who:`, `Do:`, `Where:`, `When:` (now, today, this week), `Do:` always. If Who is not him,
   it does not go to him. No numbers, run ids, alert counts, thresholds or agent instructions. Enforced in
   `notify.mjs` before sending and by a fixture over every template.
3. **One message for several.** Needs you items due together are one message; it turns ✅ when the last
   is sorted. Outages stay one message each (never held, never capped).
4. **Stale work.** `stale.mjs` sends nothing to Telegram; its list is the tracking issue, and the Ops
   board when `ALERTS_OPS_BOARD` is set. Old problems close with `resolve --quiet`.
5. **Replies in chat and threads** use the same five parts without labels, ending with the status word
   (owner, 8 Nov 2026). Recorded in `alerts.md`; the always-loaded rules (O10, C03) are unchanged.

**Status:** STANDING.

## K039 · 2026-11-08 · STANDING — the older alert paths go quiet; three topics

From roadmap #59 steps 2-3 (S-034 E and the owner's correction of 8 Nov, roadmap #59 comment
6720635142). Extends K037 and K038.

1. **Three topics.** The owner's group keeps Needs you, Good news and Summary. `notify.mjs retire`
   closes the rest (history stays); Platform's own topics close now, a product's when its senders have
   moved to kinds (its coordinator's inbox card).
2. **A technical alert in Actions is an issue, not a message.** `ops` in a GitHub store with no board is
   recorded as its alert issue; the host that reads those issues mirrors them to the Ops board. The
   kit's `hands-report` uses it.
3. **The daily digest is retired.** Technical by nature; the evening summary and the board replace it.
4. **The board has a log.** `note` writes one line with no row, so a host's routine notices leave the
   owner's group without being lost.
5. **A closed topic never takes a message.** A problem whose topic is closed becomes an ops row on the
   board; it is never escalated to Needs you from there.
6. **The App opens and pins the board** (`board --open`, `hands-alerts` mode `board`), before any host
   writes to it.

**Status:** STANDING.

## K040 · 2026-11-09 · STANDING — code over stale instructions

From roadmap #85 (owner, 9 Nov 2026: "add this to the plan and let's do it as soon as possible").

1. **Why.** Xu & Wu (arXiv 2610.30571, Oct 2026, preprint): with a stale instruction file, coding
   agents followed the file over the existing code in 90% of choices, mostly while naming the
   conflict; one higher-priority sentence moved code-following from 4% to 91% and raised test pass
   rates. Limits: 40 small Python projects, only the case where the file is the stale side.
2. **Rule.** C26 in core, so every project loads it. Scoped because rulebooks here are often ahead of
   the code on purpose: security requirements, explicit prohibitions, the owner's numbered rules and
   decisions and documented migration plans always win over the code.
3. **Sweep.** One stale-line sweep per project now, and again only after a big architecture change;
   never on a schedule. Stale text is fixed in place (C17); where the code is the wrong side, a card.
4. **Cap.** Core's byte cap is unchanged (C17); room came from text another rule already carries
   (changelog 0.37.0).

**Status:** STANDING.


## K041 · 2026-11-10 · STANDING — one message shape for the owner; settings never load in cloud threads

From the owner's kit-consistency card (10 Nov 2026).

1. **Shape.** The owner's 8 Nov rule (topic first, status word last, for messages he reads) is now in
   C03 and O08, so no always-loaded rule contradicts `alerts.md`. Supersedes the wording of O08 in
   K001 ("status word first") for those messages only; a card's closing note keeps C03's opening.
2. **Standing approvals.** The block is brought to the text the Platform project already runs
   (A16, Refusals, permissions-and-secrets lines); its kit text is 0.38.0.
3. **Settings.** Evidence: the Claude Projects docs (roadmap #48 P3) and K031 say a cloud thread loads no
   repository settings with one repository or several; a four-repository Platform thread (10 Nov) had no
   identity env although its clones carry `.claude/settings.json`. The "settings load with one
   repository" wording (permissions repair, 8 Oct) was superseded by K031 and is removed from the
   Settings line. The identity step (`git config` per clone) and the run-card start check stay valid
   either way.

**Status:** STANDING.


## K042 · 2026-11-10 · STANDING — state lives in an issue and is checked; the failed-wake paste; homes of a correction

From roadmap #90 (owner, 10 Nov 2026: "review these files and update them. Consider this message as a
confirmation and a permission to do everything necessary without asking twice").

1. **State.** State files went stale in every project because volatile state sat in a canon file that
   changes only by card and PR, mixed with slow facts, and nobody owned its freshness. So: volatile
   state lives in the STATE issue (`wake.md` §5-6), rewritten at the end of every coordinator run; the
   state file keeps only slow facts and points to it. C17's "the state file" reads as that pair; the
   always-loaded text is unchanged.
2. **Freshness, with no AI.** The daily stale-work job adds one Ops board row when the STATE issue is 48
   hours old while pull requests merged since. Merges are the signal that work moved; an idle
   repository with an old state raises nothing. No new schedule and nothing to the owner (K038).
3. **O15.** The owner's exception of 7 Nov 2026 (a failed wake is the one time he is asked to paste, at
   most one message a day per stuck item) is named in O15, next to O18's "check". Refines K014.
4. **Standing approvals.** Deleting data after a verified backup is the agents' (owner, 9 Oct 2026), so
   the block reserves only deleting without one. Kit text 0.39.0. Whether a one-repository cloud thread
   loads settings stays as K041 found it (it does not); a direct probe in a one-repository project is
   asked of those projects, since this one has several repositories.
5. **Entry file.** The kit gets a root `CLAUDE.md` importing its own rule files, so a thread working
   here loads them. It is the repository's own file, not a kit-managed one.
6. **Homes.** An owner rule drifted three times in a month because it had many homes and reached one.
   The `correct` skill now makes the decision entry list its homes and the coordinator file one inbox
   request per home (C19: a step in the skill; nothing fails when it is skipped, so it is the cheap
   level, chosen because the homes are prose in other projects that no check here can read).

Homes: kit owner defaults (O15, this release); kit `standing-approvals.md` (this release); each
project's instructions block (one inbox request each).

**Status:** STANDING.

## K043 · 2026-11-11 · STANDING — real data waits for a tap (O19)

From the owner's initiative of 11 Nov 2026 and its section 7 (owner, 11 Nov 2026: "once real data is live,
nothing that can change or delete data runs by itself. It waits for one tap from me on a card that says
what it does, what it needs, the risk and how to undo it. Only the short list in [the initiative's] lane A
stays automatic. This is a rule for what you build. Change nothing that is live today because of it."
Earlier the same day: "whenever real information is up I would rather have automations and fixes on a
one click basis from a user rather than act on their own, with explanation displayed of what they do
exactly and what they need and precautions about it... for things that need multiple steps I would rather
have clear steps given to me on a command.")

1. **The rule.** O19 in the owner defaults, so every project gets it by its pin. A project names its lane A
   list (actions that cannot change or delete data and may run by themselves with real data live) in its
   repository; anything else it builds that can change or delete data is lane B: one tap by the owner
   (owner only for now, built so he can name a second trusted person) on a card stating what it does,
   what it needs, the risk and the undo. The catalogue row carries the card's shape and the default lane A
   list, all from the initiative.
2. **The switch.** With example data or on staging every fix may run by itself, so drills stay fast. The
   kit adds one default: a mode nobody can read counts as real.
3. **The list.** Before a project's real data goes live (kit's own addition: a project whose real data is
   already live makes it as its next card), its coordinator lists every automation that can change or delete live data and marks each lane
   A or B. The list comes first. A lane-B one that runs by itself becomes a work card for the owner's
   decision and keeps running unchanged until he decides; nothing live changes because of this rule, and
   nothing that already waits for a person is rebuilt.
4. **Room under the cap.** The owner defaults go from 4091 to 4090 bytes. Words that another loaded line
   or the rule itself already carries are dropped from the header (the catalogue path), O01, O02 ("never
   configure X": the step is already exact), O03, O04, O08 (C03 binds closing notes), O09, O10, O11, O13,
   O14, O16 and O17. "(event or daily beats hourly)" now lives only in O13's catalogue row, whose check
   enforces "at most daily"; the `inbox` skill's name lives in the adapter. Every rule keeps its meaning;
   O07 keeps "Opus for tier 3".

Homes: kit owner defaults (O19, this release) and its catalogue row; obidex/infra's decisions log (the
production server's lanes); the ERP, which does not install the kit, by an inbox request.

**Status:** STANDING.

## K044 · 2026-11-11 · STANDING — O09 is a merge gate on the description, not only a scrubber

From the owner (11 Nov 2026): Claude footers were back in PR bodies; a PR carrying one must not merge.

1. **Cause.** The scrubber (K006) is event-driven and never rechecks: bodies written before it ran on
   pull requests stayed, and a footer added by an edit lives until the scrubber's run finishes.
2. **Gate.** `guard.mjs pr-body` fails while the live description carries a footer or Claude
   co-author/session line (code blocks excluded; links are left to the scrubber, since the session's own
   thread link is added by the platform). It waits up to 90 s for the scrubber, because the scrubber's
   edit starts no workflow. It rides on the checks each project already requires (`harness-guard`,
   `hands-check`, `check-kit`), so no settings change and no second tool.
3. **Squash bodies** stay blank where the project's settings say so (infra), so a description never
   reaches a merge commit.

Homes: `guard.mjs`, the guard and hands-check templates, the kit's `check.yml`; O09's catalogue row.

**Status:** STANDING.
