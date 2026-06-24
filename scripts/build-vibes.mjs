/**
 * Build the bundled Vibe-out dataset (src/data/vibes.json).
 *
 * For each vibe it crawls Gutendex by topic to fill a set of nuanced shelves,
 * then derives a "deeper cuts" hero: the vibe's most-downloaded books that are
 * NOT already in the curated front-page catalog, so the hero is discovery, not a
 * repeat. Every kept book is verified to have readable plain text via a HEAD
 * request to its canonical text URL (dead/textless editions are dropped — they
 * are unreadable in the app), and gets a `words` count estimated from the file
 * size for the read-time chips. Hero books keep their cover URL (mirrored later
 * by mirror-covers.mjs); shelf books drop the cover so the app draws its
 * generated cover instead.
 *
 * Offline + instant at runtime, same pattern as curated.json. Re-run to refresh.
 *
 *   node scripts/build-vibes.mjs
 *   node scripts/build-vibes.mjs --per=20   books kept per shelf (default 20)
 *   node scripts/build-vibes.mjs --hero=14  hero size per vibe (default 14)
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURATED_PATH = path.join(ROOT, 'src', 'data', 'curated.json');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'vibes.json');
const API = 'https://gutendex.com/books';

const arg = (name, def) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`));
    return a ? Number(a.split('=')[1]) : def;
};
const PER_SHELF = arg('per', 20);
const HERO_SIZE = arg('hero', 14);
const MIN_PER_VIBE = 100;
// `--only=<key>` rebuilds a single vibe and merges it into the existing
// vibes.json, leaving the other vibes untouched (no full re-crawl).
const ONLY = (process.argv.find((x) => x.startsWith('--only=')) || '').split('=')[1] || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Taxonomy: each shelf maps to one Gutendex topic (matches subjects +
//    bookshelves). Topics were validated by scripts/crawl-vibes.mjs. ──────────
const VIBES = [
    { key: 'cozy', title: 'Cozy Corners', shelves: [
        { title: 'Hearth and home', topic: 'domestic fiction' },
        { title: 'Quiet country days', topic: 'country life' },
        { title: 'Tea and laughter', topic: 'humorous' },
        { title: 'Once upon a time', topic: 'fairy tales' },
        { title: 'Christmas firesides', topic: 'Christmas' },
        { title: "Children's classics", topic: "children's literature" },
    ] },
    { key: 'tangled', title: 'Tangled Sheets', shelves: [
        { title: 'Slow burn courtship', topic: 'courtship' },
        { title: 'Marriage plots', topic: 'marriage' },
        { title: 'Love triangles', topic: 'triangles' },
        { title: 'Sweeping love stories', topic: 'love stories' },
        { title: 'Passionate classics', topic: 'romance' },
    ] },
    { key: 'bigfirsts', title: 'Big Firsts', shelves: [
        { title: 'Boyhood adventures', topic: 'boys' },
        { title: 'Becoming a woman', topic: 'young women' },
        { title: 'Orphans making their way', topic: 'orphans' },
        { title: 'Growing up stories', topic: 'bildungsromans' },
        { title: 'School days', topic: 'school stories' },
    ] },
    { key: 'uglycries', title: 'Ugly Cries', shelves: [
        { title: "War's heartbreak", topic: 'war stories' },
        { title: 'Loss and mourning', topic: 'death' },
        { title: 'Doomed love', topic: 'unrequited love' },
        { title: 'Hard lives', topic: 'poverty' },
        { title: 'Orphans and hardship', topic: 'orphans' },
    ] },
    { key: 'newrealms', title: 'New Realms', shelves: [
        { title: 'Far futures and space', topic: 'science fiction' },
        { title: 'Magic and fantasy', topic: 'fantasy' },
        { title: 'Epic voyages', topic: 'adventure stories' },
        { title: 'Myths and legends', topic: 'mythology' },
        { title: 'Lost worlds and utopias', topic: 'utopias' },
        { title: 'Precursors of sci fi', topic: 'precursors of science fiction' },
    ] },
    { key: 'upallnight', title: 'Up All Night', shelves: [
        { title: 'Detectives on the case', topic: 'detective' },
        { title: 'Sherlock and friends', topic: 'holmes, sherlock' },
        { title: 'Crime and the underworld', topic: 'crime' },
        { title: 'Mysteries to solve', topic: 'mystery fiction' },
        { title: 'High seas and danger', topic: 'sea stories' },
    ] },
    { key: 'mindbreakers', title: 'Mind Breakers', shelves: [
        { title: 'Gothic dread', topic: 'gothic fiction' },
        { title: 'Ghost stories', topic: 'ghost stories' },
        { title: 'Horror tales', topic: 'horror' },
        { title: 'Psychological unease', topic: 'psychological fiction' },
        { title: 'Weird and supernatural', topic: 'supernatural' },
        { title: 'Mind and meaning', topic: 'philosophy' },
    ] },
    // Stoicism is a small, well-defined public-domain canon, so this vibe is
    // hand-curated by Gutenberg id. A broad `search` is far too noisy here:
    // `search=seneca` drags in the Seneca *tribe* (myths, "The Trail of the
    // Seneca", a camp cookbook by an author nicknamed Seneca), `search=stoicism`
    // pulled in railway stories, and every query surfaced Gutenberg "Index of the
    // Works of…" pages, which are catalog listings, not readable books.
    { key: 'levelheads', title: 'Level Heads',
        heroIds: [2680, 871, 56075, 64488],
        shelves: [
            { title: 'The Mind of Marcus Aurelius', ids: [55317, 6920, 15877] },
            { title: 'The Words of Epictetus', ids: [45109, 10661, 39855] },
            { title: 'The Writings of Seneca', ids: [64576, 3794, 76392] },
            { title: 'History, Analysis & Context', ids: [7514, 34122, 78320] },
        ] },
];

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
    const fb = Object.keys(formats).find((k) => k.startsWith('text/plain') && !formats[k].endsWith('.zip'));
    return fb ? formats[fb] : undefined;
}

function mapRaw(b) {
    return {
        id: String(b.id),
        title: b.title,
        author: formatAuthor(b.authors?.[0]?.name),
        coverUrl: b.formats?.['image/jpeg'],
        textUrl: pickTextUrl(b.formats ?? {}),
        downloadCount: b.download_count ?? 0,
    };
}

async function getJson(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            lastErr = e;
            await sleep(800 * (i + 1));
        }
    }
    throw lastErr;
}

const BYTES_PER_WORD = 6.1;
const MIN_BYTES = 8000; // smaller than this at the canonical URL ⇒ no real text

/**
 * Verify a book actually has readable plain text and estimate its word count from
 * the file size (Content-Length / 6.1, accurate to ~1-2%). HEADs the CANONICAL
 * cache/epub URL directly — the Gutendex `.txt.utf-8` alias is flaky (it
 * intermittently 404s or returns a stub). Returns { words, url } (a stable text
 * URL) or null if the edition is dead/textless (so it gets dropped, since those
 * are unreadable in the app too).
 */
async function verifyText(book) {
    const urls = [
        `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`,
        `https://www.gutenberg.org/files/${book.id}/${book.id}-0.txt`,
    ];
    for (const url of urls) {
        try {
            const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
            if (r.ok) {
                const cl = Number(r.headers.get('content-length'));
                if (cl > MIN_BYTES) return { words: Math.round(cl / BYTES_PER_WORD), url };
            }
        } catch { /* try next */ }
    }
    return null;
}

/** Fetch readable books for a shelf, most-downloaded first, across `pages`.
 *  A shelf may be defined by `topic`, `search`, or an explicit `ids` list (for
 *  curated sections like Stoicism); ids preserve their hand-picked order. */
async function fetchShelf(shelf, pages = 2) {
    const out = [];
    if (shelf.ids) {
        const data = await getJson(`${API}?ids=${shelf.ids.join(',')}`);
        const byId = new Map(data.results.map((b) => [String(b.id), mapRaw(b)]));
        for (const id of shelf.ids.map(String)) {
            const m = byId.get(id);
            if (m && m.textUrl) out.push(m);
        }
        return out;
    }
    const query = shelf.topic ? `topic=${encodeURIComponent(shelf.topic)}` : `search=${encodeURIComponent(shelf.search)}`;
    let url = `${API}?${query}&languages=en&sort=popular&mime_type=text%2Fplain`;
    for (let p = 0; p < pages && url; p++) {
        const data = await getJson(url);
        for (const b of data.results) {
            const m = mapRaw(b);
            if (m.textUrl) out.push(m);
        }
        url = data.next;
        await sleep(250);
    }
    return out;
}

async function main() {
    const curated = JSON.parse(await readFile(CURATED_PATH, 'utf8'));
    const curatedIds = new Set(curated.map((b) => b.id));

    const result = [];
    for (const vibe of VIBES.filter((v) => !ONLY || v.key === ONLY)) {
        process.stdout.write(`\n${vibe.title}\n`);
        const shelfBooks = [];
        const allForVibe = new Map();
        for (const shelf of vibe.shelves) {
            const books = await fetchShelf(shelf, 2);
            for (const b of books) if (!allForVibe.has(b.id)) allForVibe.set(b.id, b);
            shelfBooks.push({ title: shelf.title, books });
            const src = shelf.ids ? `ids: ${shelf.ids.length}` : shelf.topic ? `topic: ${shelf.topic}` : `search: ${shelf.search}`;
            process.stdout.write(`  ${String(books.length).padStart(3)}  ${shelf.title} (${src})\n`);
        }

        // Hero = "our pick" (hero[0]) + a "deeper cuts" lane. Curated vibes pin the
        // hero with hand-picked `heroIds` (in order); the rest derive it as the
        // vibe's most-downloaded books NOT on the front page (curated), with a
        // cover. Either way every kept book is verified to have readable text.
        const hero = [];
        if (vibe.heroIds) {
            const pool = await fetchShelf({ ids: vibe.heroIds });
            const byId = new Map(pool.map((b) => [b.id, b]));
            for (const id of vibe.heroIds.map(String)) {
                if (hero.length >= HERO_SIZE) break;
                const b = byId.get(id);
                if (!b) continue;
                const v = await verifyText(b);
                if (!v) continue; // dead/unreadable edition — skip
                hero.push({ ...b, textUrl: v.url, words: v.words });
            }
        } else {
            const heroCandidates = [...allForVibe.values()]
                .filter((b) => !curatedIds.has(b.id) && b.coverUrl)
                .sort((a, b) => b.downloadCount - a.downloadCount);
            for (const b of heroCandidates) {
                if (hero.length >= HERO_SIZE) break;
                const v = await verifyText(b);
                if (!v) continue; // dead/unreadable edition — skip
                hero.push({ ...b, textUrl: v.url, words: v.words });
            }
        }
        const heroIds = new Set(hero.map((b) => b.id));

        // Shelves: dedupe across shelves and against the hero, verify readability +
        // word count, drop covers (the app draws generated covers), cap each shelf.
        const usedInShelf = new Set(heroIds);
        const shelves = [];
        for (const { title, books } of shelfBooks) {
            const picked = [];
            for (const b of books) {
                if (picked.length >= PER_SHELF) break;
                if (usedInShelf.has(b.id)) continue;
                const v = await verifyText(b);
                if (!v) continue; // dead/unreadable edition — skip
                usedInShelf.add(b.id);
                picked.push({ id: b.id, title: b.title, author: b.author, textUrl: v.url, downloadCount: b.downloadCount, words: v.words });
            }
            if (picked.length > 0) shelves.push({ title, books: picked });
        }

        const total = hero.length + shelves.reduce((n, s) => n + s.books.length, 0);
        process.stdout.write(`  => hero ${hero.length}, ${shelves.length} shelves, ${total} books total${total < MIN_PER_VIBE ? '  ⚠ under 100' : ''}\n`);

        result.push({ key: vibe.key, title: vibe.title, hero, shelves });
    }

    let out = result;
    if (ONLY) {
        // Merge the rebuilt vibe(s) into the existing file, preserving the others.
        const existing = JSON.parse(await readFile(OUT_PATH, 'utf8'));
        out = existing.map((v) => result.find((r) => r.key === v.key) ?? v);
        for (const r of result) if (!out.some((v) => v.key === r.key)) out.push(r);
    }
    await writeFile(OUT_PATH, JSON.stringify(out));
    const grand = out.reduce((n, v) => n + v.hero.length + v.shelves.reduce((m, s) => m + s.books.length, 0), 0);
    console.log(`\nWrote ${OUT_PATH}  (${out.length} vibes, ${grand} books${ONLY ? `; rebuilt only "${ONLY}"` : ''})`);
    console.log('Next: run mirror-covers.mjs to mirror the covers, then set VITE_COVER_BASE.');
}

main().catch((e) => { console.error(e); process.exit(1); });
