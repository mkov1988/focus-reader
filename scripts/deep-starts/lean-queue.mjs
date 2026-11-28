/**
 * Queue the listed books that still have no hook, voice, era and moods
 * (no entry in meta.json) for the opening-pages pass, wf-listed-lean.mjs:
 *
 *   node scripts/deep-starts/lean-queue.mjs            write the batch files
 *
 * Writes scripts/deep-starts/batches/batch-NNN.json (up to PER_AGENT books
 * each: id, title, author), most downloaded first, and prints the batch
 * count for the workflow's `batchCount`. A book already answered in
 * lean-results/ is left out, so a rerun queues only what is still missing.
 * Needs public/books/ (node scripts/fetch-data-plane.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listedBooks } from './listed-books.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const PER_AGENT = 40;
const meta = JSON.parse(readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
const answered = new Set();
const RESULTS = path.join(DIR, 'lean-results');
if (existsSync(RESULTS)) {
    for (const f of readdirSync(RESULTS)) {
        try { for (const b of JSON.parse(readFileSync(path.join(RESULTS, f), 'utf8')).books ?? []) answered.add(String(b.id)); } catch { /* an unreadable file answers nothing */ }
    }
}
const todo = listedBooks().filter((b) => !meta[b.id] && !answered.has(b.id) && existsSync(path.join(ROOT, 'public', 'books', `${b.id}.txt`)));
const BATCHES = path.join(DIR, 'batches');
rmSync(BATCHES, { recursive: true, force: true });
mkdirSync(BATCHES, { recursive: true });
let n = 0;
for (let i = 0; i < todo.length; i += PER_AGENT) {
    writeFileSync(path.join(BATCHES, `batch-${String(n).padStart(3, '0')}.json`), JSON.stringify(todo.slice(i, i + PER_AGENT).map(({ id, title, author }) => ({ id, title, author })), null, 1));
    n += 1;
}
console.log(`BATCHES=${n} BOOKS=${todo.length}`);
