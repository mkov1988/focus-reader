/**
 * Prep one night's story-start verification run: take the next N undone books
 * from the priority queue and split them into per-agent batch files.
 *
 *   node scripts/deep-starts-night.mjs --count 5000
 *
 * Reads  scripts/deep-starts/queue.json (from deep-starts-pass.mjs)
 *        scripts/deep-starts/done.json  (ids already verified; created if missing)
 * Writes scripts/deep-starts/batches/batch-NNN.json (12 books each)
 * Prints the batch count for the Workflow fan-out.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const BATCH_DIR = path.join(DIR, 'batches');

const args = process.argv.slice(2);
const COUNT = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1], 10) : 5000;
// Books per agent. 40 amortizes each agent's fixed overhead (system prompt,
// schemas, thinking) across ~3x more reading than the original 12 — the reading
// itself costs the same, the overhead is what burned the token budget.
const PER_AGENT = args.includes('--per-agent') ? parseInt(args[args.indexOf('--per-agent') + 1], 10) : 40;
// --meta-backfill: instead of unprocessed books, target books that were verified
// under the thin schema (in done.json but with no details meta) so they get
// hook/voice/era/tags too. Run this once the main queue is empty.
const BACKFILL = args.includes('--meta-backfill');

async function main() {
    const queue = JSON.parse(await readFile(path.join(DIR, 'queue.json'), 'utf8'));
    const donePath = path.join(DIR, 'done.json');
    const done = new Set(existsSync(donePath) ? JSON.parse(await readFile(donePath, 'utf8')) : []);
    const metaPath = path.join(DIR, 'meta.json');
    const meta = existsSync(metaPath) ? JSON.parse(await readFile(metaPath, 'utf8')) : {};

    const tonight = BACKFILL
        ? queue.filter((q) => done.has(q.id) && !meta[q.id]).slice(0, COUNT)
        : queue.filter((q) => !done.has(q.id)).slice(0, COUNT);
    if (tonight.length === 0) { console.log(BACKFILL ? 'QUEUE EMPTY — every done book has meta.' : 'QUEUE EMPTY — all books verified.'); return; }

    await rm(BATCH_DIR, { recursive: true, force: true });
    await mkdir(BATCH_DIR, { recursive: true });
    let n = 0;
    for (let i = 0; i < tonight.length; i += PER_AGENT) {
        await writeFile(
            path.join(BATCH_DIR, `batch-${String(n).padStart(3, '0')}.json`),
            JSON.stringify(tonight.slice(i, i + PER_AGENT), null, 1),
        );
        n++;
    }
    console.log(`BATCHES=${n} BOOKS=${tonight.length} REMAINING_AFTER=${queue.length - done.size - tonight.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
