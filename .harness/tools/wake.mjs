#!/usr/bin/env node
// wake — disposable, event-fired coordinator runs (K033, .harness/wake.md). No dependencies.
//
//   node .harness/tools/wake.mjs fire --repo owner/name --event <labeled|unlabeled|schedule|workflow_dispatch>
//        [--issue <n>] [--label <name>]
//                                         in Actions only (harness-wake.yml): decide whether this event
//                                         starts a fresh coordinator run, and if so fire the project's
//                                         scheduled task (WAKE_ROUTINE_URL, WAKE_ROUTINE_TOKEN) and post
//                                         the run's session link as the receipt
//   node .harness/tools/wake.mjs status --repo owner/name
//                                         the state the next decision reads (JSON; reads only)
//
// The contract (.harness/wake.md):
// - A wake is the label `wake` on an issue or pull request, never a comment. Anyone with triage on the
//   repository may set it: a person, a job, or a coordinator run that hands work to the next one.
// - One run at a time: the claim label `coordinator-running` on the project's STATE issue. This job
//   sets it before firing; the run removes it as its last step. Its removal is an event: if issues
//   still carry `wake`, the next run starts. A claim older than CLAIM_TTL_H hours is a run that died,
//   and is cleared by the next decision.
// - The STATE issue: one per repository, opened by this job (github-actions[bot]) with the label
//   `coordinator-state` and the marker <!-- coordinator-state -->. Its body is the run's state; each
//   run reads it first and writes it last. Only an issue the job opened counts, so nobody can plant one.
// - Caps nobody resets: every fire is a receipt comment by github-actions[bot] (posted on the STATE
//   issue, read from the whole repository), and the caps count those receipts over the last 24 hours: DAILY_CAP fires per repository (an Actions
//   variable WAKE_DAILY_CAP may lower it, never raise it) and ISSUE_CAP per woken issue. A session acts
//   as a person's account, so it cannot post a receipt or make one look older; the caps live in this
//   kit-managed file.
// - The daily backstop (the workflow's schedule): fires only when there is work a script can see (an
//   issue still labelled `wake`, a claim left by a dead run, or C15 stale work), so no AI runs on an
//   empty day. After EMPTY_STOP empty backstops in a row it stops; the next fire re-arms it.
// - Nothing is lost when a wake is refused (a run already on, a cap): the label stays, and the end of
//   the running run, or the next backstop, picks it up.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WAKE = 'wake';
export const CLAIM = 'coordinator-running';
export const STATE = 'coordinator-state';
export const STATE_MARK = '<!-- coordinator-state -->';
export const FIRE_MARK = '<!-- wake-fire ';            // + JSON + ' -->', a receipt
export const EMPTY_MARK = '<!-- wake-backstop-empty -->';
export const CAPPED_MARK = '<!-- wake-capped -->';
export const BOT = 'github-actions[bot]';
export const DAILY_CAP = 8;          // fires per repository per 24 h, hard ceiling
export const ISSUE_CAP = 3;          // fires per woken issue per 24 h
export const CLAIM_TTL_H = 3;        // a claim older than this belongs to a run that died
export const EMPTY_STOP = 3;         // empty backstops in a row, then the backstop stops
const HOUR = 3600e3, DAY = 24 * HOUR;
export const LEDGER_DAYS = 30;       // how far back the receipts are read

/** The job's receipts in the whole repository (not only on the STATE issue), so neither editing,
 *  closing nor replacing the STATE issue changes the count. */
async function receipts(repo, now = Date.now()) {
  const since = new Date(now - LEDGER_DAYS * DAY).toISOString();
  return ledger(await pages(`/repos/${repo}/issues/comments?since=${since}&sort=created&direction=asc`, 50));
}

/** The daily cap: WAKE_DAILY_CAP may lower it, never raise it; anything unreadable is the ceiling. */
export function capFrom(v) {
  const n = /^\s*\d+\s*$/.test(String(v ?? '')) ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(n, DAILY_CAP) : DAILY_CAP;
}

const byJob = (c) => c?.user?.login === BOT && c?.user?.type === 'Bot';

/** The STATE issue among issues: the oldest open one the job opened, carrying the marker. */
export const isState = (i) => !i.pull_request && byJob(i) && String(i.body || '').includes(STATE_MARK);

/** The job's own marker comments on the STATE issue, oldest first: { kind: fire|empty, at, issue }. */
export function ledger(comments) {
  const out = [];
  for (const c of comments) {
    if (!byJob(c)) continue;
    const b = String(c.body || ''), at = Date.parse(c.created_at);
    if (b.startsWith(FIRE_MARK)) {
      let j = {};
      try { j = JSON.parse(b.slice(FIRE_MARK.length, b.indexOf(' -->'))); } catch { /* a receipt still counts */ }
      out.push({ kind: 'fire', at, issue: Number.isInteger(j.issue) ? j.issue : null });
    } else if (b.startsWith(EMPTY_MARK)) out.push({ kind: 'empty', at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** What this event does. Pure: every input is read before, every effect is done after.
 *  in: { event, label, issue: { number, open, labels, isState } | null, claim: bool, ledger, queue: [n],
 *        work: [items], now, cap }
 *  out: { act: fire|empty|capped|none, why, target, clearClaim, last } */
export function decide({ event, label, issue = null, claim = false, ledger: led = [], queue = [], work = [], now = Date.now(), cap = DAILY_CAP }) {
  const fires = led.filter((e) => e.kind === 'fire');
  const lastFire = fires.at(-1);
  const recent = fires.filter((e) => now - e.at < DAY);
  const dead = claim && (!lastFire || now - lastFire.at > CLAIM_TTL_H * HOUR);
  const busy = claim && !dead;
  let target = null, why;
  if (event === 'labeled') {
    if (label !== WAKE || !issue || !issue.open || !issue.labels.includes(WAKE) || issue.isState) return { act: 'none', why: 'not a wake on an open issue' };
    target = issue.number; why = 'wake label';
  } else if (event === 'unlabeled') {
    if (label !== CLAIM || !issue?.isState) return { act: 'none', why: 'not the end of a run' };
    if (claim) return { act: 'none', why: 'the claim is back on' };
    if (!queue.length) return { act: 'none', why: 'the run ended and nothing is queued' };
    target = queue[0]; why = 'queued wake after a run ended';
  } else if (event === 'schedule') {
    const empties = led.filter((e) => e.kind === 'empty' && (!lastFire || e.at > lastFire.at)).length;
    if (empties >= EMPTY_STOP) return { act: 'none', why: `backstop off after ${EMPTY_STOP} empty runs in a row; the next wake re-arms it` };
    if (busy) return { act: 'none', why: 'backstop: a run is on' };
    if (queue.length) { target = queue[0]; why = 'backstop: a wake still queued'; }
    else if (dead) why = 'backstop: a run died holding the claim';
    else if (work.length) why = `backstop: ${work.length} stale item(s)`;
    else return { act: 'empty', why: 'backstop: nothing to do', last: empties + 1 >= EMPTY_STOP, n: empties + 1 };
  } else if (event === 'workflow_dispatch') {
    if (issue && (!issue.open || issue.isState)) return { act: 'none', why: 'not an open issue to wake for' };
    target = issue ? issue.number : null; why = 'started by hand';
  } else return { act: 'none', why: `event ${event} wakes nobody` };
  if (busy) return { act: 'none', why: 'a run is on; it reads the wake queue before it ends, and its end starts the next run', target };
  if (recent.length >= cap) return { act: 'capped', why: `the daily cap is reached (${recent.length} of ${cap} runs in 24 h)`, target };
  if (target != null && recent.filter((e) => e.issue === target).length >= ISSUE_CAP) return { act: 'capped', why: `#${target} already started ${ISSUE_CAP} runs in 24 h`, target };
  return { act: 'fire', why, target, clearClaim: dead };
}

/** The fire URL must be a scheduled task's /fire endpoint, nothing else. */
export function fireUrlOk(url, base = process.env.WAKE_FIRE_BASE || 'https://api.anthropic.com') {
  const b = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${b}/v1/claude_code/routines/trig_[A-Za-z0-9]+/fire$`).test(String(url || ''));
}

/** The text the run receives (inside its fire-payload block): a hint; the run acts on what GitHub shows. */
export function payload({ repo, why, target, stateIssue }) {
  return [`Coordinator wake for ${repo} (${why}).`,
    target != null ? `Woken by #${target}: https://github.com/${repo}/issues/${target}` : 'No single issue: read the queue and the board.',
    `STATE: https://github.com/${repo}/issues/${stateIssue} (read it first, write it last).`,
    `Handle every open issue labelled \`${WAKE}\` (remove the label once handled), then remove \`${CLAIM}\` from #${stateIssue} as the very last step.`].join('\n');
}

// --- GitHub -----------------------------------------------------------------------------------------
async function gh(method, path, data) {
  const r = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
    method,
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'harness-wake',
      ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (r.status < 200 || r.status > 299) throw new Error(`${method} ${path} answered ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function pages(path, max = 20) {
  const out = [];
  for (let page = 1; page <= max; page++) {
    const l = await gh('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...l);
    if (l.length < 100) break;
  }
  return out;
}

const names = (i) => (i.labels || []).map((l) => l.name ?? l);

/** The STATE issue: the first one this job ever opened, found by author and marker, not by its label or
 *  state, so removing the label or closing it never starts a fresh count. Closed, it is reopened;
 *  missing, it is opened. */
async function stateIssue(repo, { open = true } = {}) {
  const hit = (await pages(`/repos/${repo}/issues?state=all&creator=${encodeURIComponent(BOT)}&sort=created&direction=asc`)).find(isState);
  if (hit && open && hit.state !== 'open') return gh('PATCH', `/repos/${repo}/issues/${hit.number}`, { state: 'open', labels: [...new Set([...names(hit), STATE])] });
  if (hit || !open) return hit || null;
  return gh('POST', `/repos/${repo}/issues`, { title: 'Coordinator state', labels: [STATE],
    body: `${STATE_MARK}\nThe coordinator's state (Harness Kit wake, K033). Each run reads this body first and writes it last; the label \`${CLAIM}\` on this issue means a run is on. Receipts below are the job's own; they are the caps' count.\n\nState: no run yet.\n` });
}

/** Everything one decision reads. */
async function read(repo, { issue, event }) {
  const st = await stateIssue(repo, { open: true });
  const led = await receipts(repo);
  const queue = (await pages(`/repos/${repo}/issues?state=open&labels=${WAKE}&sort=created&direction=asc`))
    .filter((i) => i.number !== st.number).map((i) => i.number);
  let it = null;
  if (issue) {
    const i = await gh('GET', `/repos/${repo}/issues/${issue}`);
    it = { number: i.number, open: i.state === 'open', labels: names(i), isState: i.number === st.number };
  }
  let work = [];
  if (event === 'schedule' && !queue.length) {
    try { work = await (await import('./stale.mjs')).scan(repo); }
    catch (e) { console.log(`wake: the stale scan failed (${e.message.slice(0, 120)}); counted as no stale work`); }
  }
  return { st, led, queue, it, work, claim: names(st).includes(CLAIM) };
}

async function fire(url, token, text) {
  const r = await fetch(url, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ text }) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* below */ }
  if (!r.ok) throw new Error(`the scheduled task did not start: ${r.status} ${String(t).slice(0, 160)}`);
  if (!j?.claude_code_session_url) throw new Error('the scheduled task answered without a session link');
  return j.claude_code_session_url;
}

const comment = (repo, n, body) => gh('POST', `/repos/${repo}/issues/${n}/comments`, { body });
const unclaim = (repo, n) => gh('DELETE', `/repos/${repo}/issues/${n}/labels/${CLAIM}`).catch(() => {});

async function runFire(repo, { event, issue, label }) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('fire runs only in GitHub Actions (harness-wake.yml): its receipts must be the job\'s own');
  const url = process.env.WAKE_ROUTINE_URL, token = process.env.WAKE_ROUTINE_TOKEN;
  if (!fireUrlOk(url)) throw new Error('WAKE_ROUTINE_URL is not a scheduled task\'s /fire URL (.harness/wake.md "Setup")');
  if (!token) throw new Error('the WAKE_ROUTINE_TOKEN secret is missing (.harness/wake.md "Setup")');
  const s = await read(repo, { issue, event });
  const d = decide({ event, label, issue: s.it, claim: s.claim, ledger: s.led, queue: s.queue, work: s.work, now: Date.now(), cap: capFrom(process.env.WAKE_DAILY_CAP) });
  console.log(`wake: ${d.act}: ${d.why}`);
  if (d.act === 'empty') {
    await comment(repo, s.st.number, `${EMPTY_MARK}\nBackstop: nothing to do (${d.n} of ${EMPTY_STOP} empty in a row).${d.last ? ' The backstop is off until the next wake re-arms it.' : ''}`);
    return;
  }
  if (d.act === 'capped') {
    if (d.target != null && event === 'labeled') await comment(repo, d.target, `${CAPPED_MARK}\nNo coordinator run started: ${d.why}. The \`${WAKE}\` label stays, so the next run or the daily backstop picks this up.`);
    return;
  }
  if (d.act !== 'fire') return;
  if (d.clearClaim) { await unclaim(repo, s.st.number); console.log('wake: cleared a claim left by a run that died'); }
  await gh('POST', `/repos/${repo}/issues/${s.st.number}/labels`, { labels: [CLAIM] });   // claim before the run exists
  let link;
  try { link = await fire(url, token, payload({ repo, why: d.why, target: d.target, stateIssue: s.st.number })); }
  catch (e) {
    await unclaim(repo, s.st.number);
    await comment(repo, d.target ?? s.st.number, `Not started: ${e.message}. The \`${WAKE}\` label stays; the next event or the daily backstop tries again.`).catch(() => {});
    throw e;
  }
  // the receipts: the caps count the first; the second tells whoever woke it where the run is
  await comment(repo, s.st.number, `${FIRE_MARK}${JSON.stringify({ issue: d.target, event })} -->\nRun started (${d.why}): ${link}`);
  if (d.target != null) await comment(repo, d.target, `Coordinator run started: ${link}`).catch(() => {});
  console.log(`wake: fired: ${link}`);
}

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

async function main() {
  const [cmd] = argv;
  const repo = opt('--repo');
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('--repo owner/name is required');
  const issue = opt('--issue') ? Number(opt('--issue')) : null;
  if (issue !== null && !Number.isInteger(issue)) throw new Error('--issue must be a number');
  if (cmd === 'fire') return runFire(repo, { event: opt('--event'), issue, label: opt('--label') });
  if (cmd === 'status') {
    const st = await stateIssue(repo, { open: false });
    if (!st) { console.log(JSON.stringify({ state: null })); return; }
    const led = await receipts(repo);
    const now = Date.now(), lastFire = led.filter((e) => e.kind === 'fire').at(-1);
    console.log(JSON.stringify({ state: st.number, claim: names(st).includes(CLAIM), fires24h: led.filter((e) => e.kind === 'fire' && now - e.at < DAY).length,
      cap: capFrom(process.env.WAKE_DAILY_CAP), emptyStreak: led.filter((e) => e.kind === 'empty' && (!lastFire || e.at > lastFire.at)).length,
      queue: (await pages(`/repos/${repo}/issues?state=open&labels=${WAKE}`)).filter((i) => i.number !== st.number).map((i) => i.number) }));
    return;
  }
  throw new Error('usage: wake.mjs fire|status  (see the header of this file)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(`wake: ${e.message}`); process.exit(1); });
}
