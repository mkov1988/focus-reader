/**
 * Fold one recap night's agent results into the authored stores.
 *
 *   node scripts/merge-recap-night.mjs scripts/deep-starts/recap-results/night-1.json
 *
 * Each book is { id, nonNarrative, scenes: [{anchor, label, recap}], details? }.
 * details = { cast: ["..."], excerpt, pacing, contentNotes: [], themes: [] } —
 * the spoiler-safe details-page material gleaned while sampling the whole book.
 *
 * Scenes append to scripts/scenes-src.json (existing hand-authored entries are
 * never overwritten). Details accumulate in scripts/deep-starts/details.json.
 * Every processed id lands in scripts/deep-starts/recaps-done.json. Anchor
 * validation stays with `npm run build:scenes` — run it after this and fix any
 * "not found / out of order" books by re-anchoring from the text.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const SRC = path.join(ROOT, 'scripts', 'scenes-src.json');

const resultsPath = process.argv[2];
if (!resultsPath) { console.error('usage: node scripts/merge-recap-night.mjs <results.json>'); process.exit(1); }

const loadJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);

async function main() {
    const raw = JSON.parse(await readFile(path.resolve(resultsPath), 'utf8'));
    const books = Array.isArray(raw) ? raw : (raw.books || []);
    const src = await loadJson(SRC, {});
    const details = await loadJson(path.join(DIR, 'details.json'), {});
    const done = new Set(await loadJson(path.join(DIR, 'recaps-done.json'), []));

    const stats = { seen: 0, scened: 0, skippedExisting: 0, nonNarrative: 0, detailed: 0 };
    for (const b of books) {
        const id = String(b.id);
        stats.seen++;
        done.add(id);
        if (b.nonNarrative) { stats.nonNarrative++; continue; }
        if (Array.isArray(b.scenes) && b.scenes.length) {
            if (src[id]) { stats.skippedExisting++; }
            else {
                src[id] = b.scenes.map((s) => ({ anchor: s.anchor, label: s.label, recap: s.recap }));
                stats.scened++;
            }
        }
        if (b.details && b.details.excerpt) { details[id] = b.details; stats.detailed++; }
    }

    await writeFile(SRC, JSON.stringify(src, null, 1));
    await writeFile(path.join(DIR, 'details.json'), JSON.stringify(details));
    await writeFile(path.join(DIR, 'recaps-done.json'), JSON.stringify([...done]));
    console.log(`Merged ${stats.seen}: ${stats.scened} scene-mapped, ${stats.detailed} with details, ${stats.nonNarrative} non-narrative, ${stats.skippedExisting} already hand-authored.`);
    console.log(`Totals: scenes-src=${Object.keys(src).length} books, details=${Object.keys(details).length}, recaps-done=${done.size}`);
    console.log('Now run: npm run build:scenes  (fix any anchor problems it reports)');
}

main().catch((e) => { console.error(e); process.exit(1); });
