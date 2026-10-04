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
