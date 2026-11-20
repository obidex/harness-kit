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

console.log(`test-decisions: OK · ${n} checks`);
