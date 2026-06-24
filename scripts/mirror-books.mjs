/**
 * Mirror book *text* off Project Gutenberg into our own static host, the same
 * way mirror-covers.mjs handles cover images.
 *
 * Why: book content is currently streamed from gutenberg.org at read time, which
 * takes 7-13 seconds per book and depends on a slow, throttling third party that
 * also can't work offline. Book text is immutable and the catalog is finite and
 * known, so the right model is to download each book once, here, clean it, and
 * serve our own copy. The app then opens a book from /books (or a CDN) in well
 * under a second, and never touches gutenberg at read time. See
 * docs/planning/book_access_strategy.md §6-7.
 *
 * Legal note: we strip the Project Gutenberg header/footer/license here on
 * purpose. That removes the work from the Project Gutenberg trademark license, so
 * what we serve is a plain public-domain text. Do NOT reintroduce the "Project
 * Gutenberg" name into the stored files. (book_access_strategy.md §6.)
 *
 * Be polite: gutenberg.org discourages bulk crawling and will block the IP. For a
 * full catalog run, point BOOK_SOURCE at an official mirror and keep concurrency
 * low. This script is resumable (skips books already mirrored) so you can stop,
 * resume, and retry failures across several short runs.
 *
 *   node scripts/mirror-books.mjs                  mirror every catalog book
 *   node scripts/mirror-books.mjs --vibe=cozy      just one vibe's books
 *   node scripts/mirror-books.mjs --curated        just the curated catalog
 *   node scripts/mirror-books.mjs --ids=1342,84    just these ids
 *   node scripts/mirror-books.mjs --limit=20       first 20 (smoke test)
 *   node scripts/mirror-books.mjs --force          re-download even if present
 *
 * Tunables via env: BOOK_SOURCE (origin to fetch from, default gutenberg.org),
 * BOOK_CONCURRENCY (default 4).
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURATED_PATH = path.join(ROOT, 'src', 'data', 'curated.json');
const VIBES_PATH = path.join(ROOT, 'src', 'data', 'vibes.json');
// Served same-origin at /books/<id>.txt and bundled into the build. Gitignored.
const OUT_DIR = path.join(ROOT, 'public', 'books');

const SOURCE = (process.env.BOOK_SOURCE || 'https://www.gutenberg.org').replace(/\/+$/, '');
const CONCURRENCY = Number(process.env.BOOK_CONCURRENCY) || 4;
const RETRIES = 3;
const TIMEOUT_MS = 30_000;

const FORCE = process.argv.includes('--force');
const CURATED_ONLY = process.argv.includes('--curated');
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const VIBE = arg('vibe') || null;
const IDS = (arg('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;

/** Identical copy of src/services/library.ts stripGutenbergBoilerplate — keep the
 *  two in sync. Handles modern and old header/footer formats, drops the leading
 *  credit block, and removes every line carrying the Project Gutenberg trademark.
 *  That trademark removal is what frees the stored text from the Gutenberg
 *  license, so it is legally load bearing, not just cosmetic (book_access_strategy §6). */
function stripBoilerplate(raw) {
    let text = raw.replace(/\r\n/g, '\n');

    const start = text.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    if (start?.index !== undefined) {
        text = text.slice(start.index + start[0].length);
    } else {
        const smallPrint = text.match(/\*\s*END[^\n]*SMALL PRINT[^\n]*/i);
        if (smallPrint?.index !== undefined) text = text.slice(smallPrint.index + smallPrint[0].length);
    }

    const end = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    if (end?.index !== undefined) {
        text = text.slice(0, end.index);
    } else {
        const oldEnd = text.match(/\n\s*End of (?:the |this )?Project Gutenberg[^\n]*/i);
        if (oldEnd?.index !== undefined) text = text.slice(0, oldEnd.index);
    }

    const creditRe = /(produced by|prepared by|transcrib|proofread|distributed proofreading|pgdp\.net|gutenberg\.org|project gutenberg|updated editions|this e-?(?:text|book) was|html version|original illustrations|see \S+-h\.(?:htm|zip))/i;
    const skip = (l) => l.trim() === '' || creditRe.test(l) || /^\s*\(?https?:\/\//i.test(l) || /^\s*(?:or|and)\s*$/i.test(l);
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && skip(lines[i])) i++;
    text = lines.slice(i).join('\n');

    text = text.split('\n').filter((l) => !/project gutenberg/i.test(l)).join('\n');

    return text.trim();
}

async function fetchText(url) {
    let lastErr;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'FocusReader book mirror' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            lastErr = err;
            if (attempt < RETRIES) await new Promise((r) => setTimeout(r, attempt * 1500));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
}

/** Try the two canonical plain-text paths for a book id (same as build-vibes). */
async function fetchBook(id) {
    const urls = [
        `${SOURCE}/cache/epub/${id}/pg${id}.txt`,
        `${SOURCE}/files/${id}/${id}-0.txt`,
    ];
    let lastErr;
    for (const url of urls) {
        try {
            return await fetchText(url);
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

function collectIds() {
    const ids = new Set();
    return (async () => {
        if (IDS.length) {
            for (const id of IDS) ids.add(String(id));
            return [...ids];
        }
        if (!VIBE) {
            const curated = JSON.parse(await readFile(CURATED_PATH, 'utf8'));
            for (const b of curated) if (b.id) ids.add(String(b.id));
        }
        if (!CURATED_ONLY) {
            const vibes = JSON.parse(await readFile(VIBES_PATH, 'utf8'));
            for (const v of vibes) {
                if (VIBE && v.key !== VIBE) continue;
                for (const b of [...(v.hero ?? []), ...(v.shelves ?? []).flatMap((s) => s.books ?? [])]) {
                    if (b.id) ids.add(String(b.id));
                }
            }
        }
        return [...ids];
    })();
}

async function run() {
    await mkdir(OUT_DIR, { recursive: true });
    let ids = await collectIds();
    if (Number.isFinite(LIMIT)) ids = ids.slice(0, LIMIT);

    let done = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];
    const report = (note) =>
        process.stdout.write(`\r  saved ${done}   skipped ${skipped}   failed ${failed}   ${note}`.padEnd(72));

    let cursor = 0;
    async function worker() {
        while (cursor < ids.length) {
            const id = ids[cursor++];
            const out = path.join(OUT_DIR, `${id}.txt`);
            if (!FORCE && existsSync(out)) {
                skipped++;
                report(`#${id}`);
                continue;
            }
            try {
                const raw = await fetchBook(id);
                const clean = stripBoilerplate(raw);
                if (clean.length < 500) throw new Error('suspiciously short after strip');
                await writeFile(out, clean, 'utf8');
                done++;
                report(`#${id}`);
            } catch (err) {
                failed++;
                failures.push({ id, error: String(err?.message ?? err) });
                report(`#${id} failed`);
            }
        }
    }

    console.log(`Mirroring ${ids.length} books to public/books/ from ${SOURCE} (concurrency ${CONCURRENCY})\n`);
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (failures.length) {
        await writeFile(path.join(OUT_DIR, '_failed.json'), JSON.stringify(failures, null, 2));
    }
    console.log(`\n\nDone. saved ${done}, skipped ${skipped} already present, failed ${failed}.`);
    if (failures.length) console.log(`Failed ids saved to public/books/_failed.json. Re-run to retry them.`);
    console.log(`\nBooks are in public/books/ and served same-origin at /books/. (Set VITE_BOOK_BASE to host them on a CDN instead.)`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
