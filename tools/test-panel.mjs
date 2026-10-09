#!/usr/bin/env node
// test-panel — the control panel core (K025) through a channel adapter, offline.
//
//   node tools/test-panel.mjs        exit 0 = every case held
//
// One scenario (a problem opens, is acknowledged, muted, comes back, resolves; a decision is asked and
// answered, a second tap says already answered; /status; refusals) runs through a channel. It must end
// with the same core state and the same log on every channel, and a run that switches channel halfway
// must end with the whole history.

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { openCore, deliver, step, fileAdapter, telegramAdapter, pickAdapter } from '../.harness/tools/panel.mjs';
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
const tg = { updates: [], sent: [], answered: 0, nextUpdate: 1, msg: 1000 };
const json = (res, data) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: data })); };
const server = await new Promise((done) => { const sv = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
  const p = b ? JSON.parse(b) : {}; const method = req.url.split('/').pop();
  if (!req.url.startsWith('/botTEST-TOKEN/')) { res.writeHead(401); return res.end('{"ok":false}'); }
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
  ok(core.state().owner === null && core.log().at(-1).result === 'not the owner', 'a code older than 1 h binds nobody, and the refusal is logged');
  const code = openCore({ dir: core.dir, now: () => clock.t }).bindCode(); // a second process, as on the host
  ch.say(OTHER, `/bind wrong`); await step(core, ch.adapter);
  ch.say(OTHER, `/bind ${code}`, GROUP); await step(core, ch.adapter);
  ok(core.state().owner === null, 'the right code sent in a group binds nobody');
  ch.say(OWNER, `/bind ${code}`); await step(core, ch.adapter);
  ok(core.state().owner === String(OWNER), 'a code made by a second process while the service runs binds the owner');
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
const canon = (core) => ({
  state: { ...core.state(), views: Object.fromEntries(Object.entries(core.state().views).map(([k, v]) => [k, v.about])),
    decisions: Object.fromEntries(Object.entries(core.state().decisions).map(([k, d]) => [k, { ...d, answer: d.answer && { ...d.answer, channel: '-' } }])) },
  log: core.log().map(({ channel, ...e }) => e),
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

// the same scenario through Telegram (a stand-in), and switching Telegram -> file halfway
const tgRun = await run('t', (d) => { const c = tgChannel(join(d, 'tg')); return [c, c]; });
ok(JSON.stringify(canon(tgRun)) === JSON.stringify(canon(fileA)), 'Telegram ends with the same core state and log as the file channel');
ok(tg.answered > 0 && tg.sent.some((m) => m.message_thread_id === 5 && /PROBLEM/.test(m.text)) && tg.sent.some((m) => m.message_thread_id === 2 && /DECISION/.test(m.text)), 'problems go to their topic, decisions to "Needs you", each press is answered');
ok(tg.sent.filter((m) => m.reply_markup).every((m) => m.reply_markup.inline_keyboard.flat().every((k) => Buffer.byteLength(k.callback_data) <= 64)), 'every button sent to Telegram carries only its short id');
tg.updates.length = 0; tg.sent.length = 0;
const away = await run('w', (d) => [tgChannel(join(d, 'tg')), fileChannel(join(d, 'file'))]);
ok(JSON.stringify(canon(away)) === JSON.stringify(canon(fileA)), 'leaving Telegram halfway (CONTROL_CHANNEL telegram -> file) keeps the whole history');
ok(away.log().some((e) => e.channel === 'telegram') && away.log().some((e) => e.channel === 'file'), 'the log shows the presses from both channels');
server.close();

ok((() => { try { pickAdapter('carrier-pigeon'); return false; } catch (e) { return /not a known channel/.test(e.message); } })(), 'an unknown CONTROL_CHANNEL fails, naming the known ones');
ok(pickAdapter('file', { dir: join(tmp, 'pick') }).name === 'file', 'CONTROL_CHANNEL picks the adapter');
const ids = fileChannel(join(tmp, 'a', 'ch')).shown().flatMap((v) => v.buttons.map((b) => b.id));
ok(ids.length > 10 && ids.every((id) => Buffer.byteLength(id) <= 64 && /^(i|a|m|p|u|r|d[0-3]):v\d+$/.test(id)), 'every button id shown is a short op:view, within 64 bytes');

rmSync(tmp, { recursive: true, force: true });
console.log(`test-panel: OK · ${n} cases`);
