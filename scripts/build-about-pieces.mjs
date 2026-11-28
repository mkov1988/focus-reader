/**
 * What the pickup page says about every book the app can reach, cut into
 * pieces by id range and served as static files:
 *
 *   node scripts/build-about-pieces.mjs            write public/about-v1/<n>.json
 *   node scripts/build-about-pieces.mjs --check    build in memory, write nothing
 *
 * A piece holds PIECE_SPAN consecutive ids: book 1342 is in piece
 * floor(1342 / 500) = 2, public/about-v1/2.json. The app works that out from
 * the id alone and downloads only the piece holding the book that was
 * tapped (the Android repo's src/services/aboutPieces.ts), then keeps it on
 * disk. Pieces stay under about 200 KB (the builder refuses a bigger one).
 *
 * Per book: the hook, era, voice and mood tags from the deep starts pass
 * (scripts/deep-starts/meta.json), and the story's word count, its Language
 * level and how many chapters the parser finds (scripts/deep-starts/
 * levels.json, measure-levels.mjs). Pacing, Pace, cast and authored parts
 * come only from a full read of a book and ship inside the app for the
 * listed books (export-native.mjs); the app's bundled entries win over
 * these.
 *
 * The directory name IS the version (the starts-v1.json rule): a published
 * about-v1 piece is never changed in place. New data for books already
 * served ships as about-v2 and one constant in the app.
 *
 * LEGAL.md: nothing served may carry the word "Gutenberg". A hook or era
 * that does is left out (the book keeps its measures), and the build fails
 * if the word is anywhere in what it wrote.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'about-v1');
export const PIECE_SPAN = 500;
const MAX_PIECE_BYTES = 200 * 1024;
const VOICES = new Set(['first-person', 'third-person', 'verse', 'play', 'letters', 'diary']);
const TAGS = new Set(['cozy', 'adventurous', 'grim', 'romantic', 'funny', 'eerie', 'contemplative', 'thrilling', 'tragic', 'whimsical', 'philosophical', 'pastoral']);
const BANNED = /gutenberg/i;
const check = process.argv.includes('--check');

const meta = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'deep-starts', 'meta.json'), 'utf8'));
const levels = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'deep-starts', 'levels.json'), 'utf8'));
const level = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
const text = (v) => (typeof v === 'string' ? v.replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim() : '');

const pieces = new Map();
const dropped = [];
let books = 0;
const tally = { hook: 0, era: 0, voice: 0, tags: 0, words: 0, language: 0, chapters: 0 };
for (const id of new Set([...Object.keys(meta), ...Object.keys(levels)])) {
    if (!/^\d+$/.test(id)) continue;
    const m = meta[id] ?? {};
    const l = levels[id] ?? {};
    const entry = {};
    let hook = text(m.hook);
    let era = text(m.era);
    if (BANNED.test(hook) || BANNED.test(era)) {
        dropped.push(id);
        if (BANNED.test(hook)) hook = '';
        if (BANNED.test(era)) era = '';
    }
    if (hook) entry.hook = hook;
    if (era) entry.era = era;
    if (VOICES.has(m.voice)) entry.voice = m.voice;
    const tags = Array.isArray(m.tags) ? m.tags.filter((t) => TAGS.has(t)).slice(0, 4) : [];
    if (tags.length) entry.tags = tags;
    if (Number.isInteger(l.words) && l.words > 0) entry.words = l.words;
    if (level(l.language)) entry.language = l.language;
    if (Number.isInteger(l.chapters) && l.chapters > 0) entry.chapters = l.chapters;
    if (Object.keys(entry).length === 0) continue;
    for (const k of Object.keys(entry)) tally[k] += 1;
    books += 1;
    const n = Math.floor(Number(id) / PIECE_SPAN);
    if (!pieces.has(n)) pieces.set(n, {});
    pieces.get(n)[id] = entry;
}

let biggest = 0;
let total = 0;
const files = new Map();
for (const [n, about] of [...pieces].sort((a, b) => a[0] - b[0])) {
    const sorted = Object.fromEntries(Object.keys(about).sort((a, b) => Number(a) - Number(b)).map((id) => [id, about[id]]));
    const json = JSON.stringify({ v: 1, from: n * PIECE_SPAN, to: (n + 1) * PIECE_SPAN - 1, about: sorted });
    const bytes = Buffer.byteLength(json);
    if (BANNED.test(json)) { console.error(`piece ${n} would carry the word "Gutenberg" (LEGAL.md)`); process.exit(1); }
    if (bytes > MAX_PIECE_BYTES) { console.error(`piece ${n} is ${bytes} bytes, over the ${MAX_PIECE_BYTES} limit: lower PIECE_SPAN (a new version, the app must match)`); process.exit(1); }
    biggest = Math.max(biggest, bytes);
    total += bytes;
    files.set(`${n}.json`, json);
}

if (!check) {
    mkdirSync(OUT, { recursive: true });
    for (const f of existsSync(OUT) ? readdirSync(OUT) : []) if (!files.has(f)) unlinkSync(path.join(OUT, f));
    for (const [f, json] of files) writeFileSync(path.join(OUT, f), json);
}
console.log(`${check ? 'would write' : 'wrote'} ${files.size} pieces to public/about-v1/: ${books} books, ${(total / 1024 / 1024).toFixed(1)} MB in all, biggest ${(biggest / 1024).toFixed(0)} KB`);
console.log(`  with a hook ${tally.hook}, era ${tally.era}, voice ${tally.voice}, moods ${tally.tags}, length ${tally.words}, language ${tally.language}, chapters ${tally.chapters}`);
if (dropped.length) console.log(`  hook or era left out for carrying the word "Gutenberg": ${dropped.length} books (${dropped.slice(0, 12).join(', ')}${dropped.length > 12 ? ', …' : ''})`);
