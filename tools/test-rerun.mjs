#!/usr/bin/env node
// test-rerun — one automatic re-run of a failed check that does not block the merge (K075).
//
//   node tools/test-rerun.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredOf, checkStates, decide } from '../.harness/tools/rerun.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => {
  n++;
  if (!cond) { console.log(`test-rerun: FAIL ${n}. ${what}`); process.exit(1); }
  console.log(`test-rerun: ok ${n}. ${what}`);
};
const kit = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- the required checks: rulesets and branch protection, together -------------------------------------
const req = requiredOf([{ type: 'pull_request' }, { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-ok' }, { context: 'harness-guard' }] } }],
  { protection: { required_status_checks: { contexts: ['legacy'], checks: [{ context: 'legacy' }, { context: 'other' }] } } });
ok([...req].sort().join(',') === 'ci-ok,harness-guard,legacy,other', 'the required checks come from the base branch\'s rulesets and its branch protection');
ok(requiredOf([], {}).size === 0 && requiredOf(null, null).size === 0, 'a branch with no rule requires nothing');

// --- the head's checks: the newest of each ------------------------------------------------------------
const st = checkStates([{ id: 1, name: 'ci-ok', status: 'completed', conclusion: 'failure' }, { id: 2, name: 'ci-ok', status: 'completed', conclusion: 'success' },
  { id: 3, name: 'harness-guard', status: 'in_progress', conclusion: null }, { id: 4, name: 'scrub', status: 'completed', conclusion: 'failure' }],
  [{ context: 'legacy', state: 'error' }, { context: 'legacy', state: 'success' }, { context: 'deploy', state: 'pending' }]);
ok(st.get('ci-ok') === 'passed' && st.get('harness-guard') === 'running' && st.get('scrub') === 'failed' && st.get('legacy') === 'failed' && st.get('deploy') === 'running',
  'each check\'s newest state counts: a re-run that passed wins over the failure before it; GitHub lists statuses newest first');

// --- the decision ------------------------------------------------------------------------------------
const run = (o = {}) => ({ id: 77, name: 'harness-scrub', conclusion: 'failure', run_attempt: 1, event: 'pull_request', head_repository: { full_name: 'o/r' }, ...o });
const R = new Set(['ci-ok', 'harness-guard']);
const green = new Map([['ci-ok', 'passed'], ['harness-guard', 'passed']]);
const scrubFailed = [{ name: 'scrub', conclusion: 'failure' }];
let d = decide({ run: run(), repo: 'o/r', required: R, jobs: scrubFailed, states: green });
ok(d.rerun && /scrub failed and is not required; no required check failed \(ci-ok: passed, harness-guard: passed\)/.test(d.why), `a failed check that is not required, on a pull request whose required checks pass, is run again (${d.why})`);
ok(decide({ run: run(), repo: 'o/r', required: R, jobs: scrubFailed, states: new Map([['ci-ok', 'running']]) }).rerun, 'required checks still running is not a failure: it is run again');
ok(!decide({ run: run({ run_attempt: 2 }), repo: 'o/r', required: R, jobs: scrubFailed, states: green }).rerun, 'a second attempt is never run again: one re-run, then it stays red');
ok(!decide({ run: run({ conclusion: 'success' }), repo: 'o/r', required: R, jobs: [], states: green }).rerun && !decide({ run: run({ conclusion: 'cancelled' }), repo: 'o/r', required: R, jobs: scrubFailed, states: green }).rerun, 'a run that passed or was cancelled is left alone');
ok(!decide({ run: run({ event: 'issue_comment' }), repo: 'o/r', required: R, jobs: scrubFailed, states: green }).rerun && !decide({ run: run({ head_repository: { full_name: 'fork/r' } }), repo: 'o/r', required: R, jobs: scrubFailed, states: green }).rerun,
  'a run that was not for a pull request, or was for a fork\'s, is left alone');
d = decide({ run: run({ name: 'ci' }), repo: 'o/r', required: R, jobs: [{ name: 'ci-ok', conclusion: 'failure' }], states: new Map([['ci-ok', 'failed']]) });
ok(!d.rerun && /ci-ok is a required check/.test(d.why), 'a failed required check is never re-run here: that failure blocks the merge and is the pull request\'s own');
d = decide({ run: run(), repo: 'o/r', required: R, jobs: scrubFailed, states: new Map([['ci-ok', 'failed'], ['harness-guard', 'passed']]) });
ok(!d.rerun && /required check ci-ok failed on this head/.test(d.why), 'when a required check failed the pull request is red anyway: nothing is re-run');
ok(!decide({ run: run(), repo: 'o/r', required: R, jobs: [{ name: 'scrub', conclusion: 'success' }], states: green }).rerun, 'a run whose jobs did not fail is left alone');

// --- the run itself, as Actions starts it, against a stand-in API --------------------------------------
{
  const posts = [];
  let refuse = false;
  let state = { required: [{ context: 'ci-ok' }], jobs: scrubFailed, checks: [{ id: 5, name: 'ci-ok', status: 'completed', conclusion: 'success' }], pulls: [] };
  const s = createServer((q, res) => {
    const p = q.url.split('?')[0], json = (code, j) => { res.writeHead(code); res.end(JSON.stringify(j)); };
    if (q.method === 'POST') { if (refuse) return json(403, { message: 'This workflow is already running' }); posts.push(p); return json(201, {}); }
    if (p === '/repos/o/r/rules/branches/main') return json(200, [{ type: 'required_status_checks', parameters: { required_status_checks: state.required } }]);
    if (p === '/repos/o/r/branches/main') return json(200, { name: 'main', protected: false });
    if (p === '/repos/o/r/actions/runs/77/jobs') return json(200, { total_count: state.jobs.length, jobs: state.jobs });
    if (p === '/repos/o/r/commits/h/check-runs') return json(200, { total_count: state.checks.length, check_runs: state.checks });
    if (p === '/repos/o/r/commits/h/status') return json(200, { state: 'success', statuses: [] });
    if (p === '/repos/o/r/pulls') return json(200, state.pulls);
    return json(404, { message: 'Not Found' });
  });
  await new Promise((done) => s.listen(0, '127.0.0.1', done));
  const dir = mkdtempSync(join(tmpdir(), 'rerun-'));
  const go = (wr) => new Promise((done) => {
    const ev = join(dir, 'event.json');
    writeFileSync(ev, JSON.stringify({ workflow_run: wr }));
    const c = spawn(process.execPath, [join(kit, '.harness/tools/rerun.mjs')], { env: { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${s.address().port}`, GITHUB_TOKEN: 'GT', GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: ev, HARNESS_GH_RETRY_MS: '0' } });
    let out = '', err = '';
    c.stdout.on('data', (b) => { out += b; }); c.stderr.on('data', (b) => { err += b; });
    c.on('close', (code) => done({ code, out, err }));
  });
  const wr = run({ head_sha: 'h', head_branch: 'harness/kit-0.62.1', pull_requests: [{ number: 902, base: { ref: 'main' } }] });
  let x = await go(wr);
  ok(x.code === 0 && JSON.stringify(posts) === '["/repos/o/r/actions/runs/77/rerun-failed-jobs"]' && /rerun: started harness-scrub run 77's failed jobs once more \(K075\)/.test(x.out),
    `the case that started this: scrub failed on a 502, ci-ok passed: scrub's failed job is started once more (${x.out.trim()}${x.err.trim()})`);
  posts.length = 0;
  x = await go({ ...wr, run_attempt: 2 });
  ok(x.code === 0 && !posts.length && /attempt 2/.test(x.out), 'its second failure is left red, with the reason on one line');
  state = { ...state, jobs: [{ name: 'ci-ok', conclusion: 'failure' }] };
  x = await go({ ...wr, name: 'ci' });
  ok(x.code === 0 && !posts.length && /ci-ok is a required check/.test(x.out), 'a required check\'s failure starts nothing');
  // the event names no pull request (GitHub leaves the list empty in some cases): it is found by branch
  state = { ...state, jobs: scrubFailed, pulls: [{ number: 902, base: { ref: 'main' } }] };
  x = await go({ ...wr, pull_requests: [] });
  ok(x.code === 0 && posts.length === 1, 'when the event names no pull request, the open one for its branch is read');
  refuse = true;
  x = await go(wr);
  ok(x.code === 0 && /::warning::rerun: harness-scrub run 77 was not started again: POST \/repos\/o\/r\/actions\/runs\/77\/rerun-failed-jobs answered 403/.test(x.out),
    'a run GitHub will not start again (scrub already re-ran it, K044) is a warning, never a red rerun job');
  s.close();
  rmSync(dir, { recursive: true, force: true });
}

// --- the workflow -------------------------------------------------------------------------------------
{
  const text = readFileSync(join(kit, '.harness/templates/workflows/harness-rerun.yml'), 'utf8');
  const wf = parseYaml(text);
  const job = wf.jobs.rerun;
  const flow = (v) => String(v).replace(/^\[|\]$/g, '').split(',').map((x) => x.trim());   // the kit's reader keeps a flow list as text
  ok(JSON.stringify(Object.keys(wf.on)) === '["workflow_run"]' && JSON.stringify(flow(wf.on.workflow_run.types)) === '["completed"]' && flow(wf.on.workflow_run.workflows).includes('harness-scrub') && !flow(wf.on.workflow_run.workflows).includes('harness-review'),
    'it starts only when a listed workflow finishes; harness-review (itself a workflow_run, never a pull request\'s own run) is not listed');
  ok(/conclusion == 'failure'/.test(job.if) && /run_attempt == 1/.test(job.if) && /startsWith\(github\.event\.workflow_run\.event, 'pull_request'\)/.test(job.if) && /head_repository\.full_name == github\.repository/.test(job.if),
    'no job starts for a run that did not fail, a second attempt, a run not for a pull request, or a fork\'s');
  ok(job.permissions.actions === 'write' && job.permissions.checks === 'read' && wf.permissions.contents === 'read' && Object.values(job.permissions).filter((v) => v === 'write').length === 1,
    'its token writes only Actions (the re-run); everything else it reads');
  const co = job.steps.find((x) => /actions\/checkout/.test(x.uses || ''));
  ok(co.with.ref === '${{ github.event.repository.default_branch }}' && co.with['sparse-checkout'] === '.harness/tools' && String(co.with['persist-credentials']) === 'false',
    'it checks out only the default branch\'s tools, never the pull request');
  ok(/vars\.CHORE_RUNNER \|\| vars\.RUNNER/.test(job['runs-on']) && Number(job['timeout-minutes']) <= 5, 'it runs on the chore lane, a few minutes at most');
}

console.log(`test-rerun: OK · ${n} checks`);
