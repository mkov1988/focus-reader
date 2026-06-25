/**
 * Backfill `downloadCount` onto every book in src/data/curated.json from
 * Gutendex, so the front-page "Popular" shelf can sort by real popularity
 * instead of file order (which had obscure titles like The City of God up top).
 *
 * Gutendex returns download_count and accepts batched ids (?ids=1,2,3), so this
 * is ~31 requests for ~990 books. Safe to re-run; it just refreshes the counts.
 *
 *   node scripts/add-curated-downloads.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURATED_PATH = path.join(ROOT, 'src', 'data', 'curated.json');
const API = 'https://gutendex.com/books';
const BATCH = 32;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
    let err;
    for (let i = 0; i < tries; i++) {
        try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
        catch (e) { err = e; await sleep(700 * (i + 1)); }
    }
    throw err;
}

async function main() {
    const curated = JSON.parse(await readFile(CURATED_PATH, 'utf8'));
    const ids = curated.map((b) => String(b.id)).filter(Boolean);
    const counts = new Map();

    for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const data = await getJson(`${API}?ids=${chunk.join(',')}`);
        for (const b of data.results ?? []) counts.set(String(b.id), b.download_count ?? 0);
        process.stdout.write(`\r  fetched ${Math.min(i + BATCH, ids.length)}/${ids.length}`.padEnd(40));
        await sleep(150);
    }

    let filled = 0;
    let missing = 0;
    for (const b of curated) {
        if (counts.has(String(b.id))) { b.downloadCount = counts.get(String(b.id)); filled++; }
        else { b.downloadCount = b.downloadCount ?? 0; missing++; }
    }

    await writeFile(CURATED_PATH, JSON.stringify(curated));
    console.log(`\n\nWrote ${CURATED_PATH}. Filled ${filled}, missing ${missing}.`);
    console.log('Top 8 by downloads now:');
    [...curated].sort((a, b) => (b.downloadCount ?? 0) - (a.downloadCount ?? 0)).slice(0, 8)
        .forEach((b) => console.log('  ', String(b.downloadCount).padStart(7), b.title.slice(0, 42)));
}

main().catch((e) => { console.error(e); process.exit(1); });
