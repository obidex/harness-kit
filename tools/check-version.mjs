#!/usr/bin/env node
// check-version — a pull request that changes kit content ships it as a new, untagged version.
//
//   node tools/check-version.mjs <base ref>      exit 0 = fine, 1 = bump or changelog missing
//
// Kit content is .harness/** (what projects install) and the frozen replay set. If it changed against the base, VERSION must
// be higher than the base's, no tag v<VERSION> may exist yet (tags are immutable, K003), and
// CHANGELOG.md must have a "## <VERSION>" entry.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'origin/main';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const fail = (m) => { console.log(`check-version: FAIL ${m}`); process.exit(1); };

// stored results are history: a release adds its own, never edits or deletes an earlier one
for (const line of git('diff', '--name-status', `${base}...HEAD`, '--', 'replay/results').split('\n').filter(Boolean)) {
  const [st, f] = line.split('\t');
  if (st !== 'A') fail(`${f} is an earlier replay result (${st}): results are added, never edited or removed`);
  const v = readFileSync('.harness/VERSION', 'utf8').trim();
  if (f !== `replay/results/${v}.json`) fail(`${f} is added, but a release adds only its own result (replay/results/${v}.json)`);
}
const setChanged = git('diff', '--name-only', `${base}...HEAD`).split('\n').some((f) => f === 'replay/tasks.json');
if (setChanged) {
  // the set only grows: no task removed, no expected answer changed
  let was = [];
  try { was = JSON.parse(execFileSync('git', ['show', `${base}:replay/tasks.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { /* new set */ }
  const ids = new Map(JSON.parse(readFileSync('replay/tasks.json', 'utf8')).map((t) => [t.id, t.expect]));
  for (const t of was) if (ids.get(t.id) !== t.expect) fail(`replay task ${t.id} was removed or its expected answer changed: the set only grows`);
}
const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter((f) => f.startsWith('.harness/') || f === 'replay/tasks.json');
if (!changed.length) { console.log('check-version: OK · no kit content changed'); process.exit(0); }
const now = readFileSync('.harness/VERSION', 'utf8').trim();
const was = git('show', `${base}:.harness/VERSION`).trim();
if (cmp(now, was) <= 0) fail(`${changed.length} kit file(s) changed but VERSION is ${now}, not above ${was}`);
if (git('tag', '--list', `v${now}`)) fail(`tag v${now} already exists; pick the next version`);
if (!new RegExp(`^## ${now.replace(/\./g, '\\.')}\\b`, 'm').test(readFileSync('CHANGELOG.md', 'utf8'))) fail(`CHANGELOG.md has no "## ${now}" entry`);
// a changed standing-approvals block reaches projects only by an inbox request each (K022): the
// release names it in the changelog, so the maintainer sends them
const blockOf = (t) => (t.match(/<!-- standing-approvals:begin -->[\s\S]*<!-- standing-approvals:end -->/) || [''])[0];
const SA = '.harness/standing-approvals.md';
if (changed.includes(SA)) {
  let before = '';
  try { before = execFileSync('git', ['show', `${base}:${SA}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* new file */ }
  const after = readFileSync(SA, 'utf8');
  const entry = (readFileSync('CHANGELOG.md', 'utf8').split(new RegExp(`^## ${now.replace(/\./g, '\\.')}\\b`, 'm'))[1] || '').split(/^## /m)[0];
  if (blockOf(before) !== blockOf(after)) {
    if (!/standing approvals/i.test(entry)) fail(`the standing-approvals block changed but the ${now} changelog entry does not say "standing approvals"`);
    const text = (blockOf(after).match(/\(kit text ([0-9.]+);/) || [])[1];
    if (text !== now) fail(`the standing-approvals block changed but its "kit text" is ${text || 'missing'}, not ${now}`);
  }
}
// the replay (K034): a change to the text every session loads, or to an adapter (A23 names the models),
// ships with a replay result for this version that re-grades and holds the floor
const LOADS = ['.harness/core.md', '.harness/owner-defaults.md'];
const rulesChanged = changed.filter((f) => LOADS.includes(f) || f.startsWith('.harness/adapters/'));
if (rulesChanged.length) {
  const res = `replay/results/${now}.json`;
  let out;
  try { out = execFileSync(process.execPath, ['tools/replay.mjs', 'check', res], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { fail(`${rulesChanged.join(', ')} changed, so ${res} must pass the replay check (replay/README.md): ${(e.stderr || e.message).trim()}`); }
  console.log(out.trim());
}
if (setChanged) {
  const entry = (readFileSync('CHANGELOG.md', 'utf8').split(new RegExp(`^## ${now.replace(/\./g, '\\.')}\\b`, 'm'))[1] || '').split(/^## /m)[0];
  if (!/replay set/i.test(entry)) fail(`replay/tasks.json changed but the ${now} changelog entry does not say "replay set"`);
}
console.log(`check-version: OK · ${changed.length} kit file(s) changed; ${was} → ${now}, untagged, in the changelog`);
