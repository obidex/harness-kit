#!/usr/bin/env node
// test-panel — the control panel core (K025) through a channel adapter, offline.
//
//   node tools/test-panel.mjs        exit 0 = every case held
//
// One scenario (a problem opens, is acknowledged, muted, comes back, resolves; a decision is asked and
// answered, a second tap says already answered; /status; refusals) runs through a channel. It must end
// with the same core state and the same log on every channel, and a run that switches channel halfway
// must end with the whole history.

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { openCore, deliver, step, serveLoop, fileAdapter, telegramAdapter, pickAdapter } from '../.harness/tools/panel.mjs';
import { telegram } from '../.harness/tools/notify.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-panel: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-panel: ok ${n}. ${what}`); };
const tmp = mkdtempSync(join(tmpdir(), 'panel-'));
const OWNER = 111, OTHER = 222, GROUP = -100500;
const T0 = Date.parse('2026-10-09T09:00:00Z');

/** A channel for the scenario: the adapter plus a way to act on it as a person would. */
const fileChannel = (dir) => {
  const a = fileAdapter({ dir });
  return { adapter: a, say: (account, text, chat = account) => a.push({ kind: 'text', account, chat, private: chat === account, text }), tap: (account, button, chat = GROUP) => a.push({ kind: 'press', account, chat, private: chat === account, button }), shown: () => a.shown() };
};
// a stand-in Telegram: a forum group with topics, presses and messages queued as updates
const tg = { updates: [], sent: [], answered: 0, nextUpdate: 1, msg: 1000, fail: 0, failOn: 'getUpdates' };
const json = (res, data) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: data })); };
const server = await new Promise((done) => { const sv = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
  const p = b ? JSON.parse(b) : {}; const method = req.url.split('/').pop();
  if (!req.url.startsWith('/botTEST-TOKEN/')) { res.writeHead(401); return res.end('{"ok":false}'); }
  if (tg.fail > 0 && method === tg.failOn) { tg.fail--; res.writeHead(502, { 'content-type': 'application/json' }); return res.end('{"ok":false,"description":"Bad Gateway"}'); }
  if (method === 'getUpdates') { const ups = tg.updates.filter((u) => u.update_id >= (p.offset || 0)); return json(res, ups); }
  if (method === 'answerCallbackQuery') { tg.answered++; return json(res, true); }
  if (method === 'sendMessage') { const m = { message_id: ++tg.msg, chat: { id: p.chat_id }, message_thread_id: p.message_thread_id }; tg.sent.push({ ...p, message_id: m.message_id }); return json(res, m); }
  res.writeHead(400); res.end('{"ok":false}');
}); }); sv.listen(0, '127.0.0.1', () => done(sv)); });
process.env.ALERTS_TOPICS = JSON.stringify({ needs: 2, ops: 5, kit: 4 });
const client = telegram({ token: 'TEST-TOKEN', chat: String(GROUP), base: `http://127.0.0.1:${server.address().port}` });
const tgChannel = (dir) => {
  const a = telegramAdapter({ dir, tg: client });
  const chatOf = (account, chat) => ({ id: chat, type: chat === account ? 'private' : 'supergroup' });
  return { adapter: a,
    say: (account, text, chat = account) => tg.updates.push({ update_id: tg.nextUpdate++, message: { message_id: ++tg.msg, from: { id: account }, chat: chatOf(account, chat), text } }),
    tap: (account, button, chat = GROUP) => tg.updates.push({ update_id: tg.nextUpdate++, callback_query: { id: `q${tg.nextUpdate}`, from: { id: account }, data: button, message: { message_id: 1, chat: chatOf(account, chat) } } }),
    shown: () => tg.sent.map((m) => ({ ref: m.message_id, text: m.text, buttons: (m.reply_markup?.inline_keyboard || []).flat().map((k) => ({ id: k.callback_data, label: k.text })), reply: m.reply_parameters?.message_id ?? null })) };
};
const button = (ch, label) => ch.shown().findLast((v) => v.buttons.some((b) => b.label === label)).buttons.find((b) => b.label === label).id;

/** The scenario, in two halves so a run can switch channel between them. */
async function half1(core, ch, clock, actions) {
  const stale = openCore({ dir: core.dir, now: () => clock.t }).bindCode();
  clock.t += 61 * 60e3;
  ch.say(OWNER, `/bind ${stale}`); await step(core, ch.adapter);
  ok(core.ownerOn(ch.adapter.name) === null && core.log().at(-1).result === 'not the owner', 'a code older than 1 h binds nobody, and the refusal is logged');
  const code = openCore({ dir: core.dir, now: () => clock.t }).bindCode(); // a second process, as on the host
  ch.say(OTHER, `/bind wrong`); await step(core, ch.adapter);
  ch.say(OTHER, `/bind ${code}`, GROUP); await step(core, ch.adapter);
  ok(core.ownerOn(ch.adapter.name) === null, 'the right code sent in a group binds nobody');
  ch.say(OWNER, `/bind ${code}`); await step(core, ch.adapter);
  ok(core.ownerOn(ch.adapter.name) === String(OWNER), 'a code made by a second process while the service runs binds the owner');
  clock.t += 60e3;
  await deliver(core, ch.adapter, [core.problem({ key: 'vps-disk', topic: 'ops', text: 'Disk under 8 GB on the VPS', link: 'https://example.invalid/run/1' })]);
  ok(core.problem({ key: 'vps-disk', topic: 'ops', text: 'Disk under 8 GB on the VPS' }) === null, 'a repeat of an open problem shows nothing and only counts');
  ch.tap(OTHER, button(ch, 'Acknowledge')); await step(core, ch.adapter);
  ok(core.state().problems['vps-disk'].state === 'open', 'a press by another account changes nothing (refused)');
  ch.tap(OWNER, button(ch, 'Details')); await step(core, ch.adapter);
  ok(/repeated 1 times/.test(ch.shown().at(-1).text) && ch.shown().at(-1).reply !== null, 'Details answers under the problem with its count and link');
  ch.tap(OWNER, button(ch, 'Acknowledge')); await step(core, ch.adapter);
  ok(core.state().problems['vps-disk'].state === 'acknowledged', 'Acknowledge marks it seen');
  ch.tap(OWNER, button(ch, 'Mute 24h')); await step(core, ch.adapter);
  ok(core.state().problems['vps-disk'].state === 'muted', 'Mute 24h mutes it');
  ch.tap(OWNER, 'x:v1;rm -rf /'); await step(core, ch.adapter);
  ok(core.log().at(-1).result === 'unknown button', 'a made-up button is refused and logged; it never runs anything');
  const before = actions.length;
  ch.tap(OWNER, button(ch, 'Details').replace(/^i:/, 'p:')); await step(core, ch.adapter);
  ok(actions.length === before && core.log().at(-1).result === 'no such action for this alert', 'Pause forged for an alert the list does not name is refused and runs nothing');
  if (actions) {
    await deliver(core, ch.adapter, [core.problem({ key: 'job-backup', topic: 'ops', text: 'Backup failed' })]);
    ch.tap(OWNER, button(ch, 'Pause automation')); await step(core, ch.adapter);
    ok(actions.at(-1)?.op === 'pause' && core.state().problems['job-backup'].paused, 'Pause runs only the listed job, through the host');
    ch.tap(OWNER, button(ch, 'Retry')); await step(core, ch.adapter);
    ok(actions.at(-1)?.op === 'retry', 'Retry is offered and runs where the list marks the job safe');
    await deliver(core, ch.adapter, [core.problem({ key: 'once-deploy', topic: 'ops', text: 'Deploy failed' })]);
    const n0 = actions.length;
    ok(!ch.shown().at(-1).buttons.some((b) => b.label === 'Retry'), 'no Retry button where the job is not safe to retry');
    ch.tap(OWNER, button(ch, 'Details').replace(/^i:/, 'r:')); await step(core, ch.adapter);
    ok(actions.length === n0 && core.log().at(-1).result === 'no such action for this alert', 'a forged Retry on a job not safe to retry is refused and runs nothing');
  }
}
async function half2(core, ch, clock) {
  // a new channel: the owner binds once on it (an account id belongs to one channel; the legacy case below shows the refusal)
  if (!core.ownerOn(ch.adapter.name)) core.bindOwner(OWNER, 'the owner, on the channel switched to', ch.adapter.name);
  await deliver(core, ch.adapter, [core.ask({ id: 'kit/demo-1', project: 'kit', question: 'Which name for the new check?', options: ['short-name', 'long-descriptive-name'], recommended: 0, issue: 'owner/repo#1' })]);
  ch.tap(OWNER, button(ch, 'B'), OWNER); await step(core, ch.adapter);
  ok(core.state().decisions['kit/demo-1'].answer.option === 1, 'a tap answers the decision');
  ch.tap(OWNER, button(ch, 'A'), OWNER); await step(core, ch.adapter);
  ok(core.state().decisions['kit/demo-1'].answer.option === 1 && /Already answered/.test(ch.shown().at(-1).text), 'the first answer counts; a second tap says already answered');
  ch.say(OWNER, '/status', OWNER); await step(core, ch.adapter);
  ok(/Laptop & VPS:\n {2}problem: Disk under 8 GB on the VPS \(muted\)/.test(ch.shown().at(-1).text), '/status lists the open problem, marked muted');
  ch.say(OWNER, '/status', GROUP + 1); await step(core, ch.adapter);
  ok(core.log().at(-1).result === 'not an allowed chat', 'the owner in a chat not on the list is refused');
  ch.tap(OWNER, button(ch, 'A'), GROUP + 1); await step(core, ch.adapter);
  ok(core.log().at(-1).result === 'not an allowed chat', 'a press by the owner in a chat not on the list is refused');
  clock.t += 25 * 3600e3; await step(core, ch.adapter);
  ok(core.state().problems['vps-disk'].state === 'open' && /mute ended/.test(ch.shown().at(-1).text), 'after 24 h a muted problem comes back');
  await deliver(core, ch.adapter, [core.resolve('vps-disk')]);
  const oldAck = button(ch, 'Acknowledge');
  ok(/✅ Fixed after/.test(ch.shown().at(-1).text) && core.state().problems['vps-disk'].state === 'resolved', 'RESOLVED replies under the problem');
  ch.tap(OWNER, button(ch, 'Acknowledge')); await step(core, ch.adapter);
  ok(core.log().at(-1).result === 'already resolved', 'a button on a resolved problem says so and changes nothing');
  await deliver(core, ch.adapter, [core.problem({ key: 'vps-disk', topic: 'ops', text: 'Disk under 8 GB on the VPS' })]);
  ch.tap(OWNER, oldAck); await step(core, ch.adapter);
  ok(core.state().problems['vps-disk'].state === 'open' && core.log().at(-1).result === 'old message', 'a button on the old message of a problem that opened again does not act on the new one');
}

const run = async (name, channels) => {
  const clock = { t: T0 }; const done = [];
  const open = () => Object.assign(openCore({ dir: join(tmp, name, 'core'), chats: [GROUP], now: () => clock.t,
    actions: [{ id: 'backup', alerts: ['job-*'], job: 'backup.timer', retry: true }, { id: 'deploy', alerts: ['once-*'], job: 'deploy.yml', retry: false }],
    run: async (x) => { done.push(x); return { ok: true, text: `${x.op} ${x.action.job}` }; } }), { dir: join(tmp, name, 'core') });
  const [a, b] = channels(join(tmp, name));
  await half1(open(), a, clock, done);
  const core = open(); // the service restarts between halves (as a channel switch does): state comes from disk
  await half2(core, b, clock);
  return core;
};
// the owner binds once per channel, so a switched run has one more bind: compared without them
const canon = (core) => ({
  state: { ...core.state(), owners: '-', views: Object.fromEntries(Object.entries(core.state().views).map(([k, v]) => [k, v.about])),
    decisions: Object.fromEntries(Object.entries(core.state().decisions).map(([k, d]) => [k, { ...d, answer: d.answer && { ...d.answer, channel: '-' } }])) },
  log: core.log().filter((e) => e.what !== 'bind').map(({ channel, ...e }) => e),
});

const fileA = await run('a', (d) => { const c = fileChannel(join(d, 'ch')); return [c, c]; });
const log = fileA.log();
ok(log.some((e) => e.what === 'refused' && e.result === 'not the owner'), 'every refusal is in the log');
ok(log.every((e) => e.at && e.what), 'every entry says when and what');
const fileB = await run('b', (d) => { const c = fileChannel(join(d, 'ch')); return [c, c]; });
ok(JSON.stringify(canon(fileA)) === JSON.stringify(canon(fileB)), 'the same scenario ends with the same core state and log on a second run');

// switch: the first half on one channel, the second on another (a channel switch mid-run)
const other = (dir) => { const c = fileChannel(dir); c.adapter.name = 'file-2'; return c; };
const switched = await run('s', (d) => [fileChannel(join(d, 'one')), other(join(d, 'two'))]);
ok(JSON.stringify(canon(switched)) === JSON.stringify(canon(fileA)), 'switching channel halfway keeps the whole history: same state and log');
ok(switched.log().some((e) => e.channel === 'file') && switched.log().some((e) => e.channel === 'file-2'), 'the log names the channel each press came from');
ok(switched.ownerOn('file') === String(OWNER) && switched.ownerOn('file-2') === String(OWNER) && fileA.ownerOn('file-2') === null, 'the owner is stored per channel');

// the same scenario through Telegram (a stand-in), and switching Telegram -> file halfway
const tgRun = await run('t', (d) => { const c = tgChannel(join(d, 'tg')); return [c, c]; });
ok(JSON.stringify(canon(tgRun)) === JSON.stringify(canon(fileA)), 'Telegram ends with the same core state and log as the file channel');
ok(tg.answered > 0 && tg.sent.some((m) => m.message_thread_id === 5 && /PROBLEM/.test(m.text)) && tg.sent.some((m) => m.message_thread_id === 2 && /DECISION/.test(m.text)), 'problems go to their topic, decisions to "Needs you", each press is answered');
ok(tg.sent.filter((m) => m.reply_markup).every((m) => m.reply_markup.inline_keyboard.flat().every((k) => Buffer.byteLength(k.callback_data) <= 64)), 'every button sent to Telegram carries only its short id');
tg.updates.length = 0; tg.sent.length = 0;
const away = await run('w', (d) => [tgChannel(join(d, 'tg')), fileChannel(join(d, 'file'))]);
ok(JSON.stringify(canon(away)) === JSON.stringify(canon(fileA)), 'leaving Telegram halfway (CONTROL_CHANNEL telegram -> file) keeps the whole history');
ok(away.log().some((e) => e.channel === 'telegram') && away.log().some((e) => e.channel === 'file'), 'the log shows the presses from both channels');
// a Telegram error never stops the service: the next pass handles the next press
{
  tg.updates.length = 0; tg.sent.length = 0;
  const ch = tgChannel(join(tmp, 'flaky', 'tg'));
  const core = openCore({ dir: join(tmp, 'flaky', 'core'), chats: [GROUP] });
  const code = core.bindCode();
  tg.fail = 1; ch.say(OWNER, `/bind ${code}`);
  let passes = 0;
  const failed = await serveLoop(core, ch.adapter, { stop: () => passes++ >= 3, backoff: 1 });
  ok(failed === 1 && core.ownerOn('telegram') === String(OWNER), 'a failed getUpdates (502) is logged and the next pass still binds the owner');
  tg.fail = 1; tg.failOn = 'sendMessage'; ch.say(OWNER, '/status'); ch.say(OWNER, '/status');
  passes = 0; await serveLoop(core, ch.adapter, { stop: () => passes++ >= 1, backoff: 1 });
  ok(tg.sent.filter((m) => /^STATUS/.test(m.text)).length === 1 && core.log().filter((e) => e.what === 'status').length === 2, 'a reply Telegram refuses is skipped, and the next one in the batch is still sent');
  const long = '😀'.repeat(5000);
  const ref = await ch.adapter.show({ id: 'vx', text: long, buttons: [] }, null, { chat: OWNER });
  ok(ref.msg && !/\uD83D$/.test(tg.sent.at(-1).text.slice(0, -2)) && tg.sent.at(-1).text.length <= 4096 && tg.sent.at(-1).text.length > 3900, 'a long text is cut on whole characters, under Telegram\'s limit');
}
// binding: a t.me start link sends "/start <code>"; the host may bind an owner it already knows
{
  const ch = fileChannel(join(tmp, 'start', 'ch'));
  const core = openCore({ dir: join(tmp, 'start', 'core') });
  ch.say(OWNER, `/start ${core.bindCode()}`); await step(core, ch.adapter);
  ok(core.ownerOn('file') === String(OWNER) && !core.log().some((e) => /[0-9a-f]{8}/.test(e.target || '')), '"/start <code>" from a start link binds the owner; the code is never logged');
  const other = openCore({ dir: join(tmp, 'start2', 'core') });
  ok(!other.bindOwner('not-a-number', 'x', 'telegram') && !other.bindOwner(OWNER, 'no channel') && other.bindOwner(OWNER, 'earlier one-time code on this host', 'telegram') && other.ownerOn('telegram') === String(OWNER) && other.ownerOn('file') === null && other.log().at(-1).who === 'host', 'the host binds an owner it knows on one channel, logged as the host');
}

// buttons under the sender's own alert message, and the sender told of Acknowledge and Mute
{
  tg.updates.length = 0; tg.sent.length = 0; tg.fail = 0;
  const ch = tgChannel(join(tmp, 'anchor', 'tg'));
  const told = []; let failTell = false;
  const core = openCore({ dir: join(tmp, 'anchor', 'core'), chats: [GROUP], onChange: async (c) => { if (failTell) throw new Error('store locked'); told.push(c); } });
  ch.say(OWNER, `/bind ${core.bindCode()}`); await step(core, ch.adapter);
  await deliver(core, ch.adapter, [core.problem({ key: 'vps/disk', topic: 'ops', text: 'Disk 86% full', shownAt: { telegram: { chat: GROUP, msg: 777, thread: 5 } } })]);
  const m = tg.sent.at(-1);
  ok(m.reply_parameters?.message_id === 777 && m.message_thread_id === 5 && /^Actions · Disk 86% full$/.test(m.text) && m.disable_notification === true, 'with shownAt the buttons go silently under the alert\'s own message, not as a second alert');
  ch.tap(OWNER, button(ch, 'Acknowledge')); await step(core, ch.adapter);
  ch.tap(OWNER, button(ch, 'Mute 24h')); await step(core, ch.adapter);
  ok(told.length === 2 && told[0].what === 'acknowledge' && told[1].what === 'mute' && told[1].mutedUntil > Date.now() && told[0].ack === true && told[1].ack === false, 'Acknowledge and Mute pass their whole new state to the sender (a mute lifts an earlier acknowledge)');
  ok(!core.bindOwner(999, 'test', 'telegram') && core.ownerOn('telegram') === String(OWNER), 'the host cannot rebind a panel that has an owner');
  failTell = true;
  await deliver(core, ch.adapter, [core.problem({ key: 'vps/x', topic: 'ops', text: 'x' })]);
  ch.tap(OWNER, button(ch, 'Acknowledge')); await step(core, ch.adapter);
  ok(core.state().problems['vps/x'].state === 'acknowledged' && /not told: store locked/.test(core.log().at(-1).result), 'a sender that cannot be told is logged with the press; the panel state holds');
}
// an owner bound before 0.26.0 (one for all channels) is kept for the first channel he uses
{
  const dir = join(tmp, 'legacy', 'core');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ owner: String(OWNER), seq: 0, views: {}, problems: {}, decisions: {} }));
  const tgc = tgChannel(join(tmp, 'legacy', 'tg')), fc = fileChannel(join(tmp, 'legacy', 'file'));
  const core = openCore({ dir, chats: [GROUP] });
  tg.updates.length = 0; tgc.say(OTHER, '/status', OTHER); await step(core, tgc.adapter);
  ok(core.ownerOn('telegram') === null && core.log().at(-1).result === 'not the owner', 'an old single owner: another account claims nothing');
  tgc.say(OWNER, '/status', OWNER); await step(core, tgc.adapter);
  ok(core.ownerOn('telegram') === String(OWNER) && core.log().at(-1).what === 'status', 'an old single owner is bound to the first channel he uses, and his press counts');
  fc.say(OWNER, '/status', OWNER); await step(core, fc.adapter);
  ok(core.ownerOn('file') === null && core.log().at(-1).result === 'not the owner', 'and only to that one: another channel needs its own bind');
}
// a decision's answer goes to the host; one it cannot take is not kept
{
  const ch = fileChannel(join(tmp, 'ans', 'ch'));
  const got = []; let refuse = true;
  const core = openCore({ dir: join(tmp, 'ans', 'core'), now: () => T0, onAnswer: async (a) => { if (refuse) throw new Error('outbox full'); got.push(a); } });
  core.bindOwner(OWNER, 'test', 'file');
  await deliver(core, ch.adapter, [core.ask({ id: 'o/r#5/name', project: 'erp', question: 'Which name?', options: ['x', 'y'], issue: 'https://github.com/o/r/issues/5' })]);
  ok(/https:\/\/github\.com\/o\/r\/issues\/5$/.test(ch.shown().at(-1).text), 'a decision shows the link to its card');
  ch.tap(OWNER, button(ch, 'B'), OWNER); await step(core, ch.adapter);
  ok(core.state().decisions['o/r#5/name'].answer === null && /Not recorded: outbox full\. Press again/.test(ch.shown().at(-1).text) && /^failed: outbox full$/.test(core.log().at(-1).result), 'an answer the host refuses is not kept, and the owner is told to press again');
  refuse = false; ch.tap(OWNER, button(ch, 'B'), OWNER); await step(core, ch.adapter);
  ok(got.length === 1 && got[0].id === 'o/r#5/name' && got[0].option === 1 && got[0].by === `file:${OWNER}` && got[0].at === new Date(T0).toISOString() && got[0].issue === 'https://github.com/o/r/issues/5' && core.state().decisions['o/r#5/name'].answer.option === 1, 'the answer goes to the host with the card, the option, the channel account and the time');
  ch.tap(OWNER, button(ch, 'A'), OWNER); await step(core, ch.adapter);
  ok(got.length === 1, 'a second press never reaches the host');
}
server.close();

ok((() => { try { pickAdapter('carrier-pigeon'); return false; } catch (e) { return /not a known channel/.test(e.message); } })(), 'an unknown CONTROL_CHANNEL fails, naming the known ones');
ok(pickAdapter('file', { dir: join(tmp, 'pick') }).name === 'file', 'CONTROL_CHANNEL picks the adapter');
const ids = fileChannel(join(tmp, 'a', 'ch')).shown().flatMap((v) => v.buttons.map((b) => b.id));
ok(ids.length > 10 && ids.every((id) => Buffer.byteLength(id) <= 64 && /^(i|a|m|p|u|r|d[0-3]):v\d+$/.test(id)), 'every button id shown is a short op:view, within 64 bytes');

rmSync(tmp, { recursive: true, force: true });
console.log(`test-panel: OK · ${n} cases`);
