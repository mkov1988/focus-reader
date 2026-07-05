/**
 * Bulk-mirror the FULL Gutenberg catalog with a quality gate, so the long tail
 * a reader reaches through search never serves garbage.
 *
 * Input is mirror/catalog.json (built by scripts/crawl-catalog.mjs). Output is
 * mirror/books/<id>.txt — deliberately NOT public/books/, because 60k files
 * can never ship inside the Cloudflare Pages build (20k file limit); this
 * collection is destined for bucket storage (R2) behind VITE_BOOK_BASE. The
 * curated storefront mirror in public/books/ is untouched.
 *
 * The gate has two layers, and every rejection is logged with a reason to
 * mirror/_rejected.json so the gate's judgment can be audited:
 *
 *   Metadata gate (before spending any bandwidth):
 *     - must be a Text (not audio/data), in English, public domain in the US
 *       (copyright false; true and unknown are both excluded, since we charge)
 *     - must actually have a plain-text file to download
 *     - reference works are excluded by subject/bookshelf (dictionaries,
 *       encyclopedias, indexes, periodicals, directories, catalogs) and by a
 *       conservative title check (word lists, factbooks, gazetteers, ...)
 *
 *   Content gate (after download + boilerplate strip):
 *     - at least 4,000 characters (The Tale of Peter Rabbit is ~5,900, so real
 *       short works pass; title-page stubs and broken strips fail)
 *     - reads like prose: at least 3 sentence marks (.!?) per 1,000 characters
 *       (word lists and raw data score near zero)
 *     - not a data table: digits are at most 15% of the text
 *     - not mojibake: at most 20 Unicode replacement characters
 *
 * Politeness: gutenberg.org blocks bulk crawlers. For the full run, set
 * BOOK_SOURCE to an official mirror and keep BOOK_CONCURRENCY low (default 2,
 * plus a per-request delay). The script is resumable (skips ids already saved
 * or already rejected), so it can be stopped and rerun freely.
 *
 *   node scripts/mirror-all.mjs --dry              gate stats only, no downloads
 *   node scripts/mirror-all.mjs --limit=25         first 25 passing books (smoke)
 *   node scripts/mirror-all.mjs --ids=84,3206      just these ids (metadata fetched live)
 *   node scripts/mirror-all.mjs                    the full overnight run
 *
 * Env: BOOK_SOURCE (default https://www.gutenberg.org — set a mirror for the
 * full run), BOOK_CONCURRENCY (default 2), BOOK_DELAY_MS (default 250).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'mirror', 'catalog.json');
const OUT_DIR = path.join(ROOT, 'mirror', 'books');
const REJECTED_PATH = path.join(ROOT, 'mirror', '_rejected.json');
const FAILED_PATH = path.join(ROOT, 'mirror', '_failed.json');

const SOURCE = (process.env.BOOK_SOURCE || 'https://www.gutenberg.org').replace(/\/+$/, '');
const CONCURRENCY = Number(process.env.BOOK_CONCURRENCY) || 2;
const DELAY_MS = Number(process.env.BOOK_DELAY_MS) || 250;
const RETRIES = 3;
const TIMEOUT_MS = 45_000;

const DRY = process.argv.includes('--dry');
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const IDS = (arg('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;

/* ------------------------------------------------------------------ */
/* Metadata gate                                                       */
/* ------------------------------------------------------------------ */

// Subjects/bookshelves that mark reference material rather than reading
// material. Substring match, case-insensitive, against every subject and shelf.
const JUNK_TOPICS = [
    'dictionaries', 'encyclopedias', 'indexes', 'periodicals', 'directories',
    'catalogs', 'bibliography', 'census', 'statistics', 'reference',
    'concordances', 'terminology', 'glossaries',
];

// Conservative title check for reference works whose subject tags are missing.
// Kept narrow on purpose: a false "junk" verdict hides a real book, which is
// worse than letting an odd duck through for a human to prune later.
const JUNK_TITLE = /\b(dictionar|thesaur|encyclop|word list|language list|word book|factbook|gazetteer|almanac|concordance|bibliograph|glossar|index (?:of|to)|linked index|catalogue of|catalog of|genome|human chromosome)\b/i;

/** Decide from metadata alone whether a book belongs in the collection.
 *  Returns null to admit, or a short human-readable reason to reject. */
function metadataReject(b) {
    if (b.mediaType && b.mediaType !== 'Text') return `not text (${b.mediaType})`;
    if (!b.languages.includes('en')) return 'not English';
    if (b.copyright !== false) return b.copyright ? 'still copyrighted' : 'copyright unknown';
    if (!b.textUrl) return 'no plain-text file';
    const topics = [...b.subjects, ...b.bookshelves].join(' | ').toLowerCase();
    for (const t of JUNK_TOPICS) {
        if (topics.includes(t)) return `reference material (${t})`;
    }
    const m = b.title.match(JUNK_TITLE);
    if (m) return `reference title (${m[0].toLowerCase()})`;
    return null;
}

/* ------------------------------------------------------------------ */
/* Content gate                                                        */
/* ------------------------------------------------------------------ */

/** Decide from the cleaned text whether it reads like a real book.
 *  Returns null to admit, or a short human-readable reason to reject.
 *
 *  Re-tuned 2026-07-05 after auditing the first-run culls: the original
 *  4,000-char floor and 3-marks-per-1k prose test threw out real books —
 *  Descartes' Discourse on the Method (17th-century prose runs enormous
 *  sentences with few periods) and two genuine flash-length stories. Old prose
 *  and verse are comma-rich even when period-poor; word lists and data have
 *  neither. So the floor drops to 2,000 chars (real stubs measure in the
 *  hundreds) and the prose test now requires BOTH terminal marks and clause
 *  punctuation to be scarce before rejecting. */
function contentReject(clean) {
    if (clean.length < 2000) return `too short after strip (${clean.length} chars)`;
    const terminal = ((clean.match(/[.!?]/g) || []).length / clean.length) * 1000;
    const clause = ((clean.match(/[,;:]/g) || []).length / clean.length) * 1000;
    if (terminal < 1.2 && clause < 8) {
        return `not prose (${terminal.toFixed(1)} sentence marks, ${clause.toFixed(1)} clause marks per 1k chars)`;
    }
    const nonSpace = clean.replace(/\s/g, '');
    const digits = (nonSpace.match(/[0-9]/g) || []).length;
    if (digits / nonSpace.length > 0.15) return `data-heavy (${Math.round((digits / nonSpace.length) * 100)}% digits)`;
    const bad = (clean.match(/�/g) || []).length;
    if (bad > 20) return `broken encoding (${bad} replacement chars)`;
    return null;
}

/* ------------------------------------------------------------------ */
/* Boilerplate strip — identical copy of src/services/library.ts        */
/* stripGutenbergBoilerplate (and scripts/mirror-books.mjs). Keep all   */
/* three in sync. Removing the trademark is legally load bearing        */
/* (book_access_strategy.md §6).                                        */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

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

/** Try the two canonical plain-text paths on BOOK_SOURCE, then the book's own
 *  catalog URL as a last resort (that one always points at gutenberg.org). */
async function fetchBook(b) {
    const urls = [
        `${SOURCE}/cache/epub/${b.id}/pg${b.id}.txt`,
        `${SOURCE}/files/${b.id}/${b.id}-0.txt`,
        ...(b.textUrl ? [b.textUrl] : []),
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

/** Fetch live metadata for specific ids (--ids mode) in Gutendex lean shape. */
async function fetchIdsMetadata(ids) {
    const res = await fetch(`https://gutendex.com/books?ids=${ids.join(',')}`, { headers: { 'User-Agent': 'FocusReader book mirror' } });
    if (!res.ok) throw new Error(`Gutendex ids lookup failed (HTTP ${res.status})`);
    const data = await res.json();
    return data.results.map((b) => ({
        id: String(b.id),
        title: b.title,
        author: b.authors?.[0]?.name ?? 'Unknown',
        languages: b.languages ?? [],
        subjects: b.subjects ?? [],
        bookshelves: b.bookshelves ?? [],
        copyright: b.copyright,
        mediaType: b.media_type,
        downloads: b.download_count ?? 0,
        textUrl: (() => {
            const f = b.formats ?? {};
            for (const k of ['text/plain; charset=utf-8', 'text/plain; charset=us-ascii', 'text/plain']) {
                if (f[k] && !f[k].endsWith('.zip')) return f[k];
            }
            const alt = Object.keys(f).find((k) => k.startsWith('text/plain') && !f[k].endsWith('.zip'));
            return alt ? f[alt] : undefined;
        })(),
    }));
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

async function loadJson(p, fallback) {
    if (!existsSync(p)) return fallback;
    try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

async function run() {
    await mkdir(OUT_DIR, { recursive: true });

    let books;
    if (IDS.length) {
        books = await fetchIdsMetadata(IDS);
    } else {
        if (!existsSync(CATALOG_PATH)) {
            console.error('No mirror/catalog.json — run `npm run crawl:catalog` first.');
            process.exit(1);
        }
        const catalog = await loadJson(CATALOG_PATH, {});
        if (catalog.nextPage) {
            console.error(`Catalog crawl is incomplete (stopped at page ${catalog.nextPage}). Finish \`npm run crawl:catalog\` first.`);
            process.exit(1);
        }
        books = catalog.books ?? [];
        // Most-downloaded first, so the most-wanted books land earliest and any
        // interrupted run has already banked the popular half of the library.
        books.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));
    }

    // Resumability: prior rejects stand (same gate verdict every run unless the
    // gate itself changed); prior saves are skipped by file existence below.
    const priorRejects = await loadJson(REJECTED_PATH, []);
    const rejectedIds = new Set(priorRejects.map((r) => r.id));

    const admitted = [];
    const rejects = [...priorRejects];
    let gateDrop = 0;
    for (const b of books) {
        if (rejectedIds.has(b.id)) { gateDrop++; continue; }
        const why = metadataReject(b);
        if (why) {
            rejects.push({ id: b.id, title: b.title, stage: 'metadata', reason: why });
            rejectedIds.add(b.id);
            gateDrop++;
        } else {
            admitted.push(b);
        }
    }

    console.log(`Catalog: ${books.length} books. Metadata gate admits ${admitted.length}, rejects ${gateDrop} (details in mirror/_rejected.json).`);

    if (DRY) {
        const byReason = {};
        for (const r of rejects) byReason[r.reason.replace(/\(.*\)/, '').trim()] = (byReason[r.reason.replace(/\(.*\)/, '').trim()] ?? 0) + 1;
        console.log('\nRejection reasons:');
        for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${reason}`);
        await writeFile(REJECTED_PATH, JSON.stringify(rejects, null, 2));
        console.log('\nDry run only — nothing downloaded.');
        return;
    }

    const queue = admitted.filter((b) => !existsSync(path.join(OUT_DIR, `${b.id}.txt`))).slice(0, LIMIT);
    console.log(`${admitted.length - queue.length > 0 ? `${admitted.length - queue.length} already mirrored; ` : ''}downloading ${queue.length} from ${SOURCE} (concurrency ${CONCURRENCY}, ${DELAY_MS}ms delay)\n`);

    let saved = 0;
    let culled = 0;
    let failed = 0;
    const failures = [];
    const report = (note) =>
        process.stdout.write(`\r  saved ${saved}   culled ${culled}   failed ${failed}   ${note}`.padEnd(78));

    let cursor = 0;
    async function worker() {
        while (cursor < queue.length) {
            const b = queue[cursor++];
            try {
                const raw = await fetchBook(b);
                const clean = stripBoilerplate(raw);
                const why = contentReject(clean);
                if (why) {
                    rejects.push({ id: b.id, title: b.title, stage: 'content', reason: why });
                    culled++;
                    report(`#${b.id} culled`);
                } else {
                    await writeFile(path.join(OUT_DIR, `${b.id}.txt`), clean, 'utf8');
                    saved++;
                    report(`#${b.id}`);
                }
            } catch (err) {
                failed++;
                failures.push({ id: b.id, error: String(err?.message ?? err) });
                report(`#${b.id} failed`);
            }
            await new Promise((r) => setTimeout(r, DELAY_MS));
        }
    }

    // Checkpoint the reject log every couple of minutes so a killed run loses nothing.
    const checkpoint = setInterval(() => { void writeFile(REJECTED_PATH, JSON.stringify(rejects, null, 2)); }, 120_000);
    try {
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } finally {
        clearInterval(checkpoint);
    }

    await writeFile(REJECTED_PATH, JSON.stringify(rejects, null, 2));
    if (failures.length) await writeFile(FAILED_PATH, JSON.stringify(failures, null, 2));

    console.log(`\n\nDone. saved ${saved}, culled ${culled} by the content gate, failed ${failed}.`);
    console.log(`Collection: mirror/books/   Reject audit: mirror/_rejected.json${failures.length ? '   Failures (rerun to retry): mirror/_failed.json' : ''}`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
