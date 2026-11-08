#!/usr/bin/env node
// test-notify — the alert standard (O10, K010) against a stand-in Telegram and GitHub, offline.
//
//   node tools/test-notify.mjs        exit 0 = every case held

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { telegram, store, problem, resolveKey, tick, hush, digestText, setup, isQuiet, loud, TOPICS, raise, summary, summaryText, opsBoard, plainProblems, TEMPLATES, formatProblems, note, retire } from '../.harness/tools/notify.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-notify: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-notify: ok ${n}. ${what}`); };
const at = (iso) => { process.env.ALERTS_NOW = iso; return new Date(iso).getTime(); };

// --- a stand-in Telegram: a forum group the bot administers -----------------------------------------
const tgState = { calls: [], msg: 100, topics: {}, pinned: null, pins: [], forum: true, admin: true };
const json = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
const listen = (handler) => new Promise((done) => { const s = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => handler(req, res, b ? JSON.parse(b) : {})); }); s.listen(0, '127.0.0.1', () => done(s)); });
const tgServer = await listen((req, res, p) => {
  const m = req.url.match(/^\/bot([^/]+)\/(\w+)$/);
  if (!m || m[1] !== 'SECRET-TOKEN') return json(res, 401, { ok: false, description: 'Unauthorized' });
  const method = m[2]; tgState.calls.push({ method, ...p });
  const r = (result) => json(res, 200, { ok: true, result });
  if (method === 'getMe') return r({ id: 7, username: 'example_alerts_bot' });
  if (method === 'getChat') return r({ id: -1001234, title: 'Owner alerts', type: 'supergroup', is_forum: tgState.forum, pinned_message: tgState.pinned });
  if (method === 'getChatMember') return r(tgState.admin ? { status: 'administrator', can_manage_topics: true, can_pin_messages: true } : { status: 'member' });
  if (method === 'createForumTopic') { const id = ++tgState.msg; tgState.topics[p.name] = id; return r({ message_thread_id: id, name: p.name }); }
  if (method === 'sendMessage') { tgState.calls.at(-1).message_id = ++tgState.msg; return r({ message_id: tgState.msg, text: p.text }); }
  if (method === 'closeForumTopic') { if (tgState.closed?.has(p.message_thread_id)) return json(res, 400, { ok: false, description: 'Bad Request: TOPIC_CLOSED' }); return r(true); }
  if (method === 'editMessageText') return r({ message_id: p.message_id, text: p.text });
  if (method === 'getUpdates') return r([{ update_id: 1, my_chat_member: { chat: { id: -1009, title: 'Owner alerts', type: 'supergroup', is_forum: true } } }, { update_id: 2, message: { chat: { id: 55, type: 'private' } } }]);
  if (method === 'pinChatMessage') { const sent = tgState.calls.findLast((c) => c.method === 'sendMessage' && c.message_id === p.message_id) || tgState.calls.findLast((c) => c.method === 'sendMessage'); tgState.pins.push({ message_id: p.message_id, text: sent.text, thread: sent.message_thread_id }); tgState.pinned = tgState.pins.at(-1); return r(true); }
  if (method === 'unpinAllForumTopicMessages') { tgState.pins = tgState.pins.filter((x) => x.thread !== p.message_thread_id); tgState.pinned = tgState.pins.at(-1) || null; return r(true); }
  if (method === 'unpinChatMessage') { const k = tgState.pins.findIndex((x) => x.message_id === p.message_id); if (k < 0) return json(res, 400, { ok: false, description: 'Bad Request: message is not pinned' }); tgState.pins.splice(k, 1); tgState.pinned = tgState.pins.at(-1) || null; return r(true); }
  return json(res, 400, { ok: false, description: `no ${method}` });
});
const base = `http://127.0.0.1:${tgServer.address().port}`;
Object.assign(process.env, { ALERTS_API: base, ALERTS_BOT_TOKEN: 'SECRET-TOKEN', ALERTS_CHAT_ID: '-1001234' });
for (const k of ['ALERTS_TOPICS', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERTS_STORE']) delete process.env[k];
const sends = () => tgState.calls.filter((c) => c.method === 'sendMessage');
const last = () => sends().at(-1);
const mark = () => tgState.calls.length;
const since = (i) => tgState.calls.slice(i).filter((c) => c.method === 'sendMessage');

// quiet hours: 23:00-08:00 in Damascus (UTC+3)
ok(!isQuiet(at('2026-10-05T19:59:00Z')) && isQuiet(at('2026-10-05T20:00:00Z')) && isQuiet(at('2026-10-06T04:59:00Z')) && !isQuiet(at('2026-10-06T05:00:00Z')), 'quiet hours are 23:00-08:00 Damascus time');
ok(loud('needs', false, at('2026-10-05T09:00:00Z')) && !loud('needs', false, at('2026-10-05T21:00:00Z')) && loud('kit', true, at('2026-10-05T21:00:00Z')) && !loud('kit', false, at('2026-10-05T09:00:00Z')), 'only "Needs you" is loud, never in quiet hours; an outage is always loud');

// setup: refuses a group without Topics or without admin rights, then creates every topic once
tgState.forum = false;
await setup(telegram()).then(() => ok(false, 'setup refused a group without Topics'), (e) => ok(/Topics off/.test(e.message), 'setup refuses a group with Topics off'));
tgState.forum = true; tgState.admin = false;
await setup(telegram()).then(() => ok(false, 'setup refused'), (e) => ok(/must be an admin/.test(e.message), 'setup refuses when the bot is not an admin that can manage topics and pin'));
tgState.admin = true;
const first = await setup(telegram());
ok(Object.keys(tgState.topics).length === Object.keys(TOPICS).length && Object.values(TOPICS).every((t) => tgState.topics[t.name]) && tgState.pinned?.text.startsWith('harness-alerts config'), `setup creates every topic and pins the config (${first.filter((l) => l.startsWith('created')).length} created)`);
const again = mark(); await setup(telegram());
ok(!tgState.calls.slice(again).some((c) => c.method === 'createForumTopic' || c.method === 'sendMessage'), 'a second setup changes nothing');
const T = (name) => tgState.topics[TOPICS[name].name];
{ // a message pinned after the config (a test PROBLEM, say) hides it from every sender: setup unpins it, keeps the topics
  const tg0 = telegram(); const stray = await tg0.send('kit', 'PROBLEM · a test'); await tg0.call('pinChatMessage', { chat_id: tg0.chat, message_id: stray });
  const before = mark(); const lines = await setup(telegram());
  ok(lines.includes(`unpinned message ${stray}`) && !tgState.pins.some((x) => x.message_id === stray) && tgState.pins.length === 1 && tgState.pinned?.text.startsWith('harness-alerts config')
    && !tgState.calls.slice(before).some((c) => c.method === 'createForumTopic' || c.method === 'sendMessage'), 'setup unpins anything pinned after the config, so only the config stays pinned, and creates no topic twice');
}
{ // a pin inside a topic that does not hide the config (Telegram may show only General's) is cleared too
  const tg0 = telegram(); const cfg = tgState.pinned; const old = await tg0.send('kit', 'PROBLEM · an old test');
  tgState.pins.unshift({ message_id: old, text: 'PROBLEM · an old test', thread: T('kit') });
  await setup(telegram());
  ok(tgState.pins.length === 1 && tgState.pinned === cfg, 'setup clears every pin inside the topics; the config in General stays');
}

// a silent problem, its repeat, its resolve
const dir = mkdtempSync(join(tmpdir(), 'notify-test-'));
// the rules below run without the hold; the hold has its own cases after them
process.env.ALERTS_HOLD_MINUTES = '0';
const st = store(`file:${join(dir, 'state.json')}`);
const tg = telegram();
at('2026-10-05T09:00:00Z');
let r = await problem(st, tg, { key: 'hands/hands-update', topic: 'kit', text: 'hands-update failed', link: 'https://example.invalid/run/1' });
const original = r.inc.msg;
ok(r.status === 'sent' && last().message_thread_id === T('kit') && last().disable_notification === true && /PROBLEM · hands-update failed/.test(last().text), 'a problem goes silently to its own topic');
ok(last().text.split('\n').at(-1) === 'You: nothing', 'a PROBLEM ends with one "You:" line (default for a silent topic: nothing)');
let i0 = mark();
r = await problem(st, tg, { key: 'hands/hands-update', topic: 'kit', text: 'hands-update failed again' });
ok(r.status === 'repeat' && since(i0).length === 0 && r.inc.count === 2, 'a repeat of an open problem sends nothing (deduplicated) and counts');
at('2026-10-05T10:30:00Z'); i0 = mark();
await tg.call('pinChatMessage', { chat_id: tg.chat, message_id: original }); // someone pinned the problem
ok(tgState.pinned?.message_id === original, 'fixture: the problem is pinned, so senders no longer see the config');
r = await resolveKey(st, tg, { key: 'hands/hands-update', text: 'hands-update green again' });
ok(!tgState.pins.some((x) => x.message_id === original) && tgState.pinned?.text.startsWith('harness-alerts config'), 'a resolved problem never stays pinned: RESOLVED unpins it and the config is the newest pin again');
ok(r.status === 'resolved' && since(i0).length === 1 && last().reply_parameters?.message_id === original && last().message_thread_id === T('kit') && last().text === '✅ Fixed after 1 h 30 min', 'RESOLVED is the short reply "✅ Fixed after …" to the original message, in its topic');
ok((await resolveKey(st, tg, { key: 'hands/hands-update' })).status === 'none', 'resolving a key with nothing open does nothing');

// the "You:" line: one of three forms, given by the sender
at('2026-10-05T09:00:00Z');
await problem(st, tg, { key: 'ops/fixing', topic: 'ops', text: 'backup failed', you: 'Platform coordinator is fixing it' });
ok(last().text.endsWith('\nYou: Platform coordinator is fixing it'), 'a sender names who is fixing it');
await problem(st, tg, { key: 'ops/step', topic: 'ops', text: 'laptop silent', you: 'Needs you: check that the laptop is switched on' });
ok(last().text.endsWith('\nYou: Needs you: check that the laptop is switched on'), 'or the exact step the owner takes');
let bad = null; try { await problem(st, tg, { key: 'ops/bad', topic: 'ops', text: 'x', you: 'run systemctl restart x' }); } catch (e) { bad = e.message; }
ok(/--you is/.test(bad || '') && !(await st.get('ops/bad')), 'any other "You:" line is refused and nothing is recorded');
await resolveKey(st, tg, { key: 'ops/fixing' }); await resolveKey(st, tg, { key: 'ops/step' });

// the hold (a host's file store): sent only if still open 10 minutes after it was first seen
{
  delete process.env.ALERTS_HOLD_MINUTES;
  const hs = store(`file:${join(dir, 'hold.json')}`);
  at('2026-10-05T09:00:00Z'); let h0 = mark();
  let h = await problem(hs, tg, { key: 'vps/timer', topic: 'ops', text: 'cleanup timer has no next run' });
  ok(h.status === 'held' && since(h0).length === 0, 'a new problem in a host store is held, not sent');
  at('2026-10-05T09:02:00Z'); h = await resolveKey(hs, tg, { key: 'vps/timer' });
  ok(h.status === 'closed-unsent' && since(h0).length === 0, 'cleared after 2 minutes (a flap): nothing is ever sent, no PROBLEM and no reply');
  at('2026-10-05T09:04:00Z'); await problem(hs, tg, { key: 'vps/disk', topic: 'ops', text: 'disk 90% full' });
  at('2026-10-05T09:13:00Z'); h = await problem(hs, tg, { key: 'vps/disk', topic: 'ops', text: 'disk 90% full' });
  ok(h.status === 'held' && since(h0).length === 0, 'still failing 9 minutes later: still held');
  at('2026-10-05T09:14:00Z'); h = await problem(hs, tg, { key: 'vps/disk', topic: 'ops', text: 'disk 90% full' });
  ok(h.status === 'repeat' && h.inc.msg && since(h0).length === 1 && /PROBLEM · disk 90% full\nYou: nothing$/.test(last().text), 'still failing 10 minutes after it was first seen: one PROBLEM');
  at('2026-10-05T09:30:00Z'); await resolveKey(hs, tg, { key: 'vps/disk' });
  ok(last().text === '✅ Fixed after 26 min' && last().reply_parameters?.message_id === h.inc.msg, 'its RESOLVED counts from when it was first seen');
  at('2026-10-05T10:00:00Z'); h0 = mark(); await problem(hs, tg, { key: 'vps/feed', topic: 'ops', text: 'feed stale' });
  at('2026-10-05T10:09:00Z'); ok((await tick(hs, tg)).length === 0, 'a tick inside the hold sends nothing');
  at('2026-10-05T10:10:00Z'); ok((await tick(hs, tg)).includes('sent vps/feed') && since(h0).length === 1, 'a tick sends a held problem once its 10 minutes are up');
  await resolveKey(hs, tg, { key: 'vps/feed' });
  h0 = mark(); h = await problem(hs, tg, { key: 'prod/web', topic: 'ops', text: 'site down', outage: true });
  ok(h.status === 'sent' && since(h0).length === 1, 'an outage is never held');
  await resolveKey(hs, tg, { key: 'prod/web' });
  process.env.ALERTS_HOLD_MINUTES = '0';
}

// action-required and outages go to "Needs you"; quiet hours silence all but an outage
at('2026-10-05T09:00:00Z');
await problem(st, tg, { key: 'erp/approve', topic: 'erp', text: 'Approve the migration', action: true });
ok(last().message_thread_id === T('needs') && last().disable_notification === false, 'an action-required problem is loud in "Needs you" by day');
at('2026-10-05T21:00:00Z');
await problem(st, tg, { key: 'web/approve', topic: 'website', text: 'Approve the DNS change', action: true });
ok(last().message_thread_id === T('needs') && last().disable_notification === true, 'in quiet hours "Needs you" is silent too');
await problem(st, tg, { key: 'ops/web-down', topic: 'ops', text: 'Website down', outage: true });
ok(last().message_thread_id === T('needs') && last().disable_notification === false && /OUTAGE/.test(last().text), 'a production outage is loud in "Needs you" even in quiet hours');
await resolveKey(st, tg, { key: 'erp/approve' }); await resolveKey(st, tg, { key: 'web/approve' }); await resolveKey(st, tg, { key: 'ops/web-down' });

// escalation: a silent problem open 3 hours goes to "Needs you" (loud) with a STILL OPEN under the original
at('2026-10-05T10:00:00Z');
r = await problem(st, tg, { key: 'erp/ci', topic: 'erp', text: 'ERP ci red on main' });
const erpMsg = r.inc.msg;
at('2026-10-05T12:59:00Z'); i0 = mark();
ok((await tick(st, tg)).length === 0 && since(i0).length === 0, 'before 3 hours a tick does nothing');
at('2026-10-05T13:00:00Z'); i0 = mark();
let did = await tick(st, tg);
const [esc, still] = since(i0);
ok(esc.text.endsWith("\nYou: Needs you: it has not cleared in 3 hours; pass this message to its project's coordinator"), 'the escalation ends with a "Needs you" line');
ok(did.includes('escalated erp/ci') && esc.message_thread_id === T('needs') && esc.disable_notification === false && esc.text.includes(`/${T('erp')}/${erpMsg}`), 'at 3 hours it is escalated, loud, to "Needs you", linking the original');
ok(still.reply_parameters.message_id === erpMsg && /STILL OPEN after 3 h/.test(still.text) && still.disable_notification === true, 'and a STILL OPEN reply goes silently under the original');
i0 = mark(); await tick(st, tg);
ok(since(i0).length === 0, 'it is escalated once');
at('2026-10-06T13:00:00Z'); i0 = mark(); did = await tick(st, tg);
ok(did.includes('reminded erp/ci') && since(i0)[0].reply_parameters.message_id === erpMsg, 'an open problem gets one STILL OPEN reply a day');
const escMsg = (await st.get('erp/ci')).escMsg;
i0 = mark(); await resolveKey(st, tg, { key: 'erp/ci', text: 'fixed by #12' });
const replies = since(i0).map((c) => [c.message_thread_id, c.reply_parameters.message_id]);
ok(escMsg && JSON.stringify(replies) === JSON.stringify([[T('erp'), erpMsg], [T('needs'), escMsg]]), 'RESOLVED replies to the original and to the escalation');

// the control panel: an acknowledged problem is never escalated or reminded; a muted one not until the mute ends
at('2026-10-05T10:00:00Z');
await problem(st, tg, { key: 'erp/acked', topic: 'erp', text: 'acked' });
await problem(st, tg, { key: 'erp/muted', topic: 'erp', text: 'muted' });
await hush(st, 'erp/acked', { ack: true });
await hush(st, 'erp/muted', { mutedUntil: at('2026-10-06T13:00:00Z') });
at('2026-10-05T13:00:00Z'); did = await tick(st, tg);
ok(!did.some((d) => /erp\/(acked|muted)/.test(d)), 'an acknowledged or muted problem is not escalated');
at('2026-10-06T13:30:00Z'); did = await tick(st, tg);
ok(!did.some((d) => /erp\/acked/.test(d)) && did.includes('escalated erp/muted'), 'once the mute ends it is escalated; the acknowledged one never');
ok((await hush(st, 'erp/none', { ack: true })).status === 'none', 'hushing a problem that is not open does nothing');
i0 = mark(); await resolveKey(st, tg, { key: 'erp/acked' }); await resolveKey(st, tg, { key: 'erp/muted' });
ok(since(i0).filter((c) => /Fixed after/.test(c.text)).length >= 2, 'an acknowledged or muted problem still gets its RESOLVED');

// escalation waits for the end of quiet hours, so it is loud
at('2026-10-05T19:00:00Z');
await problem(st, tg, { key: 'web/deploy', topic: 'website', text: 'deploy failed' });
at('2026-10-05T22:30:00Z'); i0 = mark();
ok((await tick(st, tg)).length === 0, 'in quiet hours a 3-hour-old problem is not escalated yet');
at('2026-10-06T05:05:00Z');
did = await tick(st, tg);
ok(did.includes('escalated web/deploy') && since(i0).find((c) => c.message_thread_id === T('needs')).disable_notification === false, 'it is escalated, loud, when quiet hours end');
await resolveKey(st, tg, { key: 'web/deploy' });

// caps: at most 5 new messages per topic per hour; the rest wait for a tick
at('2026-10-07T09:00:00Z'); i0 = mark();
const flood = [];
for (let k = 0; k < 7; k++) flood.push((await problem(st, tg, { key: `kit/flood-${k}`, topic: 'kit', text: `flood ${k}` })).status);
ok(flood.filter((s) => s === 'sent').length === 5 && flood.filter((s) => s === 'capped').length === 2 && since(i0).length === 5, 'a flood sends 5 messages in an hour; the rest are held');
at('2026-10-07T10:01:00Z'); did = await tick(st, tg);
ok(did.filter((d) => d.startsWith('sent kit/flood')).length === 2, 'the next tick past the hour sends the held ones');
for (let k = 0; k < 7; k++) await resolveKey(st, tg, { key: `kit/flood-${k}` });

// no bot token: recorded and queued, sent by the next tick that has one
delete process.env.ALERTS_BOT_TOKEN;
r = await problem(st, telegram(), { key: 'web/queued', topic: 'website', text: 'queued without a token' });
ok(r.status === 'queued' && r.inc.msg === null, 'without a bot token a problem is recorded, unsent');
process.env.ALERTS_BOT_TOKEN = 'SECRET-TOKEN';
did = await tick(st, telegram());
ok(did.includes('sent web/queued') && last().message_thread_id === T('website'), 'a tick with the token sends it');

// the digest
at('2026-10-07T12:00:00Z');
const digest = await digestText([st]);
ok(/^🗓 Daily · 7 Oct · 1 still open, \d+ new and \d+ resolved in the last 24 h/.test(digest) && digest.includes('queued without a token'), 'the digest counts what opened, resolved and is still open');
await resolveKey(st, telegram(), { key: 'web/queued' });

// the token never appears in an error
process.env.ALERTS_BOT_TOKEN = 'WRONG-SECRET';
await telegram().call('getMe', {}).then(() => ok(false, 'a wrong token fails'), (e) => ok(!e.message.includes('WRONG-SECRET') && /401/.test(e.message), 'a Telegram error never prints the token'));
process.env.ALERTS_BOT_TOKEN = 'SECRET-TOKEN';

// the GitHub store: one issue per problem, a comment per repeat, closed on resolve
const issues = []; const comments = [];
const ghServer = await listen((req, res, p) => {
  const u = new URL(req.url, 'http://x');
  if (req.headers.authorization !== 'Bearer GH-TEST') return json(res, 401, { message: 'Bad credentials' });
  let m;
  if (req.method === 'GET' && u.pathname === '/repos/o/hands/issues') {
    const state = u.searchParams.get('state');
    return json(res, 200, u.searchParams.get('page') === '1' ? issues.filter((i) => i.state === state) : []);
  }
  if (req.method === 'POST' && u.pathname === '/repos/o/hands/issues') { const i = { number: issues.length + 1, state: 'open', html_url: `https://github.invalid/o/hands/issues/${issues.length + 1}`, ...p }; issues.push(i); return json(res, 201, i); }
  if ((m = u.pathname.match(/^\/repos\/o\/hands\/issues\/(\d+)$/)) && req.method === 'PATCH') { Object.assign(issues[m[1] - 1], p); return json(res, 200, issues[m[1] - 1]); }
  if ((m = u.pathname.match(/^\/repos\/o\/hands\/issues\/(\d+)\/comments$/))) { comments.push({ issue: Number(m[1]), ...p }); return json(res, 201, {}); }
  return json(res, 404, { message: 'Not Found' });
});
Object.assign(process.env, { GITHUB_API_URL: `http://127.0.0.1:${ghServer.address().port}`, GH_TOKEN: 'GH-TEST' });
issues.push({ number: 1, state: 'open', body: 'an ordinary issue', html_url: 'x' }, { number: 2, state: 'open', pull_request: {}, body: '<!-- harness-alert: {"key":"pr"} -->' });
const gs = store('github:o/hands');
at('2026-10-08T09:00:00Z');
r = await problem(gs, tg, { key: 'hands/hands-settings', topic: 'kit', text: 'hands-settings failed', title: 'hands-settings failing', link: 'https://run/1' });
ok(r.status === 'sent' && issues[2].title === 'hands-settings failing' && /<!-- harness-alert: \{.*"msg":\d+.*\} -->/.test(issues[2].body), 'in Actions a problem is an issue whose hidden marker keeps the Telegram message id');
r = await problem(gs, tg, { key: 'hands/hands-settings', topic: 'kit', text: 'hands-settings failed', link: 'https://run/2' });
ok(r.status === 'repeat' && comments.at(-1).body === 'Still failing: https://run/2' && issues.length === 3, 'a repeat comments on the same issue and opens no other');
at('2026-10-08T13:00:00Z'); await tick(gs, tg);
ok(/"escalated":\d+/.test(issues[2].body), 'the escalation is recorded on the issue');
r = await resolveKey(gs, tg, { key: 'hands/hands-settings', text: 'green again' });
ok(r.status === 'resolved' && issues[2].state === 'closed' && issues[2].state_reason === 'completed' && /RESOLVED after 4 h/.test(comments.at(-1).body), 'resolve comments and closes the issue');

// the command line: the same rules through argv, and a clean error
const cli = (args, extra = {}) => new Promise((done) => execFile(process.execPath, [fileURLToPath(new URL('../.harness/tools/notify.mjs', import.meta.url)), ...args], { env: { ...process.env, ...extra } }, (err, stdout, stderr) => done({ code: err ? err.code : 0, out: stdout + stderr })));
let c = await cli(['problem', '--key', 'cli/x', '--topic', 'ops', '--text', 'from the CLI'], { ALERTS_STORE: `file:${join(dir, 'cli.json')}` });
ok(c.code === 0 && /notify: sent cli\/x/.test(c.out), 'notify.mjs problem works from the command line');
c = await cli(['resolve', '--key', 'cli/x'], { ALERTS_STORE: `file:${join(dir, 'cli.json')}` });
ok(c.code === 0 && /resolved cli\/x/.test(c.out), 'notify.mjs resolve works from the command line');
c = await cli(['problem', '--key', 'cli/y', '--topic', 'ops', '--text', 'no token'], { ALERTS_STORE: `file:${join(dir, 'cli.json')}`, ALERTS_BOT_TOKEN: '', ALERTS_REQUIRE_SEND: '1' });
ok(c.code === 2 && /recorded but not sent/.test(c.out), 'ALERTS_REQUIRE_SEND=1 makes an unsent problem an error');
c = await cli(['test']);
ok(c.code === 0 && /test message \d+ sent and edited to ✅/.test(c.out) && last().message_thread_id === T('summary') && last().disable_notification === true && tgState.calls.at(-1).method === 'editMessageText', 'notify.mjs test sends one silent message in "Summary" and edits it to ✅ (no technical test text)');

// before setup (or in a private chat) every message still arrives, its topic's name leading it
{
  const saved = tgState.pinned; tgState.pinned = null;
  const flat = telegram();
  at('2026-10-09T09:00:00Z');
  const p = await problem(store(`file:${join(dir, 'flat.json')}`), flat, { key: 'flat/x', topic: 'kit', text: 'before setup' });
  ok(p.status === 'sent' && last().message_thread_id === undefined && last().text.startsWith('[Kit & Hands] 🔴 PROBLEM'), 'a chat without the pinned config gets the message unthreaded, its topic named');
  const before = mark();
  const d = await cli(['digest', '--stores', `file:${join(dir, 'flat.json')}`]);
  ok(d.code === 0 && /daily digest is retired/.test(d.out) && since(before).length === 0, 'no digest goes to a chat that is not the set-up group');
  tgState.pinned = saved;
  const before2 = mark();
  const d2 = await cli(['digest', '--stores', `file:${join(dir, 'flat.json')}`]);
  ok(d2.code === 0 && /daily digest is retired \(K039\)/.test(d2.out) && since(before2).length === 0, 'the daily digest is retired (K039): nothing is posted even to the set-up group');
}
// the group id can come from a file (the control repository keeps it there)
{
  const f = join(dir, 'ALERTS_CHAT_ID'); (await import('node:fs')).writeFileSync(f, '-100777\n');
  delete process.env.ALERTS_CHAT_ID; process.env.ALERTS_CHAT_ID_FILE = f; process.env.TELEGRAM_CHAT_ID = '42';
  ok(telegram().chat === '-100777', 'ALERTS_CHAT_ID_FILE wins over TELEGRAM_CHAT_ID');
  delete process.env.ALERTS_CHAT_ID_FILE; delete process.env.TELEGRAM_CHAT_ID; process.env.ALERTS_CHAT_ID = '-1001234';
}
c = await cli(['find']);
ok(c.code === 0 && /bot @example_alerts_bot/.test(c.out) && /group "Owner alerts" id -1009 \(Topics on\)/.test(c.out) && !/id 55/.test(c.out), 'find names the bot and the groups it was added to, with their ids');

// capped problems (--max-sends, K035): a host that checks every 2 minutes (the file store's 10-minute hold),
// at most one message a day and N in all, never escalated or reminded by tick; RESOLVED still goes out
{
  delete process.env.ALERTS_HOLD_MINUTES;
  const cs = store(`file:${join(dir, 'capped.json')}`), tg = telegram();
  const k = { key: 'vps/stale-sql-live', topic: 'ops', text: 'sql-live: last run 3 days ago', maxSends: 3 };
  let bad = 0;
  for (const o of [{ ...k, maxSends: 0 }, { ...k, maxSends: 11 }, { ...k, maxSends: '2.5' }, { ...k, topic: 'needs' }, { ...k, outage: true }, { ...k, action: true }]) await problem(cs, tg, o).catch(() => { bad++; });
  ok(bad === 6, '--max-sends is 1-10, and never for an outage or "Needs you"');
  const m0 = mark();
  at('2026-10-11T09:00:00Z'); let r = await problem(cs, tg, { ...k, maxSends: '3' });
  for (let i = 1; i <= 4; i++) { at(`2026-10-11T09:0${i * 2}:00Z`); r = await problem(cs, tg, k); }
  ok(r.status === 'held' && since(m0).length === 0, 'a capped problem is held like any other on a host: nothing within its first 10 minutes');
  at('2026-10-11T09:12:00Z'); r = await problem(cs, tg, k);
  const p0 = since(m0)[0];
  ok(since(m0).length === 1 && p0.message_thread_id === T('ops') && p0.disable_notification === true && /^🔴 PROBLEM · sql-live: last run 3 days ago/.test(p0.text), 'then one PROBLEM, silent, in its topic');
  for (const iso of ['2026-10-11T13:00:00Z', '2026-10-11T20:58:00Z']) { at(iso); await problem(cs, tg, { ...k, text: 'sql-live: last run 3 days 4 h ago' }); }
  at('2026-10-11T16:00:00Z'); const tk = await tick(cs, tg);
  ok(since(m0).length === 1 && !tk.length && !since(m0).some((c) => c.message_thread_id === T('needs')), 'the rest of that day: repeats send nothing, and tick neither escalates it to "Needs you" after 3 hours nor reminds it');
  at('2026-10-11T21:05:00Z'); r = await problem(cs, tg, { ...k, text: 'sql-live: last run 3 days 12 h ago' });
  ok(r.status === 'repeat' && since(m0).length === 1, 'a new day in Damascus only 12 hours after the PROBLEM sends nothing yet: a repeat needs a new day and 20 h since the last message');
  at('2026-10-12T06:00:00Z'); r = await problem(cs, tg, { ...k, text: 'sql-live: last run 4 days ago' });
  ok(r.status === 'reminded' && since(m0).length === 2 && since(m0)[1].reply_parameters.message_id === p0.message_id && /^🟠 STILL OPEN after 21 h 0 min \(alert 2 of 3\) · sql-live: last run 4 days ago$/.test(since(m0)[1].text) && since(m0)[1].disable_notification === true,
    'the next morning: one STILL OPEN reply, silent, alert 2 of 3, saying how it stands now');
  at('2026-10-13T06:30:00Z'); r = await problem(cs, tg, k);
  ok(r.status === 'reminded' && since(m0).length === 3 && /\(alert 3 of 3, the last: from now on only a line in the daily digest until it clears\)/.test(since(m0)[2].text), 'the next day, alert 3 of 3, the last');
  for (const iso of ['2026-10-13T21:00:00Z', '2026-10-14T21:00:00Z', '2026-10-15T09:00:00Z']) { at(iso); r = await problem(cs, tg, k); await tick(cs, tg); }
  ok(r.status === 'capped-out' && since(m0).length === 3 && /\(alerted 3 of 3\)/.test(await digestText([cs])), 'after that, nothing more from the sender or tick: one digest line, marked alerted 3 of 3');
  at('2026-10-15T10:00:00Z'); r = await resolveKey(cs, tg, { key: k.key, text: 'sql-live ran' });
  ok(r.status === 'resolved' && since(m0).length === 4 && since(m0)[3].reply_parameters.message_id === p0.message_id && /^✅ Fixed after 4 days/.test(since(m0)[3].text), 'and its RESOLVED still goes out as a reply to the PROBLEM');
  const hk = { key: 'vps/stale-hushed', topic: 'ops', text: 'acknowledged in the panel', maxSends: 3 };
  at('2026-10-20T09:00:00Z'); await problem(cs, tg, hk); at('2026-10-20T09:11:00Z'); await problem(cs, tg, hk);
  await hush(cs, hk.key, { ack: true });
  const mh = mark(); at('2026-10-21T10:00:00Z'); r = await problem(cs, tg, hk);
  ok(r.status !== 'reminded' && since(mh).length === 0, 'an acknowledged capped problem gets no STILL OPEN replies (K025)');
  await resolveKey(cs, tg, { key: hk.key });
  const plain = { key: 'vps/plain', topic: 'ops', text: 'an uncapped problem' };
  at('2026-10-16T09:00:00Z'); await problem(cs, tg, plain); at('2026-10-16T09:11:00Z'); await problem(cs, tg, plain); at('2026-10-17T09:30:00Z'); r = await problem(cs, tg, plain);
  ok(r.status === 'repeat' && !('maxSends' in r.inc), 'without --max-sends a problem behaves as before: a repeat sends nothing (tick escalates and reminds it)');
  await resolveKey(cs, tg, { key: plain.key });
  process.env.ALERTS_HOLD_MINUTES = '0';
}

// hands-report's alert step, as GitHub runs it (bash -e), against the stand-ins: failure opens, success resolves
{
  const { parseYaml } = await import('../.harness/tools/lib.mjs');
  const { symlinkSync, writeFileSync } = await import('node:fs');
  const wf = parseYaml((await import('node:fs')).readFileSync(new URL('../.harness/templates/hands/hands-report.yml', import.meta.url), 'utf8'));
  const step = wf.jobs.report.steps.find((x) => /notify\.mjs ops/.test(x.run || ''));
  const run = step.run.replace(/\$\{\{ github\.server_url \}\}/g, 'https://github.invalid').replace(/\$\{\{ github\.repository \}\}/g, 'o/hands').replace(/\$\{\{ github\.run_id \}\}/g, '99');
  const w = mkdtempSync(join(tmpdir(), 'notify-step-'));
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), join(w, 'kit'));
  writeFileSync(join(w, 'step.sh'), run);
  const sh = (RESULT) => new Promise((done) => execFile('bash', ['-e', join(w, 'step.sh')], { cwd: w, env: { ...process.env, JOB: 'hands-update', RESULT, ALERTS_STORE: 'github:o/hands', ALERTS_REQUIRE_SEND: '1', ALERTS_OPS_BOARD: '' } }, (err, out, errOut) => done({ code: err ? err.code : 0, out: out + errOut })));
  at('2026-10-09T10:00:00Z');
  const m0 = mark();
  let x = await sh('failure');
  const opened = issues.find((i) => /"key":"hands\/hands-update"/.test(i.body || '') && i.state === 'open');
  ok(x.code === 0 && /ops recorded hands\/hands-update/.test(x.out) && opened && /hands-update failed in o\/hands/.test(opened.body) && since(m0).length === 0, 'hands-report: a failed run is one alert issue in its repository and no Telegram message (K039: technical)');
  const n0 = issues.length, c0 = comments.length;
  x = await sh('failure');
  ok(x.code === 0 && issues.length === n0 && comments.length === c0 && since(m0).length === 0, 'hands-report: a second failure adds nothing');
  x = await sh('success');
  ok(x.code === 0 && opened.state === 'closed' && /RESOLVED after/.test(comments.at(-1).body) && since(m0).length === 0, 'hands-report: the next green run closes the issue, still without a Telegram message');
  rmSync(w, { recursive: true, force: true });
}


// --- kinds (K037, S-034): Needs you, outage, good news, the evening summary, and the Ops board -----------------
{
  const board = { issues: [], comments: [], fail: false };
  const boardServer = globalThis.boardServer = await listen((req, res, p) => {
    const u = new URL(req.url, 'http://x');
    if (req.headers.authorization !== 'Bearer GH-TEST') return json(res, 401, { message: 'Bad credentials' });
    if (board.fail) return json(res, 502, { message: 'Bad Gateway' });
    let m;
    if (req.method === 'GET' && u.pathname === '/repos/o/infra/issues') return json(res, 200, u.searchParams.get('page') === '1' ? board.issues.filter((i) => i.state === 'open') : []);
    if (req.method === 'POST' && u.pathname === '/repos/o/infra/issues') { const i = { number: board.issues.length + 1, state: 'open', html_url: `https://github.invalid/o/infra/issues/${board.issues.length + 1}`, ...p }; board.issues.push(i); return json(res, 201, i); }
    if ((m = u.pathname.match(/^\/repos\/o\/infra\/issues\/(\d+)$/))) { if (req.method === 'PATCH') Object.assign(board.issues[m[1] - 1], p); return json(res, 200, board.issues[m[1] - 1]); }
    if ((m = u.pathname.match(/^\/repos\/o\/infra\/issues\/(\d+)\/comments$/))) { board.comments.push({ issue: Number(m[1]), ...p }); return json(res, 201, {}); }
    return json(res, 404, { message: 'Not Found' });
  });
  const savedApi = process.env.GITHUB_API_URL;
  process.env.GITHUB_API_URL = `http://127.0.0.1:${boardServer.address().port}`;
  board.issues.push({ number: 1, state: 'open', body: 'an ordinary issue that mentions harness-ops-board', html_url: 'x' });
  delete process.env.ALERTS_HOLD_MINUTES;
  const ks = store(`file:${join(dir, 'kinds.json')}`), tg = telegram(), ob = opsBoard('github:o/infra');
  const edits = () => tgState.calls.filter((c) => c.method === 'editMessageText');

  // 🛑 Needs you: the stuck product wake of infra I045 (pickup/<repo>#<n>), held 10 minutes on a host, three plain lines
  const pick = { kind: 'needs_you', key: 'pickup/obidex/jahjah-internal#1025', what: "The ERP didn't pick up its work (woken 13:00, no session answered).",
    step: 'paste "Pick up jahjah-internal #1025 now: read it and its newest comments, do what it asks, and reply on it."', minutes: 1, where: 'ERP chat', when: 'now', link: 'https://github.com/obidex/jahjah-internal/issues/1025' };
  const m0 = mark();
  at('2026-11-08T10:00:00Z'); let r = await raise(ks, tg, pick, ob);
  ok(r.status === 'held' && since(m0).length === 0, 'needs_you: on a host it is held like any problem, nothing in its first 10 minutes');
  at('2026-11-08T10:11:00Z'); r = await raise(ks, tg, pick, ob);
  const nm = since(m0)[0];
  ok(since(m0).length === 1 && nm.message_thread_id === T('needs') && nm.disable_notification === false
    && nm.text === "🛑 The ERP didn't pick up its work (woken 13:00, no session answered).\nWho: you\nDo: paste \"Pick up jahjah-internal #1025 now: read it and its newest comments, do what it asks, and reply on it.\" (about 1 min)\nWhere: ERP chat https://github.com/obidex/jahjah-internal/issues/1025\nWhen: now",
  'needs_you: then one loud message in "Needs you", the owner\'s five lines (what, Who: you, Do with minutes, Where with the link, When)');
  ok(!nm.reply_markup && !/You:/.test(nm.text), 'needs_you: no button and no "You:" line');
  at('2026-11-08T10:20:00Z'); await raise(ks, tg, pick, ob);
  at('2026-11-09T12:00:00Z'); const tk = await tick(ks, tg, ob);
  ok(since(m0).length === 1 && !tk.length, 'needs_you: a repeat sends nothing, and tick neither escalates nor reminds it (the evening summary lists it)');
  ok(board.comments.length === 0, 'needs_you: nothing goes to the Ops board');
  at('2026-11-09T12:05:00Z'); r = await resolveKey(ks, tg, { key: pick.key }, ob);
  ok(r.status === 'resolved' && since(m0).length === 1 && edits().at(-1)?.message_id === nm.message_id && edits().at(-1).text === "✅ Sorted: The ERP didn't pick up its work (woken 13:00, no session answered).\nDo: nothing",
    'needs_you: resolve edits the same message to ✅ (silent, never a second message)');
  at('2026-11-08T21:00:00Z'); r = await raise(ks, tg, { ...pick, key: 'pickup/night#1' }, ob); at('2026-11-08T21:11:00Z'); await tick(ks, tg, ob);
  ok(last().text.startsWith('🛑') && last().disable_notification === true, 'needs_you: in quiet hours it is silent');
  await resolveKey(ks, tg, { key: 'pickup/night#1' }, ob);
  let bad = [];
  for (const o of [{ ...pick, key: 'x/1', step: 'run /opt/jahjah/bin/fix.sh' }, { ...pick, key: 'x/2', where: 'disk at 93 GB' }, { ...pick, key: 'x/3', what: 'run 42452212888 failed' }, { ...pick, key: 'x/4', where: 'You: nothing' }, { ...pick, key: 'x/5', where: undefined },
    { ...pick, key: 'x/6', what: 'STILL OPEN infra #70 (alert 2 of 3)' }, { ...pick, key: 'x/7', step: 'Resume it or record why it waits' }, { ...pick, key: 'x/8', what: 'idle past its threshold' }, { ...pick, key: 'x/9', when: 'soon' }, { ...pick, key: 'x/10', what: 'roadmap#12 waits' }])
    await raise(ks, tg, o, ob).then(() => bad.push('sent'), (e) => bad.push(e.message));
  ok(bad.length === 10 && bad.every((e) => e !== 'sent') && /a filesystem path/.test(bad[0]) && /a size/.test(bad[1]) && /a run or message id/.test(bad[2]) && /You: nothing/.test(bad[3]) && /--what, --step, --where and --when/.test(bad[4])
    && /a repository or issue number/.test(bad[5]) && /an alert count/.test(bad[5]) && /meant for an agent/.test(bad[6]) && /a threshold/.test(bad[7]) && /now, today or "this week"/.test(bad[8]) && /a repository or issue number/.test(bad[9]) && !(await ks.get('x/1')),
    'needs_you: a path, a size, a run id, "You: nothing", a missing line, an issue number outside a quoted paste, "alert 2 of 3", an agent\'s instruction, a threshold or a vague When is refused and nothing is recorded');

  // several due together go as ONE message (owner, roadmap #59, 8 Nov 2026); it turns ✅ when the last is sorted
  {
    const bs = store(`file:${join(dir, 'batch.json')}`), mb = mark();
    at('2026-11-08T12:00:00Z');
    for (const [k, what, where, when] of [['b/1', 'The ERP is waiting for your design pick.', 'ERP chat', 'today'], ['b/2', "The website didn't pick up its work.", 'website chat', 'now'], ['b/3', 'A payment needs your OK.', 'ERP chat', 'this week']])
      await raise(bs, tg, { kind: 'needs_you', key: k, what, step: `do ${k.slice(2)}`, where, when }, ob);
    ok(since(mb).length === 0, 'needs_you batch: three raised together are all held');
    at('2026-11-08T12:11:00Z'); const tb = await tick(bs, tg, ob);
    const bm = since(mb);
    ok(bm.length === 1 && bm[0].text === "🛑 3 things need you: The ERP is waiting for your design pick; The website didn't pick up its work; A payment needs your OK.\nWho: you\nDo: 1) do 1 2) do 2 3) do 3\nWhere: ERP chat; website chat\nWhen: now"
      && tb.filter((x) => /one message for 3/.test(x)).length === 3, 'needs_you batch: three due at once are ONE message in the five lines, the soonest When, each place once');
    ok((await bs.list()).filter((i) => i.sentAt).length === 1, 'needs_you batch: one message counts once against the hourly cap');
    await resolveKey(bs, tg, { key: 'b/1' }, ob); await resolveKey(bs, tg, { key: 'b/2' }, ob);
    const e0 = edits().length;
    ok(since(mb).length === 1 && edits().filter((x) => x.message_id === bm[0].message_id).length === 0, 'needs_you batch: sorting some of them sends and edits nothing');
    await resolveKey(bs, tg, { key: 'b/3' }, ob);
    ok(since(mb).length === 1 && edits().length === e0 + 1 && edits().at(-1).message_id === bm[0].message_id && edits().at(-1).text === '✅ Sorted: 3 things that needed you\nDo: nothing', 'needs_you batch: the last one sorted edits the one message to ✅');
    at('2026-11-08T13:00:00Z'); await raise(bs, tg, { kind: 'needs_you', key: 'b/4', what: 'One more thing.', step: 'do 4', where: 'ERP chat', when: 'today' }, ob);
    at('2026-11-08T13:11:00Z'); await raise(bs, tg, { kind: 'needs_you', key: 'b/5', what: 'And another.', step: 'do 5', where: 'ERP chat', when: 'today' }, ob);
    at('2026-11-08T13:21:00Z'); await raise(bs, tg, { kind: 'needs_you', key: 'b/5', what: 'And another.', step: 'do 5', where: 'ERP chat', when: 'today' }, ob);
    ok(since(mb).length === 2 && /^🛑 2 things need you: One more thing; And another\.\nWho: you\nDo: 1\) do 4 2\) do 5\n/.test(since(mb)[1].text), 'needs_you batch: one due on a raise takes the other one already due with it, oldest first');
    // two pastes that pass alone but whose quotes pair across items when joined: each goes alone, and the tick goes on
    {
      const qs = store(`file:${join(dir, 'batch-q.json')}`), mq = mark();
      at('2026-11-08T14:30:00Z');
      await raise(qs, tg, { kind: 'needs_you', key: 'q/1', what: 'The shelf needs a measure.', step: 'measure the 5" gap', where: 'shop', when: 'today' }, ob);
      await raise(qs, tg, { kind: 'needs_you', key: 'q/2', what: 'The ERP waits.', step: 'paste "Pick up #12 now"', where: 'ERP chat', when: 'today' }, ob);
      at('2026-11-08T14:41:00Z'); let threw = '';
      await tick(qs, tg, ob).catch((e) => { threw = e.message; });
      ok(!threw && since(mq).length === 2 && since(mq).every((m) => /^🛑 The (shelf|ERP)/.test(m.text)), 'needs_you batch: a joined text that would break rule C goes as one message each, and the tick never throws');
    }
  }

  // ⚠️→✅ outage: one loud message even at night, edited in place when fixed; its row on the Ops board
  const mo = mark();
  at('2026-11-08T22:05:00Z'); r = await raise(ks, tg, { kind: 'outage', key: 'web/down', system: 'Website' }, ob);
  const om = since(mo)[0];
  ok(r.status === 'sent' && since(mo).length === 1 && om.text === '⚠️ Website is down since 01:05\nWho: Platform\nDo: nothing\nWhen: now' && om.disable_notification === false && om.message_thread_id === T('needs'),
    'outage: one message at once, loud even in quiet hours, in the five-line format: "⚠️ Website is down since 01:05 / Who: Platform / Do: nothing / When: now"');
  const bi = board.issues.find((i) => i.title === 'Ops board');
  ok(bi && /\| 🛑 \| Website \|/.test(bi.body) && board.comments.length === 1 && /^🛑 outage · `web\/down`/.test(board.comments[0].body), 'outage: the Ops board opens (one issue) with its row 🛑 and one comment');
  at('2026-11-08T22:10:00Z'); await raise(ks, tg, { kind: 'outage', key: 'web/down', system: 'Website' }, ob);
  at('2026-11-08T22:17:00Z'); r = await resolveKey(ks, tg, { key: 'web/down' }, ob);
  ok(r.status === 'resolved' && since(mo).length === 1 && edits().at(-1).message_id === om.message_id && edits().at(-1).text === '✅ Website was down 12 min. Fixed.\nDo: nothing',
    'outage: fixed, the same message is edited to "✅ Website was down 12 min. Fixed.": exactly one Telegram message');
  ok(/\| ✅ \| Website \|/.test(bi.body) && board.comments.length === 2 && /^✅ resolved after 12 min · `web\/down`/.test(board.comments[1].body), 'outage: its board row turns ✅ with one resolve comment');

  // the Ops board: a technical alert never reaches Telegram, never mentions anyone
  const mt = mark(), c0 = board.comments.length;
  at('2026-11-08T11:00:00Z'); r = await raise(ks, tg, { kind: 'ops', key: 'vps/disk', text: 'VPS disk 93% full (/var/lib/docker 41 GB); @obidex FYI', link: 'https://run/7', system: 'VPS disk' }, ob);
  ok(r.status === 'held' && board.comments.length === c0, 'ops: held 10 minutes on a host, like any problem');
  at('2026-11-08T11:11:00Z'); await tick(ks, tg, ob);
  ok(since(mt).length === 0 && board.comments.length === c0 + 1 && board.issues.filter((i) => i.title === 'Ops board').length === 1 && /\| ⚠️ \| VPS disk \| .* \| Platform \| VPS disk 93% full/.test(bi.body),
    'ops: then one comment and one ⚠️ row on the same board, and no Telegram message at all');
  ok(![bi.body, ...board.comments.map((x) => x.body)].some((b) => /@obidex/.test(b)) && /@\u200bobidex/.test(board.comments.at(-1).body), 'ops: no @mention survives on the board, so GitHub notifies nobody');
  at('2026-11-08T11:30:00Z'); await raise(ks, tg, { kind: 'ops', key: 'vps/disk', text: 'VPS disk 94% full' }, ob);
  ok(board.comments.length === c0 + 1, 'ops: a repeat adds nothing');
  board.fail = true;
  at('2026-11-08T12:00:00Z'); await resolveKey(ks, tg, { key: 'vps/disk', text: 'old runner folders removed' }, ob);
  ok(board.comments.length === c0 + 1 && !(await ks.get('vps/disk')), 'ops: resolved while GitHub is down, it closes here and the board waits');
  board.fail = false;
  at('2026-11-08T12:10:00Z'); const td = await tick(ks, tg, ob);
  ok(td.includes('board vps/disk') && board.comments.length === c0 + 2 && /^✅ resolved after 1 h 0 min · `vps\/disk` · old runner folders removed/.test(board.comments.at(-1).body) && /\| ✅ \| VPS disk \|/.test(bi.body),
    'ops: the next tick catches the board up: one resolve comment, the row ✅');
  ok(since(mt).length === 0, 'ops: from start to resolve, nothing in Telegram');
  delete process.env.ALERTS_OPS_BOARD;
  await raise(ks, tg, { kind: 'ops', key: 'vps/none', text: 'x' }).then(() => ok(false, 'ops without a board'), (e) => ok(/ALERTS_OPS_BOARD is not set/.test(e.message), 'ops without ALERTS_OPS_BOARD is an error, never a Telegram message'));

  // 🎉 good news and the ☀️ evening summary
  const ns = store(`file:${join(dir, 'news.json')}`), mg = mark();
  at('2026-11-10T09:00:00Z');
  ok(await summaryText([ns], { board: ob }) === null, 'summary: a day with nothing to say has no summary');
  r = await summary([ns], tg, { board: ob });
  ok(r.status === 'nothing to say: no summary today' && since(mg).length === 0, 'summary: and sends nothing');
  r = await raise(ns, tg, { kind: 'good_news', key: 'erp/po-screen', text: 'ERP: the purchase orders screen is live. Staff can use it now.' }, ob);
  ok(r.status === 'sent' && last().text === '🎉 ERP: the purchase orders screen is live. Staff can use it now.\nDo: nothing' && last().message_thread_id === T('good') && last().disable_notification === true, 'good_news: one 🎉 line in "Good news"');
  r = await raise(ns, tg, { kind: 'good_news', key: 'erp/po-screen', text: 'ERP: the purchase orders screen is live. Staff can use it now.' }, ob);
  ok(r.status === 'repeat' && since(mg).length === 1, 'good_news: the same key goes out once');
  r = await raise(ns, tg, { kind: 'good_news', text: 'Website: 12 new product pages are up.', summaryOnly: true }, ob);
  ok(since(mg).length === 1 && r.status === 'kept for the summary', 'good_news --summary-only: kept for the summary, not sent on its own');
  await raise(ns, tg, { kind: 'good_news', text: 'Website: /var/www is fast' }, ob).then(() => ok(false, 'refused'), (e) => ok(/a filesystem path/.test(e.message), 'good_news: rule C holds for it too'));
  const held = { ...pick, key: 'pickup/held#1', what: 'A flap that never reached him.' };
  at('2026-11-10T09:00:00Z'); await raise(ns, tg, { ...pick, key: 'pickup/web#437', what: "The website didn't pick up its work.", step: 'paste "Pick up jahjah-website #437 now."', where: 'website chat' }, ob);
  at('2026-11-10T09:11:00Z'); await raise(ns, tg, { ...pick, key: 'pickup/web#437', what: "The website didn't pick up its work.", step: 'paste "Pick up jahjah-website #437 now."', where: 'website chat' }, ob);
  at('2026-11-10T09:12:00Z'); await raise(ns, tg, held, ob);
  at('2026-11-10T17:00:00Z'); r = await summary([ns], tg, { board: ob, progress: ['Telegram redesign: step 2 of 4'] });
  ok(r.status === 'sent' && last().message_thread_id === T('summary') && last().text === [
    '☀️ 10 Nov: went live: ERP: the purchase orders screen is live. Staff can use it now; Website: 12 new product pages are up. in progress: Telegram redesign: step 2 of 4.',
    'Who: you', 'Do: paste "Pick up jahjah-website #437 now."', 'Where: the Needs you topic', 'When: today'].join('\n'),
  'summary: five lines: what went live and what is in progress, then his one step (a Needs you still open) and where');
  r = await summary([ns], tg, { board: ob });
  ok(r.status === 'already sent today' && since(mg).length === 3, 'summary: once a day; a Needs you still held (never sent) is not in it');
  ok(!/🎉|☀️/.test(await digestText([ns])), 'the old daily digest leaves good news and summaries out');

  // rule C and rule D across every template: no path, size, address, id or code; no button anywhere
  const sample = { what: 'The ERP is waiting for your design pick.', step: 'Open the link and tap A or B.', minutes: 2, where: 'ERP chat', when: 'today', link: 'https://github.com/o/r/issues/1', system: 'Website', who: 'Platform', text: 'ERP: a new screen is live.', opened: Date.now() };
  const rendered = [TEMPLATES.needs_you(sample), TEMPLATES.needs_you_done(sample), TEMPLATES.needs_you_batch([sample, { ...sample, when: 'now' }]), TEMPLATES.needs_you_batch_done([sample, sample]),
    TEMPLATES.outage(sample), TEMPLATES.outage_fixed(sample, Date.now() + 60e3), TEMPLATES.good_news(sample),
    TEMPLATES.summary({ date: '1 Jan', live: ['a'], progress: ['b'], needs: ['c'], board: 'https://github.com/o/infra/issues/1' }), TEMPLATES.summary({ date: '1 Jan', live: [], progress: ['b'], needs: [], board: 'https://github.com/o/infra/issues/1' })];
  ok(rendered.every((x) => plainProblems(x).length === 0), 'templates: every owner-facing template renders plain (no path, size, address, id, error code, issue number, alert count or "You: nothing")');
  ok(rendered.every((x) => formatProblems(x).length === 0), "templates: every owner-facing template passes the owner's format (emoji + what, then Who/Do/Where/When in order, Do always, five lines at most)");
  ok(formatProblems('🔴 PROBLEM · Stale card in infra: #70\nhttps://x\nYou: nothing').length && formatProblems('🛑 a\nDo: x\nWho: you').length && formatProblems('🛑 a\nWho: you').length && formatProblems('a\nDo: x').length && formatProblems('🛑 a\nWho: you\nDo: x\nWhere: y\nWhen: today\nmore').length && formatProblems('🛑 a\nDo: x\nWhen: later').length,
    "format: the old PROBLEM text, labels out of order, no Do:, no emoji, six lines or a vague When all fail the owner's format");
  const src = (await import('node:fs')).readFileSync(new URL('../.harness/tools/notify.mjs', import.meta.url), 'utf8');
  ok(!/reply_markup|inline_keyboard/.test(src) && !tgState.calls.some((c) => c.reply_markup), 'templates: notify.mjs never sends a button (rule D)');
  ok(plainProblems('see https://github.com/o/r/blob/main/vps/a.sh').length === 0 && plainProblems('C:/x and ~/a/b').length > 0, 'rule C: a link may carry a path; the text may not');

  // a kit topic the group has not created yet (before setup runs again) reaches General, named
  process.env.ALERTS_TOPICS = JSON.stringify({ needs: T('needs') });
  at('2026-11-11T09:00:00Z'); await raise(store(`file:${join(dir, 'pre.json')}`), telegram(), { kind: 'good_news', text: 'ERP: invoices print again.' }, ob);
  ok(last().message_thread_id === undefined && last().text === '[Good news] 🎉 ERP: invoices print again.\nDo: nothing', 'a kind whose topic is not set up yet goes to General with the topic named');
  await telegram().send('nonsense', 'x').then(() => ok(false, 'unknown topic'), (e) => ok(/unknown topic "nonsense"/.test(e.message), 'a topic the kit does not know is still an error'));
  await telegram().send('erp', 'x').then(() => ok(false, 'missing older topic'), (e) => ok(/unknown topic "erp"/.test(e.message), 'an older topic missing from the config is still an error, as before (only the K037 topics fall back)'));
  delete process.env.ALERTS_TOPICS;

  // a store that keeps no news (GitHub, in a product's Actions run): good news goes out plain; a key, --summary-only and the summary need a host's file store
  {
    const gsn = store('github:o/infra'), mgs = mark();
    at('2026-11-12T09:00:00Z');
    r = await raise(gsn, tg, { kind: 'good_news', text: 'Website: the new catalogue is live.' }, ob);
    ok(r.status === 'sent' && since(mgs).length === 1 && !board.issues.some((i) => /good_news/.test(i.body || '')), 'good_news from a GitHub store is sent and opens no issue');
    const refused = [];
    for (const o of [{ key: 'web/catalogue' }, { summaryOnly: true }]) await raise(gsn, tg, { kind: 'good_news', text: 'Website: X is live.', ...o }, ob).then(() => refused.push('sent'), (e) => refused.push(e.message));
    ok(refused.every((e) => /keeps no news/.test(e)) && since(mgs).length === 1, 'good_news --key or --summary-only on a store that keeps no news is refused, never sent twice or lost');
    await summary([gsn], tg, { board: ob, progress: ['x'] }).then(() => ok(false, 'summary refused'), (e) => ok(/none of the stores keeps news/.test(e.message) && since(mgs).length === 1, 'a summary with no store that keeps news is refused, so it cannot go out twice'));
    ok(plainProblems('🎉 Website: rebuilt on Next.js, faster pages.').length === 0, 'rule C: a product name like Next.js is plain words');
  }

  // an outage is never capped, and its board row does not wait for Telegram
  {
    process.env.ALERTS_HOLD_MINUTES = '0';
    const cs3 = store(`file:${join(dir, 'outcap.json')}`), mc = mark();
    at('2026-11-12T10:00:00Z');
    for (let i = 0; i < 12; i++) await raise(cs3, tg, { kind: 'needs_you', key: `flood/${i}`, what: `Item ${i} waits for you.`, step: 'Open the link.', where: 'the link', when: 'today' }, ob);
    const sentNeeds = since(mc).length;
    r = await raise(cs3, tg, { kind: 'outage', key: 'erp/down', system: 'ERP' }, ob);
    ok(sentNeeds === 10 && r.status === 'sent' && since(mc).length === 11, 'an outage goes out at once even past the hourly cap of "Needs you" (10 sent, then the outage)');
    const c1 = board.comments.length;
    await raise(cs3, telegram({ token: '' }), { kind: 'outage', key: 'web/down2', system: 'Website' }, ob);
    ok(board.comments.length === c1 + 1 && /`web\/down2`/.test(board.comments.at(-1).body), 'an outage raised where no bot token is still reaches the Ops board at once');
    delete process.env.ALERTS_HOLD_MINUTES;
  }

  // K039: the Ops board's log line, closing the topics the owner no longer keeps, an ops alert in a GitHub store with no board
  {
    const c0 = board.comments.length;
    await note(ob, 'The VPS restarted for its weekly updates; back after 2 min. @obidex', 'https://run/9');
    ok(board.comments.length === c0 + 1 && /^📝 The VPS restarted for its weekly updates; back after 2 min\. @\u200bobidex\nhttps:\/\/run\/9$/.test(board.comments.at(-1).body), 'note: one comment on the board, no row, no mention');
    await note(null, 'x').then(() => ok(false, 'note without a board'), (e) => ok(/ALERTS_OPS_BOARD is not set/.test(e.message), 'note without ALERTS_OPS_BOARD is an error'));
    const mr = mark();
    const lines = await retire(telegram(), ['kit', 'ops', 'daily']);
    const closes = tgState.calls.slice(mr).filter((c) => c.method === 'closeForumTopic').map((c) => c.message_thread_id);
    ok(JSON.stringify(closes) === JSON.stringify([T('kit'), T('ops'), T('daily')]) && lines.every((l) => /^closed "/.test(l)) && since(mr).length === 0, 'retire closes the named topics, sends nothing');
    tgState.closed = new Set(closes);
    const again = await retire(telegram(), ['kit']);
    ok(/already closed/.test(again[0]), 'retiring a closed topic again is no error');
    tgState.closed = null;
    await retire(telegram(), ['needs']).then(() => ok(false, 'needs kept'), (e) => ok(/one of the three topics the owner keeps/.test(e.message), 'retire never closes Needs you, Good news or Summary'));
    process.env.GITHUB_API_URL = `http://127.0.0.1:${ghServer.address().port}`;
    const gs2 = store('github:o/hands'), mo = mark(), n0 = issues.length;
    r = await raise(gs2, tg, { kind: 'ops', key: 'hands/x', text: 'hands-x failed' }, null);
    ok(r.status === 'recorded' && issues.length === n0 + 1 && /"kind":"ops"/.test(issues.at(-1).body) && since(mo).length === 0, 'ops on a GitHub store with no board is recorded as its alert issue, never sent');
    r = await resolveKey(gs2, tg, { key: 'hands/x' }, null);
    ok(r.status === 'closed-unsent' && issues.at(-1).state === 'closed' && since(mo).length === 0, 'and its resolve closes the issue without a message');
    process.env.GITHUB_API_URL = `http://127.0.0.1:${boardServer.address().port}`;
    process.env.ALERTS_OPS_BOARD = 'not a board';
    const tbad = await tick(store(`file:${join(dir, 'pre.json')}`), tg).then(() => 'ran', (e) => e.message);
    ok(tbad === 'ran', 'a malformed ALERTS_OPS_BOARD does not stop a tick');
    delete process.env.ALERTS_OPS_BOARD;
  }

  // the command line
  const cs2 = { ALERTS_STORE: `file:${join(dir, 'cli-kinds.json')}`, ALERTS_HOLD_MINUTES: '0', ALERTS_OPS_BOARD: 'github:o/infra' };
  let c = await cli(['needs_you', '--key', 'pickup/obidex/jahjah-website#437', '--what', "The website didn't pick up its work.", '--step', 'Paste the line.', '--where', 'website chat', '--when', 'this week', '--minutes', '1'], cs2);
  ok(c.code === 0 && /needs_you sent pickup\/obidex\/jahjah-website#437/.test(c.out) && last().text === "🛑 The website didn't pick up its work.\nWho: you\nDo: Paste the line. (about 1 min)\nWhere: website chat\nWhen: this week", 'notify.mjs needs_you works from the command line');
  c = await cli(['resolve', '--key', 'pickup/obidex/jahjah-website#437'], cs2);
  ok(c.code === 0 && /resolved/.test(c.out) && edits().at(-1).text === "✅ Sorted: The website didn't pick up its work.\nDo: nothing", 'and resolve edits it to ✅');
  c = await cli(['summary', '--stores', cs2.ALERTS_STORE, '--dry-run'], cs2);
  ok(c.code === 0 && /nothing to say/.test(c.out), 'notify.mjs summary --dry-run says when there is nothing to say');
  c = await cli(['board'], cs2);
  ok(c.code === 0 && c.out.includes(`Ops board: ${bi.html_url}`), 'notify.mjs board prints the one board');
  process.env.GITHUB_API_URL = savedApi;
  process.env.ALERTS_HOLD_MINUTES = '0';
}

tgServer.close(); ghServer.close(); globalThis.boardServer.close(); rmSync(dir, { recursive: true, force: true });
console.log(`test-notify: all ${n} cases held`);
