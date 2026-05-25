// Fetches the top ~1000 most-downloaded English books from Gutendex and
// writes them to src/data/curated.json. Run manually every few months to
// refresh — the data is small (~100KB) and lives in git so users get an
// instant storefront without hitting the slow Gutendex API.
//
// Usage:  node scripts/fetch_curated_books.mjs

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PAGE_COUNT = 32;        // Gutendex returns 32 books per page → ~1024 books
const CONCURRENCY = 4;        // Be polite to the free public API
const OUT = resolve('src/data/curated.json');

function formatAuthor(name) {
    if (!name) return 'Unknown';
    const parts = name.split(',').map((s) => s.trim());
    if (parts.length === 2 && parts[1]) return `${parts[1]} ${parts[0]}`.trim();
    return name;
}

function pickTextUrl(formats) {
    const preferred = ['text/plain; charset=utf-8', 'text/plain; charset=us-ascii', 'text/plain'];
    for (const key of preferred) {
        const url = formats[key];
        if (url && !url.endsWith('.zip')) return url;
    }
    const fallback = Object.keys(formats).find(
        (k) => k.startsWith('text/plain') && !formats[k].endsWith('.zip'),
    );
    return fallback ? formats[fallback] : undefined;
}

function mapBook(b) {
    return {
        id: String(b.id),
        title: b.title,
        author: formatAuthor(b.authors[0]?.name),
        coverUrl: b.formats['image/jpeg'],
        textUrl: pickTextUrl(b.formats),
        downloadCount: b.download_count,
    };
}

async function fetchPage(page) {
    const url = `https://gutendex.com/books/?languages=en&sort=popular&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
    const data = await res.json();
    return data.results.map(mapBook);
}

async function main() {
    console.log(`Fetching ${PAGE_COUNT} pages (~${PAGE_COUNT * 32} books) from Gutendex…`);
    const results = new Array(PAGE_COUNT);
    let completed = 0;

    // Simple concurrency pool
    const pages = Array.from({ length: PAGE_COUNT }, (_, i) => i + 1);
    async function worker() {
        while (pages.length) {
            const page = pages.shift();
            try {
                results[page - 1] = await fetchPage(page);
                completed++;
                process.stdout.write(`\r  ${completed}/${PAGE_COUNT} pages done`);
            } catch (e) {
                console.error(`\n  page ${page} failed:`, e.message);
                results[page - 1] = [];
            }
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log('');

    const all = results.flat();
    // Keep only books we can actually open (must have a text URL)
    const usable = all.filter((b) => b.textUrl);
    // Strip downloadCount to save bytes — only used for ranking, already sorted
    const slim = usable.map(({ downloadCount: _ignored, ...rest }) => rest);

    await writeFile(OUT, JSON.stringify(slim));
    const kb = (JSON.stringify(slim).length / 1024).toFixed(1);
    console.log(`Wrote ${slim.length} books (${all.length - usable.length} skipped, no text URL) → ${OUT}`);
    console.log(`File size: ${kb} KB raw (gzip will shrink this 3-4x on the wire).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
