#!/usr/bin/env node
// test-wake — disposable, event-fired coordinators (K033), offline against a stand-in GitHub API and
// a stand-in /fire endpoint.
//
//   node tools/test-wake.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { capOf, keepsStart, jobBacksOff, BACKOFF_MARK, HANDOFF_RULE, HANDOFF_SETTLE_MS, HANDOFF_READ_MS, handoffPlan, runTaskOf, HANDOFF_MARK, HANDOFF_FAIL_MARK, RUN_TASK_FILE, decide, ledger, capFrom, fireUrlOk, isState, payload, signature, failStreak, chainLength, MOVABLE, WAKE, CLAIM, STOPPED, PAUSED, BACKSTOP_OFF, CHAIN_STOP, STATE, STATE_MARK, FIRE_MARK, FAIL_MARK, STUCK_MARK, EMPTY_MARK, START_MARK, USED_MARK, startByLabel, startOk, usedSince, START_WINDOW_MIN, DAILY_CAP, ISSUE_CAP, ISSUE_TOTAL, EMPTY_STOP, STUCK_STOP } from '../.harness/tools/wake.mjs';
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
  const eight = Array.from({ length: DAILY_CAP }, (_, i) => fireAt((i + 1) * 23 / DAILY_CAP, 100 + i));   // all inside 24 h, whatever the cap
  const d = decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: eight, now });
  ok(d.act === 'capped' && /daily cap/.test(d.why), `the ${DAILY_CAP}th run in 24 h is the last: the next wake is capped`);
  const old = Array.from({ length: DAILY_CAP }, (_, i) => fireAt(25 + i, 100 + i));
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: old, now }).act === 'fire', 'receipts older than 24 h no longer count');
  const same = Array.from({ length: ISSUE_CAP }, (_, i) => fireAt(i + 1, 5));
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: same, now }).act === 'capped' && decide({ event: 'labeled', label: WAKE, issue: woke(6), ledger: same, now }).act === 'fire', `one issue starts at most ${ISSUE_CAP} runs a day; another issue still can`);
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: [fireAt(1), fireAt(2)], cap: 2, now }).act === 'capped', 'a lowered cap holds');
}
ok(DAILY_CAP === 48 && ISSUE_CAP === 12 && ISSUE_TOTAL === 3 * ISSUE_CAP, 'the caps stop loops, they do not throttle work: 48 runs a day per repository, 12 per issue, an issue stopped for good after three full days of its cap (K051)');
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
  const tot = Array.from({ length: ISSUE_TOTAL }, (_, i) => fireAt(30 + i * (28 * 24 - 30) / ISSUE_TOTAL, 5));   // spread over 28 days, never ISSUE_CAP of them in one day
  const si = decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: tot, now });
  ok(si.act === 'stop-item' && si.items.join() === '5', `an issue that started ${ISSUE_TOTAL} runs in 30 days is stopped for good, however they are spread`);
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(5, { labels: [WAKE, STOPPED] }), now }).act === 'none', `a stopped issue (${STOPPED}) wakes nobody, even after its receipts age out`);
  const failed = [fireAt(5), { kind: 'fail', at: now - 5 * H + 1 }, fireAt(4), { kind: 'fail', at: now - 4 * H + 1 }, fireAt(3), { kind: 'fail', at: now - 3 * H + 1 }];
  ok(failStreak(failed) === STUCK_STOP && decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: failed, now }).act === 'pause' && decide({ event: 'schedule', queue: [5], ledger: failed, now }).act === 'pause', `after ${STUCK_STOP} failed fires in a row, wakes pause`);
  ok(decide({ event: 'labeled', label: WAKE, issue: woke(), paused: true, now }).act === 'none' && decide({ event: 'schedule', queue: [5], paused: true, now }).act === 'empty', `the pause is a label (${PAUSED}): it holds after the failures age out`);
  ok(decide({ event: 'workflow_dispatch', ledger: failed, paused: true, now }).act === 'fire' && failStreak([...failed, fireAt(1)]) === 0, 'only a run started by hand tries again, and one that starts ends the streak');
  const sig = signature([3], [], false);
  const same = [1, 2, 3].map((d) => ({ ...fireAt(d * 24), via: 'backstop', sig }));
  const st = decide({ event: 'schedule', queue: [3], ledger: same, now });
  ok(st.act === 'stuck' && st.items.join() === '3', `${STUCK_STOP} backstop runs in a row for the same work stop that work for good (one exception)`);
  const chain = Array.from({ length: CHAIN_STOP }, (_, i) => ({ ...fireAt(100 - i * 5, 50 + i), via: i % 4 === 3 ? 'backstop' : 'queue' }));
  ok(chainLength(chain) === CHAIN_STOP && decide({ event: 'unlabeled', label: CLAIM, issue: { number: 1, open: true, labels: [], isState: true }, queue: [99], ledger: chain, now }).act === 'pause', `${CHAIN_STOP} hand-offs in a row with no outside wake between pause wakes, even when the backstop carried some of them across a daily cap`);
  ok(chainLength([...chain, { ...fireAt(1, 7), via: 'label' }]) === 0 && chainLength([{ ...fireAt(9, 7), via: 'queue' }, { ...fireAt(5), via: 'backstop', issue: null }]) === 1, 'an outside wake ends a chain; a stale-work backstop run neither ends nor extends it');
  const dying = [1, 2, 3].map((d) => ({ ...fireAt(d * 24), via: 'backstop', sig: 'dead' }));
  const dd = decide({ event: 'schedule', claim: true, ledger: dying, now });
  ok(dd.act === 'pause' && dd.clearClaim === true, 'a run that keeps dying pauses wakes (nothing to label) and its claim is cleared');
  const pz = decide({ event: 'schedule', paused: true, queue: [3], now });
  ok(pz.act === 'empty' && decide({ event: 'schedule', paused: true, ledger: [emptyAt(72), emptyAt(48), emptyAt(24)], queue: [3], now }).act === 'none', 'while paused, the backstop counts empty days and then rests: no daily job forever');
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
let commentId = 100, raceUsed = false, postAs = null, hideUsedOnce = 0, hideNewest = false, failAtUnclaim = null;   // hideNewest: the repository listing lags one comment behind
// raceUsed: another run's record lands just before this run's own
const issues = new Map();   // number -> { number, state, labels: [names], body, user, comments: [{ user, body, created_at }] }
const fires = [];
let rival = null, rivalBefore = false, rivalShift = 0;   // rival: a second start's receipt (or a function of the hand-off's comment giving it), written right after the next hand-off receipt (rivalBefore: dated just before it; rivalShift: dated this many ms after it)
let lateHandoff = null, lateFailed = false;   // K064: ms: a hand-off's claim and receipt, dated this long before the job's next receipt, land while the job decides (lateFailed: and its start is released with --failed before the job's receipt)
let listDown = 0, listAll = false;   // 1: the repository comment listing fails from the job's next receipt on; 2: failing now (listAll: every comment listing, the STATE issue's own too)
let taskFile = null;   // the receiving repository's .github/wake.json, when it has one
let fireStatus = 200;
const labelEvents = [];   // `<issue>:<label>` for each label GitHub would send a `labeled` event for
let labelsRefused = false;
let receiptAtClaim = null;   // receipts already on the issue at the moment its claim label was set
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
    if (listDown === 2 && q.method === 'GET' && (u.pathname === '/repos/o/r/issues/comments' || (listAll && /\/comments$/.test(u.pathname)))) return send(500, { message: 'listing down' });
    if (u.pathname === '/repos/o/r/issues/comments') return send(200, u.searchParams.get('page') === '1' && u.searchParams.get('since') ? [...issues.values()].flatMap((i) => i.comments).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(0, hideNewest ? -1 : undefined).filter((c) => { if (hideUsedOnce !== 2) return true; return !c.body.startsWith(USED_MARK); }).concat((hideUsedOnce === 2 ? (hideUsedOnce = 0, []) : [])) : []);
    if (u.pathname === `/repos/o/r/contents/${RUN_TASK_FILE}`) return taskFile == null ? send(404, {}) : send(200, { content: Buffer.from(taskFile).toString('base64') });
    if (u.pathname === '/repos/o/r/pulls' || u.pathname.startsWith('/repos/o/r/commits')) return send(200, []);
    const m = u.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)(\/comments|\/labels(?:\/([\w-]+))?)?$/);
    const i = m && issues.get(Number(m[1]));
    if (!i) return send(404, {});
    if (m[2] === '/comments' && q.method === 'GET') return send(200, u.searchParams.get('page') === '1' ? i.comments : []);
    if (m[2] === '/comments') { const body = JSON.parse(data).body; if (listDown === 1 && body.startsWith(FIRE_MARK)) listDown = 2; if (lateHandoff != null && body.startsWith(FIRE_MARK)) { const seen = Math.max(0, ...[...issues.values()].flatMap((x) => x.comments).filter((x) => x.body.startsWith(FIRE_MARK) || x.body.startsWith(HANDOFF_MARK)).map((x) => x.id)); i.labels = [...new Set([...i.labels, CLAIM])]; i.comments.push({ id: ++commentId, user: { login: 'owner', type: 'User' }, author_association: 'OWNER', body: `${HANDOFF_MARK}${JSON.stringify({ issue: 41, via: 'handoff', from: 'o/sender', seen, rule: HANDOFF_RULE })} -->\nStarting a run from inside.`, created_at: new Date(Date.now() - lateHandoff).toISOString() }); if (lateFailed) { const hid = commentId; i.comments.push({ id: ++commentId, user: { login: 'owner', type: 'User' }, author_association: 'OWNER', body: `${HANDOFF_FAIL_MARK}<!-- released ${JSON.stringify({ id: hid })} -->\nNot started from inside.`, created_at: new Date(Date.now() - 1000).toISOString() }); } lateHandoff = null; lateFailed = false; } if (raceUsed && body.startsWith(USED_MARK)) i.comments.push({ id: ++commentId, user: bot, body, created_at: new Date(Date.now() - 1).toISOString() }); const c = { id: ++commentId, user: bot, author_association: 'OWNER', ...(postAs || {}), body, created_at: new Date().toISOString() }; i.comments.push(c); if (hideUsedOnce === 1 && body.startsWith(USED_MARK)) hideUsedOnce = 2; if (rival && body.startsWith(HANDOFF_MARK)) { i.comments.push({ ...c, id: ++commentId, body: typeof rival === 'function' ? rival(c) : rival, ...(rivalBefore ? { created_at: new Date(Date.parse(c.created_at) - 1).toISOString() } : rivalShift ? { created_at: new Date(Date.parse(c.created_at) + rivalShift).toISOString() } : {}) }); rival = null; } return send(201, c); }
    if (m[2]?.startsWith('/labels') && q.method === 'DELETE') { if (!i.labels.includes(m[3])) return send(404, {}); if (m[3] === CLAIM) failAtUnclaim = i.comments.some((c) => c.body.startsWith(FAIL_MARK)); i.labels = i.labels.filter((x) => x !== m[3]); return send(200, []); }
    if (m[2]?.startsWith('/labels')) { if (labelsRefused === 'error') return send(500, {}); if (labelsRefused === 'lost') { i.labels = [...new Set([...i.labels, ...JSON.parse(data).labels])]; return send(500, {}); } if (labelsRefused) return send(200, []); const add = JSON.parse(data).labels; labelEvents.push(...add.filter((x) => !i.labels.includes(x)).map((x) => `${i.number}:${x}`)); if (add.includes(CLAIM)) receiptAtClaim = i.comments.filter((c) => c.body.startsWith(FIRE_MARK)).length; i.labels = [...new Set([...i.labels, ...add])]; return send(200, i.labels.map((name) => ({ name }))); }
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
{
  // K057: with WAKE_START=label nothing outside GitHub is called; the claim label is the start
  const LABEL = { WAKE_START: 'label', WAKE_ROUTINE_URL: '', WAKE_ROUTINE_TOKEN: '', WAKE_DAILY_CAP: '' };
  ok(startByLabel('label') && !startByLabel(' label ') && startByLabel('Label') && !startByLabel('') && !startByLabel(undefined) && !startByLabel('labels') && !startByLabel('true'), 'only the one word switches the start to the label, in any case, as the workflow reads it');
  for (const i of issues.values()) { if (!isState(view(i))) i.labels = i.labels.filter((x) => x !== WAKE); i.comments = []; }
  st.labels = [];
  add({ number: 40, labels: [WAKE], body: 'by label' });
  const before = fires.length, at = labelEvents.length;
  receiptAtClaim = null;
  const r = await fire('labeled', 40, WAKE, LABEL);
  const marks = st.comments.map((c) => c.body);
  ok(r.code === 0 && fires.length === before && st.labels.includes(CLAIM) && labelEvents.slice(at).join() === `${st.number}:${CLAIM}`, 'label start: no /fire call, no URL and no token needed; the claim label is set once, which is the event the task listens for');
  ok(receiptAtClaim === 1 && marks.findIndex((b) => b.startsWith(FIRE_MARK)) === 0 && marks.some((b) => b.startsWith(START_MARK)) && issues.get(40).comments.some((c) => /signalled/.test(c.body)) && ledger(st.comments).filter((e) => e.kind === 'fire').length === 1, 'label start: the receipt is already on the STATE issue when the claim label is set, so no run starts uncounted; it counts like any run and the woken issue is told');
  const started = () => run(['started', '--repo', 'o/r'], { GITHUB_ACTIONS: '', WAKE_REREAD_MS: '1' });
  const okd = await started();
  ok(okd.code === 0 && /^WAKE-START: OK/m.test(okd.out) && st.comments.filter((c) => c.body.startsWith(USED_MARK)).length === 1, 'label start: a run the job signalled is told it may work, and its start is recorded as taken on the STATE issue');
  {
    // one start, one run: the claim set again by anyone (after the run ended, or while it works) starts nothing that works
    const second = await started();
    ok(second.code === 4 && /^WAKE-START: REFUSED/m.test(second.out) && /already took/.test(second.out), 'label start: a second run on the same receipt is refused while the claim is held');
    st.labels = []; st.labels = [CLAIM];
    const readded = await started();
    ok(readded.code === 4 && /^WAKE-START: REFUSED/m.test(readded.out) && st.comments.filter((c) => c.body.startsWith(USED_MARK)).length === 1, 'label start: the claim label put back within the window by anyone but the job is refused: the receipt was spent');
    const keep = st.comments;
    st.comments = keep.filter((c) => !c.body.startsWith(USED_MARK));
    raceUsed = true;
    const raced = await started();
    raceUsed = false;
    ok(raced.code === 4 && /another run took this start first/.test(raced.out), 'label start: of two runs racing for one receipt, only the one whose record is the oldest works');
    // the job's fresh, unspent receipt without the claim on the STATE issue (taken off, or set on another issue) lets nothing work
    st.comments = keep.filter((c) => !c.body.startsWith(USED_MARK)); st.labels = []; issues.get(40).labels.push(CLAIM);
    const noClaim = await started();
    ok(noClaim.code === 4 && /does not carry/.test(noClaim.out) && !st.comments.some((c) => c.body.startsWith(USED_MARK)), 'label start: a fresh receipt without the claim on the STATE issue is refused and spends nothing');
    issues.get(40).labels = issues.get(40).labels.filter((x) => x !== CLAIM); st.labels = [CLAIM];
    // a rival's older record that the first listing does not show yet is still found: the run reads again
    st.comments = keep.filter((c) => !c.body.startsWith(USED_MARK));
    raceUsed = true; hideUsedOnce = 1;
    const lagRace = await started();
    raceUsed = false; hideUsedOnce = 0;
    ok(lagRace.code === 4 && /another run took this start first/.test(lagRace.out), 'label start: a listing that lags is read again, so an older record from a racing run still wins');
    // a run whose own record would not count (its account cannot write) may not work: it could take the start again and again
    st.comments = keep.filter((c) => !c.body.startsWith(USED_MARK));
    postAs = { user: { login: 'reader', type: 'User' }, author_association: 'NONE' };
    const reader = await started();
    postAs = null;
    ok(reader.code === 4 && /could not be recorded/.test(reader.out), 'label start: a run that cannot leave a record that counts is refused');
    // a stranger's comment on a public repository is no record: it cannot refuse the run
    st.comments = keep.filter((c) => !c.body.startsWith(USED_MARK));
    issues.get(40).comments.push({ id: 5, user: { login: 'stranger', type: 'User' }, author_association: 'NONE', body: `${USED_MARK}\nx`, created_at: new Date().toISOString() });
    const stranger = await started();
    ok(stranger.code === 0 && /^WAKE-START: OK/m.test(stranger.out), 'label start: a marked comment from an account that cannot write to the repository refuses nothing');
    issues.get(40).comments = issues.get(40).comments.filter((c) => c.id !== 5);
    // a listing that lags behind the run's own comment does not waste the start
    st.comments = keep.filter((c) => !c.body.startsWith(USED_MARK));
    hideNewest = true;
    const lag = await started();
    hideNewest = false;
    ok(lag.code === 0 && /^WAKE-START: OK/m.test(lag.out) && (await started()).code === 4, 'label start: a listing that does not show the run\'s own record yet still lets that run work, once');
    st.comments = keep;
  }
  const again = await fire('labeled', 40, WAKE, LABEL);
  ok(again.code === 0 && labelEvents.length === at + 1 && /a run is on/.test(again.out), 'label start: while the claim is held, a second wake sets no second label');
  st.labels = []; st.comments = [];
  labelsRefused = true;
  const bad = await fire('labeled', 40, WAKE, LABEL);
  labelsRefused = false;
  ok(bad.code === 1 && st.comments.some((c) => c.body.startsWith(FAIL_MARK)) && failStreak(ledger(st.comments)) === 1, 'label start: a label GitHub did not confirm is a failed start, recorded and counted');
  st.labels = []; st.comments = []; issues.get(40).comments = [];
  labelsRefused = 'error';
  const lost = await fire('labeled', 40, WAKE, LABEL);
  labelsRefused = false;
  ok(lost.code === 1 && !st.labels.includes(CLAIM) && failStreak(ledger(st.comments)) === 1 && issues.get(40).comments.some((c) => /No coordinator run started/.test(c.body)), 'label start: a label GitHub refuses with an error is a failed start too: recorded, counted, no claim left, the woken issue told');
  {
    // GitHub set the label but its answer was lost: a run may already be starting. The failure is on record
    // before the claim goes, so that run is refused and none works without a claim.
    st.labels = []; st.comments = []; issues.get(40).comments = []; failAtUnclaim = null;
    labelsRefused = 'lost';
    const gone = await fire('labeled', 40, WAKE, LABEL);
    labelsRefused = false;
    st.labels = [CLAIM];   // as the run that the lost label started would still see it for a moment
    const late = await started();
    ok(gone.code === 1 && failAtUnclaim === true && failStreak(ledger(st.comments)) === 1 && late.code === 4 && /not a start/.test(late.out), 'label start: when the label was set but its answer lost, the failure is recorded before the claim is removed, and the run it started is refused');
    st.labels = []; st.comments = []; issues.get(40).comments = [];
  }
  {
    // a claim label set by anyone but the job has no receipt: that run must not work, so the caps hold
    st.labels = [CLAIM]; st.comments = [];
    const forged = await started();
    ok(forged.code === 4 && /^WAKE-START: REFUSED/m.test(forged.out), 'label start: a claim label with no receipt from the job is refused, whoever set it');
    st.comments = [{ user: { login: 'owner', type: 'User' }, body: `${FIRE_MARK}{"issue":40,"via":"label","sig":""} -->\nStarting a run.`, created_at: new Date().toISOString() }];
    ok((await started()).code === 4, 'label start: a receipt a person posted does not count');
    const M = 60000, f = (min, kind = 'fire') => ({ kind, at: now - min * M, issue: 40 });
    ok(startOk({ ledger: [f(1)], stateClaimed: true, now }).ok && !startOk({ ledger: [f(1)], stateClaimed: false, now }).ok
      && !startOk({ ledger: [f(START_WINDOW_MIN + 1)], stateClaimed: true, now }).ok && !startOk({ ledger: [f(2), f(1, 'fail')], stateClaimed: true, now }).ok
      && !startOk({ ledger: [], stateClaimed: true, now }).ok && startOk({ ledger: [f(3, 'fail'), f(1)], stateClaimed: true, now }).ok
      && !startOk({ ledger: [f(1)], stateClaimed: true, used: 1, now }).ok
      && !startOk({ ledger: [{ ...f(1), at: now - 3000, id: 50 }, { kind: 'fire', at: now - 2000, issue: 7, via: 'handoff', id: 51 }], stateClaimed: true, now }).ok
      && startOk({ ledger: [{ ...f(1), at: now - 3000, id: 50 }, { kind: 'fire', at: now - 2000, issue: 7, via: 'handoff', id: 51, seen: 49 }], stateClaimed: true, now }).issue === 40
      && !startOk({ ledger: [{ ...f(1), at: now - 3000, id: 50 }, { kind: 'fire', at: now - 2000, issue: 7, via: 'handoff', id: 51, seen: 50 }], stateClaimed: true, now }).ok
      && !startOk({ ledger: [f(2), { kind: 'fire', at: now - 1000, issue: 7, via: 'handoff' }], stateClaimed: true, now }).ok
      && !startOk({ ledger: [{ ...f(0), at: now - START_WINDOW_MIN * 60000 - 20000 }], stateClaimed: true, now }).ok
      && usedSince([{ id: 2, user: bot, body: `${USED_MARK}\nx`, created_at: new Date(now).toISOString() }, { id: 1, author_association: 'OWNER', body: `${USED_MARK}\nx`, created_at: new Date(now).toISOString() }, { id: 3, user: bot, body: `${USED_MARK}\nold`, created_at: new Date(now - 5 * M).toISOString() }, { id: 4, user: bot, body: 'no mark', created_at: new Date(now).toISOString() }, { id: 0, author_association: 'CONTRIBUTOR', user: { type: 'User' }, body: `${USED_MARK}\nx`, created_at: new Date(now).toISOString() }], now).map((c) => c.id).join() === '1,2',
      `label start: only a claim on the STATE issue with the job's own start receipt as its newest, at most ${START_WINDOW_MIN} minutes old and not yet taken by a run, lets a run work`);
    st.labels = []; st.comments = [];
  }
  {
    // K064 (harness-kit#90): the job decided with no claim on; before its receipt landed, a hand-off decided too,
    // claimed, wrote its receipt, kept its start after its settle time and started its run. The job's receipt
    // lands more than the settle time later: the job backs off, so only the hand-off's run works.
    st.labels = []; st.comments = []; issues.get(40).comments = [];
    const at = labelEvents.length;
    lateHandoff = HANDOFF_SETTLE_MS + 2000;
    const late = await fire('labeled', 40, WAKE, LABEL);
    const labelRun = await started();
    ok(late.code === 0 && /backed off/.test(late.out) && labelEvents.length === at && st.labels.includes(CLAIM) && st.comments.some((c) => c.body.startsWith(BACKOFF_MARK)) && !st.comments.some((c) => c.body.startsWith(START_MARK))
      && /run another project started is on/.test(issues.get(40).comments.at(-1).body) && issues.get(40).labels.includes(WAKE)
      && labelRun.code === 4 && /hand-off, which starts its own run/.test(labelRun.out) && !st.comments.some((c) => c.body.startsWith(USED_MARK)),
    'label start (K064): a job receipt that lands more than the settle time after a hand-off that kept its start backs off: it leaves the claim alone, sets no label, starts nothing, and the label run the hand-off\'s claim began is refused: one working run');
    // the same moment the other way round: the hand-off claimed first and then yielded to this receipt (written
    // within its settle time). The job must not back off then, or no run works and the claim waits 6 hours.
    st.labels = []; st.comments = []; issues.get(40).comments = [];
    lateHandoff = 3000;
    const same = await fire('labeled', 40, WAKE, LABEL);
    const jobRun = await started();
    ok(same.code === 0 && !/backed off/.test(same.out) && labelEvents.slice(at).join() === `${st.number}:${CLAIM}` && st.comments.some((c) => c.body.startsWith(START_MARK)) && !st.comments.some((c) => c.body.startsWith(BACKOFF_MARK))
      && jobRun.code === 0 && /^WAKE-START: OK/m.test(jobRun.out),
    'label start (K064): a hand-off that claimed first and yielded to the job\'s receipt within its settle time does not make the job back off: the job sets the claim again and its run works');
    // /fire: the same back-off, and no call to the task
    st.labels = []; st.comments = []; issues.get(40).comments = [];
    const before = fires.length;
    lateHandoff = HANDOFF_SETTLE_MS + 2000;
    const lateFire = await fire('labeled', 40, WAKE);
    ok(lateFire.code === 0 && /backed off/.test(lateFire.out) && fires.length === before && st.labels.includes(CLAIM) && st.comments.some((c) => c.body.startsWith(BACKOFF_MARK)),
      '/fire (K064): the job backs off the same way: no call to the task, and the claim stays with the hand-off\'s run');
    // the hand-off's start failed and was released before the job's receipt: the job must start (in /fire mode
    // it set the claim itself, and backing off would leave that claim with no run behind it for 6 hours)
    st.labels = []; st.comments = []; issues.get(40).comments = [];
    lateHandoff = HANDOFF_SETTLE_MS + 2000; lateFailed = true;
    const released = await fire('labeled', 40, WAKE);
    ok(released.code === 0 && !/backed off/.test(released.out) && fires.length === before + 1 && !st.comments.some((c) => c.body.startsWith(BACKOFF_MARK)),
      '/fire (K064): a hand-off start released before the job\'s receipt keeps nothing: the job starts its run');
    // the receipts cannot be read back after the job's receipt: it may hide a hand-off that kept its start, so the
    // job fails closed: no call, its receipt marked failed, the claim left as it is, the job red
    // only the repository-wide listing fails: the STATE issue's own comments show the hand-off, so the job backs off
    st.labels = []; st.comments = []; issues.get(40).comments = [];
    lateHandoff = HANDOFF_SETTLE_MS + 2000; listDown = 1;
    const half = await fire('labeled', 40, WAKE, { WAKE_REREAD_MS: '1' });
    listDown = 0;
    ok(half.code === 0 && /backed off/.test(half.out) && fires.length === before + 1 && st.comments.some((c) => c.body.startsWith(BACKOFF_MARK)),
      '/fire (K064): when only the repository-wide listing fails, the job reads the STATE issue\'s own comments, finds the hand-off and backs off');
    st.labels = []; st.comments = []; issues.get(40).comments = [];
    lateHandoff = HANDOFF_SETTLE_MS + 2000; listDown = 1; listAll = true;
    const blind = await fire('labeled', 40, WAKE, { WAKE_REREAD_MS: '1' });
    listDown = 0; listAll = false;
    const blindL = ledger(st.comments);
    ok(blind.code === 1 && fires.length === before + 1 && st.labels.includes(CLAIM) && blindL.at(-1).kind === 'fail' && failStreak(blindL) === 1 && /could not be read back/.test(issues.get(40).comments.at(-1).body) && issues.get(40).labels.includes(WAKE),
      '/fire (K064): a job that cannot read the receipts back after its own fails closed: no call to the task, its receipt marked failed, the claim left alone, the wake label kept');
    st.labels = []; st.comments = []; issues.get(40).comments = [];
    lateHandoff = HANDOFF_SETTLE_MS + 2000; listDown = 1; listAll = true;
    const at2 = labelEvents.length;
    const blindLabel = await fire('labeled', 40, WAKE, { ...LABEL, WAKE_REREAD_MS: '1' });
    listDown = 0; listAll = false;
    ok(blindLabel.code === 1 && labelEvents.length === at2 && (await started()).code === 4,
      'label start (K064): the same blind read-back sets no claim label, and the run the hand-off\'s claim began is refused');
    st.labels = []; st.comments = []; issues.get(40).comments = []; issues.get(40).labels = [WAKE];
  }
  ok((await fire('labeled', 40, WAKE, { ...LABEL, WAKE_START: 'yes' })).code === 1, 'any other value of WAKE_START still needs the /fire URL and token');
  issues.get(40).labels = []; st.labels = []; st.comments = [];
}
const s = JSON.parse((await run(['status', '--repo', 'o/r'])).out);
ok(s.state === st.number && s.emptyStreak === 0 && s.cap === DAILY_CAP && s.claim.length === 0 && s.failStreak === 0, 'status shows what the next decision reads');

// --- the hand-off between projects (K056): the same decision, started from inside a session ---------
{
  const person = { login: 'owner', type: 'User' };
  const it = woke(5, { labels: [] });
  const d = decide({ event: 'handoff', issue: it, now });
  ok(d.act === 'fire' && d.target === 5 && d.via === 'handoff' && decide({ event: 'handoff', now }).act === 'fire' && decide({ event: 'handoff', now }).target === null, 'a hand-off from another project starts a run, for its issue or for the queue as it stands');
  ok(decide({ event: 'handoff', issue: it, claim: true, ledger: [fireAt(1)], now }).act === 'none' && decide({ event: 'handoff', issue: it, paused: true, now }).act === 'none'
    && decide({ event: 'handoff', issue: woke(5, { labels: [STOPPED] }), now }).act === 'none' && decide({ event: 'handoff', issue: woke(5, { open: false }), now }).act === 'none',
  'a hand-off starts nothing while a run is on, while wakes are paused, for a stopped issue or for a closed one: one run at a time and every stop hold');
  ok(decide({ event: 'handoff', issue: it, ledger: Array.from({ length: DAILY_CAP }, (_, i) => fireAt((i + 1) * 23 / DAILY_CAP, 100 + i)), now }).act === 'capped'
    && decide({ event: 'handoff', issue: it, ledger: Array.from({ length: ISSUE_CAP }, (_, i) => fireAt(i + 1, 5)), now }).act === 'capped'
    && decide({ event: 'handoff', issue: it, ledger: [fireAt(5), { kind: 'fail', at: now - 5 * H + 1 }, fireAt(4), { kind: 'fail', at: now - 4 * H + 1 }, fireAt(3), { kind: 'fail', at: now - 3 * H + 1 }], now }).act === 'pause',
  'a hand-off is under the same caps and the same stop after failed starts as a wake label: none of them changed');
  const writer = { user: person, author_association: 'OWNER' }, stranger = { user: { login: 'passer-by', type: 'User' }, author_association: 'NONE' };
  const l = ledger([
    { ...writer, id: 11, created_at: '2026-11-07T10:00:00Z', body: `${HANDOFF_MARK}{"issue":5,"via":"handoff","from":"o/s"} -->\nStarting` },
    { ...writer, created_at: '2026-11-07T10:01:00Z', body: `${HANDOFF_FAIL_MARK}\nNot started` },
    { ...writer, author_association: 'COLLABORATOR', created_at: '2026-11-07T10:02:00Z', updated_at: '2026-11-07T11:00:00Z', body: `${HANDOFF_MARK}{"issue":6} -->\nedited later` },
    { ...writer, created_at: '2026-11-07T10:03:00Z', body: `${FIRE_MARK}{"issue":7} -->\nforged` },
    { ...writer, created_at: '2026-11-07T10:04:00Z', body: `${HANDOFF_MARK}null -->` },
  ]);
  ok(l.length === 4 && l[0].kind === 'fire' && l[0].via === 'handoff' && l[0].issue === 5 && l[0].id === 11 && l[1].kind === 'fail' && l[2].issue === 6 && l[3].issue === null && failStreak(l.slice(0, 2)) === 1,
    'a hand-off receipt by an account that may write here counts as a run, its failed start as a failed start, a damaged one still counts, and nobody can forge the job\'s own receipt');
  const flood = ledger([...Array.from({ length: DAILY_CAP }, (_, i) => ({ ...stranger, created_at: new Date(now - (i + 1) * 60e3).toISOString(), body: `${HANDOFF_MARK}{} -->` })),
    ...[1, 2, 3].flatMap((i) => [{ ...stranger, created_at: new Date(now - i * H).toISOString(), body: `${HANDOFF_MARK}{} -->` }, { ...stranger, created_at: new Date(now - i * H + 1000).toISOString(), body: `${HANDOFF_FAIL_MARK}` }]),
    { user: person, created_at: new Date(now - 5000).toISOString(), body: `${HANDOFF_MARK}{} -->` }]);
  ok(flood.length === 0 && decide({ event: 'labeled', label: WAKE, issue: woke(), ledger: flood, now }).act === 'fire', 'a stranger\'s comments on a public repository count for nothing: they can neither use a cap up nor pause the wakes');
  const hf = (id, s, via = 'handoff') => ({ kind: 'fire', id, at: now + s * 1000, via });
  ok(keepsStart(2, [hf(2, 0)]) && keepsStart(2, [hf(2, 0), hf(3, 1)]) && !keepsStart(3, [hf(2, 0), hf(3, 1)]) && !keepsStart(3, [hf(2, 0), hf(3, 0)]) && keepsStart(2, [hf(2, 0), hf(3, 0)])
    && !keepsStart(2, [hf(2, 0), hf(3, 1, 'label')]) && !keepsStart(2, [hf(1, -1, 'queue'), hf(2, 0)]) && !keepsStart(2, []),
  'two starts written at the same moment: the earliest hand-off receipt keeps the run, a hand-off always yields to the job, and one that cannot read its own receipt back starts nothing');
  {
    // K064: one rule for the job and the hand-off. h: a hand-off receipt (id 20, read up to 10); j: a job receipt.
    const S = HANDOFF_SETTLE_MS;
    const h = { kind: 'fire', via: 'handoff', id: 20, at: now, seen: 10, rule: HANDOFF_RULE };
    const j = (id, ms, seen, via = 'label') => ({ kind: 'fire', via, id, at: now + ms, seen });
    ok(jobBacksOff(h, j(30, S + 1, 15)) && !jobBacksOff(h, j(30, S, 15)) && !jobBacksOff(h, j(30, 3000, 15)) && !jobBacksOff(h, j(15, -2000, 9))
      && jobBacksOff(h, j(9, -2000, 5)) && !jobBacksOff(h, j(30, S + 1, 20)) && !jobBacksOff(h, j(30, S + 1, null)) && !jobBacksOff({ ...h, rule: null }, j(30, S + 1, 15))
      && !jobBacksOff(h, j(30, S + 1, 15, 'handoff')) && !jobBacksOff(h, { ...j(30, S + 1, 15), kind: 'fail' }),
    'K064: the job backs off from a hand-off it had not read only when the hand-off read the job\'s receipt or wrote its own more than the settle time before; never from one it read, and receipts from before K064 never back it off');
    const kept = [h, j(30, S + 1000, 15)], same = [h, j(30, 3000, 15)];
    ok(keepsStart(20, kept) && !keepsStart(20, same) && !keepsStart(20, [h, j(30, S + 1000, null)]) && !keepsStart(20, [h, j(30, S + 1000, 25)]),
      'K064: a hand-off keeps its start against a job receipt that came after its settle time (the job backs off), and still yields to one within it, to one from before K064, and to one whose job read it');
    const M = 60000, at = now + 2 * S;
    ok(!startOk({ ledger: kept, stateClaimed: true, now: at }).ok && /hand-off/.test(startOk({ ledger: kept, stateClaimed: true, now: at }).why)
      && startOk({ ledger: same, stateClaimed: true, now: at }).ok
      && startOk({ ledger: [h, j(30, S + 1000, null)], stateClaimed: true, now: at }).ok
      && startOk({ ledger: [...kept, j(40, 5 * M, 30)], stateClaimed: true, now: now + 6 * M }).ok,
    'K064: `started` refuses the run a backed-off job receipt would start, judged from the receipts alone (before the job\'s note lands), still passes a job receipt the hand-off yielded to, and the next job receipt that read them starts again');
    // GitHub gives comment times in whole seconds. For every pair of real write times (100 ms steps): a job
    // receipt the hand-off cannot have read (written after its read) makes the job back off, and one the rule
    // says the hand-off yields to was already written when it read. So the two never disagree.
    const sec = (ms) => Math.floor(ms / 1000) * 1000;
    let agree = true;
    for (let hr = 0; hr < 1000; hr += 100) for (let jr = hr; jr < hr + HANDOFF_READ_MS + 3000; jr += 100) {
      const backs = jobBacksOff({ ...h, at: sec(now + hr) }, j(30, sec(now + jr) - now, 15));
      const read = now + hr + HANDOFF_READ_MS;   // the earliest moment the hand-off reads the receipts
      if (now + jr >= read && !backs) agree = false;   // possibly unread by the hand-off, so it kept: the job must back off
    }
    ok(agree && HANDOFF_READ_MS >= HANDOFF_SETTLE_MS + 1000, 'K064: with whole-second times the hand-off reads only after every job receipt the rule makes it yield to exists, so a receipt it missed always backs the job off');
    const fail = (id, released) => ({ kind: 'fail', via: 'handoff', id, released, at: now + 9000 });
    ok(!jobBacksOff(h, j(30, S + 1, 15), [fail(25, 20)]) && jobBacksOff(h, j(30, S + 1, 15), [fail(35, 20)]) && jobBacksOff(h, j(30, S + 1, 15), [fail(25, 19)])
      && startOk({ ledger: [h, fail(25, 20), j(30, S + 1, 15)], stateClaimed: true, now: at }).ok && !startOk({ ledger: [h, j(30, S + 1, 15), fail(35, 20)], stateClaimed: true, now: at }).ok,
    'K064: a hand-off start released (--failed) before the job\'s receipt keeps nothing, so the job starts and its run works; released after it, the job had already backed off and the released claim starts the next run');
  }
  ok(chainLength([{ ...fireAt(9, 7), via: 'queue' }, { ...fireAt(5, 8), via: 'handoff' }]) === 0, 'a hand-off is an outside wake: it ends a chain of runs that only started each other');
  ok(runTaskOf('{"runTask":"trig_01AbC"}') === 'trig_01AbC' && runTaskOf('{"runTask":"https://evil.test/fire"}') === null && runTaskOf('{}') === null && runTaskOf('not json') === null, 'the run task is a scheduled task id from the receiving repository, nothing else');
  const fireD = { act: 'fire', why: 'w' }, open = woke(5, { labels: [] });
  ok(handoffPlan(fireD, { task: 'trig_1', issue: open }).say === 'START' && handoffPlan(fireD, { task: 'trig_1', issue: open }).label === false && handoffPlan(fireD, { task: 'trig_1' }).claim === true, 'START claims and sets no wake label: the run is started here, not by the label');
  ok(handoffPlan(fireD, { task: null, issue: open }).say === 'QUEUED' && handoffPlan(fireD, { task: null }).say === 'NOTHING', 'a repository that names no run task gets the label to wait on, or nothing when no issue was named');
  ok(handoffPlan({ act: 'none', why: 'a run is on' }, { task: 'trig_1', issue: open }).label === true && handoffPlan({ act: 'capped', why: 'c' }, { task: 'trig_1', issue: open }).say === 'QUEUED'
    && handoffPlan({ act: 'pause', why: 'p' }, { task: 'trig_1', issue: open }).claim === false && handoffPlan({ act: 'stop-item', why: 's' }, { task: 'trig_1', issue: open }).label === false
    && handoffPlan({ act: 'none', why: 'stopped' }, { task: 'trig_1', issue: woke(5, { labels: [STOPPED] }) }).say === 'NOTHING',
  'refused, a hand-off leaves the wake label for the run that is on or the next start; it never sets a stop and never labels a stopped issue');
}
{
  const handoff = (args, env) => run(['handoff', '--repo', 'o/r', ...args], { GITHUB_ACTIONS: '', HANDOFF_SETTLE_MS: '0', ...env });
  const before = fires.length, marks = (m) => st.comments.filter((c) => c.body.startsWith(m)).length;
  add({ number: 21, body: 'answered: the sender waits on this' });
  const n0 = await handoff(['--issue', '21', '--from', 'o/sender']);
  ok(n0.code === 0 && /HANDOFF: QUEUED .*names no coordinator-run task/.test(n0.out) && issues.get(21).labels.includes(WAKE) && !st.labels.includes(CLAIM) && marks(HANDOFF_MARK) === 0, 'a repository that names no run task: the wake label is set and waits; no claim, no receipt');
  issues.get(21).labels = [];
  const byHand = await handoff(['--issue', '21', '--task', 'trig_01SENDER', '--dry']), badTask = await handoff(['--issue', '21', '--task', 'https://evil.test/fire', '--dry']);
  taskFile = '{"runTask":"trig_01RECV"}';
  const own = await handoff(['--issue', '21', '--task', 'trig_01SENDER', '--dry']);
  ok(/would START trig_01SENDER/.test(byHand.out) && /HANDOFF: QUEUED/.test(badTask.out) && /would START trig_01RECV/.test(own.out), 'the sender may name the run task only while the receiver names none, and only as a task id: the receiver\'s own file wins');
  const dry = await handoff(['--issue', '21', '--dry']);
  ok(/HANDOFF: DRY would START trig_01RECV/.test(dry.out) && !/HANDOFF: START/.test(dry.out) && !st.labels.includes(CLAIM) && marks(HANDOFF_MARK) === 0, '--dry prints the decision under its own word, never the START line a session obeys, and writes nothing');
  const h1 = await handoff(['--issue', '21', '--from', 'o/sender']);
  ok(h1.code === 0 && /HANDOFF: START trig_01RECV \(o\/r #21\)/.test(h1.out.trim().split('\n').at(-1)) && /with this id and no text/.test(h1.out) && !/hint:/.test(h1.out) && st.labels.includes(CLAIM) && st.comments.at(-1).body.startsWith(HANDOFF_MARK) && /o\/sender/.test(st.comments.at(-1).body)
    && fires.length === before && !issues.get(21).labels.includes(WAKE), 'START: the claim and the receipt are written first, the last line names the task for fire_trigger, and no outside /fire call is made');
  // K057: in a project that starts by label, this claim fires the label trigger too; the hand-off starts its own run
  const byLabel = await run(['started', '--repo', 'o/r'], { GITHUB_ACTIONS: '', WAKE_REREAD_MS: '1' });
  ok(byLabel.code === 4 && /^WAKE-START: REFUSED .*hand-off/m.test(byLabel.out) && !st.comments.some((c) => c.body.startsWith(USED_MARK)) && st.labels.includes(CLAIM),
    'label start: a run the hand-off\'s claim label started is refused and writes nothing, so a hand-off is one working run (the one fire_trigger starts)');
  add({ number: 22 });
  const h2 = await handoff(['--issue', '22']);
  ok(/HANDOFF: QUEUED a run is on/.test(h2.out) && issues.get(22).labels.includes(WAKE) && marks(HANDOFF_MARK) === 1, 'a second hand-off while that run is on starts nothing: its wake label waits for the run\'s end (one run at a time)');
  ok(/HANDOFF: NOTHING no hand-off start is open/.test((await handoff(['--issue', '22', '--failed', 'another sender'])).out) && st.labels.includes(CLAIM), '--failed for another item releases nothing: the claim of the run that is on stays');
  const f = await handoff(['--issue', '21', '--failed', 'fire_trigger refused: not allowed']);
  ok(/HANDOFF: QUEUED the start failed/.test(f.out) && !st.labels.includes(CLAIM) && st.comments.at(-1).body.startsWith(HANDOFF_FAIL_MARK) && issues.get(21).labels.includes(WAKE), 'a start that failed releases the claim, is marked failed and leaves the wake label for the next start');
  ok(/HANDOFF: NOTHING no hand-off start is open/.test((await handoff(['--failed', 'again'])).out) && marks(HANDOFF_FAIL_MARK) === 1, '--failed releases only a start a hand-off claimed: a second call does nothing');
  // the receiver lowered its cap: a session cannot read its Actions variable, so its file carries the number
  const fires24 = () => [...issues.values()].flatMap((i) => i.comments).filter((c) => c.body.startsWith(FIRE_MARK) || c.body.startsWith(HANDOFF_MARK)).length;
  taskFile = JSON.stringify({ runTask: 'trig_01RECV', dailyCap: fires24() });
  const cap = await handoff(['--issue', '22']);
  taskFile = JSON.stringify({ runTask: 'trig_01RECV', dailyCap: fires24() + 1 });
  const under = await handoff(['--issue', '22', '--dry']);
  taskFile = '{"runTask":"trig_01RECV"}';
  ok(/HANDOFF: QUEUED the daily cap is reached/.test(cap.out) && marks(HANDOFF_MARK) === 1 && /would START/.test(under.out) && capOf('{"dailyCap":500}') === DAILY_CAP && capOf('nope') === DAILY_CAP && capOf('{"dailyCap":3}') === 3,
    'hand-off starts count against the same daily cap as the job\'s runs, and a cap the receiver lowered in its file holds for hand-offs too (lower only)');
  issues.get(22).labels = [STOPPED];
  ok(/HANDOFF: NOTHING #22 is stopped/.test((await handoff(['--issue', '22'])).out) && !issues.get(22).labels.includes(WAKE), 'a stopped issue is never labelled or started for');
  {
    // the wake job writes its own receipt in the same moment: the hand-off yields and starts nothing
    for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(HANDOFF_MARK) && !c.body.startsWith(HANDOFF_FAIL_MARK) && !c.body.startsWith(FIRE_MARK));
    st.labels = []; issues.get(21).labels = [];
    rival = `${FIRE_MARK}{"issue":9,"via":"label","sig":""} -->\nStarting a run (wake label).`;
    const lost = await handoff(['--issue', '21']);
    ok(/HANDOFF: QUEUED another start was written at the same moment/.test(lost.out) && !/HANDOFF: START/.test(lost.out) && issues.get(21).labels.includes(WAKE) && st.labels.includes(CLAIM), 'two starts at the same moment: the hand-off that does not keep the run starts nothing, leaves the claim with the other and queues its item');
    // K057: in a label project that job receipt's claim started a run; the hand-off that yielded must not refuse it
    const jobRun = await run(['started', '--repo', 'o/r'], { GITHUB_ACTIONS: '', WAKE_REREAD_MS: '1' });
    ok(jobRun.code === 0 && /^WAKE-START: OK/m.test(jobRun.out), 'label start: a hand-off that yielded to a job receipt written after its own does not refuse the job\'s run');
    st.labels = []; issues.get(21).labels = [];
    for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(HANDOFF_MARK) && !c.body.startsWith(FIRE_MARK) && !c.body.startsWith(USED_MARK));
  }
  {
    // K057: the same yield with the job's receipt dated just before the hand-off's (written while it settled, unread when it decided)
    rivalBefore = true;
    rival = `${FIRE_MARK}{"issue":9,"via":"label","sig":""} -->\nStarting a run (wake label).`;
    const lost2 = await handoff(['--issue', '21']);
    const jobRun2 = await run(['started', '--repo', 'o/r'], { GITHUB_ACTIONS: '', WAKE_REREAD_MS: '1' });
    rivalBefore = false;
    ok(/HANDOFF: QUEUED another start/.test(lost2.out) && jobRun2.code === 0 && /^WAKE-START: OK/m.test(jobRun2.out), 'label start: a hand-off that yielded to a job receipt dated just before its own, unread when it decided, does not refuse the job\'s run');
    st.labels = []; issues.get(21).labels = [];
    for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(HANDOFF_MARK) && !c.body.startsWith(FIRE_MARK) && !c.body.startsWith(USED_MARK));
  }
  {
    // K057: the job's receipt is written, the hand-off reads it before the job's claim lands and keeps its
    // start (fire_trigger); the job's claim then starts a label run, which must not work as well
    st.comments.push({ id: ++commentId, user: bot, author_association: 'OWNER', body: `${FIRE_MARK}{"issue":9,"via":"label","sig":""} -->\nRun signalled (wake label).`, created_at: new Date(Date.now() - 1000).toISOString() });
    const kept = await handoff(['--issue', '21']);
    const labelRun = await run(['started', '--repo', 'o/r'], { GITHUB_ACTIONS: '', WAKE_REREAD_MS: '1' });
    ok(/HANDOFF: START/.test(kept.out) && labelRun.code === 4 && /hand-off, which starts its own run/.test(labelRun.out) && !st.comments.some((c) => c.body.startsWith(USED_MARK)),
      'label start: a hand-off that read the job\'s receipt and kept its start leaves the job\'s label run refused: one working run');
    st.labels = []; issues.get(21).labels = [];
    for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(HANDOFF_MARK) && !c.body.startsWith(FIRE_MARK) && !c.body.startsWith(USED_MARK));
  }
  {
    // K064, the hand-off's side: a job receipt that did not read this hand-off lands after its settle time (the
    // job backs off): the hand-off keeps its start, the label run is refused, and a failed start is still released
    rivalShift = HANDOFF_SETTLE_MS + 1000;
    rival = (c) => `${FIRE_MARK}${JSON.stringify({ issue: 9, via: 'label', sig: '', seen: c.id - 1 })} -->\nStarting a run (wake label).`;
    const keep = await handoff(['--issue', '21']);
    rivalShift = 0;
    const labelRun = await run(['started', '--repo', 'o/r'], { GITHUB_ACTIONS: '', WAKE_REREAD_MS: '1' });
    ok(/HANDOFF: START/.test(keep.out) && JSON.parse(st.comments.find((c) => c.body.startsWith(HANDOFF_MARK)).body.slice(HANDOFF_MARK.length).split(' -->')[0]).rule === HANDOFF_RULE
      && labelRun.code === 4 && /hand-off, which starts its own run/.test(labelRun.out),
    'K064: a hand-off keeps its start against a job receipt written after its settle time, names the rule in its receipt, and the run the job\'s claim would begin is refused');
    const rel = await handoff(['--issue', '21', '--failed', 'refused']), led21 = ledger(st.comments);
    ok(/HANDOFF: QUEUED the start failed/.test(rel.out) && !st.labels.includes(CLAIM) && led21.find((e) => e.kind === 'fail').released === led21.find((e) => e.via === 'handoff').id,
      'K064: that start, failed, is released although a job receipt came after it: the job backed off, so no claim is left with no run behind it');
    st.labels = []; issues.get(21).labels = [];
    for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(HANDOFF_MARK) && !c.body.startsWith(HANDOFF_FAIL_MARK) && !c.body.startsWith(FIRE_MARK) && !c.body.startsWith(USED_MARK));
    // within its settle time it still yields to a job receipt that carries `seen`, and the job's run works
    rivalShift = 3000;
    rival = (c) => `${FIRE_MARK}${JSON.stringify({ issue: 9, via: 'label', sig: '', seen: c.id - 1 })} -->\nStarting a run (wake label).`;
    const yieldK = await handoff(['--issue', '21']);
    rivalShift = 0;
    const jobRun = await run(['started', '--repo', 'o/r'], { GITHUB_ACTIONS: '', WAKE_REREAD_MS: '1' });
    ok(/HANDOFF: QUEUED another start/.test(yieldK.out) && jobRun.code === 0 && /^WAKE-START: OK/m.test(jobRun.out),
      'K064: within its settle time a hand-off still yields to the job\'s receipt, and the job\'s run works');
    st.labels = []; issues.get(21).labels = [];
    for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(HANDOFF_MARK) && !c.body.startsWith(FIRE_MARK) && !c.body.startsWith(USED_MARK));
  }
  {
    // two senders hand off to the same project in the same moment: exactly one of them starts the run
    add({ number: 23 }); add({ number: 24 });
    const both = await Promise.all([handoff(['--issue', '23'], { HANDOFF_SETTLE_MS: '400' }), handoff(['--issue', '24'], { HANDOFF_SETTLE_MS: '400' })]);
    const starts = both.filter((r) => /HANDOFF: START/.test(r.out)).length, queued = both.filter((r) => /HANDOFF: QUEUED/.test(r.out)).length;
    ok(starts === 1 && queued === 1 && st.labels.includes(CLAIM), 'two hand-offs at the same moment start exactly one run; the other queues its item (one run at a time)');
    // the one that kept the run could not start it: its release works whichever receipt is the newer
    const winner = /HANDOFF: START/.test(both[0].out) ? '23' : '24', loser = winner === '23' ? '24' : '23';
    ok(/HANDOFF: QUEUED the start failed/.test((await handoff(['--issue', winner, '--failed', 'refused'])).out) && !st.labels.includes(CLAIM), 'a start that kept the run and then failed is released, also when the yielding hand-off wrote the newer receipt: no claim is left with no run behind it');
    ok(/HANDOFF: NOTHING no hand-off start is open/.test((await handoff(['--issue', winner, '--failed', 'again'])).out), 'a start already marked failed is not released twice');
    void loser;
    st.labels = []; for (const n of [21, 23, 24]) issues.get(n).labels = [];
    for (const i of issues.values()) i.comments = i.comments.filter((c) => !c.body.startsWith(HANDOFF_MARK));
  }
  st.labels = [PAUSED];
  ok(/HANDOFF: QUEUED wakes are paused/.test((await handoff(['--issue', '21'])).out) && st.labels.join() === PAUSED, 'while wakes are paused a hand-off starts nothing and lifts nothing');
  st.labels = []; issues.get(21).labels = []; issues.get(22).labels = []; taskFile = null;
}
srv.close();

// --- the installed workflow ---------------------------------------------------------------------
const text = readFileSync(join(new URL('..', import.meta.url).pathname, '.harness/templates/workflows/harness-wake.yml'), 'utf8');
const wf = parseYaml(text);
const job = wf.jobs.wake, p = job.permissions;
ok(/\(vars\.WAKE_ROUTINE_URL != '' \|\| vars\.WAKE_START == 'label'\) &&/.test(job.if) && /label\.name == 'wake'/.test(job.if) && /label\.name == 'coordinator-running'/.test(job.if) && /WAKE_START: \$\{\{ vars\.WAKE_START \}\}/.test(text), 'the job is skipped with neither the routine URL nor the label start, and runs only for the wake label or the claim leaving');
ok(job['timeout-minutes'] <= 3 && Object.entries(p).filter(([, v]) => v === 'write').map(([k]) => k).join() === 'issues' && p.contents === 'read', 'it is short and writes only issues (labels and comments), never code');
ok(!/pull_request_target/.test(text) && /sparse-checkout: \.harness\/tools/.test(text) && /default_branch/.test(text) && /secrets\.WAKE_ROUTINE_TOKEN/.test(text), 'it never runs PR code: only the default branch\'s tools, and the token comes from a secret');
ok(String(wf.on.schedule?.[0]?.cron || wf.on.schedule).includes('* * *') && wf.concurrency?.group === 'harness-wake', 'one daily backstop, one decision at a time');

console.log(`test-wake: OK · ${n} checks`);
