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
import { gutendex } from './gutendex';
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
function hostedCoverUrl(book: BookMetadata): string | undefined {
    return book.coverUrl ? `${COVER_BASE}/${book.id}.webp` : undefined;
}

const CURATED: BookMetadata[] = (curatedJson as BookMetadata[]).map((b) => ({
    ...b,
    coverUrl: hostedCoverUrl(b),
}));

/**
 * Vibe-out pages, built offline into vibes.json (see scripts/build-vibes.mjs).
 * Hero books ("deeper cuts") carry a cover URL we resolve to our mirror; shelf
 * books carry none, so the app draws its generated cover for them.
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
    dedupeVibe({ ...v, hero: v.hero.map((b) => ({ ...b, coverUrl: hostedCoverUrl(b) })) }),
);
const VIBE_BY_KEY = new Map(VIBES.map((v) => [v.key, v]));

/** Rewrite a Gutenberg origin to the dev proxy path to dodge browser CORS. */
function toProxyUrl(url: string): string {
    if (import.meta.env.DEV) {
        return url.replace(/^https?:\/\/(www\.)?gutenberg\.org/i, '/gutenberg');
    }
    return url;
}

/** Strip Project Gutenberg legal headers/footers to jump to the actual text. */
export function stripGutenbergBoilerplate(raw: string): string {
    let text = raw.replace(/\r\n/g, '\n');

    const start = text.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    const startFound = start !== null && start.index !== undefined;
    if (startFound && start) {
        text = text.slice(start.index! + start[0].length);
    }

    const end = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    const endFound = end !== null && end.index !== undefined;
    if (endFound && end) {
        text = text.slice(0, end.index!);
    }

    // Drop a leading transcriber/credits line if one survived.
    text = text.replace(/^\s*Produced by[^\n]*\n/i, '');

    // Defensive: if neither marker matched, Gutenberg may have changed their
    // wrapper format — surface a warning so we notice instead of silently
    // serving legal boilerplate to the reader.
    if (!startFound && !endFound && /project gutenberg/i.test(text.slice(0, 1500))) {
        console.warn('[library] Gutenberg boilerplate markers not found; reader may show legal header.');
    }

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
        if (!book.textUrl) {
            throw new Error('No readable plain-text edition is available for this title.');
        }
        const res = await fetch(toProxyUrl(book.textUrl));
        if (!res.ok) throw new Error(`Could not download the book (${res.status}).`);
        const raw = await res.text();
        const clean = stripGutenbergBoilerplate(raw);
        if (!clean) throw new Error('The downloaded file appears to be empty.');
        return clean;
    },
};
