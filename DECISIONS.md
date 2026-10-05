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

