#!/usr/bin/env node
// test-scope — the rule that decides how much CI a change needs, and the required check's gate (K059).
//
//   node tools/test-scope.mjs        exit 0 = every case held

import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { decide, gate, hasNightly, changedFiles, docsSite, DOCS } from '../.harness/tools/scope.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-scope: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-scope: ok ${n}. ${what}`); };
const pr = (files, extra = {}) => decide({ event: 'pull_request', files, profile: null, nightly: true, ...extra });

// --- light: documents only ---------------------------------------------------------------------------
ok(pr(['docs/plan.md', 'README.md', 'CHANGELOG.md']).level === 'light', 'documents only are light');
ok(pr(['AGENTS.md', 'CLAUDE.md', '.harness/core.md']).level === 'light' && pr(['AGENTS.md']).tier3 === true, 'agent rules are documents for CI (no test reads them), and still tier 3 for review');
ok(pr(['decisions/I100.md', 'LICENSE']).level === 'light' && pr(['docs/x.md']).tier3 === false, 'a decision record and the licence are light; plain documents are not tier 3');

// --- full: anything a build or test could read ------------------------------------------------------
ok(pr(['docs/plan.md', 'src/app.ts']).level === 'full', 'one code file makes the whole change full');
ok(pr(['content/blog/post.md']).level === 'full' && pr(['src/README.md']).level === 'full' && pr(['public/robots.txt']).level === 'full', 'a document under a content or code path is full (a site may build it)');
ok(['page.mdx', 'logo.svg', 'data.json', 'package-lock.json', '.github/workflows/ci.yml', '.harness/tools/scope.mjs', 'supabase/migrations/1.sql', 'Dockerfile', '.env.example'].every((f) => pr([f]).level === 'full'),
  'MDX, images, data, lockfiles, workflows, kit tools, migrations, Dockerfiles and env examples are full');
ok(['requirements.txt', 'requirements-dev.txt', 'constraints.txt', 'CMakeLists.txt', 'docs/conf.rst', 'testdata/golden.txt', 'spec/fixtures/a.md', '__tests__/x.md', 'pkg/__tests__/x.md', 'cypress/fixtures/a.txt', 'a/fixtures/b.md', 'playwright/a.md', 'svc/tests/a.md'].every((f) => pr([f]).level === 'full'),
  'build inputs that end in .txt or .rst, and anything in a test, fixture or test-data folder, are full');
ok(['NOTICE.txt', 'LICENSE.rst', 'CONTRIBUTING.md', 'docs/guide.md'].every((f) => pr([f]).level === 'light'), 'the named notice files in any of their forms, and Markdown, are documents');
ok(pr(['docs/intro.md'], { site: 'docs' }).level === 'full' && pr(['blog/p.md'], { site: 'docs' }).level === 'full' && pr(['AGENTS.md'], { site: 'docs' }).level === 'light' && pr(['AGENTS.md'], { site: 'root' }).level === 'full',
  "a documentation site's pages are full: docs/ and blog/ for MkDocs, Docusaurus, Sphinx or VitePress; every Markdown file for a site built from the root");
const has = (...l) => (f) => l.includes(f);
ok(docsSite(has('mkdocs.yml')) === 'docs' && docsSite(has('docs/conf.py')) === 'docs' && docsSite(has('_config.yml')) === 'root' && docsSite(has('book.toml', 'mkdocs.yml')) === 'root' && docsSite(has('package.json')) === null,
  'the documentation site is found by its configuration file');
ok(pr(['docs/a.md'], { profile: { ci_scope: { full: ['docs/**'] } } }).level === 'full' && pr(['src/a.md'], { profile: { ci_scope: { full: ['content/**'] } } }).level === 'light',
  "the profile's ci_scope.full replaces the default list of paths that always run everything");
ok(pr(['supabase/migrations/1.sql'], { profile: { risk: { tier3_paths: ['supabase/migrations/**'] } } }).tier3 === true, "the profile's tier-3 paths mark a change for its reviewers");

// --- full: every event but a pull request, and every doubt -----------------------------------------
ok(['push', 'schedule', 'workflow_dispatch', 'merge_group', undefined].every((e) => decide({ event: e, files: ['docs/a.md'], profile: null, nightly: true }).level === 'full'), 'a push to main, the nightly run, a run by hand and any other event are full');
ok(pr(null).level === 'full' && pr([]).level === 'full', 'unreadable or empty changes are full, never light');
ok(pr(['docs/a.md'], { nightly: false }).level === 'full' && /nightly/.test(pr(['docs/a.md'], { nightly: false }).reason), 'a workflow without a nightly schedule never runs light');
ok(DOCS.test('NOTICE') && DOCS.test('docs/x.MD') && !DOCS.test('docs/x.txt') && !DOCS.test('notes.md.js') && !DOCS.test('READMEsrc.ts'), 'the document pattern matches whole names and extensions only');

// --- the nightly schedule is read from the calling workflow ---------------------------------------
ok(hasNightly("name: ci\non:\n  pull_request:\n  schedule:\n    - cron: '7 1 * * *'\njobs: {}\n") && !hasNightly('name: ci\non:\n  pull_request:\njobs: {}\n') && !hasNightly('') && !hasNightly(null),
  'a schedule with a cron counts as the nightly run; none, empty or unreadable does not');

// --- the gate: the one required check -------------------------------------------------------------------
const s = (result) => ({ result });
ok(gate({ scope: s('success'), lint: s('success'), test: s('skipped') }, 'light').length === 0, 'a light run passes with its tests skipped');
ok(gate({ scope: s('success'), lint: s('success'), test: s('skipped') }, 'full').length === 1, 'a full run with a skipped test fails the gate');
ok(gate({ scope: s('success'), lint: s('failure'), test: s('skipped') }, 'light').length === 1 && gate({ scope: s('success'), test: s('cancelled') }, 'full').length === 1, 'a failed or cancelled job fails the gate, light or full');
ok(gate({ scope: s('failure'), test: s('skipped') }, '').length >= 2 && gate(null, 'full').length === 1, 'no level (the scope job failed) or unreadable results fail the gate');

// --- end to end in a git repository: decide reads the diff, gate reads the environment -------------
const dir = mkdtempSync(join(tmpdir(), 'scope-'));
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 't');
mkdirSync(join(dir, '.github/workflows'), { recursive: true }); mkdirSync(join(dir, 'src'), { recursive: true });
writeFileSync(join(dir, '.github/workflows/ci.yml'), "name: ci\non:\n  pull_request:\n  schedule:\n    - cron: '7 1 * * *'\njobs: {}\n");
writeFileSync(join(dir, 'README.md'), 'a\n'); writeFileSync(join(dir, 'src/a.js'), '1\n');
git('add', '-A'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
writeFileSync(join(dir, 'README.md'), 'b\n'); git('commit', '-qam', 'docs'); const docs = git('rev-parse', 'HEAD');
git('mv', 'src/a.js', 'docs.md'); git('commit', '-qm', 'rename'); const ren = git('rev-parse', 'HEAD');
ok(JSON.stringify(changedFiles(base, docs, dir)) === '["README.md"]' && changedFiles(base, ren, dir).includes('src/a.js') && changedFiles('nope', docs, dir) === null,
  'the diff names both sides of a rename, and an unknown commit reads as unreadable (full)');
const tool = new URL('../.harness/tools/scope.mjs', import.meta.url).pathname;
const run = (head, env = {}) => {
  const out = join(dir, `out-${n}`);
  writeFileSync(out, '');
  const r = spawnSync(process.execPath, [tool, 'decide', '--base', base, '--head', head], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_OUTPUT: out, GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/ci.yml@refs/heads/x', GITHUB_EVENT_PATH: '', ...env } });
  return { code: r.status, out: readFileSync(out, 'utf8') };
};
ok(/^level=light$/m.test(run(docs).out) && /^level=full$/m.test(run(ren).out), 'decide writes level=light for a README change and level=full when code moved into a document');
ok(/^level=full$/m.test(run(docs, { GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/other.yml@refs/heads/x' }).out), 'decide reads the calling workflow: one without a nightly schedule is full');
const g = (results, level) => spawnSync(process.execPath, [tool, 'gate'], { encoding: 'utf8', env: { ...process.env, RESULTS: results, LEVEL: level } }).status;
ok(g('{"scope":{"result":"success"},"test":{"result":"skipped"}}', 'light') === 0 && g('{"scope":{"result":"success"},"test":{"result":"skipped"}}', 'full') === 1 && g('not json', 'full') === 1,
  'gate exits 0 only when the needed jobs agree with the level');

console.log(`test-scope: OK · ${n} checks`);
