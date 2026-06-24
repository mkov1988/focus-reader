/**
 * Web implementation of the native-ready LibraryService.
 *
 * Storefront metadata for the top ~1000 most-downloaded English books is
 * bundled in `src/data/curated.json` so the home shelf paints instantly and
 * works offline. Search filters that local list first and only falls back to
 * the live Gutendex API for misses. Book *content* is still streamed from
 * Project Gutenberg at read-time, via the Vite dev proxy (CORS workaround).
 */
import type { BookMetadata, LibraryService, VibePage } from './types';
import { gutendex, cleanTitle } from './gutendex';
import { getCachedBook, putCachedBook } from './bookCache';
import curatedJson from '../data/curated.json';
import vibesJson from '../data/vibes.json';

/**
 * Resolve a curated book's cover to our own static host when one is configured.
 *
 * Covers were originally hotlinked straight from gutenberg.org, which throttles
 * and drops hotlink connections, so shelves intermittently painted blank. The
 * durable fix is to mirror covers once (`npm run mirror:covers`) into
 * `public/covers/<id>.webp`, served same-origin at `/covers` (the default base
 * here). To host on a CDN instead, set `VITE_COVER_BASE` to the URL of the
 * folder that directly holds the `<id>.webp` files (e.g. a jsDelivr or R2 URL).
 *
 * Resolution only applies to books that have a publisher cover (`coverUrl`);
 * vibe shelf books carry none and keep using the app's generated cover. A mapped
 * cover that 404s (not mirrored, e.g. a live Gutendex search hit) degrades to a
 * generated cover in BookCover, never a blank.
 */
const COVER_BASE = (import.meta.env.VITE_COVER_BASE?.replace(/\/+$/, '')) || '/covers';
// Book text is mirrored the same way covers are: served same-origin from /books
// by default (public/books/<id>.txt, a gitignored build artifact), or from a CDN
// when VITE_BOOK_BASE is set. Pre-stripped and immutable, so a mirrored book
// opens without ever touching gutenberg at read time. See book_access_strategy.md.
const BOOK_BASE = (import.meta.env.VITE_BOOK_BASE?.replace(/\/+$/, '')) || '/books';
// Covers are keyed by book id, so we resolve every book to `${base}/<id>.webp`
// regardless of whether the bundled data carried a cover URL (vibe shelf books
// don't). If a given cover wasn't mirrored, the <img> 404s and BookCover falls
// back to its generated cover — never a blank.
function hostedCoverUrl(book: BookMetadata): string | undefined {
    return book.id ? `${COVER_BASE}/${book.id}.webp` : undefined;
}

const CURATED: BookMetadata[] = (curatedJson as BookMetadata[]).map((b) => ({
    ...b,
    title: cleanTitle(b.title),
    coverUrl: hostedCoverUrl(b),
}));

/**
 * Vibe-out pages, built offline into vibes.json (see scripts/build-vibes.mjs).
 * Both hero and shelf books resolve their cover by id to our mirror; any cover
 * that wasn't mirrored degrades to a generated cover.
 */
/** Drop duplicate editions (same title) within a vibe — Gutenberg often carries
 *  several editions of a popular book, and showing "Pride and Prejudice" twice in
 *  one shelf reads as broken. Hero entries win over shelf entries. */
function dedupeVibe(v: VibePage): VibePage {
    const seen = new Set<string>();
    const fresh = (b: BookMetadata) => {
        const key = b.title.trim().toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    };
    const hero = v.hero.filter(fresh);
    const shelves = v.shelves
        .map((s) => ({ ...s, books: s.books.filter(fresh) }))
        .filter((s) => s.books.length > 0);
    return { ...v, hero, shelves };
}

const VIBES: VibePage[] = (vibesJson as VibePage[]).map((v) =>
    dedupeVibe({
        ...v,
        hero: v.hero.map((b) => ({ ...b, title: cleanTitle(b.title), coverUrl: hostedCoverUrl(b) })),
        shelves: v.shelves.map((s) => ({ ...s, books: s.books.map((b) => ({ ...b, title: cleanTitle(b.title), coverUrl: hostedCoverUrl(b) })) })),
    }),
);
const VIBE_BY_KEY = new Map(VIBES.map((v) => [v.key, v]));

/** Rewrite a Gutenberg origin to the dev proxy path to dodge browser CORS. */
function toProxyUrl(url: string): string {
    if (import.meta.env.DEV) {
        return url.replace(/^https?:\/\/(www\.)?gutenberg\.org/i, '/gutenberg');
    }
    return url;
}

/**
 * Strip Project Gutenberg legal headers, footers, and transcriber credits to
 * leave just the book. Handles both the modern `*** START/END OF ... ***` markers
 * and the older "small print" header plus "End of Project Gutenberg's <title>"
 * footer, drops the credit block that opens most files, and as a final safeguard
 * removes any line carrying the "Project Gutenberg" trademark (these public-domain
 * texts never use the phrase themselves). Keeping the trademark out is what frees
 * the text from the Project Gutenberg license, so this is legally load bearing,
 * not just cosmetic. See docs/planning/book_access_strategy.md §6.
 *
 * NOTE: scripts/mirror-books.mjs carries an identical copy — keep the two in sync.
 */
export function stripGutenbergBoilerplate(raw: string): string {
    let text = raw.replace(/\r\n/g, '\n');

    // Header: jump past the modern START marker, or the old "small print" block.
    const start = text.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    if (start?.index !== undefined) {
        text = text.slice(start.index + start[0].length);
    } else {
        const smallPrint = text.match(/\*\s*END[^\n]*SMALL PRINT[^\n]*/i);
        if (smallPrint?.index !== undefined) text = text.slice(smallPrint.index + smallPrint[0].length);
    }

    // Footer: stop at the modern END marker, or the old "End of ... Gutenberg" line.
    const end = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    if (end?.index !== undefined) {
        text = text.slice(0, end.index);
    } else {
        const oldEnd = text.match(/\n\s*End of (?:the |this )?Project Gutenberg[^\n]*/i);
        if (oldEnd?.index !== undefined) text = text.slice(0, oldEnd.index);
    }

    // Drop the leading transcriber/credit/admin block (very common right after the
    // header) so the reader opens on the actual book, not "E-text prepared by…".
    // Also consume the bare URL and "or" lines those notes wrap across.
    const creditRe = /(produced by|prepared by|transcrib|proofread|distributed proofreading|pgdp\.net|gutenberg\.org|project gutenberg|updated editions|this e-?(?:text|book) was|html version|original illustrations|see \S+-h\.(?:htm|zip))/i;
    const skip = (l: string) => l.trim() === '' || creditRe.test(l) || /^\s*\(?https?:\/\//i.test(l) || /^\s*(?:or|and)\s*$/i.test(l);
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && skip(lines[i])) i++;
    text = lines.slice(i).join('\n');

    // Final safeguard: never keep a line carrying the Project Gutenberg trademark.
    text = text.split('\n').filter((l) => !/project gutenberg/i.test(l)).join('\n');

    return text.trim();
}

function localSearch(q: string): BookMetadata[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return CURATED.filter(
        (b) => b.title.toLowerCase().includes(needle) || b.author.toLowerCase().includes(needle),
    );
}

export const webLibraryService: LibraryService = {
    async search(q) {
        const local = localSearch(q);
        if (local.length > 0) return local;
        // Nothing in our bundled shelf — try the live catalog as a fallback.
        try {
            return await gutendex.search(q);
        } catch {
            return [];
        }
    },

    async getCurated() {
        return CURATED;
    },

    getByTopic: (t) => gutendex.topic(t),

    async getVibePage(key) {
        return VIBE_BY_KEY.get(key) ?? null;
    },

    async fetchContent(book: BookMetadata): Promise<string> {
        // Tier 1 — the device. A previously read book is already on hand, so it
        // opens in a few milliseconds and works with no connection.
        if (book.id) {
            const cached = await getCachedBook(book.id);
            if (cached) return cached;
        }

        // Tier 2 — our own mirror (same-origin /books, or a CDN via
        // VITE_BOOK_BASE). Pre-stripped and immutable, so this is fast and never
        // touches gutenberg. Save it on the device for next time.
        if (book.id) {
            const hosted = await fetchHostedBook(book.id);
            if (hosted) {
                const clean = stripGutenbergBoilerplate(hosted);
                if (clean) {
                    void putCachedBook(book.id, clean);
                    return clean;
                }
            }
        }

        // Tier 3 — last resort: stream from Project Gutenberg (dev proxy). Slow
        // and flaky, so we strip it once and persist it on the device so the next
        // open is instant and offline.
        if (!book.textUrl) {
            throw new Error('No readable plain-text edition is available for this title.');
        }
        const res = await fetch(toProxyUrl(book.textUrl));
        if (!res.ok) throw new Error(`Could not download the book (${res.status}).`);
        const raw = await res.text();
        const clean = stripGutenbergBoilerplate(raw);
        if (!clean) throw new Error('The downloaded file appears to be empty.');
        if (book.id) void putCachedBook(book.id, clean);
        return clean;
    },
};

/** Fetch a mirrored book from our static host, or undefined if it isn't mirrored.
 *  A static host with SPA fallback may answer a missing file with index.html, so
 *  we reject anything that looks like an HTML document rather than a book. */
async function fetchHostedBook(id: string): Promise<string | undefined> {
    try {
        const res = await fetch(`${BOOK_BASE}/${id}.txt`);
        if (!res.ok) return undefined;
        const text = await res.text();
        if (!text || /^\s*<(?:!doctype|html)/i.test(text)) return undefined;
        return text;
    } catch {
        return undefined;
    }
}
