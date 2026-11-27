#!/usr/bin/env node
// test-ci-repeats — where runner time goes (K078), offline: hand-made runs, the host's tab-separated
// records, and a stand-in GitHub over HTTP for the reader.
//
//   node tools/test-ci-repeats.mjs        exit 0 = every case held

import { createServer } from 'node:http';
import { analyse, fromTsv, render, readRepo, minutes, isBaseMerge, mergedPr, isBot, defaultBranch, mainCheck, linkPulls, CAUSES } from '../.harness/tools/ci-repeats.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-ci-repeats: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-ci-repeats: ok ${n}. ${what}`); };

const T0 = Date.parse('2026-11-20T00:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
let id = 1;
/** A run with one job `test` that holds a runner from `start` for `mins` minutes. */
const run = (o) => {
  const r = { id: id++, attempt: 1, workflow: 'ci', event: 'pull_request', conclusion: 'success', created: at(o.t), updated: at(o.t + (o.mins ?? 10)), head_sha: o.sha, tree: o.tree ?? `t-${o.sha}`,
    pr: o.pr ?? null, head_branch: o.branch ?? 'feat', author: o.author ?? 'Person', message: o.message ?? 'a change', ...o.r };
  r.jobs = o.jobs ?? [{ name: 'test', attempt: r.attempt, runner: o.runner === undefined ? 'box-1' : o.runner, started: at(o.t + (o.wait ?? 0)), completed: at(o.t + (o.wait ?? 0) + (o.mins ?? 10)), conclusion: o.job ?? r.conclusion }];
  return r;
};
const W = { start: T0, end: T0 + 7 * 86400000 };

// --- the words ---------------------------------------------------------------------------------------
ok(isBaseMerge("Merge branch 'main' into feat", 'main') && isBaseMerge("Merge remote-tracking branch 'origin/main' into feat", 'main') && isBaseMerge("Merge branch 'master' of https://x into feat", 'master')
  && !isBaseMerge("Merge branch 'main' into feat", 'master') && !isBaseMerge('Merge pull request #4 from a/b', 'main') && !isBaseMerge('fix: merge two lists', 'main'),
  'a merge of the default branch into a pull request is told from other merges, by git\'s own message');
ok(mergedPr('Add a thing (#123)') === 123 && mergedPr('Add a thing (#123)\n\nbody') === 123 && mergedPr('Fix #12 crash') === null && isBot('github-actions[bot]') && isBot('obidex-hands[bot]') && !isBot('Obada'),
  'a squash merge names its pull request by "(#N)" at the end of its first line; a bot\'s name ends in [bot]');
ok(minutes({ runner: 'box', started: at(0), completed: at(7) }) === 7 && minutes({ runner: null, started: at(0), completed: at(30) }) === 0 && minutes({ runner: 'box', started: at(5), completed: at(5) }) === 0,
  'a job that GitHub cancelled while it waited (a start time, no runner) held no machine: 0 minutes, however long it waited');

// --- one pull request through every cause ---------------------------------------------------------------
id = 1;
const runs = [
  run({ t: 0, sha: 'a1' }),                                                                      // change: first test of a1
  run({ t: 20, sha: 'a1', r: { attempt: 2 } }),                                                  // same: re-run of a passed job
  run({ t: 40, sha: 'a1', mins: 2, job: 'cancelled', r: { conclusion: 'cancelled' } }),          // same: an edited title restarts it, cancelled after 2 min
  run({ t: 45, sha: 'b1' , job: 'failure', r: { conclusion: 'failure' } }),                      // change: a new commit, red
  run({ t: 60, sha: 'b1', r: { attempt: 2 } }),                                                  // retry: the same content after a failure
  { ...run({ t: 70, sha: 'main1', tree: 'tm1', r: { event: 'push', head_branch: 'main', message: 'Other change (#9)' } }) },  // main: new content on main
  run({ t: 80, sha: 'c1', message: "Merge branch 'main' into feat" }),                           // base: main merged in
  run({ t: 100, sha: 'd1', author: 'github-actions[bot]', message: 'docs: regenerate' }),         // bot: a regeneration on a person's PR
  run({ t: 120, sha: 'merge7', tree: 't-d1', r: { event: 'push', head_branch: 'main', message: 'Add a thing (#7)' } }),       // same: main on the tree tested green on the PR
  run({ t: 130, sha: 'x', r: { event: 'schedule', head_branch: 'main' } }),                      // other
  run({ t: 140, sha: 'q', runner: null, mins: 50, job: 'cancelled', r: { conclusion: 'cancelled' } }),  // queued, then dropped: 0 minutes
];
const pulls = [{ number: 7, branch: 'feat', created: at(-5), closed: at(120) }];
const a = analyse(runs, { ...W, pulls });
ok(a.base === 'main' && a.minutes.change === 20 && a.minutes.same === 22 && a.minutes.retry === 10 && a.minutes.base === 10
  && a.minutes.bot === 10 && a.minutes.main === 10 && a.minutes.other === 10,
  'each job attempt lands in one cause: change, same (a passed re-run, a restart, main on a tree already green), retry, base, bot, main, other');
const sum = CAUSES.reduce((s, c) => s + a.minutes[c], 0);
ok(Math.abs(sum - a.minutes.total) < 0.01 && a.minutes.total === 92 && a.minutes.cancelled === 2,
  'the causes add up to the total (no overlap); "cancelled" is a flag inside its cause, never a cause of its own');
ok(a.minutes.avoidable === 32 && a.avoidablePerWeek === Math.round((32 / 60) * 10) / 10 && a.minutes.ci === 82,
  'avoidable = same + bot, scaled to a week; CI time leaves out what no change started');
ok(a.merged === 2 && a.readyToGreen.measured === 1 && a.readyToGreen.medianMinutes === 65 && a.check === 'ci',
  'ready to green runs from the first run on the last own commit to the moment its merged head was green (here 45 to 110 min: the merge of main and the regeneration on top count against it)');
ok(a.checkRunsPerMerge.measured === 2 && a.checkRunsPerMerge.median !== null && linkPulls([{ event: 'pull_request', head_branch: 'feat', created: at(500) }], pulls)[0].pr === undefined,
  'a run is tied to its pull request by the branch while that pull request was open; a run after it closed is not');

// --- the default branch moving under a pull request ----------------------------------------------------
id = 100;
const moved = analyse([
  run({ t: 0, sha: 'h' }),
  run({ t: 10, sha: 'm2', r: { event: 'push', head_branch: 'main', message: 'x (#3)' } }),
  run({ t: 20, sha: 'h' }),                     // the same head after main moved: a new combination
  run({ t: 40, sha: 'h' }),                     // and again on that same base: tested already
], W);
ok(moved.minutes.base === 10 && moved.minutes.same === 10, 'the same head after the default branch moved is base (worth its minutes); on an unmoved base it is same');

id = 200;
const notRun = analyse([
  run({ t: 0, sha: 'h', runner: null, mins: 30, job: 'cancelled', r: { conclusion: 'cancelled' } }),   // waited, dropped
  run({ t: 31, sha: 'h' }),                                                                            // its restart is the first real test
], W);
ok(notRun.minutes.change === 10 && notRun.hours.same === 0, 'a restart after a run that only waited is the first real test (change), not a repeat');

id = 300;
const botPr = analyse([run({ t: 0, sha: 'k', author: 'obidex-hands[bot]', branch: 'harness/kit' }), run({ t: 10, sha: 'k2', author: 'obidex-hands[bot]', branch: 'harness/kit' })], W);
ok(botPr.minutes.change === 20 && botPr.hours.bot === 0, 'a bot\'s own pull request (a kit update) is its change, not a regeneration');
ok(defaultBranch([{ event: 'push', head_branch: 'master' }, { event: 'push', head_branch: 'master' }, { event: 'push', head_branch: 'x' }]) === 'master'
  && mainCheck([{ event: 'pull_request', workflow: 'harness-guard', jobs: [{ runner: 'b', started: at(0), completed: at(60) }] }, { event: 'pull_request', workflow: 'CI', jobs: [{ runner: 'b', started: at(0), completed: at(5) }] }]) === 'CI',
  'the default branch is where most push runs went; the project\'s check is its biggest pull-request workflow, the kit\'s chores left out');

// --- the host's records -----------------------------------------------------------------------------
const tsvRuns = [
  ['o/r', 1, 1, 'ci', 'pull_request', 'success', at(0), at(10), 'a1', 't1', '-', 'feat', 'Person', 'a change'],
  ['o/r', 1, 2, 'ci', 'pull_request', 'success', at(0), at(30), 'a1', 't1', '-', 'feat', 'Person', 'a change'],
  ['o/r', 2, 1, 'ci', 'push', 'success', at(40), at(50), 'm', 't1', '-', 'main', 'Person', 'a change (#5)'],
].map((f) => f.join('\t')).join('\n');
const tsvJobs = [
  ['o/r', 1, 1, 'test', 'box', at(0), at(10), 'success'],
  ['o/r', 1, 2, 'test', 'box', at(20), at(30), 'success'],
  ['o/r', 2, 1, 'test', 'box', at(40), at(50), 'success'],
  ['o/r', 9, 1, 'test', 'box', at(40), at(50), 'success'],
].map((f) => f.join('\t')).join('\n');
const byRepo = fromTsv(tsvRuns, tsvJobs, ['o/r', 5, 'feat', at(-1), at(40)].join('\t'));
const h = analyse(byRepo.get('o/r'), W);
ok(byRepo.get('o/r').length === 2 && byRepo.get('o/r')[0].attempt === 2 && byRepo.get('o/r')[0].pr === 5 && byRepo.get('o/r')[0].jobs.length === 2 && h.minutes.same === 20 && h.minutes.change === 10,
  'a host\'s tab-separated records give the same numbers: a run\'s newest attempt row describes it, jobs keep their own attempt, a job of an unknown run is dropped, pulls link runs');
ok(fromTsv('not\ta\trow\n\n', 'x').size === 0, 'a malformed record is skipped, never guessed');

const md = render([{ repo: 'o/r', ...a, partial: ['call budget spent: later runs are not counted'] }, { repo: 'o/s', error: 'GET /x: HTTP 403', partial: [] }]);
ok(/\| o\/r \| 0\.5 \(/.test(md) && /\| o\/s \| \? \|/.test(md) && /partial, call budget/.test(md) && !/a change|Person|docs: regenerate|Add a thing/.test(md),
  'the page carries counts only (no title, message or name); an unread repository is "?", and a cut read says partial');

// --- the reader, against a stand-in GitHub -------------------------------------------------------------
const calls = [];
const server = createServer((req, res) => {
  calls.push(req.url);
  const u = new URL(req.url, 'http://x');
  const send = (b) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (u.pathname === '/repos/o/r') return send({ default_branch: 'main' });
  if (u.pathname === '/repos/o/r/pulls') return send([{ number: 7, head: { ref: 'feat' }, created_at: at(-60), closed_at: null, updated_at: at(0) }]);
  if (u.pathname === '/repos/o/r/actions/runs') {
    const day = u.searchParams.get('created');
    return send({ workflow_runs: day === '2026-11-20' ? [{ id: 11, run_attempt: 1, name: 'ci', event: 'pull_request', conclusion: 'success', created_at: at(1), updated_at: at(11), head_sha: 'a', head_commit: { tree_id: 'ta', message: 'x', author: { name: 'P' } }, pull_requests: [], head_branch: 'feat' },
      { id: 12, run_attempt: 1, name: 'ci', event: 'pull_request', conclusion: null, created_at: at(2), updated_at: at(2), head_sha: 'b', head_commit: { tree_id: 'tb' }, pull_requests: [], head_branch: 'feat' }] : [] });
  }
  if (/\/actions\/runs\/11\/jobs$/.test(u.pathname)) return send({ jobs: [{ name: 'test', run_attempt: 1, runner_name: 'box', started_at: at(1), completed_at: at(11), conclusion: 'success' }] });
  res.writeHead(404); res.end('{}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.GITHUB_API_URL = `http://127.0.0.1:${server.address().port}`;
const read = await readRepo('o/r', { start: T0, end: T0 + 86400000, history: 0, budget: { left: 100 } });
ok(read.base === 'main' && read.runs.length === 2 && read.runs[0].jobs.length === 1 && read.runs[1].jobs.length === 0 && !calls.some((c) => /runs\/12\/jobs/.test(c)) && read.pulls[0].branch === 'feat',
  'the reader lists the runs day by day and reads jobs only of finished runs (one call each), with the pull requests to link them');
const cut = await readRepo('o/r', { start: T0, end: T0 + 86400000, history: 0, budget: { left: 3 } });
ok(cut.partial.some((p) => /call budget/.test(p)), 'a read that meets its call budget stops and says partial (GitHub\'s hourly limit is shared with every agent on the account)');
server.close();

console.log(`test-ci-repeats: OK · ${n} checks`);
