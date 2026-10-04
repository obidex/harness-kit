#!/usr/bin/env node
// test-hands — settings as code and the control repository's guards (K007), offline.
//
//   node tools/test-hands.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { plan, covers, validate, controlProblems } from '../.harness/tools/hands.mjs';

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
rmSync(root, { recursive: true, force: true });

// the control repository: the App key only on main, never on a repository event
const tpl = join(new URL('..', import.meta.url).pathname, '.harness/templates/hands');
const files = Object.fromEntries(readdirSync(tpl).map((f) => [f, readFileSync(join(tpl, f), 'utf8')]));
ok(controlProblems(files).length === 0, `the shipped control workflows pass (${Object.keys(files).join(', ')})`);
const onPr = files['hands-settings.yml'].replace('on:\n  schedule:', 'on:\n  pull_request:\n  schedule:');
ok(controlProblems({ 'x.yml': onPr }).some((p) => p.includes('repository event')), 'a keyed workflow on pull_request is refused');
const unguarded = files['hands-settings.yml'].replaceAll("github.ref == 'refs/heads/main'", 'true');
ok(controlProblems({ 'x.yml': unguarded }).some((p) => p.includes('main-branch guard')), 'a keyed workflow without the main guard is refused');

console.log(`test-hands: OK · ${n} checks`);
