#!/usr/bin/env node
// test-papercut — papercuts (C28, K070), offline against a stand-in GitHub API.
//
//   node tools/test-papercut.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { problems, comment, fixedComment, parse, groups, counts, issueBody, digest, due, parseTarget, keyOf, clean, MAX, DIGEST_MARK, BODY_MARK } from '../.harness/tools/papercut.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-papercut: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-papercut: ok ${n}. ${what}`); };

// --- the text, offline -------------------------------------------------------------------------------
const r = { what: '`inbox.mjs send`', tried: 'send a request', expected: 'one issue', happened: 'two issues', fix: 'look again after filing', by: 'Some thread' };
ok(problems(r).length === 0, 'a full report has no problems');
ok(problems({ ...r, fix: ' ' }).some((p) => /--fix/.test(p)) && problems({ ...r, what: '' }).some((p) => /--what/.test(p)), 'each of the five fields is required');
ok(problems({ ...r, happened: `the token ghp_${'a'.repeat(36)} was refused` }).some((p) => /secret/.test(p)), 'a secret-shaped value is refused');
const c1 = comment(r, { version: '0.60.0' });
ok(c1.startsWith('<!-- papercut -->') && c1.includes('`inbox.mjs send`') && c1.includes('kit 0.60.0') && c1.includes('- **Fix:** look again after filing'), 'the comment carries the marker, the what, the version and the four fields');
ok(clean('x'.repeat(MAX + 50)).length === MAX && clean('a\n\n b') === 'a b', 'a field is one line, at most MAX characters');
ok(!comment({ ...r, fix: 'see https://claude.ai/code/session_1' }).includes('claude.ai'), 'a claude.ai link is scrubbed from a field (O09)');
ok(keyOf('`Inbox.mjs  Send`') === 'inbox.mjs send', 'the grouping key ignores ticks, case and spaces');

const at = (d) => `2026-11-${String(d).padStart(2, '0')}T10:00:00Z`;
const cs = [
  { body: comment(r), created_at: at(20), html_url: 'u1' },
  { body: comment({ ...r, what: 'INBOX.MJS SEND', fix: 'newer fix' }), created_at: at(22), html_url: 'u2' },
  { body: 'an ordinary comment', created_at: at(22) },
  { body: comment({ ...r, what: 'C25' }), created_at: at(23), html_url: 'u3' },
  { body: fixedComment('c25', 'kit 0.60.1 (#1)'), created_at: at(24) },
  { body: comment({ ...r, what: 'wake.mjs' }), created_at: at(25), html_url: 'u4' },
];
const items = parse(cs);
ok(items.length === 5 && items.filter((i) => i.kind === 'fixed').length === 1, 'only marked comments are read: four reports and one fix');
const g = groups(items);
ok(g[0].key === 'inbox.mjs send' && g[0].open === 2 && g[0].example === 'newer fix', 'reports group by what, case aside; the latest suggested fix shows');
ok(g.find((x) => x.key === 'c25').open === 0 && g.find((x) => x.key === 'c25').fixed === 'kit 0.60.1 (#1)', 'a fix zeroes its group and names what fixed it');
const later = parse([...cs, { body: comment({ ...r, what: 'C25' }), created_at: at(26) }]);
ok(groups(later).find((x) => x.key === 'c25').open === 1, 'a report after the fix counts again');
const now = Date.parse('2026-11-26T12:00:00Z');
ok(counts(items, now).open === 3 && counts(items, now).week === 4, 'the counts: open reports, and reports filed in the last 7 days');
const body = issueBody(items, now);
ok(body.includes('<!-- papercut-count: open=3 week=4 -->') && body.includes('**Open: 3**') && body.indexOf('inbox.mjs send') < body.indexOf('wake.mjs'), 'the body carries the count line and ranks the table, most open first');
const d = digest([{ where: 'o/a#1', items }, { where: 'o/b#2', items: parse([{ body: comment({ ...r, what: 'x.mjs' }), created_at: at(25) }]) }], now);
ok(d.includes('4 open across 2 issue(s)') && d.includes('| 1 | o/a#1 | `inbox.mjs send` | 2 |') && !d.includes('`c25`'), 'the digest ranks open groups across projects and leaves fixed ones out');
ok(due(cs, now).due && due(cs, now).open === 3, 'due: open reports and no digest yet');
ok(!due([...cs, { body: `${DIGEST_MARK}\nx`, created_at: '2026-11-22T12:00:00Z' }], now).due, 'not due: a digest four days old');
ok(due([...cs, { body: `${DIGEST_MARK}\nx`, created_at: '2026-11-19T12:30:00Z' }], now).due, 'due: the last digest is a week old (an hour of slack)');
ok(!due(cs.slice(3, 5), now).due, 'not due: nothing open, whatever the age');
ok(parseTarget('o/r#12').issue === 12 && parseTarget('o/r').issue === null && parseTarget('nope') === null, 'a target is owner/name with an optional issue');

// --- the command, against a stand-in GitHub ------------------------------------------------------------
const issues = new Map();   // "o/r#N" -> { number, body, labels, comments: [] }
const repos = { 'o/private': { private: true }, 'o/public': { private: false } };
let down = false;
let next = 1;
const server = createServer((req, res) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    const send = (s, j) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (down) return send(503, { message: 'down' });
    const u = new URL(req.url, 'http://x');
    const body = data ? JSON.parse(data) : null;
    let m;
    if ((m = u.pathname.match(/^\/repos\/([\w.-]+\/[\w.-]+)$/))) return repos[m[1]] ? send(200, repos[m[1]]) : send(404, { message: 'Not Found' });
    if ((m = u.pathname.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/issues$/))) {
      if (req.method === 'POST') { const i = { number: next++, body: body.body, title: body.title, labels: body.labels.map((name) => ({ name })), state: 'open', comments: [] }; issues.set(`${m[1]}#${i.number}`, i); return send(201, i); }
      const page = Number(u.searchParams.get('page') || 1);
      const list = [...issues.entries()].filter(([k, i]) => k.startsWith(`${m[1]}#`) && i.labels.some((l) => l.name === u.searchParams.get('labels'))).map(([, i]) => i);
      return send(200, page === 1 ? list : []);
    }
    if ((m = u.pathname.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)\/comments$/))) {
      const i = issues.get(`${m[1]}#${m[2]}`);
      if (!i) return send(404, { message: 'Not Found' });
      if (req.method === 'POST') { const c = { body: body.body, created_at: new Date().toISOString(), html_url: `https://example.test/${m[1]}/issues/${m[2]}#c${i.comments.length + 1}` }; i.comments.push(c); return send(201, c); }
      return send(200, Number(u.searchParams.get('page') || 1) === 1 ? i.comments : []);
    }
    if ((m = u.pathname.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/)) && req.method === 'GET') {
      const i = issues.get(`${m[1]}#${m[2]}`);
      return i ? send(200, i) : send(404, { message: 'Not Found' });
    }
    if ((m = u.pathname.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/)) && req.method === 'PATCH') {
      const i = issues.get(`${m[1]}#${m[2]}`);
      if (!i) return send(404, { message: 'Not Found' });
      Object.assign(i, body); return send(200, i);
    }
    send(404, { message: `no route ${req.method} ${u.pathname}` });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const api = `http://127.0.0.1:${server.address().port}`;
const tool = new URL('../.harness/tools/papercut.mjs', import.meta.url).pathname;
const cwd = mkdtempSync(join(tmpdir(), 'papercut-'));
mkdirSync(join(cwd, '.harness'));
writeFileSync(join(cwd, '.harness/VERSION'), '9.9.9\n');
const run = (args, { dir = cwd } = {}) => new Promise((done) => execFile('node', [tool, ...args], { cwd: dir, env: { ...process.env, GITHUB_API_URL: api, GH_TOKEN: 't' } }, (e, out) => done({ code: e ? e.code : 0, out })));
const fields = ['--what', 'inbox.mjs send', '--tried', 'a', '--expected', 'b', '--happened', 'c', '--fix', 'd'];

let x = await run(['file', ...fields, '--to', 'o/private']);
const first = issues.get('o/private#1');
ok(x.code === 0 && /filed https:/.test(x.out) && first && first.title === 'Papercuts' && first.comments.length === 1, 'the first report opens the papercut issue once and files on it');
ok(first.body.includes('<!-- papercut-count: open=1 week=1 -->') && first.comments[0].body.includes('kit 9.9.9'), 'the table is rebuilt after filing; the report names the kit version');
x = await run(['file', ...fields, '--to', 'o/private']);
ok(x.code === 0 && issues.size === 1 && first.comments.length === 2 && first.body.includes('open=2'), 'a second report finds the same issue: no second issue');
writeFileSync(join(cwd, '.harness/profile.json'), JSON.stringify({ papercuts: 'o/private#1' }));
x = await run(['file', ...fields]);
ok(x.code === 0 && first.comments.length === 3, "with no --to, the profile's papercuts names the issue");
x = await run(['file', ...fields, '--to', 'o/public']);
ok(x.code === 1 && /NOT FILED: o\/public is public/.test(x.out) && /Found: line instead/.test(x.out) && ![...issues.keys()].some((k) => k.startsWith('o/public')), 'a public repository is refused, nothing posted, and the report is printed for the closing note');
x = await run(['file', ...fields.slice(0, 8), '--to', 'o/private']);
ok(x.code === 2 && /--fix is required/.test(x.out) && first.comments.length === 3, 'a report missing a field is refused before anything is posted');
x = await run(['file', ...fields.slice(0, 9), `ghp_${'b'.repeat(36)}`, '--to', 'o/private']);
ok(x.code === 1 && /secret/.test(x.out) && first.comments.length === 3, 'a secret-shaped value is refused before anything is posted');
down = true;
x = await run(['file', ...fields, '--to', 'o/private']);
down = false;
ok(x.code === 3 && /NOT FILED/.test(x.out) && /papercut inbox\.mjs send: tried a/.test(x.out), 'GitHub down: exit 3 and the report printed, so the session carries on with it in its note');
x = await run(['fixed', '--what', 'INBOX.mjs send', '--note', 'kit 0.60.1 (#9)', '--to', 'o/private#1']);
ok(x.code === 0 && first.body.includes('open=0') && first.body.includes('kit 0.60.1 (#9)'), 'fixed zeroes the group in the rebuilt table');
issues.set('o/private#7', { number: 7, body: `${BODY_MARK}\nx`, labels: [], comments: [{ body: comment({ ...r, what: 'b.mjs' }), created_at: new Date().toISOString() }] });
x = await run(['digest', '--from', 'o/private#1', '--from', 'o/private#7']);
ok(x.code === 0 && /1 open across 2 issue\(s\)/.test(x.out) && /`b\.mjs`/.test(x.out), 'digest reads every issue and ranks what is still open');
x = await run(['digest', '--from', 'o/private#1', '--from', 'o/missing#3']);
ok(x.code === 3 && /could not read o\/missing#3/.test(x.out), 'an issue the digest cannot read is named and the exit is not 0');

x = await run(['due', '--to', 'o/private#7']);
ok(x.code === 0 && /PAPERCUTS: DUE 1 open/.test(x.out), 'due says DUE on an issue with open reports and no digest');
x = await run(['digest', '--from', 'o/private#7', '--post', 'o/private#7']);
ok(x.code === 0 && /digest posted/.test(x.out) && issues.get('o/private#7').comments.at(-1).body.startsWith(DIGEST_MARK), 'digest --post leaves the grouping on the issue');
x = await run(['due', '--to', 'o/private#7']);
ok(x.code === 0 && /PAPERCUTS: NOT DUE/.test(x.out), 'once posted, the week is not due again');
const before = issues.get('o/private#7').comments.length;
x = await run(['digest', '--from', 'o/private#7', '--post', 'o/public#1']);
ok(x.code === 1 && issues.get('o/private#7').comments.length === before, 'a digest is never posted to a public repository');

// a named issue the tool does not own is never rewritten (a wrong number must not replace a state note)
issues.set('o/private#54', { number: 54, body: 'STATE: the coordinator note', labels: [], comments: [] });
for (const args of [['table'], ['file', ...fields], ['fixed', '--what', 'a.mjs', '--note', 'kit 1'], ['digest', '--from', 'o/private#7', '--post']]) {
  x = await run([...args, args[0] === 'digest' ? 'o/private#54' : '--to', ...(args[0] === 'digest' ? [] : ['o/private#54'])]);
  const i = issues.get('o/private#54');
  ok(x.code !== 0 && i.body === 'STATE: the coordinator note' && i.comments.length === 0, `${args[0]} refuses a named issue that is not a papercut issue and writes nothing`);
}
x = await run(['fixed', '--what', 'a.mjs', '--note', `ghp_${'c'.repeat(36)}`, '--to', 'o/private#1']);
ok(x.code === 1 && !first.comments.some((c) => c.body.includes('ghp_')), 'fixed refuses a secret-shaped note');

server.close();
console.log(`test-papercut: OK · ${n} cases`);
