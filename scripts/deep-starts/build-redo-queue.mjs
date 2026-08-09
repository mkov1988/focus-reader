/**
 * Build (and optionally batch) the redo queue for the Sonnet-era chunks.
 *
 * The Sonnet sweep (chunk files >= 35320) banked every book but left two kinds
 * of damage a stronger model needs to repair:
 *   - anchor:  the returned anchor was empty or never resolved against the
 *              mirror text, so the book silently kept the detector's pick
 *   - nonnarr: narrative:false was applied far beyond the "pure reference
 *              works" spec (essays, tributes, anthologies got flagged)
 *
 *   node scripts/deep-starts/build-redo-queue.mjs                 # report only
 *   node scripts/deep-starts/build-redo-queue.mjs --prep 600      # + write batches
 *
 * --prep clears scripts/deep-starts/batches/ (ONLY run this after the main
 * grind is finished — the nightly loop uses the same directory) and writes
 * batch-NNN.json files of 40 books, skipping ids already in redo-done.json.
 * Prints BATCHES=<n> like deep-starts-night.mjs, or QUEUE EMPTY when done.
 */
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, resolveAnchor } from '../build-story-starts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const MIRROR = path.join(ROOT, 'mirror', 'books');
const BATCH_DIR = path.join(DIR, 'batches');

const args = process.argv.slice(2);
const FROM = args.includes('--from') ? parseInt(args[args.indexOf('--from') + 1], 10) : 35320;
const PREP = args.includes('--prep') ? parseInt(args[args.indexOf('--prep') + 1], 10) : 0;
const PER_AGENT = 40;

async function main() {
    const files = (await readdir(path.join(DIR, 'results')))
        .filter((f) => /^chunk-(\d+)\.json$/.test(f) && parseInt(f.match(/\d+/)[0], 10) >= FROM)
        .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

    // Latest occurrence of an id wins, matching merge order.
    const latest = new Map();
    for (const f of files) {
        const raw = JSON.parse(await readFile(path.join(DIR, 'results', f), 'utf8'));
        for (const b of raw.books || raw) latest.set(String(b.id), b);
    }

    const redo = [];
    let anchorBad = 0, nonnarr = 0;
    for (const [id, b] of latest) {
        const anchor = (b.anchor || '').replace(/&amp;/gi, '&').trim();
        let anchored = false;
        const file = path.join(MIRROR, `${id}.txt`);
        if (anchor.split(/\s+/).length >= 4 && existsSync(file)) {
            const tokens = tokenize(await readFile(file, 'utf8'));
            const idx = resolveAnchor(tokens, anchor);
            if (idx >= 0 && idx <= tokens.length * 0.45) anchored = true;
        }
        const reasons = [];
        if (!anchored) { reasons.push('anchor'); anchorBad++; }
        if (b.narrative === false) { reasons.push('nonnarr'); nonnarr++; }
        if (reasons.length) redo.push({ id, reason: reasons.join('+') });
    }

    await writeFile(path.join(DIR, 'redo-queue.json'), JSON.stringify(redo, null, 1));
    console.log(`Scanned ${files.length} chunk files (>= ${FROM}), ${latest.size} books.`);
    console.log(`Redo queue: ${redo.length} books (${anchorBad} unresolved anchors, ${nonnarr} non-narrative flags to re-judge) -> redo-queue.json`);

    if (!PREP) return;
    const donePath = path.join(DIR, 'redo-done.json');
    const done = new Set(existsSync(donePath) ? JSON.parse(await readFile(donePath, 'utf8')) : []);
    const tonight = redo.filter((r) => !done.has(r.id)).slice(0, PREP);
    if (tonight.length === 0) { console.log('QUEUE EMPTY — every redo book re-verified.'); return; }
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
    console.log(`BATCHES=${n} BOOKS=${tonight.length} REMAINING_AFTER=${redo.length - done.size - tonight.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
