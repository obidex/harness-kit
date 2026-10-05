#!/usr/bin/env node
// stale — the C15 stale-work list (no silent stall). No dependencies.
//
//   node .harness/tools/stale.mjs scan --repo owner/name     the stale items now (JSON); reads only
//   node .harness/tools/stale.mjs report --repo owner/name   in Actions (harness-stale.yml): scan, then
//                                         bring the one "Stale work" tracking issue up to date
//                                         (create, edit in place, reopen, or close when the list is
//                                         empty) and alert through notify.mjs (O10)
//
// Stale means idle (no update) for at least:
//   HARNESS_STALE_PR_DAYS        2   an open PR, classified draft, conflicted, red, green-unmerged or
//                                    waiting (checks pending or none); bot PRs count like any other
//   HARNESS_STALE_CONFLICT_DAYS  1   an open PR that cannot merge because of a conflict
//   HARNESS_STALE_INBOX_DAYS     1   an open `inbox` request in state queued or working (O14)
//   HARNESS_STALE_CARD_DAYS      3   an open issue labelled `card` or any `risk:*` label
//
// The tracking issue is found by the hidden marker `<!-- harness-stale -->`: one issue per
// repository, never one per run (RJ02), and only one filed by github-actions[bot] counts, so `report`
// runs in Actions (harness-stale.yml). Its body also carries, as a hidden marker, the item set the
// owner was last told about. Alerts follow the one standard (O10, .harness/alerts.md) through
// notify.mjs, never Telegram directly: when the list holds items not announced before, one problem
// under the key `stale:<owner/name>` in the project's topic (the Actions variable ALERTS_TOPIC), linking
// the issue; when the list is empty, `resolve` on that key. notify.mjs deduplicates, caps and
// escalates; its store is github:<owner/name> (ALERTS_STORE), and without ALERTS_BOT_TOKEN and
// ALERTS_CHAT_ID a problem is recorded as an issue for the next tick to send. GH_TOKEN reads the
// repository and writes the issues.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseInbox } from './inbox.mjs';
import { TOPICS, problem, resolveKey, store, telegram } from './notify.mjs';

export const MARKER = '<!-- harness-stale -->';
export const TITLE = 'Stale work';
export const MAX_LISTED = 10;
export const DEFAULTS = { prDays: 2, conflictDays: 1, inboxDays: 1, cardDays: 3 };
const ENV = { prDays: 'HARNESS_STALE_PR_DAYS', conflictDays: 'HARNESS_STALE_CONFLICT_DAYS', inboxDays: 'HARNESS_STALE_INBOX_DAYS', cardDays: 'HARNESS_STALE_CARD_DAYS' };
const DAY = 86400000;

/** Thresholds in days: the defaults, each overridable by its env variable (empty = default). */
export function thresholds(env = process.env) {
  const out = { ...DEFAULTS };
  for (const [k, name] of Object.entries(ENV)) {
    const v = env[name];
    if (v === undefined || String(v).trim() === '') continue;
    if (!/^\d+(\.\d+)?$/.test(String(v).trim())) throw new Error(`${name} must be a number of days, not "${v}"`);
    out[k] = Number(v);
  }
  return out;
}

/** Whole days since an ISO time. */
export const idleDays = (updatedAt, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(updatedAt)) / DAY));

const RED = ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'];

/** The checks on a commit: red, pending, green or none. `runs` are check runs; `combined` the commit status. */
export function checkState(runs = [], combined = { state: 'pending', total_count: 0 }) {
  const statuses = combined?.total_count || 0;
  if (runs.some((r) => r.status === 'completed' && RED.includes(r.conclusion)) || (statuses && ['failure', 'error'].includes(combined.state))) return 'red';
  if (runs.some((r) => r.status !== 'completed') || (statuses && combined.state === 'pending')) return 'pending';
  return runs.length + statuses ? 'green' : 'none';
}

/** One open PR's kind: draft, conflicted, red, green-unmerged or waiting. */
export function classifyPr(pr, checks) {
  if (pr.draft) return 'draft';
  if (pr.mergeable === false || pr.mergeable_state === 'dirty') return 'conflicted';
  if (checks === 'red') return 'red';
  if (checks === 'green') return 'green-unmerged';
  return 'waiting';
}

/** An open issue's kind for this list, or null: inbox queued/working, card, risk. */
export function classifyIssue(issue) {
  if (String(issue.body || '').includes(MARKER)) return null; // the tracking issue itself
  const labels = (issue.labels || []).map((l) => String(typeof l === 'string' ? l : l.name));
  if (labels.includes('inbox')) {
    const state = parseInbox(issue.body)?.State;
    if (state === 'queued' || state === 'working') return `inbox ${state}`;
  }
  if (labels.includes('card')) return 'card';
  if (labels.some((l) => /^risk:/.test(l))) return 'risk';
  return null;
}

/** The threshold a candidate's kind must reach. */
export function thresholdFor(kind, t) {
  if (kind === 'conflicted') return t.conflictDays;
  if (['draft', 'red', 'green-unmerged', 'waiting'].includes(kind)) return t.prDays;
  if (kind.startsWith('inbox')) return t.inboxDays;
  return t.cardDays;
}

/** The stale items among candidates { number, url, title, kind, updatedAt }, longest idle first. */
export function select(cands, now = Date.now(), t = DEFAULTS) {
  const seen = new Set();
  return cands
    .map((c) => ({ ...c, days: idleDays(c.updatedAt, now) }))
    .filter((c) => c.kind && c.days >= thresholdFor(c.kind, t) && !seen.has(c.number) && seen.add(c.number))
    .map(({ number, url, title, kind, days }) => ({ number, url, title, kind, days }))
    .sort((a, b) => b.days - a.days || a.number - b.number);
}

// --- the tracking issue's body ---------------------------------------------------------------------
const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[|[\]`<>]/g, (c) => `\\${c}`).replace(/@/g, '@​').trim().slice(0, 120);

/** The body: the list, then the hidden markers (announced item set, last alert date). */
export function render(items, { announced = [], t = DEFAULTS } = {}) {
  const lines = [MARKER, 'Open work idle past its threshold (C15, no silent stall), listed once a day by `harness-stale.yml`.',
    'Resume each item or report it STOPPED. This issue updates in place and closes when the list is empty.', ''];
  if (items.length) {
    lines.push('| Item | Kind | Days idle |', '|---|---|---|');
    for (const i of items) lines.push(`| [#${i.number}](${i.url}) ${clean(i.title)} | ${i.kind} | ${i.days} |`);
  } else lines.push('Nothing is stale.');
  lines.push('', `Thresholds in days: PRs ${t.prDays}, conflicted PRs ${t.conflictDays}, inbox queued or working ${t.inboxDays}, \`card\` and \`risk:*\` issues ${t.cardDays}.`, '',
    `<!-- harness-stale-items: ${signature(announced)} -->`, '');
  return lines.join('\n');
}

/** The marker read back from a body: { announced: [numbers] }. */
export function readMarkers(body) {
  const items = String(body || '').match(/<!-- harness-stale-items: ([\d,]*) -->/);
  return { announced: items && items[1] ? items[1].split(',').map(Number) : [] };
}

/** The signature of an item set: its numbers, sorted, comma-separated. */
export function signature(list) {
  return [...new Set(list.map((x) => (typeof x === 'number' ? x : x.number)))].sort((a, b) => a - b).join(',');
}

/** The items not announced before. Deduplication, caps and escalation are notify.mjs's (O10). */
export const freshItems = (items, announced = []) => { const before = new Set(announced); return items.filter((i) => !before.has(i.number)); };

/** The problem text (notify.mjs sends it as one line): at most MAX_LISTED items, new ones first. */
export function message(repo, items, fresh) {
  const isNew = new Set(fresh.map((i) => i.number));
  const ordered = [...items.filter((i) => isNew.has(i.number)), ...items.filter((i) => !isNew.has(i.number))];
  const parts = ordered.slice(0, MAX_LISTED).map((i) => `#${i.number} ${i.kind} ${i.days}d${isNew.has(i.number) ? ' (new)' : ''}`);
  return `Stale work in ${repo}: ${items.length} item(s), ${fresh.length} new: ${parts.join(', ')}${ordered.length > MAX_LISTED ? `, and ${ordered.length - MAX_LISTED} more` : ''}`;
}

/** The project's topic from ALERTS_TOPIC: one of notify.mjs's project topics, or null. */
export function topicOf(v = process.env.ALERTS_TOPIC) {
  const t = String(v || '').trim();
  return t && t in TOPICS && !['needs', 'daily'].includes(t) ? t : null;
}

// --- GitHub ---------------------------------------------------------------------------------------
async function api(method, path, data) {
  const r = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
    method,
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'harness-stale',
      ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (r.status < 200 || r.status > 299) throw new Error(`${method} ${path} answered ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function pages(path, max = 30) {
  const out = [];
  for (let page = 1; page <= max; page++) {
    const l = await api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...l);
    if (l.length < 100) break;
  }
  return out;
}

/** Every stale item of the repository now. */
export async function scan(repo, now = Date.now(), t = thresholds()) {
  const cands = [];
  const prMin = Math.min(t.prDays, t.conflictDays);
  for (const p of await pages(`/repos/${repo}/pulls?state=open`)) {
    if (idleDays(p.updated_at, now) < prMin) continue; // too fresh for any PR threshold: no more calls
    const full = await api('GET', `/repos/${repo}/pulls/${p.number}`);
    const sha = full.head.sha;
    const runs = (await api('GET', `/repos/${repo}/commits/${sha}/check-runs?per_page=100`)).check_runs || [];
    const combined = await api('GET', `/repos/${repo}/commits/${sha}/status`);
    cands.push({ number: p.number, url: p.html_url, title: p.title, kind: classifyPr(full, checkState(runs, combined)), updatedAt: p.updated_at });
  }
  for (const i of await pages(`/repos/${repo}/issues?state=open`)) {
    if (i.pull_request) continue;
    cands.push({ number: i.number, url: i.html_url, title: i.title, kind: classifyIssue(i), updatedAt: i.updated_at });
  }
  return select(cands, now, t);
}

export const AUTHOR = 'github-actions[bot]';
/** Whether an issue is the tracking issue: the marker, filed by Actions' own token. Anyone can type the
 * marker, so an issue by anyone else never counts (it could otherwise claim every item was announced). */
export const isTracking = (i) => !i.pull_request && String(i.body || '').includes(MARKER) && i.user?.login === AUTHOR && i.user?.type === 'Bot';

/** The tracking issue (open first, then the most recently updated closed one), or null. */
async function findTracking(repo) {
  for (const state of ['open', 'closed']) {
    for (let page = 1; page <= (state === 'open' ? 30 : 10); page++) {
      const l = await api('GET', `/repos/${repo}/issues?state=${state}&sort=updated&direction=desc&per_page=100&page=${page}`);
      const hit = l.find(isTracking);
      if (hit) return hit;
      if (l.length < 100) break;
    }
  }
  return null;
}

/** scan, then update the one tracking issue and alert through notify.mjs. */
export async function report(repo, now = Date.now()) {
  const t = thresholds();
  const items = await scan(repo, now, t);
  const issue = await findTracking(repo);
  const prev = readMarkers(issue?.body);
  const fresh = freshItems(items, prev.announced);
  const key = `stale:${repo}`;
  const alerts = () => store(process.env.ALERTS_STORE || `github:${repo}`);
  const topic = topicOf();
  // with no topic set nothing is announced yet, so the first run that has one alerts for the list
  const announced = fresh.length && !topic ? prev.announced.filter((n) => items.some((i) => i.number === n)) : items.map((i) => i.number);
  const body = render(items, { announced, t });
  if (!items.length) {
    if (issue && issue.state === 'open') { await api('PATCH', `/repos/${repo}/issues/${issue.number}`, { body, state: 'closed', state_reason: 'completed' }); console.log(`stale: nothing stale; closed #${issue.number}`); }
    else console.log('stale: nothing stale');
    const r = await resolveKey(alerts(), telegram(), { key, text: `nothing stale in ${repo}` });
    if (r.status !== 'none') console.log(`stale: alert ${key} ${r.status}`);
    return { items, issue: issue?.number ?? null, alert: r.status };
  }
  let target = issue;
  if (!issue) target = await api('POST', `/repos/${repo}/issues`, { title: TITLE, body });
  else if (issue.state !== 'open' || issue.body !== body) target = await api('PATCH', `/repos/${repo}/issues/${issue.number}`, { body, ...(issue.state !== 'open' ? { state: 'open' } : {}) });
  console.log(`stale: ${items.length} item(s) listed in ${target.html_url} (${fresh.length} new)`);
  if (!fresh.length) return { items, issue: target.number, alert: 'nothing new' };
  if (!topic) { console.log('stale: no alert: set the Actions variable ALERTS_TOPIC to this project\'s topic (.harness/alerts.md)'); return { items, issue: target.number, alert: 'no topic' }; }
  try {
    const r = await problem(alerts(), telegram(), { key, topic, title: `Stale work in ${repo}`, text: message(repo, items, fresh), link: target.html_url });
    console.log(`stale: alert ${key} ${r.status}`);
    return { items, issue: target.number, alert: r.status };
  } catch (e) {
    // not delivered: keep the new items unannounced, so the next run asks notify.mjs again
    await api('PATCH', `/repos/${repo}/issues/${target.number}`, { body: render(items, { announced: prev.announced.filter((n) => items.some((i) => i.number === n)), t }) });
    throw e;
  }
}

// --- commands -------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

async function main() {
  const [cmd] = argv;
  const repo = opt('--repo');
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('--repo owner/name is required');
  if (cmd === 'scan') { console.log(JSON.stringify(await scan(repo), null, 2)); return; }
  if (cmd === 'report') { await report(repo); return; }
  throw new Error('usage: stale.mjs scan|report --repo owner/name  (see the header of this file)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(`stale: ${e.message}`); process.exit(1); });
}
