/**
 * On-device cache for book text, keyed by Gutenberg id.
 *
 * Book content is immutable (a public-domain text by id never changes), so once
 * we have downloaded and cleaned a book we never need to fetch it again. We keep
 * it in IndexedDB rather than localStorage because a single book can be hundreds
 * of KB and localStorage caps out around 5MB total. This is the last and fastest
 * tier of the fetch ladder in library.ts: a cache hit opens a book in a few
 * milliseconds and works with no connection.
 *
 * Native mapping: this is the same "store on device" model the cover cache and
 * book_access_strategy.md describe. In the Android WebView build IndexedDB is the
 * device store; later it can be swapped for the native file system behind the
 * same get/set interface.
 */

const DB_NAME = 'focus-reader';
const STORE = 'books';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Open (once) the IndexedDB database, or resolve null where it isn't available
 *  (private-mode quirks, SSR, very old WebViews) so callers degrade to fetching. */
function openDb(): Promise<IDBDatabase | null> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }
        try {
            const req = indexedDB.open(DB_NAME, VERSION);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE)) {
                    req.result.createObjectStore(STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return dbPromise;
}

/** Return the cached cleaned text for a book id, or undefined on a miss. */
export async function getCachedBook(id: string): Promise<string | undefined> {
    const db = await openDb();
    if (!db) return undefined;
    return new Promise((resolve) => {
        try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
            req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : undefined);
            req.onerror = () => resolve(undefined);
        } catch {
            resolve(undefined);
        }
    });
}

/** Store cleaned text for a book id. Failures are swallowed (a cache write is
 *  best-effort; the reader already has the text in hand when we call this). */
export async function putCachedBook(id: string, text: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(text, id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}
