#!/usr/bin/env node
// test-precheck — the seconds-long check at the point of the edit, the trial of a release on the projects, and the
// one plain failure line (K079), offline on throwaway repositories.
//
//   node tools/test-precheck.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { trialLine, auditFails } from '../.harness/tools/trial.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-precheck: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-precheck: ok ${n}. ${what}`); };
const kit = resolve(new URL('..', import.meta.url).pathname);
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: '' };
const work = mkdtempSync(join(tmpdir(), 'precheck-'));
const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env });
const node = (cwd, args, extra = {}) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env: { ...env, ...extra } });
const f = (id, body = 'x') => `## ${id} · 2026-11-20 · STANDING — ${body}\n`;

// --- precheck on a project with a closed log, a decisions folder and a cap -----------------------------------
const p = join(work, 'project');
const put = (rel, text) => { mkdirSync(join(p, rel, '..'), { recursive: true }); writeFileSync(join(p, rel), text); };
put('.harness/profile.json', JSON.stringify({ canon: { decisions: 'docs/DECISIONS.md', caps: { 'docs/STATE.md': 40, 'AGENTS.md': 10 } } }));
put('docs/DECISIONS.md', '# d\n\n## K001 · first\n\ntext\n');
put('docs/decisions/K002.md', f('K002'));
put('docs/STATE.md', 'short\n');
put('AGENTS.md', 'already longer than its cap\n');
put('CLAUDE.md', '# x\n');
git(p, 'init', '-q', '-b', 'main'); git(p, 'add', '-A'); git(p, 'commit', '-qm', 'base');
const base = git(p, 'rev-parse', 'HEAD').stdout.trim();
const pre = (...a) => node(p, [join(kit, '.harness/tools/precheck.mjs'), '--base', base, ...a]);
let r = pre();
ok(r.status === 0 && /precheck: OK · C17, O09/.test(r.stdout), 'a change that touches nothing of C17 passes, and an old cap breach in a file it did not touch never lands on it');
put('docs/decisions/K002.md', f('K002', 'edited'));
r = pre();
ok(r.status === 1 && /Decision K002 \(docs\/decisions\/K002\.md\) was changed after it was written/.test(r.stderr) && /decisions\.mjs new --supersedes K002/.test(r.stderr),
  'an edit of a written decision fails at once, before any commit, naming the command that writes the new decision (fails without K079)');
git(p, 'commit', '-qam', 'committed edit');
ok(pre().status === 1, 'committed on the branch, it still fails: the change is judged against where it left the default branch');
git(p, 'reset', '-q', '--hard', base);
put('docs/decisions/K003.md', f('K003'));
ok(pre().status === 0, 'a new decision file passes');
put('docs/decisions/K003.md', 'no heading\n');
ok(/K003\.md: its first line names no decision/.test(pre().stderr), 'the register\'s own rules run when the change touches the folder');
rmSync(join(p, 'docs/decisions/K003.md'));
// the closed log: a word-for-word move passes, anything else fails
put('docs/DECISIONS.md', '# d\n\n## K001 · first\n\ntext\n\n## K003 · appended\n\nentry\n'); git(p, 'commit', '-qam', 'appended on an older kit');
const base2 = git(p, 'rev-parse', 'HEAD').stdout.trim();
const pre2 = () => node(p, [join(kit, '.harness/tools/precheck.mjs'), '--base', base2]);
put('docs/DECISIONS.md', '# d\n\n## K001 · first\n\ntext\n'); put('docs/decisions/K003.md', '## K003 · appended\n\nentry\n');
ok(pre2().status === 0, 'moving the entry word for word into its own file (not yet committed, the file untracked) passes');
put('docs/decisions/K003.md', '## K003 · appended\n\nentry, reworded\n');
r = pre2();
ok(r.status === 1 && /lost lines that are not a word-for-word move/.test(r.stderr), 'a move that changed a word fails');
rmSync(join(p, 'docs/decisions/K003.md')); put('docs/DECISIONS.md', '# d\n\n## K001 · first, edited\n\ntext\n\n## K003 · appended\n\nentry\n');
ok(/lost lines/.test(pre2().stderr), 'an edit of the closed log fails');
git(p, 'checkout', '-q', '--', '.');
put('docs/STATE.md', 'x'.repeat(60));
r = pre2();
ok(r.status === 1 && /docs\/STATE\.md is 60 bytes, over its cap of 40/.test(r.stderr), 'a capped file this change made too long fails');
git(p, 'checkout', '-q', '--', '.');
// O09: a body before it is posted, and a commit message
writeFileSync(join(work, 'body.md'), 'A change.\n\nGenerated with [Claude Code](https://claude.ai/code)\n');
writeFileSync(join(work, 'clean.md'), 'A change.\n\n```\nGenerated with Claude Code (quoted in a code block)\n```\n');
r = pre2.call(null); ok(r.status === 0, 'the project is back to clean');
r = node(p, [join(kit, '.harness/tools/precheck.mjs'), '--base', base2, '--text', join(work, 'body.md')]);
ok(r.status === 1 && /body\.md carries Claude attribution/.test(r.stderr), 'a pull request body with a Claude footer fails before it is posted (O09)');
ok(node(p, [join(kit, '.harness/tools/precheck.mjs'), '--base', base2, '--text', join(work, 'clean.md')]).status === 0, 'a quoted line in a code block is no footer');
// the hooks: installed in the clone, they stop the commit that makes the mistake (on the register as it was)
git(p, 'reset', '-q', '--hard', base);
r = node(p, [join(kit, '.harness/tools/precheck.mjs'), '--install']);
const hook = join(p, '.git/hooks/pre-commit');
ok(r.status === 0 && existsSync(hook) && (statSync(hook).mode & 0o111) !== 0 && existsSync(join(p, '.git/hooks/commit-msg')), '--install writes the clone\'s own executable pre-commit and commit-msg hooks');
// the hooks call the project's own copy of the tool
mkdirSync(join(p, '.harness/tools'), { recursive: true });
for (const t of ['precheck.mjs', 'decisions.mjs', 'load.mjs', 'scrub.mjs', 'lib.mjs']) cpSync(join(kit, '.harness/tools', t), join(p, '.harness/tools', t));
git(p, 'add', '.harness/tools'); git(p, 'commit', '-qm', 'the kit tools');
put('docs/decisions/K002.md', f('K002', 'edited by a thread'));
r = git(p, 'commit', '-qam', 'edit a decision');
ok(r.status !== 0 && /was changed after it was written/.test(r.stderr), 'the pre-commit hook refuses a commit that edits a written decision');
git(p, 'checkout', '-q', '--', '.');
put('docs/decisions/K003.md', f('K003')); git(p, 'add', '-A');
r = git(p, 'commit', '-qm', 'a new decision\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
ok(r.status !== 0 && /commit message carries Claude attribution/.test(r.stderr), 'the commit-msg hook refuses a Claude co-author line (O09, A10)');
ok(git(p, 'commit', '-qm', 'a new decision').status === 0, 'and the same commit with a clean message goes through');

// --- the one plain line ----------------------------------------------------------------------------------
const sum = join(work, 'summary.md');
r = node(p, [join(kit, '.harness/tools/precheck.mjs'), '--text', join(work, 'body.md')], { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: sum });
ok(/^::error title=precheck O09::.*carries Claude attribution/m.test(r.stdout) && /\*\*precheck O09 failed:\*\* .*carries Claude attribution/.test(readFileSync(sum, 'utf8')),
  'on GitHub Actions a failed check writes one plain line as an error annotation (which the status feed reads) and in the job summary');

// --- the audit's A17 ignores the kit's own pinned package -----------------------------------------------------
{
  const a = join(work, 'a17');
  mkdirSync(join(a, '.harness/tools/agent-sdk'), { recursive: true });
  writeFileSync(join(a, '.harness/tools/agent-sdk/package.json'), '{}\n');
  mkdirSync(join(a, '.github')); writeFileSync(join(a, '.github/dependabot.yml'), 'version: 2\nupdates: []\n');
  git(a, 'init', '-q', '-b', 'main'); git(a, 'add', '-A'); git(a, 'commit', '-qm', 'x');
  const out = join(work, 'a17.json');
  node(a, [join(kit, '.harness/tools/audit.mjs'), a, '--json', out]);
  const res = JSON.parse(readFileSync(out, 'utf8')).results.find((x) => x.id === 'A17');
  ok(res.result === 'PASS' && !/npmrc/.test(res.evidence), `the kit's own package under .harness/ is no npm use of the project's: no red A17 on every kit update (found by the trial; ${res.result}: ${res.evidence})`);
}

// --- the trial: a candidate release tried on project checkouts -------------------------------------------
{
  ok(trialLine([{ verdict: 'GREEN' }, { verdict: 'RED', prepared: 'x#1' }, { verdict: 'SKIPPED' }], 'abcdef0123456') === 'Trial: 1 of 2 projects green; 1 red with the fix prepared at abcdef012345'
    && trialLine([{ verdict: 'GREEN' }, { verdict: 'RED' }], 'abc1234') === 'Trial: 1 of 2 projects green; 1 red at abc1234', 'the trial line counts green, prepared and red projects and names none');
  ok(JSON.stringify(auditFails('audit: x\naudit: FAIL C17 One home per fact: y\naudit: FAIL A17 z: w\n')) === JSON.stringify({ C17: 'One home per fact: y', A17: 'z: w' }), 'the failed rules are read from the audit\'s own lines');
  // the released kit (v1) and the candidate (v2), each a git checkout
  const released = join(work, 'kit1'), cand = join(work, 'kit2');
  const copy = (to) => { cpSync(kit, to, { recursive: true, filter: (s) => !/\/\.git(\/|$)/.test(s) && !s.includes('node_modules') }); git(to, 'init', '-q', '-b', 'main'); git(to, 'add', '-A'); git(to, 'commit', '-qm', 'kit'); };
  copy(released); copy(cand);
  const v1 = readFileSync(join(released, '.harness/VERSION'), 'utf8').trim();
  const [x, y] = v1.split('.').map(Number);
  writeFileSync(join(cand, '.harness/VERSION'), `${x}.${y + 1}.0\n`); git(cand, 'commit', '-qam', 'next');
  // a project with the released kit installed
  const proj = join(work, 'proj');
  mkdirSync(proj); writeFileSync(join(proj, 'CLAUDE.md'), '# p\n'); writeFileSync(join(proj, 'AGENTS.md'), '# rules\n');
  git(proj, 'init', '-q', '-b', 'main'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'project');
  r = node(proj, [join(released, '.harness/tools/harness.mjs'), 'init', '--from', released, '--version', v1, '--preset', 'none']);
  // the project's canon, as its profile names it, and its other old findings accepted in its baseline (C17 stays judged)
  const prof = JSON.parse(readFileSync(join(proj, '.harness/profile.json'), 'utf8'));
  prof.canon = { ...prof.canon, decisions: 'docs/DECISIONS.md', caps: {}, generated: [] };
  writeFileSync(join(proj, '.harness/profile.json'), JSON.stringify(prof, null, 2));
  mkdirSync(join(proj, 'docs/decisions'), { recursive: true });
  writeFileSync(join(proj, 'docs/DECISIONS.md'), '# d\n\n## P001 · first\n'); writeFileSync(join(proj, 'docs/decisions/P002.md'), '## P002 · x\n');
  if (prof.canon.state) { mkdirSync(join(proj, prof.canon.state, '..'), { recursive: true }); writeFileSync(join(proj, prof.canon.state), '# state\n'); }
  git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'kit installed');
  node(proj, [join(proj, '.harness/tools/audit.mjs'), proj, '--json', join(work, 'b.json')]);
  const old = JSON.parse(readFileSync(join(work, 'b.json'), 'utf8')).results.filter((x) => x.result === 'FAIL' && x.id !== 'C17');
  writeFileSync(join(proj, '.harness/audit-baseline.json'), JSON.stringify({ results: old.map((x) => ({ id: x.id, result: 'FAIL', why: 'the fixture\'s old findings' })) }));
  git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'baseline');
  const trial = (...a) => node(cand, [join(cand, '.harness/tools/trial.mjs'), ...a]);
  const before = git(proj, 'rev-parse', 'HEAD').stdout.trim();
  r = trial('--project', proj, '--json', join(work, 't.json'));
  const j = JSON.parse(readFileSync(join(work, 't.json'), 'utf8'));
  const green = j.results[0].verdict === 'GREEN';
  ok(r.status === (green ? 0 : 1) && git(proj, 'rev-parse', 'HEAD').stdout.trim() === before && git(proj, 'status', '--porcelain').stdout === '' && readFileSync(join(proj, '.harness/VERSION'), 'utf8').trim() === v1,
    `the trial updates a copy only: the project's checkout is untouched (${j.results[0].verdict}: ${j.results[0].lines.join(' | ') || 'no line'})`);
  ok(green && /^Trial: 1 of 1 projects green at [0-9a-f]{12}$/m.test(r.stdout), 'a project the candidate keeps green: GREEN, and the trial line for the changelog');
  // a decision edited on the default branch: the update's own audit would go red, and says it was red before
  writeFileSync(join(proj, 'docs/decisions/P002.md'), '## P002 · x, edited\n'); git(proj, 'commit', '-qam', 'edit a decision');
  r = trial('--project', proj);
  ok(r.status === 1 && /proj: RED/.test(r.stdout) && /harness-audit C17: .*Decision P002 .*\(already failing before this release\)/.test(r.stdout) && /; 1 red at /.test(r.stdout),
    'a project whose update pull request would be red is RED, with one plain line per failed check, marked when the release did not cause it');
  r = trial('--project', proj, '--prepared', 'proj=owner/proj#9');
  ok(r.status === 0 && /proj: RED \(fix prepared: owner\/proj#9\)/.test(r.stdout) && /1 red with the fix prepared/.test(r.stdout), 'with the project\'s fix prepared and named, the release may ship');
  // a project that pins no kit, and one whose kit-facing settings the candidate cannot read
  const bare = join(work, 'bare'); mkdirSync(join(bare, '.github'), { recursive: true });
  git(bare, 'init', '-q', '-b', 'main'); writeFileSync(join(bare, 'x'), 'x'); git(bare, 'add', '-A'); git(bare, 'commit', '-qm', 'x');
  r = trial('--project', bare);
  ok(r.status === 0 && /bare: SKIPPED/.test(r.stdout) && /Trial: 0 of 0 projects green/.test(r.stdout), 'a project that pins no kit and keeps no kit-facing file is left out, and says so');
  writeFileSync(join(bare, '.github/harness-review.json'), JSON.stringify({ until: '2026-12-22T23:59+03:00' }));
  r = trial('--project', bare);
  ok(r.status === 1 && /harness-review: the candidate would switch the reviewer off/.test(r.stdout), 'a kit-facing settings file the candidate would not read makes that project RED');
  appendFileSync(join(bare, '.github/harness-review.json'), '');
  writeFileSync(join(bare, '.github/harness-review.json'), JSON.stringify({ until: '2026-12-22T23:59+03:00', command: 'the owner\'s command' }));
  ok(/bare: GREEN/.test(trial('--project', bare).stdout), 'one it reads keeps it GREEN');
}

rmSync(work, { recursive: true, force: true });
console.log(`test-precheck: OK · ${n} checks`);
