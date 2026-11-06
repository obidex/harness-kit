#!/usr/bin/env node
// test-guard — the supply-chain floor (K030): harness-guard, its trusted-author check, and the audit's
// A17-A22 checks, offline.
//
//   node tools/test-guard.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { verdict, agentConfig, WEB_FLOW_ID, DEPENDABOT_ID } from '../.harness/tools/guard.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

const kit = new URL('..', import.meta.url).pathname;
let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-guard: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-guard: ok ${n}. ${what}`); };

// --- which paths are agent configuration -------------------------------------------------------------
const paths = ['CLAUDE.md', 'AGENTS.md', 'apps/web/CLAUDE.md', '.claude/settings.json', '.claude/skills/x/SKILL.md', 'pkg/.claude/hooks/a.sh',
  '.harness/core.md', '.mcp.json', '.claude-plugin/plugin.json', 'plugins/tools/hooks/register.js', '.githooks/pre-commit', '.husky/pre-push',
  '.github/workflows/harness-guard.yml', '.github/dependabot.yml', '.gitleaks.toml'];
ok(agentConfig(paths).length === paths.length, 'every agent-loaded or agent-run path counts (entry files, .claude, .harness, MCP, plugins, hooks)');
ok(agentConfig(['src/app.js', 'docs/CLAUDE.md.bak', 'README.md', 'docs/.github/x', 'notCLAUDE.md', 'tools/.harnessy']).length === 0, 'ordinary files do not count');

// --- the verdict ---------------------------------------------------------------------------------------
const owner = { id: 144545793, login: 'owner' }, app = { id: 999, login: 'hands[bot]' }, stranger = { id: 5, login: 'stranger' };
const trusted = [owner, app];
const c = (sha, author, committer = author) => ({ sha, author, committer });
const base = { pr: { user: owner }, commits: [c('a1', owner)], files: ['.claude/settings.json'], trusted };
ok(verdict(base).untrusted.length === 0, 'the owner changing agent configuration passes');
ok(verdict({ ...base, pr: { user: app }, commits: [c('b1', app)] }).untrusted.length === 0, 'the hands App (a kit update) passes');
ok(verdict({ ...base, pr: { user: stranger } }).untrusted.some((u) => u.includes('opened by stranger (5)')), 'a PR opened by another account fails');
ok(verdict({ ...base, commits: [c('a1', owner), c('c2', stranger)] }).untrusted.some((u) => u.includes('c2') && u.includes('authored')), 'one untrusted commit among trusted ones fails');
ok(verdict({ ...base, commits: [c('d3', null)] }).untrusted.some((u) => u.includes('cannot link')), 'a commit GitHub cannot link to an account fails');
ok(verdict({ ...base, commits: [c('e4', owner, { id: WEB_FLOW_ID, login: 'web-flow' })] }).untrusted.length === 0, 'GitHub web-flow committing for a trusted author (update-branch, squash) passes');
ok(verdict({ ...base, commits: [c('f5', stranger, { id: WEB_FLOW_ID, login: 'web-flow' })] }).untrusted.length > 0, 'web-flow does not launder an untrusted author');
ok(verdict({ ...base, commits: [c('g6', owner, stranger)] }).untrusted.some((u) => u.includes('committed by stranger')), 'an untrusted committer fails');
ok(verdict({ ...base, pr: { user: stranger }, files: ['src/a.js'] }).untrusted.length === 0, 'anyone may change ordinary files: only agent configuration is guarded');
ok(verdict({ ...base, pr: { user: { id: '144545793', login: 'owner' } } }).untrusted.length > 0, 'an ID is compared as a number, never as text');
const dep = { id: DEPENDABOT_ID, login: 'dependabot[bot]' }, flow = { id: WEB_FLOW_ID, login: 'web-flow' };
ok(verdict({ pr: { user: dep }, commits: [c('d1', dep, flow)], files: ['.github/workflows/ci.yml', 'package-lock.json'], trusted }).untrusted.length === 0, 'Dependabot moving action pins passes (A18 needs it)');
ok(verdict({ pr: { user: dep }, commits: [c('d1', dep, flow)], files: ['.github/workflows/ci.yml', '.claude/settings.json'], trusted }).untrusted.length > 0, 'Dependabot touching anything else of agent configuration fails');
ok(verdict({ pr: { user: dep }, commits: [c('d1', dep, flow), c('d2', stranger)], files: ['.github/workflows/ci.yml'], trusted }).untrusted.length > 0, 'a Dependabot PR with someone else\'s commit on it fails');
ok(verdict({ pr: { user: stranger }, commits: [c('d1', dep, flow)], files: ['.github/workflows/ci.yml'], trusted }).untrusted.length > 0, 'Dependabot commits in a PR someone else opened are not trusted');
const off = verdict({ ...base, pr: { user: stranger }, trusted: undefined });
ok(!off.configured && off.untrusted.length === 0 && off.touched.length === 1, 'a profile without trusted_actors is reported as not configured, never as trusted');

// --- the command, against a fake GitHub ------------------------------------------------------------
const files = (k) => Array.from({ length: k }, (_, i) => ({ filename: i === 0 ? '.claude/settings.json' : `src/f${i}.js` }));
let state = {};
const srv = await new Promise((done) => {
  const s = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    const page = Number(u.searchParams.get('page') || 1);
    const slice = (l) => l.slice((page - 1) * 100, page * 100);
    if (u.pathname === '/repos/o/r/pulls/1') return send(200, { user: state.user, commits: state.total ?? state.commits.length });
    if (u.pathname === '/repos/o/r/pulls/1/files') return send(200, slice(state.files));
    if (u.pathname === '/repos/o/r/pulls/1/commits') return send(200, slice(state.commits.slice(0, 250))); // GitHub lists at most 250
    return send(404, {});
  });
  s.listen(0, '127.0.0.1', () => done(s));
});
const dir = mkdtempSync(join(tmpdir(), 'guard-'));
const profile = join(dir, 'profile.json');
writeFileSync(profile, JSON.stringify({ trusted_actors: trusted }));
const run = (args) => new Promise((done) => execFile(process.execPath, [join(kit, '.harness/tools/guard.mjs'), 'agent-config', '--repo', 'o/r', '--pr', '1', ...args],
  { env: { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${srv.address().port}`, GH_TOKEN: 't', GITHUB_STEP_SUMMARY: '' } }, (err, stdout, stderr) => done({ code: err ? err.code : 0, stdout, stderr })));
state = { user: owner, files: files(3), commits: [c('a1', owner)] };
let r = await run(['--profile', profile]);
ok(r.code === 0 && /trusted/.test(r.stdout), 'command: a trusted PR passes');
state = { user: stranger, files: files(3), commits: [c('a1', stranger)] };
r = await run(['--profile', profile]);
ok(r.code === 1 && /FAIL/.test(r.stdout), 'command: an untrusted PR touching .claude fails the check');
state = { user: stranger, files: [{ filename: 'src/a.js', previous_filename: 'CLAUDE.md' }], commits: [c('a1', stranger)] };
r = await run(['--profile', profile]);
ok(r.code === 1, 'command: renaming CLAUDE.md away counts as changing it');
state = { user: owner, files: files(250), commits: [c('a1', owner), c('h7', stranger)] };
r = await run(['--profile', profile]);
ok(r.code === 1 && /h7/.test(r.stdout), 'command: every page of files is read, and the second commit is judged');
state = { user: stranger, files: files(3), commits: [c('a1', stranger)] };
r = await run(['--profile', join(dir, 'none.json')]);
ok(r.code === 0 && /::warning::/.test(r.stdout), 'command: without a profile the guard warns and passes (not adopted yet)');
state = { user: owner, files: files(3), commits: [...Array.from({ length: 259 }, (_, i) => c(`x${i}`, owner)), c('z9', stranger)] };
r = await run(['--profile', profile]);
ok(r.code === 1 && /260 commits but GitHub listed 250/.test(r.stdout + r.stderr), 'command: a PR longer than the 250 commits GitHub lists is refused, never judged in part');
srv.close();

// --- the template ------------------------------------------------------------------------------------
const tplDir = join(kit, '.harness/templates/workflows');
const text = readFileSync(join(tplDir, 'harness-guard.yml'), 'utf8');
const wf = parseYaml(text);
const job = wf.jobs['harness-guard'];
ok(wf.name === 'harness-guard' && job.name === 'harness-guard' && Object.keys(wf.on).join() === 'pull_request' && wf.on.pull_request.types.includes('edited'), 'the required check is named harness-guard, runs on pull_request only, and again when the PR is edited (a changed base)');
ok(JSON.stringify(wf.permissions) === '{"contents":"read"}' && job.permissions['pull-requests'] === 'read' && !Object.values(job.permissions).includes('write'), 'read-only token');
const [baseCo, prCo] = job.steps.filter((s) => /actions\/checkout/.test(s.uses || ''));
ok(baseCo.with.ref === '${{ github.event.pull_request.base.sha }}' && baseCo.with.path === 'base', 'the guard, its gitleaks config and the trusted list come from the base commit');
ok(String(prCo.with['persist-credentials']) === 'false' && String(baseCo.with['persist-credentials']) === 'false', 'no checkout keeps credentials');
const scan = job.steps.find((s) => /gitleaks/.test(s.name || '')).run;
ok(/sha256sum -c -/.test(scan) && /sum=[0-9a-f]{64}/.test(scan) && /v=\d+\.\d+\.\d+/.test(scan), 'gitleaks is a pinned version, checked against its SHA-256 before it runs');
ok(/--config "\$cfg"/.test(scan) && /base\/\.gitleaks\.toml/.test(scan) && !/pr\/\.gitleaks/.test(scan), 'gitleaks never takes its config from the PR');
ok(/--log-opts="\$\{BASE\}\.\.\$\{HEAD\}"/.test(scan) && /--exit-code 1/.test(scan) && /--redact/.test(scan), 'only the PR\'s own commits are scanned, a finding fails, and the secret is redacted from the log');
const agent = job.steps.find((s) => /trusted accounts/.test(s.name || '')).run;
ok(/node base\/\.harness\/tools\/guard\.mjs agent-config/.test(agent) && /--profile base\/\.harness\/profile\.json/.test(agent) && !/node pr\//.test(text), 'the trusted-author check runs the base branch\'s guard against the base branch\'s profile; nothing of the PR runs');

// --- every kit workflow template and the kit's own workflows follow A18 and A19 ------------------------
const all = [...readdirSync(tplDir).map((f) => join(tplDir, f)), ...readdirSync(join(kit, '.harness/templates/hands')).map((f) => join(kit, '.harness/templates/hands', f)),
  ...readdirSync(join(kit, '.github/workflows')).map((f) => join(kit, '.github/workflows', f))];
for (const f of all) {
  const t = readFileSync(f, 'utf8'), w = parseYaml(t);
  const uses = [...t.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1]).filter((u) => !u.startsWith('./'));
  ok(uses.every((u) => /@[0-9a-f]{40}$/.test(u)) && !('pull_request_target' in (w.on || {})) && w.permissions !== undefined && !Object.values(w.permissions || {}).includes('write'),
    `${f.slice(kit.length)}: actions pinned by commit, no pull_request_target, read-only workflow permissions`);
}

// --- the audit's K030 checks on a throwaway project ------------------------------------------------------
const proj = mkdtempSync(join(tmpdir(), 'guard-audit-'));
const put = (p, s) => { mkdirSync(join(proj, p, '..'), { recursive: true }); writeFileSync(join(proj, p), s); };
const git = (...a) => execFileSync('git', ['-C', proj, ...a], { stdio: 'ignore' });
git('init', '-q');
const audit = () => {
  git('add', '-A');
  const out = JSON.parse((() => { const f = join(proj, '..', `${proj.split('/').pop()}.json`); execFileSync(process.execPath, [join(kit, '.harness/tools/audit.mjs'), proj, '--json', f], { stdio: 'ignore' }); return readFileSync(f, 'utf8'); })());
  return Object.fromEntries(out.results.filter((x) => /^A(1[7-9]|2[0-2])$/.test(x.id)).map((x) => [x.id, x]));
};
const prof = JSON.parse(readFileSync(join(kit, 'examples/profile.example.json'), 'utf8'));
put('.harness/profile.json', JSON.stringify(prof));
put('package.json', '{}');
put('.github/workflows/ci.yml', 'name: ci\non: pull_request\npermissions:\n  contents: write\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm install\n');
put('.github/workflows/t.yml', 'name: t\non:\n  pull_request_target:\npermissions: read-all\njobs:\n  t:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: true\n');
let a = audit();
ok(['A17', 'A20'].every((id) => a[id].result === 'UNKNOWN' && /not adopted yet/.test(a[id].evidence)), 'before a project names trusted_actors, a K030 FAIL reads UNKNOWN (a kit update never turns its audit red)');
put('.harness/profile.json', JSON.stringify({ ...prof, trusted_actors: trusted }));
a = audit();
ok(a.A17.result === 'FAIL' && /dependabot/.test(a.A17.evidence) && /min-release-age/.test(a.A17.evidence) && /npm install in \.github\/workflows\/ci\.yml/.test(a.A17.evidence), 'A17 fails: no Dependabot cooldown, no min-release-age, npm install in CI');
ok(a.A18.result === 'FAIL' && /actions\/checkout@v4/.test(a.A18.evidence), 'A18 fails on an action pinned by tag');
ok(a.A19.result === 'FAIL' && /pull_request_target/.test(a.A19.evidence) && /ci\.yml: workflow-level permissions grant writes/.test(a.A19.evidence), 'A19 fails on pull_request_target and write permissions at the top');
ok(a.A20.result === 'FAIL' && a.A21.result === 'FAIL', 'A20 and A21 fail without harness-guard installed');
put('.github/dependabot.yml', 'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: weekly\n    cooldown:\n      default-days: 5\n  - package-ecosystem: github-actions\n    directory: /\n    schedule:\n      interval: weekly\n    cooldown:\n      default-days: 3\n');
put('.npmrc', 'min-release-age=3\n');
put('.github/workflows/ci.yml', 'name: ci\non: pull_request\npermissions:\n  contents: read\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n      - run: npm ci\n      - run: npm install -g npm@11\n');
put('.github/workflows/t.yml', 'name: t\non:\n  pull_request:\npermissions: {}\njobs:\n  t:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: true\n');
put('.github/workflows/harness-guard.yml', text);
a = audit();
ok(a.A17.result === 'PASS', `A17 passes with cooldowns of 3-7 days, min-release-age and npm ci (a global tool install is allowed) (${a.A17.evidence})`);
ok(a.A18.result === 'PASS' && a.A21.result === 'PASS', 'A18 passes once every action is pinned; A21 once the guard is installed and trusted_actors named');
ok(a.A19.result === "UNKNOWN" && /whether the repository is public/.test(a.A19.evidence), `${a.A19.result} ${a.A19.evidence}: ` + 'A19: a job may ask for writes; without the API, public or not is UNKNOWN, never PASS');
put('.github/dependabot.yml', 'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: weekly\n    cooldown:\n      default-days: 1\n');
ok(audit().A17.result === 'FAIL', 'A17 fails on a cooldown under 3 days');
// A19 on a public repository: the kit's `vars.RUNNER` lane, read through the API (offline fake)
{
  let st = {};
  const api = await new Promise((done) => {
    const s = createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (u.pathname === '/repos/o/r') return send(200, { private: !!st.private, owner: { type: st.org ? 'Organization' : 'User' } });
      if (u.pathname === '/repos/o/r/interaction-limits') return st.private ? send(405, {}) : send(200, st.limit ? { limit: st.limit, expires_at: '2027-04-09T00:00:00Z' } : {});
      if (u.pathname === '/repos/o/r/actions/variables/RUNNER') return send(st.repoVar, st.repoVar === 200 ? { name: 'RUNNER', value: 'self-hosted' } : {});
      if (u.pathname === '/repos/o/r/actions/organization-variables') return send(st.orgCode ?? 200, { total_count: st.orgTotal ?? (st.orgVars || []).length, variables: st.orgVars || [] });
      return send(404, {});
    });
    s.listen(0, '127.0.0.1', () => done(s));
  });
  put('.github/workflows/t.yml', "name: t\non:\n  pull_request:\npermissions: {}\njobs:\n  t:\n    runs-on: ${{ vars.RUNNER || 'ubuntu-latest' }}\n    timeout-minutes: 5\n    steps:\n      - run: true\n");
  git('add', '-A');
  const a19 = async (s) => {
    st = s;
    const f = join(tmpdir(), `a19-${n}.json`);
    await new Promise((done) => execFile(process.execPath, [join(kit, '.harness/tools/audit.mjs'), proj, '--repo', 'o/r', '--json', f], { env: { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${api.address().port}`, GITHUB_TOKEN: 't' } }, () => done()));
    return JSON.parse(readFileSync(f, 'utf8')).results.find((x) => x.id === (s.rule || 'A19'));
  };
  ok((await a19({ repoVar: 404 })).result === 'PASS', 'A19: a public repository whose RUNNER variable is not set passes (the kit lane runs GitHub-hosted)');
  ok((await a19({ repoVar: 200 })).result === 'FAIL', 'A19: a public repository with RUNNER set fails');
  ok((await a19({ repoVar: 403 })).result === 'UNKNOWN', 'A19: an unreadable RUNNER variable is UNKNOWN, never PASS');
  ok((await a19({ repoVar: 404, org: true, orgVars: [{ name: 'RUNNER' }] })).result === 'FAIL', 'A19: an organisation-level RUNNER fails though the repository has none');
  ok((await a19({ repoVar: 404, org: true, orgCode: 403 })).result === 'UNKNOWN', 'A19: unreadable organisation variables are UNKNOWN');
  ok((await a19({ repoVar: 404, org: true, orgVars: [{ name: 'X' }], orgTotal: 31 })).result === 'UNKNOWN', 'A19: an organisation list longer than one page is UNKNOWN, never clear');
  ok((await a19({ rule: 'A22', repoVar: 404, private: true })).result === 'NOT APPLICABLE', 'A22: a private repository is not applicable (GitHub answers 405 there), never UNKNOWN');
  ok((await a19({ rule: 'A22', repoVar: 404 })).result === 'PASS', 'A22: a public repository with no live limit and none declared passes');
  ok((await a19({ rule: 'A22', repoVar: 404, limit: 'collaborators_only' })).result === 'FAIL', 'A22: a live limit the settings file does not declare fails (it would lapse)');
  api.close();
}
rmSync(proj, { recursive: true, force: true });
rmSync(dir, { recursive: true, force: true });

console.log(`test-guard: OK · ${n} checks`);
