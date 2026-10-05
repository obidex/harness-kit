#!/usr/bin/env node
// test-hands — settings as code and the control repository's guards (K007), offline.
//
//   node tools/test-hands.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { plan, covers, validate, controlProblems, unsafe, paused, keepAction, keepHours, watched } from '../.harness/tools/hands.mjs';
import { parseYaml, validateSchema } from '../.harness/tools/lib.mjs';
import { spawnSync } from 'node:child_process';

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
ok(controlProblems({ 'y.yml': 'on: workflow_dispatch\njobs:\n  a:\n    steps:\n      - run: echo "green again: done"\n      - run: |\n          echo "fine: here"\n      - name: \'quoted: ok\'\n' }).filter((p) => p.includes('plain value')).length === 1, 'control-check refuses a plain YAML value holding ": " (GitHub would reject the file); block and quoted values pass');
const unguarded = files['hands-settings.yml'].replaceAll("github.ref == 'refs/heads/main'", 'true');
ok(controlProblems({ 'x.yml': unguarded }).some((p) => p.includes('main-branch guard')), 'a keyed workflow without the main guard is refused');

const named = files['hands-settings.yml'].replace(/environment: hands/g, "environment:\n      name: 'hands'").replace('on:\n  schedule:', 'on:\n  push:\n  schedule:');
ok(controlProblems({ 'x.yml': named }).some((p) => p.includes('repository event')), 'the key is found under any environment spelling');
const commentOnly = files['hands-settings.yml'].replace(/(\n {4}if: )[^\n]*/g, '$1true') + "\n# github.ref == 'refs/heads/main'\n";
ok(controlProblems({ 'x.yml': commentOnly }).some((p) => p.includes('main-branch guard')), 'a guard in a comment is not a guard');
const caller = "name: x\non:\n  pull_request:\njobs:\n  r:\n    uses: ./.github/workflows/hands-report.yml\n    secrets: inherit\n";
ok(controlProblems({ 'x.yml': caller }).some((p) => p.includes('repository event')), 'a PR workflow handing its secrets to a keyed workflow is refused');
// a called workflow only gets the permissions its caller job grants
for (const f of ['hands-settings.yml', 'hands-update.yml', 'hands-keep.yml']) {
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

// the find step's own shell, as GitHub runs it (bash -e): a failed check still hands on the list
{
  const step = hs.jobs.discover.steps.find((x) => x.id === 'find');
  const dir = mkdtempSync(join(tmpdir(), 'hands-find-'));
  mkdirSync(join(dir, 'kit/.harness/tools'), { recursive: true });
  writeFileSync(join(dir, 'kit/.harness/tools/hands.mjs'), 'console.log(JSON.stringify(["o/drift"])); process.exit(1);\n');
  writeFileSync(join(dir, 'step.sh'), step.run);
  const out = join(dir, 'out');
  writeFileSync(out, '');
  const r = await new Promise((done) => execFile('bash', ['-e', join(dir, 'step.sh')], { cwd: dir, env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: join(dir, 'sum'), ONLY: '' } }, (err) => done(err ? err.code : 0)));
  ok(r === 1 && readFileSync(out, 'utf8').includes('repos=["o/drift"]'), 'under bash -e a failed drift check still outputs the drifted repositories, then fails the job');
  rmSync(dir, { recursive: true, force: true });
}
ok(/!cancelled\(\)/.test(hs.jobs.apply.if) && !/always\(\)/.test(hs.jobs.apply.if), 'a cancelled run starts no apply');
ok(hs.jobs.discover.steps.find((x) => x.id === 'find').env.HANDS_READ_ONLY, 'the drift check runs read-only');

// the alert standard (O10, K010): every hands alert goes through notify.mjs, and the hourly tick costs nothing until turned on
ok(!Object.values(files).some((t) => /api\.telegram\.org/.test(t)), 'no control workflow calls the Telegram API itself');
ok(/notify\.mjs problem --key "hands\/\$JOB"/.test(files['hands-report.yml']) && /notify\.mjs resolve --key "hands\/\$JOB"/.test(files['hands-report.yml']), 'hands-report opens a problem on failure and resolves it on success');
{
  const ha = parseYaml(files['hands-alerts.yml']);
  ok(/vars\.ALERTS_TICK == 'on'/.test(ha.jobs.alerts.if) && /github\.event_name == 'workflow_dispatch'/.test(ha.jobs.alerts.if), 'the scheduled tick runs only with ALERTS_TICK=on (a skipped job starts no runner)');
  ok(ha.on.schedule.length === 1 && ha.on.schedule[0].cron === '23 5-19 * * *' && /450/.test(files['hands-alerts.yml']), 'the tick is hourly 08:00-22:00 Damascus and names its estimate');
  const hs2 = parseYaml(files['hands-settings.yml']).jobs.discover;
  ok(hs2.steps.filter((x) => /notify\.mjs (tick|digest)/.test(x.run || '')).every((x) => x.if === "always() && github.event_name == 'schedule'" && String(x['continue-on-error']) === 'true'), 'the daily tick and digest ride the drift check, scheduled runs only, and never fail it');
}
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
  execFile(process.execPath, [join(new URL('..', import.meta.url).pathname, '.harness/tools/hands.mjs'), ...args], { env: { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${srv.address().port}`, GH_TOKEN: 't', GITHUB_STEP_SUMMARY: '', GITHUB_REPOSITORY: '', HANDS_PAUSED: '', ...env } }, (err, stdout, stderr) => done({ code: err ? err.code : 0, stdout, stderr }));
});
{
  const state = world();
  const srv = await serve(state);
  const d = await run(srv, ['drift']);
  ok(d.code === 0 && JSON.stringify(JSON.parse(d.stdout)) === '["o/drift"]', `drift lists only the repository that differs (${d.stdout.trim()})`);
  ok(/o\/same: matches/.test(d.stderr) && /o\/drift: drift: label "blocker": create/.test(d.stderr), 'drift says why, per repository');
  ok(JSON.parse((await run(srv, ['drift', '--only', 'o/same'])).stdout).length === 0, 'drift --only checks one repository (the dispatch after a merge)');
  const odd = await run(srv, ['drift', '--only', 'O/Drift']);
  ok(JSON.stringify(JSON.parse(odd.stdout)) === '["o/drift"]', 'drift --only matches the repository name without regard to case');
  const missing = await run(srv, ['drift', '--only', 'o/none']);
  ok(missing.code === 1 && /not enrolled/.test(missing.stderr), 'a dispatch for a repository that is not enrolled fails, never passes silently');
  const ro = await run(srv, ['apply', '--repo', 'o/drift'], { HANDS_READ_ONLY: '1' });
  ok(ro.code === 1 && /refused POST/.test(ro.stderr) && state['o/drift'].labels.length === 0, 'with HANDS_READ_ONLY the tool refuses every write');
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

// kit update PR body lines (profile kit_updates.pr_body_lines): read by hands-update itself, never by
// the pinned kit's tool; verbatim at column 1, or dropped; an open PR without them gets its body edited
{
  const kitRoot = new URL('..', import.meta.url).pathname;
  const schema = JSON.parse(readFileSync(join(kitRoot, '.harness/profile.schema.json'), 'utf8'));
  const item = schema.properties.kit_updates.properties.pr_body_lines.items;
  const wfText = readFileSync(join(kitRoot, '.harness/templates/hands/hands-update.yml'), 'utf8');
  const lines = wfText.split('\n');
  const from = lines.findIndex((l) => l.includes('# --- PR body (test-hands runs this block) ---'));
  const to = lines.findIndex((l) => l.includes('# --- end PR body ---'));
  if (from < 0 || to < from) throw new Error('hands-update.yml has no PR body block');
  const indent = lines[from].match(/^ */)[0].length;
  const block = lines.slice(from, to + 1).map((l) => l.slice(indent)).join('\n');
  const line = block.match(/const LINE = \/(.+)\/;/)[1];
  ok(line === item.pattern && item.maxLength === 200 && !/hands\.mjs|\$tool/.test(block), 'the workflow reads the lines itself (no pinned-kit tool), with the schema\'s pattern and 200-character cap');
  const example = JSON.parse(readFileSync(join(kitRoot, 'examples/profile.example.json'), 'utf8'));
  const good = 'Tier-3: authorized by card #12 (standing, kit updates)';
  const evil = ['<img src=x onerror=alert(1)>', 'x\nInjected: yes', '**bold**', ' leading space', 'a'.repeat(201), 'Approve [here](http://x)',
    'Closes #4', 'fixes: #5', 'Resolved o/r#6', 'fix #7 (standing)', 'Closes https://github.com/o/r/issues/8'];
  ok(validateSchema(schema, { ...example, kit_updates: { pr_body_lines: [good] } }).length === 0 && validateSchema(schema, { ...example, kit_updates: { pr_body_lines: [evil[0]] } }).length === 1
    && validateSchema(schema, { ...example, kit_updates: { pr_body_lines: [evil[4]] } }).length === 1, 'the profile schema accepts the valid line and refuses a bad or over-long one');
  // run the block with a stand-in gh that records what it is asked
  const proj = mkdtempSync(join(tmpdir(), 'hands-lines-'));
  mkdirSync(join(proj, '.harness')); mkdirSync(join(proj, 'bin'));
  writeFileSync(join(proj, 'bin/gh'), '#!/bin/sh\necho "$*" >> "$GH_LOG"\ncase "$1 $2" in\n  "pr list") printf "%s" "$FAKE_OPEN" ;;\n  "pr view") printf "%s" "$FAKE_BODY" ;;\nesac\n', { mode: 0o755 });
  const runBlock = (profile, env = {}) => {
    writeFileSync(join(proj, '.harness/profile.json'), JSON.stringify(profile));
    writeFileSync(join(proj, 'gh.log'), '');
    const script = ['set -euo pipefail', 'log() { echo "hands: $*"; }', 'current=0.7.0 target=0.8.0 verb=update branch=harness/kit-0.8.0', block, 'printf "BODY<<%s>>" "$body"'].join('\n');
    const out = spawnSync('bash', ['-c', script], { cwd: proj, encoding: 'utf8', env: { ...process.env, PATH: `${join(proj, 'bin')}:${process.env.PATH}`, GH_LOG: join(proj, 'gh.log'), REPO: 'o/r', FAKE_OPEN: '', FAKE_BODY: '', GITHUB_STEP_SUMMARY: '', ...env } });
    return { ...out, gh: readFileSync(join(proj, 'gh.log'), 'utf8') };
  };
  const withLines = { ...example, kit_updates: { pr_body_lines: [good, ...evil.slice(0, 6), 'Kit-update: standing (K011)'] } };
  let out = runBlock(withLines);
  const body = (out.stdout.match(/BODY<<([\s\S]*)>>/) || [])[1] || '';
  const bodyLines = body.split('\n');
  ok(out.status === 0 && bodyLines.includes(good) && bodyLines.includes('Kit-update: standing (K011)') && bodyLines[0].startsWith('Kit 0.7.0 → 0.8.0'), 'a new PR body carries each valid line verbatim at column 1, after the kit text');
  const out2 = runBlock({ ...example, kit_updates: { pr_body_lines: [good, ...evil.slice(6)] } });
  const dropped = (out.stderr + out2.stderr).match(/warning: dropped/g) || [];
  ok(!/<img|Injected|bold|here\]/.test(body) && !/Closes|fixes|Resolved|fix #7|issues\/8/.test(out2.stdout) && out2.stdout.includes(good) && dropped.length === evil.length, `markdown, HTML, newlines, a leading space, an over-long line and closing keywords are dropped, each with a warning (${dropped.length})`);
  out = runBlock(withLines, { FAKE_OPEN: '41', FAKE_BODY: 'Kit 0.7.0 → 0.8.0 (update), opened by hands-update.' });
  ok(out.status === 0 && /^pr edit 41 --repo o\/r --body Kit 0\.7\.0[\s\S]*\nTier-3: authorized by card #12/m.test(out.gh) && /already open \(#41\); its body now carries/.test(out.stdout) && !out.stdout.includes('BODY<<'),
    'a PR opened earlier without the lines gets its body edited (the guard re-runs on edited), and the run stops there');
  const current = body;
  out = runBlock(withLines, { FAKE_OPEN: '41', FAKE_BODY: current });
  ok(out.status === 0 && !/pr edit/.test(out.gh) && /already open \(#41\)$/m.test(out.stdout), 'an open PR whose body already matches is left alone');
  out = runBlock(example, { FAKE_OPEN: '41', FAKE_BODY: 'anything' });
  ok(out.status === 0 && !/pr edit/.test(out.gh) && out.stderr === '', 'no kit_updates: no lines, no warnings, and an open PR is not edited');
  out = runBlock({ kit_updates: { pr_body_lines: 'Closes #1' } });
  const many = runBlock({ ...example, kit_updates: { pr_body_lines: Array.from({ length: 12 }, (_, i) => `Line ${i}`) } });
  ok(many.status === 0 && /only the first 10/.test(many.stderr) && many.stdout.includes('Line 9') && !many.stdout.includes('Line 10'), 'at most 10 lines are read, with a warning');
  ok(out.status === 0 && /not a list/.test(out.stderr) && !/Closes/.test(out.stdout), 'a malformed field is a warning, never a failed update');
  rmSync(proj, { recursive: true, force: true });
}

// keeping kit update PRs current (K012): behind ones are brought up to date through the App
{
  const now = Date.parse('2026-10-05T18:00:00Z');
  const pr = (over = {}) => ({ number: 5, draft: false, created_at: '2026-10-05T12:00:00Z', user: { login: 'hands[bot]', type: 'Bot' },
    head: { ref: 'harness/kit-0.11.0', sha: 'abc', repo: { full_name: 'o/r' } }, base: { ref: 'main', repo: { full_name: 'o/r' } }, mergeable_state: 'behind', ...over });
  const o = { now, hours: 72, bot: 'hands[bot]' };
  ok(keepAction(pr(), o) === 'update' && keepAction(pr({ mergeable_state: 'blocked' }), o) === 'current' && keepAction(pr({ mergeable_state: 'clean' }), o) === 'current', 'a behind kit update PR is updated; a current one is only watched');
  ok(keepAction(pr({ mergeable_state: 'unknown' }), o) === 'wait' && keepAction(pr({ mergeable_state: null }), o) === 'wait' && keepAction(pr({ mergeable_state: 'dirty' }), o) === 'conflicted' && keepAction(pr({ draft: true }), o) === 'draft', 'an unknown state waits; a conflicted or draft PR is watched, never updated');
  ok(keepAction(pr({ head: { ref: 'feature/x', sha: 'a', repo: { full_name: 'o/r' } } }), o) === 'not a kit update' && keepAction(pr({ head: { ref: 'harness/kit-0.11.0', sha: 'a', repo: { full_name: 'fork/r' } } }), o) === 'not a kit update'
    && keepAction(pr({ head: { ref: 'harness/kit-0.11.0', sha: 'a', repo: null } }), o) === 'not a kit update', 'another branch, a fork\'s branch or a deleted fork is not a kit update');
  ok(keepAction(pr({ user: { login: 'someone', type: 'User' } }), o) === "not the App's" && keepAction(pr({ user: { login: 'other[bot]', type: 'Bot' } }), o) === "not the App's" && keepAction(pr({ user: { login: 'x[bot]', type: 'Bot' } }), { now }) === 'update', 'only the App\'s own PRs (any bot when the App\'s slug is unknown)');
  ok(keepAction(pr({ created_at: '2026-10-02T17:00:00Z' }), o) === 'old' && !watched('old') && watched('conflicted') && keepAction(pr({ created_at: '2026-10-02T19:00:00Z' }), o) === 'update', 'a PR open longer than HANDS_KEEP_HOURS is left to the stale-work check');
  let bad = '';
  try { keepHours({ HANDS_KEEP_HOURS: 'soon' }); } catch (e) { bad = e.message; }
  ok(keepHours({}) === 72 && keepHours({ HANDS_KEEP_HOURS: '' }) === 72 && keepHours({ HANDS_KEEP_HOURS: '24' }) === 24 && /number of hours/.test(bad), 'HANDS_KEEP_HOURS defaults to 72 and must be a number');

  // end to end against a stand-in API: listing, a state GitHub works out on the second read, the update call
  const created = new Date(Date.now() - 3600000).toISOString();
  const repos = {
    'o/proj': { lock: true, pulls: [pr({ number: 7, created_at: created, mergeable_state: 'unknown' }), pr({ number: 8, created_at: created, head: { ref: 'feature/y', sha: 'f', repo: { full_name: 'o/proj' } } })], reads: {} },
    'o/quiet': { lock: true, pulls: [pr({ number: 3, created_at: created, mergeable_state: 'clean', head: { ref: 'harness/kit-0.11.0', sha: 'q', repo: { full_name: 'o/quiet' } }, base: { ref: 'main', repo: { full_name: 'o/quiet' } } })], reads: {} },
    'o/none': { lock: false, pulls: [], reads: {} },
    'o/control': { lock: false, pulls: [], reads: {} },
  };
  for (const [name, r] of Object.entries(repos)) for (const p of r.pulls) { p.base = { ref: 'main', repo: { full_name: name } }; p.head = { ...p.head, repo: { full_name: name } }; }
  const updates = [];
  const srv = await new Promise((done) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const u = new URL(req.url, 'http://x');
        const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
        if (u.pathname === '/installation/repositories') return send(200, { repositories: Object.keys(repos).map((full_name) => ({ full_name, archived: false })) });
        const m = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)(.*)$/);
        const r = m && repos[m[1]];
        if (!r) return send(404, {});
        const rest = m[2];
        if (rest === '/contents/.harness/kit.lock.json') return r.lock ? send(200, { content: '' }) : send(404, {});
        if (rest.startsWith('/contents/')) return send(404, {});
        if (rest === '/pulls') return send(200, u.searchParams.get('page') === '1' ? r.pulls.map(({ mergeable_state, ...x }) => x) : []);
        const one = rest.match(/^\/pulls\/(\d+)$/);
        if (one) {
          const p = r.pulls.find((x) => String(x.number) === one[1]);
          r.reads[one[1]] = (r.reads[one[1]] || 0) + 1;
          // GitHub answers unknown until it has worked the state out
          return send(200, { ...p, mergeable_state: p.mergeable_state === 'unknown' && r.reads[one[1]] > 1 ? 'behind' : p.mergeable_state });
        }
        const up = rest.match(/^\/pulls\/(\d+)\/update-branch$/);
        if (up && req.method === 'PUT') { updates.push({ repo: m[1], n: up[1], body: JSON.parse(body) }); return send(202, { message: 'Updating pull request branch.' }); }
        return send(404, {});
      });
    });
    s.listen(0, '127.0.0.1', () => done(s));
  });
  const k = await run(srv, ['keep'], { SLUG: 'hands', HANDS_KEEP_RETRY_MS: '10', GITHUB_REPOSITORY: 'o/control' });
  const res = JSON.parse(k.stdout || '{}');
  ok(k.code === 0 && updates.length === 1 && updates[0].repo === 'o/proj' && updates[0].n === '7' && updates[0].body.expected_head_sha === 'abc', `keep updates the one behind kit PR, pinned to the head it saw (${JSON.stringify(updates)})`);
  ok(res.watched === 2 && res.updated === 1 && /o\/proj: applied update-branch to #7 \(harness\/kit-0\.11\.0\): it was behind main/.test(k.stderr) && /o\/quiet: #3 .* is current; nothing to do/.test(k.stderr) && !/#8/.test(k.stderr),
    'the update is logged as a write (the hands log records it); a current PR is watched; other PRs are not touched');
  repos['o/proj'].pulls = []; repos['o/quiet'].pulls = [];
  const idle = await run(srv, ['keep'], { SLUG: 'hands' });
  ok(idle.code === 0 && JSON.parse(idle.stdout).watched === 0 && /0 open kit update PR\(s\) watched/.test(idle.stderr), 'with no kit PR open keep watches none (the workflow then turns itself off)');
  repos['o/proj'].pulls = [pr({ number: 9, created_at: created })]; repos['o/proj'].pulls[0].base.repo.full_name = 'o/proj'; repos['o/proj'].pulls[0].head.repo.full_name = 'o/proj';
  srv.removeAllListeners('request');
  srv.on('request', (req, res) => { res.writeHead(req.url.includes('update-branch') ? 422 : 200, { 'content-type': 'application/json' });
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/installation/repositories') return res.end(JSON.stringify({ repositories: [{ full_name: 'o/proj', archived: false }] }));
    if (u.pathname.endsWith('/kit.lock.json')) return res.end('{}');
    if (u.pathname.endsWith('/pulls')) return res.end(JSON.stringify(u.searchParams.get('page') === '1' ? repos['o/proj'].pulls : []));
    if (u.pathname.endsWith('/pulls/9')) return res.end(JSON.stringify(repos['o/proj'].pulls[0]));
    res.end(JSON.stringify({ message: 'expected head sha didn\'t match current head ref' })); });
  const fail = await run(srv, ['keep'], { SLUG: 'hands' });
  ok(fail.code === 1 && JSON.parse(fail.stdout).watched >= 1 && /o\/proj: FAIL o\/proj: #9 is behind main, but update-branch answered 422/.test(fail.stderr), 'a refused update fails the run (an alert) and keeps the workflow on');
  srv.close();
}

// the keep workflow: on only while a kit PR is open, off by itself, and the update run turns it on
{
  const hk = parseYaml(files['hands-keep.yml']);
  ok(hk.on.schedule.length === 1 && /^\d+ \* \* \* \*$/.test(hk.on.schedule[0].cron) && hk.on.workflow_dispatch !== undefined && /75/.test(files['hands-keep.yml']), 'hands-keep is at most hourly, runs on dispatch, and names its estimate');
  ok(hk.jobs.keep.permissions.actions === 'write' && /needs\.keep\.outputs\.wrote == '1'/.test(hk.jobs.report.if) && /needs\.keep\.outputs\.idle == '1'/.test(hk.jobs.report.if) && /needs\.keep\.result == 'failure'/.test(hk.jobs.report.if),
    'a quiet run starts no report job; a write, a failure or turning off does');
  const step = hk.jobs.keep.steps.find((x) => x.id === 'keep');
  const dir = mkdtempSync(join(tmpdir(), 'hands-keep-'));
  mkdirSync(join(dir, 'kit/.harness/tools'), { recursive: true }); mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin/gh'), '#!/bin/sh\necho "$GH_TOKEN $*" >> "$GH_LOG"\n', { mode: 0o755 });
  writeFileSync(join(dir, 'step.sh'), step.run);
  const keepRun = (stdout, code) => {
    writeFileSync(join(dir, 'kit/.harness/tools/hands.mjs'), `console.log(${JSON.stringify(stdout)}); console.error('hands: o/r: applied update-branch to #1'); process.exit(${code});\n`);
    for (const f of ['out', 'gh.log', 'sum']) writeFileSync(join(dir, f), '');
    const r = spawnSync('bash', ['-e', join(dir, 'step.sh')], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, GH_LOG: join(dir, 'gh.log'), GITHUB_OUTPUT: join(dir, 'out'), GITHUB_STEP_SUMMARY: join(dir, 'sum'), RUNNER_TEMP: dir, GITHUB_REPOSITORY: 'o/control', GH_TOKEN: 'app', ACTIONS_TOKEN: 'own' } });
    return { code: r.status, out: readFileSync(join(dir, 'out'), 'utf8'), gh: readFileSync(join(dir, 'gh.log'), 'utf8'), log: readFileSync(join(dir, 'log.txt'), 'utf8') };
  };
  let r = keepRun('{"watched":0,"updated":0}', 0);
  ok(r.code === 0 && /idle=1/.test(r.out) && /^own api -X PUT repos\/o\/control\/actions\/workflows\/hands-keep\.yml\/disable$/m.test(r.gh), 'no kit PR open: the workflow turns itself off with this repository\'s own token');
  r = keepRun('{"watched":1,"updated":1}', 0);
  ok(r.code === 0 && /wrote=1/.test(r.out) && !/idle/.test(r.out) && r.gh === '' && /applied update-branch/.test(r.log), 'a PR still open keeps it on; an update is a write for the log');
  r = keepRun('{"watched":1,"updated":1}', 1);
  ok(r.code === 1 && /wrote=1/.test(r.out) && !/idle/.test(r.out) && r.gh === '' && /applied update-branch/.test(r.log), 'a failed run still hands on its writes and log, fails the job, and never turns the workflow off');
  r = keepRun('not json', 1);
  ok(r.code === 1 && r.gh === '', 'unreadable output is a failure that keeps the workflow on');
  rmSync(dir, { recursive: true, force: true });
  const hu = parseYaml(files['hands-update.yml']).jobs.update;
  const on = hu.steps.find((x) => /hands-keep/.test(x.name || ''));
  ok(on && on.if === "steps.open.outputs.pr != ''" && /hands-keep\.yml\/enable/.test(on.run) && /hands-keep\.yml\/dispatches/.test(on.run) && on.env.GH_TOKEN === '${{ github.token }}' && hu.permissions.actions === 'write',
    'hands-update turns hands-keep on and runs it once whenever a kit PR is open, with this repository\'s own token');
  ok((files['hands-update.yml'].match(/echo "pr=/g) || []).length === 2, 'both paths that leave a PR open (opened now, or found open) say so');
}

console.log(`test-hands: OK · ${n} checks`);
