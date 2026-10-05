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
import { parseCron, nextRun, scheduleState, overdueHours, schedules, alertSchedules, missedText, isTracking, checkState, classifyPr, classifyIssue, select, thresholds, render, readMarkers, signature, freshItems, message, topicOf, profileTopic, report, DEFAULTS, MAX_LISTED, MARKER } from '../.harness/tools/stale.mjs';
import { body as inboxBody, setField } from '../.harness/tools/inbox.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-stale: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-stale: ok ${n}. ${what}`); };
const kit = new URL('..', import.meta.url).pathname;
const DAY = 86400000;
const NOW = Date.parse('2026-10-05T06:41:00Z');
const ago = (d) => new Date(NOW - d * DAY - 60000).toISOString();

// A GitHub Actions expression `${{ … }}` evaluated the way Actions does for this subset: property
// paths (null-safe), '…' strings, ==, !=, &&, || and parentheses; && and || return an operand.
function evalExpr(text, ctx) {
  const m = String(text).match(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/);
  if (!m) return text;
  const toks = m[1].match(/'(?:[^']|'')*'|==|!=|&&|\|\||\(|\)|[A-Za-z_][\w.-]*/g);
  let i = 0;
  const peek = () => toks[i];
  const prim = () => {
    const t = toks[i++];
    if (t === '(') { const v = or(); i++; return v; }
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    return t.split('.').reduce((o, k) => (o == null ? null : o[k] ?? null), ctx);
  };
  const eq = () => { let a = prim(); while (peek() === '==' || peek() === '!=') { const op = toks[i++]; const b = prim(); const same = String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase() && (a == null) === (b == null); a = op === '==' ? same : !same; } return a; };
  const and = () => { let a = eq(); while (peek() === '&&') { i++; const b = eq(); a = a ? b : a; } return a; };
  const or = () => { let a = and(); while (peek() === '||') { i++; const b = and(); a = a || b; } return a; };
  return or();
}

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

// --- body, signature, the alert text ---------------------------------------------------------------
const b = render(picked, { announced: [9, 1] });
const back = readMarkers(b);
ok(b.startsWith(MARKER) && signature(back.announced) === '1,9' && b.includes('| [#9](u9) Bump x from 1 to 2 | red | 9 |'), 'the body round-trips: marker first, the list, the announced set');
ok(readMarkers(render([], {})).announced.length === 0 && readMarkers('no markers').announced.length === 0, 'an empty list and a foreign body read as nothing announced');
ok(render([{ number: 1, url: 'u', title: 'a | b @someone [x]', kind: 'card', days: 3 }]).includes('a \\| b @​someone \\[x\\]'), 'titles cannot break the table or mention anyone');
ok(freshItems(picked, [1, 3, 5, 7, 9]).length === 0 && signature(freshItems(picked, [1, 3])) === '5,7,9' && freshItems([], [1]).length === 0, 'new items are those not announced before; an empty list has none');
const many = Array.from({ length: 14 }, (_, i) => ({ number: i + 1, url: `u${i}`, title: `t${i}`, kind: 'red', days: 3 }));
const msg = message('o/r', many, many.slice(12));
ok((msg.match(/#\d+ red/g) || []).length === MAX_LISTED && msg.includes('and 4 more') && /: #13 red 3d \(new\), #14/.test(msg) && !msg.includes('\n'), 'the problem text lists at most 10 items, new ones first, then "and N more", on one line');
ok(topicOf('website') === 'website' && topicOf('erp') === 'erp' && topicOf('needs') === null && topicOf('daily') === null && topicOf('nope') === null && topicOf('') === null, "ALERTS_TOPIC names one of notify.mjs's project topics; never Needs you or Daily");
{
  const d = mkdtempSync(join(tmpdir(), 'stale-topic-'));
  writeFileSync(join(d, 'p.json'), JSON.stringify({ alerts: { topic: 'website' } }));
  writeFileSync(join(d, 'bad.json'), '{');
  ok(profileTopic(join(d, 'p.json')) === 'website' && profileTopic(join(d, 'bad.json')) === '' && profileTopic(join(d, 'none.json')) === '' && topicOf(profileTopic(join(d, 'p.json'))) === 'website', "the profile's alerts.topic names the topic; a missing or broken profile names none");
  rmSync(d, { recursive: true, force: true });
}
ok(!/api\.telegram\.org|sendMessage/.test(readFileSync(join(kit, '.harness/tools/stale.mjs'), 'utf8')), 'stale.mjs never talks to Telegram itself: every alert goes through notify.mjs (O10)');

// --- report end to end: one tracking issue, in place, closed when empty; alerts through notify.mjs ----
const issues = [];
const pulls = [];
const tg = [];
const wfs = [];
let tgFail = false, nextIssue = 100, nextMsg = 1;
const srv = createServer((q, res) => {
  let data = '';
  q.on('data', (c) => { data += c; });
  q.on('end', () => {
    const u = new URL(q.url, 'http://x');
    const send = (code, j) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (u.pathname === '/botTOKEN/sendMessage') { if (tgFail) return send(500, { ok: false, description: 'down' }); const m = { ...JSON.parse(data), message_id: nextMsg++ }; tg.push(m); return send(200, { ok: true, result: m }); }
    if (u.pathname === '/repos/o/r/actions/workflows') return send(200, { workflows: wfs.map((w) => w.meta) });
    let w = u.pathname.match(/^\/repos\/o\/r\/actions\/workflows\/(\d+)\/runs$/);
    if (w) { const x = wfs.find((y) => y.meta.id === Number(w[1])); return send(200, { workflow_runs: x.runs.filter((r) => r.event === u.searchParams.get('event')).slice(0, Number(u.searchParams.get('per_page')) || 30) }); }
    w = u.pathname.match(/^\/repos\/o\/r\/contents\/(.+)$/);
    if (w) { const x = wfs.find((y) => y.meta.path === w[1]); return x ? send(200, { content: Buffer.from(x.text).toString('base64'), encoding: 'base64' }) : send(404, {}); }
    if (u.pathname === '/repos/o/r/pulls') return send(200, u.searchParams.get('page') === '1' ? pulls.map((p) => p.list) : []);
    let m = u.pathname.match(/^\/repos\/o\/r\/pulls\/(\d+)$/);
    if (m) return send(200, pulls.find((p) => p.list.number === Number(m[1])).full);
    m = u.pathname.match(/^\/repos\/o\/r\/commits\/(\w+)\/(check-runs|status)$/);
    if (m) { const p = pulls.find((x) => x.full.head.sha === m[1]); return send(200, m[2] === 'status' ? { state: 'pending', total_count: 0 } : { check_runs: p.runs }); }
    if (u.pathname === '/repos/o/r/issues' && q.method === 'GET') return send(200, u.searchParams.get('page') === '1' ? issues.filter((i) => i.state === u.searchParams.get('state')) : []);
    if (u.pathname === '/repos/o/r/issues' && q.method === 'POST') { const j = JSON.parse(data); const n2 = nextIssue++; const i = { number: n2, state: 'open', html_url: `https://gh.test/o/r/issues/${n2}`, labels: [], updated_at: new Date(NOW).toISOString(), user: { login: 'github-actions[bot]', type: 'Bot' }, comments: [], ...j }; issues.push(i); return send(201, i); }
    m = u.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)(\/comments)?$/);
    const i = m && issues.find((x) => x.number === Number(m[1]));
    if (!i) return send(404, {});
    if (m[2]) { (i.comments ||= []).push(JSON.parse(data).body); return send(201, {}); }
    if (q.method === 'PATCH') { i.patches = (i.patches || 0) + 1; Object.assign(i, JSON.parse(data)); }
    return send(200, i);
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
Object.assign(process.env, { GITHUB_API_URL: base, GH_TOKEN: 't', ALERTS_API: base, ALERTS_STORE: 'github:o/r', ALERTS_TOPICS: '{"needs":1,"website":5}', ALERTS_NOW: new Date(NOW).toISOString() });
for (const k of ['HARNESS_STALE_PR_DAYS', 'HARNESS_STALE_CONFLICT_DAYS', 'HARNESS_STALE_INBOX_DAYS', 'HARNESS_STALE_CARD_DAYS', 'ALERTS_TOPIC', 'ALERTS_BOT_TOKEN', 'ALERTS_CHAT_ID', 'ALERTS_CHAT_ID_FILE', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERTS_REQUIRE_SEND']) delete process.env[k];
const pr = (number, days, full, runs) => ({ list: { number, title: `PR ${number}`, html_url: `https://gh.test/o/r/pull/${number}`, updated_at: ago(days) }, full: { number, head: { sha: `sha${number}` }, ...full }, runs });
pulls.push(pr(1, 3, { mergeable: true }, [run('success')]), pr(2, 0, { mergeable: false }, []), pr(3, 1, { mergeable: false }, []));
issues.push({ number: 10, state: 'open', html_url: 'https://gh.test/o/r/issues/10', title: 'a card', labels: [{ name: 'card' }], body: '', updated_at: ago(4) });
// someone plants marker issues claiming everything was announced: they must not count
issues.push({ number: 50, state: 'open', html_url: 'https://gh.test/o/r/issues/50', title: 'Stale work', labels: [], updated_at: ago(0), user: { login: 'mallory', type: 'User' }, body: render([], { announced: [1, 2, 3, 10, 11, 12, 13] }) });
issues.push({ number: 51, state: 'open', html_url: 'https://gh.test/o/r/issues/51', title: 'Stale work', labels: [], updated_at: ago(0), user: { login: 'github-actions', type: 'User' }, body: render([], { announced: [1, 2, 3, 10, 11, 12, 13] }) });
const tracking = () => issues.filter((i) => String(i.body).includes(MARKER) && i.user.type === 'Bot');
const alertIssues = () => issues.filter((i) => String(i.body).includes('<!-- harness-alert:'));
const add = (number, label, days) => issues.push({ number, state: 'open', html_url: `https://gh.test/o/r/issues/${number}`, title: `issue ${number}`, labels: [{ name: label }], body: '', updated_at: ago(days) });

ok(!isTracking(issues[1]) && !isTracking(issues[2]) && isTracking({ body: MARKER, user: { login: 'github-actions[bot]', type: 'Bot' } }), 'only an issue filed by github-actions[bot] can be the tracking issue; a planted marker issue never counts');
let r = await report('o/r', NOW);
ok(signature(r.items) === '1,3,10' && tracking().length === 1 && tracking()[0].title === 'Stale work' && r.alert === 'no topic' && alertIssues().length === 0 && readMarkers(tracking()[0].body).announced.length === 0, 'report files one "Stale work" issue; with no ALERTS_TOPIC it alerts nobody and announces nothing yet');
const first = tracking()[0];
ok(first.body.includes('| green-unmerged | 3 |') && first.body.includes('| conflicted | 1 |'), 'the issue lists each item with its kind and days idle');
process.env.ALERTS_TOPIC = 'website';
r = await report('o/r', NOW);
ok(r.alert === 'queued' && alertIssues().length === 1 && /"key":"stale:o\/r"/.test(alertIssues()[0].body) && /"topic":"website"/.test(alertIssues()[0].body) && alertIssues()[0].body.includes(first.html_url) && tg.length === 0 && tracking().length === 1,
  'with the topic but no ALERTS_BOT_TOKEN/ALERTS_CHAT_ID, notify.mjs records the problem stale:o/r as an issue for the next tick, linking "Stale work"');
Object.assign(process.env, { ALERTS_BOT_TOKEN: 'TOKEN', ALERTS_CHAT_ID: '42' });
r = await report('o/r', NOW);
ok(r.alert === 'nothing new' && tg.length === 0 && tracking().length === 1, 'a second run edits the same issue and asks nothing of notify.mjs: nothing new');
add(11, 'risk:data', 3);
r = await report('o/r', NOW);
ok(r.alert === 'repeat' && tg.length === 1 && tg[0].chat_id === '42' && tg[0].message_thread_id === 5 && tg[0].disable_notification === true && /^🔴 PROBLEM · Stale work in o\/r: 3 item\(s\), 3 new: #10 card/.test(tg[0].text) && tg[0].text.includes(first.html_url),
  'the next new item finds the problem queued and notify.mjs sends it to the project topic, silent, with the issue link');
add(12, 'card', 6);
r = await report('o/r', NOW + 3600000);
ok(r.alert === 'repeat' && tg.length === 1 && alertIssues()[0].comments.some((c) => c.includes(first.html_url)), 'while the problem is open, more new items send nothing more (notify.mjs deduplicates); its issue gets a comment');
pulls.length = 0; issues.splice(0, issues.length, ...issues.filter((i) => String(i.body).includes(MARKER) || String(i.body).includes('harness-alert')));
r = await report('o/r', NOW + 2 * DAY);
ok(tracking()[0].state === 'closed' && /Nothing is stale/.test(tracking()[0].body) && r.alert === 'resolved' && tg.length === 2 && tg[1].reply_parameters.message_id === tg[0].message_id && /RESOLVED/.test(tg[1].text) && alertIssues()[0].state === 'closed',
  'an empty list closes "Stale work" and resolves stale:o/r: RESOLVED is a reply to the problem\'s message');
const patches = tracking()[0].patches;
r = await report('o/r', NOW + 2 * DAY);
ok(tracking()[0].patches === patches && r.alert === 'none' && tg.length === 2, 'an empty list with everything closed touches nothing and sends nothing');
add(13, 'card', 10);
tgFail = true;
let failed = '';
try { await report('o/r', NOW + 3 * DAY); } catch (e) { failed = e.message; }
ok(/Telegram sendMessage: 500/.test(failed) && !failed.includes('TOKEN') && !readMarkers(tracking()[0].body).announced.includes(13) && tracking()[0].state === 'open' && tracking()[0].number === first.number,
  'a new item reopens the same issue; an undelivered alert fails the run without the token in the error and stays unannounced');
tgFail = false;
r = await report('o/r', NOW + 3 * DAY);
ok(r.alert === 'repeat' && tg.length === 3 && tg[2].text.includes('#13 card') && readMarkers(tracking()[0].body).announced.includes(13) && tracking().length === 1, 'the next run delivers it, never a second tracking issue');
// --- missed scheduled runs: cron, overdue by more than 36 h, PROBLEM then RESOLVED in the topic ------
const at = (iso) => Date.parse(iso);
ok(nextRun('17 5 * * *', at('2026-10-05T05:37:00Z')) === at('2026-10-06T05:17:00Z') && nextRun('41 6 * * 1', at('2026-10-05T05:37:00Z')) === at('2026-10-05T06:41:00Z')
  && nextRun('41 6 * * 1', at('2026-10-05T06:41:00Z')) === at('2026-10-12T06:41:00Z') && nextRun('23 5-19 * * *', at('2026-10-05T19:30:00Z')) === at('2026-10-06T05:23:00Z')
  && nextRun('*/15 * * * *', at('2026-10-05T05:37:00Z')) === at('2026-10-05T05:45:00Z') && nextRun('0 12 * JAN,jul *', at('2026-10-05T00:00:00Z')) === at('2027-01-01T12:00:00Z')
  && nextRun('0 0 1 * MON', at('2026-10-05T05:00:00Z')) === at('2026-10-12T00:00:00Z') && nextRun('0 0 * * 7', at('2026-10-05T05:00:00Z')) === at('2026-10-11T00:00:00Z'),
  'cron reads as GitHub does, in UTC: daily, weekly, hour ranges, steps, names, Sunday as 7, day-of-month OR day-of-week');
let bad = 0;
for (const c of ['17 5 * *', '61 * * * *', '* * * * 8', 'x * * * *', '5-1 * * * *', '*/0 * * * *']) { try { parseCron(c); } catch { bad++; } }
ok(bad === 6, 'a cron it cannot read is an error, never a silent pass');
const daily = (last, now) => scheduleState({ crons: ['17 5 * * *'], last, now: at(now), limit: 36 });
ok(!daily('2026-10-05T05:37:00Z', '2026-10-05T15:00:00Z').overdue && !daily('2026-10-04T05:37:00Z', '2026-10-06T17:16:00Z').overdue && daily('2026-10-04T05:37:00Z', '2026-10-06T17:18:00Z').overdue
  && daily('2026-10-04T05:37:00Z', '2026-10-06T17:18:00Z').lateHours === 36,
  'a daily schedule with one run since last night is fine; it counts as missed only once its next run is more than 36 h overdue');
ok(!scheduleState({ crons: ['41 6 * * 1'], last: '2026-10-04T22:00:00Z', now: at('2026-10-06T18:40:00Z') }).overdue && scheduleState({ crons: ['41 6 * * 1'], last: '2026-10-04T22:00:00Z', now: at('2026-10-06T18:42:00Z') }).overdue
  && scheduleState({ crons: ['0 0 * * *', '41 6 * * 1'], last: '2026-10-05T00:10:00Z', now: at('2026-10-06T18:42:00Z') }).overdue && !scheduleState({ crons: ['0 0 * * *'], last: '2026-10-05T00:10:00Z', now: at('2026-10-06T18:42:00Z') }).overdue,
  'a weekly schedule never run since it appeared is missed 36 h after its first due time; with two crons the earlier due time counts');
ok(overdueHours({}) === 36 && overdueHours({ HARNESS_SCHEDULE_OVERDUE_HOURS: '48' }) === 48 && (() => { try { overdueHours({ HARNESS_SCHEDULE_OVERDUE_HOURS: 'soon' }); return false; } catch { return true; } })(), 'the limit is 36 h unless HARNESS_SCHEDULE_OVERDUE_HOURS sets a number');

const wf = (id, file, crons, state = 'active') => ({ meta: { id, name: file.replace(/\.yml$/, ''), path: `.github/workflows/${file}`, state, created_at: '2026-10-01T00:00:00Z', html_url: `https://gh.test/o/r/blob/main/.github/workflows/${file}` },
  text: `name: ${file}\non:\n${crons.length ? `  schedule:\n${crons.map((c) => `    - cron: '${c}'`).join('\n')}\n` : ''}  workflow_dispatch:\njobs:\n  a:\n    runs-on: x\n`, runs: [] });
wfs.push(wf(1, 'hands-settings.yml', ['17 5 * * *']), wf(2, 'hands-update.yml', ['41 6 * * 1']), wf(3, 'hands-check.yml', []), wf(4, 'old.yml', ['0 * * * *'], 'disabled_manually'), wf(5, 'quiet.yml', ['0 3 * * *'], 'disabled_inactivity'));
wfs[0].runs = [{ event: 'schedule', created_at: '2026-10-05T05:37:00Z' }]; wfs[1].runs = [...Array.from({ length: 40 }, () => ({ event: 'push', created_at: '2026-10-06T12:00:00Z' })), { event: 'schedule', created_at: '2026-09-28T07:02:00Z' }]; wfs[4].runs = [{ event: 'schedule', created_at: '2026-10-05T03:20:00Z' }];
for (const k of ['ALERTS_BOT_TOKEN', 'ALERTS_CHAT_ID', 'ALERTS_TOPIC']) delete process.env[k];
Object.assign(process.env, { ALERTS_TOPICS: '{"needs":1,"website":5,"kit":6}' });
const T0 = at('2026-10-05T15:00:00Z');
let sch = await schedules('o/r', T0);
ok(sch.map((x) => x.file).join(',') === 'hands-settings.yml,hands-update.yml,quiet.yml' && sch.every((x) => !x.overdue) && sch[1].due === '2026-10-05T06:41:00.000Z',
  'schedules lists every scheduled workflow (never one without a schedule or one turned off by hand); a Monday run due this morning is not yet a fault');
let failedTopic = '';
try { await alertSchedules('o/r', T0, null); } catch (e) { failedTopic = e.message; }
ok(/no topic/.test(failedTopic), 'alerting with no topic is an error, never a silent pass');
Object.assign(process.env, { ALERTS_BOT_TOKEN: 'TOKEN', ALERTS_CHAT_ID: '42' });
const tgBefore = tg.length;
const T1 = at('2026-10-06T18:42:00Z'); // hands-update due 06:41 on the 5th, 36 h 1 min ago; quiet.yml due 03:00 on the 6th
sch = await alertSchedules('o/r', T1, 'kit');
const missed = tg.slice(tgBefore);
ok(sch.find((x) => x.file === 'hands-update.yml').alert === 'sent' && missed.length === 1 && missed[0].message_thread_id === 6 && missed[0].disable_notification === true
  && /^🔴 PROBLEM · Scheduled run missed: hands-update in o\/r was due 2026-10-05 06:41 UTC and is 36 h overdue/.test(missed[0].text) && missed[0].text.includes('actions/workflows/hands-update.yml')
  && alertIssues().some((i) => /"key":"schedule:o\/r\/hands-update.yml"/.test(i.body) && i.state === 'open'),
  'a schedule more than 36 h overdue (push runs neither count nor hide its last run) posts one PROBLEM in "Kit & Hands", silent, linking the workflow; its record is kept until it runs');
ok(sch.find((x) => x.file === 'hands-settings.yml').overdue === false && sch.find((x) => x.file === 'hands-settings.yml').alert === 'none', 'a schedule on time sends nothing');
ok(missedText('o/r', { workflow: 'quiet', state: 'disabled_inactivity', due: '2026-10-06T03:00:00.000Z', lateHours: 40, lastRun: null }).includes('turned its schedule off for inactivity'), 'a schedule GitHub turned off for inactivity says so');
sch = await alertSchedules('o/r', T1 + 3600000, 'kit');
ok(tg.length === tgBefore + 1 && sch.find((x) => x.file === 'hands-update.yml').alert === 'repeat', 'the next check while it is still missing sends nothing more (one open problem per key)');
wfs[1].runs = [{ event: 'workflow_dispatch', created_at: '2026-10-06T19:05:00Z' }, ...wfs[1].runs];
sch = await alertSchedules('o/r', at('2026-10-07T05:30:00Z'), 'kit');
const ranAgain = tg.slice(tgBefore + 1);
ok(sch.find((x) => x.file === 'hands-update.yml').alert === 'resolved' && ranAgain.length === 1 && ranAgain[0].reply_parameters.message_id === missed[0].message_id && /RESOLVED .*hands-update in o\/r ran again \(2026-10-06 19:05 UTC\)/.test(ranAgain[0].text)
  && !alertIssues().some((i) => /schedule:o\/r\/hands-update.yml/.test(i.body) && i.state === 'open'),
  'once it has run again (on schedule, or by hand from Actions), the next check replies RESOLVED to the PROBLEM and closes it');
for (const k of ['ALERTS_BOT_TOKEN', 'ALERTS_CHAT_ID']) delete process.env[k];
Object.assign(process.env, { ALERTS_TOPICS: '{"needs":1,"website":5}' });
srv.close();

// --- every kit-installed workflow: the RUNNER lane, bounded, and safe on a self-hosted runner ---------
const dir = join(kit, '.harness/templates/workflows');
for (const f of readdirSync(dir)) {
  const text = readFileSync(join(dir, f), 'utf8');
  const wf = parseYaml(text);
  const jobs = Object.entries(wf.jobs || {});
  ok(jobs.length && jobs.every(([, j]) => String(j['runs-on']).includes("vars.RUNNER || 'ubuntu-latest'") && Number(j['timeout-minutes']) > 0), `${f}: every job runs on \${{ vars.RUNNER || 'ubuntu-latest' }} and declares timeout-minutes`);
  const prCode = text.includes('pull_request:') && /uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n(?!\s+with:\n(\s+\w[\w-]*:.*\n)*?\s+ref: \$\{\{ github\.event\.repository\.default_branch \}\})/.test(text);
  if (prCode) {
    const lane = (ctx) => jobs.map(([, j]) => evalExpr(j['runs-on'], ctx));
    const pr = (head) => ({ event_name: 'pull_request', repository: 'o/r', event: { pull_request: { head: { repo: head } } } });
    const self = { RUNNER: 'self-hosted-vps' };
    ok(lane({ github: pr({ full_name: 'o/r', fork: false }), vars: self }).every((x) => x === 'self-hosted-vps')
      && lane({ github: { event_name: 'schedule', repository: 'o/r', event: {} }, vars: self }).every((x) => x === 'self-hosted-vps')
      && lane({ github: pr({ full_name: 'o/r' }), vars: {} }).every((x) => x === 'ubuntu-latest'), `${f}: a PR from this repository and a scheduled run take the RUNNER lane; without RUNNER, ubuntu-latest`);
    ok(lane({ github: pr({ full_name: 'fork/r', fork: true }), vars: self }).every((x) => x === 'ubuntu-latest')
      && lane({ github: pr(null), vars: self }).every((x) => x === 'ubuntu-latest')
      && lane({ github: pr({ full_name: 'fork/r', fork: null }), vars: self }).every((x) => x === 'ubuntu-latest'), `${f}: it runs a PR's code, so a fork's PR, or one whose fork was deleted (head.repo null), never reaches the self-hosted runner`);
  }
  else ok(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n\s+sparse-checkout: \.harness\/tools\n\s+persist-credentials: false/.test(text), `${f}: checks out only the default branch's .harness/tools, without persisted credentials`);
  ok(/persist-credentials: false/.test(text), `${f}: no persisted git credentials`);
}
const st = parseYaml(readFileSync(join(dir, 'harness-stale.yml'), 'utf8'));
ok(st.on.schedule.length === 1 && /^\d+ \d+ \* \* \*$/.test(st.on.schedule[0].cron) && 'workflow_dispatch' in st.on && Object.keys(st.on).length === 2, `harness-stale runs once a day (${st.on.schedule[0].cron}) and on dispatch, nothing else`);
ok(st.jobs.stale.permissions.issues === 'write' && Object.entries(st.jobs.stale.permissions).every(([k, v]) => k === 'issues' || v === 'read') && Number(st.jobs.stale['timeout-minutes']) <= 3, 'its one job writes only issues and is short');

// --- the hands daily drift check runs the missed-run check with read-only Actions access -------------
const hs = parseYaml(readFileSync(join(kit, '.harness/templates/hands/hands-settings.yml'), 'utf8'));
const miss = hs.jobs.discover.steps.find((x) => x.name === 'Missed scheduled runs');
ok(hs.on.schedule.length === 1 && miss && /stale\.mjs schedules --repo "\$GITHUB_REPOSITORY" --alert/.test(miss.run) && miss.env.ALERTS_TOPIC === 'kit' && miss.env.GH_TOKEN === '${{ github.token }}'
  && /^set -euo pipefail\n/.test(miss.run) && hs.jobs.discover.permissions.actions === 'read' && miss.if === "always() && inputs.repo == ''" && !('continue-on-error' in miss),
  'hands-settings: its one daily job also checks missed scheduled runs into "Kit & Hands", with actions: read, and a failure of that check fails the step (pipefail, so tee cannot hide it)');

// --- the audit counts the installed workflow for C15 ---------------------------------------------------
const proj = mkdtempSync(join(tmpdir(), 'harness-stale-'));
mkdirSync(join(proj, '.github/workflows'), { recursive: true });
mkdirSync(join(proj, '.harness/tools'), { recursive: true });
copyFileSync(join(dir, 'harness-stale.yml'), join(proj, '.github/workflows/harness-stale.yml'));
copyFileSync(join(kit, '.harness/tools/stale.mjs'), join(proj, '.harness/tools/stale.mjs'));
copyFileSync(join(kit, '.harness/tools/notify.mjs'), join(proj, '.harness/tools/notify.mjs'));
writeFileSync(join(proj, 'README.md'), 'x\n');
const profile = JSON.parse(readFileSync(join(kit, 'examples/profile.example.json'), 'utf8'));
profile.capabilities = [...new Set([...(profile.capabilities || []), 'recurring-jobs'])];
writeFileSync(join(proj, '.harness/profile.json'), JSON.stringify(profile, null, 2));
const g = (...a) => spawnSync('git', ['-C', proj, ...a], { encoding: 'utf8' });
g('init', '-q', '-b', 'main'); g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');
spawnSync('node', [join(kit, '.harness/tools/audit.mjs'), proj, '--json', join(proj, 'a.json')], { encoding: 'utf8' });
const audit = JSON.parse(readFileSync(join(proj, 'a.json'), 'utf8')).results;
const res = (id) => audit.find((x) => x.id === id);
ok(res('C15').result === 'PASS' && res('RJ02').result === 'PASS' && res('O10').result === 'PASS', `audit: C15 ${res('C15').result} (${res('C15').detail || res('C15').evidence || ''}), RJ02 ${res('RJ02').result}, O10 ${res('O10').result}`);
rmSync(proj, { recursive: true, force: true });

console.log(`test-stale: OK · ${n} checks`);
