#!/usr/bin/env node
// test-decisions — one file per decision (K052): the register's rules, the next number, the command
// line and the audit's C17, offline on fixtures.
//
//   node tools/test-decisions.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { problems, nextId, logIds, fileId, folderFor, load } from '../.harness/tools/decisions.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-decisions: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-decisions: ok ${n}. ${what}`); };
const kit = new URL('..', import.meta.url).pathname;
const tool = join(kit, '.harness/tools/decisions.mjs');

// the three shapes projects write an entry in
const log = '# DECISIONS\n\n## K001 · 2026-10-04 · LOCKED — first\n\ntext naming K002 and I007 in passing\n\n## K002 · later\n\n**K003** · STANDING — bold form\n\n### K004 deeper heading\n';
ok(logIds(log).join() === 'K001,K002,K003,K004' && fileId('\n\n## K005 · title\nK001 again') === 'K005' && fileId('**I091** · STANDING — x') === 'I091' && fileId('prose first\n## K005') === null,
  'an entry is read from its opening line in each shape the projects use (## K001, ### K004, **K003**); an ID inside the text is not an entry');
ok(folderFor('DECISIONS.md') === 'decisions' && folderFor('docs/DECISIONS.md') === 'docs/decisions', 'the folder is decisions/ beside the log');

const f = (id, body = 'x') => `## ${id} · 2026-11-20 · STANDING — ${body}\n`;
ok(problems({ log, files: { 'K005.md': f('K005'), 'K006.md': f('K006') } }).length === 0, 'new decisions as one file each, numbered after the log, pass');
ok(problems({ log: '', files: { 'A001.md': f('A001') } }).length === 0 && problems({ log, files: {} }).length === 0, 'a project with no log yet, or one that has not written a file yet, passes');
ok(problems({ log, files: { 'K005-bulk.md': f('K005'), 'notes.md': 'x', 'K5.md': f('K5'), 'K006.txt': f('K006') } }).filter((p) => /named <ID>\.md/.test(p)).length === 4,
  'a file not named <ID>.md is refused: the path is the number, so two threads taking one number clash on the pull request');
ok(problems({ log, files: { 'K005.md': f('K006') } }).some((p) => /first line names K006, not K005/.test(p)) && problems({ log, files: { 'K005.md': 'no heading\n' } }).some((p) => /names no decision/.test(p)),
  'a file whose first line names another decision, or none, is refused');
ok(problems({ log, files: { 'K003.md': f('K003') } }).some((p) => /K003 is already an entry in the log/.test(p)), 'a number the log already holds is never used again');
ok(problems({ log: `${log}\n## K006 · appended after the switch\n`, files: { 'K005.md': f('K005') } }).some((p) => /not above the log's last number \(6\)/.test(p)),
  'an entry appended to the log after the switch fails the check: the log is closed (fails without K052)');
ok(problems({ log, files: { 'I005.md': f('I005') } }).some((p) => /the log's decisions are K…, not I…/.test(p)), 'one prefix per register');
ok(problems({ log, files: { 'K005.md': f('K005'), 'K0005.md': f('K0005') } }).some((p) => /K005 is also decisions\/K0005\.md/.test(p)), 'one number is one decision, however it is padded');
ok(problems({ log: `${log}## K002 · again\n`, files: {} }).some((p) => /holds K002 twice/.test(p)), 'a number repeated inside the log is reported');
ok(nextId({ log, files: {} }) === 'K005' && nextId({ log, files: { 'K005.md': '', 'K009.md': '' } }) === 'K010' && nextId({ log: '**I099** · x', files: {} }) === 'I100' && nextId({ log: '', files: {} }) === null,
  'the next ID is one above the highest in the log and the folder, in the same shape');

// the command line, on disk, with the log where the profile says
const d = mkdtempSync(join(tmpdir(), 'decisions-'));
mkdirSync(join(d, '.harness')); mkdirSync(join(d, 'docs/decisions'), { recursive: true });
writeFileSync(join(d, '.harness/profile.json'), JSON.stringify({ canon: { decisions: 'docs/DECISIONS.md' } }));
writeFileSync(join(d, 'docs/DECISIONS.md'), log);
writeFileSync(join(d, 'docs/decisions/K005.md'), f('K005'));
const run = (...a) => spawnSync(process.execPath, [tool, ...a, '--root', d], { encoding: 'utf8' });
let r = run('check');
ok(r.status === 0 && /OK · 4 in docs\/DECISIONS\.md \(closed\), 1 in docs\/decisions\//.test(r.stdout) && run('next').stdout.trim() === 'K006', 'check and next read the log the profile names and the folder beside it');
writeFileSync(join(d, 'docs/decisions/K004.md'), f('K004'));
mkdirSync(join(d, 'docs/decisions/sub'));
r = run('check');
ok(r.status === 1 && /FAIL docs\/decisions\/K004\.md: K004 is already an entry in the log/.test(r.stdout) && /FAIL docs\/decisions\/sub: a decision file is named/.test(r.stdout), 'check fails naming each problem; a folder inside is no decision');
ok(load(d).logFile === 'docs/DECISIONS.md' && load(d, 'other.md').folder === 'decisions', 'a log named on the command line wins over the profile');
rmSync(d, { recursive: true, force: true });

// the kit keeps its own rule: its register passes, and the old file gained nothing
{
  const reg = load(kit, 'DECISIONS.md');
  ok(problems(reg).length === 0 && Object.keys(reg.files).length >= 1 && logIds(reg.log).at(-1) === 'K050', 'the kit\'s own register: K001-K050 in the closed file, each later decision its own file');
  const copy = mkdtempSync(join(tmpdir(), 'decisions-kit-'));
  cpSync(join(kit, 'tools'), join(copy, 'tools'), { recursive: true });
  cpSync(join(kit, '.harness'), join(copy, '.harness'), { recursive: true });
  for (const x of ['examples', 'replay', '.github', 'decisions']) cpSync(join(kit, x), join(copy, x), { recursive: true });
  for (const x of ['README.md', 'CHANGELOG.md']) cpSync(join(kit, x), join(copy, x));
  writeFileSync(join(copy, 'DECISIONS.md'), `${readFileSync(join(kit, 'DECISIONS.md'), 'utf8')}\n## K999 · appended to the closed file\n`);
  const ck = spawnSync(process.execPath, [join(copy, 'tools/check-kit.mjs'), copy], { encoding: 'utf8' });
  ok(ck.status === 1 && /FAIL decisions: .*not above the log's last number \(999\)/.test(ck.stdout), 'check-kit fails a kit whose closed register gained an entry');
  rmSync(copy, { recursive: true, force: true });
}

// audit C17: "a written decision is never edited" is judged against the default branch, not a pull request's own commits
{
  const prof = JSON.parse(readFileSync(join(kit, 'examples/profile.example.json'), 'utf8'));
  const main = prof.branches?.default || 'main';
  const a = mkdtempSync(join(tmpdir(), 'decisions-audit-'));
  const put = (p, text) => { mkdirSync(join(a, p, '..'), { recursive: true }); writeFileSync(join(a, p), text); };
  const g = (...x) => spawnSync('git', ['-C', a, ...x], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  const folder = folderFor(prof.canon.decisions);
  put('CLAUDE.md', '# x\n');
  put(prof.canon.decisions, '# d\n\n## K001 · first\n');
  put('.harness/profile.json', JSON.stringify({ ...prof, canon: { ...prof.canon, caps: {}, generated: [] } }));
  put(`${folder}/K002.md`, f('K002'));
  g('init', '-q', '-b', main); g('add', '-A'); g('commit', '-qm', 'fixture');
  const c17 = () => {
    spawnSync(process.execPath, [join(kit, '.harness/tools/audit.mjs'), a, '--json', join(a, '..', 'decisions-audit-out.json')], { encoding: 'utf8' });
    const out = JSON.parse(readFileSync(join(a, '..', 'decisions-audit-out.json'), 'utf8'));
    return (out.results || out).find((x) => x.id === 'C17');
  };
  ok(c17().result === 'PASS', 'audit C17 passes a project whose decision files were only ever added');
  g('checkout', '-qb', 'card');
  put(`${folder}/K003.md`, f('K003', 'draft')); g('add', '-A'); g('commit', '-qm', 'a new decision');
  put(`${folder}/K003.md`, f('K003', 'after the review')); g('add', '-A'); g('commit', '-qm', 'review fix');
  let r = c17();
  ok(r.result === 'PASS', `a decision added on a branch and corrected by a later commit there is not an edit: it reaches the default branch as one addition (${r.evidence})`);
  g('mv', `${folder}/K003.md`, `${folder}/K004.md`); put(`${folder}/K004.md`, f('K004', 'after the review')); g('add', '-A'); g('commit', '-qm', 'the number was taken');
  ok(c17().result === 'PASS', 'nor is renaming it there when its number was taken');
  put(`${folder}/K002.md`, f('K002', 'rewritten')); g('add', '-A'); g('commit', '-qm', 'edit a written decision');
  r = c17();
  ok(r.result === 'FAIL' && r.evidence.includes(`${folder}/K002.md changed after it was written`) && !r.evidence.includes('K004'), 'a branch that edits a decision already on the default branch still fails, naming that file only');
  g('checkout', '-q', main); g('merge', '-q', '--squash', 'card'); g('commit', '-qm', 'squash');
  r = c17();
  ok(r.result === 'FAIL' && r.evidence.includes(`${folder}/K002.md changed after it was written`), 'and once such an edit is on the default branch, its history fails the check');
  // K073: an edit the baseline lists for C17 by its SHA (a redaction on the owner's rule) is skipped; no other is
  const squash = g('rev-parse', 'HEAD').stdout.trim();
  const base = (id, commits) => writeFileSync(join(a, '.harness/audit-baseline.json'), JSON.stringify({ results: [{ id, commits, why: 'a name the owner keeps out of files, redacted' }] }));
  base('A10', [squash.slice(0, 7)]);
  ok(c17().result === 'FAIL', 'a commit listed for another rule does not excuse the edit');
  base('C17', [squash.slice(0, 7)]);
  r = c17();
  ok(r.result === 'PASS' && /1 known edit\(s\) of a decision file in the baseline skipped/.test(r.evidence), `listed for C17 by its short SHA, that edit is skipped and C17 passes, saying so (fails without K073: ${r.evidence})`);
  put(`${folder}/K004.md`, f('K004', 'edited later')); g('add', '-A'); g('commit', '-qm', 'another edit, on the default branch');
  r = c17();
  ok(r.result === 'FAIL' && r.evidence.includes(`${folder}/K004.md changed after it was written`) && !r.evidence.includes('K002.md'), 'a later edit still fails, naming only its file: the exception never accepts the rule');
  g('checkout', '-qb', 'card2'); g('reset', '-q', '--hard', squash);
  put(`${folder}/K002.md`, f('K002', 'edited again on a branch')); g('add', '-A'); g('commit', '-qm', 'branch edit');
  r = c17();
  ok(r.result === 'FAIL' && r.evidence.includes(`${folder}/K002.md changed after it was written`), 'and a branch that edits the same file again fails: only the listed commit is skipped');
  rmSync(a, { recursive: true, force: true }); rmSync(join(a, '..', 'decisions-audit-out.json'), { force: true });
}

// audit C17: the closed log's entry moved into its own file, as decisions.md prescribes, removes lines from the
// log; the baseline's `commits` exception skips exactly that commit for the lost-lines test, and nothing else (K067)
{
  const prof = JSON.parse(readFileSync(join(kit, 'examples/profile.example.json'), 'utf8'));
  const main = prof.branches?.default || 'main';
  const a = mkdtempSync(join(tmpdir(), 'decisions-move-'));
  const out = join(a, '..', `${a.split('/').pop()}.json`);
  const put = (p, text) => { mkdirSync(join(a, p, '..'), { recursive: true }); writeFileSync(join(a, p), text); };
  const g = (...x) => spawnSync('git', ['-C', a, ...x], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  const commit = (m) => { g('add', '-A'); g('commit', '-qm', m); return g('rev-parse', 'HEAD').stdout.trim(); };
  const folder = folderFor(prof.canon.decisions);
  const closed = '# d\n\n## K001 · first\n\ntext\n';
  put('CLAUDE.md', '# x\n');
  put(prof.canon.decisions, closed);
  put('.harness/profile.json', JSON.stringify({ ...prof, canon: { ...prof.canon, caps: {}, generated: [] } }));
  put(`${folder}/K002.md`, f('K002'));
  g('init', '-q', '-b', main); commit('fixture');
  const audit = (...x) => {
    const r = spawnSync(process.execPath, [join(kit, '.harness/tools/audit.mjs'), a, '--json', out, ...x], { encoding: 'utf8' });
    const c = (JSON.parse(readFileSync(out, 'utf8')).results).find((y) => y.id === 'C17');
    return { ...c, strictFail: r.status !== 0 && /FAIL C17 /.test(r.stdout) };
  };
  put(prof.canon.decisions, `${closed}\n## K003 · appended to the closed log\n\nthe entry\n`); commit('a thread on the older kit appends');
  put(prof.canon.decisions, closed); put(`${folder}/K003.md`, '## K003 · appended to the closed log\n\nthe entry\n');
  const moved = commit('the entry moved into its own file');
  let r = audit('--strict');
  ok(r.result === 'FAIL' && r.evidence.includes(`lost lines in 1 of its recent commits (${moved.slice(0, 7)})`) && r.strictFail, 'the prescribed move removes lines from the closed log, and C17 fails on it under --strict');
  const base = (commits, why = 'K003 moved word for word from the closed log to its own file') => writeFileSync(join(a, '.harness/audit-baseline.json'), JSON.stringify({ results: [{ id: 'C17', commits, why }] }));
  base([moved.slice(0, 7)]);
  r = audit('--strict');
  ok(r.result === 'PASS' && /only gained lines in its last 50 commits; 1 known exception/.test(r.evidence) && !r.strictFail,
    `listed in the baseline for C17 by its short SHA, the move is skipped and C17 passes, saying so (fails without K067: ${r.evidence})`);
  base([moved]);
  ok(audit('--strict').result === 'PASS', 'a full SHA in the baseline skips it too');
  writeFileSync(join(a, '.harness/audit-baseline.json'), JSON.stringify({ results: [{ id: 'A10', commits: [moved.slice(0, 7)], why: 'another rule' }] }));
  ok(audit().result === 'FAIL', 'a commit listed for another rule is not skipped by C17');
  base([moved.slice(0, 7)]);
  put(prof.canon.decisions, '# d\n\n## K001 · first, rewritten\n\ntext\n');
  const edit = commit('an edit of the closed log');
  r = audit('--strict');
  ok(r.result === 'FAIL' && r.evidence.includes(`lost lines in 1 of its recent commits (${edit.slice(0, 7)})`) && !r.evidence.includes(moved.slice(0, 7)) && r.strictFail,
    'a later commit that loses a line still fails C17, naming only that commit: the exception never accepts the rule');
  put(prof.canon.decisions, closed); const undo = commit('the edit undone');
  base([moved.slice(0, 7), edit.slice(0, 7), undo.slice(0, 7)]);
  put('.harness/profile.json', JSON.stringify({ ...prof, canon: { ...prof.canon, caps: { 'CLAUDE.md': 1 }, generated: [] } })); commit('a cap');
  r = audit('--strict');
  ok(r.result === 'FAIL' && /CLAUDE\.md \d+ B > cap 1/.test(r.evidence) && !/lost lines/.test(r.evidence) && r.strictFail, 'a C17 commits entry never hides the rule\'s other checks: a cap over still fails under --strict');
  rmSync(a, { recursive: true, force: true }); rmSync(out, { force: true });
}

console.log(`test-decisions: OK · ${n} checks`);
