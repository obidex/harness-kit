#!/usr/bin/env node
// check-kit — structural checks on the kit itself. No dependencies.
//
//   usage: node tools/check-kit.mjs [<root>]     exit 0 = clean, 1 = a rule broke
//
// 1. Every rule worded in a layer file (`- **<ID> Title.**`) has exactly one catalogue record, and
//    every record has wording. IDs are unique and carry their layer's prefix.
// 2. Every record row has all five columns non-empty, and Verify says `script:` or `judgment:`.
// 3. Always-loaded files stay under their byte caps (C17).
// 4. examples/profile.example.json validates against .harness/profile.schema.json.
// 5. Preset capability lists use only capabilities the schema knows.
// 6. Nothing that looks like a secret is committed in the kit's text.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateSchema, parseYaml } from '../.harness/tools/lib.mjs';
import { controlProblems } from '../.harness/tools/hands.mjs';

const root = process.argv[2] || new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const list = (d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter((f) => f.endsWith('.md')).map((f) => `${d}/${f}`) : []);

let failures = 0;
const fail = (msg) => { console.log(`check-kit: FAIL ${msg}`); failures++; };

// --- layers: which file words which prefixes ----------------------------------------------------
const CAPS = ['DB', 'AU', 'PI', 'DP', 'RJ', 'SD', 'BL', 'HI'];
const layers = [
  { file: '.harness/core.md', prefixes: ['C'] },
  { file: '.harness/owner-defaults.md', prefixes: ['O'] },
  { file: '.harness/capabilities.md', prefixes: CAPS },
  ...list('.harness/presets').map((file) => ({ file, prefixes: ['WA', 'PW'] })),
  ...list('.harness/adapters').map((file) => ({ file, prefixes: ['A'] })),
];
const recordFiles = [...list('.harness/catalogue'), '.harness/capabilities.md', ...list('.harness/presets'), ...list('.harness/adapters')];

const ID = /^[A-Z]{1,2}[0-9]{2}$/;
const prefixOf = (id) => id.replace(/[0-9]+$/, '');

// --- 1. wording -----------------------------------------------------------------------------------
const worded = new Map();
for (const { file, prefixes } of layers) {
  for (const m of read(file).matchAll(/^- \*\*([A-Z]{1,2}[0-9]{2}) [^*]+\*\*/gm)) {
    const id = m[1];
    if (worded.has(id)) fail(`${id} is worded twice (${worded.get(id)} and ${file})`);
    else worded.set(id, file);
    if (!prefixes.includes(prefixOf(id))) fail(`${id} in ${file} does not carry this layer's prefix (${prefixes.join(', ')})`);
  }
}

// --- 2. records -----------------------------------------------------------------------------------
const recorded = new Map();
for (const file of recordFiles) {
  for (const line of read(file).split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!ID.test(cells[0])) continue;              // header, separator or a non-rule table
    if (!/^(C|O|A|WA|PW|DB|AU|PI|DP|RJ|SD|BL|HI)$/.test(prefixOf(cells[0]))) continue; // L/X tables
    const id = cells[0];
    if (cells.length !== 5) { fail(`${id} in ${file} has ${cells.length} columns, expected 5`); continue; }
    cells.forEach((c, i) => { if (!c) fail(`${id} in ${file} has an empty column ${i + 1}`); });
    if (!/(^|\. )(script|judgment):/.test(cells[4])) fail(`${id} in ${file}: Verify must say script: or judgment:`);
    if (recorded.has(id)) fail(`${id} has two records (${recorded.get(id)} and ${file})`);
    else recorded.set(id, file);
  }
}
for (const id of worded.keys()) if (!recorded.has(id)) fail(`${id} is worded in ${worded.get(id)} but has no record`);
for (const id of recorded.keys()) if (!worded.has(id)) fail(`${id} has a record in ${recorded.get(id)} but no wording`);

// L and X tables: unique IDs
const ps = read('.harness/project-specific.md');
const lx = [...ps.matchAll(/^\| ([LX][0-9]{2}) \|/gm)].map((m) => m[1]);
new Set(lx).size === lx.length || fail('project-specific.md repeats an L or X ID');

// --- 3. caps on always-loaded text ----------------------------------------------------------------
const caps = { '.harness/core.md': 7168, '.harness/owner-defaults.md': 4096 };
for (const [f, max] of Object.entries(caps)) {
  const n = Buffer.byteLength(read(f));
  if (n > max) fail(`${f} is ${n} bytes, over its cap of ${max}`);
}

// --- 4. profile example against the schema ------------------------------------------------------
const schema = JSON.parse(read('.harness/profile.schema.json'));
for (const e of validateSchema(schema, JSON.parse(read('examples/profile.example.json')))) fail(`profile ${e}`);

// --- 5. preset capabilities -----------------------------------------------------------------------
const known = schema.properties.capabilities.items.enum;
for (const f of list('.harness/presets')) {
  const line = read(f).match(/^\*\*Capabilities:\*\* (.+)$/m);
  if (!line) { fail(`${f} has no **Capabilities:** line`); continue; }
  for (const c of line[1].split(' · ')) {
    const name = c.trim().replace(/[ /]/g, '-');
    if (!known.includes(name)) fail(`${f} names unknown capability "${name}"`);
  }
}

// --- 6. nothing secret-shaped ---------------------------------------------------------------------
const secretish = /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|[0-9]{8,10}:AA[A-Za-z0-9_-]{30,})/;
for (const f of ['DECISIONS.md', 'README.md', ...layers.map((l) => l.file), ...recordFiles, '.harness/project-specific.md', 'examples/profile.example.json']) {
  if (existsSync(join(root, f)) && secretish.test(read(f))) fail(`${f} contains a secret-shaped string`);
}

// --- 7. the kit's own and its installed workflows are bounded (RJ01) and named harness-* -----------
const wfFiles = [...readdirSync(join(root, '.github/workflows')).map((f) => `.github/workflows/${f}`),
  ...readdirSync(join(root, '.harness/templates/workflows')).map((f) => `.harness/templates/workflows/${f}`),
  ...readdirSync(join(root, '.harness/templates/hands')).map((f) => `.harness/templates/hands/${f}`)];
for (const f of wfFiles) {
  const text = read(f);
  const wf = parseYaml(text);
  const jobs = Object.entries(wf.jobs || {});
  const called = /^on:\n\s+workflow_call:/m.test(text) && !/^\s+(schedule|workflow_dispatch|push|pull_request):/m.test(text);
  if (!jobs.length) fail(`${f} has no jobs (unparsable?)`);
  for (const [k, j] of jobs) if (!j['timeout-minutes'] && !j.uses) fail(`${f}#${k} has no timeout-minutes`);
  if (!wf.concurrency && !called) fail(`${f} has no concurrency group`);
  if (!wf.permissions) fail(`${f} does not declare permissions`);
  // GitHub's parser is strict YAML: a plain value holding ": " is an invalid workflow that never runs
  for (const [n, line] of text.split('\n').entries()) {
    const m = line.match(/^\s*(?:-\s+)?[\w.-]+:\s+([^|>'"\s].*)$/);
    if (m && /:\s/.test(m[1].replace(/\s+#.*$/, ''))) fail(`${f}:${n + 1}: a plain value contains ": " (quote it or use a block scalar)`);
  }
  // a mutable tag hands the job's token (and a self-hosted runner) to whoever moves it: pin full SHAs
  for (const m of text.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm)) if (!m[1].startsWith('./') && !/@[0-9a-f]{40}$/.test(m[1])) fail(`${f}: ${m[1]} is not pinned to a full commit SHA`);
  if (f.startsWith('.harness/templates/workflows/') && !/\/harness-[a-z0-9-]+\.yml$/.test(f)) fail(`${f}: installed workflows are named harness-*.yml`);
  if (f.startsWith('.harness/templates/hands/')) {
    if (!/\/hands-[a-z0-9-]+\.yml$/.test(f)) fail(`${f}: control workflows are named hands-*.yml`);
    // A14: the App key is reachable only from main, and never from an event others can cause
    for (const p of controlProblems({ [f]: text })) fail(p); // A14
  }
}

const rules = worded.size;
if (failures) { console.log(`check-kit: ${failures} failure(s)`); process.exit(1); }
console.log(`check-kit: OK · ${rules} rules, each with one complete record · profile example valid · caps hold`);
