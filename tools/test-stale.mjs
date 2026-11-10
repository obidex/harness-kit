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
import { parseCron, nextRun, scheduleState, overdueHours, schedules, alertSchedules, missedText, isTracking, checkState, classifyPr, classifyIssue, select, settings, loadData, render, signature, idleText, itemKey, itemText, topicOf, profileTopic, report, DEFAULTS, MARKER, STATE_LABEL, stateKey, stateFreshness } from '../.harness/tools/stale.mjs';
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
const S = settings();
const picked = select(cands, NOW, S);
ok(signature(picked) === '1,3,5,6,7,9' && DEFAULTS.pr === 48 && DEFAULTS.card === 48 && DEFAULTS.conflict === 24 && DEFAULTS.inbox === 24, `defaults in hours: PRs 48, conflicted 24, inbox 24, card/risk 48; a bot PR counts (${signature(picked)})`);
ok(picked[0].number === 9 && picked[0].hours === 216 && picked[0].limit === 48 && picked.at(-1).hours === 24 && picked.at(-1).limit === 24, 'longest idle first, with whole hours idle and the threshold each met');
const t = settings({}, { HARNESS_STALE_PR_DAYS: '1', HARNESS_STALE_CARD_DAYS: '3', HARNESS_STALE_INBOX_DAYS: '' });
ok(t.hours.pr === 24 && t.hours.card === 72 && t.hours.inbox === 24 && t.hours.conflict === 24 && signature(select(cands, NOW, t)) === '1,2,3,5,7,9', 'the legacy Actions variables (days) still override; an empty value keeps the default');
const fromData = settings({ hours: { card: 120, pr: 72 } });
ok(fromData.hours.card === 120 && fromData.hours.pr === 72 && signature(select(cands, NOW, fromData)) === '3,5,7,9', 'thresholds are data: the profile\'s stale.hours (or a --config file) sets them, no code change');
let threw = 0;
for (const bad of [[{ hours: { card: 'two' } }, {}], [{ hours: { soon: 3 } }, {}], [{ hours: { card: 0 } }, {}], [{ watch: ['prs'] }, {}], [{ alerts_max: 0 }, {}], [{ initiative_labels: 'Now' }, {}], [{}, { HARNESS_STALE_PR_DAYS: 'two' }], [[], {}]]) { try { settings(...bad); } catch { threw++; } }
ok(threw === 8, 'a threshold, watch, cap or label list it cannot read is refused, never a silent default');
{
  const { validateSchema } = await import('../.harness/tools/lib.mjs');
  const schema = JSON.parse(readFileSync(join(kit, '.harness/profile.schema.json'), 'utf8')), example = JSON.parse(readFileSync(join(kit, 'examples/profile.example.json'), 'utf8'));
  const withHours = (hours) => validateSchema(schema, { ...example, stale: { hours } });
  ok(Object.keys(DEFAULTS).every((k) => withHours({ [k]: 24 }).length === 0) && withHours({ soon: 24 }).length > 0 && settings({ hours: { state: 24 } }).hours.state === 24,
    'every threshold the tool reads, hours.state among them, is one the profile schema accepts; an unknown one is refused');
}
{
  const d = mkdtempSync(join(tmpdir(), 'stale-data-'));
  writeFileSync(join(d, 'p.json'), JSON.stringify({ alerts: { topic: 'kit' }, stale: { hours: { card: 30 } } }));
  writeFileSync(join(d, 'c.json'), JSON.stringify({ hours: { initiative: 24 }, initiative_labels: ['Now'] }));
  ok(loadData(undefined, join(d, 'p.json')).hours.card === 30 && loadData(join(d, 'c.json')).initiative_labels[0] === 'Now' && Object.keys(loadData(undefined, join(d, 'none.json'))).length === 0,
    'the data comes from the profile\'s `stale` object, or the whole --config file; no profile means the defaults');
  rmSync(d, { recursive: true, force: true });
}
// initiatives and wait records (S-033 item 1): a board's Now items and its STATE issue
const B = settings({ initiative_labels: ['Now'], wait_labels: ['coordinator-state', 'wake'], watch: ['initiative', 'wait'] });
ok(classifyIssue({ labels: [{ name: 'Now' }, { name: 'initiative' }] }, B) === 'initiative' && classifyIssue({ labels: ['coordinator-state'] }, B) === 'wait' && classifyIssue({ labels: ['card'] }, B) === 'card'
  && classifyIssue({ labels: ['Now'], body: '<!-- harness-alert: {} -->' }, B) === null && classifyIssue({ labels: ['Now'] }) === null,
  'an issue with an initiative label is an initiative, with a wait label a wait record; an alert\'s own issue is never listed');
const board = [
  { number: 12, url: 'u12', title: 'Launch readiness', kind: 'initiative', updatedAt: ago(23) },
  { number: 48, url: 'u48', title: 'Radar', kind: 'initiative', updatedAt: ago(0) },
  { number: 54, url: 'u54', title: 'Coordinator state', kind: 'wait', updatedAt: ago(3) },
  { number: 60, url: 'u60', title: 'a card', kind: 'card', updatedAt: ago(9) },
  { number: 61, url: 'u61', title: 'a PR', kind: 'red', updatedAt: ago(9) },
];
ok(signature(select(board, NOW, B)) === '12,54', 'watching initiatives and wait records only: a Now item and the STATE issue idle past 48 h are stale; cards and PRs are left to their own repository\'s check');
ok(signature(select(board.filter((c) => c.kind !== 'initiative'), NOW, B)) === '', 'a wait record counts only while an initiative is open');
ok(signature(select(board.filter((c) => c.kind !== 'initiative'), NOW, settings({ wait_labels: ['coordinator-state'] }))) === '54,60,61', 'with no initiative label configured, a wait record always counts');

// --- body, the alert text --------------------------------------------------------------------------
const b = render(picked);
ok(b.startsWith(MARKER) && b.includes('| [#9](u9) Bump x from 1 to 2 | red | 9 days | 48 h |') && b.includes('Thresholds in hours: PRs 48') && b.includes('Nothing here goes to the owner') && !/alerts at most/.test(b), 'the body: marker first, each item with its kind, idle time and threshold, then the thresholds; it says nothing goes to the owner');
ok(render([{ number: 1, url: 'u', title: 'a | b @someone [x]', kind: 'card', hours: 50, limit: 48 }]).includes('a \\| b @​someone \\[x\\]'), 'titles cannot break the table or mention anyone');
ok(idleText(5) === '5 h' && idleText(47) === '47 h' && idleText(48) === '2 days' && idleText(77) === '3 days 5 h', 'idle time reads in hours, then days');
const txt = itemText('o/r', { number: 12, title: 'Launch\nreadiness', kind: 'initiative', hours: 552, limit: 48 });
ok(itemKey('o/r', 12) === 'stale:o/r#12' && txt === 'Stale initiative in o/r: #12 Launch readiness has had no commit, comment or change for 23 days (threshold 48 h). Resume it or record why it waits.', 'one stable key per item, and a one-line text saying what is stale, for how long, against which threshold');
ok(topicOf('website') === 'website' && topicOf('erp') === 'erp' && topicOf('kit') === 'kit' && topicOf('needs') === null && topicOf('daily') === null && topicOf('nope') === null && topicOf('') === null, "ALERTS_TOPIC names one of notify.mjs's project topics; never Needs you or Daily");
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
    if (u.pathname === '/repos/o/r/pulls') return send(200, u.searchParams.get('page') === '1' ? pulls.filter((p) => (p.list.state || 'open') === (u.searchParams.get('state') || 'open')).map((p) => p.list) : []);
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
issues.push({ number: 50, state: 'open', html_url: 'https://gh.test/o/r/issues/50', title: 'Stale work', labels: [], updated_at: ago(0), user: { login: 'mallory', type: 'User' }, body: render([]) });
issues.push({ number: 51, state: 'open', html_url: 'https://gh.test/o/r/issues/51', title: 'Stale work', labels: [], updated_at: ago(0), user: { login: 'github-actions', type: 'User' }, body: render([]) });
const tracking = () => issues.filter((i) => String(i.body).includes(MARKER) && i.user.type === 'Bot');
const alertIssues = () => issues.filter((i) => String(i.body).includes('<!-- harness-alert:'));
const add = (number, label, days) => issues.push({ number, state: 'open', html_url: `https://gh.test/o/r/issues/${number}`, title: `issue ${number}`, labels: [{ name: label }], body: '', updated_at: ago(days) });

ok(!isTracking(issues[1]) && !isTracking(issues[2]) && isTracking({ body: MARKER, user: { login: 'github-actions[bot]', type: 'Bot' } }), 'only an issue filed by github-actions[bot] can be the tracking issue; a planted marker issue never counts');
const at0 = (ms) => { process.env.ALERTS_NOW = new Date(ms).toISOString(); return ms; };
const fresh = () => settings({});
const alertOf = (n) => alertIssues().find((i) => i.body.includes(`"key":"stale:o/r#${n}"`));
let r = await report('o/r', at0(NOW), fresh());
ok(signature(r.items) === '1,3,10' && tracking().length === 1 && tracking()[0].title === 'Stale work' && r.alert === 'none' && alertIssues().length === 0 && tg.length === 0, 'report files one "Stale work" issue; without the Ops board that list is all there is');
const first = tracking()[0];
ok(first.body.includes('| green-unmerged | 3 days |') && first.body.includes('| conflicted | 24 h | 24 h |'), 'the issue lists each item with its kind, idle time and threshold');
// stale work never reaches the owner (owner, roadmap #59, 8 Nov 2026; K038): not with a topic, not with a bot token
Object.assign(process.env, { ALERTS_TOPIC: 'website', ALERTS_BOT_TOKEN: 'TOKEN', ALERTS_CHAT_ID: '42' });
r = await report('o/r', at0(NOW + 3600000), fresh());
ok(tg.length === 0 && alertIssues().length === 0 && r.alert === 'none', 'with a topic and a bot token, a stale item still sends nothing to Telegram and records no problem');
// a capped problem an earlier kit sent for an item (and 0.31's one aggregate problem) is closed without a message
const legacy = (n, key, msg) => issues.push({ number: n, state: 'open', html_url: `https://gh.test/o/r/issues/${n}`, title: 'Alert: old', labels: [], updated_at: ago(0), user: { login: 'github-actions[bot]', type: 'Bot' }, comments: [],
  body: `<!-- harness-alert: ${JSON.stringify({ key, topic: 'website', text: 'Stale card in o/r: #10 a card (alert 2 of 3)', opened: NOW, msg, count: 2, open: true, maxSends: 3, sends: 2 })} -->\n**PROBLEM:** x` });
legacy(300, 'stale:o/r', 998); legacy(301, 'stale:o/r#10', 999); legacy(302, 'stale:o/r#77', 997);
r = await report('o/r', at0(NOW + 2 * 3600000), fresh());
ok(tg.length === 0 && ['stale:o/r', 'stale:o/r#10', 'stale:o/r#77'].every((k) => r.alerts[k] === 'closed-quietly') && [300, 301, 302].every((n) => issues.find((i) => i.number === n).state === 'closed'),
  'the problems an earlier kit sent (per item, for an item that moved, and the old aggregate) close without a RESOLVED, a STILL OPEN or any message');
// with the Ops board: one ops row per stale item, ✅ when it moves; still nothing in Telegram
process.env.ALERTS_OPS_BOARD = 'github:o/r';
const boardIssue = () => issues.find((i) => i.title === 'Ops board');
r = await report('o/r', at0(NOW + 3 * 3600000), fresh());
ok(tg.length === 0 && ['1', '3', '10'].every((n) => r.alerts[`stale:o/r#${n}`] === 'sent') && boardIssue() && boardIssue().comments.length === 3 && /⚠️ problem · `stale:o\/r#10` · Stale card in o\/r: #10 a card/.test(boardIssue().comments.join('\n')) && /\| ⚠️ \| o\/r \|/.test(boardIssue().body),
  'with ALERTS_OPS_BOARD each stale item is one ⚠️ row on the Ops board with its comment, and nothing goes to Telegram');
ok(signature(r.items) === '1,3,10' && tracking().length === 1, 'the next run does not file a second tracking issue');
r = await report('o/r', at0(NOW + 4 * 3600000), fresh());
ok(tg.length === 0 && boardIssue().comments.length === 3 && r.alerts['stale:o/r#10'] === 'repeat', 'the next run while it stays stale adds nothing to the board');
pulls.length = 0; issues.find((i) => i.number === 10).updated_at = new Date(NOW + 5 * 3600000).toISOString();
r = await report('o/r', at0(NOW + 6 * 3600000), fresh());
ok(tg.length === 0 && r.alerts['stale:o/r#10'] === 'resolved' && boardIssue().comments.filter((c) => /^✅ resolved after .* · `stale:o\/r#10`/.test(c)).length === 1 && tracking()[0].state === 'closed' && /Nothing is stale/.test(tracking()[0].body),
  'the items move: each board row turns ✅ with one resolve comment, "Stale work" closes, and Telegram hears nothing');
const patches = tracking()[0].patches, boardComments = boardIssue().comments.length;
r = await report('o/r', at0(NOW + 6 * 3600000 + 60000), fresh());
ok(tracking()[0].patches === patches && r.alert === 'none' && boardIssue().comments.length === boardComments && tg.length === 0, 'an empty list with everything closed touches nothing and sends nothing');
add(13, 'card', 10);
r = await report('o/r', at0(NOW + 6 * 3600000 + 120000), fresh());
ok(tracking().length === 1 && tracking()[0].number === first.number && tracking()[0].state === 'open' && signature(r.items) === '13' && tg.length === 0, 'a new stale item reopens the same "Stale work" issue, never a second one');
issues.splice(issues.findIndex((i) => i.number === 13), 1);
// a board: initiatives and wait records with their own --config (S-033 item 1), in the same tracking issue and board
issues.push({ number: 12, state: 'open', html_url: 'https://gh.test/o/r/issues/12', title: 'Launch readiness', labels: [{ name: 'Now' }, { name: 'initiative' }], body: '', updated_at: ago(23) },
  { number: 54, state: 'open', html_url: 'https://gh.test/o/r/issues/54', title: 'Coordinator state', labels: [{ name: 'coordinator-state' }], body: '<!-- coordinator-state -->', updated_at: new Date(NOW + 7 * 86400000 - 3600000).toISOString() });
pulls.push(pr(70, 9, { mergeable: true }, [run('failure')]));
r = await report('o/r', at0(NOW + 7 * 86400000), B);
ok(signature(r.items) === '12' && r.alerts['stale:o/r#12'] === 'sent' && tg.length === 0 && /`stale:o\/r#12` · Stale initiative in o\/r: #12 Launch readiness/.test(boardIssue().comments.join('\n')) && tracking()[0].body.includes('initiatives (`Now`) 48'),
  'a board watching initiatives and wait records puts a Now item idle 23 days on the Ops board, never in Telegram; the STATE issue moved within 48 h');

// --- the STATE issue's freshness (K042): out of date only when work merged since it was last written ----
{
  const T = NOW + 7 * 86400000, B2 = settings({ initiative_labels: ['Now'], watch: ['initiative'] }), iso = (ms) => new Date(ms).toISOString(), H = 3600000;
  ok(DEFAULTS.state === 48 && STATE_LABEL === 'coordinator-state' && stateKey('o/r') === 'state:o/r'
    && stateFreshness({ updatedAt: iso(T - 50 * H), merges: [iso(T - 10 * H), null, iso(T - 60 * H)], now: T }).stale && stateFreshness({ updatedAt: iso(T - 50 * H), merges: [iso(T - 10 * H), iso(T - 60 * H)], now: T }).merges === 1
    && !stateFreshness({ updatedAt: iso(T - 50 * H), merges: [iso(T - 60 * H)], now: T }).stale && !stateFreshness({ updatedAt: iso(T - 47 * H), merges: [iso(T - 10 * H)], now: T }).stale
    && stateFreshness({ updatedAt: iso(T - 30 * H), merges: [iso(T - 10 * H)], now: T, limit: 24 }).stale,
    'a STATE issue is out of date when it was written 48 h or more ago AND a pull request merged since; idle with no merge since, or a merge before it was written, is not');
  const st54 = issues.find((i) => i.number === 54);
  const comments0 = boardIssue().comments.length;
  st54.updated_at = iso(T - 50 * H);
  r = await report('o/r', at0(T), B2);
  ok(r.state.number === 54 && r.state.hours === 50 && !r.state.stale && !('state:o/r' in r.alerts), 'a STATE issue idle 50 h with no merge since raises nothing: nothing moved');
  pulls.push({ list: { number: 71, state: 'closed', title: 'merged before', html_url: 'u71', updated_at: iso(T - 60 * H), merged_at: iso(T - 60 * H) }, full: {}, runs: [] },
    { list: { number: 72, state: 'closed', title: 'closed unmerged', html_url: 'u72', updated_at: iso(T - 5 * H), merged_at: null }, full: {}, runs: [] });
  r = await report('o/r', at0(T + 60000), B2);
  ok(!r.state.stale && !('state:o/r' in r.alerts), 'a merge before the state was written, or a pull request closed unmerged, does not count');
  pulls.push({ list: { number: 73, state: 'closed', title: 'merged since', html_url: 'u73', updated_at: iso(T - 10 * H), merged_at: iso(T - 10 * H) }, full: {}, runs: [] });
  r = await report('o/r', at0(T + 120000), B2);
  ok(r.state.stale && r.state.merges === 1 && r.alerts['state:o/r'] === 'sent' && tg.length === 0 && boardIssue().comments.length === comments0 + 1
    && /⚠️ problem · `state:o\/r` · State out of date in o\/r: #54 was last written 2 days 2 h ago and 1 pull request merged since \(threshold 48 h\)/.test(boardIssue().comments.join('\n')),
    'a STATE issue 50 h old with a merge since is ONE ⚠️ row on the Ops board (state:<repo>), never a Telegram message');
  r = await report('o/r', at0(T + 180000), B2);
  ok(r.alerts['state:o/r'] === 'repeat' && boardIssue().comments.length === comments0 + 1 && signature(r.items) === '12' && !tracking()[0].body.includes('#54'), 'the next run adds nothing; the state row is not an item of the "Stale work" list');
  r = await report('o/r', at0(T + 200000), B);
  ok(r.state.stale && r.state.listed && r.alerts['stale:o/r#54'] === 'sent' && r.alerts['state:o/r'] === 'resolved', 'where the STATE issue is already listed as a stale wait record, that item row is the only one: never two rows for one issue');
  r = await report('o/r', at0(T + 220000), B2);
  ok(r.alerts['state:o/r'] === 'sent' && r.alerts['stale:o/r#54'] === 'resolved', 'and the other way round');
  delete process.env.ALERTS_OPS_BOARD;
  r = await report('o/r', at0(T + 240000), B2);
  ok(r.state.stale && !('state:o/r' in r.alerts) && tg.length === 0, 'without the Ops board an out-of-date state is only logged');
  process.env.ALERTS_OPS_BOARD = 'github:o/r';
  st54.updated_at = iso(T + H);
  r = await report('o/r', at0(T + 2 * H), B2);
  ok(!r.state.stale && r.alerts['state:o/r'] === 'resolved' && boardIssue().comments.filter((c) => /^✅ resolved after .* · `state:o\/r`/.test(c)).length === 2 && tg.length === 0, 'rewriting the STATE issue turns the row ✅ on the next run');
  st54.state = 'closed';
  r = await report('o/r', at0(T + 2 * H + 60000), B2);
  ok(r.state === null && !('state:o/r' in r.alerts), 'a repository with no open STATE issue has no state row');
  st54.state = 'open';
  pulls.splice(pulls.findIndex((p) => p.list.number === 71), 3);
}

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
const done = { status: 'completed', conclusion: 'success' };
wfs[0].runs = [{ event: 'schedule', created_at: '2026-10-05T05:37:00Z', ...done }]; wfs[1].runs = [...Array.from({ length: 40 }, () => ({ event: 'push', created_at: '2026-10-06T12:00:00Z', ...done })), { event: 'schedule', created_at: '2026-09-28T07:02:00Z', ...done }]; wfs[4].runs = [{ event: 'schedule', created_at: '2026-10-05T03:20:00Z', ...done }];
for (const k of ['ALERTS_BOT_TOKEN', 'ALERTS_CHAT_ID', 'ALERTS_TOPIC']) delete process.env[k];
Object.assign(process.env, { ALERTS_TOPICS: '{"needs":1,"website":5,"kit":6}' });
const T0 = at('2026-10-05T15:00:00Z');
let sch = await schedules('o/r', T0);
ok(sch.map((x) => x.file).join(',') === 'hands-settings.yml,hands-update.yml,quiet.yml' && sch.every((x) => !x.overdue) && sch[1].due === '2026-10-05T06:41:00.000Z',
  'schedules lists every scheduled workflow (never one without a schedule or one turned off by hand); a Monday run due this morning is not yet a fault');
delete process.env.ALERTS_OPS_BOARD;
Object.assign(process.env, { ALERTS_BOT_TOKEN: 'TOKEN', ALERTS_CHAT_ID: '42' });
const tgBefore = tg.length;
const T1 = at('2026-10-06T18:42:00Z'); // hands-update due 06:41 on the 5th, 36 h 1 min ago; quiet.yml due 03:00 on the 6th
legacy(310, 'schedule:o/r/hands-settings.yml', 996);
sch = await alertSchedules('o/r', T1, null);
ok(sch.find((x) => x.file === 'hands-update.yml').overdue && /listed only/.test(sch.find((x) => x.file === 'hands-update.yml').alert) && tg.length === tgBefore && issues.find((i) => i.number === 310).state === 'closed',
  'without the Ops board a missed schedule is only listed; an older kit\'s missed-schedule problem closes without a message; Telegram hears nothing');
const ob = (await import('../.harness/tools/notify.mjs')).opsBoard('github:o/r');
const bc = () => boardIssue().comments.length;
const c0 = bc();
sch = await alertSchedules('o/r', T1, ob);
ok(sch.find((x) => x.file === 'hands-update.yml').alert === 'sent' && tg.length === tgBefore && bc() === c0 + 1 && /⚠️ problem · `schedule:o\/r\/hands-update.yml` · Scheduled run missed: hands-update in o\/r was due 2026-10-05 09:41 and is 36 h overdue/.test(boardIssue().comments.join('\n')),
  'with the Ops board a schedule more than 36 h overdue (push runs neither count nor hide its last run) is a ⚠️ row there, never a Telegram message');
ok(sch.find((x) => x.file === 'hands-settings.yml').overdue === false && sch.find((x) => x.file === 'hands-settings.yml').alert === 'none', 'a schedule on time adds nothing');
ok(missedText('o/r', { workflow: 'quiet', state: 'disabled_inactivity', due: '2026-10-06T03:00:00.000Z', lateHours: 40, lastRun: null }).includes('turned its schedule off for inactivity'), 'a schedule GitHub turned off for inactivity says so');
sch = await alertSchedules('o/r', T1 + 3600000, ob);
ok(bc() === c0 + 1 && sch.find((x) => x.file === 'hands-update.yml').alert === 'repeat', 'the next check while it is still missing adds nothing (one open row per key)');
wfs[1].runs = [{ event: 'workflow_dispatch', created_at: '2026-10-06T19:05:00Z', ...done }, ...wfs[1].runs];
sch = await alertSchedules('o/r', at('2026-10-07T05:30:00Z'), ob);
ok(sch.find((x) => x.file === 'hands-update.yml').alert === 'resolved' && tg.length === tgBefore && /^✅ resolved after .* · `schedule:o\/r\/hands-update.yml`/.test(boardIssue().comments.at(-1)),
  'once it has run again (on schedule, or by hand from Actions), its board row turns ✅, still with nothing in Telegram');
// a new or moved scheduled workflow (owner, 2026-10-06): its clock starts when it appeared in the repository, never at "never"
{
  const moved = wf(6, 'box-watch.yml', ['20 6 * * *']); moved.meta.created_at = '2026-10-07T18:18:00Z'; wfs.push(moved);
  const bw = async (iso, alert) => (await (alert ? alertSchedules('o/r', at(iso), ob) : schedules('o/r', at(iso)))).find((x) => x.file === 'box-watch.yml');
  const sentBw = () => boardIssue().comments.filter((c) => /box-watch/.test(c)).length;
  const night = await bw('2026-10-08T05:45:00Z', true), firstDue = await bw('2026-10-08T06:21:00Z'), edge = await bw('2026-10-09T18:19:00Z', true);
  ok(!night.overdue && night.alert === 'none' && night.due === '2026-10-08T06:20:00.000Z' && !firstDue.overdue && !edge.overdue && edge.alert === 'none' && sentBw() === 0,
    'a workflow moved in at 18:18 and never run raises nothing overnight, at its first due time, or until 36 h after it');
  const late = await bw('2026-10-09T18:22:00Z', true);
  ok(late.overdue && late.alert === 'sent' && sentBw() === 1 && /last run never/.test(boardIssue().comments.filter((c) => /box-watch/.test(c)).at(-1)), 'only once its first due time is more than 36 h past does it count as missed');
  wfs.pop();
}
// a stuck run (hands-keep, 6-8 Oct 2026): one run "waiting" forever, every later scheduled run created
// and cancelled behind it. Those runs are not runs: the work stopped, and the check says so
{
  const keep = wf(7, 'keep.yml', ['53 * * * *']);
  const hourly = (from, n, extra) => Array.from({ length: n }, (_, i) => ({ event: 'schedule', created_at: new Date(at(from) - i * 3600000).toISOString(), status: 'completed', conclusion: 'cancelled', ...extra }));
  keep.runs = [{ event: 'schedule', created_at: '2026-10-07T22:53:00Z', status: 'pending' }, ...hourly('2026-10-07T21:53:00Z', 4),
    { event: 'schedule', created_at: '2026-10-06T19:53:00Z', status: 'waiting' }, { event: 'schedule', created_at: '2026-10-06T14:53:00Z', status: 'completed', conclusion: 'success' }];
  wfs.push(keep);
  const k = async (iso) => (await schedules('o/r', at(iso))).find((x) => x.file === 'keep.yml');
  const early = await k('2026-10-07T23:00:00Z'), stuck = await k('2026-10-08T04:00:00Z');
  ok(!early.overdue && stuck.overdue && stuck.lastRun === '2026-10-06T14:53:00Z',
    'runs that were cancelled, or never finished (pending, waiting), do not count: an hourly job stuck since its last finished run at 14:53 is missed 36 h later, though new runs were created every hour');
  // the page slides: each check sees the 30 newest runs, all cancelled, the oldest only 29 h back
  let slid = true;
  for (const iso of ['2026-10-08T01:00:00Z', '2026-10-09T09:00:00Z', '2026-10-12T09:00:00Z']) { keep.runs = hourly(new Date(at(iso) - 7 * 60000).toISOString(), 30); const x = await k(iso); slid &&= x.overdue && x.noneFinished === 30; }
  ok(slid && /none of its last 30 runs finished \(cancelled or stuck\)/.test(missedText('o/r', { workflow: 'keep', noneFinished: 30 })),
    'a full page of 30 runs with none finished is missed at once, however far the page has slid, and says so');
  keep.runs = [{ event: 'schedule', created_at: '2026-10-07T23:53:00Z', status: 'completed', conclusion: 'skipped' }];
  ok(!(await k('2026-10-08T01:00:00Z')).overdue, 'a finished run whose job was skipped by its own condition still ran its schedule');
  wfs.pop();
}
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
ok(hs.on.schedule.length === 1 && miss && /stale\.mjs schedules --repo "\$GITHUB_REPOSITORY" --alert/.test(miss.run) && miss.env.ALERTS_OPS_BOARD === '${{ vars.ALERTS_OPS_BOARD }}' && !('ALERTS_TOPIC' in miss.env) && miss.env.GH_TOKEN === '${{ github.token }}'
  && /^set -euo pipefail\n/.test(miss.run) && hs.jobs.discover.permissions.actions === 'read' && miss.if === "always() && inputs.repo == ''" && !('continue-on-error' in miss),
  'hands-settings: its one daily job also checks missed scheduled runs onto the Ops board (never a Telegram topic, K038), with actions: read, and a failure of that check fails the step (pipefail, so tee cannot hide it)');

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
