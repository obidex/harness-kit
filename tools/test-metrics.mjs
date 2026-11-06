#!/usr/bin/env node
// test-metrics — the agent metrics (K034, .harness/metrics.md) against a stand-in GitHub API.
//
//   node tools/test-metrics.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { reviewRounds, isAgent, hasMarker, measure, render } from '../.harness/tools/metrics.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-metrics: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-metrics: ok ${n}. ${what}`); };
const kit = new URL('..', import.meta.url).pathname;
const NOW = Date.parse('2026-11-07T00:00:00Z');
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
const D = 24;

// --- pure parts
const r = reviewRounds(['Round 1: 3 blocks (a, b, c).\n- Round 2: **2 blocks** (x).\nRound 3: VERIFIED FIXED, no blocks', 'Round 2 had 2 blocks', 'Round 1 had three blocks']);
ok(r.get(1) === 3 && r.get(2) === 2 && r.get(3) === 0 && r.size === 3, 'review rounds: digits, words, bold and "no blocks"; a round repeated in another text counts once');
ok(reviewRounds(['no review here', 'we blocked round trips']).size === 0, 'text without a round line records no review');
ok(isAgent({ performed_via_github_app: { slug: 'claude' } }, ['claude']) && isAgent({ body: '<!-- claude-projects-attribution: {} -->' }, ['claude']) && !isAgent({ body: 'hi' }, ['claude']), 'an agent item: made through the agent app, or carrying the attribution marker');
ok(hasMarker('x <!-- inbox -->') && !hasMarker('plain'), 'a hidden marker marks a tool write');

// --- a stand-in GitHub
const issues = [
  { number: 1, title: 'Feature', user: { login: 'own' }, performed_via_github_app: { slug: 'claude' }, created_at: ago(60), updated_at: ago(40), pull_request: { merged_at: ago(48) }, body: 'x' },
  { number: 2, title: 'Fix', user: { login: 'own' }, created_at: ago(30), updated_at: ago(20), pull_request: { merged_at: ago(24) }, body: '<!-- claude-projects-attribution: {"github_login":"own"} -->\nbody' },
  { number: 3, title: 'Bump x', user: { login: 'dependabot[bot]' }, created_at: ago(50), updated_at: ago(30), pull_request: { merged_at: ago(30) }, body: 'bump' },
  { number: 4, title: 'Revert "Feature"', user: { login: 'own' }, created_at: ago(70), updated_at: ago(60), pull_request: { merged_at: ago(65) }, body: 'Reverts #1' },
  { number: 5, title: 'Old', user: { login: 'own' }, performed_via_github_app: { slug: 'claude' }, created_at: ago(300), updated_at: ago(10), pull_request: { merged_at: ago(10 * D) }, body: 'x' },
  { number: 6, title: 'Please fix', user: { login: 'own' }, created_at: ago(24), updated_at: ago(24), body: 'please fix' },
  { number: 7, title: 'Card', user: { login: 'own' }, performed_via_github_app: { slug: 'claude' }, created_at: ago(24), updated_at: ago(24), body: 'card' },
];
const open = [
  { number: 10, updated_at: ago(48), pull_request: {}, draft: false, labels: [] },
  { number: 11, updated_at: ago(48), pull_request: {}, draft: true, labels: [] },
  { number: 12, updated_at: ago(72), labels: [{ name: 'card' }] },
  { number: 13, updated_at: ago(72), labels: [{ name: 'bug' }] },
  { number: 14, updated_at: ago(1), labels: [{ name: 'risk:3' }] },
  { number: 15, updated_at: ago(30), labels: [{ name: 'inbox' }] },
];
const comments = [
  { user: { login: 'own' }, created_at: ago(24), body: 'ok, go' },
  { user: { login: 'own' }, performed_via_github_app: { slug: 'claude' }, created_at: ago(24), body: 'agent' },
  { user: { login: 'own' }, created_at: ago(24), body: '<!-- inbox state=queued -->\nwake' },
  { user: { login: 'someone' }, created_at: ago(24), body: 'hi' },
  { user: { login: 'own' }, created_at: ago(8 * D), body: 'old but edited' },
];
const events = [
  { event: 'reopened', created_at: ago(48), issue: { number: 6 } },
  { event: 'closed', created_at: ago(49), issue: { number: 6 } },
  { event: 'reopened', created_at: ago(9 * D), issue: { number: 9 } },
];
const pulls = {
  1: { body: 'Round 1: 2 blocks\nRound 2: no blocks', merge_commit_sha: 'm1', commits: ['a1', 'a2'], comments: [{ body: 'Round 2 had 1 block' }], reviews: [{ state: 'CHANGES_REQUESTED', body: 'see round 1' }] },
  2: { body: 'no review', merge_commit_sha: 'm2', commits: ['b1', 'b2'], comments: [], reviews: [{ state: 'CHANGES_REQUESTED', body: '' }, { state: 'APPROVED', body: '' }] },
};
const checks = { a1: [{ status: 'completed', conclusion: 'failure' }], a2: [{ status: 'completed', conclusion: 'success' }], b1: [], b2: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }, { status: 'in_progress', conclusion: null }] };
const runs = { m1: [{ status: 'completed', conclusion: 'failure' }], m2: [{ status: 'completed', conclusion: 'success' }] };
const seen = [];
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  seen.push({ path: u.pathname, auth: req.headers.authorization });
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const p = u.pathname;
  if (p.startsWith('/repos/o/bad/')) return send(500, { message: 'down' });
  if (u.searchParams.get('page') && u.searchParams.get('page') !== '1') return send(200, p.endsWith('/check-runs') ? { check_runs: [] } : []);
  if (p === '/repos/o/r/issues') return send(200, u.searchParams.get('state') === 'open' ? open : issues.filter((i) => Date.parse(i.updated_at) >= Date.parse(u.searchParams.get('since'))));
  if (p === '/repos/o/r/issues/comments') return send(200, comments);
  if (p === '/repos/o/r/issues/events') return send(200, events);
  let m;
  if ((m = p.match(/^\/repos\/o\/r\/pulls\/(\d+)$/))) return send(200, pulls[m[1]]);
  if ((m = p.match(/^\/repos\/o\/r\/pulls\/(\d+)\/commits$/))) return send(200, pulls[m[1]].commits.map((sha) => ({ sha })));
  if ((m = p.match(/^\/repos\/o\/r\/issues\/(\d+)\/comments$/))) return send(200, pulls[m[1]].comments);
  if ((m = p.match(/^\/repos\/o\/r\/pulls\/(\d+)\/reviews$/))) return send(200, pulls[m[1]].reviews);
  if ((m = p.match(/^\/repos\/o\/r\/commits\/(\w+)\/check-runs$/))) return send(200, { check_runs: checks[m[1]] });
  if (p === '/repos/o/r/actions/runs') return send(200, { workflow_runs: runs[u.searchParams.get('head_sha')] || [] });
  send(404, { message: 'no route' });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
process.env.GITHUB_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.GH_TOKEN = 'T';

const m = await measure('o/r', { now: NOW, days: 7, owner: 'own' });
ok(m.errors.length === 0 && m.partial.length === 0, 'a readable repository has no errors and no partial listings');
ok(m.agentPrsMerged === 2, 'agent PRs merged: the app-made and the marked PR; not the bot, the person\'s revert, or a merge before the window');
ok(m.firstPass.measured === 2 && m.firstPass.green === 1 && m.firstPass.rate === 0.5, 'first pass: #1 red on its first commit (green later does not count); #2 judged on its first commit with finished checks');
ok(m.reviewBlocks.reviewedPrs === 2 && m.reviewBlocks.blocks === 4 && m.reviewBlocks.perReviewedPr === 2, 'review blocks: round lines from body and comments (2 + 1), a changes-requested review not counted again; a PR with no round line counts its changes-requested review (1)');
ok(m.falseDone.total === 3 && m.falseDone.mainRed.join() === '1' && m.falseDone.reverted.join() === '4' && m.falseDone.reopened.join() === '6', 'false DONEs: main red at the merge commit, a merged revert, an issue reopened in the window (not one reopened before it)');
ok(m.stalls.count === 3 && m.stalls.items.join() === '10,12,15', 'stalls: idle non-draft PRs and card/inbox/risk issues over 24 h; not drafts, other labels or fresh items');
ok(m.ownerTouches.count === 3 && m.ownerTouches.perWeek === 3, 'owner touches: the revert PR, the issue and the plain comment; not app-made, marked, other people\'s or older writes');
ok(seen.every((s) => s.auth === 'Bearer T'), 'every read carries the token');

const noOwner = await measure('o/r', { now: NOW, days: 7 });
ok(noOwner.ownerTouches === null && noOwner.errors.some((e) => /no --owner/.test(e)), 'without --owner, owner touches are "?" with the reason, never a zero');
const bad = await measure('o/bad', { now: NOW, days: 7 });
ok(bad.agentPrsMerged === null && bad.firstPass === null && bad.falseDone === null && bad.stalls === null && bad.ownerTouches === null && bad.errors.length >= 3, 'an unreadable repository gives null metrics with errors, never zeros');
const md = render([m, bad]);
ok(/\| o\/r \| 2 \| 50% \(1\/2\) \| 2 \(4 in 2\) \| 3 \| 3 \| 3 \|/.test(md), 'Markdown: one row of counts per repository');
ok(/\| o\/bad \| \? \| \? \| \? \| \? \| \? \| \? \|/.test(md) && /o\/bad: issues: GET \/repos\/o\/bad\/issues: HTTP 500/.test(md), 'Markdown: "?" for what could not be read, and why');
ok(!/Feature|Please fix|someone|ok, go/.test(md), 'Markdown for a public page carries no titles, bodies or other people\'s names');

// the CLI: exit 0 with something read, 1 with nothing
const cli = (...a) => new Promise((ok) => { const c = spawn(process.execPath, [join(kit, '.harness/tools/metrics.mjs'), ...a], { env: process.env }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', (code) => ok({ code, out })); });
let res = await cli('--repo', 'o/r', '--repo', 'o/bad', '--owner', 'own', '--now', '2026-11-07T00:00:00Z');
ok(res.code === 0 && /\| o\/r \| 2 \|/.test(res.out), 'CLI: a page with one readable repository exits 0');
res = await cli('--repo', 'o/bad', '--now', '2026-11-07T00:00:00Z');
ok(res.code === 1, 'CLI: nothing readable exits 1');
res = await cli('--repo', 'o/r', '--json', '--owner', 'own', '--now', '2026-11-07T00:00:00Z');
ok(res.code === 0 && JSON.parse(res.out)[0].firstPass.green === 1, 'CLI: --json gives the full detail');
res = await cli('--repo', 'not a repo');
ok(res.code === 2, 'CLI: a malformed repository name is refused');

server.close();
console.log(`test-metrics: OK · ${n} cases`);
