/**
 * Gutendex API client — clean JSON metadata over Project Gutenberg's 70k+
 * public-domain books. Gutendex sends `Access-Control-Allow-Origin: *`, so
 * metadata can be fetched directly from the browser (no proxy needed).
 *
 * Docs: https://gutendex.com  |  Endpoint: https://gutendex.com/books
 */
import type { BookMetadata } from './types';

const API = 'https://gutendex.com/books';

interface GutendexAuthor {
    name: string;
    birth_year: number | null;
    death_year: number | null;
}

interface GutendexBook {
    id: number;
    title: string;
    authors: GutendexAuthor[];
    formats: Record<string, string>;
    download_count: number;
}

interface GutendexResponse {
    count: number;
    results: GutendexBook[];
}

/** "Austen, Jane" -> "Jane Austen"; passes through other shapes unchanged. */
function formatAuthor(name?: string): string {
    if (!name) return 'Unknown';
    const parts = name.split(',').map((s) => s.trim());
    if (parts.length === 2 && parts[1]) return `${parts[1]} ${parts[0]}`.trim();
    return name;
}

/** Choose a usable plain-text format, preferring UTF-8 and skipping .zip. */
function pickTextUrl(formats: Record<string, string>): string | undefined {
    const preferred = [
        'text/plain; charset=utf-8',
        'text/plain; charset=us-ascii',
        'text/plain',
    ];
    for (const key of preferred) {
        const url = formats[key];
        if (url && !url.endsWith('.zip')) return url;
    }
    const fallback = Object.keys(formats).find(
        (k) => k.startsWith('text/plain') && !formats[k].endsWith('.zip'),
    );
    return fallback ? formats[fallback] : undefined;
}

function mapBook(b: GutendexBook): BookMetadata {
    return {
        id: String(b.id),
        title: b.title,
        author: formatAuthor(b.authors[0]?.name),
        coverUrl: b.formats['image/jpeg'],
        textUrl: pickTextUrl(b.formats),
        downloadCount: b.download_count,
    };
}

async function query(params: URLSearchParams): Promise<BookMetadata[]> {
    const res = await fetch(`${API}?${params.toString()}`);
    if (!res.ok) throw new Error(`Gutendex request failed (${res.status})`);
    const data: GutendexResponse = await res.json();
    return data.results.map(mapBook);
}

export const gutendex = {
    search(q: string): Promise<BookMetadata[]> {
        return query(new URLSearchParams({ search: q, languages: 'en' }));
    },
    popular(): Promise<BookMetadata[]> {
        return query(new URLSearchParams({ languages: 'en', sort: 'popular' }));
    },
    topic(t: string): Promise<BookMetadata[]> {
        return query(new URLSearchParams({ topic: t, languages: 'en', sort: 'popular' }));
    },
    async byId(id: string): Promise<BookMetadata | null> {
        const results = await query(new URLSearchParams({ ids: id }));
        return results[0] ?? null;
    },
};
