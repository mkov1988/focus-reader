/**
 * The books the app lists (the home screen and the vibe shelves: the ids of
 * src/data/story-starts.json), most downloaded first, then the vibe shelf
 * books the curated list does not carry, with title and author. Shared by
 * the queue builders for the listed-book passes (lean-queue.mjs,
 * deep-queue.mjs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

export function listedBooks() {
    const ids = new Set(Object.keys(read('src/data/story-starts.json')));
    const books = new Map();
    for (const b of read('src/data/curated.json')) {
        const id = String(b.id);
        if (ids.has(id)) books.set(id, { id, title: b.title, author: b.author ?? '', downloads: b.downloadCount ?? 0, shelf: false });
    }
    const walk = (o) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') {
            if (o.id && o.title && ids.has(String(o.id)) && !books.has(String(o.id))) {
                books.set(String(o.id), { id: String(o.id), title: o.title, author: o.author ?? '', downloads: o.downloadCount ?? 0, shelf: true });
            }
            Object.values(o).forEach(walk);
        }
    };
    walk(read('src/data/vibes.json'));
    for (const id of ids) if (!books.has(id)) books.set(id, { id, title: '', author: '', downloads: 0, shelf: true });
    // Most downloaded first, then the vibe shelf books.
    return [...books.values()].sort((a, b) => Number(a.shelf) - Number(b.shelf) || b.downloads - a.downloads || Number(a.id) - Number(b.id));
}
