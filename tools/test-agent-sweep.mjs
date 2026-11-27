#!/usr/bin/env node
// test-agent-sweep — the agent sweep trial (K075), offline: the settings file, the module, the guard
// hook (paths, links, tools), the agent's environment, the answer, the record and its money, the issues,
// the command line's plan, and the template's shape. The SDK itself is not installed here.
//
//   node tools/test-agent-sweep.mjs        exit 0 = every case held

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settingsOf, scope, inside, refusal, hookFor, childEnv, federated, task, answerOf, safe, stateOf, spentOf, recordBody, findingsIssue, prepare, file,
  MARK, TITLE, TRIAL_USD, RUN_USD, OVERSHOOT, MIN_RUN, TOOLS, MAX_FILES, SDK_VERSION, MODEL, EFFORT } from '../.harness/tools/agent-sweep.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-agent-sweep: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-agent-sweep: ok ${n}. ${what}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const ROOT = new URL('..', import.meta.url).pathname;
const NOW = Date.parse('2026-11-27T10:00:00Z');
const IDS = { federation_rule: 'fdrl_01Abc', organization: '0123abcd-0000-4000-8000-0123456789ab', service_account: 'svac_01Xyz', workspace: 'wrkspc_01Def' };
const FILE = (o = {}) => JSON.stringify({ until: '2026-12-22T23:59+03:00', command: 'The owner\'s command of 22 Nov 2026', ...IDS, ...o });
const BOT = { user: { login: 'github-actions[bot]', type: 'Bot' } };

// --- the settings file ----------------------------------------------------------------------------
const on = settingsOf(FILE(), NOW);
ok(on.on && on.usd === TRIAL_USD && on.ids.rule === 'fdrl_01Abc' && on.ids.workspace === 'wrkspc_01Def' && on.until === '2026-12-22T20:59:00.000Z', 'a complete settings file with an end time ahead switches the trial on, at the code\'s cap');
ok(settingsOf(FILE({ usd: 12 }), NOW).usd === 12 && settingsOf(FILE({ usd: 500 }), NOW).usd === TRIAL_USD, '`usd` in the file may lower the trial\'s cap, never raise it');
ok(!settingsOf(null, NOW).on && /missing/.test(settingsOf(null, NOW).why), 'no settings file: off');
ok(!settingsOf('{', NOW).on && !settingsOf('[]', NOW).on, 'a file that is not one JSON object: off');
ok(!settingsOf(FILE({ command: '' }), NOW).on && /command/.test(settingsOf(FILE({ command: '' }), NOW).why), 'an end time without the owner\'s command line: off');
ok(!settingsOf(FILE({ extra: 'x' }), NOW).on && /unknown setting/.test(settingsOf(FILE({ extra: 'x' }), NOW).why), 'an unknown key: off');
ok(!settingsOf(FILE({ usd: '30' }), NOW).on, 'a cap given as text: off');
ok(['federation_rule', 'organization', 'service_account', 'workspace'].every((k) => !settingsOf(FILE({ [k]: 'nope' }), NOW).on), 'a missing or malformed federation identifier: off');
ok(!settingsOf(FILE(), Date.parse('2026-12-22T21:00:00Z')).on && /ended/.test(settingsOf(FILE(), Date.parse('2026-12-22T21:00:00Z')).why), 'past 22 Dec 23:59 Damascus the trial is off by itself');
ok(!settingsOf(FILE({ until: '2027-03-01T00:00+03:00' }), NOW).on && !settingsOf(FILE({ until: 'off' }), NOW).on && !settingsOf(FILE({ until: '2026-12-22' }), NOW).on, 'an end time too far ahead, "off" or without a time and offset: off');

// --- the module -----------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'agent-sweep-'));
const repo = join(tmp, 'repo');
mkdirSync(join(repo, 'tools'), { recursive: true }); mkdirSync(join(repo, 'web'), { recursive: true });
writeFileSync(join(repo, 'tools/a.mjs'), 'export const a = 1;\n'); writeFileSync(join(repo, 'tools/b.mjs'), 'export const b = 2;\n');
writeFileSync(join(repo, 'tools/.env'), 'TOKEN=x\n'); writeFileSync(join(repo, 'tools/README.md'), '# tools\n'); writeFileSync(join(repo, 'web/c.js'), 'x\n');
writeFileSync(join(repo, 'secret-outside.txt'), 'outside\n');
symlinkSync('../web/c.js', join(repo, 'tools/link.js'));
const stat = (p) => lstatSync(join(repo, p));
const tracked = ['tools/a.mjs', 'tools/b.mjs', 'tools/.env', 'tools/README.md', 'tools/link.js', 'web/c.js'];
const m = scope({ paths: tracked, only: ['tools'], stat });
ok(m.files.join() === 'tools/README.md,tools/a.mjs,tools/b.mjs' && m.skipped.some(([p, w]) => p === 'tools/.env' && /secret/.test(w)) && m.skipped.some(([p]) => p === 'tools/link.js'),
  'the module is the tracked files under its paths: a file that may hold a secret and a symbolic link are left out, a document is kept (it may hold the rules)');
ok(throws(() => scope({ paths: tracked, only: [], stat }), /name the module/) && throws(() => scope({ paths: tracked, only: ['nothing'], stat }), /no tracked file/), 'no module named, or one with no file: refused');
ok(throws(() => scope({ paths: Array.from({ length: MAX_FILES + 1 }, (_, i) => `tools/a.mjs#${i}`).map(() => 'tools/a.mjs'), only: ['tools'], stat }), /smaller module/), 'more than one module\'s worth of files: refused');

// --- the guard ------------------------------------------------------------------------------------
const outside = join(tmp, 'elsewhere'); mkdirSync(outside); writeFileSync(join(outside, 'token'), 'jwt');
symlinkSync(outside, join(repo, 'escape'));
ok(inside(repo, 'tools/a.mjs') && inside(repo, join(repo, 'tools/b.mjs')) && inside(repo, '.') && inside(repo, 'tools/not-yet.mjs'), 'files of the checkout, by relative or absolute path, are inside');
ok(!inside(repo, '../elsewhere/token') && !inside(repo, join(outside, 'token')) && !inside(repo, '/proc/1/environ') && !inside(repo, '~/.ssh/id_rsa') && !inside(repo, ''), 'a step up, an absolute path elsewhere, /proc, the home folder and an empty path are outside');
ok(!inside(repo, 'escape/token') && !inside(repo, 'escape/new-file'), 'a symbolic link inside the checkout that points out is followed and refused, also for a file that does not exist yet');
ok(refusal(repo, 'Read', { file_path: 'tools/a.mjs' }) === null && refusal(repo, 'Grep', { pattern: 'x' }) === null && refusal(repo, 'Grep', { pattern: 'x', path: 'tools', glob: '*.mjs' }) === null && refusal(repo, 'Glob', { pattern: 'tools/**/*.mjs' }) === null,
  'Read, Grep and Glob inside the checkout run');
ok(['Bash', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'NotebookEdit', 'mcp__x__y', 'Skill', undefined].every((t) => /not available/.test(refusal(repo, t, {}))), 'every other tool is refused, whatever the session offers');
ok(/inside this repository/.test(refusal(repo, 'Read', { file_path: join(outside, 'token') })) && /inside this repository/.test(refusal(repo, 'Grep', { pattern: 'x', path: '/' })) && /inside this repository/.test(refusal(repo, 'Glob', { pattern: '*', path: '..' })),
  'Read, Grep or Glob pointed outside the checkout are refused');
ok(/file_path/.test(refusal(repo, 'Read', {})) && /file_path/.test(refusal(repo, 'Read', null)), 'Read without a path is refused');
ok(/search pattern/.test(refusal(repo, 'Glob', { pattern: '/etc/**' })) && /search pattern/.test(refusal(repo, 'Glob', { pattern: '../**' })) && /search pattern/.test(refusal(repo, 'Glob', { pattern: '~/**' })) && /search pattern/.test(refusal(repo, 'Grep', { pattern: 'x', glob: '../../**' })),
  'a search pattern that is absolute, steps up or names the home folder is refused');
ok(/git's own folder/.test(refusal(repo, 'Read', { file_path: '.git/config' })) && /git's own folder/.test(refusal(repo, 'Grep', { pattern: 'x', path: '.git' })), 'git\'s own folder is not read');
const deny = await hookFor(repo)({ tool_name: 'Bash', tool_input: { command: 'env' } });
const allow = await hookFor(repo)({ tool_name: 'Read', tool_input: { file_path: 'tools/a.mjs' } });
ok(deny.hookSpecificOutput?.permissionDecision === 'deny' && deny.hookSpecificOutput.hookEventName === 'PreToolUse' && JSON.stringify(allow) === '{}', 'the hook answers deny with its reason, and nothing for an allowed call');

// --- the agent's process --------------------------------------------------------------------------
const env = childEnv({ dir: '/run/x', ids: on.ids, idFile: '/run/x/id/token', path: '/usr/bin', proxy: { GH_TOKEN: 'ghs_secret', HTTPS_PROXY: 'http://p:3128', ANTHROPIC_API_KEY: 'k' } });
ok(env.ANTHROPIC_FEDERATION_RULE_ID === 'fdrl_01Abc' && env.ANTHROPIC_IDENTITY_TOKEN_FILE === '/run/x/id/token' && env.CLAUDE_CONFIG_DIR === '/run/x/config' && env.HOME === '/run/x/home' && env.HTTPS_PROXY === 'http://p:3128',
  'the agent\'s environment carries the federation, its own home and config folders, and a proxy if the runner has one');
ok(!Object.keys(env).some((k) => /GH_TOKEN|GITHUB_TOKEN|ACTIONS_|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH/.test(k)), 'it never carries a GitHub token, the identity request token, an API key or another sign-in');
ok(federated('Profile: env-quad · org …ab · rule …Abc') && !federated('Login method: Claude API account') && !federated('Auth token: ANTHROPIC_AUTH_TOKEN') && !federated(''), 'the run starts only when Claude Code names the federation as its sign-in');
ok(TOOLS.join() === 'Read,Grep,Glob' && MODEL === 'claude-opus-5-5' && EFFORT === 'high' && /^\d+\.\d+\.\d+$/.test(SDK_VERSION), 'read-only tools, Opus at high effort, a pinned SDK version');
const lock = JSON.parse(readFileSync(join(ROOT, '.harness/tools/agent-sdk/package-lock.json'), 'utf8'));
const pkgs = Object.entries(lock.packages).filter(([k]) => k);
ok(JSON.parse(readFileSync(join(ROOT, '.harness/tools/agent-sdk/package.json'), 'utf8')).dependencies['@anthropic-ai/claude-agent-sdk'] === SDK_VERSION && pkgs.length === 2
  && pkgs.every(([k, v]) => /^node_modules\/@anthropic-ai\/claude-agent-sdk(-linux-x64)?$/.test(k) && v.version === SDK_VERSION && /^sha512-/.test(v.integrity) && /^https:\/\/registry\.npmjs\.org\//.test(v.resolved)),
  'the lock holds exactly the pinned SDK and its Linux x64 binary, each with its integrity hash from the npm registry');
ok(/exact reproduction/.test(task(['tools/a.mjs'])) && /- tools\/a\.mjs/.test(task(['tools/a.mjs'])) && /suspected/.test(task(['x'])), 'the task names the module and the proof rule (an exact reproduction, else suspected)');

// --- the answer -----------------------------------------------------------------------------------
const reply = 'Read it all.\n```json\n{"findings":[{"severity":"major","proof":"reproduced","path":"tools/a.mjs","line":1,"title":"t","why":"w","reproduction":"r"},{"severity":"odd","proof":"maybe","path":"tools/b.mjs","line":-3,"title":"t2","why":"w2"}],"read":["tools/a.mjs"],"notes":"n"}\n```';
const a = answerOf(reply);
ok(a.findings.length === 2 && a.findings[0].proof === 'reproduced' && a.findings[1].severity === 'minor' && a.findings[1].proof === 'suspected' && a.findings[1].line === null && a.read[0] === 'tools/a.mjs', 'the answer\'s last json block is read field by field; unknown values fall to minor and suspected');
ok(answerOf('no block') === null && answerOf('```json\n{bad\n```') === null && answerOf('```json\n{"x":1}\n```') === null, 'no block, bad JSON or no findings list: no readable answer');

// --- text that may reach an issue -----------------------------------------------------------------
const leaky = 'see eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyZXBvOngifQ.c2lnbmF0dXJlLXZhbHVl and sk-ant-oat02-abcdefghijk and ghs_abcdefghijklmnopqrstuvwxyz012345 @owner <!-- x -->';
const s1 = safe(leaky);
ok(!/eyJhbGci|sk-ant-oat|ghs_abc/.test(s1) && /\[removed: looked like a token or key\]/.test(s1) && !/(^|\s)@owner/.test(s1) && !/<!--/.test(s1), 'issue text loses anything shaped like a token or key, mentions and HTML comments');

// --- the record and its money ---------------------------------------------------------------------
const st = { v: 1, runs: [{ id: '1', at: '2026-11-27T08:00:00Z', paths: ['tools/a.mjs'], reserve: 18, usd: 4.5, status: 'success' }, { id: '2', at: '2026-11-27T09:00:00Z', paths: ['tools/a.mjs'], reserve: 10, usd: null, status: 'running' }, { id: '3' }] };
ok(spentOf(st) === 4.5 + 10 + RUN_USD + OVERSHOOT, 'used = each run\'s cost, a run without one at its reserve, an unreadable run at the most a run can take');
const body = recordBody(st, 30);
ok(body.startsWith(`<!-- ${MARK} {`) && stateOf({ ...BOT, body, title: TITLE }).runs.length === 3, 'the record carries its state on its first line');
ok(stateOf({ user: { login: 'obidex', type: 'User' }, body }) === null && stateOf({ ...BOT, body: `x\n${body}` }) === null && stateOf({ ...BOT, body, pull_request: {} }) === null, 'a record written by anyone but the job\'s account, or not on the first line, is no record');

// --- prepare and file, against a GitHub in memory -------------------------------------------------
function hub({ priv = true, issues = [] } = {}) {
  const calls = [];
  let next = 100;
  const gh = async (method, path, data) => {
    calls.push([method, path, data]);
    if (method === 'GET' && /^\/repos\/o\/r$/.test(path)) return { private: priv };
    if (method === 'GET' && /\/issues\?/.test(path)) return path.includes('page=1') || !path.includes('page=') ? issues : [];
    if (method === 'POST' && path === '/repos/o/r/issues') { const i = { number: next++, title: data.title, body: data.body, ...BOT, state: 'open' }; issues.unshift(i); return i; }
    const m = path.match(/\/issues\/(\d+)$/);
    if (method === 'PATCH' && m) { const i = issues.find((x) => x.number === Number(m[1])); Object.assign(i, data); return i; }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { gh, calls, issues };
}
let h = hub();
let p = await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '7-1', now: NOW });
ok(p.go && p.budget === RUN_USD && p.ids.rule === 'fdrl_01Abc' && h.issues.length === 1 && stateOf(h.issues[0]).runs[0].reserve === RUN_USD + OVERSHOOT, 'prepare opens the record and writes the run\'s reserve (budget plus overshoot) before anything is spent');
p = await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '8-1', now: NOW });
ok(p.go && p.budget === Math.round((TRIAL_USD - (RUN_USD + OVERSHOOT) - OVERSHOOT) * 100) / 100, 'a second run while the first still reserves gets only what is left of the trial\'s cap');
p = await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '9-1', now: NOW });
ok(!p.go && /used up/.test(p.why), 'when what is left is under a run\'s minimum, nothing starts');
h.issues[0].state = 'closed';
p = await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '9-2', now: NOW });
ok(!p.go && h.issues.length === 1, 'closing the record opens no new money: the trial is one time only');
h = hub({ priv: false });
p = await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '1-1', now: NOW });
ok(!p.go && /public/.test(p.why) && !h.calls.some(([m]) => m === 'POST'), 'a public repository: refused before any issue is written');
h = hub();
p = await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE({ command: '' }), paths: ['tools/a.mjs'], runId: '1-1', now: NOW });
ok(!p.go && h.calls.length === 0, 'switched off: nothing is read or written');

h = hub();
await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '7-1', now: NOW });
const result = { paths: ['tools/a.mjs'], status: 'success', turns: 31, usd: 3.21, costKnown: true, answer: a, text: '' };
let f = await file({ gh: h.gh, repo: 'o/r', runId: '7-1', result, sha: 'abcdef1234', settingsText: FILE(), now: NOW });
const runIssue = h.issues.find((i) => i.number === f.issue);
ok(f.usd === 3.21 && spentOf(stateOf(h.issues.find((i) => i.title === TITLE))) === 3.21 && /1 with an exact reproduction, 1 suspected/.test(runIssue.body) && /### 1\. major · reproduced · `tools\/a\.mjs:1`/.test(runIssue.body) && /2 findings, 1 reproduced/.test(runIssue.title),
  'file writes one issue for the run (findings graded, proof marked) and puts its real cost in place of the reserve');
h = hub();
await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '7-1', now: NOW });
f = await file({ gh: h.gh, repo: 'o/r', runId: '7-1', result: null, sha: 'abcdef1234', settingsText: FILE(), now: NOW });
ok(f.issue === null && spentOf(stateOf(h.issues[0])) === RUN_USD + OVERSHOOT, 'a run that left no result keeps its whole reserve counted');
h = hub();
await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '7-1', now: NOW });
f = await file({ gh: h.gh, repo: 'o/r', runId: '7-1', result: { ...result, usd: 0, costKnown: false, answer: null, text: 'sk-ant-api03-abcdefghijkl cut off' }, sha: 'abcdef1234', settingsText: FILE(), now: NOW });
ok(f.usd === null && spentOf(stateOf(h.issues.find((i) => i.title === TITLE))) === RUN_USD + OVERSHOOT && !/sk-ant-api03/.test(h.issues.find((i) => i.number === f.issue).body), 'a run whose cost is unknown keeps its reserve; its raw text reaches the issue without anything token-shaped');
h = hub();
await prepare({ gh: h.gh, repo: 'o/r', settingsText: FILE(), paths: ['tools/a.mjs'], runId: '7-1', now: NOW });
f = await file({ gh: h.gh, repo: 'o/r', runId: '7-1', result: { paths: ['tools/a.mjs'], status: 'not started: no identity token', turns: 0, usd: 0, costKnown: true, answer: null, text: '' }, sha: 'abcdef1234', settingsText: FILE(), now: NOW });
ok(f.usd === 0 && spentOf(stateOf(h.issues.find((i) => i.title === TITLE))) === 0, 'a run stopped before its first question records $0, so a set-up fault does not eat the trial');

// --- the command line's plan, on a real git checkout ----------------------------------------------
const git = (...a2) => execFileSync('git', ['-C', repo, ...a2], { encoding: 'utf8' });
git('init', '-q'); git('add', 'tools/a.mjs', 'tools/b.mjs', 'tools/README.md', 'web/c.js'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x');
writeFileSync(join(repo, '.github-agent-sweep-not-used'), '');
const out = JSON.parse(execFileSync('node', [join(ROOT, '.harness/tools/agent-sweep.mjs'), 'plan', '--root', repo, '--paths', 'tools'], { encoding: 'utf8', env: { PATH: process.env.PATH } }));
ok(out.files.join() === 'tools/README.md,tools/a.mjs,tools/b.mjs' && out.model === MODEL && out.settings.on === false, 'plan lists the module\'s files and the switch without asking any model');
let refusedOutside = false;
try { execFileSync('node', [join(ROOT, '.harness/tools/agent-sweep.mjs'), 'agent', '--root', repo], { encoding: 'utf8', stdio: 'pipe', env: { PATH: process.env.PATH } }); } catch (e) { refusedOutside = /only in GitHub Actions/.test(String(e.stderr)); }
ok(refusedOutside, 'the agent step runs only in GitHub Actions');
let refusedToken = false;
try { execFileSync('node', [join(ROOT, '.harness/tools/agent-sweep.mjs'), 'agent', '--root', repo], { encoding: 'utf8', stdio: 'pipe', env: { PATH: process.env.PATH, GITHUB_ACTIONS: 'true', GH_TOKEN: 'x', RUNNER_TEMP: tmp } }); } catch (e) { refusedToken = /no GitHub token/.test(String(e.stderr)); }
ok(refusedToken, 'the agent step refuses to start while it holds a GitHub token');

// --- the template ---------------------------------------------------------------------------------
const text = readFileSync(join(ROOT, '.harness/templates/agent-sweep.yml'), 'utf8');
const wf = parseYaml(text), job = wf.jobs.sweep, steps = job.steps;
const agentStep = steps.find((s) => /agent-sweep\.mjs agent/.test(s.run || ''));
ok(Object.keys(wf.on).join() === 'workflow_dispatch' && job['runs-on'] === 'self-hosted' && job.permissions['id-token'] === 'write' && job.permissions.issues === 'write' && Object.keys(job.permissions).length === 3,
  'the template starts by hand only, on the self-hosted runner, with read, issues and the identity token and nothing more');
ok(agentStep && !agentStep.env && !/github\.token|GH_TOKEN|secrets\./.test(JSON.stringify(agentStep)), 'the step that runs the agent holds no GitHub token');
ok(steps.filter((s) => s.uses?.startsWith('actions/checkout')).every((s) => String(s.with['persist-credentials']) === 'false') && !/\$\{\{\s*inputs\./.test(steps.map((s) => s.run || '').join('\n')),
  'checkouts keep no credentials, and the module name reaches a script only through the environment');
ok(/npm ci --ignore-scripts --legacy-peer-deps/.test(text) && steps.at(-1).if === 'always()' && /rm -rf/.test(steps.at(-1).run) && steps.find((s) => /agent-sweep\.mjs file/.test(s.run || '')).if === 'always()',
  'the SDK installs from the lock without install scripts, the record is written even after a failure, and the SDK is removed at the end');
ok(/^# Action group: approval/.test(text) && /Cost \(O13\)/.test(text) && /it gates nothing/.test(text), 'the template says its action group, its cost and that it is advisory');

rmSync(tmp, { recursive: true, force: true });
console.log(`test-agent-sweep: all ${n} cases held`);
