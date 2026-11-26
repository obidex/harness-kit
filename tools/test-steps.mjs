#!/usr/bin/env node
// test-steps — the runbook linter's three checks (K070), offline.
//
//   node tools/test-steps.mjs        exit 0 = every case held

import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lint, steps, tables, isRunbook } from '../.harness/tools/steps.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-steps: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-steps: ok ${n}. ${what}`); };

const good = `# A runbook

Why it exists, in one line.

1. Read the queue: \`tool.mjs pending --repo o/r\`. Check: it prints a list, \`[]\` when empty.
2. Take each item, oldest first.
   1. Move it: \`tool.mjs state --to working\`.
   2. Do the work.

   Check: the item shows working.
3. Decide whether the owner must hear of it. No command: a judgment on the item's text.
   Check: the closing note names it, or says none.
4. Build it:
   \`\`\`
   npm run build
   \`\`\`
   Check: exit 0.

| What goes wrong | Do |
|---|---|
| \`pending\` answers 403 | attach the repository with push access, then run it again |
| the build fails | read the first error line and fix that file |
`;
const r = lint(good);
ok(r.problems.length === 0 && r.steps === 4, 'a runbook with numbered steps, a command and a check each, and a failure table passes');
ok(r.nocmd.length === 1, 'a step that declares "No command:" is counted, not hidden');
ok(steps(good)[1].lines.some((l) => /state --to working/.test(l)), 'indented sub-steps belong to their step');

const noCheck = good.replace('Check: it prints a list, `[]` when empty.', '');
ok(lint(noCheck).problems.some((p) => /step 1 has no "Check:"/.test(p.what)), 'a step without a Check: fails');
const noCmd = good.replace('Read the queue: `tool.mjs pending --repo o/r`.', 'Read the queue.');
ok(lint(noCmd).problems.some((p) => /step 1 has no command/.test(p.what)), 'a step without a command or a "No command:" fails');
ok(lint(good.replace(/\| What goes wrong[\s\S]*$/, '')).problems.some((p) => /no failure table/.test(p.what)), 'a runbook without a failure table fails');
ok(lint(good.replace('read the first error line and fix that file', 'try again')).problems.some((p) => /only says "try again"/.test(p.what)), 'a fix that only says "try again" fails');
ok(lint(good.replace('read the first error line and fix that file', ' ')).problems.some((p) => /has no fix/.test(p.what)), 'a failure with an empty fix fails');
ok(lint(good.replace('read the first error line and fix that file', 'Retry.')).problems.some((p) => /only says/.test(p.what)), '"Retry." alone is not a fix');
ok(lint('# Prose only\n\nNo steps here.\n\n| If | Do |\n|---|---|\n| x | check y |\n').problems.some((p) => /no numbered steps/.test(p.what)), 'a file with no numbered list fails');
ok(tables('```\n| a | b |\n|---|---|\n| 1 | 2 |\n```\n').length === 0, 'a table inside a code fence is not a table');
ok(steps('```\n1. not a step\n```\n1. a step `x` Check: y\n').length === 1, 'a numbered line inside a code fence is not a step');
ok(steps('1. one `a` Check: b\n\nA paragraph at column 0.\n\n2. two `c` Check: d\n').every((s) => !s.lines.some((l) => /paragraph/.test(l))), 'a paragraph after a blank line ends the step above it');
ok(isRunbook('x/SKILL.md', '') && isRunbook('a.md', 'x\n<!-- runbook -->\n') && !isRunbook('a.md', '# notes'), 'a SKILL.md or a marked file is checked; any other file is skipped');

// the command
const dir = mkdtempSync(join(tmpdir(), 'steps-'));
mkdirSync(join(dir, 's'));
writeFileSync(join(dir, 's/SKILL.md'), good);
writeFileSync(join(dir, 'bad.md'), `<!-- runbook -->\n${noCheck}`);
writeFileSync(join(dir, 'notes.md'), '# notes\n');
const tool = new URL('../.harness/tools/steps.mjs', import.meta.url).pathname;
const run = (args) => new Promise((done) => execFile('node', [tool, ...args], (e, out) => done({ code: e ? e.code : 0, out })));
let x = await run([join(dir, 's/SKILL.md'), join(dir, 'notes.md')]);
ok(x.code === 0 && /OK · 4 steps \(1 with "No command:"/.test(x.out) && /notes\.md: skipped/.test(x.out), 'the command passes a good skill and names a skipped file');
x = await run([join(dir, 's/SKILL.md'), join(dir, 'bad.md')]);
ok(x.code === 1 && /bad\.md:\d+: step 1 has no "Check:"/.test(x.out), 'the command fails with file:line for a marked runbook that breaks a check');
x = await run([]);
ok(x.code === 2, 'no file is a usage error');

// the kit's own: every skill and every marked runbook passes the three checks
const kit = new URL('..', import.meta.url).pathname;
const mine = [];
const walk = (d) => { for (const e of readdirSync(join(kit, d), { withFileTypes: true })) {
  const p = join(d, e.name);
  if (e.isDirectory()) { if (!['.git', 'node_modules'].includes(e.name)) walk(p); }
  else if (e.name.endsWith('.md') && isRunbook(p, readFileSync(join(kit, p), 'utf8'))) mine.push(p);
} };
walk('.');
const bad = mine.flatMap((p) => lint(readFileSync(join(kit, p), 'utf8')).problems.map((q) => `${p}:${q.line}: ${q.what}`));
ok(mine.some((p) => /SKILL\.md$/.test(p)) && mine.some((p) => /papercuts\.md$/.test(p)) && bad.length === 0, `the kit's ${mine.length} skills and runbooks pass${bad.length ? `: ${bad.join('; ')}` : ''}`);
console.log(`test-steps: OK · ${n} cases`);
