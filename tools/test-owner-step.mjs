#!/usr/bin/env node
// test-owner-step — the plan-stage list and the `Tried:` line (O17, O02, O04; K058), offline.
//
//   node tools/test-owner-step.mjs        exit 0 = every case held

import { spawnSync } from 'node:child_process';
import { planProblems, askProblems, designs } from '../.harness/tools/owner-step.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-owner-step: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-owner-step: ok ${n}. ${what}`); };
const tool = new URL('../.harness/tools/owner-step.mjs', import.meta.url).pathname;
const run = (cmd, text) => spawnSync(process.execPath, [tool, cmd, '-'], { input: text, encoding: 'utf8' });

// --- plan: a card with an owner step lists the designs that need no one ---------------------------
const tokenCard = `**Goal:** narrow the server's login.
**Acceptance:** 1. the old login is gone.
Owner step: one fine-grained token, made by him from a prefilled link and pasted on the box.`;
ok(planProblems(tokenCard).some((p) => /no "No-one designs" list/.test(p)), 'a card with an owner step and no list of designs fails (the infra#194 shape)');
ok(run('plan', tokenCard).status === 1, 'the CLI exits 1 on that card');

const noReasons = `${tokenCard}

## No-one designs
- made on the machine where it lives
- moved as a file nobody opens
- the box signs in as a GitHub App`;
ok(planProblems(noReasons).filter((p) => /gives no reason/.test(p)).length === 3, 'designs listed without why each fails or fits fail, each named');

const missingApp = `${tokenCard}

## No-one designs
- made on the machine where it lives — fails: the token is made on GitHub's page, not on the box
- moved as a file nobody opens — fails: there is no file, the page shows it once`;
ok(planProblems(missingApp).some((p) => /signs in as an App/.test(p)), 'a secret step whose list misses the App design fails (O04)');

const full = `${missingApp}
- the box signs in as a GitHub App with short-lived tokens — fits: build it first; the owner step goes`;
ok(planProblems(full).length === 0 && run('plan', full).status === 0, 'a card listing all three no-carry designs, each with its reason, passes');
ok(designs(full).length === 3 && designs('no list here') === null, 'designs() reads the list and returns null when there is none');

const plainStep = `**Goal:** a new account.
The owner makes the account (a new account is his alone).

**No-one designs:** an agent cannot hold an account in his name — fails: the account is his`;
ok(planProblems(plainStep).length === 0, 'an inline list after the heading counts; a step with no secret needs no secret designs');

const noStep = `**Goal:** faster checks.\n**Acceptance:** 1. the suite runs side by side.`;
ok(planProblems(noStep).length === 0 && run('plan', noStep).status === 0, 'a card with no owner step passes untouched');
ok(planProblems(`Owner step: none.\n<!-- No-one designs -->`).some((p) => /no "No-one designs"/.test(p)), 'a list hidden in an HTML comment does not count');

// --- ask: a message that waits on the owner carries the Tried: line -------------------------------
const bare = `Server login: the new token is ready to make.
Make it from the link, paste it in the window.
WAITING FOR YOU — make the token (2 min)`;
ok(askProblems(bare).some((p) => /no line beginning "Tried:"/.test(p)), 'a WAITING FOR YOU message without a Tried: line fails');
ok(run('ask', bare).status === 1, 'the CLI exits 1 on it');

const partial = `${bare.replace('WAITING FOR YOU', 'Tried: redesign: the App needs a setting only he may change; API: no endpoint makes this token\nWAITING FOR YOU')}`;
const pp = askProblems(partial);
ok(pp.some((p) => /terminal/.test(p)) && pp.some((p) => /browser/.test(p)) && !pp.some((p) => /redesign|API/.test(p)), 'a Tried: line missing rungs names exactly the missing ones');

const empty = `Tried: redesign; API or script; terminal; browser\nWAITING FOR YOU — tap the number`;
ok(askProblems(empty).filter((p) => /not what stopped it/.test(p)).length === 4, 'rungs named without what stopped them fail, each');

const good = `Server login: one tap left.
Tried: redesign: an App login needs his account to create the App; API or script: GitHub has no API for it; terminal (Remote Control): done, the block ran; browser: page asks for his two-step code
WAITING FOR YOU — tap the number GitHub Mobile shows (1 action, under a minute)`;
ok(askProblems(good).length === 0 && run('ask', good).status === 0, 'a complete Tried: line passes');
ok(askProblems(`- **Tried:** ${good.split('\n')[1].slice(7)}\nWAITING FOR YOU — tap`).length === 0, 'a bold or bulleted Tried: line counts');
ok(askProblems(`${good}\nTried: again`).some((p) => /more than one/.test(p)), 'two Tried: lines fail: one line names every rung');
ok(askProblems('DONE — the checks are faster.').length === 0, 'a message that waits on no one passes');
ok(run('nope', '').status === 2, 'an unknown command is a usage error');

console.log(`test-owner-step: OK · ${n} cases`);
