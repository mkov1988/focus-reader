#!/usr/bin/env node
// build-modernity-queue.mjs — builds the Modernity work queue and checklist.
//
// The queue is the curated list of works getting a Modernity retelling
// (docs/modernity-plan.md). The lists below are the ledger: CORE_STORY is a
// hand-curated cut of the catalog's most downloaded books (junk and duplicate
// editions removed, canon promoted from below the raw cutoff), LEVEL_HEADS
// collapses the 16 Level Heads books into 8 works mapped to every edition id.
// Swapping a book = editing these arrays and rerunning.
//
// Reads:  src/data/curated.json, src/data/vibes.json,
//         data-src/modernity-src.json (if present, for checklist progress)
// Writes: data-src/modernity-queue.json, MODERNITY-CHECKLIST.md
//
// Usage: node scripts/build-modernity-queue.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// ---------------------------------------------------------------------------
// The ledger. format: stream (plot beats) | stack (idea posts).
// register: full-send unless marked testimony (jokes off, see voice bible).
// ---------------------------------------------------------------------------

// `also`: duplicate editions of the same work in the catalog; they get the
// same modernization, but anchors resolve against the main id's text only.
const CORE_STORY = [
  // kept from the raw top 100 by downloads
  { id: '2701' }, { id: '1342', also: ['42671'] }, { id: '84' },
  { id: '1513', also: ['1112'] },
  { id: '2554' }, { id: '1184' }, { id: '2641' }, { id: '11' },
  { id: '145' }, { id: '43', also: ['42'] }, { id: '67979' }, { id: '37106' },
  { id: '64317' }, { id: '1260' }, { id: '8492' }, { id: '1661', also: ['48320'] },
  { id: '345', also: ['45839'] }, { id: '28054' }, { id: '16389' }, { id: '76' },
  { id: '2160' }, { id: '394' }, { id: '768' }, { id: '6593' },
  { id: '245' }, { id: '98' }, { id: '174' },
  { id: '3296', format: 'stack' },
  { id: '74' }, { id: '844' }, { id: '1727' }, { id: '3268' },
  { id: '2465' }, { id: '2542' }, { id: '120' }, { id: '2591' },
  { id: '6133' }, { id: '21839', also: ['161'] }, { id: '1998', format: 'stack' },
  { id: '52190', format: 'stack' }, { id: '244' }, { id: '46976' },
  { id: '55' }, { id: '2852' }, { id: '1695' }, { id: '20203' },
  { id: '75201' }, { id: '1232', format: 'stack' }, { id: '16328' },
  { id: '2600' }, { id: '1400' }, { id: '36462' }, { id: '1080' },
  // canon promoted from ranks 101-300 (raw downloads undersell these)
  { id: '23', register: 'testimony' }, { id: '86' }, { id: '4300' },
  { id: '3207', format: 'stack' }, { id: '209' }, { id: '829', also: ['17157'] },
  { id: '8800' }, { id: '5200' }, { id: '16' },
  { id: '205', format: 'stack' }, { id: '18857' }, { id: '36034' },
  { id: '1952' }, { id: '103' }, { id: '27673' }, { id: '1837' },
  { id: '2527' }, { id: '45' }, { id: '135' }, { id: '14244' },
  { id: '6130' }, { id: '69087' }, { id: '863' }, { id: '1514' },
  { id: '10148' }, { id: '4200' }, { id: '175' }, { id: '1399' },
  { id: '583' }, { id: '164' }, { id: '25344' }, { id: '5921' },
  { id: '204' }, { id: '46' }, { id: '766' }, { id: '421' },
  { id: '1608' }, { id: '236' }, { id: '1063' }, { id: '1257' },
  { id: '215' }, { id: '1497', format: 'stack' }, { id: '68283' },
  // Hamlet: #1524 is the full play; #27761 (higher downloads) is Kean's cut
  // 1859 stage edition, missing the prayer scene, IV.4, the letter forgery,
  // and Fortinbras — the pilot verifier caught this. Full text is primary.
  { id: '1524', also: ['27761'] }, { id: '1533' }, { id: '601' }, { id: '6400' },
];

// Level Heads: 8 works covering all 16 vibe ids. Same modernization shows on
// every edition; anchors resolve against primaryId's text only.
const LEVEL_HEADS = [
  { slug: 'meditations', primaryId: '2680', ids: ['2680', '55317', '6920', '15877'],
    title: 'Meditations', author: 'Marcus Aurelius' },
  { slug: 'epictetus', primaryId: '45109', ids: ['45109', '871', '10661', '39855'],
    title: 'The Teachings of Epictetus', author: 'Epictetus' },
  { slug: 'seneca-essentials', primaryId: '56075', ids: ['56075', '3794', '64576'],
    title: "Seneca's Essentials", author: 'Seneca' },
  { slug: 'seneca-naturales', primaryId: '76392', ids: ['76392'],
    title: 'Seneca Explains Nature', author: 'Seneca' },
  { slug: 'guide-to-stoicism', primaryId: '7514', ids: ['7514'],
    title: 'A Guide to Stoicism', author: 'St. George Stock' },
  { slug: 'roman-society', primaryId: '34122', ids: ['34122'],
    title: 'Roman Society from Nero to Marcus Aurelius', author: 'Samuel Dill' },
  { slug: 'roman-stoicism', primaryId: '64488', ids: ['64488'],
    title: 'Roman Stoicism', author: 'Edward Vernon Arnold' },
  { slug: 'marcus-ideals', primaryId: '78320', ids: ['78320'],
    title: 'The Emperor Marcus Aurelius: A Study in Ideals', author: 'John C. Joy' },
];

// The bench: strong candidates that just missed the cut. Swap by moving an
// id up into CORE_STORY and rerunning.
const ALTERNATES = [
  { id: '1259', why: 'Twenty Years After (kept The Three Musketeers instead)' },
  { id: '4085', why: 'Roderick Random (one Smollett is enough to start)' },
  { id: '6761', why: 'Count Fathom (one Smollett is enough to start)' },
  { id: '65238', why: 'The Secret of Chimneys (kept Ackroyd + Styles)' },
  { id: '58866', why: 'The Murder on the Links (kept Ackroyd + Styles)' },
  { id: '27827', why: 'Kama Sutra (content call is Michael’s)' },
  { id: '43453', why: 'A Pickle for the Knowing Ones (legendary oddity, tiny)' },
  { id: '51252', why: 'Arabian Nights vol 1 of 10 (fragment)' },
  { id: '11030', why: 'Incidents in the Life of a Slave Girl (testimony register)' },
  { id: '15399', why: 'Equiano narrative (testimony register)' },
  { id: '921', why: 'De Profundis (already two Wildes in)' },
  { id: '4363', why: 'Beyond Good and Evil (already two Nietzsches in)' },
  { id: '57342', why: 'Diogenes Laertius (philosopher gossip, pairs with Level Heads)' },
  { id: '50133', why: 'The Dunwich Horror (kept Call of Cthulhu)' },
  { id: '155', why: 'The Moonstone (kept The Woman in White)' },
  { id: '468', why: 'Manon Lescaut' },
  { id: '2097', why: 'The Sign of the Four (three Sherlocks already in)' },
  { id: '1523', why: 'As You Like It (five Shakespeares already in)' },
  { id: '17460', why: 'Lorna Doone' },
  { id: '21700', why: 'Don Juan (Byron)' },
];

// ---------------------------------------------------------------------------

const curated = read('src/data/curated.json');
const vibes = read('src/data/vibes.json');
const byId = new Map(curated.map((b) => [String(b.id), b]));
for (const v of vibes) {
  for (const b of [...v.hero, ...v.shelves.flatMap((s) => s.books)]) {
    if (!byId.has(String(b.id))) byId.set(String(b.id), b);
  }
}

const cleanTitle = (t) => t.replace(/\s*:\s*\$b\s*/g, ': ').replace(/\s+/g, ' ').trim();
const slugify = (t) =>
  cleanTitle(t).toLowerCase().split(/[:;,]/)[0]
    .replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-').split('-').slice(0, 5).join('-');

const problems = [];
const seen = new Set();
const works = [];

for (const entry of CORE_STORY) {
  const b = byId.get(entry.id);
  if (!b) { problems.push(`CORE_STORY id ${entry.id} not in curated or vibes`); continue; }
  if (seen.has(entry.id)) { problems.push(`duplicate id ${entry.id} in CORE_STORY`); continue; }
  seen.add(entry.id);
  for (const alt of entry.also || []) {
    if (!byId.get(alt)) problems.push(`also id ${alt} (${entry.id}) not in curated or vibes`);
    if (seen.has(alt)) problems.push(`also id ${alt} (${entry.id}) already used`);
    seen.add(alt);
  }
  works.push({
    slug: slugify(b.title),
    primaryId: entry.id,
    ids: [entry.id, ...(entry.also || [])],
    title: cleanTitle(b.title),
    author: b.author,
    format: entry.format || 'stream',
    register: entry.register || 'full-send',
    source: 'top100',
    downloads: b.downloadCount ?? null,
  });
}

for (const w of LEVEL_HEADS) {
  for (const id of w.ids) {
    if (!byId.get(id)) problems.push(`LEVEL_HEADS id ${id} (${w.slug}) not in curated or vibes`);
    if (seen.has(id)) problems.push(`LEVEL_HEADS id ${id} (${w.slug}) already used`);
    seen.add(id);
  }
  works.push({
    slug: w.slug, primaryId: w.primaryId, ids: w.ids,
    title: w.title, author: w.author,
    format: 'stack', register: 'full-send', source: 'levelheads',
    downloads: byId.get(w.primaryId)?.downloadCount ?? null,
  });
}

// every primary text must be in the local mirror for anchor work
for (const w of works) {
  const p = path.join(ROOT, 'public', 'books', `${w.primaryId}.txt`);
  if (!fs.existsSync(p)) problems.push(`no mirrored text for ${w.slug} (public/books/${w.primaryId}.txt)`);
}

const slugCounts = new Map();
for (const w of works) slugCounts.set(w.slug, (slugCounts.get(w.slug) || 0) + 1);
for (const [slug, n] of slugCounts) if (n > 1) problems.push(`slug collision: ${slug} x${n}`);

const streams = works.filter((w) => w.format === 'stream').length;
const stacks = works.filter((w) => w.format === 'stack').length;

const queue = {
  _comment: 'Generated by scripts/build-modernity-queue.mjs. Edit that script, not this file.',
  generated: new Date().toISOString().slice(0, 10),
  counts: { works: works.length, streams, stacks, bookIds: seen.size },
  works,
  alternates: ALTERNATES.map((a) => {
    const b = byId.get(a.id);
    return { id: a.id, title: b ? cleanTitle(b.title) : '(unknown)', why: a.why };
  }),
};

fs.mkdirSync(path.join(ROOT, 'data-src'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data-src', 'modernity-queue.json'), JSON.stringify(queue, null, 1));

// --- checklist -------------------------------------------------------------

let done = new Set();
const srcPath = path.join(ROOT, 'data-src', 'modernity-src.json');
if (fs.existsSync(srcPath)) {
  const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  done = new Set(Object.keys(src).filter((k) => !k.startsWith('_') && src[k]?.beats?.length));
}

const total = works.length;
const doneCount = works.filter((w) => done.has(w.slug)).length;
const pct = total ? Math.round((doneCount / total) * 100) : 0;
const bar = '█'.repeat(Math.round((pct / 100) * 30)).padEnd(30, '░');

const lines = [];
lines.push('# Modernity checklist');
lines.push('');
lines.push(`**${doneCount} / ${total} done (${pct}%)**`);
lines.push('');
lines.push('`' + bar + '`');
lines.push('');
lines.push('Do not edit by hand; the ledger is scripts/build-modernity-queue.mjs and');
lines.push('the store is data-src/modernity-src.json. Rerun the script to refresh.');
lines.push('');
for (const [label, list] of [
  ['Streams', works.filter((w) => w.format === 'stream')],
  ['Stacks', works.filter((w) => w.format === 'stack')],
]) {
  lines.push(`## ${label} (${list.filter((w) => done.has(w.slug)).length}/${list.length})`);
  lines.push('');
  for (const w of list) {
    const mark = done.has(w.slug) ? 'x' : ' ';
    const reg = w.register === 'testimony' ? ' `testimony`' : '';
    lines.push(`- [${mark}] #${w.primaryId} **${w.title}** — ${w.author}${reg}`);
  }
  lines.push('');
}
lines.push('## Bench (swap candidates)');
lines.push('');
for (const a of queue.alternates) lines.push(`- #${a.id} ${a.title}: ${a.why}`);
lines.push('');

fs.writeFileSync(path.join(ROOT, 'MODERNITY-CHECKLIST.md'), lines.join('\n'));

console.log(`queue: ${works.length} works (${streams} streams, ${stacks} stacks), ${seen.size} book ids`);
console.log(`checklist: ${doneCount}/${total} done`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error('  - ' + p);
  process.exitCode = 1;
}
