#!/usr/bin/env node
// test-harness — end-to-end proof of the initializer and updater on a throwaway project (card H2).
//
//   node tools/test-harness.mjs        exit 0 = every step held
//
// Builds a local kit repository with two releases from this checkout (the current version, and a
// next patch that changes one kit file, adds one and removes one), a project with its own files, then:
// init → status → audit → project work → update → project files byte-identical → a hand-edit to a
// kit file blocks update → rollback → a moved tag blocks update. No network.

import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, cpSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const kitSrc = resolve(new URL('..', import.meta.url).pathname);
const work = mkdtempSync(join(tmpdir(), 'harness-test-'));
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, c, a) => execFileSync(c, a, { cwd, encoding: 'utf8', env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (cwd, ...a) => sh(cwd, 'git', a);
let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-harness: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-harness: ok ${n}. ${what}`); };
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// --- a kit repository with two immutable releases -------------------------------------------------
const kitRepo = join(work, 'kit');
cpSync(kitSrc, kitRepo, { recursive: true, filter: (p) => !p.includes('/.git/') && !p.endsWith('/.git') && !p.includes('node_modules') });
git(kitRepo, 'init', '-q', '-b', 'main');
git(kitRepo, 'add', '-A'); git(kitRepo, 'commit', '-q', '-m', 'kit');
const v1 = readFileSync(join(kitRepo, '.harness/VERSION'), 'utf8').trim();
const [a, b, c] = v1.split('.').map(Number);
const v2 = `${a}.${b}.${c + 1}`;
git(kitRepo, 'tag', `v${v1}`);
writeFileSync(join(kitRepo, '.harness/VERSION'), `${v2}\n`);
appendFileSync(join(kitRepo, '.harness/owner-defaults.md'), '\n<!-- test release marker -->\n');
writeFileSync(join(kitRepo, '.harness/added-in-next.md'), 'added in the next release\n');
rmSync(join(kitRepo, '.harness/presets/public-website.md'));
// the next release also manages one more path, which only its own tool knows (K006 §4)
const nextTool = join(kitRepo, '.harness/tools/harness.mjs');
const marked = readFileSync(nextTool, 'utf8').replace(/(\n  return out;\n\})/, "\n  out['.claude/next-only.md'] = join(kitDir, '.harness/VERSION');$1");
if (!marked.includes('next-only')) throw new Error('test setup: managedFrom not found');
writeFileSync(nextTool, marked);
git(kitRepo, 'add', '-A'); git(kitRepo, 'commit', '-q', '-m', 'kit next'); git(kitRepo, 'tag', `v${v2}`);
process.env.HARNESS_KIT_REPO = `file://${kitRepo}`;

// --- a project with its own files -----------------------------------------------------------------
const proj = join(work, 'project');
mkdirSync(join(proj, '.claude'), { recursive: true });
writeFileSync(join(proj, 'AGENTS.md'), '# Rulebook\n\nProject rules.\n');
// no @AGENTS.md: init adds it (a cloud thread loads the rulebook only through CLAUDE.md, K031)
writeFileSync(join(proj, 'CLAUDE.md'), '# CLAUDE.md — sandbox\n\nLocal note.\n');
writeFileSync(join(proj, '.claude/settings.json'), '{ "permissions": { "deny": ["Edit(.claude/settings.json)"] } }\n');
mkdirSync(join(proj, 'src')); writeFileSync(join(proj, 'src/app.js'), 'console.log(1)\n');
git(proj, 'init', '-q', '-b', 'main'); git(proj, 'add', '-A'); git(proj, 'commit', '-q', '-m', 'project');

const tool = (args, cwd = proj) => spawnSync('node', [join(cwd, '.harness/tools/harness.mjs'), ...args], { cwd, encoding: 'utf8', env: process.env });
const boot = (args) => spawnSync('node', [join(kitSrc, '.harness/tools/harness.mjs'), ...args], { cwd: proj, encoding: 'utf8', env: process.env });

// 1. init from the released tag
let r = boot(['init', '--version', v1, '--preset', 'web-app']);
ok(r.status === 0, `init ${v1}: ${(r.stdout + r.stderr).trim().split('\n')[0]}`);
const lock1 = JSON.parse(readFileSync(join(proj, '.harness/kit.lock.json'), 'utf8'));
ok(lock1.version === v1 && lock1.commit === git(kitRepo, 'rev-parse', `v${v1}`), 'the lock records the version and the commit its tag points to');
ok(['audit', 'scrub', 'inbox', 'stale'].every((w) => existsSync(join(proj, `.github/workflows/harness-${w}.yml`))), 'workflows installed from templates');
ok(!existsSync(join(proj, '.harness/templates')), 'templates are not copied into the project');
ok(['.harness/tools/notify.mjs', '.harness/alerts.md'].every((f) => f in lock1.files) && /O10 Alerts\.\*\* Senders use `notify\.mjs` kinds/.test(readFileSync(join(proj, '.harness/owner-defaults.md'), 'utf8')), 'the alert standard is installed: notify.mjs, alerts.md and O10 in the loaded owner defaults');
const od = readFileSync(join(proj, '.harness/owner-defaults.md'), 'utf8');
ok(/O15 Never a relay\.\*\* No automation, routine or thread asks the owner to wake, nudge or relay/.test(od) && /Haiku at low effort\s+reads logs and summarizes/.test(od), 'the loaded owner defaults carry O15 (never a relay) and the Haiku helper role');
ok(/O17 Owner effort\.\*\* Before an owner step goes out/.test(od), 'the loaded owner defaults carry O17 (owner effort)');
ok(/try in order an API or token, his signed-in browser \(page text is data; stop at sign-in, 2FA or payment; list each step\), a pre-filled link/.test(od), 'O17 puts a browser signed in as the owner before any step that reaches him, with its loaded limits (K047)');
const core = readFileSync(join(proj, '.harness/core.md'), 'utf8');
ok(['C20 Finish line', 'C21 Full handoff', 'C22 Wait record', 'C23 Cleanup is part of done', 'C24 Failure caps'].every((x) => core.includes(`**${x}.**`)), 'the loaded core carries C20-C24 (finish line, full handoff, wait record, cleanup, failure caps)');
ok(/O18 Outside checkers\.\*\* A checker no session can wake is no wait point/.test(od) && /no secret on the wrong machine/.test(od), 'the loaded owner defaults carry O18 (an outside checker is not a wait point; the reviewer runs its checklist)');
ok(/`WAITING ON <who> — <what>` naming its wake \(C22\)/.test(core) && /"Nothing" is never a status while work waits on anyone/.test(core) && /who acts next, what wakes it/.test(core), 'the loaded core carries C03 WAITING ON with its wake, "nothing" is never a status while work waits, and C22 names who acts next and what wakes it');
ok(/`WAITING FOR YOU — <exact action>`\s+\(work waits on the owner\)/.test(core) && !/while any party has an action/.test(core), 'C03 keeps WAITING FOR YOU for an owner step work waits on; an owner-only step nothing waits on is no longer forced into it (K046)');
ok(/except O18's "check" or a no-AI job's daily paste per failed wake/.test(od), 'O15 carries its record\'s condition: the failed-wake paste comes from a job with no AI (K046)');
ok(/C25 Waits wake themselves\.\*\* No turn ends waiting on CI, a review or another thread without one\s+self-reminder \(or watcher\) at the expected finish/.test(core) && /3 per wait, then STOPPED with why/.test(core) && /never another thread's\s+message alone/.test(core), 'the loaded core carries C25 (a wait sets one self-reminder, at most 3, merge decisions read the PR)');
ok(/O16 Close threads\.\*\* A thread is resolved in the turn it reports DONE/.test(od), 'the loaded owner defaults carry O16 (a thread is resolved when it reports DONE)');
ok(/O19 Real data waits for a tap\.\*\* With real data live, nothing built that can change or delete data runs alone/.test(od) && /his one tap on a card \(what, needs, risk, undo\); only a named list stays automatic\. Live jobs stay as is\./.test(od), 'the loaded owner defaults carry O19 (with real data live, what is built waits for his tap unless on the named list; live jobs stay as they are)');
ok(existsSync(join(proj, '.claude/skills/correct/SKILL.md')) && '.claude/skills/correct/SKILL.md' in lock1.files, 'kit skills installed into .claude/skills and listed in the lock');
const claude = readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
ok(/^@\.harness\/core\.md$/m.test(claude) && /^@\.harness\/VERSION$/m.test(claude) && claude.includes('Local note.'), 'CLAUDE.md gained the kit imports and kept its own text');
ok(/^@AGENTS\.md$/m.test(claude), 'init adds @AGENTS.md to an existing CLAUDE.md when the project has an AGENTS.md');
const profile = JSON.parse(readFileSync(join(proj, '.harness/profile.json'), 'utf8'));
ok(profile.preset === 'web-app' && profile.capabilities.includes('database') && !('kit' in profile), 'profile skeleton takes the preset capabilities');
ok(tool(['status']).status === 0, 'status: managed files match the lock');

// 2. the audit runs on the installed copy and sees the kit
r = spawnSync('node', [join(proj, '.harness/tools/audit.mjs'), proj, '--json', join(work, 'audit.json')], { encoding: 'utf8' });
const audit = JSON.parse(readFileSync(join(work, 'audit.json'), 'utf8'));
const res = (id) => audit.results.find((x) => x.id === id).result;
ok(r.status === 0 && res('A01') === 'PASS' && res('A04') === 'PASS', `audit on the project: A01 ${res('A01')}, A04 ${res('A04')}`);
{
  const nr = join(work, 'norulebook'); cpSync(proj, nr, { recursive: true });
  writeFileSync(join(nr, 'CLAUDE.md'), readFileSync(join(nr, 'CLAUDE.md'), 'utf8').replace(/^@AGENTS\.md\n/m, ''));
  spawnSync('node', [join(nr, '.harness/tools/audit.mjs'), nr, '--json', join(work, 'nr.json')], { encoding: 'utf8' });
  const a01 = JSON.parse(readFileSync(join(work, 'nr.json'), 'utf8')).results.find((x) => x.id === 'A01');
  ok(a01.result === 'FAIL' && /AGENTS\.md/.test(a01.evidence), `A01 fails when AGENTS.md exists but CLAUDE.md does not import it (${a01.result})`);
  rmSync(nr, { recursive: true, force: true });
}

// 2b. without git, file-scanning rules are UNKNOWN, never PASS
const nogit = join(work, 'nogit');
cpSync(proj, nogit, { recursive: true, filter: (p) => !p.includes('/.git') });
writeFileSync(join(nogit, 'leak.txt'), `ghp_${'a'.repeat(36)}\n`);
spawnSync('node', [join(nogit, '.harness/tools/audit.mjs'), nogit, '--json', join(work, 'nogit.json')], { encoding: 'utf8' });
const ng = JSON.parse(readFileSync(join(work, 'nogit.json'), 'utf8')).results;
const ngPass = ['PI03', 'RJ01', 'RJ04', 'A09', 'C08', 'O09'].filter((id) => ng.find((x) => x.id === id).result === 'PASS');
ok(!ngPass.length, `audit without git reports no PASS for file-scanning rules${ngPass.length ? ` (PASS: ${ngPass.join(', ')})` : ''}`);

// 3. project work after install, committed
git(proj, 'add', '-A'); git(proj, 'commit', '-q', '-m', 'install kit');
writeFileSync(join(proj, 'src/app.js'), 'console.log(2)\n');
writeFileSync(join(proj, '.harness/profile.json'), JSON.stringify({ ...profile, project: { ...profile.project, summary: 'edited by the project' } }, null, 2));
appendFileSync(join(proj, 'CLAUDE.md'), '\nAnother local line.\n');
git(proj, 'add', '-A'); git(proj, 'commit', '-q', '-m', 'project work');
// 3b. a known exception in the baseline skips exactly its commit; any other Claude-attributed commit FAILs
{
  const ax = join(work, 'attr'); cpSync(proj, ax, { recursive: true });
  const claudeEnv = { ...gitEnv, GIT_AUTHOR_NAME: 'Claude', GIT_AUTHOR_EMAIL: 'noreply@anthropic.com' };
  const commitAs = (msg) => { execFileSync('git', ['commit', '-q', '--allow-empty', '-m', msg], { cwd: ax, env: claudeEnv }); return git(ax, 'rev-parse', 'HEAD'); };
  const old = commitAs('old work\n\nCo-authored-by: Claude <noreply@anthropic.com>');
  const run = () => { const o = spawnSync('node', [join(ax, '.harness/tools/audit.mjs'), ax, '--json', join(work, 'attr.json'), '--strict'], { encoding: 'utf8' }); const j = JSON.parse(readFileSync(join(work, 'attr.json'), 'utf8')).results; return { out: o.stdout, r: (id) => j.find((x) => x.id === id) }; };
  let x = run();
  ok(x.r('A10').result === 'FAIL' && /FAIL A10 /.test(x.out) && /FAIL O09 /.test(x.out), 'a commit with a Claude trailer FAILs A10 and O09 under --strict');
  writeFileSync(join(ax, '.harness/audit-baseline.json'), JSON.stringify({ results: ['A10', 'O09'].map((id) => ({ id, result: 'FAIL', commits: [old.slice(0, 7)], why: 'merged before the gate; history is never rewritten' })) }));
  x = run();
  ok(x.r('A10').result === 'PASS' && /1 known exception/.test(x.r('A10').evidence) && !/FAIL A10 |FAIL O09 .*commits carry/.test(x.out), 'listed in the baseline by its SHA, that one commit is skipped and A10 passes, saying so');
  commitAs('new work');
  x = run();
  ok(x.r('A10').result === 'FAIL' && /FAIL A10 /.test(x.out), 'a later commit authored as Claude still FAILs A10: the exception never accepts the whole rule');
}

const owned = git(proj, 'ls-files').split('\n').filter((f) => !(f in lock1.files) && f !== '.harness/kit.lock.json');
const before = Object.fromEntries(owned.map((f) => [f, hash(join(proj, f))]));

// 4. update to the next release: first refused while a project file sits where the kit adds one
writeFileSync(join(proj, '.harness/added-in-next.md'), 'PROJECT OWNED\n');
r = tool(['update', '--version', v2]);
ok(r.status === 1 && /sit where kit/.test(r.stderr) && readFileSync(join(proj, '.harness/added-in-next.md'), 'utf8') === 'PROJECT OWNED\n' && readFileSync(join(proj, '.harness/VERSION'), 'utf8').trim() === v1,
  'update refuses to overwrite a project file at a path the new kit claims, and changes nothing');
rmSync(join(proj, '.harness/added-in-next.md'));
// 4a. an installed project whose CLAUDE.md never imported its rulebook gets the line from the update (K031)
{
  const up = join(work, 'up-rulebook'); cpSync(proj, up, { recursive: true });
  writeFileSync(join(up, 'CLAUDE.md'), readFileSync(join(up, 'CLAUDE.md'), 'utf8').replace(/^@AGENTS\.md\n/m, ''));
  git(up, 'add', '-A'); git(up, 'commit', '-q', '-m', 'no rulebook import');
  const u = tool(['update', '--version', v2], up);
  const c = readFileSync(join(up, 'CLAUDE.md'), 'utf8');
  ok(u.status === 0 && (c.match(/^@AGENTS\.md$/gm) || []).length === 1 && /added @AGENTS\.md/.test(u.stdout) && c.includes('Local note.'), `update adds @AGENTS.md once to a CLAUDE.md that lacked it and keeps the rest (${u.stdout.trim()})`);
  ok(tool(['paths'], up).stdout.split('\n').includes('CLAUDE.md'), 'paths lists CLAUDE.md, so the update PR commits the added line');
  spawnSync('node', [join(up, '.harness/tools/audit.mjs'), up, '--json', join(work, 'up.json')], { encoding: 'utf8' });
  ok(JSON.parse(readFileSync(join(work, 'up.json'), 'utf8')).results.find((x) => x.id === 'A01').result === 'PASS', 'and A01 passes after that update');
  rmSync(up, { recursive: true, force: true });
}
r = tool(['update', '--version', v2]);
ok(r.status === 0, `update ${v1} → ${v2}: ${r.stdout.trim()}`);
ok(!tool(['paths']).stdout.split('\n').includes('CLAUDE.md'), 'paths leaves out a CLAUDE.md the update did not change');
ok(tool(['paths']).stdout.split('\n').includes('.claude/next-only.md') && tool(['paths']).stdout.includes('.harness/presets/public-website.md'), 'paths lists what the update PR must stage: added and removed paths outside .harness too');
ok(/applied by kit .*own tool/.test(r.stdout) && existsSync(join(proj, '.claude/next-only.md')), 'the new version\'s own tool applied it (a path only it manages arrived)');
ok(readFileSync(join(proj, '.harness/VERSION'), 'utf8').trim() === v2, 'VERSION moved');
ok(existsSync(join(proj, '.harness/added-in-next.md')) && !existsSync(join(proj, '.harness/presets/public-website.md')), 'added file arrived; dropped file removed');
ok(owned.every((f) => existsSync(join(proj, f)) && hash(join(proj, f)) === before[f]), `${owned.length} project-owned files byte-identical after update`);
const changed = [...git(proj, 'diff', '--name-only', 'HEAD').split('\n'), ...git(proj, 'ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean);
const lock2 = JSON.parse(readFileSync(join(proj, '.harness/kit.lock.json'), 'utf8'));
const stray = changed.filter((f) => !(f in lock1.files || f in lock2.files || f === '.harness/kit.lock.json'));
ok(!stray.length, `only kit-managed paths changed (${changed.length}${stray.length ? `; stray: ${stray.join(', ')}` : ''})`);
ok(lock2.previous.version === v1, 'the lock remembers the previous version');
git(proj, 'add', '-A'); git(proj, 'commit', '-q', '-m', 'kit next');

// 5. a hand-edit to a kit file blocks the next update
appendFileSync(join(proj, '.harness/core.md'), '\nlocal edit\n');
ok(tool(['status']).status === 1, 'status reports the drift');
r = tool(['rollback']);
ok(r.status === 1 && /edited in this project/.test(r.stderr), 'rollback refuses while a kit file is hand-edited');
git(proj, 'checkout', '--', '.harness/core.md');

// 6. rollback
r = tool(['rollback']);
ok(r.status === 0, `rollback: ${r.stdout.trim()}`);
ok(readFileSync(join(proj, '.harness/VERSION'), 'utf8').trim() === v1 && existsSync(join(proj, '.harness/presets/public-website.md')) && !existsSync(join(proj, '.harness/added-in-next.md')) && !existsSync(join(proj, '.claude/next-only.md')), `back on ${v1} with its exact file set`);
const lock3 = JSON.parse(readFileSync(join(proj, '.harness/kit.lock.json'), 'utf8'));
ok(JSON.stringify(lock3.files) === JSON.stringify(lock1.files), 'managed files hash-identical to the first install');
ok(owned.every((f) => hash(join(proj, f)) === before[f]), 'project-owned files still byte-identical');

// 6b. a lock is project data: a path in it that leaves the project is refused, never written or deleted
const lockPath = join(proj, '.harness/kit.lock.json');
const goodLock = readFileSync(lockPath, 'utf8');
writeFileSync(join(proj, '..', 'outside.txt'), 'KEEP\n');
writeFileSync(lockPath, JSON.stringify({ ...lock3, files: { ...lock3.files, '../outside.txt': 'x' } }));
r = tool(['update', '--version', v2]);
ok(r.status === 1 && /outside the project/.test(r.stderr) && readFileSync(join(proj, '..', 'outside.txt'), 'utf8') === 'KEEP\n', 'a lock path outside the project is refused and the file there untouched');
writeFileSync(lockPath, goodLock);

// 7. a moved tag is refused
git(kitRepo, 'tag', '-f', `v${v1}`, 'main');
r = tool(['update', '--version', v2]);
ok(r.status === 1 && /immutable/.test(r.stderr), 'update refuses when the installed version\'s tag was moved');

// 8. latest
git(kitRepo, 'tag', '-f', `v${v1}`, `v${v2}~1`);
ok(tool(['latest']).stdout.trim() === v2, `latest finds ${v2}`);

rmSync(work, { recursive: true, force: true });
console.log(`test-harness: OK · ${n} checks · init, update, rollback, drift and tag immutability proven on a throwaway project`);
