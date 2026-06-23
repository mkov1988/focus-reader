/**
 * Add an estimated `words` count to every book in src/data/vibes.json so the
 * Vibe pages can show a read-time chip ("~N min") and a length filter.
 *
 * For each unique book it downloads the Project Gutenberg plain text, strips the
 * legal boilerplate, and counts words. If a download fails after retries it
 * falls back to estimating from the file size (Content-Length / ~6 bytes/word),
 * so every book ends up with a number.
 *
 * Cached + resumable: counts are written to scripts/.vibe-wordcounts.json as it
 * goes, so re-running only fetches what's missing. Throttled (small concurrency)
 * to be polite to gutenberg.org.
 *
 *   node scripts/add-vibe-wordcounts.mjs
 *   node scripts/add-vibe-wordcounts.mjs --conc=6   concurrency (default 4)
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIBES_PATH = path.join(ROOT, 'src', 'data', 'vibes.json');
const CACHE_PATH = path.join(ROOT, 'scripts', '.vibe-wordcounts.json');

const arg = (name, def) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`));
    return a ? Number(a.split('=')[1]) : def;
};
const CONCURRENCY = arg('conc', 4);
// Re-fetch cached entries whose stored count is below this (used to repair books
// whose .txt.utf-8 URL had returned a 404/HTML page that got miscounted).
const REFETCH_BELOW = arg('refetch-below', 0);
const UA = 'FocusReader-wordcount/1.0 (one-time catalog measurement)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Estimate the word count from the plain-text file size (Content-Length / ~6.1
// bytes per English word). A HEAD request follows the redirect to the real file
// and is cheap, so it doesn't get throttled/truncated the way full downloads do.
// It also cleanly flags dead editions: a 404 means there is no readable text, so
// the book is unreadable in the app too and gets pruned.
const BYTES_PER_WORD = 6.1;
// The 404 error page is ~6.4KB; require more than this so a stray 200-served
// error page can't masquerade as a tiny book.
const MIN_BYTES = 8000;
async function measure(book) {
    // HEAD the CANONICAL plain-text URLs directly (the .txt.utf-8 redirect is
    // flaky — it intermittently 404s or returns a stub). cache/epub is stable.
    const urls = [
        `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`,
        `https://www.gutenberg.org/files/${book.id}/${book.id}-0.txt`,
    ];
    for (let i = 0; i < 2; i++) {
        for (const url of urls) {
            try {
                const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'follow' });
                if (r.ok) {
                    const cl = Number(r.headers.get('content-length'));
                    if (cl > MIN_BYTES) return { words: Math.round(cl / BYTES_PER_WORD), how: 'size' };
                }
            } catch { /* try next / retry */ }
        }
        await sleep(600 * (i + 1));
    }
    return { words: 0, how: 'dead' }; // no readable text at canonical URLs → prune
}

async function main() {
    const vibes = JSON.parse(await readFile(VIBES_PATH, 'utf8'));

    // Unique books across all vibes (hero + shelves).
    const books = new Map();
    for (const v of vibes) {
        for (const b of v.hero) if (b.textUrl && !books.has(b.id)) books.set(b.id, b);
        for (const s of v.shelves) for (const b of s.books) if (b.textUrl && !books.has(b.id)) books.set(b.id, b);
    }

    let cache = {};
    try { cache = JSON.parse(await readFile(CACHE_PATH, 'utf8')); } catch { /* fresh */ }

    const todo = [...books.values()].filter((b) => cache[b.id] == null || cache[b.id] < REFETCH_BELOW);
    console.log(`${books.size} unique books; ${Object.keys(cache).length} cached; ${todo.length} to fetch (conc ${CONCURRENCY}).`);

    let done = 0;
    let savePending = 0;
    const saveCache = async () => { await writeFile(CACHE_PATH, JSON.stringify(cache)); savePending = 0; };

    let idx = 0;
    async function worker() {
        while (idx < todo.length) {
            const b = todo[idx++];
            const r = await measure(b);
            cache[b.id] = r ? r.words : null;
            done++;
            savePending++;
            if (savePending >= 10) await saveCache();
            if (done % 25 === 0 || done === todo.length) {
                process.stdout.write(`  ${done}/${todo.length}  (#${b.id} → ${cache[b.id]} words${r ? ' ' + r.how : ' FAILED'})\n`);
            }
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await saveCache();

    // Write `words` back into every entry in vibes.json.
    let written = 0;
    const apply = (b) => { if (cache[b.id] != null) { b.words = cache[b.id]; written++; } };
    for (const v of vibes) {
        for (const b of v.hero) apply(b);
        for (const s of v.shelves) for (const b of s.books) apply(b);
    }
    await writeFile(VIBES_PATH, JSON.stringify(vibes));
    console.log(`\nWrote ${VIBES_PATH} — words set on ${written} entries (${Object.keys(cache).length} unique measured).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
