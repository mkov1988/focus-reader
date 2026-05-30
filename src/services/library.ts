/**
 * Web implementation of the native-ready LibraryService.
 *
 * Storefront metadata for the top ~1000 most-downloaded English books is
 * bundled in `src/data/curated.json` so the home shelf paints instantly and
 * works offline. Search filters that local list first and only falls back to
 * the live Gutendex API for misses. Book *content* is still streamed from
 * Project Gutenberg at read-time, via the Vite dev proxy (CORS workaround).
 */
import type { BookMetadata, LibraryService } from './types';
import { gutendex } from './gutendex';
import curatedJson from '../data/curated.json';

const CURATED: BookMetadata[] = curatedJson as BookMetadata[];

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
