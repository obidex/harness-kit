#!/usr/bin/env node
// test-stale — the C15 stale-work check, offline against a stand-in GitHub API and Telegram, plus the
// lane and bounds of every kit-installed workflow (O13, RJ01).
//
//   node tools/test-stale.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { checkState, classifyPr, classifyIssue, select, thresholds, render, readMarkers, signature, decide, message, report, DEFAULTS, MAX_LISTED, MARKER } from '../.harness/tools/stale.mjs';
import { body as inboxBody, setField } from '../.harness/tools/inbox.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-stale: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-stale: ok ${n}. ${what}`); };
const kit = new URL('..', import.meta.url).pathname;
const DAY = 86400000;
const NOW = Date.parse('2026-10-05T06:41:00Z');
const ago = (d) => new Date(NOW - d * DAY - 60000).toISOString();

// --- classification -------------------------------------------------------------------------------
const run = (conclusion, status = 'completed') => ({ status, conclusion });
ok(checkState([run('success'), run('skipped')]) === 'green' && checkState([run('success'), run('failure')]) === 'red'
  && checkState([run(null, 'in_progress')]) === 'pending' && checkState([], { state: 'pending', total_count: 0 }) === 'none'
  && checkState([run('success')], { state: 'error', total_count: 1 }) === 'red', 'checks read as green, red, pending or none (check runs and commit statuses)');
ok(classifyPr({ draft: true, mergeable: false }, 'red') === 'draft' && classifyPr({ mergeable: false }, 'green') === 'conflicted'
  && classifyPr({ mergeable_state: 'dirty' }, 'green') === 'conflicted' && classifyPr({ mergeable: true }, 'red') === 'red'
  && classifyPr({ mergeable: true }, 'green') === 'green-unmerged' && classifyPr({ mergeable: null }, 'none') === 'waiting', 'a PR is draft, conflicted, red, green-unmerged or waiting, in that order');
const req = inboxBody({ id: 'x/1', source: 's', outcome: 'o', coordinator: 'c', coveredBy: 'K009' });
ok(classifyIssue({ labels: [{ name: 'inbox' }], body: req }) === 'inbox queued' && classifyIssue({ labels: ['inbox'], body: setField(req, 'State', 'working') }) === 'inbox working'
  && classifyIssue({ labels: [{ name: 'inbox' }], body: setField(req, 'State', 'blocked') }) === null && classifyIssue({ labels: [{ name: 'card' }] }) === 'card'
  && classifyIssue({ labels: [{ name: 'risk:high' }] }) === 'risk' && classifyIssue({ labels: [{ name: 'bug' }] }) === null
  && classifyIssue({ labels: [{ name: 'card' }], body: `${MARKER}\nlist` }) === null, 'issues: inbox queued or working, card, risk:*; never blocked requests, other labels or the tracking issue itself');

// --- thresholds -----------------------------------------------------------------------------------
const cands = [
  { number: 1, url: 'u1', title: 'green one', kind: 'green-unmerged', updatedAt: ago(2) },
  { number: 2, url: 'u2', title: 'fresh green', kind: 'green-unmerged', updatedAt: ago(1) },
  { number: 3, url: 'u3', title: 'conflict', kind: 'conflicted', updatedAt: ago(1) },
  { number: 4, url: 'u4', title: 'fresh conflict', kind: 'conflicted', updatedAt: ago(0) },
  { number: 5, url: 'u5', title: 'request', kind: 'inbox queued', updatedAt: ago(1) },
  { number: 6, url: 'u6', title: 'card', kind: 'card', updatedAt: ago(2) },
  { number: 7, url: 'u7', title: 'risk', kind: 'risk', updatedAt: ago(5) },
  { number: 8, url: 'u8', title: 'plain issue', kind: null, updatedAt: ago(30) },
  { number: 9, url: 'u9', title: 'Bump x from 1 to 2', kind: 'red', updatedAt: ago(9) },
];
const picked = select(cands, NOW, DEFAULTS);
ok(signature(picked) === '1,3,5,7,9', `defaults: PRs 2 days, conflicted 1, inbox 1, card/risk 3; a bot PR counts (${signature(picked)})`);
ok(picked[0].number === 9 && picked[0].days === 9 && picked.at(-1).days === 1, 'longest idle first, with whole days idle');
const t = thresholds({ HARNESS_STALE_PR_DAYS: '1', HARNESS_STALE_CARD_DAYS: '2', HARNESS_STALE_INBOX_DAYS: '' });
ok(t.prDays === 1 && t.cardDays === 2 && t.inboxDays === 1 && t.conflictDays === 1 && signature(select(cands, NOW, t)) === '1,2,3,5,6,7,9', 'each threshold is overridable by env; an empty value keeps the default');
let threw = false;
try { thresholds({ HARNESS_STALE_PR_DAYS: 'two' }); } catch { threw = true; }
ok(threw, 'a threshold that is not a number is refused');

// --- body, signature, caps ------------------------------------------------------------------------
const b = render(picked, { announced: [9, 1], sent: '2026-10-04' });
const back = readMarkers(b);
ok(b.startsWith(MARKER) && back.sent === '2026-10-04' && signature(back.announced) === '1,9' && b.includes('| [#9](u9) Bump x from 1 to 2 | red | 9 |'), 'the body round-trips: marker first, the list, the announced set and the last alert date');
ok(readMarkers(render([], {})).sent === '' && readMarkers(render([], {})).announced.length === 0 && readMarkers('no markers').sent === '', 'an empty list and a foreign body read as never alerted, nothing announced');
ok(render([{ number: 1, url: 'u', title: 'a | b @someone [x]', kind: 'card', days: 3 }]).includes('a \\| b @​someone \\[x\\]'), 'titles cannot break the table or mention anyone');
const today = '2026-10-05';
let d = decide(picked, { announced: [1, 3, 5, 7, 9], sent: '2026-10-01' }, today, true);
ok(!d.send && d.fresh.length === 0, 'no alert when every item was announced before');
d = decide(picked, { announced: [1, 3], sent: '2026-10-04' }, today, true);
ok(d.send && signature(d.fresh) === '5,7,9' && signature(d.announced) === '1,3,5,7,9', 'new stale items alert, and the whole list becomes announced');
d = decide(picked, { announced: [1, 3], sent: today }, today, true);
ok(!d.send && signature(d.announced) === '1,3', 'at most one alert a day: a capped alert keeps its new items unannounced for tomorrow');
d = decide(picked, { announced: [], sent: '' }, today, false);
ok(!d.send && signature(d.announced) === '1,3,5,7,9', 'without the Telegram secrets no alert is attempted');
ok(!decide([], { announced: [1], sent: '' }, today, true).send, 'never an alert for an empty list');
const many = Array.from({ length: 14 }, (_, i) => ({ number: i + 1, url: `u${i}`, title: `t${i}`, kind: 'red', days: 3 }));
const msg = message('o/r', many, many.slice(12), 'https://gh.test/o/r/issues/99');
ok(msg.split('\n').filter((l) => l.startsWith('- ')).length === MAX_LISTED && msg.includes('and 4 more') && msg.split('\n')[1].startsWith('- #13') && msg.endsWith('/issues/99'), 'an alert lists at most 10 items, new ones first, then "and N more" and the issue link');

// --- report end to end: one tracking issue, in place, closed when empty ------------------------------
const issues = [];
const pulls = [];
const tg = [];
let tgFail = false;
const srv = createServer((q, res) => {
  let data = '';
  q.on('data', (c) => { data += c; });
  q.on('end', () => {
    const u = new URL(q.url, 'http://x');
    const send = (code, j) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (u.pathname === '/botTOKEN/sendMessage') { if (tgFail) return send(500, { ok: false }); tg.push(JSON.parse(data)); return send(200, { ok: true }); }
    if (u.pathname === '/repos/o/r/pulls') return send(200, u.searchParams.get('page') === '1' ? pulls.map((p) => p.list) : []);
    let m = u.pathname.match(/^\/repos\/o\/r\/pulls\/(\d+)$/);
    if (m) return send(200, pulls.find((p) => p.list.number === Number(m[1])).full);
    m = u.pathname.match(/^\/repos\/o\/r\/commits\/(\w+)\/(check-runs|status)$/);
    if (m) { const p = pulls.find((x) => x.full.head.sha === m[1]); return send(200, m[2] === 'status' ? { state: 'pending', total_count: 0 } : { check_runs: p.runs }); }
    if (u.pathname === '/repos/o/r/issues' && q.method === 'GET') return send(200, u.searchParams.get('page') === '1' ? issues.filter((i) => i.state === u.searchParams.get('state')) : []);
    if (u.pathname === '/repos/o/r/issues' && q.method === 'POST') { const j = JSON.parse(data); const i = { number: 100 + issues.length, state: 'open', html_url: `https://gh.test/o/r/issues/${100 + issues.length}`, labels: [], updated_at: new Date(NOW).toISOString(), ...j }; issues.push(i); return send(201, i); }
    m = u.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)$/);
    const i = m && issues.find((x) => x.number === Number(m[1]));
    if (!i) return send(404, {});
    if (q.method === 'PATCH') { i.patches = (i.patches || 0) + 1; Object.assign(i, JSON.parse(data)); }
    return send(200, i);
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
Object.assign(process.env, { GITHUB_API_URL: base, GH_TOKEN: 't', HARNESS_TELEGRAM_API: base, TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' });
for (const k of ['HARNESS_STALE_PR_DAYS', 'HARNESS_STALE_CONFLICT_DAYS', 'HARNESS_STALE_INBOX_DAYS', 'HARNESS_STALE_CARD_DAYS']) delete process.env[k];
const pr = (number, days, full, runs) => ({ list: { number, title: `PR ${number}`, html_url: `https://gh.test/o/r/pull/${number}`, updated_at: ago(days) }, full: { number, head: { sha: `sha${number}` }, ...full }, runs });
pulls.push(pr(1, 3, { mergeable: true }, [run('success')]), pr(2, 0, { mergeable: false }, []), pr(3, 1, { mergeable: false }, []));
issues.push({ number: 10, state: 'open', html_url: 'https://gh.test/o/r/issues/10', title: 'a card', labels: [{ name: 'card' }], body: '', updated_at: ago(4) });
const tracking = () => issues.filter((i) => String(i.body).includes(MARKER));

let r = await report('o/r', NOW);
ok(signature(r.items) === '1,3,10' && tracking().length === 1 && tracking()[0].title === 'Stale work' && !r.sent && tg.length === 0, 'report files one "Stale work" issue; without the secrets it sends nothing and still updates');
const first = tracking()[0];
ok(first.body.includes('| green-unmerged | 3 |') && first.body.includes('| conflicted | 1 |') && signature(readMarkers(first.body).announced) === '1,3,10', 'the issue lists each item with its kind and days idle');
Object.assign(process.env, { TELEGRAM_BOT_TOKEN: 'TOKEN', TELEGRAM_CHAT_ID: '42' });
r = await report('o/r', NOW);
ok(tracking().length === 1 && !r.sent && tg.length === 0, 'a second run edits the same issue and stays silent: nothing new');
issues.push({ number: 11, state: 'open', html_url: 'https://gh.test/o/r/issues/11', title: 'a risk', labels: [{ name: 'risk:data' }], body: '', updated_at: ago(3) });
tgFail = true;
let failed = '';
try { await report('o/r', NOW); } catch (e) { failed = e.message; }
ok(/Telegram did not accept/.test(failed) && !failed.includes('TOKEN') && readMarkers(tracking()[0].body).sent === '' && !readMarkers(tracking()[0].body).announced.includes(11), 'a failed alert fails the run without the token in the error, and stays unannounced for the next run');
tgFail = false;
r = await report('o/r', NOW);
ok(r.sent && tg.length === 1 && tg[0].chat_id === '42' && /1 new/.test(tg[0].text) && tg[0].text.includes('#11 risk') && tg[0].text.endsWith(first.html_url) && readMarkers(tracking()[0].body).sent === '2026-10-05', 'a newly stale item sends one alert linking the issue, and records the date');
issues.push({ number: 12, state: 'open', html_url: 'https://gh.test/o/r/issues/12', title: 'another card', labels: [{ name: 'card' }], body: '', updated_at: ago(6) });
r = await report('o/r', NOW + 3600000);
ok(!r.sent && tg.length === 1 && !readMarkers(tracking()[0].body).announced.includes(12), 'a second new item the same day waits: one alert a day per repository');
r = await report('o/r', NOW + DAY);
ok(r.sent && tg.length === 2 && /#12 card, \d+d \(new\)/.test(tg[1].text), 'the next day it goes out (with whatever else became stale overnight)');
pulls.length = 0; issues.splice(0, issues.length, ...tracking());
r = await report('o/r', NOW + 2 * DAY);
ok(tracking().length === 1 && tracking()[0].state === 'closed' && /Nothing is stale/.test(tracking()[0].body) && tg.length === 2, 'an empty list closes the issue, with no alert');
const patches = tracking()[0].patches;
await report('o/r', NOW + 2 * DAY);
ok(tracking()[0].patches === patches, 'an empty list with the issue already closed touches nothing');
issues.push({ number: 13, state: 'open', html_url: 'https://gh.test/o/r/issues/13', title: 'card again', labels: [{ name: 'card' }], body: '', updated_at: ago(10) });
r = await report('o/r', NOW + 3 * DAY);
ok(tracking().length === 1 && tracking()[0].state === 'open' && tracking()[0].number === first.number && r.sent && tg.length === 3, 'a new stale item reopens the same issue, never a second one');
srv.close();

// --- every kit-installed workflow: the RUNNER lane, bounded, and safe on a self-hosted runner ---------
const dir = join(kit, '.harness/templates/workflows');
for (const f of readdirSync(dir)) {
  const text = readFileSync(join(dir, f), 'utf8');
  const wf = parseYaml(text);
  const jobs = Object.entries(wf.jobs || {});
  ok(jobs.length && jobs.every(([, j]) => String(j['runs-on']).includes("vars.RUNNER || 'ubuntu-latest'") && Number(j['timeout-minutes']) > 0), `${f}: every job runs on \${{ vars.RUNNER || 'ubuntu-latest' }} and declares timeout-minutes`);
  const prCode = text.includes('pull_request:') && /uses: actions\/checkout@v4\n(?!\s+with:\n(\s+\w[\w-]*:.*\n)*?\s+ref: \$\{\{ github\.event\.repository\.default_branch \}\})/.test(text);
  if (prCode) ok(jobs.every(([, j]) => /^\$\{\{ github\.event\.pull_request\.head\.repo\.fork && 'ubuntu-latest' \|\|/.test(j['runs-on'])), `${f}: it runs a PR's code, so a fork's PR never reaches the self-hosted runner`);
  else ok(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n\s+sparse-checkout: \.harness\/tools\n\s+persist-credentials: false/.test(text), `${f}: checks out only the default branch's .harness/tools, without persisted credentials`);
  ok(/persist-credentials: false/.test(text), `${f}: no persisted git credentials`);
}
const st = parseYaml(readFileSync(join(dir, 'harness-stale.yml'), 'utf8'));
ok(st.on.schedule.length === 1 && /^\d+ \d+ \* \* \*$/.test(st.on.schedule[0].cron) && 'workflow_dispatch' in st.on && Object.keys(st.on).length === 2, `harness-stale runs once a day (${st.on.schedule[0].cron}) and on dispatch, nothing else`);
ok(st.jobs.stale.permissions.issues === 'write' && Object.entries(st.jobs.stale.permissions).every(([k, v]) => k === 'issues' || v === 'read') && Number(st.jobs.stale['timeout-minutes']) <= 3, 'its one job writes only issues and is short');

// --- the audit counts the installed workflow for C15 ---------------------------------------------------
const proj = mkdtempSync(join(tmpdir(), 'harness-stale-'));
mkdirSync(join(proj, '.github/workflows'), { recursive: true });
mkdirSync(join(proj, '.harness/tools'), { recursive: true });
copyFileSync(join(dir, 'harness-stale.yml'), join(proj, '.github/workflows/harness-stale.yml'));
copyFileSync(join(kit, '.harness/tools/stale.mjs'), join(proj, '.harness/tools/stale.mjs'));
writeFileSync(join(proj, 'README.md'), 'x\n');
const profile = JSON.parse(readFileSync(join(kit, 'examples/profile.example.json'), 'utf8'));
profile.capabilities = [...new Set([...(profile.capabilities || []), 'recurring-jobs'])];
writeFileSync(join(proj, '.harness/profile.json'), JSON.stringify(profile, null, 2));
const g = (...a) => spawnSync('git', ['-C', proj, ...a], { encoding: 'utf8' });
g('init', '-q', '-b', 'main'); g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');
spawnSync('node', [join(kit, '.harness/tools/audit.mjs'), proj, '--json', join(proj, 'a.json')], { encoding: 'utf8' });
const audit = JSON.parse(readFileSync(join(proj, 'a.json'), 'utf8')).results;
const res = (id) => audit.find((x) => x.id === id);
ok(res('C15').result === 'PASS' && res('RJ02').result === 'PASS', `audit: C15 ${res('C15').result} (${res('C15').detail || res('C15').evidence || ''}), RJ02 ${res('RJ02').result}`);
rmSync(proj, { recursive: true, force: true });

console.log(`test-stale: OK · ${n} checks`);
