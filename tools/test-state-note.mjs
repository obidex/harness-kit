#!/usr/bin/env node
// test-state-note — owner asks as separate items in a coordinator's state note (K082), offline.
//
//   node tools/test-state-note.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { read, asksOf, item, parseItem, KINDS, HEADING, REMARKS, NONE } from '../.harness/tools/state-note.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-state-note: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-state-note: ok ${n}. ${what}`); };

const A1 = '- Do: tap A or B for the new look · Why only you: design — a design pick is his · Answer: https://github.com/o/r/issues/1';
const A2 = '- Do: say "pay" for the $3 trial · Why only you: money — it spends credit · Answer: https://github.com/o/r/issues/2';
const note = (asks, extra = '') => `<!-- coordinator-state -->\nUpdated: now\n\nOPEN\n- #5: thread X, wakes on its PR\n\n${HEADING}\n${asks}\n\n${REMARKS}\n- None from this run. #221 is in an agent's hands; nothing is paid.\n${extra}`;

// --- reading -----------------------------------------------------------------------------------------
const two = read(note(`${A1}\n${A2}`));
ok(two.problems.length === 0 && two.asks.length === 2, 'two well-formed items are two asks and no problem');
ok(two.asks[0].do === 'tap A or B for the new look' && two.asks[0].kind === 'design' && two.asks[0].why === 'a design pick is his' && two.asks[0].answer === 'https://github.com/o/r/issues/1',
  'each ask carries what he must do, why only he can (kind and reason) and the link where he answers');
const none = read(note(NONE));
ok(none.problems.length === 0 && none.asks.length === 0 && none.found, '"- None." is a well-formed note with no ask');
const empty = read(note(''));
ok(empty.asks.length === 0 && empty.problems.some((p) => /is empty/.test(p.why) && p.line === 7), 'no item means none, and an empty field is refused: "- None." says it on purpose');
// The case of 27 Nov 2026 (roadmap#213): "None from this run." followed by remarks was counted as one ask.
ok(asksOf(note(NONE)).length === 0 && asksOf(note('')).length === 0, 'remarks under REMARKS are never an ask');
const remarkInAsks = read(note('- None from this run. #219\'s picks will reach him later, which is not an ask yet.'));
ok(remarkInAsks.asks.length === 0 && remarkInAsks.problems.some((p) => /not an item/.test(p.why) && p.line === 8), 'a remark written under OWNER ASKS is refused with its line, and is not an ask');
ok(read(note(`${A1}\nplain words about the week`)).problems.some((p) => /not an item/.test(p.why)), 'free text inside the section is refused');

// --- the three parts ---------------------------------------------------------------------------------
ok(/starts with one of/.test(parseItem('- Do: merge it · Why only you: because · Answer: https://x.test/1').problem), 'a reason that names no kind the owner keeps is refused');
ok(KINDS.every((k) => parseItem(`- Do: x · Why only you: ${k} — y · Answer: https://x.test/1`).item?.kind === k), 'every kind the owner keeps is accepted');
ok(/https link/.test(parseItem('- Do: x · Why only you: money — y · Answer: roadmap#5').problem), 'the answer must be a link, not a bare reference');
ok(/names nothing/.test(parseItem('- Do: nothing · Why only you: decision — y · Answer: https://x.test/1').problem), 'an item that asks nothing is refused');
ok(/not an item/.test(parseItem('- Do: x · Answer: https://x.test/1').problem), 'an item without its reason is refused');
ok(/not an item/.test(parseItem('- Do: x · Why only you: money — y').problem), 'an item without its link is refused');

// --- the note's shape --------------------------------------------------------------------------------
ok(read('<!-- coordinator-state -->\nOPEN\n- x').problems.some((p) => /no OWNER ASKS heading/.test(p.why)), 'a note without the field is refused: silence is never read as none');
ok(read(note(A1, '\nNEEDS OWNER\n- None from this run.\n')).problems.some((p) => /older heading/.test(p.why)), 'the older NEEDS OWNER heading is refused, so no reader counts its remarks');
ok(read(note(A1, `\n${HEADING}\n${A2}\n`)).problems.some((p) => /appears 2 times/.test(p.why)), 'the field appears once');
ok(read(note(`${NONE}\n${A1}`)).problems.some((p) => /beside 1 item/.test(p.why)), '"- None." beside an item is refused');
ok(read(note(`${A1}\n${A1}`)).problems.some((p) => /the same ask twice/.test(p.why)), 'the same ask twice is refused');
ok(read(`## ${HEADING}\n${A1}\n## ${REMARKS}\n- x`).asks.length === 1 && read(`**${HEADING}:**\n${A1}\n`).asks.length === 1, 'the heading may be a Markdown heading or bold');
ok(read(`${HEADING}\n${A1}\nLATER / IDEAS\n- not an ask`).asks.length === 1 && read(`${HEADING}\n${A1}\nLATER / IDEAS\n- not an ask`).problems.length === 0, 'the next heading ends the section');

// --- an ask is never dropped silently (the independent review of K082) ------------------------------------
const I = '- Do: Pay · Why only you: money — x · Answer: https://x.test/1';
ok(read(`## ${HEADING}\n\n### ERP\n${I}\n\n## ${REMARKS}\nx`).problems.some((p) => p.line === 4 && /outside/.test(p.why)), 'an ask below a sub-heading inside the field is refused, not dropped');
ok(read(`${HEADING}\n**Platform**\n${I}`).problems.length >= 1 && read(`${HEADING}\nPLATFORM:\n${I}`).problems.length >= 1, 'a bold or capital project name under the field does not hide the asks below it');
ok(read(`${HEADING}\n**Do:** Pay · **Why only you:** money — x · **Answer:** https://x.test/1`).problems.some((p) => p.line === 2 && /not an item/.test(p.why)), 'an ask with bold labels is refused, never taken for a heading');
ok(read(`${HEADING}\nPAY THE INVOICE NOW\n\n${REMARKS}`).problems.some((p) => /is empty/.test(p.why)), 'a heading straight after the field leaves it empty, which is refused');
ok(read(`${HEADING}\n${NONE}\n\n${REMARKS}\n${I}`).problems.some((p) => p.line === 5 && /outside/.test(p.why)), 'an ask written under REMARKS is refused, not passed uncounted');
ok(/names nothing/.test(parseItem('- Do: No action; remark only · Why only you: decision — fyi · Answer: https://x.test/1').problem), 'a remark dressed as an ask is refused');
ok(/starts with one of/.test(parseItem('- Do: x · Why only you: money-x · Answer: https://x.test/1').problem), 'a kind glued to its reason is refused');

// --- writing one item --------------------------------------------------------------------------------
const made = item({ do: 'Sign in to the provider  once', kind: 'Sign-in', why: 'his password', answer: 'https://x.test/9' });
ok(made === '- Do: Sign in to the provider once · Why only you: sign-in — his password · Answer: https://x.test/9' && parseItem(made).item, 'item writes one well-formed line');
let threw = '';
try { item({ do: 'x', kind: 'convenience', why: 'y', answer: 'https://x.test/1' }); } catch (e) { threw = e.message; }
ok(/starts with one of/.test(threw), 'item refuses a kind the owner does not keep');

// --- the command line, file and issue ----------------------------------------------------------------
const run = (args, env = {}) => new Promise((res) => execFile(process.execPath, [new URL('../.harness/tools/state-note.mjs', import.meta.url).pathname, ...args],
  { env: { ...process.env, HARNESS_GH_RETRY_MS: '0', ...env } }, (e, out, err) => res({ code: e ? e.code : 0, out: String(out), err: String(err) })));
const dir = mkdtempSync(join(tmpdir(), 'state-note-'));
writeFileSync(join(dir, 'good.md'), note(`${A1}\n${A2}`));
writeFileSync(join(dir, 'bad.md'), note('- None from this run. Remarks follow.'));
let r = await run(['check', '--file', join(dir, 'good.md')]);
ok(r.code === 0 && /STATE-NOTE: OK 2 owner asks/.test(r.out), 'check passes a good note and counts its asks');
r = await run(['check', '--file', join(dir, 'bad.md')]);
ok(r.code === 1 && /STATE-NOTE: FAIL line 8: not an item/.test(r.out), 'check fails a note with a remark under OWNER ASKS, naming the line');
r = await run(['asks', '--file', join(dir, 'good.md')]);
ok(r.code === 0 && JSON.parse(r.out).length === 2, 'asks prints the items as JSON');
r = await run(['asks', '--file', join(dir, 'bad.md')]);
ok(r.code === 1 && JSON.parse(r.out).length === 0 && /STATE-NOTE: FAIL line 8/.test(r.err), 'asks on a broken note exits 1 and says why, so a short count is never taken as whole');

const srv = createServer((req, res) => {
  if (req.url === '/repos/o/r/issues/54' && req.headers.authorization === 'Bearer t0k') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ number: 54, body: note(NONE) })); return; }
  res.writeHead(404); res.end('{}');
});
await new Promise((done) => srv.listen(0, '127.0.0.1', done));
const api = `http://127.0.0.1:${srv.address().port}`;
r = await run(['check', '--issue', '54', '--repo', 'o/r'], { GITHUB_API_URL: api, GH_TOKEN: 't0k' });
ok(r.code === 0 && /STATE-NOTE: OK 0 owner asks/.test(r.out), 'check reads a state issue from GitHub with GH_TOKEN');
r = await run(['check', '--issue', '55', '--repo', 'o/r'], { GITHUB_API_URL: api, GH_TOKEN: 't0k' });
ok(r.code === 2 && /answered 404/.test(r.err), 'a note that cannot be read fails the check, never passes it');
srv.close();

// --- the rule's home ---------------------------------------------------------------------------------
const wake = readFileSync(new URL('../.harness/wake.md', import.meta.url), 'utf8');
ok(/OWNER ASKS/.test(wake) && /REMARKS/.test(wake) && /state-note\.mjs check/.test(wake) && /K082/.test(wake), 'wake.md names the field, the remarks field, the check and the decision');

console.log(`test-state-note: ${n} cases held`);
