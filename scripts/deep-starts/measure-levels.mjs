/**
 * Language level and word count for every book the app bundles an about
 * entry for (the pickup page's Length and Language meters).
 *
 *   node scripts/deep-starts/measure-levels.mjs            measure, then band
 *   node scripts/deep-starts/measure-levels.mjs --band     re-band from the cache
 *   node scripts/deep-starts/measure-levels.mjs --show=84,1342   print a book's measures
 *
 * For each book it fetches the served text once from the Pages site
 * (`/books/<id>.txt`, the same bytes the app reads), parses it with the app's
 * own parser (scripts/lib/load-ts.mjs), measures the story only (from its
 * story start, or the parser's readable start, to the parser's readable end,
 * so front and back matter are left out), and throws the text away. Nothing
 * of the text is kept: only counts.
 *
 * The measures are plain:
 *   asl    words per sentence
 *   rare   share of lower case words (names left out) that fewer than a
 *          fifth of the measured books use at all
 *   long   share of words of three syllables or more
 * The language score is a weighted sum of the three, each scaled against the
 * whole set (around its median, by the spread of its middle half, clipped),
 * and LANGUAGE_BANDS cut it into five levels (Effortless, Easy,
 * Moderate, Rich, Demanding). The bands were calibrated by eye on books with
 * a known feel: Alice near Effortless, Pride and Prejudice on Easy, Moby Dick
 * on Demanding, and some twenty more.
 *
 * No level is stored where the measure cannot be trusted: plays and verse
 * (by the deep pass's voice, or by a text that is mostly short lines),
 * dictionaries, lists and the like, sentence lengths no prose has, archaic
 * spelling or heavy dialect, and texts too short to measure. The word count is stored for every book.
 *
 * Output: scripts/deep-starts/levels.json, { id: { words, language?, pace? } }.
 * `pace` (1 Slow burn to 5 Gripping) is rated by hand from the deep pass's
 * pacing sentence (details.json) and is never touched here. The raw measures
 * are cached in scripts/.levels-measures.json (gitignored scratch) so the
 * bands can be re-cut without fetching again.
 *
 * Then: npm run export:native -- --only=about.json (scripts/export-native.mjs
 * carries words, language and pace into the app's about.json).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTextProcessing } from '../lib/load-ts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STORE = path.join(ROOT, 'scripts', 'deep-starts', 'levels.json');
const CACHE = path.join(ROOT, 'scripts', '.levels-measures.json');
const BASE = 'https://focus-reader-48z.pages.dev/books/';
const CONCURRENCY = 6;
/** Stop rather than run on: a pass this long should go to Michael's terminal. */
const TIME_LIMIT_MS = 10 * 60 * 1000;

/** A word fewer than this share of books use counts as uncommon. */
const COMMON_DF = 0.2;
/** Weights of the scaled measures in the language score. */
const WEIGHTS = { rare: 0.5, asl: 0.25, long: 0.25 };
/**
 * Books the eye check found the measures plainly misgrade, set by hand. Henry
 * James is hard for his syntax (clause inside clause, the subject held back),
 * which word and sentence counts do not see; a count of commas and dashes was
 * tried and graded Alice above Dracula, so it was dropped.
 */
const HAND_LEVELS = { 209: 4, 2833: 4, 42486: 4 };
/** Score cut points between levels 1|2, 2|3, 3|4, 4|5 (calibrated by eye). */
const LANGUAGE_BANDS = [-0.85, -0.1, 0.5, 1.2];
/** Below this many story words the measure is noise. */
const MIN_WORDS = 1500;
/** Mostly short lines: verse or a play, whatever the deep pass said. */
const SHORT_LINE_CHARS = 48;
const SHORT_LINE_SHARE = 0.55;
/** No prose averages sentences this long: the punctuation is not prose. */
const MAX_ASL = 60;
/** More uncommon words than this is archaic spelling or heavy dialect
 *  (Middle English, a 1592 translation, phonetic dialect): hard, but not in a
 *  way these measures can grade. */
const MAX_RARE = 0.15;
/** A scaled measure counts at most this far from the middle, so a handful of
 *  extreme texts cannot stretch the scale for everyone else. */
const CLIP = 3;
const NOT_PROSE_TITLE = /\b(dictionary|encyclop|glossary|lexicon|thesaurus|almanac|catalogue|catalog|handbook|cook ?book|recipes|gazetteer|concordance|index|tables)\b/i;

const args = process.argv.slice(2);
const bandOnly = args.includes('--band');
const showArg = args.find((a) => a.startsWith('--show='));

// The books: exactly those export-native gives an about entry (a deep pass
// hook, among the bundled ids).
const meta = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'deep-starts', 'meta.json'), 'utf8'));
const starts = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'story-starts.json'), 'utf8'));
const ids = Object.keys(starts).filter((id) => typeof meta[id]?.hook === 'string' && meta[id].hook.trim());
const titles = loadTitles();

function loadTitles() {
    const t = {};
    try {
        for (const b of JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'curated.json'), 'utf8'))) t[b.id] = b.title;
    } catch { /* titles are only for the report */ }
    try {
        const walk = (o) => {
            if (Array.isArray(o)) o.forEach(walk);
            else if (o && typeof o === 'object') {
                if (o.id && o.title && !t[o.id]) t[o.id] = o.title;
                Object.values(o).forEach(walk);
            }
        };
        walk(JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'vibes.json'), 'utf8')));
    } catch { /* as above */ }
    return t;
}

function syllables(w) {
    const s = w.toLowerCase().replace(/[^a-z]/g, '');
    if (s.length <= 3) return 1;
    const groups = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups ? groups.length : 1);
}

async function fetchText(id) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const res = await fetch(`${BASE}${id}.txt`);
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (e) {
            if (attempt === 2) throw e;
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
    return null;
}

async function measureAll() {
    const tp = loadTextProcessing();
    const vocab = new Map(); // word -> id
    const perBook = {}; // id -> { words, sentences, long, lower, shortLines, ids: Uint32Array, counts: Uint32Array }
    const started = Date.now();
    let next = 0;
    let done = 0;
    const work = async () => {
        while (next < ids.length) {
            if (Date.now() - started > TIME_LIMIT_MS) throw new Error('past the ten minute limit: run this in a terminal instead');
            const id = ids[next++];
            const text = await fetchText(id);
            if (text === null) { perBook[id] = { missing: true }; continue; }
            const parsed = tp.parseText(text);
            const from = Math.max(0, Math.min(parsed.tokens.length, typeof starts[id] === 'number' && starts[id] > 0 ? starts[id] : parsed.readableStartWord));
            const to = Math.max(from, parsed.readableEndWord || parsed.tokens.length);
            let sentences = 0;
            let long = 0;
            let lower = 0;
            const counts = new Map();
            for (let i = from; i < to; i += 1) {
                const tok = parsed.tokens[i];
                if (tok.isSentenceEnd) sentences += 1;
                const clean = tok.clean ?? tok.word.replace(/[^A-Za-z']/g, '');
                const letters = clean.replace(/[^A-Za-z]/g, '');
                if (!letters) continue;
                if (syllables(letters) >= 3) long += 1;
                if (letters[0] === letters[0].toLowerCase()) {
                    lower += 1;
                    const w = letters.toLowerCase();
                    let vid = vocab.get(w);
                    if (vid === undefined) { vid = vocab.size; vocab.set(w, vid); }
                    counts.set(vid, (counts.get(vid) ?? 0) + 1);
                }
            }
            // Line shape over the story's share of the text (verse, plays).
            const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
            const a = Math.floor(lines.length * (from / Math.max(1, parsed.tokens.length)));
            const b = Math.ceil(lines.length * (to / Math.max(1, parsed.tokens.length)));
            const storyLines = lines.slice(a, b);
            const shortLines = storyLines.filter((l) => l.length < SHORT_LINE_CHARS).length / Math.max(1, storyLines.length);
            perBook[id] = {
                words: to - from, sentences, long, lower, shortLines,
                ids: Uint32Array.from(counts.keys()), counts: Uint32Array.from(counts.values()),
            };
            done += 1;
            if (done % 50 === 0) console.log(`  measured ${done}/${ids.length} (${Math.round((Date.now() - started) / 1000)}s)`);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, work));

    // Document frequency across the measured books.
    const measured = Object.values(perBook).filter((m) => !m.missing);
    const df = new Uint32Array(vocab.size);
    for (const m of measured) for (const vid of m.ids) df[vid] += 1;
    const commonAt = COMMON_DF * measured.length;
    const out = {};
    for (const id of ids) {
        const m = perBook[id];
        if (!m || m.missing) { out[id] = { missing: true }; continue; }
        let rare = 0;
        for (let i = 0; i < m.ids.length; i += 1) if (df[m.ids[i]] < commonAt) rare += m.counts[i];
        out[id] = {
            words: m.words,
            asl: m.sentences > 0 ? m.words / m.sentences : null,
            rare: m.lower > 0 ? rare / m.lower : null,
            long: m.words > 0 ? m.long / m.words : null,
            shortLines: m.shortLines,
        };
    }
    console.log(`measured ${measured.length} books in ${Math.round((Date.now() - started) / 1000)}s (${ids.length - measured.length} missing)`);
    return out;
}

/** Why a book gets no language level, or null when its measure holds. */
function untrusted(id, m) {
    const voice = meta[id]?.voice;
    if (voice === 'play' || voice === 'verse') return voice;
    if (NOT_PROSE_TITLE.test(titles[id] ?? '')) return 'reference title';
    if (m.words < MIN_WORDS) return 'too short';
    if (m.asl === null || m.asl > MAX_ASL) return 'not prose punctuation';
    if (m.shortLines > SHORT_LINE_SHARE) return 'mostly short lines';
    if (m.rare > MAX_RARE) return 'archaic spelling or dialect';
    return null;
}

function band(measures) {
    const trusted = Object.entries(measures).filter(([id, m]) => !m.missing && !untrusted(id, m));
    // Scaled around the median by the spread of the middle half (robust:
    // the outliers do not set the scale).
    const stats = (k) => {
        const v = trusted.map(([, m]) => m[k]).sort((a, b) => a - b);
        const q = (f) => v[Math.floor(f * (v.length - 1))];
        return { mid: q(0.5), spread: (q(0.75) - q(0.25)) / 1.349 || 1 };
    };
    const st = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, stats(k)]));
    const score = (m) => Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * Math.max(-CLIP, Math.min(CLIP, (m[k] - st[k].mid) / st[k].spread)), 0);
    const level = (s) => 1 + LANGUAGE_BANDS.filter((cut) => s >= cut).length;
    const result = {};
    for (const [id, m] of Object.entries(measures)) {
        if (m.missing) continue;
        const why = untrusted(id, m);
        const hand = HAND_LEVELS[id];
        result[id] = { words: m.words, score: why ? null : score(m), language: why ? null : hand ?? level(score(m)), why };
    }
    return result;
}

let measures;
if (bandOnly || showArg) {
    if (!existsSync(CACHE)) { console.error('no cache yet: run without --band first'); process.exit(1); }
    measures = JSON.parse(readFileSync(CACHE, 'utf8'));
} else {
    measures = await measureAll();
    writeFileSync(CACHE, JSON.stringify(measures));
}
const banded = band(measures);

if (showArg) {
    for (const id of showArg.slice('--show='.length).split(',')) {
        const m = measures[id];
        const b = banded[id];
        console.log(id, titles[id] ?? '?', m && !m.missing ? {
            words: m.words, asl: +m.asl?.toFixed(1), rare: +(m.rare * 100).toFixed(2), long: +(m.long * 100).toFixed(1),
            shortLines: +m.shortLines.toFixed(2), score: b.score === null ? null : +b.score.toFixed(2), language: b.language, why: b.why,
        } : 'missing');
    }
    process.exit(0);
}

// Merge into the store, keeping the hand rated pace.
const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {};
for (const id of ids) {
    const b = banded[id];
    const prev = store[id] ?? {};
    const next = {};
    if (b) next.words = b.words;
    if (b?.language) next.language = b.language;
    if (prev.pace) next.pace = prev.pace;
    if (Object.keys(next).length) store[id] = next; else delete store[id];
}
const sorted = Object.fromEntries(Object.keys(store).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)).map((k) => [k, store[k]]));
writeFileSync(STORE, JSON.stringify(sorted, null, 1) + '\n');
const levels = [1, 2, 3, 4, 5].map((n) => Object.values(banded).filter((b) => b.language === n).length);
const skipped = Object.values(banded).filter((b) => b.why).length;
console.log(`levels.json: ${Object.keys(sorted).length} books; language 1..5 = ${levels.join(' / ')}; no level for ${skipped}`);
