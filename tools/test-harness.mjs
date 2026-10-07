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
writeFileSync(join(proj, 'CLAUDE.md'), '# CLAUDE.md — sandbox\n\n@AGENTS.md\n\nLocal note.\n');
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
ok(['.harness/tools/notify.mjs', '.harness/alerts.md'].every((f) => f in lock1.files) && /O10 Alerts\.\*\* One bot, one Telegram group/.test(readFileSync(join(proj, '.harness/owner-defaults.md'), 'utf8')), 'the alert standard is installed: notify.mjs, alerts.md and O10 in the loaded owner defaults');
const od = readFileSync(join(proj, '.harness/owner-defaults.md'), 'utf8');
ok(/O15 Never a relay\.\*\* No automation, routine or thread asks the owner to wake, nudge or relay/.test(od) && /Haiku\s+only for\s+read-only helper subagents/.test(od), 'the loaded owner defaults carry O15 (never a relay) and the Haiku helper role');
ok(/O16 Close threads\.\*\* A thread is resolved in the turn it reports DONE/.test(od), 'the loaded owner defaults carry O16 (a thread is resolved when it reports DONE)');
ok(existsSync(join(proj, '.claude/skills/correct/SKILL.md')) && '.claude/skills/correct/SKILL.md' in lock1.files, 'kit skills installed into .claude/skills and listed in the lock');
const claude = readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
ok(/^@\.harness\/core\.md$/m.test(claude) && /^@\.harness\/VERSION$/m.test(claude) && claude.includes('Local note.'), 'CLAUDE.md gained the kit imports and kept its own text');
const profile = JSON.parse(readFileSync(join(proj, '.harness/profile.json'), 'utf8'));
ok(profile.preset === 'web-app' && profile.capabilities.includes('database') && !('kit' in profile), 'profile skeleton takes the preset capabilities');
ok(tool(['status']).status === 0, 'status: managed files match the lock');

// 2. the audit runs on the installed copy and sees the kit
r = spawnSync('node', [join(proj, '.harness/tools/audit.mjs'), proj, '--json', join(work, 'audit.json')], { encoding: 'utf8' });
const audit = JSON.parse(readFileSync(join(work, 'audit.json'), 'utf8'));
const res = (id) => audit.results.find((x) => x.id === id).result;
ok(r.status === 0 && res('A01') === 'PASS' && res('A04') === 'PASS', `audit on the project: A01 ${res('A01')}, A04 ${res('A04')}`);

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
const owned = git(proj, 'ls-files').split('\n').filter((f) => !(f in lock1.files) && f !== '.harness/kit.lock.json');
const before = Object.fromEntries(owned.map((f) => [f, hash(join(proj, f))]));

// 4. update to the next release: first refused while a project file sits where the kit adds one
writeFileSync(join(proj, '.harness/added-in-next.md'), 'PROJECT OWNED\n');
r = tool(['update', '--version', v2]);
ok(r.status === 1 && /sit where kit/.test(r.stderr) && readFileSync(join(proj, '.harness/added-in-next.md'), 'utf8') === 'PROJECT OWNED\n' && readFileSync(join(proj, '.harness/VERSION'), 'utf8').trim() === v1,
  'update refuses to overwrite a project file at a path the new kit claims, and changes nothing');
rmSync(join(proj, '.harness/added-in-next.md'));
r = tool(['update', '--version', v2]);
ok(r.status === 0, `update ${v1} → ${v2}: ${r.stdout.trim()}`);
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
