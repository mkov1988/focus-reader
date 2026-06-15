/**
 * Native-ready library abstraction.
 *
 * The web prototype talks to Gutendex + Project Gutenberg over HTTP, but the
 * `LibraryService` interface is intentionally transport-agnostic so a future
 * Swift/Kotlin implementation can be swapped in without touching the UI.
 * See docs/planning/book_access_strategy.md.
 */

export interface BookMetadata {
    /** Project Gutenberg id, as a string (stable across platforms). */
    id: string;
    title: string;
    /** Primary author, normalized to "First Last". */
    author: string;
    /** Cover thumbnail URL (loads cross-origin in an <img> without CORS). */
    coverUrl?: string;
    /** Plain-text source URL (raw Gutenberg origin; proxied at fetch time). */
    textUrl?: string;
    downloadCount?: number;
}

/** One nuanced subcategory row within a vibe (e.g. "Gothic dread"). */
export interface VibeShelf {
    title: string;
    books: BookMetadata[];
}

/**
 * A full "Vibe out" page: a "deeper cuts" hero (the vibe's standout books that
 * are NOT on the front page, so it reads as discovery) plus a list of nuanced
 * subcategory shelves. Built offline into src/data/vibes.json.
 */
export interface VibePage {
    key: string;
    title: string;
    hero: BookMetadata[];
    shelves: VibeShelf[];
}

export interface LibraryService {
    /** Full-text metadata search (title / author). */
    search(query: string): Promise<BookMetadata[]>;
    /** A curated, popularity-ranked shelf for the storefront. */
    getCurated(): Promise<BookMetadata[]>;
    /** Books matching a subject/bookshelf topic (live catalog). */
    getByTopic(topic: string): Promise<BookMetadata[]>;
    /** The full vibe page (hero + subcategory shelves) from the bundled catalog. */
    getVibePage(key: string): Promise<VibePage | null>;
    /** Fetch + sanitize the readable plain text for a book. */
    fetchContent(book: BookMetadata): Promise<string>;
}
