#!/usr/bin/env node
// test-hands — settings as code and the control repository's guards (K007), offline.
//
//   node tools/test-hands.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { plan, covers, validate, controlProblems, controlUpdate, controlCopyProblems, unsafe, paused, keepAction, keepHours, watched, api } from '../.harness/tools/hands.mjs';
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
  repository: { allow_auto_merge: true, delete_branch_on_merge: true, squash_merge_commit_title: 'PR_TITLE', squash_merge_commit_message: 'BLANK' },
  rulesets: [ruleset(true)],
  labels: [{ name: 'blocker', color: 'B60205', description: 'Blocks the merge' }],
};
// what GitHub returns: more fields than the file names, rules in another order
const liveRuleset = (strict) => ({ id: 7, source_type: 'Repository', ...ruleset(strict), rules: [...ruleset(strict).rules].reverse().map((r) => ({ ...r, parameters: { ...r.parameters, extra_default: false } })) });
const matching = { repository: { allow_auto_merge: true, delete_branch_on_merge: true, squash_merge_commit_title: 'PR_TITLE', squash_merge_commit_message: 'BLANK', has_wiki: true }, rulesets: [liveRuleset(true)], labels: [{ name: 'blocker', color: 'b60205', description: 'Blocks the merge' }, { name: 'other', color: '000000' }] };

// plan: no writes when live already matches, extra live fields and order aside
ok(plan('o/r', desired, matching).length === 0, 'a live repository that matches its file needs no write');
ok(covers({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } }) && !covers({ b: { c: 2 } }, { b: { c: 3 } }), 'covers: live may carry more, never differ');

// plan: each difference is one write of the right shape
const drifted = { ...matching, repository: { allow_auto_merge: false, delete_branch_on_merge: true, squash_merge_commit_title: 'PR_TITLE', squash_merge_commit_message: 'BLANK' }, rulesets: [liveRuleset(false)], labels: [] };
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
const { squash_merge_commit_message: _b, ...noBody } = desired.repository;
const defaultBody = { ...desired, repository: noBody };
ok(validate(desired, root).length === 0, 'a file whose required checks run on pull requests is valid');
ok(validate(defaultBody, root).some((e) => e.includes('squash default body other than "BLANK"')), 'auto-merge with the default squash body is refused: it could carry a trailer (K069)');
ok(validate({ ...desired, repository: { ...desired.repository, squash_merge_commit_message: 'COMMIT_MESSAGES' } }, root).some((e) => e.includes('"BLANK"')), 'auto-merge with commit messages as the squash body is refused');
ok(validate({ ...desired, repository: { ...noBody, allow_squash_merge: false } }, root).length === 0, 'auto-merge with no squash merges allowed needs no squash body (built without one, so it fails if the exemption goes)');
ok(validate({ ...desired, repository: { allow_auto_merge: false } }, root).length === 0, 'no auto-merge, no squash body needed');
ok(validate({ ...desired, repository: { ...desired.repository, squash_merge_commit_title: 'COMMIT_OR_PR_TITLE' } }, root).some((e) => e.includes('"PR_TITLE"')), 'a blank squash body with the commit-or-title title is refused: GitHub answers 422 to that pair (K069)');
ok(validate({ ...desired, repository: { allow_auto_merge: true, squash_merge_commit_message: 'BLANK' } }, root).some((e) => e.includes('"PR_TITLE"')), 'a blank squash body with no title in the file is refused: the live title may be the one GitHub refuses with it');
ok(validate(desired, root).every((e) => !e.includes('"PR_TITLE"')), 'the pull-request title with a blank body is accepted');
ok(unsafe(defaultBody).length === 0, 'apply still accepts a live file it accepted before (the body rule is checked on the pull request only)');
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
// K062: each apply records its repository's result (anything but success is a failure, a paused one none), the report
// gets the drift check's own result, and a check that finds a repository matching closes its apply alert
{
  const rec = hs.jobs.apply.steps.find((x) => x.name === "Record this repository's result");
  ok(rec && rec.if === 'always()' && /STATUS=failure/.test(rec.run) && /paused \(HANDS_PAUSED\)/.test(rec.run) && /result\.txt/.test(hs.jobs.apply.steps.find((x) => /upload-artifact/.test(x.uses || ''))?.with?.path || ''),
    'hands-settings: every apply records its result for the report (K062)');
  ok(hs.jobs.report.with?.whole === '${{ needs.discover.result }}', 'hands-settings: the report gets the drift check\'s own result as whole (K062)');
  const res = hs.jobs.discover.steps.find((x) => /hands\/hands-settings\/\$repo/.test(x.run || ''));
  ok(res && hs.jobs.discover.steps.find((x) => x.id === 'find').env.HANDS_MATCHED_FILE && /<\/dev\/null/.test(res.run), 'hands-settings: a repository found matching its file has its apply alert closed (K062)');
}
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
ok(/notify\.mjs ops --key "hands\/\$JOB"/.test(files['hands-report.yml']) && !/notify\.mjs problem/.test(files['hands-report.yml']) && /notify\.mjs resolve --key "hands\/\$JOB"/.test(files['hands-report.yml']), 'hands-report records an ops row on failure (never the owner\'s Telegram, K039) and resolves it on success');
{
  const ha = parseYaml(files['hands-alerts.yml']);
  ok(/vars\.ALERTS_TICK == 'on'/.test(ha.jobs.alerts.if) && /github\.event_name == 'workflow_dispatch'/.test(ha.jobs.alerts.if), 'the scheduled tick runs only with ALERTS_TICK=on (a skipped job starts no runner)');
  ok(ha.on.schedule.length === 1 && ha.on.schedule[0].cron === '23 5-19 * * *' && /450/.test(files['hands-alerts.yml']), 'the tick is hourly 08:00-22:00 Damascus and names its estimate');
  const hs2 = parseYaml(files['hands-settings.yml']).jobs.discover;
  ok(hs2.steps.filter((x) => /notify\.mjs (tick|digest)/.test(x.run || '')).every((x) => x.if === "always() && github.event_name == 'schedule'" && String(x['continue-on-error']) === 'true'), 'the daily tick and digest ride the drift check, scheduled runs only, and never fail it');
}
// hands-report's write log, as GitHub runs it (bash -e): download-artifact unpacks one artifact straight
// into logs/ and several into a folder each (v5 and later), and the step reads both
{
  ok(parseYaml("a:\n  run: |\n    grep -oE '[0-9]+$' x\n    echo \"$&\"\n").a.run === "grep -oE '[0-9]+$' x\necho \"$&\"\n", 'the YAML reader keeps a block\'s dollar signs as written');
  const step = parseYaml(files['hands-report.yml']).jobs.report.steps.find((x) => x.name === 'Log every write');
  const run = step.run.replace(/\$\{\{ github\.server_url \}\}/g, 'https://github.invalid').replace(/\$\{\{ github\.repository \}\}/g, 'o/hands').replace(/\$\{\{ github\.run_id \}\}/g, '99');
  const logged = async (layout) => {
    const dir = mkdtempSync(join(tmpdir(), 'hands-log-'));
    mkdirSync(join(dir, 'bin'));
    // a stand-in gh: the month's log issue exists as #7; a comment's body is kept
    writeFileSync(join(dir, 'bin/gh'), '#!/usr/bin/env bash\nif [ "$1 $2" = "issue list" ]; then echo 7; elif [ "$1 $2" = "issue comment" ]; then cat > "$OUT"; fi\n', { mode: 0o755 });
    for (const [f, text] of Object.entries(layout)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); }
    writeFileSync(join(dir, 'step.sh'), run);
    const out = join(dir, 'comment');
    const code = await new Promise((done) => execFile('bash', ['-e', join(dir, 'step.sh')], { cwd: dir, env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, OUT: out, JOB: 'hands-update', GITHUB_STEP_SUMMARY: join(dir, 'sum') } }, (err) => done(err ? err.code : 0)));
    const body = existsSync(out) ? readFileSync(out, 'utf8') : '';
    rmSync(dir, { recursive: true, force: true });
    return { code, body };
  };
  const one = await logged({ 'logs/log.txt': 'o/a: opened PR #1\no/a: nothing to do\n' });
  ok(one.code === 0 && /o\/a: opened PR #1/.test(one.body) && !/nothing to do/.test(one.body), 'hands-report logs the writes of a run with one log artifact (unpacked straight into logs/)');
  const two = await logged({ 'logs/log-a/log.txt': 'o/a: applied ruleset\n', 'logs/log-b/log.txt': 'o/b: opened PR #2\n' });
  ok(two.code === 0 && /o\/a: applied ruleset/.test(two.body) && /o\/b: opened PR #2/.test(two.body), 'hands-report logs the writes of a run with several log artifacts (a folder each)');
  const none = await logged({});
  ok(none.code === 0 && none.body === '', 'hands-report with no log artifact comments nothing and passes');
}
// every action in the control workflows is pinned by full commit, one commit per action across the files
{
  const uses = Object.values(files).flatMap((t) => [...t.matchAll(/uses: ([\w.-]+\/[\w./-]+)@(\S+)/g)].map((m) => [m[1], m[2]]));
  const pins = new Map();
  for (const [a, sha] of uses) pins.set(a, (pins.get(a) || new Set()).add(sha));
  ok(uses.length > 0 && uses.every(([, sha]) => /^[0-9a-f]{40}$/.test(sha)) && [...pins.values()].every((s) => s.size === 1), 'every control workflow action is pinned by full commit, the same commit in every file');
  // v2 of the token action removed the underscore inputs; v3 still takes app-id
  ok(!Object.values(files).some((t) => /^\s+(app_id|private_key|skip_token_revoke):/m.test(t)), 'no control workflow passes an input the App token action removed');
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
      if (rest === '/interaction-limits' && req.method === 'GET') return r.private ? send(405, { message: 'Interaction limits cannot be set on private repositories' }) : send(200, r.interaction || {});
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
  // export: a private repository answers 405 for interaction limits (it has none): the field is left out, not a failure
  const state = { ...world(), 'o/private': { private: true, file: null, repository: { ...matching.repository }, rulesets: [liveRuleset(true)], labels: [...matching.labels] },
    'o/limited': { file: null, repository: { ...matching.repository }, rulesets: [], labels: [], interaction: { limit: 'existing_users', origin: 'repository', expires_at: '2027-01-01T00:00:00Z' } } };
  const srv = await serve(state);
  const ex = await run(srv, ['export', '--repo', 'o/private']);
  let exported = null; try { exported = JSON.parse(ex.stdout); } catch { /* fails below */ }
  ok(ex.code === 0 && exported && !('interaction_limits' in exported) && exported.rulesets.length === 1 && exported.labels.length === matching.labels.length && /o\/private: interaction limits cannot be read here \(405/.test(ex.stderr),
    `export of a private repository leaves interaction limits out and says so, and exports the rest (exit ${ex.code})`);
  const lim = await run(srv, ['export', '--repo', 'o/limited']);
  ok(lim.code === 0 && JSON.parse(lim.stdout).interaction_limits?.limit === 'existing_users', 'export still writes an interaction limit a repository has');
  state['o/private'].file = { ...desired, interaction_limits: { limit: 'existing_users', expiry: 'six_months' } };
  const pl = await run(srv, ['plan', '--repo', 'o/private']);
  ok(pl.code !== 0 && /interaction-limits answered 405/.test(pl.stderr), 'a plan whose file names interaction limits on such a repository still fails: it could not apply them');
  srv.close();
}
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
  const mf = join(mkdtempSync(join(tmpdir(), 'matched-')), 'matched.txt');
  const dm = await run(srv, ['drift'], { HANDS_MATCHED_FILE: mf });
  ok(dm.code === 0 && readFileSync(mf, 'utf8') === 'o/same\n', `drift with HANDS_MATCHED_FILE lists the repositories that match their file, not one that differs (K062; ${JSON.stringify(readFileSync(mf, 'utf8'))})`);
  await run(srv, ['drift'], { HANDS_MATCHED_FILE: mf, HANDS_PAUSED: 'o/same' });
  ok(readFileSync(mf, 'utf8') === '', 'a paused repository is not listed as matching: its alert stays open (K062)');
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
  const marked = (name, end) => {
    const from = lines.findIndex((l) => l.includes(`# --- ${name} (test-hands runs this block) ---`));
    const to = lines.findIndex((l) => l.includes(`# --- end ${end} ---`));
    if (from < 0 || to < from) throw new Error(`hands-update.yml has no ${name} block`);
    const indent = lines[from].match(/^ */)[0].length;
    return lines.slice(from, to + 1).map((l) => l.slice(indent)).join('\n');
  };
  const block = marked('PR body', 'PR body'), helpers = marked('helpers', 'helpers');
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
    const script = ['set -euo pipefail', 'log() { echo "hands: $*"; }', 'current=0.7.0 target=0.8.0 verb=update branch=harness/kit-0.8.0', helpers, block, 'printf "BODY<<%s>>" "$body"'].join('\n');
    const out = spawnSync('bash', ['-c', script], { cwd: proj, encoding: 'utf8', env: { ...process.env, PATH: `${join(proj, 'bin')}:${process.env.PATH}`, GH_LOG: join(proj, 'gh.log'), REPO: 'o/r', SLUG: 'hands-app', FAKE_OPEN: '', FAKE_BODY: '', GITHUB_STEP_SUMMARY: '', ...env } });
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

// an older kit PR left open never merges and hides the new one (website, kit 0.10.0, Oct 2026): opening a
// new kit PR closes every other open kit PR of the App's in that repository, and only those
{
  const kitRoot = new URL('..', import.meta.url).pathname;
  const lines = readFileSync(join(kitRoot, '.harness/templates/hands/hands-update.yml'), 'utf8').split('\n');
  const from = lines.findIndex((l) => l.includes('# --- helpers (test-hands runs this block) ---'));
  const to = lines.findIndex((l) => l.includes('# --- end helpers ---'));
  if (from < 0 || to < from) throw new Error('hands-update.yml has no helpers block');
  const indent = lines[from].match(/^ */)[0].length;
  const block = lines.slice(from, to + 1).map((l) => l.slice(indent)).join('\n');
  const proj = mkdtempSync(join(tmpdir(), 'hands-superseded-'));
  mkdirSync(join(proj, 'bin'));
  // the stand-in gh answers the list as gh would after --jq: one "number branch" line per open PR
  writeFileSync(join(proj, 'bin/gh'), '#!/bin/sh\necho "$*" >> "$GH_LOG"\ncase "$1 $2" in\n  "pr list") printf "%b" "$FAKE_LIST" ;;\n  "pr close") [ -z "$FAKE_CLOSE_FAIL" ] || exit 1 ;;\n  "pr merge") [ -z "$FAKE_MERGE_FAIL" ] || { echo "GraphQL: Auto merge is not allowed for this repository" >&2; exit 1; } ;;\nesac\n', { mode: 0o755 });
  const run = (list, env = {}, call = 'supersede 380') => {
    writeFileSync(join(proj, 'gh.log'), '');
    const script = ['set -euo pipefail', 'log() { echo "hands: $*"; }', 'target=0.14.1 branch=harness/kit-0.14.1', block, call].join('\n');
    const out = spawnSync('bash', ['-c', script], { cwd: proj, encoding: 'utf8', env: { ...process.env, PATH: `${join(proj, 'bin')}:${process.env.PATH}`, GH_LOG: join(proj, 'gh.log'), REPO: 'o/r', SLUG: 'hands-app', FAKE_LIST: list, ...env } });
    return { ...out, gh: readFileSync(join(proj, 'gh.log'), 'utf8') };
  };
  let r = run('374 harness/kit-0.10.0\n380 harness/kit-0.14.1\n381 harness/settings-mirror\n382 harness/kit-0.9.x\n');
  const closed = r.gh.split('\n').filter((l) => l.startsWith('pr close'));
  ok(r.status === 0 && /^pr list --repo o\/r --state open --author app\/hands-app /m.test(r.gh) && closed.length === 1
    && closed[0] === 'pr close 374 --repo o/r --delete-branch --comment Superseded by #380 (kit 0.14.1); closed by hands-update.' && /closed #374 \(0\.10\.0\): superseded by #380/.test(r.stdout),
    'opening the 0.14.1 PR closes the App\'s open 0.10.0 kit PR with a comment naming the new one and deletes its branch; the new PR, other harness/ branches and malformed names are left open');
  r = run('');
  ok(r.status === 0 && !/pr close/.test(r.gh), 'no other kit PR open: nothing is closed');
  r = run('374 harness/kit-0.10.0\n', { FAKE_CLOSE_FAIL: '1' });
  ok(r.status !== 0, 'a close GitHub refused fails the step (one problem under the alert standard), never a silent pass');
  // a repository with auto-merge off (the website, 5-8 Oct 2026): the PR stays open, old ones still close,
  // and the failure names the setting instead of a bare GraphQL error
  r = run('374 harness/kit-0.10.0\n', { FAKE_MERGE_FAIL: '1' }, 'supersede 380; automerge 380');
  ok(r.status !== 0 && /pr close 374/.test(r.gh) && /^pr merge 380 --repo o\/r --auto --squash$/m.test(r.gh) && /FAIL: GitHub refused auto-merge on #380: turn on allow_auto_merge in o\/r's \.github\/harness-settings\.json/.test(r.stdout),
    'auto-merge refused: the superseded PR is still closed first, and the step fails naming allow_auto_merge');
  r = run('', {}, 'automerge 380');
  ok(r.status === 0 && /^pr merge 380 --repo o\/r --auto --squash$/m.test(r.gh) && /auto-merge is on for #380/.test(r.stdout), 'auto-merge allowed: it is turned on and the step goes on');
  // the project chose auto-merge off in its own settings file (the website, 8 Oct 2026, K023): a pass that
  // says its thread merges the PR, never a weekly failure waiting on the owner; any other refusal still fails
  mkdirSync(join(proj, '.github'));
  writeFileSync(join(proj, '.github/harness-settings.json'), JSON.stringify({ repository: { allow_auto_merge: false } }));
  r = run('374 harness/kit-0.10.0\n', { FAKE_MERGE_FAIL: '1' }, 'supersede 380; automerge 380');
  ok(r.status === 0 && /pr close 374/.test(r.gh) && /auto-merge is off by o\/r's own settings \(allow_auto_merge false\): #380 waits for its thread/.test(r.stdout) && !/FAIL/.test(r.stdout),
    'auto-merge off by the project\'s own settings: the step passes and says the thread merges the PR');
  writeFileSync(join(proj, '.github/harness-settings.json'), JSON.stringify({ repository: { allow_auto_merge: true } }));
  r = run('', { FAKE_MERGE_FAIL: '1' }, 'automerge 380');
  ok(r.status !== 0 && /FAIL: GitHub refused auto-merge on #380/.test(r.stdout), 'auto-merge declared on but refused: still one failure naming the setting');
  writeFileSync(join(proj, '.github/harness-settings.json'), '{ not json');
  r = run('', { FAKE_MERGE_FAIL: '1' }, 'automerge 380');
  ok(r.status !== 0 && /FAIL: GitHub refused auto-merge on #380/.test(r.stdout), 'an unreadable settings file is no opt-out: the refusal fails');
  rmSync(join(proj, '.github'), { recursive: true, force: true });
  const hu = readFileSync(join(kitRoot, '.harness/templates/hands/hands-update.yml'), 'utf8');
  const openPath = hu.slice(hu.indexOf('if [ -n "$open" ]; then'), hu.indexOf('# --- end PR body ---'));
  const newPath = hu.slice(hu.indexOf('url="$(gh pr create'), hu.indexOf('- name: Keep the PR current'));
  ok(/echo "pr=\$open"[\s\S]*supersede "\$open"[\s\S]*automerge "\$open"/.test(openPath) && /echo "pr=\$\{url##\*\/\}"[\s\S]*supersede "\$\{url##\*\/\}"[\s\S]*automerge "\$\{url##\*\/\}"/.test(newPath),
    'both paths (a PR found open, or opened now) record the PR first, then close superseded ones, then turn auto-merge on');
  rmSync(proj, { recursive: true, force: true });
  const hk = parseYaml(readFileSync(join(kitRoot, '.harness/templates/hands/hands-keep.yml'), 'utf8'));
  ok(hk.concurrency.group === 'hands-keep' && String(hk.concurrency['cancel-in-progress']) === 'true',
    'hands-keep: the newest run replaces an older one, so one run stuck before it starts never holds every later run back');
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
  ok(on && on.if === "always() && steps.open.outputs.pr != ''" && /hands-keep\.yml\/enable/.test(on.run) && /hands-keep\.yml\/dispatches/.test(on.run) && on.env.GH_TOKEN === '${{ github.token }}' && hu.permissions.actions === 'write',
    'hands-update turns hands-keep on and runs it once whenever a kit PR is open, with this repository\'s own token');
  ok((files['hands-update.yml'].match(/echo "pr=/g) || []).length === 2, 'both paths that leave a PR open (opened now, or found open) say so');
}

// --- K030: secret protections and interaction limits ---------------------------------------------
{
  const root = mkdtempSync(join(tmpdir(), 'hands-k030-'));
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(join(root, '.github/workflows/ci.yml'), 'on: pull_request\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n');
  const sa = { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } };
  const want = { ...desired, repository: { ...desired.repository, security_and_analysis: sa } };
  const liveSa = { ...matching, repository: { ...matching.repository, security_and_analysis: { ...sa, dependabot_security_updates: { status: 'disabled' } } } };
  ok(plan('o/r', want, liveSa).length === 0, 'security_and_analysis: a live object that names more keys still matches');
  const off = { ...matching, repository: { ...matching.repository, security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'disabled' } } } };
  const st = plan('o/r', want, off);
  ok(st.length === 1 && st[0].call.method === 'PATCH' && st[0].call.body.security_and_analysis.secret_scanning_push_protection.status === 'enabled', 'security_and_analysis: push protection off is turned on with one PATCH');
  ok(validate(want, root).length === 0, 'a file with security_and_analysis is valid');
  ok(validate({ ...desired, repository: { security_and_analysis: { secret_scanning: { status: 'on' } } } }, root).length > 0, 'a wrong status is refused');

  const now = Date.parse('2026-11-06T00:00:00Z');
  const il = { limit: 'existing_users', expiry: 'six_months' };
  const withIl = { ...desired, interaction_limits: il };
  const live = (x) => ({ ...matching, interaction_limits: x });
  const day = 86400000;
  ok(plan('o/r', withIl, live({ limit: 'existing_users', expires_at: new Date(now + 90 * day).toISOString() }), now).length === 0, 'interaction limits: 90 days left, nothing to do');
  const near = plan('o/r', withIl, live({ limit: 'existing_users', expires_at: new Date(now + 10 * day).toISOString() }), now);
  ok(near.length === 1 && near[0].call.method === 'PUT' && near[0].call.path === '/repos/o/r/interaction-limits' && JSON.stringify(near[0].call.body) === '{"limit":"existing_users","expiry":"six_months"}', 'interaction limits: 10 days left, applied again before GitHub lifts it');
  ok(plan('o/r', withIl, live({}), now).length === 1, 'interaction limits: an expired (absent) limit is applied again');
  ok(plan('o/r', withIl, live({ limit: 'collaborators_only', expires_at: new Date(now + 90 * day).toISOString() }), now).length === 1, 'interaction limits: a different live limit is replaced');
  ok(plan('o/r', { ...withIl, interaction_limits: { ...il, renew_days: 5 } }, live({ limit: 'existing_users', expires_at: new Date(now + 10 * day).toISOString() }), now).length === 0, 'interaction limits: renew_days sets the window');
  ok(plan('o/r', desired, live({}), now).length === 0, 'a file without interaction_limits leaves them alone');
  ok(validate({ ...desired, interaction_limits: { limit: 'existing_users', expiry: 'one_month' } }, root).some((e) => e.includes('renew_days')), 'a renewal window as long as the expiry is refused (it would re-apply every run)');
  ok(validate({ ...desired, interaction_limits: { ...il, renew_days: 61 } }, root).some((e) => e.includes('above 60')), 'the schema enforces maximum');
  ok(validate(withIl, root).length === 0, 'a six-month limit with the default window is valid');
  rmSync(root, { recursive: true, force: true });
}

// the control repository's workflows travel with its pin (K053): until 0.47.0 hands-update moved only
// HANDS_KIT_VERSION, and the copies stayed at whatever release a session last copied by hand
{
  const kitRoot = new URL('..', import.meta.url).pathname;
  const d = mkdtempSync(join(tmpdir(), 'hands-control-'));
  const mk = (name, version, wfs) => {
    const k = join(d, name);
    mkdirSync(join(k, '.harness/templates/hands'), { recursive: true });
    writeFileSync(join(k, '.harness/VERSION'), `${version}\n`);
    for (const [f, t] of Object.entries(wfs)) writeFileSync(join(k, '.harness/templates/hands', f), t);
    return k;
  };
  const was = mk('was', '1.0.0', { 'hands-a.yml': 'a1\n', 'hands-b.yml': 'b1\n', 'hands-gone.yml': 'gone\n' });
  const next = mk('next', '1.1.0', { 'hands-a.yml': 'a1\n', 'hands-b.yml': 'b2\r\n', 'hands-new.yml': 'new\n', 'README.md': 'not a workflow\n', 'other.yml': 'not a control workflow\n' });
  const ctl = join(d, 'control'), wf = join(ctl, '.github/workflows');
  mkdirSync(wf, { recursive: true });
  writeFileSync(join(ctl, 'HANDS_KIT_VERSION'), '1.0.0\n');
  for (const [f, t] of Object.entries({ 'hands-a.yml': 'a1\n', 'hands-b.yml': 'b1\n', 'hands-gone.yml': 'gone\n', 'hands-own.yml': 'own\n', 'ci.yml': 'ci\n' })) writeFileSync(join(wf, f), t);
  const r = controlUpdate(ctl, next, was);
  const at = (f) => readFileSync(join(wf, f), 'utf8');
  ok(r.version === '1.1.0' && readFileSync(join(ctl, 'HANDS_KIT_VERSION'), 'utf8') === '1.1.0\n' && at('hands-b.yml') === 'b2\r\n' && at('hands-new.yml') === 'new\n' && r.written.join() === 'hands-b.yml,hands-new.yml',
    'a control repository\'s update moves the pin AND copies each changed or new control workflow byte for byte from the target kit');
  ok(!existsSync(join(wf, 'hands-gone.yml')) && r.removed.join() === 'hands-gone.yml' && at('hands-own.yml') === 'own\n' && at('ci.yml') === 'ci\n' && !existsSync(join(wf, 'other.yml')) && !existsSync(join(wf, 'README.md')),
    'a workflow the new kit dropped is removed; the repository\'s own workflows are never touched, and nothing but hands-*.yml is copied');
  ok(r.paths.join() === 'HANDS_KIT_VERSION,.github/workflows/hands-a.yml,.github/workflows/hands-b.yml,.github/workflows/hands-gone.yml,.github/workflows/hands-new.yml',
    'it lists what the update PR stages: the pin, every kit workflow and each removed one, and nothing else');
  ok(controlUpdate(ctl, next, was).written.length === 0 && controlUpdate(ctl, next, null).removed.length === 0, 'run again it changes nothing; with no earlier kit named it removes nothing');
  const files = () => Object.fromEntries(readdirSync(wf).map((f) => [f, readFileSync(join(wf, f))]));
  ok(controlCopyProblems(files(), next).length === 0, 'after the update every kit workflow is the pinned kit\'s template');
  writeFileSync(join(wf, 'hands-a.yml'), 'a1 \n');
  rmSync(join(wf, 'hands-new.yml'));
  const cp = controlCopyProblems(files(), next);
  ok(cp.length === 2 && cp.some((p) => /^hands-a\.yml: differs/.test(p)) && cp.some((p) => /^hands-new\.yml: missing/.test(p)) && !cp.some((p) => /hands-own|ci\.yml/.test(p)),
    'a copy edited in the control repository, or one the pinned kit ships that is missing, is a problem; its own workflows are not judged');
  rmSync(join(wf, 'hands-b.yml')); symlinkSync(join(d, 'elsewhere'), join(wf, 'hands-b.yml'));
  let threw = false; try { controlUpdate(ctl, next, was); } catch (e) { threw = /symlink/.test(e.message); }
  ok(threw && !existsSync(join(d, 'elsewhere')), 'a copy that is a symlink is refused, never written through');
  let none = false; try { controlUpdate(ctl, mk('empty', '1.2.0', {}), was); } catch (e) { none = /ships no control workflows/.test(e.message); }
  ok(none, 'a kit that ships no control workflows (a wrong checkout) changes nothing and fails');

  // the command line, as hands-check and hands-update call it, against the real kit
  const tool = join(kitRoot, '.harness/tools/hands.mjs');
  const real = join(d, 'real');
  mkdirSync(join(real, '.github/workflows'), { recursive: true });
  const version = readFileSync(join(kitRoot, '.harness/VERSION'), 'utf8').trim();
  writeFileSync(join(real, 'HANDS_KIT_VERSION'), '0.0.1\n');
  const up = spawnSync(process.execPath, [tool, 'control-update', '--root', real, '--kit', kitRoot], { encoding: 'utf8' });
  const shipped = readdirSync(join(kitRoot, '.harness/templates/hands'));
  ok(up.status === 0 && up.stdout.trim().split('\n').length === shipped.length + 1 && up.stdout.startsWith('HANDS_KIT_VERSION\n') && readFileSync(join(real, 'HANDS_KIT_VERSION'), 'utf8').trim() === version
    && shipped.every((f) => readFileSync(join(real, '.github/workflows', f)).equals(readFileSync(join(kitRoot, '.harness/templates/hands', f)))),
    'control-update prints only the paths to stage on stdout and leaves the control repository at this kit, every template copied');
  let chk = spawnSync(process.execPath, [tool, 'control-check', real], { encoding: 'utf8' });
  ok(chk.status === 0 && /each kit workflow is the pinned kit's template/.test(chk.stdout), 'control-check passes a control repository whose copies are the pinned kit\'s templates');
  writeFileSync(join(real, '.github/workflows/hands-keep.yml'), `${readFileSync(join(real, '.github/workflows/hands-keep.yml'), 'utf8')}# edited here\n`);
  chk = spawnSync(process.execPath, [tool, 'control-check', real], { encoding: 'utf8' });
  ok(chk.status === 1 && /FAIL hands-keep\.yml: differs from the pinned kit's template/.test(chk.stdout), 'control-check fails a copy that drifted from the pinned kit\'s template (fails without K053)');
  writeFileSync(join(real, 'HANDS_KIT_VERSION'), '0.0.1\n');
  chk = spawnSync(process.execPath, [tool, 'control-check', real], { encoding: 'utf8' });
  ok(chk.status === 0 && !/pinned kit's template/.test(chk.stdout), 'run from a kit other than the pinned one, control-check does not judge the copies (it cannot)');

  // the workflow: the control repository's own PR stages what control-update lists, from the target tag
  const hu = readFileSync(join(kitRoot, '.harness/templates/hands/hands-update.yml'), 'utf8');
  const own = hu.slice(hu.indexOf('node "$tool" paths --root . > "$RUNNER_TEMP/paths"'), hu.indexOf('id="$(gh api "/users/'));
  ok(/git clone --quiet --depth 1 --branch "v\$target" [^\n]+ "\$RUNNER_TEMP\/kit-target"/.test(own) && /hands\.mjs" control-update --root \. --kit "\$RUNNER_TEMP\/kit-target" --was "\$GITHUB_WORKSPACE\/kit" > "\$RUNNER_TEMP\/paths"/.test(own)
    && !/echo HANDS_KIT_VERSION > /.test(hu) && /git add -A --pathspec-from-file="\$RUNNER_TEMP\/paths"/.test(hu) && /permission-workflows: write/.test(hu),
    'hands-update: this repository\'s own PR takes the target release\'s templates through the pinned kit\'s control-update and stages exactly its list');
  rmSync(d, { recursive: true, force: true });
}

// --- its GitHub client, pinned before the clean-up that shares it (0.56.1): what it sends, how it answers
const pinServer = async () => {
  const seen = [];
  const s = createServer((q, res) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => {
    seen.push({ method: q.method, url: q.url, h: q.headers, body: b });
    const p = q.url.split('?')[0];
    const [code, text] = p.includes('/no') ? [422, '{"message":"no"}'] : p === '/empty' ? [200, ''] : p === '/text' ? [200, 'plain'] : p.startsWith('/repos/') ? [200, '[]'] : [200, '{"a":1}'];
    res.writeHead(code); res.end(text);
  }); });
  await new Promise((d) => s.listen(0, '127.0.0.1', d));
  const was = { GITHUB_API_URL: process.env.GITHUB_API_URL, GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
  process.env.GITHUB_API_URL = `http://127.0.0.1:${s.address().port}`;
  return { seen, done: () => { s.close(); for (const [k, v] of Object.entries(was)) if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
};
const failure = async (f) => { try { await f(); return null; } catch (e) { return e; } };
{
  const p = await pinServer();
  process.env.GH_TOKEN = 'PIN';
  const got = [await api('GET', '/x'), await api('GET', '/empty'), await api('GET', '/text'), await api('GET', '/no?page=2'), await api('PATCH', '/x', { a: 1 })];
  process.env.HANDS_READ_ONLY = '1';
  const e = await failure(() => api('PUT', '/x', { a: 1 }));
  const reads = await api('GET', '/x');
  delete process.env.HANDS_READ_ONLY;
  const [g, , , , patch] = p.seen, calls = p.seen.length; p.done();
  ok(got[0].status === 200 && got[0].data.a === 1 && got[1].data === null && got[2].data === 'plain' && got[3].status === 422 && got[3].data.message === 'no' && got[4].status === 200,
    'its GitHub client never throws on an HTTP answer: the status and the parsed JSON (null when empty, the text when not JSON)');
  ok(g.h.authorization === 'Bearer PIN' && g.h['user-agent'] === 'harness-hands' && !g.h['content-type'] && patch.h['content-type'] === 'application/json' && JSON.parse(patch.body).a === 1,
    'it sends GH_TOKEN, its own user-agent, and a JSON body only with data');
  ok(e?.message === 'refused PUT /x: HANDS_READ_ONLY is set' && reads.status === 200 && calls === 6, 'with HANDS_READ_ONLY set it refuses every write before any call, and still reads');
}

console.log(`test-hands: OK · ${n} checks`);
