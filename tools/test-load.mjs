#!/usr/bin/env node
// test-load — the always-loaded set and its token budget (C17, K034), offline on fixtures.
//
//   node tools/test-load.mjs        exit 0 = every case held

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { importsOf, conditional, loadSet, budgetOf, tokens, DEFAULT_BUDGET } from '../.harness/tools/load.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-load: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-load: ok ${n}. ${what}`); };
const kit = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'load-'));
const put = (root, p, text) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), text); };

// imports: line start, mid-line, relative; never in code
ok(JSON.stringify(importsOf('@AGENTS.md\nsee @docs/a.md and (@./b.md)\n')) === '["AGENTS.md","docs/a.md","./b.md"]', 'imports at line start, mid-line and in parentheses are found');
ok(importsOf('`@AGENTS.md` is quoted\n```\n@inside.md\n```\n~~~md\n@tilde.md\n~~~\n').length === 0, 'an @ in inline code or a fence is not an import');
ok(importsOf('mail me at a@b.com').length === 0, 'an email address is not an import');

// conditional rules
ok(conditional('---\npaths:\n  - "src/**"\n---\nrule') === true, 'a rule file with paths: frontmatter is conditional');
ok(conditional('---\ndescription: x\n---\nrule') === false && conditional('rule\npaths: x') === false, 'frontmatter without paths:, or paths: in the body, loads always');

// a checkout
const r = join(tmp, 'p');
put(r, 'CLAUDE.md', '# x\n@.harness/core.md\n@AGENTS.md\n@AGENTS.md\nAsk @owner. `@not.md`\n@../outside.md\n');
put(r, '.harness/core.md', 'c'.repeat(700));
put(r, 'AGENTS.md', 'a'.repeat(350) + '\n@docs/one.md\n');
put(r, 'docs/one.md', '@two.md\n');
put(r, 'docs/two.md', '@three.md\n@one.md\n');       // a cycle back to one.md
put(r, 'docs/three.md', '@four.md\n');
put(r, 'docs/four.md', '@five.md\n');
put(r, 'docs/five.md', '@six.md\n');                  // hop 5 from CLAUDE.md: its imports are not followed
put(r, 'docs/six.md', 'six'.repeat(100));
put(tmp, 'outside.md', 'x'.repeat(5000));
put(r, '.claude/rules/always.md', 'r'.repeat(70));
put(r, '.claude/rules/mod/sales.md', '---\npaths:\n  - "src/sales/**"\n---\n' + 's'.repeat(3000));
const set = loadSet(r);
const paths = set.files.map((f) => f.path);
ok(paths.includes('.harness/core.md') && paths.includes('AGENTS.md') && paths.includes('docs/one.md'), 'imports are followed recursively, relative to the importing file');
ok(paths.filter((p) => p === 'AGENTS.md').length === 1 && paths.filter((p) => p === 'docs/one.md').length === 1, 'a file imported twice, or through a cycle, counts once');
ok(paths.includes('docs/four.md') && !paths.includes('docs/five.md'), 'imports stop at 5 hops from CLAUDE.md, as Claude Code does');
ok(!paths.some((p) => p.includes('outside') || p.includes('owner') || p.includes('not.md')), 'paths outside the checkout, mentions and quoted @ are not loaded');
ok(paths.includes('.claude/rules/always.md') && !paths.includes('.claude/rules/mod/sales.md') && set.conditional.length === 1, 'unconditional rules count; a paths: rule is listed as conditional, outside the total');
ok(set.bytes === set.files.reduce((s, f) => s + f.bytes, 0) && set.tokens === tokens(set.bytes) && tokens(7) === 2 && tokens(3500) === 1000, 'the estimate is bytes / 3.5, rounded up');

// budget
ok(budgetOf(r) === DEFAULT_BUDGET, 'without a profile the default budget applies');
put(r, '.harness/profile.json', JSON.stringify({ canon: { load_budget_tokens: 200 } }));
ok(budgetOf(r) === 200, "the profile's canon.load_budget_tokens is the budget");
const cli = (...a) => spawnSync(process.execPath, [join(kit, '.harness/tools/load.mjs'), ...a], { encoding: 'utf8' });
let res = cli(r);
ok(res.status === 1 && /over the budget of 200/.test(res.stderr), 'over the budget the CLI exits 1 and says so');
res = cli(r, '--budget', '100000');
ok(res.status === 0 && /about \d+ tokens of a budget of 100000/.test(res.stdout), '--budget overrides; under it the CLI exits 0');
res = cli(join(tmp, 'empty'));
ok(res.status === 1, 'a checkout with no CLAUDE.md fails rather than passing on nothing');

// audit C17 reports the budget
const prof = JSON.parse(readFileSync(join(kit, 'examples/profile.example.json'), 'utf8'));
const a = join(tmp, 'a');
put(a, 'CLAUDE.md', '@AGENTS.md\n');
put(a, 'AGENTS.md', 'x'.repeat(4000));
put(a, prof.canon.decisions, '# d\n');
for (const g of prof.canon.generated || []) put(a, g, 'g');
const audit = (budget) => {
  put(a, '.harness/profile.json', JSON.stringify({ ...prof, canon: { ...prof.canon, caps: {}, load_budget_tokens: budget } }));
  const g = (...x) => spawnSync('git', ['-C', a, ...x], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'fixture');
  spawnSync(process.execPath, [join(kit, '.harness/tools/audit.mjs'), a, '--json', join(tmp, 'out.json')], { encoding: 'utf8' });
  const out = JSON.parse(readFileSync(join(tmp, 'out.json'), 'utf8'));
  return (out.results || out).find((x) => x.id === 'C17');
};
let c17 = audit(1000);
ok(c17.result === 'FAIL' && new RegExp(`always-loaded set about ${tokens(4011)} tokens > budget 1000`).test(c17.evidence), 'audit C17 FAILs when the always-loaded set is over the budget');
c17 = audit(5000);
ok(!/always-loaded set about \d+ tokens >/.test(c17.evidence) && new RegExp(`always-loaded set about ${tokens(4011)} of 5000 tokens|generated`).test(c17.evidence), 'under the budget C17 does not raise it');

rmSync(tmp, { recursive: true, force: true });
console.log(`test-load: OK · ${n} cases`);
