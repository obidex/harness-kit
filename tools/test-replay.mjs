#!/usr/bin/env node
// test-replay — the frozen replay set, its grader, the stored results and the release gate (K034).
//
//   node tools/test-replay.mjs        exit 0 = every case held

import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, readdirSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { tasks, choiceOf, grade, prompt, setProblems, resultProblems, tasksHash, rulesHash } from './replay.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-replay: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-replay: ok ${n}. ${what}`); };
const kit = new URL('..', import.meta.url).pathname;
const list = tasks();

ok(setProblems().length === 0 && list.length >= 20 && list.length <= 50, `the frozen set is whole: ${list.length} tasks, hash as recorded in replay/README.md`);
ok(choiceOf('CHOICE: B\nWHY: x') === 'B' && choiceOf('**CHOICE:** C') === 'C' && choiceOf('I pick B') === null && choiceOf('CHOICE: E') === null, 'the choice is read only from a CHOICE: line, A to D');
const p = prompt(list[0]);
ok(p.includes(readFileSync(join(kit, '.harness/core.md'), 'utf8')) && p.includes(readFileSync(join(kit, '.harness/owner-defaults.md'), 'utf8')) && p.includes(list[0].situation), 'the prompt carries the loaded rules and the situation');
ok(list.every((t) => !prompt(t).includes(t.source) && !prompt(t).includes('"expect"')), 'the prompt never shows the source or the expected answer');

const right = Object.fromEntries(list.map((t) => [t.id, `CHOICE: ${t.expect}\nWHY: x`]));
const wrong = (k) => Object.fromEntries(list.map((t, i) => [t.id, `CHOICE: ${i < k ? (t.expect === 'A' ? 'B' : 'A') : t.expect}`]));
ok(grade(right).passed === list.length && grade(wrong(3)).passed === list.length - 3, 'grading counts expected letters');

// the newest stored result is the one made on this checkout's rule text
const newest = readdirSync(join(kit, 'replay/results')).filter((f) => /^\d+\.\d+\.\d+\.json$/.test(f)).map((f) => f.slice(0, -5)).sort((a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }).at(-1);
const stored = JSON.parse(readFileSync(join(kit, `replay/results/${newest}.json`), 'utf8'));
ok(resultProblems(stored).length === 0, 'the stored baseline re-grades and holds the floor');
ok(resultProblems({ ...stored, passed: stored.passed - 1 }).some((x) => /re-grading gives/.test(x)), 'a tampered score is caught by re-grading');
const drop = { ...stored.answers }; delete drop[list[0].id];
ok(resultProblems({ ...stored, answers: drop, passed: grade(drop).passed }).some((x) => /no answer for R01/.test(x)), 'a missing answer is caught');
ok(resultProblems({ ...stored, rules_sha256: 'x' }).some((x) => /different loaded rules/.test(x)) && resultProblems({ ...stored, rules_sha256: 'x' }, { current: false }).every((x) => !/different loaded rules/.test(x)), 'a result for other rule text fails the release check, not the history check');
ok(resultProblems({ ...stored, tasks_sha256: 'x' }).some((x) => /different task set/.test(x)), 'a result for another task set is refused');
ok(resultProblems({ ...stored, role: 'whatever' }).some((x) => /not an A23 role/.test(x)), 'the role must be an A23 role');
const low = wrong(Math.floor(list.length * 0.2) + 1);
ok(resultProblems({ ...stored, answers: low, passed: grade(low).passed }).some((x) => /under the floor/.test(x)), 'under 80% fails');
const lost2 = wrong(2), lost1 = wrong(1);
ok(resultProblems({ ...stored, kit: '9.9.9', answers: lost2, passed: grade(lost2).passed }).some((x) => /on the tasks it shares with 0\.31\.0, 26 pass where 28 did/.test(x)), 'two tasks fewer than the best earlier result is a regression');
ok(resultProblems({ ...stored, kit: '9.9.9', answers: lost1, passed: grade(lost1).passed }).length === 0, 'one task fewer is tolerated (models are not perfectly repeatable)');
const swap = { ...lost1, [list[1].id]: `CHOICE: ${list[1].expect === 'A' ? 'B' : 'A'}`, [list[0].id]: `CHOICE: ${list[0].expect}` };
ok(resultProblems({ ...stored, kit: '9.9.9', answers: swap, passed: grade(swap).passed }).length === 0 && grade(swap).passed === list.length - 1, 'losing a different single task is also tolerated');

// the release gate, end to end on a copy of the kit
const tmp = mkdtempSync(join(tmpdir(), 'replay-'));
const r = join(tmp, 'kit');
cpSync(kit, r, { recursive: true, filter: (s) => !/\/\.git(\/|$)/.test(s) && !s.includes('node_modules') });
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8', env });
g('init', '-q', '-b', 'main'); g('add', '-A'); g('commit', '-qm', 'base'); g('branch', 'base');
const check = () => spawnSync(process.execPath, ['tools/check-version.mjs', 'base'], { cwd: r, encoding: 'utf8', env });
const bump = (v) => { writeFileSync(join(r, '.harness/VERSION'), `${v}\n`); writeFileSync(join(r, 'CHANGELOG.md'), readFileSync(join(r, 'CHANGELOG.md'), 'utf8').replace('# Changelog\n', `# Changelog\n\n## ${v} · test\n\n- x\n`)); };
// a tool-only change needs no replay
appendFileSync(join(r, '.harness/tools/load.mjs'), '\n// tool change\n'); bump('9.0.0'); g('commit', '-qam', 'tool');
let res = check();
ok(res.status === 0 && !/replay/.test(res.stdout), 'a change to tools only needs no replay');
// a change to the loaded rules without a result fails
g('checkout', '-q', '-B', 'rules', 'base');
appendFileSync(join(r, '.harness/owner-defaults.md'), '\n'); bump('9.0.0'); g('commit', '-qam', 'rules');
res = check();
ok(res.status === 1 && /owner-defaults\.md changed, so replay\/results\/9\.0\.0\.json must pass the replay check/.test(res.stdout), 'a change to the loaded rules without a replay result fails the release');
// with a result recorded on the new text it passes; re-grading still applies
const fresh = { ...stored, kit: '9.0.0', rules_sha256: spawnSync(process.execPath, ['-e', "import('./tools/replay.mjs').then(m=>console.log(m.rulesHash()))"], { cwd: r, encoding: 'utf8' }).stdout.trim() };
writeFileSync(join(r, 'replay/results/9.0.0.json'), JSON.stringify(fresh)); g('add', '-A'); g('commit', '-qm', 'result');
res = check();
ok(res.status === 0 && /replay: OK replay\/results\/9\.0\.0\.json/.test(res.stdout), 'with a result for the new rule text the release passes');
writeFileSync(join(r, 'replay/results/9.0.0.json'), JSON.stringify({ ...fresh, rules_sha256: stored.rules_sha256 })); g('commit', '-qam', 'stale result');
res = check();
ok(res.status === 1 && /different loaded rules/.test(res.stdout), 'a result made on the old rule text does not count');
// an adapter change (A23 names the models) needs one too
g('checkout', '-q', '-B', 'model', 'base');
appendFileSync(join(r, '.harness/adapters/claude-code-github.md'), '\n'); bump('9.0.0'); g('commit', '-qam', 'model');
res = check();
ok(res.status === 1 && /adapters\/claude-code-github\.md changed, so replay\/results\/9\.0\.0\.json/.test(res.stdout), 'an adapter change (a new model in A23) needs a replay result');
// the set is frozen
g('checkout', '-q', '-B', 'set', 'base');
const t = JSON.parse(readFileSync(join(r, 'replay/tasks.json'), 'utf8')); t[0].expect = t[0].expect === 'A' ? 'B' : 'A';
writeFileSync(join(r, 'replay/tasks.json'), JSON.stringify(t));
const ck = spawnSync(process.execPath, ['tools/check-kit.mjs'], { cwd: r, encoding: 'utf8' }); 
ok(ck.stdout.includes('not the frozen'), 'check-kit refuses a changed set whose hash is not recorded');
bump('9.0.0'); g('commit', '-qam', 'set');
res = check();
ok(res.status === 1 && /expected answer changed: the set only grows/.test(res.stdout), 'an expected answer cannot be changed: the set only grows');
// the legitimate path: a new task, its hash recorded, the release saying "replay set"; older results still re-grade
g('checkout', '-q', '-B', 'set2', 'base');
const t2 = JSON.parse(readFileSync(join(r, 'replay/tasks.json'), 'utf8')); t2.push({ ...t2[0], id: 'R99' });
writeFileSync(join(r, 'replay/tasks.json'), JSON.stringify(t2));
const h2 = spawnSync(process.execPath, ['tools/replay.mjs', 'hash'], { cwd: r, encoding: 'utf8' }).stdout.trim();
writeFileSync(join(r, 'replay/README.md'), readFileSync(join(r, 'replay/README.md'), 'utf8').replace(/^Frozen set: sha256 [0-9a-f]{64}$/m, `Frozen set: sha256 ${h2}`));
const ck2 = spawnSync(process.execPath, ['tools/check-kit.mjs'], { cwd: r, encoding: 'utf8' });
ok(ck2.status === 0, `a recorded set change keeps check-kit green; the older result re-grades on the set it stored (${ck2.stdout.trim().split('\n').pop()})`);
bump('9.0.0'); writeFileSync(join(r, 'CHANGELOG.md'), readFileSync(join(r, 'CHANGELOG.md'), 'utf8').replace('- x\n', '- replay set: R99\n')); g('add', '-A'); g('commit', '-qm', 'set2');
ok(check().status === 0, 'and the release that says "replay set" passes');
// a grown set does not reset the floor: losing earlier-passed tasks still fails
const big = Object.fromEntries(t2.map((t, i) => [t.id, `CHOICE: ${i < 5 ? (t.expect === 'A' ? 'B' : 'A') : t.expect}`]));
const lostRes = spawnSync(process.execPath, ['-e', `import('./tools/replay.mjs').then(m => { const r = ${JSON.stringify({ ...stored, kit: '9.1.0' })}; r.answers = ${JSON.stringify(big)}; r.expected = Object.fromEntries(m.tasks().map((t) => [t.id, t.expect])); r.tasks_sha256 = m.tasksHash(); r.rules_sha256 = m.rulesHash(); r.passed = m.grade(r.answers).passed; console.log(JSON.stringify(m.resultProblems(r))); })`], { cwd: r, encoding: 'utf8' });
ok(/on the tasks it shares with 0\.31\.0, 23 pass where 28 did/.test(lostRes.stdout) && new RegExp(`5 tasks ${newest.replaceAll('.', '\\.')} passed now fail`).test(lostRes.stdout), 'adding a task does not switch the floor off: lost earlier lessons still fail the release');
// a task removed, or an earlier result edited, is refused
g('checkout', '-q', '-B', 'shrink', 'base');
writeFileSync(join(r, 'replay/tasks.json'), JSON.stringify(JSON.parse(readFileSync(join(r, 'replay/tasks.json'), 'utf8')).slice(1)));
bump('9.0.0'); g('commit', '-qam', 'shrink');
ok(/R01 was removed or its expected answer changed/.test(check().stdout), 'a task is never dropped');
g('checkout', '-q', '-B', 'edit', 'base');
const old = JSON.parse(readFileSync(join(r, 'replay/results/0.31.0.json'), 'utf8')); old.date = '2000-01-01';
writeFileSync(join(r, 'replay/results/0.31.0.json'), JSON.stringify(old)); appendFileSync(join(r, '.harness/tools/load.mjs'), '\n'); bump('9.0.0'); g('commit', '-qam', 'edit');
ok(/0\.31\.0\.json is an earlier replay result \(M\)/.test(check().stdout), 'an earlier result is never edited');
g('checkout', '-q', '-B', 'editonly', 'base');
writeFileSync(join(r, 'replay/results/0.31.0.json'), JSON.stringify(old)); g('commit', '-qam', 'edit only');
ok(/is an earlier replay result \(M\)/.test(check().stdout), 'even in a PR that changes nothing else');
g('checkout', '-q', '-B', 'addold', 'base');
writeFileSync(join(r, 'replay/results/0.1.0.json'), JSON.stringify({ ...stored, kit: '0.1.0' })); g('add', '-A'); g('commit', '-qm', 'add old');
ok(/a release adds only its own result/.test(check().stdout), 'a PR cannot add a result for another version');

rmSync(tmp, { recursive: true, force: true });
ok(tasksHash() && rulesHash(), 'hashes compute');
console.log(`test-replay: OK · ${n} cases`);
