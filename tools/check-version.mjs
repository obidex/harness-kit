#!/usr/bin/env node
// check-version — a pull request that changes kit content ships it as a new, untagged version.
//
//   node tools/check-version.mjs <base ref>      exit 0 = fine, 1 = bump or changelog missing
//
// Kit content is .harness/** (what projects install). If it changed against the base, VERSION must
// be higher than the base's, no tag v<VERSION> may exist yet (tags are immutable, K003), and
// CHANGELOG.md must have a "## <VERSION>" entry.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'origin/main';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const fail = (m) => { console.log(`check-version: FAIL ${m}`); process.exit(1); };

const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter((f) => f.startsWith('.harness/'));
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
console.log(`check-version: OK · ${changed.length} kit file(s) changed; ${was} → ${now}, untagged, in the changelog`);
