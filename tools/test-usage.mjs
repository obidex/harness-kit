#!/usr/bin/env node
// test-usage — the allowance measure (K072), offline, from a made-up transcript.
//
//   node tools/test-usage.mjs        exit 0 = every case held

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, plan, wakes, summarize, markdown, calibrate, jsonAt, guessOrigin, main } from '../.harness/tools/usage.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-usage: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-usage: ok ${n}. ${what}`); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const dir = mkdtempSync(join(tmpdir(), 'usage-'));
mkdirSync(join(dir, 's', 'subagents'), { recursive: true });
mkdirSync(join(dir, 's', 'tool-results'), { recursive: true });

// --- the made-up thread: two wakes, a subagent, a compaction, two tool results
const usage = (read, write1h, out, input = 2) => ({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write1h, cache_creation: { ephemeral_1h_input_tokens: write1h, ephemeral_5m_input_tokens: 0 }, output_tokens: out });
const asst = (t, id, model, u, content = [], extra = {}) => ({ created_at: t, assistant: { uuid: `a-${id}-${t}`, internal_anthropic_catchall: { message: { id, model, usage: u, content }, ...extra } } });
const user = (t, id, content) => ({ created_at: t, user: { uuid: `u-${id}`, internal_anthropic_catchall: { message: { content } } } });
const result = (t, id, origin, calls, since) => ({ created_at: t, result: { uuid: `r-${id}`, internal_anthropic_catchall: { origin: { kind: origin }, num_turns: calls, model_usage_since_last_result: since } } });
const sys = (t, id, extra) => ({ created_at: t, system: { uuid: `s-${id}`, internal_anthropic_catchall: extra } });

// wake 1 (owner message, cold first call, 5 calls, one subagent of type Explore)
const w1 = [
  asst('2026-11-25T10:00:01Z', 'm1', 'claude-opus-5-5', usage(1000, 300000, 10), [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cat docs/DECISIONS.md' } }]),
  user('2026-11-25T10:00:02Z', 'u1', [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(50000) }]),
  user('2026-11-25T10:00:02Z', 'u1-again', [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(50000) }]),
  asst('2026-11-25T10:00:03Z', 'm1', 'claude-opus-5-5', usage(1000, 300000, 10)), // same message id: counted once
  asst('2026-11-25T10:00:04Z', 'm2', 'claude-opus-5-5', usage(301000, 100, 10)),
  asst('2026-11-25T10:00:05Z', 'm3', 'claude-opus-5-5', usage(100000, 0, 0), [], { agent_id: 'ag1', subagent_type: 'Explore', task_description: 'Replay R24' }),
  asst('2026-11-25T10:00:06Z', 'm4', 'claude-opus-5-5', usage(301100, 100, 10)),
  asst('2026-11-25T10:00:07Z', 'm5', 'claude-opus-5-5', usage(301200, 100, 10)),
  result('2026-11-25T10:00:08Z', 'r1', 'human', 5, { 'claude-opus-5-5': { costUSD: 4.0 } }),
];
// wake 2 (background-task notice, warm, 2 calls: a short wake), then a compaction
const w2 = [
  sys('2026-11-25T11:00:00Z', 'c1', { status: null, compact_result: 'success' }),
  asst('2026-11-25T11:00:01Z', 'm6', 'claude-opus-5-5', usage(150000, 100, 5), [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/x/README.md' } }]),
  user('2026-11-25T11:00:02Z', 'u2', [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'y'.repeat(900) }, { type: 'image', source: { data: 'z'.repeat(99999) } }] }]),
  asst('2026-11-25T11:00:03Z', 'm7', 'claude-opus-5-5', usage(150100, 100, 5)),
  result('2026-11-25T11:00:04Z', 'r2', 'task-notification', 2, { 'claude-opus-5-5': { costUSD: 1.0 } }),
];
// a wake outside the window
const w0 = [
  asst('2026-11-24T09:00:01Z', 'm0', 'claude-opus-5-5', usage(1000, 1000, 1)),
  result('2026-11-24T09:00:02Z', 'r0', 'human', 1, { 'claude-opus-5-5': { costUSD: 9.0 } }),
];

const page = (events, first_id, has_more) => `<other-session nonce="n" untrusted="true">\nData.\n    ${JSON.stringify({ ccr: { data: events, has_more, first_id, last_id: 'z' } })}\n</other-session nonce="n">`;
const savedFile = join(dir, 's', 'tool-results', 'saved-page.txt');
writeFileSync(savedFile, page([...w1, ...w2], 'cur-1', true));
const line = (content, role = 'assistant') => JSON.stringify({ type: role, message: { role, content } });
const transcript = [
  line([{ type: 'tool_use', id: 'L1', name: 'mcp__hearthbot__list_threads', input: { since: '2026-11-25T00:00:00Z' } }]),
  line([{ type: 'tool_result', tool_use_id: 'L1', content: [{ type: 'text', text: `<child>${JSON.stringify({ sessions: [
    { session_id: 'cse_AAA', title: 'Build the thing', created_at: '2026-11-24T08:00:00Z', last_activity_at: '2026-11-25T11:00:04Z' },
    { session_id: 'cse_BBB', title: 'Platform coordinator run', created_at: '2026-11-25T12:00:00Z', last_activity_at: '2026-11-25T12:30:00Z' },
    { session_id: 'cse_OLD', title: 'Old thread', created_at: '2026-11-20T08:00:00Z', last_activity_at: '2026-11-21T08:00:00Z' },
  ] })}</child>` }] }], 'user'),
  line([{ type: 'tool_use', id: 'E1', name: 'mcp__claude-code-remote__list_events', input: { session_id: 'session_AAA', limit: 100 } }]),
  line([{ type: 'tool_result', tool_use_id: 'E1', content: `Error: result exceeds maximum allowed tokens. Output has been saved to ${savedFile}.\nFormat: Plain text` }], 'user'),
].join('\n');
writeFileSync(join(dir, 's.jsonl'), transcript + '\n');

// 1-3: reading back
const rec = readRecords([dir]);
ok(rec.threads.get('session_AAA')?.title === 'Build the thing', 'list_threads results are read, cse_ ids keyed as session_');
ok(rec.pages.get('session_AAA')?.[0]?.events.length === w1.length + w2.length, 'a list_events result saved to a file is read from that file');
ok(jsonAt('pre {"a":"}{","b":{"c":1}} post', '{"a"')?.b?.c === 1, 'jsonAt matches braces and skips braces inside strings');

// an inline page whose events quote a saved-file notice is read inline, never swapped for that file
const d2 = mkdtempSync(join(tmpdir(), 'usage-q-'));
writeFileSync(join(d2, 'q.jsonl'), [
  line([{ type: 'tool_use', id: 'Q1', name: 'mcp__claude-code-remote__list_events', input: { session_id: 'session_QQQ', limit: 100 } }]),
  line([{ type: 'tool_result', tool_use_id: 'Q1', content: [{ type: 'text', text: page([user('2026-11-25T10:00:00Z', 'q', `Output has been saved to ${savedFile}.`)], 'q-1', false) }] }], 'user'),
].join('\n') + '\n');
ok(readRecords([d2]).pages.get('session_QQQ')?.[0]?.events.length === 1, 'a saved-file notice quoted inside an inline page does not replace the page');
writeFileSync(join(d2, 'r.jsonl'), [
  line([{ type: 'tool_use', id: 'R1', name: 'mcp__claude-code-remote__list_events', input: { session_id: 'session_RRR', limit: 100 } }]),
  line([{ type: 'tool_result', tool_use_id: 'R1', content: `<remote-control-device-report/>\nError: result (9 characters) exceeds maximum allowed tokens. Output has been saved to ${savedFile}.` }], 'user'),
].join('\n') + '\n');
ok(readRecords([d2]).pages.get('session_RRR')?.[0]?.events.length === w1.length + w2.length, 'a saved-file notice behind a tag the session added is still read from its file');

// a session whose thread list tool is list_thread_sessions, and a page holding a raw control character
const d3 = mkdtempSync(join(tmpdir(), 'usage-s-'));
const ctl = page([user('2026-11-25T10:00:00Z', 'ctl', 'x')], 'c-1', false).replace('"x"', '"a\u0007b"');
writeFileSync(join(d3, 's.jsonl'), [
  line([{ type: 'tool_use', id: 'S1', name: 'mcp__hearthbot__list_thread_sessions', input: { since: '2026-11-25T00:00:00Z' } }]),
  line([{ type: 'tool_result', tool_use_id: 'S1', content: [{ type: 'text', text: JSON.stringify({ sessions: [{ session_id: 'cse_SSS', title: 'Erp build', created_at: '2026-11-25T08:00:00Z', last_activity_at: '2026-11-25T11:00:00Z' }] }) }] }], 'user'),
  line([{ type: 'tool_use', id: 'S2', name: 'mcp__claude-code-remote__list_events', input: { session_id: 'session_SSS', limit: 100 } }]),
  line([{ type: 'tool_result', tool_use_id: 'S2', content: [{ type: 'text', text: ctl }] }], 'user'),
].join('\n') + '\n');
const r3 = readRecords([d3]);
ok(r3.threads.get('session_SSS')?.title === 'Erp build', 'a list_thread_sessions result is read like list_threads');
ok(/\u0007/.test(ctl) && r3.pages.get('session_SSS')?.[0]?.events.length === 1, 'a page holding a raw control character is still read');

// 4-6: the paging plan
let calls = plan(rec, { from: '2026-11-25T00:00:00Z' });
ok(calls.some((c) => c.session_id === 'session_AAA' && c.before_id === 'cur-1'), 'next asks for the older page while the oldest page has more and starts after --from');
ok(calls.some((c) => c.session_id === 'session_BBB' && !c.before_id), 'next asks for the newest page of a thread not read yet');
ok(!calls.some((c) => c.session_id === 'session_OLD'), 'next skips a thread idle before --from');

// the older page arrives inline (in a subagent transcript), with nothing older
writeFileSync(join(dir, 's', 'subagents', 'agent-x.jsonl'), [
  line([{ type: 'tool_use', id: 'E2', name: 'mcp__claude-code-remote__list_events', input: { session_id: 'session_AAA', limit: 100, before_id: 'cur-1' } }]),
  line([{ type: 'tool_result', tool_use_id: 'E2', content: [{ type: 'text', text: page(w0, 'cur-0', false) }] }], 'user'),
].join('\n') + '\n');
const rec2 = readRecords([dir]);
calls = plan(rec2, { from: '2026-11-25T00:00:00Z' });
ok(!calls.some((c) => c.session_id === 'session_AAA'), 'next is done with a thread once its oldest page has no more (an inline result in a subagent transcript is read)');

// 8-17: the wakes and the summary
const w = wakes(rec2, { from: '2026-11-25T00:00:00Z', to: '2026-11-26T00:00:00Z', project: 'p' });
ok(w.wakes.length === 2, 'two wakes in the window; the one before --from is left out');
const [a, b] = w.wakes;
ok(near(a.usd, 4) && near(b.usd, 1), "each wake's price is its result's costUSD");
ok(a.origin === 'human' && b.origin === 'task-notification', 'what started each wake comes from origin.kind');
ok(a.warmth === 'cold' && b.warmth === 'warm', 'warm or cold from the first main call (cache write above cache read)');
ok(a.role === 'builder', 'a thread not named a coordinator is a builder');
const sub = a.parts['claude-opus-5-5|subagent:Explore'];
const wt = (r, c, o) => 2 + r * 0.1 + c * 2 + o * 5;
const expected = 4 * wt(100000, 0, 0) / (wt(1000, 300000, 10) + wt(301000, 100, 10) + wt(100000, 0, 0) + wt(301100, 100, 10) + wt(301200, 100, 10));
ok(near(sub, expected), "a subagent's part is its share of its wake's weighted tokens, one message counted once");
const s = summarize(w);
ok(near(s.short.usd, 1) && s.short.wakes === 1, 'the waiting share is the wakes that ended within 4 model calls');
ok(s.notices.wakes === 1 && s.cold.wakes === 1 && s.compactions === 1, 'notices, cold wakes and compactions are counted');
ok(s.topTools[0].size === 50000 && /cat docs\/DECISIONS\.md/.test(s.topTools[0].what), 'the largest tool result names the call behind it');
ok(s.ctxAbove[0][1] > 0 && s.ctxAbove[2][1] === 0 && s.ctxAbove[0][1] < s.ctxAbove[0][2], 'context buckets: use from calls above 200k is counted, none above 384k');
ok(s.topTools.length === 2 && s.topTools[1].size === 900 && s.topTools[1].images === 1, 'one tool result is counted once, and an image counts as an image, not as its encoded characters');
ok(near(s.topTasks[0][1], sub) && s.topTasks[0][0] === 'Replay R#', "a subagent's part also goes to its task, digits folded");
ok(a.coldUsd > 0 && a.coldUsd < a.usd && b.coldUsd === 0, 'a cold wake after the first carries the price of writing the cache again; a warm one none');
const md = markdown(s);
ok(/\$5\.00 at list price, 2 wakes, 1 threads/.test(md) && /Waiting share/.test(md) && /10 largest tool results/.test(md), 'the Markdown table opens with the total and carries each section');

// 19: calibration
const c = calibrate(w.wakes, { points: 10, at: '2026-11-25T23:00:00Z', since: '2026-11-25T00:00:00Z', merged: [['p', 4]] });
ok(near(c.usdPerPoint, 0.5) && near(c.perMerged[0][2], 2.5), 'calibration: dollars per point and points per merged change');

// the opening text names the start when the result does not
ok(guessOrigin(['<session-context nonce="x">', '<wake reason="project-activity">']) === 'thread start', 'a wake that opens with the session context is a thread start');
ok(guessOrigin(['<wake reason="external-event" current-time="t">']) === 'wake:external-event' && guessOrigin(['<task-notification> <task-id>a</task-id>']) === 'task-notification' && guessOrigin(['x', '<task-notification>']) === null, 'other openings: the wake reason, a task notice; only the first text counts, else none');
ok(guessOrigin(['<agent-message from="a">hand-back', '<task-notification> later']) === 'peer', 'a hand-back that opens the wake is a peer message even when a notice follows it');
const relay = [
  result('2026-11-25T09:59:00Z', 'empty', 'task-notification', 0, {}),
  user('2026-11-25T09:59:30Z', 'open', '<session-context nonce="n">context</session-context>'),
  ...w1.slice(0, -1),
  result('2026-11-25T10:00:08Z', 'r1b', 'task-notification', 5, { 'claude-opus-5-5': { costUSD: 4.0 } }),
];
const rw = wakes({ threads: rec2.threads, pages: new Map([['session_AAA', [{ events: relay, has_more: false }]]]) }, { from: '2026-11-25T00:00:00Z' }).wakes;
ok(rw.length === 1 && rw[0].origin === 'thread start' && rw[0].warmth === 'cold (thread start)' && rw[0].coldUsd === 0, "the opening text wins over a catch-all origin.kind, and an empty record before it is no wake and does not use up the thread's first wake");
const only = wakes({ threads: rec2.threads, pages: new Map([['session_AAA', [{ events: [...w1], has_more: false }]]]) }, { from: '2026-11-25T00:00:00Z' });
ok(only.wakes[0].warmth === 'cold (thread start)', "a cold first call on a thread's first wake is told apart from a cache that expired");

const bare = [...w1.slice(0, -1), { created_at: '2026-11-25T10:00:08Z', result: { uuid: 'r-bare', internal_anthropic_catchall: { num_turns: 5, model_usage_since_last_result: { 'claude-opus-5-5': { costUSD: 4 } } } } }];
ok(wakes({ threads: rec2.threads, pages: new Map([['session_AAA', [{ events: bare, has_more: false }]]]) }, { from: '2026-11-25T00:00:00Z' }).wakes[0].origin === 'thread start', "a thread's first paid wake with no origin and no opening text is its start");
const resumed = wakes({ threads: rec2.threads, pages: new Map([['session_AAA', [{ events: [...w1], has_more: true }]]]) }, { from: '2026-11-25T00:00:00Z' }).wakes[0];
ok(resumed.warmth === 'cold' && resumed.coldUsd > 0, "a thread not read back to its start: its first wake read is a cache that expired, not a start");
ok(guessOrigin(['[auto-continue 1/4] cut off']) === 'auto-continue' && guessOrigin(['<system-note>Thread state']) === 'wake:project-note', 'an automatic continuation and a project note are named');

// the command line
const quiet = console.error; console.error = () => {};
ok(main(['table']) === 2, 'table without --from is a usage error');
const jf = join(dir, 'p.json'); writeFileSync(jf, JSON.stringify(w));
ok(main(['merge', jf, '--points', '10']) === 2, 'merge with --points but no --points-at or --since is a usage error, never a silent $0');
const logs = []; const keep = console.log; console.log = (x) => logs.push(x);
main(['merge', jf, jf, '--md']); console.log = keep;
ok(/\$5\.00 at list price, 2 wakes/.test(logs.join('\n')), 'merge counts a wake given twice once');
ok(main(['table', '--from', '2026-11-25T00:00:00Z', '--dir', join(tmpdir(), 'usage-none-' + process.pid)]) === 3, 'no records is exit 3, never an empty table');
console.error = quiet;

console.log(`test-usage: ${n} of ${n} held`);
