#!/usr/bin/env node
// test-hands — settings as code and the control repository's guards (K007), offline.
//
//   node tools/test-hands.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { plan, covers, validate, controlProblems, unsafe, paused } from '../.harness/tools/hands.mjs';
import { parseYaml } from '../.harness/tools/lib.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-hands: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-hands: ok ${n}. ${what}`); };

const ruleset = (strict) => ({
  name: 'main-protection', target: 'branch', enforcement: 'active',
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } }, bypass_actors: [],
  rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 0 } },
    { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: strict, required_status_checks: [{ context: 'ci' }] } }],
});
const desired = {
  repository: { allow_auto_merge: true, delete_branch_on_merge: true },
  rulesets: [ruleset(true)],
  labels: [{ name: 'blocker', color: 'B60205', description: 'Blocks the merge' }],
};
// what GitHub returns: more fields than the file names, rules in another order
const liveRuleset = (strict) => ({ id: 7, source_type: 'Repository', ...ruleset(strict), rules: [...ruleset(strict).rules].reverse().map((r) => ({ ...r, parameters: { ...r.parameters, extra_default: false } })) });
const matching = { repository: { allow_auto_merge: true, delete_branch_on_merge: true, has_wiki: true }, rulesets: [liveRuleset(true)], labels: [{ name: 'blocker', color: 'b60205', description: 'Blocks the merge' }, { name: 'other', color: '000000' }] };

// plan: no writes when live already matches, extra live fields and order aside
ok(plan('o/r', desired, matching).length === 0, 'a live repository that matches its file needs no write');
ok(covers({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } }) && !covers({ b: { c: 2 } }, { b: { c: 3 } }), 'covers: live may carry more, never differ');

// plan: each difference is one write of the right shape
const drifted = { ...matching, repository: { allow_auto_merge: false, delete_branch_on_merge: true }, rulesets: [liveRuleset(false)], labels: [] };
const steps = plan('o/r', desired, drifted);
ok(steps.length === 3, `three writes for three differences (${steps.map((s) => s.what).join(' | ')})`);
ok(steps[0].call.method === 'PATCH' && steps[0].call.path === '/repos/o/r' && JSON.stringify(steps[0].call.body) === '{"allow_auto_merge":true}', 'repository: only the differing key is sent');
ok(steps[1].call.method === 'PUT' && steps[1].call.path === '/repos/o/r/rulesets/7' && steps[1].call.body.rules.length === 2, 'ruleset: replaced whole by id when strict checks differ');
ok(steps[2].call.method === 'POST' && steps[2].call.body.color === 'b60205', 'label: created with a normalized color');
ok(plan('o/r', { ...desired, rulesets: [] }, { ...matching, rulesets: [] }).length === 0, 'an empty ruleset list on both sides needs nothing');
ok(plan('o/r', desired, { ...matching, rulesets: [] })[0].call.method === 'POST', 'a missing ruleset is created');

// prune: off by default, explicit when on
ok(!plan('o/r', desired, matching).some((s) => s.call.method === 'DELETE'), 'unnamed live labels and rulesets are left alone by default');
const pruned = plan('o/r', { ...desired, prune: { labels: true } }, matching);
ok(pruned.length === 1 && pruned[0].call.method === 'DELETE' && pruned[0].call.path.endsWith('/labels/other'), 'prune.labels deletes only the unnamed label');

// validate: against the repository the file sits in
const root = mkdtempSync(join(tmpdir(), 'hands-test-'));
mkdirSync(join(root, '.github/workflows'), { recursive: true });
writeFileSync(join(root, '.github/workflows/ci.yml'), 'name: ci\non:\n  pull_request:\njobs:\n  ci:\n    name: ci\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n');
ok(validate(desired, root).length === 0, 'a file whose required checks run on pull requests is valid');
const ghost = { ...desired, rulesets: [{ ...ruleset(true), rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-ok' }] } }] }] };
ok(validate(ghost, root).some((e) => e.includes('"ci-ok" is not a job')), 'a required check no job produces is refused (it would block every merge)');
ok(validate({ repository: { allow_auto_merge: true } }, root).some((e) => e.includes('auto-merge would merge at once')), 'auto-merge without a required check is refused');
ok(validate({ repository: { allow_auto_merge: 'yes' } }, root).length > 0 && validate({ repository: {}, extra: 1 }, root).length > 0, 'the schema refuses wrong types and unknown keys');
ok(validate({ ...desired, rulesets: [], prune: { rulesets: true } }, root).some((e) => e.includes('delete all branch protection')), 'pruning rulesets with no active branch ruleset named is refused');
rmSync(root, { recursive: true, force: true });

// the writes keep what the file does not manage
const noBypass = { ...desired, rulesets: [(({ bypass_actors, ...r }) => r)(ruleset(true))] };
const admin = { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' };
const keep = plan('o/r', noBypass, { ...matching, rulesets: [{ ...liveRuleset(false), bypass_actors: [admin] }] });
ok(keep.length === 1 && keep[0].call.method === 'PUT' && JSON.stringify(keep[0].call.body.bypass_actors) === JSON.stringify([admin]), 'a bypass list the file leaves out is kept on a replace');
ok(!covers([{ actor_id: 1, actor_type: 'Team' }], [{ actor_id: 1, actor_type: 'Integration' }]), 'bypass actors are matched by type and id, not id alone');
const tagRs = { id: 9, name: 'tags', target: 'tag', enforcement: 'active', conditions: {}, rules: [{ type: 'deletion' }] };
ok(!plan('o/r', { ...desired, prune: { rulesets: true } }, { ...matching, rulesets: [liveRuleset(true), tagRs] }).some((s) => s.call.method === 'DELETE'), 'pruning branch rulesets never deletes a tag ruleset');
ok(unsafe({ repository: { allow_auto_merge: true } }).length === 1, 'plan and apply refuse the same unsafe files as validate');

// the control repository: the App key only on main, never on a repository event
const tpl = join(new URL('..', import.meta.url).pathname, '.harness/templates/hands');
const files = Object.fromEntries(readdirSync(tpl).map((f) => [f, readFileSync(join(tpl, f), 'utf8')]));
ok(controlProblems(files).length === 0, `the shipped control workflows pass (${Object.keys(files).join(', ')})`);
const onPr = files['hands-settings.yml'].replace('on:\n  schedule:', 'on:\n  pull_request:\n  schedule:');
ok(controlProblems({ 'x.yml': onPr }).some((p) => p.includes('repository event')), 'a keyed workflow on pull_request is refused');
const unguarded = files['hands-settings.yml'].replaceAll("github.ref == 'refs/heads/main'", 'true');
ok(controlProblems({ 'x.yml': unguarded }).some((p) => p.includes('main-branch guard')), 'a keyed workflow without the main guard is refused');

const named = files['hands-settings.yml'].replace(/environment: hands/g, "environment:\n      name: 'hands'").replace('on:\n  schedule:', 'on:\n  push:\n  schedule:');
ok(controlProblems({ 'x.yml': named }).some((p) => p.includes('repository event')), 'the key is found under any environment spelling');
const commentOnly = files['hands-settings.yml'].replace(/(\n {4}if: )[^\n]*/g, '$1true') + "\n# github.ref == 'refs/heads/main'\n";
ok(controlProblems({ 'x.yml': commentOnly }).some((p) => p.includes('main-branch guard')), 'a guard in a comment is not a guard');
const caller = "name: x\non:\n  pull_request:\njobs:\n  r:\n    uses: ./.github/workflows/hands-report.yml\n    secrets: inherit\n";
ok(controlProblems({ 'x.yml': caller }).some((p) => p.includes('repository event')), 'a PR workflow handing its secrets to a keyed workflow is refused');
// a called workflow only gets the permissions its caller job grants
for (const f of ['hands-settings.yml', 'hands-update.yml']) {
  // GitHub refuses to start the run (startup_failure) when a caller grants less than the called
  // workflow declares, at its top level or in a job; seen on the first real run of 0.5.0
  const caller = parseYaml(files[f]).jobs.report;
  const called = parseYaml(files['hands-report.yml']);
  const need = [called.permissions || {}, ...Object.values(called.jobs).map((j) => j.permissions || {})];
  const rank = { none: 0, read: 1, write: 2 };
  const short = need.flatMap((p) => Object.entries(p)).filter(([k, v]) => (rank[caller.permissions?.[k]] ?? 0) < rank[v]).map(([k, v]) => `${k}: ${v}`);
  ok(!short.length, `${f}: the report job grants all hands-report declares${short.length ? ` (missing ${short.join(', ')})` : ''}`);
}
// no project code runs where the key is: the update job runs only the pinned kit's tool
ok(!/node \.harness\/tools\//.test(files['hands-update.yml']) && files['hands-update.yml'].includes('node "$tool" update --root .'), 'hands-update runs the pinned kit, never the project\'s own copy');

// cost (O13, K008): the settings workflow runs at most daily on its own, and only drifted repos get a job
const hs = parseYaml(files['hands-settings.yml']);
ok(hs.on.schedule.every((c) => /^\d+ \d+ \* \* [*\d]+$/.test(c.cron)), `hands-settings runs at most once a day on its schedule (${hs.on.schedule.map((c) => c.cron).join(', ')})`);
ok(/hands\.mjs drift/.test(files['hands-settings.yml']) && /needs\.discover\.outputs\.repos != '\[\]'/.test(hs.jobs.apply.if) && /needs\.apply\.result == 'success'/.test(hs.jobs.report.if), 'apply runs only for drifted repositories, and the report only when something was applied or failed');

// the emergency stop
ok(paused('o/r', 'x/y, o/r') && paused('O/R', '*') && !paused('o/r', 'o/rr x/y') && !paused('o/r', ''), 'HANDS_PAUSED names repositories (or *) exactly');

// drift and apply end to end, against a stand-in GitHub API (K008: unchanged repos cost no job)
const world = () => ({
  'o/same': { file: desired, repository: { ...matching.repository }, rulesets: [liveRuleset(true)], labels: [...matching.labels] },
  'o/drift': { file: desired, repository: { ...matching.repository }, rulesets: [liveRuleset(true)], labels: [] },
  'o/none': { file: null, repository: {}, rulesets: [], labels: [] },
});
const serve = (state, { sticky = true } = {}) => new Promise((done) => {
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (u.pathname === '/installation/repositories') return send(200, { repositories: Object.keys(state).map((full_name) => ({ full_name, archived: false })) });
      const m = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)(.*)$/);
      const r = m && state[m[1]];
      if (!r) return send(404, {});
      const rest = m[2];
      if (rest === '') return send(200, r.repository);
      if (rest === '/contents/.github/harness-settings.json') return r.file ? send(200, { content: Buffer.from(JSON.stringify(r.file)).toString('base64') }) : send(404, {});
      if (rest.startsWith('/contents/')) return send(404, {});
      if (rest === '/rulesets') return send(200, r.rulesets.map(({ id, name, target, source_type }) => ({ id, name, target, source_type })));
      if (rest.startsWith('/rulesets/')) return send(200, r.rulesets.find((x) => String(x.id) === rest.split('/')[2]));
      if (rest === '/labels' && req.method === 'GET') return send(200, u.searchParams.get('page') === '1' ? r.labels : []);
      if (rest === '/labels' && req.method === 'POST') { const l = JSON.parse(body); if (sticky) r.labels.push(l); return send(201, l); }
      return send(404, {});
    });
  });
  srv.listen(0, '127.0.0.1', () => done(srv));
});
const run = (srv, args, env = {}) => new Promise((done) => {
  execFile(process.execPath, [join(new URL('..', import.meta.url).pathname, '.harness/tools/hands.mjs'), ...args], { env: { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${srv.address().port}`, GH_TOKEN: 't', GITHUB_STEP_SUMMARY: '', HANDS_PAUSED: '', ...env } }, (err, stdout, stderr) => done({ code: err ? err.code : 0, stdout, stderr }));
});
{
  const state = world();
  const srv = await serve(state);
  const d = await run(srv, ['drift']);
  ok(d.code === 0 && JSON.stringify(JSON.parse(d.stdout)) === '["o/drift"]', `drift lists only the repository that differs (${d.stdout.trim()})`);
  ok(/o\/same: matches/.test(d.stderr) && /o\/drift: drift: label "blocker": create/.test(d.stderr), 'drift says why, per repository');
  ok(JSON.parse((await run(srv, ['drift', '--only', 'o/same'])).stdout).length === 0, 'drift --only checks one repository (the dispatch after a merge)');
  const p = await run(srv, ['drift'], { HANDS_PAUSED: 'o/drift' });
  ok(JSON.parse(p.stdout).length === 0 && /o\/drift: paused/.test(p.stderr), 'a paused repository is left alone by drift');
  const pa = await run(srv, ['apply', '--repo', 'o/drift'], { HANDS_PAUSED: '*' });
  ok(pa.code === 0 && /paused/.test(pa.stdout) && state['o/drift'].labels.length === 0, 'apply refuses a paused repository and writes nothing');
  const a = await run(srv, ['apply', '--repo', 'o/drift']);
  ok(a.code === 0 && /applied label "blocker": create/.test(a.stdout) && /read back, live settings match the file/.test(a.stdout), 'apply writes, then reads back and confirms the match');
  ok(JSON.parse((await run(srv, ['drift'])).stdout).length === 0, 'after the apply nothing drifts');
  state['o/same'].file = { repository: { allow_auto_merge: true } };
  const bad = await run(srv, ['drift']);
  ok(bad.code === 1 && /o\/same: FAIL .*invalid/.test(bad.stderr), 'an invalid file fails the drift check loudly, and the others are still checked');
  srv.close();
}
{
  const state = world();
  const srv = await serve(state, { sticky: false });
  const a = await run(srv, ['apply', '--repo', 'o/drift']);
  ok(a.code === 1 && /read back after apply still differs/.test(a.stderr), 'a write GitHub did not keep fails the apply (read-back compare)');
  srv.close();
}

console.log(`test-hands: OK · ${n} checks`);
