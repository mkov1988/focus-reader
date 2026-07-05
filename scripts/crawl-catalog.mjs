/**
 * Crawl the full Gutendex catalog (metadata for every Project Gutenberg book,
 * ~75k entries) into mirror/catalog.json, as the master input for the bulk
 * mirror job (scripts/mirror-all.mjs).
 *
 * Gutendex is the free JSON catalog service the app itself already queries for
 * live search (src/services/gutendex.ts). One page = 32 books; the whole
 * catalog is ~2,300 pages. We keep only the fields the quality gate and future
 * browse features need, so the output stays around 40MB.
 *
 * Resumable: progress is checkpointed every 50 pages to mirror/catalog.json
 * with a `nextPage` marker; rerunning continues where it left off. `--fresh`
 * starts over. `--pages=N` crawls only N pages (smoke test).
 *
 *   node scripts/crawl-catalog.mjs               full crawl (~15-25 min)
 *   node scripts/crawl-catalog.mjs --pages=2     smoke test
 *   node scripts/crawl-catalog.mjs --fresh       ignore checkpoint, start over
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'mirror');
const OUT_PATH = path.join(OUT_DIR, 'catalog.json');

const API = 'https://gutendex.com/books';
const DELAY_MS = Number(process.env.CATALOG_DELAY_MS) || 250;
const RETRIES = 4;

const FRESH = process.argv.includes('--fresh');
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const MAX_PAGES = arg('pages') ? Number(arg('pages')) : Infinity;

/** Same preference order as src/services/gutendex.ts pickTextUrl. */
function pickTextUrl(formats) {
    const preferred = ['text/plain; charset=utf-8', 'text/plain; charset=us-ascii', 'text/plain'];
    for (const key of preferred) {
        const url = formats[key];
        if (url && !url.endsWith('.zip')) return url;
    }
    const fallback = Object.keys(formats).find((k) => k.startsWith('text/plain') && !formats[k].endsWith('.zip'));
    return fallback ? formats[fallback] : undefined;
}

/** "Austen, Jane" -> "Jane Austen" (same as the app's formatAuthor). */
function formatAuthor(name) {
    if (!name) return 'Unknown';
    const parts = name.split(',').map((s) => s.trim());
    if (parts.length === 2 && parts[1]) return `${parts[1]} ${parts[0]}`.trim();
    return name;
}

/** Keep only what the quality gate and future browse features need. */
function lean(b) {
    return {
        id: String(b.id),
        title: b.title,
        author: formatAuthor(b.authors?.[0]?.name),
        authorDeath: b.authors?.[0]?.death_year ?? null,
        languages: b.languages ?? [],
        subjects: b.subjects ?? [],
        bookshelves: b.bookshelves ?? [],
        copyright: b.copyright, // true = still copyrighted, false = public domain (US), null = unknown
        mediaType: b.media_type,
        downloads: b.download_count ?? 0,
        textUrl: pickTextUrl(b.formats ?? {}),
        hasCover: Boolean(b.formats?.['image/jpeg']),
    };
}

async function fetchPage(page) {
    let lastErr;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        try {
            const res = await fetch(`${API}?page=${page}`, { headers: { 'User-Agent': 'FocusReader catalog crawl' } });
            // Gutendex answers 404 for a page past the end: that is the finish line.
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, attempt * 2000));
        }
    }
    throw lastErr;
}

async function run() {
    await mkdir(OUT_DIR, { recursive: true });

    let books = [];
    let page = 1;
    if (!FRESH && existsSync(OUT_PATH)) {
        try {
            const prev = JSON.parse(await readFile(OUT_PATH, 'utf8'));
            if (prev.nextPage && Array.isArray(prev.books)) {
                books = prev.books;
                page = prev.nextPage;
                console.log(`Resuming from page ${page} (${books.length} books already crawled).`);
            } else if (Array.isArray(prev.books)) {
                console.log(`Catalog already complete (${prev.books.length} books). Use --fresh to recrawl.`);
                return;
            }
        } catch {
            console.log('Existing catalog file unreadable; starting fresh.');
        }
    }

    const startPage = page;
    const save = (nextPage) =>
        writeFile(OUT_PATH, JSON.stringify(nextPage ? { nextPage, books } : { crawledAt: new Date().toISOString(), books }));

    while (page - startPage < MAX_PAGES) {
        const data = await fetchPage(page);
        if (data === null || !data.results?.length) break;
        for (const b of data.results) books.push(lean(b));
        if (page % 50 === 0) {
            await save(page + 1);
            process.stdout.write(`\r  page ${page}   ${books.length} books`.padEnd(48));
        }
        if (!data.next) { page++; break; }
        page++;
        await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    // A smoke-test run (--pages) keeps the nextPage marker so a later full run resumes.
    const finished = !Number.isFinite(MAX_PAGES) || MAX_PAGES <= 0 ? true : page - startPage < MAX_PAGES;
    await save(finished ? undefined : page);
    console.log(`\nDone. ${books.length} books in mirror/catalog.json${finished ? '' : ` (partial, resumes at page ${page})`}.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
