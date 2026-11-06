#!/usr/bin/env node
// guard — agent configuration changes come only from trusted accounts (K030, A21). No dependencies.
//
//   node .harness/tools/guard.mjs agent-config --repo owner/name --pr N --profile <base profile.json>
//
// A pull request that changes what agents load or run (CLAUDE.md, AGENTS.md, .claude/**, .harness/**,
// .mcp.json, plugin code, git hooks) passes only when its author and every commit's author and
// committer are accounts the profile's `trusted_actors` names (by numeric GitHub ID, never by login,
// which can be renamed). GitHub's own `web-flow` committer is accepted only on a commit whose author is
// trusted (a server-side branch update or a squash). The profile is read from the base branch, never
// from the pull request, so a PR cannot trust itself. A profile with no `trusted_actors` warns and
// passes: the project has not opted in yet.
//
// Run by `.github/workflows/harness-guard.yml` with the workflow's read-only token (GH_TOKEN).

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Paths whose content agents load or execute. */
export const AGENT_CONFIG = /(^|\/)(CLAUDE\.md|AGENTS\.md|CLAUDE\.local\.md|\.mcp\.json)$|(^|\/)\.claude\/|^\.harness\/|(^|\/)\.claude-plugin\/|^plugins\/|^\.githooks\/|^\.husky\//;
/** GitHub's committer for commits it makes on a user's behalf (web edits, squash, update-branch). */
export const WEB_FLOW_ID = 19864447;

/** The changed paths that are agent configuration. */
export const agentConfig = (files) => files.filter((f) => AGENT_CONFIG.test(f));

/**
 * The verdict for one pull request.
 * pr: { user: { id, login } }; commits: [{ sha, author: { id, login } | null, committer: { id, login } | null }];
 * files: [path]; trusted: [{ id, login }] | undefined.
 * Returns { touched, untrusted: [string], configured }.
 */
export function verdict({ pr, commits, files, trusted }) {
  const touched = agentConfig(files);
  const configured = Array.isArray(trusted) && trusted.length > 0;
  if (!touched.length || !configured) return { touched, untrusted: [], configured };
  const ids = new Set(trusted.map((t) => Number(t.id)));
  const ok = (a) => !!a && Number.isInteger(a.id) && ids.has(a.id);
  const who = (a) => (a ? `${a.login} (${a.id})` : 'an account GitHub cannot link to a user');
  const untrusted = [];
  if (!ok(pr.user)) untrusted.push(`the pull request was opened by ${who(pr.user)}`);
  for (const c of commits) {
    const short = String(c.sha || '').slice(0, 7);
    if (!ok(c.author)) untrusted.push(`commit ${short} is authored by ${who(c.author)}`);
    else if (!ok(c.committer) && !(c.committer && c.committer.id === WEB_FLOW_ID)) untrusted.push(`commit ${short} is committed by ${who(c.committer)}`);
  }
  return { touched, untrusted, configured };
}

// --- GitHub ---------------------------------------------------------------------------------------
async function get(path) {
  const r = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'harness-guard', ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
  });
  if (r.status !== 200) throw new Error(`GET ${path} answered ${r.status}`);
  return r.json();
}
async function all(path, cap) {
  const out = [];
  for (let page = 1; page <= cap; page++) {
    const l = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...l);
    if (l.length < 100) return out;
  }
  // a PR larger than GitHub lists (3,000 files, 250 commits) is refused rather than judged in part
  throw new Error(`${path} has more than ${cap * 100} entries; refusing to judge it in part`);
}

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const summary = (line) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`); };

async function main() {
  if (argv[0] !== 'agent-config') throw new Error('usage: guard.mjs agent-config --repo owner/name --pr N --profile <base profile.json>');
  const repo = opt('--repo'), n = opt('--pr'), profilePath = opt('--profile');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !/^\d+$/.test(n || '')) throw new Error('--repo owner/name and --pr N are required');
  let trusted;
  if (profilePath && existsSync(profilePath)) trusted = JSON.parse(readFileSync(profilePath, 'utf8')).trusted_actors;
  const [pr, files, commits] = await Promise.all([get(`/repos/${repo}/pulls/${n}`), all(`/repos/${repo}/pulls/${n}/files`, 30), all(`/repos/${repo}/pulls/${n}/commits`, 3)]);
  const v = verdict({ pr, commits, files: files.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean)), trusted });
  if (!v.touched.length) { console.log('guard: no agent configuration changed'); summary('- No agent configuration changed.'); return; }
  const list = v.touched.slice(0, 20).join(', ') + (v.touched.length > 20 ? ` and ${v.touched.length - 20} more` : '');
  if (!v.configured) {
    console.log(`::warning::guard: agent configuration changed (${list}) but the base branch's profile names no trusted_actors, so the authors are not checked (K030)`);
    summary(`- Agent configuration changed (${list}); **not checked**: the profile names no \`trusted_actors\`.`);
    return;
  }
  if (v.untrusted.length) {
    for (const u of v.untrusted) console.log(`guard: FAIL ${u}`);
    console.log(`guard: FAIL agent configuration changed (${list}) by an account the profile does not trust`);
    summary(`- **FAIL**: agent configuration changed (${list}) by an account the profile does not trust:`);
    for (const u of v.untrusted) summary(`  - ${u}`);
    process.exit(1);
  }
  console.log(`guard: agent configuration changed (${list}); the author and all ${commits.length} commit(s) are trusted`);
  summary(`- Agent configuration changed (${list}); the author and all ${commits.length} commit(s) are trusted accounts.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(`guard: ${e.message}`); process.exit(1); });
}
