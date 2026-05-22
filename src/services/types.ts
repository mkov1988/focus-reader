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

export interface LibraryService {
    /** Full-text metadata search (title / author). */
    search(query: string): Promise<BookMetadata[]>;
    /** A curated, popularity-ranked shelf for the storefront. */
    getCurated(): Promise<BookMetadata[]>;
    /** Books matching a subject/bookshelf topic. */
    getByTopic(topic: string): Promise<BookMetadata[]>;
    /** Single book by id (used for the featured hero). */
    getById(id: string): Promise<BookMetadata | null>;
    /** Fetch + sanitize the readable plain text for a book. */
    fetchContent(book: BookMetadata): Promise<string>;
}
