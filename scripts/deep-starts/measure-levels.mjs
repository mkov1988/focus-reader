/**
 * Length (word count) and Language level for every book with a served text
 * (the pickup page's Length and Language meters): the ids in meta.json, in
 * public/starts-v1.json and in the app's own lists, about 56,000 books.
 *
 *   node scripts/deep-starts/measure-levels.mjs            measure what is not measured yet, then band
 *   node scripts/deep-starts/measure-levels.mjs --long     the same with no time limit (the full catalog run)
 *   node scripts/deep-starts/measure-levels.mjs --band     re-band from the stored measures, fetch nothing
 *   node scripts/deep-starts/measure-levels.mjs --show=84,1342   print a book's measures
 *   node scripts/deep-starts/measure-levels.mjs --reference      rebuild the frozen word list (see below)
 *   node scripts/deep-starts/measure-levels.mjs --retry-missing  ask again for books that answered 404
 *
 * For each book it fetches the served text once from the Pages site
 * (`/books/<id>.txt`, the same bytes the app reads), parses it with the app's
 * own parser (scripts/lib/load-ts.mjs), measures the story only (from its
 * story start, or the parser's readable start, to the parser's readable end,
 * so front and back matter are left out), and throws the text away. Nothing
 * of the text is kept: only counts.
 *
 * The run is resumable. Each measured book is one appended line in
 * scripts/deep-starts/levels-measures.jsonl (committed: it is the only copy
 * of an hour of fetching, and the bands can be re-cut from it). A rerun
 * skips every id already in that file. Texts are fetched FETCHES at a time
 * across WORKERS processes (the parse is the slow half).
 *
 * The measures are plain:
 *   asl    words per sentence
 *   rare   share of lower case words (names left out) that are not in the
 *          frozen list of common words
 *   long   share of words of three syllables or more
 * The language score is a weighted sum of the three, each scaled against the
 * calibration set (around its median, by the spread of its middle half,
 * clipped), and LANGUAGE_BANDS cut it into five levels (Effortless, Easy,
 * Moderate, Rich, Demanding). The bands were calibrated by eye on books with
 * a known feel: Alice near Effortless, Pride and Prejudice on Easy, Moby Dick
 * on Demanding, and some twenty more.
 *
 * The calibration set is frozen (scripts/deep-starts/levels-reference.json):
 * the 476 books the bands were first cut on. A word is common when a fifth of
 * those books use it; the scale of each measure is those books' own. Every
 * other book is graded against that same list and scale, so measuring the
 * whole catalog cannot move the level of a book already graded, and a book
 * can be measured by itself. `--reference` rebuilds the list from those 476
 * texts; it should only ever need running if the parser's tokens change.
 *
 * No level is stored where the measure cannot be trusted: plays and verse
 * (by the deep pass's voice, or by a text that is mostly short lines),
 * dictionaries, lists and the like (the deep starts pass's reference works,
 * or a title that says so), sentence lengths no prose has, archaic spelling,
 * heavy dialect or another language, and texts too short to measure. The
 * word count is stored for every book.
 *
 * Output: scripts/deep-starts/levels.json,
 * { id: { words, language?, pace?, chapters? } }, one book a line. `pace`
 * (1 Slow burn to 5 Gripping) is rated from the deep pass's pacing sentence
 * (details.json) and is never touched here. `chapters` is how many chapters
 * the reader's parser finds that make parts the page can show (partStarts
 * below), stored only where its confidence is high: the pickup page draws a book's parts from its own chapters when it
 * has no authored ones, and knowing the count ahead lets the page hold their
 * place before the text has loaded.
 *
 * Then: npm run export:native -- --only=about.json (the bundled books) and
 * node scripts/build-about-pieces.mjs (everything else, served by id range).
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTextProcessing } from '../lib/load-ts.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..', '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const STORE = path.join(DIR, 'levels.json');
const MEASURES = path.join(DIR, 'levels-measures.jsonl');
const REFERENCE = path.join(DIR, 'levels-reference.json');
const BASE = 'https://focus-reader-48z.pages.dev/books/';
/** Texts in flight at once, over this many processes. */
const FETCHES = 16;
const WORKERS = 4;
/** Stop rather than run on, unless asked for the long run (--long). */
const TIME_LIMIT_MS = 10 * 60 * 1000;

/** A word fewer than this share of the calibration books use counts as uncommon. */
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
/** More uncommon words than this is archaic spelling, heavy dialect or a
 *  language other than English (Middle English, a 1592 translation, phonetic
 *  dialect, a French novel): hard, but not in a way these measures can grade. */
const MAX_RARE = 0.15;
/** A scaled measure counts at most this far from the middle, so a handful of
 *  extreme texts cannot stretch the scale for everyone else. */
const CLIP = 3;
const NOT_PROSE_TITLE = /\b(dictionary|encyclop|glossary|lexicon|thesaurus|almanac|catalogue|catalog|handbook|cook ?book|recipes|gazetteer|concordance|index|tables)\b/i;
/**
 * Which of a book's chapter starts make parts the pickup page can show. This
 * is the Android repo's partStarts (src/open/pickup.ts), copied: the page
 * runs that one on the parsed text, and the count stored here lets it hold
 * the block's place before the text has loaded. Change the two together.
 */
const MIN_PARTS = 2;
const PART_MIN_WORDS = 150;
const PART_MAX_BODILESS = 0.3;
const PART_MAX_SHARE = 0.6;
const PART_MAX_LEAD = 0.15;
export function partStarts(starts, from, to) {
    const inside = starts.filter((w) => w >= from && w <= to);
    if (inside.length < MIN_PARTS) return [];
    const end = to + 1;
    const kept = inside.filter((w, i) => (i + 1 < inside.length ? inside[i + 1] : end) - w >= PART_MIN_WORDS);
    if (kept.length < MIN_PARTS || inside.length - kept.length > PART_MAX_BODILESS * inside.length) return [];
    const span = Math.max(1, end - from);
    if (kept[0] - from > PART_MAX_LEAD * span) return [];
    if (kept.length >= 4) {
        for (let i = 0; i < kept.length; i += 1) {
            if ((i + 1 < kept.length ? kept[i + 1] : end) - kept[i] > PART_MAX_SHARE * span) return [];
        }
    }
    return kept;
}
/** A book with no title on file is judged by the first lines of its text. */
const HEAD_LINES = 6;

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const showArg = args.find((a) => a.startsWith('--show='));

function syllables(w) {
    const s = w.toLowerCase().replace(/[^a-z]/g, '');
    if (s.length <= 3) return 1;
    const groups = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups ? groups.length : 1);
}

async function fetchText(id) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const res = await fetch(`${BASE}${encodeURIComponent(id)}.txt`);
            if (res.status === 404) return null;
            const type = res.headers.get('content-type') || '';
            // The site answers a missing static file with its index page.
            if (res.ok && type.includes('text/html')) return null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
    return null;
}

/** The story's span of a parsed text: [from, to) in tokens. */
function storySpan(parsed, start) {
    const from = Math.max(0, Math.min(parsed.tokens.length, typeof start === 'number' && start > 0 ? start : parsed.readableStartWord));
    const to = Math.max(from, parsed.readableEndWord || parsed.tokens.length);
    return [from, to];
}

/** Calls `each(letters, isLower)` for every word of the story with letters in it. */
function eachWord(parsed, from, to, each) {
    let sentences = 0;
    for (let i = from; i < to; i += 1) {
        const tok = parsed.tokens[i];
        if (tok.isSentenceEnd) sentences += 1;
        const clean = tok.clean ?? tok.word.replace(/[^A-Za-z']/g, '');
        const letters = clean.replace(/[^A-Za-z]/g, '');
        if (!letters) continue;
        each(letters, letters[0] === letters[0].toLowerCase());
    }
    return sentences;
}

function shortLineShare(text, from, to, total) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const a = Math.floor(lines.length * (from / Math.max(1, total)));
    const b = Math.ceil(lines.length * (to / Math.max(1, total)));
    const storyLines = lines.slice(a, b);
    return storyLines.filter((l) => l.length < SHORT_LINE_CHARS).length / Math.max(1, storyLines.length);
}

// ── A worker process: fetch, parse, count, forget ───────────────────────
const invoked = process.argv[1] === SELF;
if (!invoked) {
    // Imported for partStarts (deep-queue.mjs): nothing runs.
} else if (has('--worker')) {
    const tp = loadTextProcessing();
    const common = new Set(JSON.parse(readFileSync(REFERENCE, 'utf8')).common.split(' '));
    process.on('message', async ({ id, start, titled }) => {
        try {
            const text = await fetchText(id);
            if (text === null) { process.send({ id, missing: true }); return; }
            const parsed = tp.parseText(text);
            const [from, to] = storySpan(parsed, start);
            let long = 0;
            let lower = 0;
            let rare = 0;
            const sentences = eachWord(parsed, from, to, (letters, isLower) => {
                if (syllables(letters) >= 3) long += 1;
                if (isLower) {
                    lower += 1;
                    if (!common.has(letters.toLowerCase())) rare += 1;
                }
            });
            const line = {
                id, words: to - from, sentences, long, lower, rare,
                shortLines: +shortLineShare(text, from, to, parsed.tokens.length).toFixed(4),
                // What the reader's parser makes of the book's own chapters
                // (the pickup page's parts for a book with no authored ones):
                // how many it finds, how sure it is, and how many of them lie
                // inside the readable span (front and back matter left out).
                // That last count is the page's own rule, chapterParts in the
                // Android repo's src/open/pickup.ts: keep the two the same.
                chapters: parsed.chapters.length, conf: parsed.chapterConfidence,
                tokens: parsed.tokens.length, from: parsed.readableStartWord, to: parsed.readableEndWord,
                // Where each chapter starts (word indexes only, never its
                // heading), so the page's rule for which chapters make good
                // parts can be worked out again without fetching anything.
                starts: parsed.chapters.map((c) => c.wordIndex),
            };
            if (!titled) {
                const head = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, HEAD_LINES).join(' ');
                if (NOT_PROSE_TITLE.test(head)) line.refHead = true;
            }
            process.send(line);
        } catch (e) {
            process.send({ id, error: String(e?.message ?? e) });
        }
    });
    process.send({ ready: true });
} else {
    await main();
}

function loadTitles() {
    const t = {};
    try {
        for (const b of JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'curated.json'), 'utf8'))) t[b.id] = b.title;
    } catch { /* titles only sharpen the reference rule */ }
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

function readMeasures() {
    const out = {};
    if (!existsSync(MEASURES)) return out;
    for (const line of readFileSync(MEASURES, 'utf8').split('\n')) {
        if (!line) continue;
        const m = JSON.parse(line);
        out[m.id] = m; // a later line for the same id wins
    }
    return out;
}

/** The frozen list of common words, from the calibration books' own texts. */
async function buildReference(refIds, bundledStarts) {
    const tp = loadTextProcessing();
    const df = new Map();
    let next = 0;
    let done = 0;
    const work = async () => {
        while (next < refIds.length) {
            const id = refIds[next++];
            const text = await fetchText(id);
            if (text === null) throw new Error(`calibration book ${id} is not served`);
            const parsed = tp.parseText(text);
            const [from, to] = storySpan(parsed, bundledStarts[id]);
            const seen = new Set();
            eachWord(parsed, from, to, (letters, isLower) => { if (isLower) seen.add(letters.toLowerCase()); });
            for (const w of seen) df.set(w, (df.get(w) ?? 0) + 1);
            done += 1;
            if (done % 100 === 0) console.log(`  read ${done}/${refIds.length}`);
        }
    };
    await Promise.all(Array.from({ length: FETCHES }, work));
    const commonAt = COMMON_DF * refIds.length;
    const common = [...df].filter(([, n]) => n >= commonAt).map(([w]) => w).sort();
    writeFileSync(REFERENCE, JSON.stringify({
        note: 'The frozen calibration set of the Language level (measure-levels.mjs): the books the bands were cut on, and every lower case word a fifth of them use. Not served, not bundled.',
        books: refIds,
        common: common.join(' '),
    }) + '\n');
    console.log(`levels-reference.json: ${refIds.length} books, ${common.length} common words`);
}

async function measureAll(todo, startOf, titles) {
    const started = Date.now();
    const limit = has('--long') ? Infinity : TIME_LIMIT_MS;
    let next = 0;
    let done = 0;
    let missing = 0;
    const failed = [];
    await new Promise((resolve, reject) => {
        let live = WORKERS;
        const perWorker = Math.ceil(FETCHES / WORKERS);
        for (let w = 0; w < WORKERS; w += 1) {
            const child = fork(SELF, ['--worker']);
            let inFlight = 0;
            const feed = () => {
                while (inFlight < perWorker && next < todo.length) {
                    if (Date.now() - started > limit) { next = todo.length; break; }
                    const id = todo[next++];
                    inFlight += 1;
                    child.send({ id, start: startOf(id), titled: Boolean(titles[id]) });
                }
                if (inFlight === 0 && next >= todo.length) child.kill();
            };
            child.on('message', (m) => {
                if (m.ready) { feed(); return; }
                inFlight -= 1;
                if (m.error) failed.push(`${m.id}: ${m.error}`);
                else {
                    appendFileSync(MEASURES, JSON.stringify(m) + '\n');
                    if (m.missing) missing += 1;
                }
                done += 1;
                if (done % 500 === 0) {
                    const secs = (Date.now() - started) / 1000;
                    console.log(`  measured ${done}/${todo.length} (${Math.round(secs)}s, ${Math.round((todo.length - done) / (done / secs) / 60)} min left)`);
                }
                feed();
            });
            child.on('error', reject);
            child.on('exit', () => { live -= 1; if (live === 0) resolve(); });
        }
    });
    console.log(`measured ${done - failed.length} books in ${Math.round((Date.now() - started) / 1000)}s (${missing} not served, ${failed.length} failed and will be retried by the next run)`);
    for (const f of failed.slice(0, 10)) console.log(`  failed ${f}`);
    if (done < todo.length) console.log(`stopped at the time limit with ${todo.length - done} still to measure: run again (or with --long)`);
}

async function main() {
    const meta = JSON.parse(readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
    const bundledStarts = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'story-starts.json'), 'utf8'));
    const deep = JSON.parse(readFileSync(path.join(ROOT, 'public', 'starts-v1.json'), 'utf8'));
    const referenceWorks = new Set(deep.nn ?? []);
    const titles = loadTitles();
    // Every book with a served text: the app's lists, the deep starts set,
    // and everything the deep starts pass wrote a hook for.
    const ids = [...new Set([...Object.keys(bundledStarts), ...Object.keys(titles), ...Object.keys(deep.starts), ...(deep.nn ?? []), ...Object.keys(meta)])]
        .filter((id) => /^\d+$/.test(id))
        .sort((a, b) => Number(a) - Number(b));
    const startOf = (id) => (typeof bundledStarts[id] === 'number' && bundledStarts[id] > 0 ? bundledStarts[id] : deep.starts[id]);

    const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {};
    if (has('--reference') || !existsSync(REFERENCE)) {
        // The calibration books: the ones already frozen, or (the first
        // time) the books the bands were cut on, which is the store as it
        // stood before the catalog run.
        const refIds = existsSync(REFERENCE) ? JSON.parse(readFileSync(REFERENCE, 'utf8')).books : Object.keys(store);
        await buildReference(refIds, bundledStarts);
        if (has('--reference')) return;
    }
    const reference = JSON.parse(readFileSync(REFERENCE, 'utf8'));

    let measures = readMeasures();
    if (!has('--band') && !showArg) {
        const todo = ids.filter((id) => !measures[id] || (measures[id].missing && has('--retry-missing')));
        console.log(`${ids.length} books, ${ids.length - todo.length} measured already, ${todo.length} to measure`);
        if (todo.length) await measureAll(todo, startOf, titles);
        measures = readMeasures();
    }

    const rates = (m) => ({
        asl: m.sentences > 0 ? m.words / m.sentences : null,
        rare: m.lower > 0 ? m.rare / m.lower : null,
        long: m.words > 0 ? m.long / m.words : null,
    });
    /** Why a book gets no language level, or null when its measure holds. */
    const untrusted = (id, m, r) => {
        const voice = meta[id]?.voice;
        if (voice === 'play' || voice === 'verse') return voice;
        if (referenceWorks.has(id)) return 'reference work';
        if (titles[id] ? NOT_PROSE_TITLE.test(titles[id]) : m.refHead) return 'reference title';
        if (m.words < MIN_WORDS) return 'too short';
        if (r.asl === null || r.asl > MAX_ASL) return 'not prose punctuation';
        if (m.shortLines > SHORT_LINE_SHARE) return 'mostly short lines';
        if (r.rare === null || r.rare > MAX_RARE) return 'archaic spelling, dialect or not English';
        return null;
    };
    const measured = Object.values(measures).filter((m) => !m.missing);
    // The scale: the calibration books that can be trusted, and only those.
    const scaleSet = reference.books.map((id) => measures[id]).filter((m) => m && !m.missing).map((m) => [m, rates(m)]).filter(([m, r]) => !untrusted(m.id, m, r));
    if (scaleSet.length < 100) { console.error(`only ${scaleSet.length} calibration books are measured: run the measure first`); process.exit(1); }
    const stats = (k) => {
        const v = scaleSet.map(([, r]) => r[k]).sort((a, b) => a - b);
        const q = (f) => v[Math.floor(f * (v.length - 1))];
        return { mid: q(0.5), spread: (q(0.75) - q(0.25)) / 1.349 || 1 };
    };
    const st = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, stats(k)]));
    const score = (r) => Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * Math.max(-CLIP, Math.min(CLIP, (r[k] - st[k].mid) / st[k].spread)), 0);
    const level = (s) => 1 + LANGUAGE_BANDS.filter((cut) => s >= cut).length;
    const banded = {};
    for (const m of measured) {
        const r = rates(m);
        const why = untrusted(m.id, m, r);
        banded[m.id] = {
            words: m.words, score: why ? null : score(r), language: why ? null : HAND_LEVELS[m.id] ?? level(score(r)), why, r,
            // The book's own chapters, only where the parser is sure of them.
            chapters: (m.conf === 'high' && partStarts(m.starts ?? [], m.from, m.to).length) || null,
        };
    }

    if (showArg) {
        for (const id of showArg.slice('--show='.length).split(',')) {
            const m = measures[id];
            const b = banded[id];
            console.log(id, titles[id] ?? '?', b ? {
                words: m.words, asl: +b.r.asl?.toFixed(1), rare: +(b.r.rare * 100).toFixed(2), long: +(b.r.long * 100).toFixed(1),
                shortLines: m.shortLines, score: b.score === null ? null : +b.score.toFixed(2), language: b.language, why: b.why,
                chapters: m.chapters, conf: m.conf,
            } : m?.missing ? 'not served' : 'not measured');
        }
        return;
    }

    // Merge into the store, keeping the rated pace.
    const next = {};
    for (const id of new Set([...Object.keys(store), ...Object.keys(banded)])) {
        const b = banded[id];
        const prev = store[id] ?? {};
        const entry = {};
        if (b && b.words > 0) entry.words = b.words; else if (!b && prev.words) entry.words = prev.words;
        if (b ? b.language : prev.language) entry.language = b ? b.language : prev.language;
        if (prev.pace) entry.pace = prev.pace;
        if (b ? b.chapters : prev.chapters) entry.chapters = b ? b.chapters : prev.chapters;
        if (Object.keys(entry).length) next[id] = entry;
    }
    const keys = Object.keys(next).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    writeFileSync(STORE, '{\n' + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(next[k])}`).join(',\n') + '\n}\n');
    const levels = [1, 2, 3, 4, 5].map((n) => Object.values(banded).filter((b) => b.language === n).length);
    const whys = {};
    for (const b of Object.values(banded)) if (b.why) whys[b.why] = (whys[b.why] ?? 0) + 1;
    const notServed = Object.values(measures).filter((m) => m.missing).length;
    console.log(`levels.json: ${keys.length} books (${keys.filter((k) => next[k].words).length} with a length, ${keys.filter((k) => next[k].language).length} with a language level); language 1..5 = ${levels.join(' / ')}`);
    console.log(`no language level: ${Object.entries(whys).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ${n}`).join(', ')}; not served ${notServed}`);
    const high = measured.filter((m) => m.conf === 'high').length;
    console.log(`chapters: the parser is sure of them in ${high} of ${measured.length} books, and ${Object.values(banded).filter((x) => x.chapters).length} of those lists make parts the page can show`);
}
