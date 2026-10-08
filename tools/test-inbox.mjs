#!/usr/bin/env node
// test-inbox — cross-project requests (O14, K009), offline against a stand-in GitHub API and routine.
//
//   node tools/test-inbox.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { body, parse, setField } from '../.harness/tools/inbox.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-inbox: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-inbox: ok ${n}. ${what}`); };

const req = { id: 'kit/proof-1', source: 'https://example.test/msg/1', outcome: 'Add one line to README', coordinator: 'sandbox coordinator', coveredBy: 'owner decision K009' };
const b = body(req);
ok(parse(b).id === 'kit/proof-1' && parse(b).State === 'queued' && parse(b)['Covered by'] === 'owner decision K009', 'a new request body parses back to its fields, queued');
ok(parse(setField(b, 'State', 'done')).State === 'done' && parse('no marker') === null, 'one field changes alone; a body without the marker is not a request');
let threw = 0;
try { body({ ...req, coveredBy: ' ' }); } catch { threw++; }
try { body({ ...req, id: 'bad id!' }); } catch { threw++; }
ok(threw === 2, 'a request needs a cover and a clean stable id');

// stand-in GitHub (issues) and routine (/fire)
const issues = [];
let lag = false;
const fires = [];
const wakes = [];          // comments on the wake-channel pull request (#99)
let channel = false, refuse = false, forbidPulls = false, channelBranch = 'inbox-wake';
const opened = [];
let refsRefused = false;
const srv = createServer((q, res) => {
  let data = '';
  q.on('data', (c) => { data += c; });
  q.on('end', () => {
    const u = new URL(q.url, 'http://x');
    const send = (code, j) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (u.pathname.endsWith('/fire')) { fires.push({ auth: q.headers.authorization, body: JSON.parse(data) }); return send(200, { type: 'routine_fire' }); }
    if (u.pathname === '/repos/o/r' && q.method === 'GET') return send(200, { default_branch: 'main' });
    if (u.pathname === '/repos/o/r/git/ref/heads/main') return send(200, { object: { sha: 'abc' } });
    if (u.pathname === '/repos/o/r/git/refs' && q.method === 'POST' && refsRefused) return send(403, { message: 'refused by proxy' });
    if (u.pathname === '/repos/o/r/git/refs' && q.method === 'POST') { opened.push(['ref', JSON.parse(data)]); return send(201, {}); }
    if (u.pathname.startsWith('/repos/o/r/contents/') && q.method === 'GET') return send(404, {});
    if (u.pathname.startsWith('/repos/o/r/contents/') && q.method === 'PUT') { opened.push(['file', u.pathname, JSON.parse(data)]); return send(201, {}); }
    if (u.pathname === '/repos/o/r/pulls' && q.method === 'POST') { opened.push(['pr', JSON.parse(data)]); channel = true; return send(201, { number: 99, draft: true, html_url: 'https://gh.test/o/r/pull/99' }); }
    if (u.pathname === '/repos/o/r/pulls' && q.method === 'GET') {
      if (forbidPulls) return send(403, { message: 'Resource not accessible by integration' });
      return send(200, channel && u.searchParams.get('head') === `o:${channelBranch}` ? [{ number: 99, draft: true, html_url: 'https://gh.test/o/r/pull/99' }] : []);
    }
    if (u.pathname === '/repos/o/r/issues/99/comments' && q.method === 'POST') { if (refuse) return send(403, { message: 'refused' }); wakes.push(JSON.parse(data).body); return send(201, { id: 500 + wakes.length }); }
    if (u.pathname === '/repos/o/r/issues' && q.method === 'GET') {
      // like GitHub, the label listing lags a new issue: with lag on, it misses it on the next four listings
      const seen = issues.filter((i) => i.labels.some((l) => l.name === u.searchParams.get('labels')) && !(i.hidden-- > 0));
      return send(200, u.searchParams.get('page') === '1' ? seen : []);
    }
    if (u.pathname === '/repos/o/r/issues' && q.method === 'POST') { const j = JSON.parse(data); const i = { hidden: lag ? 4 : 0, number: issues.length + 1, state: 'open', html_url: `https://gh.test/o/r/issues/${issues.length + 1}`, body: j.body, labels: j.labels.map((name) => ({ name })), comments: [] }; issues.push(i); return send(201, i); }
    const m = u.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)(\/comments)?$/);
    const i = m && issues[Number(m[1]) - 1];
    if (!i) return send(404, {});
    if (m[2] && q.method === 'GET') return send(200, u.searchParams.get('page') === '1' ? i.comments.map((body) => ({ body })) : []);
    if (m[2]) { i.comments.push(JSON.parse(data).body); return send(201, { id: 1 }); }
    if (q.method === 'PATCH') { Object.assign(i, JSON.parse(data)); return send(200, i); }
    return send(200, i);
  });
});
await new Promise((d) => srv.listen(0, '127.0.0.1', d));
const base = `http://127.0.0.1:${srv.address().port}`;
const tool = join(new URL('..', import.meta.url).pathname, '.harness/tools/inbox.mjs');
const run = (args, env = {}) => new Promise((d) => execFile(process.execPath, [tool, ...args], { env: { ...process.env, GITHUB_API_URL: base, GH_TOKEN: 't', INBOX_FIRE_BASE: base, INBOX_RECHECK_MS: '0', INBOX_ROUTINE_URL: '', INBOX_ROUTINE_TOKEN: '', ...env } }, (e, stdout, stderr) => d({ code: e ? e.code : 0, out: stdout + stderr })));
const send = ['send', '--repo', 'o/r', '--id', req.id, '--title', 'Proof', '--outcome', req.outcome, '--source', req.source, '--coordinator', req.coordinator, '--covered-by', req.coveredBy];
const wired = { INBOX_ROUTINE_URL: `${base}/v1/claude_code/routines/trig_01ABC/fire`, INBOX_ROUTINE_TOKEN: 'sk-test' };

const s1 = await run(send);
ok(s1.code === 3 && /filed kit\/proof-1/.test(s1.out) && issues.length === 1 && issues[0].labels[0].name === 'inbox', 'send files one issue labelled inbox');
ok(/NOT delivered: no open inbox-wake pull request/.test(s1.out) && issues[0].comments.length === 1 && issues[0].comments[0].startsWith('<!-- inbox-wake-undelivered -->') && !issues[0].comments.some((c) => c.includes('Woke')), 'with no wake channel the send says NOT delivered, exits non-zero and leaves one note, never "Woke"');
const s2 = await run(send);
ok(s2.code === 3 && /already/.test(s2.out) && issues.length === 1 && issues[0].comments.length === 1, 'sending the same id again files nothing and adds no second note (a redelivery makes no duplicate)');
refuse = true; channel = true;
const s3 = await run(send);
ok(s3.code === 3 && /NOT delivered: the wake comment was refused/.test(s3.out) && wakes.length === 0 && issues[0].comments.length === 1, 'a refused wake comment is not a delivery either');
refuse = false;
const s4 = await run(send);
ok(s4.code === 0 && /woke the receiving coordinator \(delivered on #99\)/.test(s4.out) && wakes.length === 1 && /request kit\/proof-1 is queued: https:\/\/gh\.test\/o\/r\/issues\/1/.test(wakes[0]) && issues[0].comments.at(-1) === '<!-- inbox-woke -->\nWoke the receiving coordinator (delivered on #99).', 'once the channel is open, a resend of the queued request wakes the coordinator on the channel PR, then writes "Woke"');
const s5 = await run(send);
ok(s5.code === 0 && /already woken/.test(s5.out) && wakes.length === 1, 'a request already woken is never woken twice by a resend');
ok((await run(['wake', '--repo', 'o/r', '--issue', '1'], {})).code === 0 && wakes.length === 1 && fires.length === 0, 'the workflow\'s wake after a delivered send wakes nobody again');
{
  const saved = issues[0].comments; issues[0].comments = [];
  const w = await run(['wake', '--repo', 'o/r', '--issue', '1'], {});
  ok(w.code === 0 && /sender's send wakes/.test(w.out) && wakes.length === 1 && issues[0].comments.length === 0, 'with a channel open, the read-only workflow job never posts: the sender wakes (no false red race)');
  issues[0].comments = saved;
}
ok(/wake channel is https:\/\/gh\.test\/o\/r\/pull\/99;/.test((await run(['channel', '--repo', 'o/r'])).out), 'channel names the open wake-channel PR');
channel = false;
ok((await run(['channel', '--repo', 'o/r'])).code === 3 && !opened.length, 'channel fails when no wake-channel PR is open, and opens nothing by itself');
refsRefused = true;
const refused = await run(['channel', '--repo', 'o/r', '--open']);
ok(refused.code === 1 && /push it with git instead \(git push origin main:refs\/heads\/inbox-wake\)/.test(refused.out) && !opened.length, 'when the API may not make the branch, channel --open says the exact git push and opens nothing');
refsRefused = false;
const op = await run(['channel', '--repo', 'o/r', '--open']);
const pr = opened.find((x) => x[0] === 'pr')?.[1];
ok(op.code === 0 && opened[0][1].ref === 'refs/heads/inbox-wake' && opened[0][1].sha === 'abc' && opened[1][1] === '/repos/o/r/contents/.github/INBOX_WAKE.md' && opened[1][2].branch === 'inbox-wake' && pr.draft === true && pr.head === 'inbox-wake' && pr.base === 'main' && /Never merge/.test(pr.body), 'channel --open makes the inbox-wake branch with one note and a draft PR into the default branch');
channel = false;
issues[0].comments = []; // the routine cases below start from a request never woken
ok(JSON.parse((await run(['pending', '--repo', 'o/r'])).out)[0].id === 'kit/proof-1', 'pending lists the queued request');
{
  // two quick sends while GitHub's listing lags: the second files, sees the first, closes itself
  lag = true;
  const raced = ['send', '--repo', 'o/r', '--id', 'kit/race', '--title', 'Race', '--outcome', 'x', '--source', 's', '--coordinator', 'c', '--covered-by', 'K009'];
  const a = await run(raced), b2 = await run(raced);
  lag = false;
  const copies = issues.filter((i) => parse(i.body).id === 'kit/race');
  ok(/filed/.test(a.out) && /closed as its duplicate/.test(b2.out) && copies.length === 2 && copies[1].state === 'closed' && copies[1].state_reason === 'duplicate', 'a send racing GitHub\'s listing lag closes its own copy as a duplicate');
  const pend = JSON.parse((await run(['pending', '--repo', 'o/r'])).out).filter((x) => x.id === 'kit/race');
  ok(pend.length === 1 && pend[0].number === copies[0].number, 'only the first issue for an id is ever pending');
  issues.splice(issues.indexOf(copies[0]), 1, { ...copies[0], labels: [] }); // keep the rest of the test about kit/proof-1
}

forbidPulls = true;
const priv = await run(['wake', '--repo', 'o/r', '--issue', '1'], wired);
ok(priv.code === 0 && fires.length === 1, 'a token that may not list pull requests (private repo, read-only job) still fires the routine');
forbidPulls = false; fires.length = 0;
channelBranch = 'wake-channel'; channel = true;
{
  const saved = issues[0].comments; issues[0].comments = [];
  const s6 = await run(send);
  ok(/delivered on #99/.test(s6.out) && wakes.length === 2, 'a repository\'s existing wake-channel pull request serves as its inbox channel too (one channel per repository)');
  issues[0].comments = []; channel = false; channelBranch = 'inbox-wake';
}
const unwired = await run(['wake', '--repo', 'o/r', '--issue', '1']);
ok(unwired.code === 3 && /NOT delivered/.test(unwired.out) && fires.length === 0, 'a queued request with no channel and no routine fails loudly');
issues[0].comments = [];
const w1 = await run(['wake', '--repo', 'o/r', '--issue', '1'], wired);
ok(w1.code === 0 && fires.length === 1 && fires[0].auth === 'Bearer sk-test' && /kit\/proof-1 is queued/.test(fires[0].body.text), 'wake fires the routine once, with the issue in the fire text');
const bad = await run(['wake', '--repo', 'o/r', '--issue', '1'], { ...wired, INBOX_ROUTINE_URL: 'https://evil.test/fire' });
ok(bad.code === 1 && fires.length === 1, 'wake refuses a URL that is not a routine fire endpoint (the token goes nowhere else)');

ok((await run(['state', '--repo', 'o/r', '--issue', '1', '--to', 'done'])).code === 1, 'done without evidence is refused');
ok((await run(['state', '--repo', 'o/r', '--issue', '1', '--to', 'working'])).code === 0 && parse(issues[0].body).State === 'working', 'the coordinator marks it working');
const w2 = await run(['wake', '--repo', 'o/r', '--issue', '1'], wired);
ok(w2.code === 0 && /nobody woken/.test(w2.out) && fires.length === 1, 'a request already picked up never wakes the AI again');
const d = await run(['state', '--repo', 'o/r', '--issue', '1', '--to', 'done', '--note', 'PR #9 merged, ci green']);
ok(d.code === 0 && issues[0].state === 'closed' && parse(issues[0].body).Evidence === 'PR #9 merged, ci green' && issues[0].comments.at(-1).includes('PR #9'), 'done records the evidence on the issue and closes it');
ok(JSON.parse((await run(['pending', '--repo', 'o/r'])).out).length === 0 && /already .*closed, done/.test((await run(send)).out), 'after done nothing is pending, and a resend points at the finished issue');
srv.close();

// the installed workflow: one short job, only for the inbox label, never with write access
const wf = parseYaml(readFileSync(join(new URL('..', import.meta.url).pathname, '.harness/templates/workflows/harness-inbox.yml'), 'utf8'));
ok(Object.keys(wf.on.issues ? wf.on : {}).join() === 'issues' && String(wf.on.issues.types).replace(/[\[\] ]/g, '') === 'labeled,reopened', 'harness-inbox runs only on an issue labelled or reopened');
ok(/label\.name == 'inbox'/.test(wf.jobs.wake.if) && wf.jobs.wake['timeout-minutes'] <= 3 && !Object.values(wf.jobs.wake.permissions).includes('write'), 'its one job runs only for the inbox label, is short, and cannot write');

console.log(`test-inbox: OK · ${n} checks`);
