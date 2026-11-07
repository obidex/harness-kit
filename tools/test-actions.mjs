#!/usr/bin/env node
// test-actions — action groups (K035): every workflow names auto or approval; human never runs.
//
//   node tools/test-actions.mjs        exit 0 = every case held

import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { verdict, groupsOf, check, GROUPS } from '../.harness/tools/actions.mjs';

let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.log(`test-actions: FAIL ${n}. ${what}`); process.exit(1); } console.log(`test-actions: ok ${n}. ${what}`); };
const kit = new URL('..', import.meta.url).pathname;

ok(GROUPS.join(',') === 'auto,approval,human', 'three groups: auto, approval, human');
ok(verdict('# x\n# Action group: auto (reports)\nname: a\n').problem === null && verdict('# Action group: approval\n').group === 'approval', 'a workflow that names auto or approval passes');
ok(/never run by automation/.test(verdict('# Action group: human (pays the supplier)\n').problem), 'a workflow that names human fails: a person does that, never automation');
ok(/no "# Action group:" line/.test(verdict('name: a\non: push\n').problem), 'a workflow that names no group fails: an unlabelled automation is unexplained');
ok(/unknown group/.test(verdict('# Action group: sometimes\n').problem) && /more than one/.test(verdict('# Action group: auto\n# Action group: approval\n').problem), 'an unknown group, or two lines, fail');
ok(groupsOf('run: echo "Action group: human"\n').length === 0, 'only a comment line counts, never text inside a step');

const d = mkdtempSync(join(tmpdir(), 'actions-'));
mkdirSync(join(d, '.github/workflows'), { recursive: true });
writeFileSync(join(d, '.github/workflows/a.yml'), '# Action group: auto\nname: a\n');
writeFileSync(join(d, '.github/workflows/b.yaml'), '# Action group: human\nname: b\n');
writeFileSync(join(d, '.github/workflows/notes.md'), 'not a workflow\n');
const res = check(d);
ok(res.length === 2 && res[0].problem === null && res[1].group === 'human' && res[1].problem, 'check reads every .yml and .yaml under .github/workflows, nothing else');
const cli = spawnSync(process.execPath, [join(kit, '.harness/tools/actions.mjs'), 'check', d], { encoding: 'utf8' });
ok(cli.status === 1 && /FAIL \.github\/workflows\/b\.yaml: group "human"/.test(cli.stdout), 'the CLI exits 1 and names the failing file');
writeFileSync(join(d, '.github/workflows/b.yaml'), '# Action group: approval\nname: b\n');
ok(spawnSync(process.execPath, [join(kit, '.harness/tools/actions.mjs'), 'check', d], { encoding: 'utf8' }).status === 0, 'and exits 0 once every workflow is auto or approval');
rmSync(d, { recursive: true, force: true });

for (const sub of ['.harness/templates/workflows', '.harness/templates/hands', '.github/workflows']) {
  for (const f of readdirSync(join(kit, sub)).filter((x) => /\.ya?ml$/.test(x))) {
    const v = verdict(readFileSync(join(kit, sub, f), 'utf8'));
    ok(v.problem === null, `${sub}/${f}: action group ${v.group}`);
  }
}
console.log(`test-actions: OK · ${n} checks`);
