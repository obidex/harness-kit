#!/usr/bin/env node
// stale — the C15 stale-work list (no silent stall). No dependencies.
//
//   node .harness/tools/stale.mjs scan --repo owner/name     the stale items now (JSON); reads only
//   node .harness/tools/stale.mjs report --repo owner/name   in Actions (harness-stale.yml): scan, then
//                                         bring the one "Stale work" tracking issue up to date
//                                         (create, edit in place, reopen, or close when the list is
//                                         empty) and send a Telegram alert within the O10 caps
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
// runs in Actions (harness-stale.yml). Its body also carries the item set the owner was last told
// about and the date of the last alert, both as hidden markers. An alert goes out only when the list
// holds items not yet announced, at most once a day per repository, lists at most 10 items, and is
// skipped silently when TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is absent (the issue still updates).
// Never for an empty list. GH_TOKEN reads the repository and writes the issue.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseInbox } from './inbox.mjs';

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
export function render(items, { announced = [], sent = '', t = DEFAULTS } = {}) {
  const lines = [MARKER, 'Open work idle past its threshold (C15, no silent stall), listed once a day by `harness-stale.yml`.',
    'Resume each item or report it STOPPED. This issue updates in place and closes when the list is empty.', ''];
  if (items.length) {
    lines.push('| Item | Kind | Days idle |', '|---|---|---|');
    for (const i of items) lines.push(`| [#${i.number}](${i.url}) ${clean(i.title)} | ${i.kind} | ${i.days} |`);
  } else lines.push('Nothing is stale.');
  lines.push('', `Thresholds in days: PRs ${t.prDays}, conflicted PRs ${t.conflictDays}, inbox queued or working ${t.inboxDays}, \`card\` and \`risk:*\` issues ${t.cardDays}.`, '',
    `<!-- harness-stale-items: ${signature(announced)} -->`, `<!-- harness-stale-sent: ${sent || 'never'} -->`, '');
  return lines.join('\n');
}

/** The markers read back from a body: { announced: [numbers], sent: 'YYYY-MM-DD' | '' }. */
export function readMarkers(body) {
  const text = String(body || '');
  const items = text.match(/<!-- harness-stale-items: ([\d,]*) -->/);
  const sent = text.match(/<!-- harness-stale-sent: (\d{4}-\d{2}-\d{2}) -->/);
  return { announced: items && items[1] ? items[1].split(',').map(Number) : [], sent: sent ? sent[1] : '' };
}

/** The signature of an item set: its numbers, sorted, comma-separated. */
export function signature(list) {
  return [...new Set(list.map((x) => (typeof x === 'number' ? x : x.number)))].sort((a, b) => a - b).join(',');
}

/**
 * Whether to alert, and the item set to record as announced.
 * Alert only for items not announced before, not twice on one day, never on an empty list, never
 * without the secrets. A capped alert keeps its new items unannounced, so they go out the next day.
 */
export function decide(items, { announced = [], sent = '' }, today, canSend) {
  const before = new Set(announced);
  const fresh = items.filter((i) => !before.has(i.number));
  const now = items.map((i) => i.number);
  if (!fresh.length || !canSend) return { send: false, fresh, announced: now, reason: !fresh.length ? 'nothing new' : 'no Telegram secrets' };
  if (sent === today) return { send: false, fresh, announced: now.filter((n) => before.has(n)), reason: 'already alerted today' };
  return { send: true, fresh, announced: now, reason: 'new stale items' };
}

/** The alert text: at most MAX_LISTED items, new ones first, then "and N more", then the issue link. */
export function message(repo, items, fresh, issueUrl) {
  const isNew = new Set(fresh.map((i) => i.number));
  const ordered = [...items.filter((i) => isNew.has(i.number)), ...items.filter((i) => !isNew.has(i.number))];
  const lines = [`Stale work in ${repo}: ${items.length} item(s), ${fresh.length} new.`];
  for (const i of ordered.slice(0, MAX_LISTED)) lines.push(`- #${i.number} ${i.kind}, ${i.days}d${isNew.has(i.number) ? ' (new)' : ''}: ${String(i.title || '').replace(/\s+/g, ' ').slice(0, 80)}`);
  if (ordered.length > MAX_LISTED) lines.push(`and ${ordered.length - MAX_LISTED} more`);
  lines.push(issueUrl);
  return lines.join('\n');
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

async function telegram(text) {
  const base = process.env.HARNESS_TELEGRAM_API || 'https://api.telegram.org';
  const r = await fetch(`${base}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  let ok = r.ok;
  try { ok = ok && (await r.json()).ok !== false; } catch { /* a non-JSON answer: trust the status */ }
  if (!ok) throw new Error(`Telegram did not accept the alert (${r.status})`); // never the URL: it holds the token
}

/** scan, then update the one tracking issue and alert within the caps. */
export async function report(repo, now = Date.now()) {
  const t = thresholds();
  const items = await scan(repo, now, t);
  const today = new Date(now).toISOString().slice(0, 10);
  const issue = await findTracking(repo);
  const prev = readMarkers(issue?.body);
  const canSend = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const d = decide(items, prev, today, canSend);
  const sent = d.send ? today : prev.sent;
  const body = render(items, { announced: d.announced, sent, t });
  let target = issue;
  if (!items.length) {
    if (issue && issue.state === 'open') { await api('PATCH', `/repos/${repo}/issues/${issue.number}`, { body, state: 'closed', state_reason: 'completed' }); console.log(`stale: nothing stale; closed #${issue.number}`); }
    else console.log('stale: nothing stale');
    return { items, issue: issue?.number ?? null, sent: false };
  }
  if (!issue) target = await api('POST', `/repos/${repo}/issues`, { title: TITLE, body });
  else if (issue.state !== 'open' || issue.body !== body) target = await api('PATCH', `/repos/${repo}/issues/${issue.number}`, { body, ...(issue.state !== 'open' ? { state: 'open' } : {}) });
  console.log(`stale: ${items.length} item(s) listed in ${target.html_url} (${d.fresh.length} new)`);
  if (!d.send) { console.log(`stale: no alert (${d.reason})`); return { items, issue: target.number, sent: false }; }
  try { await telegram(message(repo, items, d.fresh, target.html_url)); }
  catch (e) {
    // the alert failed: take back the sent date and the announced set, so the next run tries again
    await api('PATCH', `/repos/${repo}/issues/${target.number}`, { body: render(items, { announced: prev.announced.filter((n) => items.some((i) => i.number === n)), sent: prev.sent, t }) });
    throw e;
  }
  console.log(`stale: alert sent for ${d.fresh.length} new item(s)`);
  return { items, issue: target.number, sent: true };
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
