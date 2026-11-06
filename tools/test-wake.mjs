#!/usr/bin/env node
// test-wake — disposable, event-fired coordinators (K033), offline against a stand-in GitHub API and
// a stand-in /fire endpoint.
//
//   node tools/test-wake.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { decide, ledger, capFrom, fireUrlOk, isState, payload, signature, failStreak, chainLength, MOVABLE, WAKE, CLAIM, STOPPED, PAUSED, BACKSTOP_OFF, CHAIN_STOP, STATE, STATE_MARK, FIRE_MARK, FAIL_MARK, STUCK_MARK, EMPTY_MARK, DAILY_CAP, ISSUE_CAP, ISSUE_TOTAL, EMPTY_STOP, STUCK_STOP } from '../.harness/tools/wake.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-wake: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-wake: ok ${n}. ${what}`); };

// --- the decision, pure -------------------------------------------------------------------------
const H = 3600e3, now = Date.parse('2026-11-07T12:00:00Z');
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const fireAt = (h, issue = null) => ({ kind: 'fire', at: now - h * H, issue });
const emptyAt = (h) => ({ kind: 'empty', at: now - h * H });
const woke = (num = 5, more = {}) => ({ number: num, open: true, labels: [WAKE], isState: false, ...more });

ok(decide({ event: 'labeled', label: WAKE, issue: woke(), now }).act === 'fire' && decide({ event: 'labeled', label: WAKE, issue: woke(), now }).target === 5, 'a wake label on an open issue starts a run for it');
ok(decide({ event: 'labeled', label: 'bug', issue: woke(), now }).act === 'none' && decide({ event: 'labeled', label: WAKE, issue: woke(5, { open: false }), now }).act === 'none'
  && decide({ event: 'labeled', label: WAKE, issue: woke(5, { labels: [] }), now }).act === 'none' && decide({ event: 'labeled', label: WAKE, issue: woke(1, { isState: true }), now }).act === 'none',
'another label, a closed issue, a label already removed again, or the STATE issue itself wakes nobody');
{
  const d = decide({ event: 'labeled', label: WAKE, issue: woke(), claim: true, ledger: [fireAt(1)], now });
  ok(d.act === 'none' && /a run is on/.test(d.why), 'while a run holds the claim, a new wake starts no second run (the label stays queued)');
  const dead = decide({ event: 'labeled', label: WAKE, issue: woke(), claim: true, ledger: [fireAt(7)], now });
  ok(dead.act === 'fire' && dead.clearClaim === true, 'a claim older than its time-to-live is a dead run: it is cleared and a new run starts');
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), claim: true, ledger: [], now }).clearClaim === true, 'a claim with no receipt at all is dead too');
}
{
  const eight = Array.from({ length: DAILY_CAP }, (_, i) => fireAt(i + 1, 100 + i));
  const d = decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: eight, now });
  ok(d.act === 'capped' && /daily cap/.test(d.why), `the ${DAILY_CAP}th run in 24 h is the last: the next wake is capped`);
  const old = Array.from({ length: DAILY_CAP }, (_, i) => fireAt(25 + i, 100 + i));
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: old, now }).act === 'fire', 'receipts older than 24 h no longer count');
  const same = Array.from({ length: ISSUE_CAP }, (_, i) => fireAt(i + 1, 5));
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: same, now }).act === 'capped' && decide({ event: 'labeled', label: WAKE, issue: woke(6), ledger: same, now }).act === 'fire', `one issue starts at most ${ISSUE_CAP} runs a day; another issue still can`);
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: [fireAt(1), fireAt(2)], cap: 2, now }).act === 'capped', 'a lowered cap holds');
}
ok(capFrom('3') === 3 && capFrom('50') === DAILY_CAP && capFrom('') === DAILY_CAP && capFrom('x') === DAILY_CAP && capFrom('-1') === DAILY_CAP && capFrom(undefined) === DAILY_CAP, 'WAKE_DAILY_CAP may lower the cap, never raise it; anything else is the ceiling');
{
  const st = { number: 1, open: true, labels: [], isState: true };
  ok(decide({ event: 'unlabeled', label: CLAIM, issue: st, queue: [7, 9], ledger: [fireAt(1)], now }).target === 7, 'when a run removes its claim, the oldest queued wake starts the next run');
  ok(decide({ event: 'unlabeled', label: CLAIM, issue: st, queue: [], now }).act === 'none', 'when nothing is queued, a run ending starts nothing');
  ok(decide({ event: 'unlabeled', label: WAKE, issue: st, queue: [7], now }).act === 'none' && decide({ event: 'unlabeled', label: CLAIM, issue: st, claim: true, queue: [7], ledger: [fireAt(1)], now }).act === 'none', 'only the claim leaving, with no claim left anywhere, counts as a run ending');
  ok(decide({ event: 'unlabeled', label: CLAIM, issue: st, queue: [7, 9], ledger: Array.from({ length: ISSUE_CAP }, (_, i) => fireAt(i + 1, 7)), now }).target === 9, 'a queued wake at its cap does not block the next one in the queue');
}
{
  const e1 = decide({ event: 'schedule', now });
  ok(e1.act === 'empty' && e1.n === 1 && !e1.last, 'the backstop with nothing to see starts no run and counts one empty day');
  const e3 = decide({ event: 'schedule', ledger: [fireAt(80), emptyAt(48), emptyAt(24)], now });
  ok(e3.act === 'empty' && e3.last === true, `the ${EMPTY_STOP}rd empty day in a row is the backstop's last`);
  const off = decide({ event: 'schedule', ledger: [emptyAt(72), emptyAt(48), emptyAt(24)], queue: [3], now });
  ok(off.act === 'none' && /rests/.test(off.why), 'after that the backstop rests, even with work');
  ok(decide({ event: 'schedule', backstopOff: true, queue: [3], now }).act === 'none', `the rest is a label (${BACKSTOP_OFF}), so it holds after the empty marks age out`);
  ok(decide({ event: 'schedule', ledger: [emptyAt(96), emptyAt(72), emptyAt(48), fireAt(30)], now }).n === 1, 'any run after the empty days re-arms the backstop');
  ok(decide({ event: 'schedule', queue: [3], now }).target === 3, 'the backstop starts a run for a wake still queued');
  ok(/stale/.test(decide({ event: 'schedule', work: [{ number: 4 }], now }).why) && decide({ event: 'schedule', work: [{ number: 4 }], now }).act === 'fire', 'the backstop starts a run for stale work (C15)');
  ok(decide({ event: 'schedule', claim: true, ledger: [fireAt(7)], now }).clearClaim === true, 'the backstop clears a dead run\'s claim and starts a run');
  ok(decide({ event: 'schedule', claim: true, ledger: [fireAt(1)], queue: [3], now }).act === 'none', 'the backstop never starts a second run');
}
{
  const tot = Array.from({ length: ISSUE_TOTAL }, (_, i) => fireAt(30 + i * 30, 5));
  const si = decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: tot, now });
  ok(si.act === 'stop-item' && si.items.join() === '5', `an issue that started ${ISSUE_TOTAL} runs in 30 days is stopped for good, however they are spread`);
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(5, { labels: [WAKE, STOPPED] }), now }).act === 'none', `a stopped issue (${STOPPED}) wakes nobody, even after its receipts age out`);
  const failed = [fireAt(5), { kind: 'fail', at: now - 5 * H + 1 }, fireAt(4), { kind: 'fail', at: now - 4 * H + 1 }, fireAt(3), { kind: 'fail', at: now - 3 * H + 1 }];
  ok(failStreak(failed) === STUCK_STOP && decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: failed, now }).act === 'pause' && decide({ event: 'schedule', queue: [5], ledger: failed, now }).act === 'pause', `after ${STUCK_STOP} failed fires in a row, wakes pause`);
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), paused: true, now }).act === 'none' && decide({ event: 'schedule', queue: [5], paused: true, now }).act === 'none', `the pause is a label (${PAUSED}): it holds after the failures age out`);
  ok(decide({ event: 'workflow_dispatch', ledger: failed, paused: true, now }).act === 'fire' && failStreak([...failed, fireAt(1)]) === 0, 'only a run started by hand tries again, and one that starts ends the streak');
  const sig = signature([3], [], false);
  const same = [1, 2, 3].map((d) => ({ ...fireAt(d * 24), via: 'backstop', sig }));
  const st = decide({ event: 'schedule', queue: [3], ledger: same, now });
  ok(st.act === 'stuck' && st.items.join() === '3', `${STUCK_STOP} backstop runs in a row for the same work stop that work for good (one exception)`);
  const chain = Array.from({ length: CHAIN_STOP }, (_, i) => ({ ...fireAt(100 - i * 5, 50 + i), via: 'queue' }));
  ok(chainLength(chain) === CHAIN_STOP && decide({ event: 'unlabeled', label: CLAIM, issue: { number: 1, open: true, labels: [], isState: true }, queue: [99], ledger: chain, now }).act === 'pause', `${CHAIN_STOP} hand-offs in a row with nothing else between pause wakes`);
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(99), ledger: chain, now }).act === 'fire', 'a fresh wake from outside a chain still starts a run');
  ok(decide({ event: 'schedule', queue: [3, 4], ledger: same, now }).act === 'fire' && decide({ event: 'schedule', queue: [3], ledger: [...same.slice(1), { ...fireAt(2), via: 'label', issue: 8 }], now }).act === 'fire', 'new work, or any run started another way, re-arms it');
  ok(!MOVABLE({ kind: 'draft' }) && MOVABLE({ kind: 'green-unmerged' }), 'a draft PR (such as a wake channel) never starts a backstop run');
  ok(/#4 #6/.test(payload({ repo: 'o/r', why: 'w', target: null, stateIssue: 1, work: [4, 6] })), 'the run is told which stale items started it');
}
ok(decide({ event: 'workflow_dispatch', now }).act === 'fire' && decide({ event: 'workflow_dispatch', issue: woke(), now }).target === 5 && decide({ event: 'push', now }).act === 'none', 'by hand a run starts (capped like any other); other events wake nobody');

// --- the receipts the caps count -------------------------------------------------------------------
{
  const cs = [
    { user: bot, created_at: '2026-11-07T10:00:00Z', body: `${FIRE_MARK}{"issue":5,"event":"labeled"} -->\nRun started` },
    { user: { login: 'owner', type: 'User' }, created_at: '2026-11-07T10:30:00Z', body: `${FIRE_MARK}{"issue":5} -->\nforged` },
    { user: { login: 'github-actions', type: 'User' }, created_at: '2026-11-07T10:40:00Z', body: `${EMPTY_MARK}` },
    { user: bot, created_at: '2026-11-07T09:00:00Z', body: `${EMPTY_MARK}\nBackstop` },
    { user: bot, created_at: '2026-11-07T11:00:00Z', body: `${FIRE_MARK}{bad json -->\nRun started` },
    { user: bot, created_at: '2026-11-07T11:30:00Z', body: 'Run started without a marker' },
  ];
  const l = ledger(cs);
  ok(l.length === 3 && l[0].kind === 'empty' && l[1].issue === 5 && l[2].kind === 'fire' && l[2].issue === null, 'only the job\'s own marker comments count, oldest first; a person cannot post or forge a receipt, and a damaged receipt still counts');
}
ok(isState({ user: bot, body: `${STATE_MARK}\nState` }) && !isState({ user: { login: 'owner', type: 'User' }, body: STATE_MARK }) && !isState({ user: bot, body: STATE_MARK, pull_request: {} }), 'only an issue the job opened is the STATE issue: nobody can plant one');
ok(fireUrlOk('https://api.anthropic.com/v1/claude_code/routines/trig_01AbC/fire') && !fireUrlOk('https://evil.test/v1/claude_code/routines/trig_01/fire') && !fireUrlOk('https://api.anthropic.com/v1/claude_code/routines/trig_01/fire?x=1') && !fireUrlOk(''), 'the token goes only to a scheduled task\'s /fire endpoint');
ok(/#7/.test(payload({ repo: 'o/r', why: 'w', target: 7, stateIssue: 1 })) && /remove `coordinator-running` from #1 as the very last step/.test(payload({ repo: 'o/r', why: 'w', target: null, stateIssue: 1 })), 'the run is told the issue, the STATE issue and to release the claim last');

// --- the job, end to end against stand-ins -------------------------------------------------------------
const issues = new Map();   // number -> { number, state, labels: [names], body, user, comments: [{ user, body, created_at }] }
const fires = [];
let fireStatus = 200;
const add = (i) => { issues.set(i.number, { state: 'open', labels: [], comments: [], user: { login: 'owner', type: 'User' }, body: '', ...i }); return issues.get(i.number); };
const view = (i) => ({ number: i.number, state: i.state, body: i.body, user: i.user, labels: i.labels.map((name) => ({ name })), html_url: `https://gh.test/o/r/issues/${i.number}` });
const srv = createServer((q, res) => {
  let data = '';
  q.on('data', (c) => { data += c; });
  q.on('end', () => {
    const u = new URL(q.url, 'http://x');
    const send = (code, j) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (u.pathname.endsWith('/fire')) { fires.push({ auth: q.headers.authorization, body: JSON.parse(data) }); return fireStatus === 200 ? send(200, { type: 'routine_fire', claude_code_session_id: `session_0${fires.length}`, claude_code_session_url: `https://claude.ai/code/session_0${fires.length}` }) : send(fireStatus, { error: 'x' }); }
    if (u.pathname === '/repos/o/r/issues' && q.method === 'GET') {
      if (u.searchParams.get('page') !== '1') return send(200, []);
      let l = [...issues.values()].sort((a, b) => a.number - b.number);
      if (u.searchParams.get('state') !== 'all') l = l.filter((i) => i.state === (u.searchParams.get('state') || 'open'));
      if (u.searchParams.get('labels')) l = l.filter((i) => i.labels.includes(u.searchParams.get('labels')));
      if (u.searchParams.get('creator')) l = l.filter((i) => i.user.login === u.searchParams.get('creator'));
      return send(200, l.map(view));
    }
    if (u.pathname === '/repos/o/r/issues' && q.method === 'POST') { const j = JSON.parse(data); const i = add({ number: Math.max(0, ...issues.keys()) + 1, body: j.body, labels: j.labels, user: bot }); return send(201, view(i)); }
    if (u.pathname === '/repos/o/r/issues/comments') return send(200, u.searchParams.get('page') === '1' && u.searchParams.get('since') ? [...issues.values()].flatMap((i) => i.comments).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) : []);
    if (u.pathname === '/repos/o/r/pulls' || u.pathname.startsWith('/repos/o/r/commits')) return send(200, []);
    const m = u.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)(\/comments|\/labels(?:\/([\w-]+))?)?$/);
    const i = m && issues.get(Number(m[1]));
    if (!i) return send(404, {});
    if (m[2] === '/comments' && q.method === 'GET') return send(200, u.searchParams.get('page') === '1' ? i.comments : []);
    if (m[2] === '/comments') { i.comments.push({ user: bot, body: JSON.parse(data).body, created_at: new Date().toISOString() }); return send(201, { id: 1 }); }
    if (m[2]?.startsWith('/labels') && q.method === 'DELETE') { if (!i.labels.includes(m[3])) return send(404, {}); i.labels = i.labels.filter((x) => x !== m[3]); return send(200, []); }
    if (m[2]?.startsWith('/labels')) { i.labels = [...new Set([...i.labels, ...JSON.parse(data).labels])]; return send(200, []); }
    if (q.method === 'PATCH') { const j = JSON.parse(data); if (j.state) i.state = j.state; if (j.labels) i.labels = j.labels; return send(200, view(i)); }
    return send(200, view(i));
  });
});
await new Promise((d) => srv.listen(0, '127.0.0.1', d));
const base = `http://127.0.0.1:${srv.address().port}`;
const tool = join(new URL('..', import.meta.url).pathname, '.harness/tools/wake.mjs');
const URL_OK = `${base}/v1/claude_code/routines/trig_01ABC/fire`;
const run = (args, env = {}) => new Promise((d) => execFile(process.execPath, [tool, ...args], { env: { ...process.env, GITHUB_API_URL: base, GH_TOKEN: 't', WAKE_FIRE_BASE: base, WAKE_ROUTINE_URL: URL_OK, WAKE_ROUTINE_TOKEN: 'sk-test', WAKE_DAILY_CAP: '', GITHUB_ACTIONS: 'true', ...env } }, (e, stdout, stderr) => d({ code: e ? e.code : 0, out: stdout + stderr })));
const fire = (event, issue, label, env) => run(['fire', '--repo', 'o/r', '--event', event, ...(issue ? ['--issue', String(issue)] : []), ...(label ? ['--label', label] : [])], env);

add({ number: 1, labels: [WAKE], body: 'please look' });
ok((await fire('labeled', 1, WAKE, { GITHUB_ACTIONS: '' })).code === 1 && fires.length === 0, 'fire runs only in Actions: its receipts must be the job\'s own');
ok((await fire('labeled', 1, WAKE, { WAKE_ROUTINE_URL: 'https://evil.test/fire' })).code === 1 && fires.length === 0, 'a URL that is not a /fire endpoint is refused before any call');
const r1 = await fire('labeled', 1, WAKE);
const st = [...issues.values()].find((i) => i.user.login === 'github-actions[bot]');
ok(r1.code === 0 && fires.length === 1 && fires[0].auth === 'Bearer sk-test' && /#1/.test(fires[0].body.text) && st && st.body.includes(STATE_MARK), 'the first wake opens the STATE issue and starts one run, telling it the issue');
ok(st.labels.includes(CLAIM) && st.comments.at(-2).body.startsWith(FIRE_MARK) && /session_01/.test(st.comments.at(-1).body) && /Coordinator run started: https:\/\/claude\.ai\/code\/session_01/.test(issues.get(1).comments.at(-1).body), 'the claim is set and the session link is posted as the receipt, on the STATE issue and on the woken issue');
add({ number: 3, labels: [WAKE] });
const r2 = await fire('labeled', 3, WAKE);
ok(r2.code === 0 && fires.length === 1 && /a run is on/.test(r2.out), 'a second wake while the run is on starts nothing');
st.labels = st.labels.filter((x) => x !== CLAIM); issues.get(1).labels = [];   // the run handled #1 and ended
const r3 = await fire('unlabeled', st.number, CLAIM);
ok(r3.code === 0 && fires.length === 2 && /#3/.test(fires[1].body.text) && st.labels.includes(CLAIM), 'the run ending starts the next run for the wake still queued');
st.labels = []; issues.get(3).labels = [];
st.labels = [STATE]; st.state = 'closed';
const r4 = await fire('workflow_dispatch');
ok(r4.code === 0 && fires.length === 3 && st.state === 'open' && [...issues.values()].filter((i) => i.body.includes(STATE_MARK)).length === 1, 'a closed STATE issue is reopened, never replaced: closing it does not reset the count');
st.labels = []; fireStatus = 500;
add({ number: 9, labels: [WAKE] });
const r5 = await fire('labeled', 9, WAKE);
ok(r5.code === 1 && !st.labels.includes(CLAIM) && st.comments.at(-1).body.startsWith(FAIL_MARK) && st.comments.at(-2).body.startsWith(FIRE_MARK) && /No coordinator run started/.test(issues.get(9).comments.at(-1).body) && issues.get(9).labels.includes(WAKE), 'a failed fire was counted before it was tried, releases the claim, is marked failed, says so on the issue, keeps the wake label, and fails the job');
fireStatus = 200;
const r6 = await fire('labeled', 9, WAKE, { WAKE_DAILY_CAP: '3' });
ok(r6.code === 0 && fires.length === 4 && /capped|cap is reached/.test(r6.out + issues.get(9).comments.at(-1).body), 'with the cap lowered to 3 and 3 runs today, the wake is capped and the issue is told');
{
  // an agent rewrites the STATE body without its marker and moves the receipts' issue out of reach:
  // the count is read from the whole repository, so the cap still holds on the new STATE issue
  st.body = 'rewritten'; st.labels = [CLAIM];
  const busy = await fire('labeled', 9, WAKE);
  ok(busy.code === 0 && fires.length === 4 && /a run is on/.test(busy.out), 'a STATE issue stripped of its marker while a run holds the claim makes no room for a second run');
  st.labels = [];
  const r = await fire('labeled', 9, WAKE, { WAKE_DAILY_CAP: '3' });
  const fresh = [...issues.values()].filter((i) => i.body.includes(STATE_MARK));
  ok(r.code === 0 && fires.length === 4 && fresh.length === 1 && fresh[0].number !== st.number && /cap is reached/.test(r.out), 'a STATE issue stripped of its marker is replaced, but the receipts are counted repository-wide, so the cap still holds');
  for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(FIRE_MARK) && !c.body.startsWith(FAIL_MARK));
  st.body = STATE_MARK; issues.delete(fresh[0].number);
}
st.labels = []; issues.get(9).labels = [];
const r7 = await fire('schedule');
ok(r7.code === 0 && fires.length === 4 && st.comments.at(-1).body.startsWith(EMPTY_MARK), 'the backstop with no wake and no stale work writes one empty mark and starts no run');
await fire('schedule'); await fire('schedule');
const r8 = await fire('schedule');
ok(r8.code === 0 && /rests/.test(r8.out) && st.labels.includes(BACKSTOP_OFF) && st.comments.filter((c) => c.body.startsWith(EMPTY_MARK)).length === EMPTY_STOP, 'after three empty days the backstop rests (a label) and stops writing and starting');
{
  // an admin account edits a receipt so it no longer reads as one: it still counts
  const edited = ledger([{ user: bot, created_at: '2026-11-07T10:00:00Z', updated_at: '2026-11-07T11:00:00Z', body: 'nothing to see' }]);
  ok(edited.length === 1 && edited[0].kind === 'fire', 'an edited job comment counts as a run, whatever it says now: the job never edits its own');
}
{
  // a run by hand re-arms the backstop and lifts a pause, wherever those labels sit
  st.labels.push(PAUSED);
  const h = await fire('workflow_dispatch');
  ok(h.code === 0 && !st.labels.includes(PAUSED) && !st.labels.includes(BACKSTOP_OFF), 'a run started by hand lifts the pause and re-arms the backstop');
  st.labels = [];
}
const s = JSON.parse((await run(['status', '--repo', 'o/r'])).out);
ok(s.state === st.number && s.emptyStreak === 0 && s.cap === DAILY_CAP && s.claim.length === 0 && s.failStreak === 0, 'status shows what the next decision reads');
srv.close();

// --- the installed workflow ---------------------------------------------------------------------
const text = readFileSync(join(new URL('..', import.meta.url).pathname, '.harness/templates/workflows/harness-wake.yml'), 'utf8');
const wf = parseYaml(text);
const job = wf.jobs.wake, p = job.permissions;
ok(/vars\.WAKE_ROUTINE_URL != ''/.test(job.if) && /label\.name == 'wake'/.test(job.if) && /label\.name == 'coordinator-running'/.test(job.if), 'the job is skipped without the routine URL, and runs only for the wake label or the claim leaving');
ok(job['timeout-minutes'] <= 3 && Object.entries(p).filter(([, v]) => v === 'write').map(([k]) => k).join() === 'issues' && p.contents === 'read', 'it is short and writes only issues (labels and comments), never code');
ok(!/pull_request_target/.test(text) && /sparse-checkout: \.harness\/tools/.test(text) && /default_branch/.test(text) && /secrets\.WAKE_ROUTINE_TOKEN/.test(text), 'it never runs PR code: only the default branch\'s tools, and the token comes from a secret');
ok(String(wf.on.schedule?.[0]?.cron || wf.on.schedule).includes('* * *') && wf.concurrency?.group === 'harness-wake', 'one daily backstop, one decision at a time');

console.log(`test-wake: OK · ${n} checks`);
