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
import { telegram, store, problem, resolveKey, tick, digestText, setup, isQuiet, loud, TOPICS } from '../.harness/tools/notify.mjs';

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
ok(Object.keys(tgState.topics).length === 6 && Object.values(TOPICS).every((t) => tgState.topics[t.name]) && tgState.pinned?.text.startsWith('harness-alerts config'), `setup creates the six topics and pins the config (${first.filter((l) => l.startsWith('created')).length} created)`);
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
const st = store(`file:${join(dir, 'state.json')}`);
const tg = telegram();
at('2026-10-05T09:00:00Z');
let r = await problem(st, tg, { key: 'hands/hands-update', topic: 'kit', text: 'hands-update failed', link: 'https://example.invalid/run/1' });
const original = r.inc.msg;
ok(r.status === 'sent' && last().message_thread_id === T('kit') && last().disable_notification === true && /PROBLEM · hands-update failed/.test(last().text), 'a problem goes silently to its own topic');
let i0 = mark();
r = await problem(st, tg, { key: 'hands/hands-update', topic: 'kit', text: 'hands-update failed again' });
ok(r.status === 'repeat' && since(i0).length === 0 && r.inc.count === 2, 'a repeat of an open problem sends nothing (deduplicated) and counts');
at('2026-10-05T10:30:00Z'); i0 = mark();
await tg.call('pinChatMessage', { chat_id: tg.chat, message_id: original }); // someone pinned the problem
ok(tgState.pinned?.message_id === original, 'fixture: the problem is pinned, so senders no longer see the config');
r = await resolveKey(st, tg, { key: 'hands/hands-update', text: 'hands-update green again' });
ok(!tgState.pins.some((x) => x.message_id === original) && tgState.pinned?.text.startsWith('harness-alerts config'), 'a resolved problem never stays pinned: RESOLVED unpins it and the config is the newest pin again');
ok(r.status === 'resolved' && since(i0).length === 1 && last().reply_parameters?.message_id === original && last().message_thread_id === T('kit') && /RESOLVED after 1 h 30 min/.test(last().text), 'RESOLVED is a reply to the original message, in its topic');
ok((await resolveKey(st, tg, { key: 'hands/hands-update' })).status === 'none', 'resolving a key with nothing open does nothing');

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
ok(c.code === 0 && /PROBLEM \d+ sent and RESOLVED as a reply/.test(c.out), 'notify.mjs test sends a problem and its RESOLVED reply');

// before setup (or in a private chat) every message still arrives, its topic's name leading it
{
  const saved = tgState.pinned; tgState.pinned = null;
  const flat = telegram();
  at('2026-10-09T09:00:00Z');
  const p = await problem(store(`file:${join(dir, 'flat.json')}`), flat, { key: 'flat/x', topic: 'kit', text: 'before setup' });
  ok(p.status === 'sent' && last().message_thread_id === undefined && last().text.startsWith('[Kit & Hands] 🔴 PROBLEM'), 'a chat without the pinned config gets the message unthreaded, its topic named');
  const before = mark();
  const d = await cli(['digest', '--stores', `file:${join(dir, 'flat.json')}`]);
  ok(d.code === 0 && /digest not posted/.test(d.out) && since(before).length === 0, 'no digest goes to a chat that is not the set-up group');
  tgState.pinned = saved;
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

// hands-report's alert step, as GitHub runs it (bash -e), against the stand-ins: failure opens, success resolves
{
  const { parseYaml } = await import('../.harness/tools/lib.mjs');
  const { symlinkSync, writeFileSync } = await import('node:fs');
  const wf = parseYaml((await import('node:fs')).readFileSync(new URL('../.harness/templates/hands/hands-report.yml', import.meta.url), 'utf8'));
  const step = wf.jobs.report.steps.find((x) => /notify\.mjs problem/.test(x.run || ''));
  const run = step.run.replace(/\$\{\{ github\.server_url \}\}/g, 'https://github.invalid').replace(/\$\{\{ github\.repository \}\}/g, 'o/hands').replace(/\$\{\{ github\.run_id \}\}/g, '99');
  const w = mkdtempSync(join(tmpdir(), 'notify-step-'));
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), join(w, 'kit'));
  writeFileSync(join(w, 'step.sh'), run);
  const sh = (RESULT) => new Promise((done) => execFile('bash', ['-e', join(w, 'step.sh')], { cwd: w, env: { ...process.env, JOB: 'hands-update', RESULT, ALERTS_STORE: 'github:o/hands', ALERTS_REQUIRE_SEND: '1' } }, (err, out, errOut) => done({ code: err ? err.code : 0, out: out + errOut })));
  at('2026-10-09T10:00:00Z');
  let x = await sh('failure');
  const opened = issues.find((i) => i.title === 'hands-update failing');
  ok(x.code === 0 && opened?.state === 'open' && /"key":"hands\/hands-update"/.test(opened.body) && /PROBLEM · hands-update failed in o\/hands/.test(last().text) && last().message_thread_id === T('kit'), 'hands-report: a failed run opens one problem in "Kit & Hands"');
  x = await sh('failure');
  ok(x.code === 0 && issues.filter((i) => i.title === 'hands-update failing').length === 1 && /Still failing: https:\/\/github\.invalid\/o\/hands\/actions\/runs\/99/.test(comments.at(-1).body), 'hands-report: a second failure only comments');
  x = await sh('success');
  ok(x.code === 0 && opened.state === 'closed' && /RESOLVED after .* hands-update green again/.test(last().text) && last().reply_parameters?.message_id, 'hands-report: the next green run replies RESOLVED and closes the issue');
  rmSync(w, { recursive: true, force: true });
}

tgServer.close(); ghServer.close(); rmSync(dir, { recursive: true, force: true });
console.log(`test-notify: all ${n} cases held`);
