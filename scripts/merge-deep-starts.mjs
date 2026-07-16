/**
 * Fold one night's agent verdicts into the deep story-start store.
 *
 *   node scripts/merge-deep-starts.mjs scripts/deep-starts/results/night-N.json
 *
 * Each verdict is { id, anchor, narrative } — anchor is a verbatim phrase from
 * the true first sentence (see the nightly prompt). Resolution: anchor resolved
 * against mirror/books/<id>.txt (same resolver as build-story-starts) wins; an
 * unresolvable/deep (>45%) anchor falls back to the detector's pick so every
 * processed book still gets an entry. Updates:
 *   scripts/deep-starts/verified.json      { [id]: startIndex }
 *   scripts/deep-starts/non-narrative.json [ids] (reference works, no story)
 *   scripts/deep-starts/done.json          processed ids (drives the queue)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, resolveAnchor } from './build-story-starts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const MIRROR = path.join(ROOT, 'mirror', 'books');

const resultsPath = process.argv[2];
if (!resultsPath) { console.error('usage: node scripts/merge-deep-starts.mjs <results.json>'); process.exit(1); }

const loadJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);

async function main() {
    const raw = JSON.parse(await readFile(path.resolve(resultsPath), 'utf8'));
    const books = Array.isArray(raw) ? raw : (raw.books || []);
    const detector = await loadJson(path.join(DIR, 'detector.json'), {});
    const verified = await loadJson(path.join(DIR, 'verified.json'), {});
    const nonNarrative = new Set(await loadJson(path.join(DIR, 'non-narrative.json'), []));
    const done = new Set(await loadJson(path.join(DIR, 'done.json'), []));

    const stats = { seen: 0, anchored: 0, fellBack: 0, nonNarrative: 0 };
    for (const b of books) {
        const id = String(b.id);
        stats.seen++;
        done.add(id);
        if (b.narrative === false) { nonNarrative.add(id); stats.nonNarrative++; }

        const anchor = (b.anchor || '').replace(/&amp;/gi, '&').trim();
        const file = path.join(MIRROR, `${id}.txt`);
        let start = null;
        if (anchor.split(/\s+/).length >= 4 && existsSync(file)) {
            const tokens = tokenize(await readFile(file, 'utf8'));
            const idx = resolveAnchor(tokens, anchor);
            if (idx >= 0 && idx <= tokens.length * 0.45) start = idx;
        }
        if (start !== null) { stats.anchored++; }
        else { start = detector[id]?.start ?? 0; stats.fellBack++; }
        verified[id] = start;
    }

    await writeFile(path.join(DIR, 'verified.json'), JSON.stringify(verified));
    await writeFile(path.join(DIR, 'non-narrative.json'), JSON.stringify([...nonNarrative]));
    await writeFile(path.join(DIR, 'done.json'), JSON.stringify([...done]));
    console.log(`Merged ${stats.seen}: ${stats.anchored} anchor-verified, ${stats.fellBack} detector-fallback, ${stats.nonNarrative} non-narrative.`);
    console.log(`Totals: verified=${Object.keys(verified).length} done=${done.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
