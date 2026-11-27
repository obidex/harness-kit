#!/usr/bin/env node
// state-note — what a coordinator's state note asks of the owner, as separate items (K082). No dependencies.
//
//   node .harness/tools/state-note.mjs check (--file <path> | --issue <n> --repo <owner/name>)
//        the note's OWNER ASKS section is well formed: exit 0 and `STATE-NOTE: OK <n> owner ask(s)`, else
//        one `STATE-NOTE: FAIL <line>: <why>` per problem and exit 1. Run it on the body before the run writes it.
//   node .harness/tools/state-note.mjs asks (--file <path> | --issue <n> --repo <owner/name>)
//        the owner asks as JSON, `[{ do, kind, why, answer }]`; `[]` means none. What a status page counts. Exit 1
//        (the problems on stderr) when the note would fail `check`: what it printed may be short.
//   node .harness/tools/state-note.mjs item --do "<what he must do>" --kind <kind> --why "<why only he can>" --answer <url>
//        prints one well-formed item line, or refuses with why.
//
// The field (wake.md "The STATE issue", K082). The note has exactly one heading line `OWNER ASKS` (any of
// `OWNER ASKS`, `## OWNER ASKS`, `**OWNER ASKS**`, a colon allowed). Until the next heading, every line that is
// not blank is either one item:
//
//   - Do: <what he must do> · Why only you: <kind> — <why only he can> · Answer: <https link where he answers>
//
// or the one line `- None.`, which an empty field must hold. No item means none. A line shaped like an ask
// ("Do: … Why only you: …") never ends the field, and one outside it is refused. <kind> is one of KINDS: the only things the owner keeps
// (O01; project instructions): money, a design pick, a business decision, a sign-in or a code, a secret only he
// holds, a new account, a step on his own machine or a physical one, a paid or owner-only setting, an action
// refused to every agent. Anything else for him to know goes under the heading `REMARKS`, which no reader
// counts. An older heading that a reader counts as owner steps ("NEEDS OWNER", "NEEDS YOU", "OWNER WAITS",
// "WAITING FOR YOU" at the start of a line) is refused, so remarks can never be read as an ask again.
//
// A GitHub read uses GH_TOKEN (lib.mjs `ghClient`: three tries on a GitHub hiccup).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ghClient } from './lib.mjs';

export const HEADING = 'OWNER ASKS';
export const REMARKS = 'REMARKS';
export const KINDS = ['money', 'design', 'decision', 'sign-in', 'secret', 'account', 'his machine', 'setting', 'refused'];
export const NONE = '- None.';
const SEP = ' · ';

const ASKS_HEAD = /^\s*(?:#+\s*)?(?:\*\*)?\s*OWNER ASKS\s*(?:\*\*)?\s*:?\s*(?:\*\*)?\s*$/;
// Read as owner steps by older readers (the Control Center's `needsOwner`): never a heading here any more.
const OLD_HEAD = /^\s*(?:#+\s*)?(?:\*\*)?\s*(?:NEEDS (?:THE )?(?:OWNER|YOU)|OWNER WAITS|WAITING FOR (?:YOU|THE OWNER))\b/i;
// The next heading ends the section: "## X", "**X", or a line in capitals.
const NEXT_HEAD = /^\s*(#+\s|[A-Z][A-Z ,()'/-]{3,}:?\s*$|\*\*[A-Z])/;
const ITEM = /^\s*[-*]\s+Do:\s+(\S.*?)\s+·\s+Why only you:\s+(\S.*?)\s+·\s+Answer:\s+(\S+)\s*$/;
const NONE_LINE = /^\s*[-*]\s+None\.?\s*$/i;
// Shaped like an ask, written well or not (bold labels, no dash): never a heading, and never outside the field.
const LOOSE_ITEM = /\bDo\b\W{0,4}\s.*\bWhy only you\b/i;
const KIND = new RegExp(`^(${KINDS.map((k) => k.replace('-', '\\-')).join('|')})(?:\\s+[—–-]|\\s*[:,])\\s+(\\S.*)$`, 'i');
const EMPTY_DO = /^(?:none|nothing|no one|nobody|n\/a|fyi|remark|no (?:new |owner )?(?:action|ask|step|request|decision)s?|[-—–])(?:\b|\s|$)/i;
const LINK = /^https:\/\/[^\s<>"']+$/;
const MAX = 300;

/** One item's parts, or the reason it is not an item. */
export function parseItem(line) {
  const m = String(line).match(ITEM);
  if (!m) return { problem: `not an item: write "- Do: <what> · Why only you: <kind> — <why> · Answer: <link>", or put it under ${REMARKS}` };
  const [, what, whyAll, answer] = m;
  const k = whyAll.match(KIND);
  if (!k) return { problem: `"Why only you" starts with one of: ${KINDS.join(', ')}, then a dash and the reason` };
  if (EMPTY_DO.test(what)) return { problem: `"Do" names nothing for him to do; an empty section is "${NONE}"` };
  if (!LINK.test(answer)) return { problem: '"Answer" is the https link where he answers' };
  if (what.length > MAX || k[2].length > MAX) return { problem: `"Do" and the reason are each at most ${MAX} characters` };
  return { item: { do: what, kind: k[1].toLowerCase(), why: k[2], answer } };
}

/** Read a note: `{ found, asks, problems: [{ line, why }] }`. `line` is 1-based. */
export function read(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  const asks = [];
  const problems = [];
  const heads = lines.flatMap((l, i) => (ASKS_HEAD.test(l) ? [i] : []));
  lines.forEach((l, i) => { if (OLD_HEAD.test(l)) problems.push({ line: i + 1, why: `an older heading that readers count as owner steps; asks go under ${HEADING}, the rest under ${REMARKS}` }); });
  if (!heads.length) problems.push({ line: 0, why: `no ${HEADING} heading: every note carries it, with "${NONE}" when nothing is asked` });
  if (heads.length > 1) problems.push({ line: heads[1] + 1, why: `${HEADING} appears ${heads.length} times; keep one` });
  let end = lines.length;
  if (heads.length) {
    let none = 0;
    end = heads[0] + 1;
    for (let i = heads[0] + 1; i < lines.length; i++, end = i) {
      const l = lines[i];
      // A heading ends the field; a line shaped like an ask never does (K082 review: "**Do:** …" or a project
      // name in bold would otherwise hide every ask below it).
      if (NEXT_HEAD.test(l) && !ITEM.test(l) && !LOOSE_ITEM.test(l)) break;
      if (!l.trim()) continue;
      if (NONE_LINE.test(l)) { none++; continue; }
      const r = parseItem(l);
      if (r.item) asks.push(r.item); else problems.push({ line: i + 1, why: r.problem });
    }
    if (!none && !asks.length && !problems.some((p) => p.line > heads[0] && p.line <= end)) problems.push({ line: heads[0] + 1, why: `${HEADING} is empty: write "${NONE}" when nothing is asked, so a heading or a slip under it is never read as none` });
    if (none && asks.length) problems.push({ line: heads[0] + 1, why: `"${NONE}" beside ${asks.length} item(s): drop it` });
    if (none > 1) problems.push({ line: heads[0] + 1, why: `"${NONE}" written ${none} times` });
  }
  // An ask written anywhere else in the note is never counted, so it is refused, not passed (K082 review).
  lines.forEach((l, i) => { if (LOOSE_ITEM.test(l) && !(heads.length && i > heads[0] && i < end)) problems.push({ line: i + 1, why: `an owner ask outside ${HEADING}: move it there, or reword it under ${REMARKS}` }); });
  const seen = new Set();
  for (const a of asks) { const key = `${a.do.toLowerCase()}|${a.answer}`; if (seen.has(key)) problems.push({ line: 0, why: `the same ask twice: "${a.do.slice(0, 60)}"` }); seen.add(key); }
  return { found: heads.length > 0, asks, problems };
}

/** The owner asks only: what a status page counts. A note with no section, or a broken one, is read as far as it goes. */
export const asksOf = (body) => read(body).asks;

/** One well-formed item line from its parts, or throws with why. */
export function item({ do: what, kind, why, answer }) {
  const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const line = `- Do: ${one(what)}${SEP}Why only you: ${one(kind).toLowerCase()} — ${one(why)}${SEP}Answer: ${one(answer)}`;
  const r = parseItem(line);
  if (r.problem) throw new Error(r.problem);
  return line;
}

// ---------- the command line ----------
function opts(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  return o;
}

async function bodyOf(o) {
  if (typeof o.file === 'string') return readFileSync(o.file === '-' ? 0 : o.file, 'utf8');
  if (o.issue && typeof o.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(o.repo) && /^\d+$/.test(String(o.issue))) {
    const i = await ghClient('state-note')('GET', `/repos/${o.repo}/issues/${o.issue}`);
    return String(i?.body ?? '');
  }
  throw new Error('name the note: --file <path> (or - for stdin), or --issue <n> --repo <owner/name>');
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const o = opts(rest);
  if (cmd === 'item') { console.log(item({ do: o.do, kind: o.kind, why: o.why, answer: o.answer })); return 0; }
  if (cmd !== 'check' && cmd !== 'asks') throw new Error('usage: state-note.mjs check|asks (--file <path> | --issue <n> --repo <owner/name>) · item --do --kind --why --answer');
  const r = read(await bodyOf(o));
  if (cmd === 'asks') { console.log(JSON.stringify(r.asks, null, 2)); for (const p of r.problems) console.error(`STATE-NOTE: FAIL ${p.line ? `line ${p.line}` : 'note'}: ${p.why}`); return r.problems.length ? 1 : 0; }
  for (const p of r.problems) console.log(`STATE-NOTE: FAIL ${p.line ? `line ${p.line}` : 'note'}: ${p.why}`);
  if (r.problems.length) return 1;
  console.log(`STATE-NOTE: OK ${r.asks.length} owner ask${r.asks.length === 1 ? '' : 's'}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`state-note: ${e.message}`); process.exit(2); });
}
