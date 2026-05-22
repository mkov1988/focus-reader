/**
 * Web implementation of the native-ready LibraryService.
 *
 * Metadata comes from Gutendex (CORS-friendly). Book *content* is fetched from
 * Project Gutenberg, which is not CORS-friendly from a browser, so in dev we
 * route those requests through the Vite proxy (`/gutenberg` -> gutenberg.org).
 * A native app would fetch the same URLs directly — only `toProxyUrl` differs.
 */
import type { BookMetadata, LibraryService } from './types';
import { gutendex } from './gutendex';

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
    if (start && start.index !== undefined) {
        text = text.slice(start.index + start[0].length);
    }

    const end = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    if (end && end.index !== undefined) {
        text = text.slice(0, end.index);
    }

    // Drop a leading transcriber/credits line if one survived.
    text = text.replace(/^\s*Produced by[^\n]*\n/i, '');

    return text.trim();
}

export const webLibraryService: LibraryService = {
    search: (q) => gutendex.search(q),
    getCurated: () => gutendex.popular(),
    getByTopic: (t) => gutendex.topic(t),
    getById: (id) => gutendex.byId(id),

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
