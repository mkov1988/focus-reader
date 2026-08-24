/**
 * Phase 1 of the covers plan: overlay Standard Ebooks cover art.
 *
 * Standard Ebooks (standardebooks.org) makes beautiful classic-style covers
 * (public-domain painting + clean typography) and dedicates everything,
 * cover art included, to the public domain (CC0) — no trademark license, no
 * strings. Their catalog skews to exactly our curated canon, so it is the
 * best replacement source for the 728 hot-set books whose current cover is
 * Project Gutenberg's branded card (scripts/covers-audit/branded.json).
 *
 * Each SE book page links its Gutenberg source (gutenberg.org/ebooks/<id>),
 * which is our book id — the join is mechanical.
 *
 * Two steps, both resumable:
 *   node scripts/se-covers.mjs --map [--pages=N]
 *     Walks their catalog politely (1 request/second) and builds
 *     scripts/covers-audit/se-map.json: { gutenbergId: coverUrl }.
 *     Full walk is ~1,500 requests ≈ 30 min — Michael's terminal.
 *   node scripts/se-covers.mjs --fetch [--only-branded]
 *     Downloads covers for hot-set books found in the map and writes
 *     public/covers/<id>.webp (484px wide — their public size — q80).
 *
 * Goodwill note: consider their Patrons Circle; they are the one source
 * giving this away with zero conditions.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MAP = path.join(ROOT, 'scripts', 'covers-audit', 'se-map.json');
const OUT = path.join(ROOT, 'public', 'covers');
const SITE = 'https://standardebooks.org';
const UA = 'FocusReader cover tool';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
}

function loadMap() { return fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP, 'utf8')) : { pagesDone: 0, books: {} }; }

async function buildMap(maxPages) {
    const map = loadMap();
    for (let page = map.pagesDone + 1; ; page++) {
        if (maxPages && page > maxPages) break;
        const html = await (await get(`${SITE}/ebooks?page=${page}`)).text();
        const slugs = [...new Set([...html.matchAll(/href="(\/ebooks\/[a-z0-9-]+\/[a-z0-9-]+)"/g)].map(m => m[1]))];
        if (slugs.length === 0) { console.log('catalog end at page', page); break; }
        for (const slug of slugs) {
            await sleep(1000);
            try {
                const book = await (await get(SITE + slug)).text();
                const pg = book.match(/gutenberg\.org\/ebooks\/(\d+)/);
                const cover = book.match(/(\/images\/covers\/[^"\s]+\/cover@2x\.jpg)/);
                if (pg && cover) map.books[pg[1]] = SITE + cover[1];
            } catch (e) { console.log('skip', slug, e.message); }
        }
        map.pagesDone = page;
        fs.writeFileSync(MAP, JSON.stringify(map, null, 1));
        console.log(`page ${page}: mapped total ${Object.keys(map.books).length}`);
        await sleep(1000);
    }
}

async function fetchCovers(onlyBranded) {
    const map = loadMap();
    const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/curated.json'), 'utf8'));
    const vibes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/vibes.json'), 'utf8'));
    const hot = new Set(curated.map(b => String(b.id)));
    for (const v of vibes) {
        for (const b of (v.hero || [])) hot.add(String(b.id));
        for (const s of (v.shelves || [])) for (const b of (s.books || [])) hot.add(String(b.id));
    }
    const branded = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/covers-audit/branded.json'), 'utf8')).map(String));
    let ids = Object.keys(map.books).filter(id => hot.has(id));
    if (onlyBranded) ids = ids.filter(id => branded.has(id));
    console.log(`SE covers available for ${ids.length} ${onlyBranded ? 'branded ' : ''}hot-set books`);
    fs.mkdirSync(OUT, { recursive: true });
    let done = 0;
    for (const id of ids) {
        await sleep(700);
        try {
            const buf = Buffer.from(await (await get(map.books[id])).arrayBuffer());
            await sharp(buf).webp({ quality: 80 }).toFile(path.join(OUT, `${id}.webp`));
            done++;
        } catch (e) { console.log('failed', id, e.message); }
    }
    console.log('wrote', done, 'covers to public/covers/');
}

const pagesArg = process.argv.find(a => a.startsWith('--pages='));
if (process.argv.includes('--map')) await buildMap(pagesArg ? Number(pagesArg.slice(8)) : 0);
else if (process.argv.includes('--fetch')) await fetchCovers(process.argv.includes('--only-branded'));
else console.log('usage: se-covers.mjs --map [--pages=N] | --fetch [--only-branded]');
