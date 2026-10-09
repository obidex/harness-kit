#!/usr/bin/env node
// inbox — cross-project requests as issues (O14, K009). No dependencies.
//
//   node .harness/tools/inbox.mjs send --repo owner/name --id <stable id> --title <t> --outcome <text>
//        --source <link> --coordinator <who> --covered-by <owner decision or delegation>
//                                         file one request in the repository that does the work; the
//                                         same id twice never makes a second open issue (prints the
//                                         first; a copy filed in a race closes as its duplicate), then
//                                         wake that repository's coordinator (below); a resend of a
//                                         queued request not yet woken tries the wake again
//   node .harness/tools/inbox.mjs pending --repo owner/name     the queued requests (JSON)
//   node .harness/tools/inbox.mjs state --repo owner/name --issue <n> --to working|blocked|done
//        [--note <text>]                  move a request; `done` needs --note with the evidence and
//                                         closes the issue, `blocked` needs --note with the reason
//   node .harness/tools/inbox.mjs wake --repo owner/name --issue <n>
//                                         in Actions (harness-inbox.yml): if that issue is a queued
//                                         request not yet woken, wake the receiving coordinator
//   node .harness/tools/inbox.mjs channel --repo owner/name [--open]
//                                         is the wake channel open; --open opens it (the receiving
//                                         coordinator, once, in its own repository)
//
// The wake (K018): a comment on the repository's open wake-channel pull request (head branch
// `inbox-wake`, or `wake-channel` where the repository already keeps one; a draft never merged), which the receiving coordinator's session subscribes to, so
// it arrives as a GitHub event at no cost. "Woke" is written on the request only after GitHub
// accepted that comment; otherwise one "Not delivered" note, a non-zero exit, and a resend or the
// receiver's own `pending` check picks it up. The sender wakes: `wake` (the read-only workflow job)
// only reports when a channel is open, and fires a routine (INBOX_ROUTINE_URL, INBOX_ROUTINE_TOKEN)
// only for a project without one. Nothing ever asks a person.
//
// A request is an issue labelled `inbox`. Its body carries one hidden marker `<!-- inbox-id: … -->`
// and these lines, which only this tool edits: ID, Source, Outcome, Responsible coordinator,
// Covered by, State, Evidence. Replies and progress are comments on the issue; the sender reads the
// result there. GH_TOKEN (or the session's own GitHub access) reads and writes the issues.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LABEL = 'inbox';
export const STATES = ['queued', 'working', 'blocked', 'done'];
const FIELDS = ['ID', 'Source', 'Outcome', 'Responsible coordinator', 'Covered by', 'State', 'Evidence'];

/** The issue body for a new request. */
export function body(r) {
  for (const k of ['id', 'source', 'outcome', 'coordinator', 'coveredBy']) if (!r[k] || !String(r[k]).trim()) throw new Error(`--${k === 'coveredBy' ? 'covered-by' : k} is required`);
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(r.id)) throw new Error(`id "${r.id}" must be letters, digits, . _ - and / only`);
  const one = (s) => String(s).replace(/\s*\n\s*/g, ' ').trim();
  return [`<!-- inbox-id: ${r.id} -->`, 'A cross-project request (Harness Kit inbox, O14). Replies and progress go on this issue.', '',
    `- **ID:** ${r.id}`, `- **Source:** ${one(r.source)}`, `- **Outcome:** ${one(r.outcome)}`, `- **Responsible coordinator:** ${one(r.coordinator)}`,
    `- **Covered by:** ${one(r.coveredBy)}`, '- **State:** queued', '- **Evidence:** none yet', ''].join('\n');
}

/** The fields of a request body; null when the body is not one. */
export function parse(text) {
  const id = String(text || '').match(/<!-- inbox-id: ([^\s]+) -->/);
  if (!id) return null;
  const out = { id: id[1] };
  for (const f of FIELDS) {
    const m = text.match(new RegExp(`^- \\*\\*${f}:\\*\\* ?(.*)$`, 'm'));
    out[f] = m ? m[1].trim() : null;
  }
  return out;
}

/** The body with one field replaced. */
export function setField(text, field, value) {
  const re = new RegExp(`^(- \\*\\*${field}:\\*\\*).*$`, 'm');
  if (!re.test(text)) throw new Error(`the request has no "${field}" line`);
  return text.replace(re, `$1 ${String(value).replace(/\s*\n\s*/g, ' ').trim()}`);
}

// --- GitHub ---------------------------------------------------------------------------------------
async function api(method, path, data) {
  const r = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
    method,
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'harness-inbox',
      ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (r.status < 200 || r.status > 299) throw new Error(`${method} ${path} answered ${r.status}: ${JSON.stringify(json).slice(0, 300)}${r.status === 401 || r.status === 403 ? accessHint(path) : ''}`);
  return json;
}

/** What to do when GitHub refuses the token: in a cloud session the proxy lends credentials only for
 *  repositories attached to the session, and GH_TOKEN there is not a working token. */
export function accessHint(path) {
  const repo = (String(path).match(/^\/repos\/([\w.-]+\/[\w.-]+)/) || [])[1] || 'the repository';
  return `. The session's GitHub access does not reach ${repo}: in a cloud session attach it first (add_repo ${repo} with access "push"), then run the same command again; elsewhere set GH_TOKEN to a token that can write its issues`;
}

/** Every inbox issue of the repository, open and closed, as { number, state, url, fields }. */
export async function requests(repo) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const l = await api('GET', `/repos/${repo}/issues?labels=${LABEL}&state=all&per_page=100&page=${page}`);
    for (const i of l) { const fields = parse(i.body); if (fields && !i.pull_request) out.push({ number: i.number, state: i.state, url: i.html_url, fields }); }
    if (l.length < 100) break;
  }
  return out;
}

/** The first issue filed for each ID; later ones for the same ID are duplicates and never count. */
export function canonical(list) {
  const first = new Map();
  for (const r of [...list].sort((a, b) => a.number - b.number)) if (!first.has(r.fields.id)) first.set(r.fields.id, r);
  return [...first.values()];
}

export const WAKE_BRANCH = 'inbox-wake';
export const WAKE_BRANCHES = [WAKE_BRANCH, 'wake-channel'];   // the second: a repository's existing general wake channel
export const WOKE_MARK = '<!-- inbox-woke -->';
export const UNDELIVERED_MARK = '<!-- inbox-wake-undelivered -->';

/** Wake the receiving coordinator for one queued request, through the wake-channel pull request.
 *  Returns { delivered, where | why, already }. `call` is the GitHub API (injected by the tests). */
export async function deliver(call, repo, r) {
  const notes = [];
  for (let page = 1; page < 50; page++) {
    const cs = await call('GET', `/repos/${repo}/issues/${r.number}/comments?per_page=100&page=${page}`);
    notes.push(...cs.map((c) => String(c.body)));
    if (cs.length < 100) break;
  }
  if (notes.some((b) => b.startsWith(WOKE_MARK))) return { delivered: true, already: true };
  let why, pr = null;
  try { pr = await findChannel(call, repo); } catch (e) { why = `could not look for the wake channel (${e.message.slice(0, 120)})`; }
  if (!pr && !why) why = `no open ${WAKE_BRANCH} pull request in ${repo}`;
  if (pr) {
    let c = null;
    try { c = await call('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `Inbox wake (O14) for the ${r.fields['Responsible coordinator'] || 'receiving coordinator'}: request ${r.fields.id} is queued: ${r.url}\nRun the inbox skill (pick up queued requests); this comment needs no reply.` }); }
    catch (e) { why = `the wake comment was refused (${e.message.slice(0, 120)})`; }
    if (c && !c.id) why = 'GitHub did not return the wake comment';
    if (c?.id) {
      // delivered: the record below is best effort, and its failure never turns a delivery into a resend
      await call('POST', `/repos/${repo}/issues/${r.number}/comments`, { body: `${WOKE_MARK}\nWoke the receiving coordinator (delivered on #${pr.number}).` }).catch(() => {});
      return { delivered: true, where: `#${pr.number}` };
    }
  }
  if (!notes.some((b) => b.startsWith(UNDELIVERED_MARK))) {
    // best effort: a read-only caller (the harness-inbox job) still reports, and exits non-zero
    await call('POST', `/repos/${repo}/issues/${r.number}/comments`, { body: `${UNDELIVERED_MARK}\nNot delivered to the receiving coordinator: ${why}. Nothing is lost: the request stays queued, and the next send or the coordinator's own inbox check picks it up.` }).catch(() => {});
  }
  return { delivered: false, why };
}

/** The open wake-channel pull request of the repository, or null. */
export async function findChannel(call, repo) {
  const [owner] = repo.split('/');
  for (const b of WAKE_BRANCHES) {
    const prs = await call('GET', `/repos/${repo}/pulls?state=open&head=${owner}:${b}&per_page=1`);
    if (prs.length) return prs[0];
  }
  return null;
}

const queued = (r) => r.state === 'open' && r.fields.State === 'queued';
const pause = (ms) => new Promise((d) => setTimeout(d, ms));

/** Open the wake channel: branch `inbox-wake` off the default branch with one note, and a draft pull
 *  request from it that is never merged. Its only use is to carry wake comments. */
export async function openChannel(call, repo) {
  const r = await call('GET', `/repos/${repo}`);
  const base = r.default_branch;
  const head = await call('GET', `/repos/${repo}/git/ref/heads/${base}`);
  try { await call('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${WAKE_BRANCH}`, sha: head.object.sha }); }
  catch (e) {
    if (/ 422:/.test(e.message)) { /* the branch is already there */ }
    else throw new Error(`could not make the ${WAKE_BRANCH} branch through the API (${e.message.slice(0, 80)}); report that refused call in Found (C14); if it was a proxy refusal, not a bad token or a missing repo, push it with git instead (git push origin ${base}:refs/heads/${WAKE_BRANCH}), then run channel --open again`);
  }
  const path = '.github/INBOX_WAKE.md';
  const note = '# Inbox wake channel\n\nThis branch and its draft pull request are never merged. Each comment on the pull request\nwakes this repository\'s coordinator for a queued inbox request (Harness Kit inbox, O14, K018).\nThe coordinator subscribes to the pull request at the start of every session.\n';
  let have = null;
  try { have = await call('GET', `/repos/${repo}/contents/${path}?ref=${WAKE_BRANCH}`); } catch { /* not there yet */ }
  if (!have) await call('PUT', `/repos/${repo}/contents/${path}`, { message: 'Inbox wake channel (never merged)', content: Buffer.from(note).toString('base64'), branch: WAKE_BRANCH });
  return call('POST', `/repos/${repo}/pulls`, { title: 'Inbox wake channel (never merge)', head: WAKE_BRANCH, base, draft: true,
    body: 'Never merge this pull request. A comment on it wakes this repository\'s coordinator for a queued inbox request (Harness Kit inbox, O14, K018); the coordinator subscribes to it at the start of every session. It carries one note and no code.' });
}

// --- commands -------------------------------------------------------------------------------------
/** Print a wake result; an undelivered wake ends the command non-zero (the request itself is safe). */
function report(w) {
  if (w.already) console.log('inbox: the receiving coordinator was already woken for this request');
  else if (w.delivered) console.log(`inbox: woke the receiving coordinator (delivered on ${w.where})`);
  else { console.log(`inbox: NOT delivered: ${w.why}`); process.exitCode = 3; }
}

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

async function main() {
  const [cmd] = argv;
  const repo = opt('--repo');
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('--repo owner/name is required');
  if (cmd === 'send') {
    const r = { id: opt('--id'), source: opt('--source'), outcome: opt('--outcome'), coordinator: opt('--coordinator'), coveredBy: opt('--covered-by') };
    const text = body(r); // validates before any read
    const have = canonical(await requests(repo)).find((x) => x.fields.id === r.id);
    if (have) {
      console.log(`inbox: ${r.id} is already ${have.url} (${have.state}, ${have.fields.State}); nothing filed`);
      if (queued(have)) report(await deliver(api, repo, have));
      return;
    }
    const i = await api('POST', `/repos/${repo}/issues`, { title: opt('--title') || r.outcome.slice(0, 80), body: text, labels: [LABEL] });
    // GitHub's label listing lags a new issue by seconds, so two quick sends can both file. Look again
    // after filing: if an earlier issue carries the same ID, this one closes as its duplicate.
    for (let t = 0; t < 3; t++) {
      await pause(Number(process.env.INBOX_RECHECK_MS ?? 3000));
      const first = canonical(await requests(repo)).find((x) => x.fields.id === r.id);
      if (first && first.number < i.number) {
        await api('POST', `/repos/${repo}/issues/${i.number}/comments`, { body: `Duplicate of #${first.number} (same inbox ID ${r.id}).` });
        await api('PATCH', `/repos/${repo}/issues/${i.number}`, { state: 'closed', state_reason: 'duplicate' });
        console.log(`inbox: ${r.id} is already ${first.url}; the copy just filed (#${i.number}) is closed as its duplicate`);
        return;
      }
      if (first) break;
    }
    console.log(`inbox: filed ${r.id} as ${i.html_url}`);
    report(await deliver(api, repo, { number: i.number, url: i.html_url, fields: parse(text) }));
    return;
  }
  if (cmd === 'pending') {
    console.log(JSON.stringify(canonical(await requests(repo)).filter(queued).map((x) => ({ number: x.number, url: x.url, id: x.fields.id, outcome: x.fields.Outcome }))));
    return;
  }
  if (cmd === 'state') {
    const n = Number(opt('--issue')), to = opt('--to'), note = opt('--note');
    if (!STATES.includes(to) || to === 'queued') throw new Error(`--to must be working, blocked or done`);
    if ((to === 'done' || to === 'blocked') && !note) throw new Error(`--to ${to} needs --note (${to === 'done' ? 'the completion evidence' : 'the reason'})`);
    const i = await api('GET', `/repos/${repo}/issues/${n}`);
    const f = parse(i.body);
    if (!f) throw new Error(`#${n} is not an inbox request`);
    let text = setField(i.body, 'State', to);
    if (to === 'done') text = setField(text, 'Evidence', note);
    await api('PATCH', `/repos/${repo}/issues/${n}`, { body: text, ...(to === 'done' ? { state: 'closed', state_reason: 'completed' } : {}) });
    await api('POST', `/repos/${repo}/issues/${n}/comments`, { body: `**${to}**${note ? `: ${note}` : ''}` });
    console.log(`inbox: ${f.id} (#${n}) is ${to}`);
    return;
  }
  if (cmd === 'wake') {
    const n = Number(opt('--issue'));
    const mine = canonical(await requests(repo)).find((x) => x.number === n);
    // only a queued request wakes anyone: a request already picked up or done never re-runs the AI
    if (!mine || !queued(mine)) { console.log(`inbox: #${n} is not a queued request; nobody woken`); return; }
    // The sender wakes (send); this job only reads. A lookup this token may not make counts as no channel.
    const channel = await findChannel(api, repo).catch(() => null);
    if (channel) { console.log(`inbox: the wake channel is open (#${channel.number}); the sender's send wakes the coordinator there, and a resend tries again`); return; }
    if (!process.env.INBOX_ROUTINE_URL) { report(await deliver(api, repo, mine)); return; }
    const url = process.env.INBOX_ROUTINE_URL, token = process.env.INBOX_ROUTINE_TOKEN;
    if (!url || !token) throw new Error('pickup is not wired: open the inbox-wake channel, or set the INBOX_ROUTINE_URL and INBOX_ROUTINE_TOKEN secrets (.harness/inbox.md)');
    const base = (process.env.INBOX_FIRE_BASE || 'https://api.anthropic.com').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^${base}/v1/claude_code/routines/trig_[A-Za-z0-9]+/fire$`).test(url)) throw new Error('INBOX_ROUTINE_URL is not a routine fire URL');
    const r = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ text: `Inbox request ${mine.fields.id} is queued: ${mine.url}` }),
    });
    if (!r.ok) throw new Error(`the routine did not start: ${r.status}`);
    console.log(`inbox: fired the receiving coordinator's routine for ${mine.fields.id} (#${n}); a routine fire does not confirm the session ran`);
    return;
  }
  if (cmd === 'channel') {
    let prs = [await findChannel(api, repo)].filter(Boolean);
    if (!prs.length && argv.includes('--open')) prs = [await openChannel(api, repo)];
    if (!prs.length) { console.log(`inbox: no open ${WAKE_BRANCHES.join(' or ')} pull request in ${repo}: nobody can be woken (.harness/inbox.md "Pickup")`); process.exitCode = 3; return; }
    console.log(`inbox: the wake channel is ${prs[0].html_url}${prs[0].draft ? '' : ' (not a draft: make it one, it must never merge)'}; the coordinator subscribes to it at the start of every session`);
    return;
  }
  throw new Error('usage: inbox.mjs send|pending|state|wake|channel  (see the header of this file)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(`inbox: ${e.message}`); process.exit(1); });
}
