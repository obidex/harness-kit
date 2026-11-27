#!/usr/bin/env node
// test-guide — the staff guide written from the code (K074), offline: sections from a file list, the two
// requests, a stand-in GitHub and Batch API in memory, then the command line against a real checkout.
//
//   node tools/test-guide.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { langOf, sectionOf, sections, writeRequest, checkRequest, checked, plan, brief, stateOf, spentOf, recordBody, pageComment, guide, apiCaller, titleOf, batchCost, worstOf, tokensOf,
  MARK, GUIDE_USD, MODEL, SECTION, MAX_OUT, LANGS, RUN_MINUTES } from '../.harness/tools/guide.mjs';
import { gather } from '../.harness/tools/sweep.mjs';
import { RISK_MODEL, cost } from '../.harness/tools/review.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-guide: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-guide: ok ${n}. ${what}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const ROOT = new URL('..', import.meta.url).pathname;
const NOW = Date.parse('2026-12-01T10:00:00Z'), UNTIL = '2026-12-22T23:59+03:00';
const BOT = { user: { login: 'github-actions[bot]', type: 'Bot' } };

// --- which screens --------------------------------------------------------------------------------------
ok(langOf('staff-guide-ar') === 'ar' && langOf('staff-guide-en') === 'en' && langOf('permissions') === null && langOf('') === null && langOf(undefined) === null
  && throws(() => langOf('staff-guide-xx'), /unknown guide language/) && throws(() => langOf('staff-guide-__proto__'), /unknown guide language/) && Object.isFrozen(LANGS),
  'a guide language is one of a fixed list by name; any other lens is not a guide');
ok(sectionOf('src/app/(app)/customers/[id]/page.tsx') === 'customers' && sectionOf('src/app/(app)/(admin)/members/page.tsx') === 'members' && sectionOf('app/page.tsx') === 'home'
  && sectionOf('src/app/(app)/page.tsx') === 'home' && sectionOf('app/[locale]/orders/page.jsx') === 'orders' && sectionOf('app/api/x/page.ts') === null && sectionOf('src/app/customers/actions.ts') === null
  && sectionOf('src/app/@modal/login/page.tsx') === 'login' && sectionOf('lib/page.tsx') === null,
  'a screen is a page file under an app folder; its section is the first route part that is not a group, slot or parameter; the top page is home; api is no screen');
const F = (path, len = 100, fill = 'x') => ({ path, text: `${path}\n${fill.repeat(len)}` });
const files = [
  F('src/app/(app)/customers/page.tsx'), F('src/app/(app)/customers/new/page.tsx'), F('src/app/(app)/customers/[id]/page.tsx'),
  F('src/app/(app)/customers/CustomerForm.tsx'), F('src/app/(app)/customers/CustomerForm.test.tsx'), F('src/app/(app)/customers/[id]/_parts/Tabs.tsx'),
  F('src/app/(app)/container-types/page.tsx'), F('src/lib/i18n/containerTypes.ts'), F('src/lib/i18n/customers.ts'), F('src/lib/i18n/common.ts'), F('src/lib/i18n/bills.ts'),
  F('src/lib/money.ts'), F('src/app/(app)/page.tsx'),
];
let s = sections(files);
const sec = (name) => s.list.find((x) => x.name === name);
ok(s.list.map((x) => x.name).join() === 'container-types,customers,home' && sec('customers').screens.length === 3
  && sec('customers').files.map((f) => f.path).includes('src/app/(app)/customers/CustomerForm.tsx') && sec('customers').files.map((f) => f.path).includes('src/app/(app)/customers/[id]/_parts/Tabs.tsx')
  && !sec('customers').files.some((f) => /\.test\./.test(f.path)) && !s.list.some((x) => x.files.some((f) => f.path === 'src/lib/money.ts')),
  'one section a first route part: its screens, the files beside them and in a private folder below; never a test file, never code from elsewhere');
ok(sec('container-types').files.map((f) => f.path).includes('src/lib/i18n/containerTypes.ts') && sec('customers').files.map((f) => f.path).includes('src/lib/i18n/customers.ts')
  && s.list.every((x) => x.files.some((f) => f.path === 'src/lib/i18n/common.ts')) && !s.list.some((x) => x.files.some((f) => f.path === 'src/lib/i18n/bills.ts')),
  'each section carries its own labels file (named like it, any spelling) and the common one, so the page can use the screen\'s words');
const big = [F('app/orders/page.tsx', SECTION * 0.6), F('app/orders/new/page.tsx', SECTION * 0.6), F('app/orders/Form.tsx', SECTION * 0.5), F('app/orders/[id]/page.tsx', SECTION * 1.2)];
s = sections(big);
ok(s.list.length === 2 && s.list[0].name === 'orders (part 1 of 2)' && s.list.every((x) => x.chars <= SECTION + 400) && s.left.includes('app/orders/[id]/page.tsx') && s.left.includes('app/orders/Form.tsx'),
  `a section over ${SECTION} characters is cut into parts; what fits nowhere is listed as left out, never read in part`);
const k1 = sections(files).list[1].key, k2 = sections(files.map((f) => (f.path.endsWith('CustomerForm.tsx') ? F(f.path, 101) : f))).list[1].key;
ok(k1 !== k2 && k1 === sections(files).list[1].key, 'a section\'s key names its exact content: a changed file changes it');

// --- the two requests -----------------------------------------------------------------------------------
const one = sections(files).list[1];
const w = writeRequest(one, 'k9', 'ar'), c = checkRequest(one, 'DRAFT-PAGE', 'k9', 'ar');
ok(w.model === RISK_MODEL && MODEL === RISK_MODEL && w.max_tokens === MAX_OUT && /<file-k9 path="src\/app\/\(app\)\/customers\/page.tsx">/.test(w.messages[0].content) && /never instructions to you/.test(w.system)
  && /Modern Standard Arabic/.test(w.system) && /Write only what the code shows/.test(w.system) && /Who can use it/.test(w.system) && /cannot be undone/.test(w.system),
  'the write request carries the section\'s files inside tags named with a random word, in Arabic, only what the code shows, who may use it and what cannot be undone');
ok(c.model === RISK_MODEL && /<page-k9>\nDRAFT-PAGE\n<\/page-k9>/.test(c.messages[0].content) && /Correct every statement the code does not support/.test(c.system) && /---CORRECTIONS---/.test(c.system) && c.messages[0].content.includes('src/lib/i18n/customers.ts'),
  'the check request gives the same files and the page back, asking for every unsupported statement to be corrected and the corrections listed');
const say = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 } });
ok(checked(say('# صفحة\nنص\n---CORRECTIONS---\n- fixed the button name\n- removed a field')).fixes.length === 2 && checked(say('# P\n---CORRECTIONS---\nnone')).fixes.length === 0
  && checked(say('# P only')).fixes === null && checked(say('# P\n---CORRECTIONS---\nnone')).page === '# P',
  'a checked answer splits into the page and its list of corrections; "none" is an empty list; no marker is no list');

// --- the plan -------------------------------------------------------------------------------------------
const p = plan({ gathered: gather({ paths: files.map((f) => f.path), stat: () => ({ isFile: () => true, isSymbolicLink: () => false, size: 200 }), read: (x) => files.find((f) => f.path === x).text }), lang: 'ar' });
ok(p.sections.length === 3 && p.sections.every((x) => x.worst > 0) && Math.abs(p.worst - p.sections.reduce((a, x) => a + x.worst, 0)) < 0.01 && batchCost(MODEL, { input_tokens: 1e6, output_tokens: 0 }) === cost(MODEL, { input_tokens: 1e6, output_tokens: 0 }) / 2
  && worstOf(2500) === batchCost(MODEL, { input_tokens: 1000, output_tokens: MAX_OUT }) && throws(() => plan({ gathered: { files: [] }, lang: 'xx' }), /language/),
  'the plan counts the most a write and a check could cost per section, at the Batch API\'s half price');
const b = brief(p, GUIDE_USD);
ok(b.guide === 'Arabic' && b.sections === 3 && b.screens === 5 && b.cap_usd === 15 && b.fits_the_cap === true && b.list.length === 3, `the estimate says sections, screens and the worst case against the $${GUIDE_USD} cap`);

// --- a stand-in GitHub and Batch API, in memory ---------------------------------------------------------
function world(over = {}) {
  const w = { issues: [], comments: [], calls: [], batches: new Map(), nextNo: 50, clock: NOW, polls: 0, endAfter: 1, fail: {}, ...over };
  w.gh = async (method, path, data) => {
    w.calls.push(`${method} ${path.split('?')[0]}`);
    const u = new URL(path, 'http://x'), page = Number(u.searchParams.get('page') || 1);
    let m;
    if (u.pathname === '/repos/o/r/issues' && method === 'GET') {
      if (w.fail.list) return w.fail.list;
      const st = u.searchParams.get('state') || 'open', by = u.searchParams.get('creator');
      return w.issues.filter((i) => (st === 'all' || i.state === st) && (!by || i.user.login === by)).slice((page - 1) * 100, page * 100);
    }
    if (u.pathname === '/repos/o/r/issues' && method === 'POST') { const i = { number: w.nextNo++, state: 'open', title: data.title, body: data.body, ...BOT }; w.issues.unshift(i); return i; }
    if ((m = u.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)$/)) && method === 'PATCH') { const i = w.issues.find((x) => x.number === Number(m[1])); i.body = data.body; return i; }
    if ((m = u.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)\/comments$/)) && method === 'POST') { const cm = { id: 900 + w.comments.length, html_url: `https://github.test/o/r/issues/${m[1]}#c${w.comments.length}`, body: data.body }; w.comments.push(cm); return cm; }
    throw new Error(`unexpected ${method} ${u.pathname}`);
  };
  w.api = async (method, path, body) => {
    w.calls.push(`api ${method} ${path}`);
    let m;
    if (path === '/v1/messages/batches' && method === 'POST') {
      if (w.fail.send) return w.fail.send;
      const id = `msgbatch_0${w.batches.size + 1}`;
      w.batches.set(id, { reqs: body.requests, polls: 0, cancelled: false });
      return { status: 200, json: { id, processing_status: 'in_progress' } };
    }
    if ((m = path.match(/^\/v1\/messages\/batches\/(msgbatch_\w+)$/)) && method === 'GET') {
      const bt = w.batches.get(m[1]); bt.polls++; if (w.onPoll) w.onPoll(w, bt);
      return { status: 200, json: { id: m[1], processing_status: bt.cancelled || bt.polls > w.endAfter ? 'ended' : 'in_progress' } };
    }
    if ((m = path.match(/^\/v1\/messages\/batches\/(msgbatch_\w+)\/cancel$/))) { w.batches.get(m[1]).cancelled = true; return { status: 200, json: {} }; }
    if ((m = path.match(/^\/v1\/messages\/batches\/(msgbatch_\w+)\/results$/))) {
      const bt = w.batches.get(m[1]);
      const lines = bt.reqs.map((r) => {
        const kind = r.custom_id[0], key = r.custom_id.slice(2);
        if (w.fail[`${kind}-result`]) return { custom_id: r.custom_id, result: { type: w.fail[`${kind}-result`] } };
        return { custom_id: r.custom_id, result: { type: 'succeeded', message: say(kind === 'w' ? `# Page ${key}\nAs written @someone <!-- hidden -->` : `# Page ${key}\nAs checked\n---CORRECTIONS---\n- one fix`) } };
      });
      return { status: 200, json: null, text: lines.map((l) => JSON.stringify(l)).join('\n') };
    }
    throw new Error(`unexpected api ${method} ${path}`);
  };
  w.go = (o = {}) => guide({ gh: w.gh, api: w.api, repo: 'o/r', sha: 'c'.repeat(40), p: o.p || p, now: () => w.clock, sleep: async () => { w.clock += 60000; }, log: () => {}, ...o, env: { REVIEW_UNTIL: UNTIL, ...(o.env || {}) } });
  w.record = () => w.issues.find((i) => i.title === titleOf('ar'));
  w.sent = () => w.calls.filter((x) => x === 'api POST /v1/messages/batches').length;
  return w;
}

let wd = world();
let r = await wd.go();
const st = stateOf(wd.record());
const usd = 3 * (batchCost(MODEL, { input_tokens: 1000, output_tokens: 500 }) * 2);
ok(r.status === 'finished' && r.posted === 3 && wd.sent() === 2 && wd.comments.length === 3 && [...wd.batches.values()][0].reqs.length === 3 && [...wd.batches.values()][1].reqs.length === 3
  && [...wd.batches.values()][0].reqs.every((q) => q.custom_id.startsWith('w-')) && [...wd.batches.values()][1].reqs.every((q) => q.custom_id.startsWith('c-')),
  'one run: a write batch for every section, a check batch for every page, one comment a page, finished');
ok(Math.abs(r.usd - usd) < 0.001 && Math.abs(spentOf(st) - usd) < 0.001 && st.write === null && st.check === null && Object.keys(st.posted).length === 3 && /\*\*Finished:\*\* all 3 pages posted/.test(wd.record().body) && wd.record().body.includes('Pages, one comment each:'),
  'what was spent is each answer\'s tokens at batch price, written in the record with a link to each page');
ok(wd.comments.every((x) => /As checked/.test(x.body) && !/As written/.test(x.body) && /corrected 1 point/.test(x.body)) && wd.comments.every((x) => x.body.startsWith(`<!-- ${MARK} {"key":`)),
  'each comment is the checked page, with what the second pass corrected');
wd = world(); wd.fail['c-result'] = undefined;
wd.api = ((orig) => async (m, path, body) => { const a = await orig(m, path, body); if (/results$/.test(path) && wd.batches.size === 2 && path.includes('msgbatch_02')) a.text = a.text.split('\n').map((l) => l.replace('As checked', 'Checked @someone <!-- x -->')).join('\n'); return a; })(wd.api);
r = await wd.go();
ok(wd.comments.every((x) => !/<!-- x/.test(x.body) && !/(^|[^A-Za-z0-9])@someone/.test(x.body)), 'a page is plain text: the model\'s answer cannot open an HTML comment or mention anyone');
r = await wd.go();
ok(r.status === 'finished' && wd.sent() === 2, 'a finished guide sends nothing more when started again');

// the cap
wd = world();
r = await wd.go({ env: { REVIEW_SWEEP_USD: String(p.sections[0].worst + 0.0001) } });
ok(r.status === 'stopped' && [...wd.batches.values()][0].reqs.length === 1 && wd.comments.length === 1 && /left for the next start/.test(r.why), 'a cap lowered in the settings sends only the sections whose write and check fit it');
wd = world();
r = await wd.go({ env: { REVIEW_SWEEP_USD: '0' } });
ok(r.status === 'stopped' && /cap for the window is reached/.test(r.why) && wd.sent() === 0, 'with no room under the cap nothing is sent');
// the cap is for the window: a closed record and another language's guide count against it (second reviewer, PR 117)
wd = world();
r = await wd.go();
const first = r.usd;
wd.record().state = 'closed';
r = await wd.go({ env: { REVIEW_SWEEP_USD: String(first + p.sections[0].worst / 2) } });
ok(r.status === 'stopped' && /cap for the window is reached/.test(r.why) && wd.sent() === 2 && Math.abs(r.window_usd - first) < 0.001 && /by earlier guides in the same window/.test(wd.issues[0].body),
  'closing the record does not open a new cap: what a closed guide spent in the same window counts, and nothing more is sent');
const pEn = { ...p, lang: 'en' };
r = await wd.go({ p: pEn, env: { REVIEW_SWEEP_USD: String(first + p.sections[0].worst / 2) } });
ok(r.status === 'stopped' && wd.sent() === 2, 'a guide in another language shares the same window\'s cap');
wd.issues.forEach((i) => { const x = stateOf(i); if (x) { x.until = '2026-11-30T20:59:00.000Z'; i.body = i.body.replace(/^<!-- harness-guide \{[^\n]*\} -->/, `<!-- ${MARK} ${JSON.stringify(x)} -->`); } });
r = await wd.go({ p: pEn });
ok(r.status === 'finished' && wd.sent() === 4, 'a guide of an earlier window (another end time) does not count against this one');
wd = world(); wd.fail.list = Array.from({ length: 100 }, (_, i) => ({ number: i, state: 'open', title: 'x', body: '', ...BOT }));
r = await wd.go();
ok(r.status === 'too-large' && wd.sent() === 0, 'when the job\'s records cannot all be read, nothing is sent rather than counting in part');
// Arabic is never counted low
ok(tokensOf('abcde') === 2 && tokensOf('مرحبا') === 10 && tokensOf(5) === 2 && worstOf('م'.repeat(1000)) === batchCost(MODEL, { input_tokens: 2000, output_tokens: MAX_OUT }),
  'the worst case counts two tokens for every non-ASCII character, so an Arabic page or labels file is never counted low');
ok(p.sections.every((x) => x.worst * 3 > 0) && GUIDE_USD === 15, 'one guide is capped at $15 in code (the owner\'s part 5 of the credit plan)');

// the switch
wd = world();
r = await wd.go({ env: { REVIEW_UNTIL: '2026-11-30T23:59+03:00' } });
ok(r.status === 'off' && wd.calls.length === 0, 'with the reviewer\'s time ended nothing is read or sent');
wd = world({ endAfter: 99 });
wd.onPoll = (w) => { if (w.clock > NOW + 120000) w.clock = Date.parse('2026-12-23T00:00:00Z'); };
r = await wd.go();
ok(wd.calls.filter((x) => /cancel$/.test(x)).length === 1 && wd.sent() === 1, 'when the time ends while a batch runs, it is cancelled once and no further batch is sent');

// a batch still running when the job's time is up, continued by the next start
wd = world({ endAfter: 1e9 });
r = await wd.go();
const mid = stateOf(wd.record());
ok(r.status === 'stopped' && /still running at Anthropic/.test(r.why) && mid.write.id === 'msgbatch_01' && mid.write.worst > 0 && spentOf(mid) >= mid.write.worst && wd.clock - NOW > RUN_MINUTES * 60000,
  'a batch still running when the run\'s time is up is kept by id; its worst case counts until its answers are read');
wd.endAfter = 0; wd.clock = NOW;
r = await wd.go();
ok(r.status === 'finished' && wd.sent() === 2 && wd.comments.length === 3, 'the next start reads that same batch (nothing sent twice), then checks and posts');
// a resume after the code changed still counts what the first batch cost (independent review, PR 117)
wd = world({ endAfter: 1e9 });
await wd.go();
const changed = plan({ gathered: gather({ paths: files.map((f) => f.path), stat: () => ({ isFile: () => true, isSymbolicLink: () => false, size: 200 }), read: (x) => (x.endsWith('common.ts') ? 'changed' : files.find((f) => f.path === x).text) }), lang: 'ar' });
ok(changed.sections.every((x) => !p.sections.some((y) => y.key === x.key)), 'a changed common labels file changes every section\'s key');
wd.endAfter = 0; wd.clock = NOW;
r = await wd.go({ p: changed });
const paid = 3 * batchCost(MODEL, { input_tokens: 1000, output_tokens: 500 });
ok(spentOf(stateOf(wd.record())) >= paid - 1e-9 && Object.keys(stateOf(wd.record()).cost).length >= 3, 'the answers of a batch read back after the code changed are still counted, though the plan no longer has their sections');
// a poll that fails once is tried again; a page posted is never posted twice
wd = world(); let bad = 1;
const api0 = wd.api; wd.api = async (m, path, body) => (m === 'GET' && /msgbatch_\w+$/.test(path) && bad-- > 0 ? { status: 503, json: null, text: '' } : api0(m, path, body));
r = await wd.go();
ok(r.status === 'finished' && wd.comments.length === 3, 'a batch that cannot be read once is read again on the next poll');
wd = world(); let nth = 0;
const gh0 = wd.gh; wd.gh = async (m, path, data) => { if (m === 'POST' && /comments$/.test(path) && ++nth === 2) throw new Error('POST comments answered 502'); return gh0(m, path, data); };
await wd.go().catch(() => null);
wd.gh = gh0;
r = await wd.go();
ok(wd.comments.length === 3 && new Set(wd.comments.map((x) => x.body.split('\n')[0])).size === 3, 'when posting a page fails midway, the next start posts only the pages not yet posted');
wd = world(); wd.fail['w-result'] = 'canceled';
r = await wd.go();
ok(Object.keys(stateOf(wd.record()).failed).length === 0 && wd.comments.length === 0, 'a cancelled or expired answer is not marked failed for good: a later start writes it again');

// refusals and failures
wd = world(); wd.fail.send = { status: 402, json: { error: { type: 'billing_error' } } };
r = await wd.go();
ok(r.status === 'stopped' && /credit or a spend limit/.test(r.why) && spentOf(stateOf(wd.record())) === 0, 'a batch refused for the credit stops the guide, and a refused batch costs nothing');
wd = world(); wd.fail.send = { status: 500, json: { error: { type: 'api_error' } } };
r = await wd.go();
ok(r.status === 'stopped' && spentOf(stateOf(wd.record())) > 0, 'a server error while sending may still have made the batch: its worst case is counted');
wd = world(); wd.fail['c-result'] = 'errored';
r = await wd.go();
ok(r.status === 'finished' && wd.comments.length === 3 && wd.comments.every((x) => /As written/.test(x.body) && /Not checked: the second pass answered errored/.test(x.body)), 'a page whose check failed is posted as written, and says it was not checked');
wd = world(); wd.fail['w-result'] = 'errored';
r = await wd.go();
ok(r.status === 'finished' && wd.comments.length === 0 && wd.sent() === 1 && /No page for:/.test(wd.record().body), 'a section whose write failed has no page, and the record names it');
wd = world();
wd.issues.push({ number: 7, state: 'open', title: titleOf('ar'), body: `<!-- ${MARK} {"v":1,"started":"s","sha":"a","cost":{},"posted":{},"write":{"id":null,"keys":["k"],"worst":1.5},"check":null} -->`, ...BOT });
r = await wd.go();
ok(Math.abs(spentOf(stateOf(wd.record())) - (1.5 + usd)) < 0.001, 'a batch written down but never given an id (the run died while sending) keeps its worst case spent');
wd = world();
wd.issues.push({ number: 8, state: 'open', title: titleOf('ar'), body: `<!-- ${MARK} {"v":1,"started":"s","sha":"a","cost":{},"posted":{"x":"1"},"write":null,"check":null} -->`, user: { login: 'someone', type: 'User' } });
ok(stateOf(wd.issues[0]) === null && stateOf({ ...BOT, body: `<!-- ${MARK} {"posted":{}} -->` }) === null, 'a record counts only from the job\'s own account, and only with its cost and pages');

// the record and a page
const rb = recordBody({ v: 1, started: 's', sha: 'abcdef0', cost: {}, posted: {}, failed: {}, stopped: null }, p, 15);
ok(/\*\*Running:\*\* 0 of 3 pages posted/.test(rb) && /Closing this issue ends this guide/.test(rb) && /can still be wrong/.test(rb), 'the record says a guide is running, how to end it, and that a page can still be wrong');
ok(/Not checked/.test(pageComment(one, 'x', null, 'a').replace('The second pass gave no list of corrections.', 'Not checked')) && /found nothing to correct/.test(pageComment(one, 'x', [], 'a')), 'a page says how it was checked');

// the token never leaves for another host
const caller = apiCaller({}, 'http://127.0.0.1:1');
ok(await caller('GET', 'https://elsewhere.test/v1/messages/batches').then(() => false, (e) => /not a Batch API path/.test(e.message)) && await caller('GET', '/v1/models').then(() => false, (e) => /not a Batch API path/.test(e.message)),
  'the API caller reaches only Batch API paths on the API\'s own host, so the access token is sent nowhere else');

// --- the command line, against a real checkout ----------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'harness-guide-'));
const repo = join(tmp, 'repo');
for (const f of ['src/app/(app)/orders/page.tsx', 'src/app/(app)/orders/OrderForm.tsx', 'src/lib/i18n/orders.ts']) { mkdirSync(join(repo, f, '..'), { recursive: true }); writeFileSync(join(repo, f), `// ${f}\nexport default 1;\n`); }
writeFileSync(join(repo, '.env'), 'TOKEN=DOTENV-SECRET\n');
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t.test', '-c', 'commit.gpgsign=false', ...a], { stdio: 'pipe' });
git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'x');
const seen = [];
const srv = createServer((req, res) => {
  let body = ''; req.on('data', (x) => { body += x; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    seen.push({ method: req.method, path: u.pathname, body, auth: req.headers.authorization || '' });
    const send = (code, j, raw) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(raw ?? JSON.stringify(j)); };
    if (u.pathname === '/idtoken') return send(200, { value: 'JWT.FROM.GITHUB' });
    if (u.pathname === '/v1/oauth/token') return send(200, { access_token: 'SHORT-LIVED' });
    if (u.pathname === '/v1/messages/batches' && req.method === 'POST') { const id = `msgbatch_0${seen.filter((x) => x.path === '/v1/messages/batches').length}`; seen.at(-1).reqs = JSON.parse(body).requests; return send(200, { id }); }
    if (/^\/v1\/messages\/batches\/msgbatch_\w+$/.test(u.pathname)) return send(200, { processing_status: 'ended' });
    if (/\/results$/.test(u.pathname)) { const b0 = seen.filter((x) => x.reqs).at(-1); return send(200, null, b0.reqs.map((q) => JSON.stringify({ custom_id: q.custom_id, result: { type: 'succeeded', message: say(`# Orders\nPage\n---CORRECTIONS---\nnone`) } })).join('\n')); }
    if (u.pathname === '/repos/o/r/issues' && req.method === 'GET') return send(200, []);
    if (u.pathname === '/repos/o/r/issues' && req.method === 'POST') return send(201, { number: 70, ...JSON.parse(body), ...BOT });
    if (/^\/repos\/o\/r\/issues\/\d+$/.test(u.pathname)) return send(200, { number: 70, ...JSON.parse(body), ...BOT });
    if (/^\/repos\/o\/r\/issues\/\d+\/comments$/.test(u.pathname)) return send(201, { id: 5, html_url: 'https://github.test/c5' });
    return send(404, {});
  });
});
await new Promise((done) => srv.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${srv.address().port}`;
const run = (tool, args, env) => new Promise((done) => execFile('node', [join(ROOT, `.harness/tools/${tool}`), ...args], { env: { PATH: process.env.PATH, GITHUB_API_URL: base, GH_TOKEN: 'T', GITHUB_REPOSITORY: 'o/r', ...env } }, (e, out, e2) => done({ code: e ? e.code : 0, out: String(out), err: String(e2) })));
const c1 = await run('guide.mjs', ['plan', '--lang', 'ar', '--root', repo], {});
const c2 = await run('sweep.mjs', ['plan', '--root', repo, '--lens', 'staff-guide-ar'], {});
ok(c1.code === 0 && JSON.parse(c1.out).sections === 1 && JSON.parse(c1.out).files === 3 && c2.code === 0 && JSON.parse(c2.out).guide === 'Arabic' && seen.length === 0, 'plan prints the guide\'s estimate, by itself or through sweep.mjs with the lens; it calls nothing');
const IDS = { REVIEW_FEDERATION_RULE: 'fdrl_01Review', REVIEW_SWEEP_RULE: 'fdrl_01Sweep', REVIEW_ORGANIZATION: '01234567-89ab-cdef-0123-456789abcdef', REVIEW_SERVICE_ACCOUNT: 'svac_01AbC', REVIEW_WORKSPACE: 'wrkspc_01AbC',
  ACTIONS_ID_TOKEN_REQUEST_URL: `${base}/idtoken?api-version=2`, ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'RUNTOKEN', REVIEW_API_URL: base };
const SOON = new Date(Date.now() + 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
const c3 = await run('sweep.mjs', ['run', '--root', repo], { ...IDS, SWEEP_LENS: 'staff-guide-ar', SWEEP_MODE: 'run' });
ok(c3.code === 1 && /switched off/.test(c3.err) && seen.length === 0, 'mode "run" with the switch off fails before any call');
const c4 = await run('sweep.mjs', ['run', '--root', repo], { ...IDS, SWEEP_LENS: 'staff-guide-ar', SWEEP_MODE: 'run', REVIEW_UNTIL: SOON });
const ex = seen.find((x) => x.path === '/v1/oauth/token'), sent = seen.filter((x) => x.path === '/v1/messages/batches');
ok(c4.code === 0 && /"status":"finished"/.test(c4.out) && JSON.parse(ex.body).federation_rule_id === 'fdrl_01Sweep' && sent.length === 2 && sent.every((x) => x.auth === 'Bearer SHORT-LIVED')
  && /src\/lib\/i18n\/orders.ts/.test(sent[0].body) && !/DOTENV-SECRET/.test(seen.map((x) => x.body).join('\n')) && !/SHORT-LIVED|JWT\.FROM/.test(c4.out.replace(/^::add-mask::.*$/gm, '')),
  'a run swaps the identity through the full check\'s own rule, sends a write and a check batch with the labels file, never a .env, and prints no token');
srv.close();
rmSync(tmp, { recursive: true, force: true });

// --- the workflow -------------------------------------------------------------------------------------
const wf = parseYaml(readFileSync(join(ROOT, '.harness/templates/workflows/harness-sweep.yml'), 'utf8'));
ok(String(wf.on.workflow_dispatch.inputs.lens.options).includes('staff-guide-ar') && /K074/.test(readFileSync(join(ROOT, '.harness/templates/workflows/harness-sweep.yml'), 'utf8')), 'the sweep job offers the guide as a lens choice, by name');

console.log(`test-guide: OK · ${n} checks`);
