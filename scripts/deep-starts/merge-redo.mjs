/**
 * Merge one redo chunk into the deep story-start store.
 *
 *   node scripts/deep-starts/merge-redo.mjs scripts/deep-starts/results/redo-N.json
 *
 * Same resolution as merge-deep-starts.mjs (anchor resolved against the mirror
 * wins; unresolved keeps whatever verified.json already holds, falling back to
 * the detector), with the one power the main merge deliberately lacks:
 * narrative: true REMOVES the id from non-narrative.json, undoing the Sonnet
 * sweep's overcalled flags. Also maintains redo-done.json so build-redo-queue
 * --prep only hands out each book once.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, resolveAnchor } from '../build-story-starts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const MIRROR = path.join(ROOT, 'mirror', 'books');

const resultsPath = process.argv[2];
if (!resultsPath) { console.error('usage: node scripts/deep-starts/merge-redo.mjs <results.json>'); process.exit(1); }

const loadJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);

async function main() {
    const raw = JSON.parse(await readFile(path.resolve(resultsPath), 'utf8'));
    const books = Array.isArray(raw) ? raw : (raw.books || []);
    const detector = await loadJson(path.join(DIR, 'detector.json'), {});
    const verified = await loadJson(path.join(DIR, 'verified.json'), {});
    const nonNarrative = new Set(await loadJson(path.join(DIR, 'non-narrative.json'), []));
    const done = new Set(await loadJson(path.join(DIR, 'done.json'), []));
    const redoDone = new Set(await loadJson(path.join(DIR, 'redo-done.json'), []));
    const meta = await loadJson(path.join(DIR, 'meta.json'), {});

    const stats = { seen: 0, anchored: 0, kept: 0, unflagged: 0, nonNarrative: 0 };
    for (const b of books) {
        const id = String(b.id);
        stats.seen++;
        done.add(id);
        redoDone.add(id);
        if (b.narrative === false) {
            if (!nonNarrative.has(id)) stats.nonNarrative++;
            nonNarrative.add(id);
        } else if (nonNarrative.has(id)) {
            nonNarrative.delete(id);
            stats.unflagged++;
        }
        if (b.hook) {
            meta[id] = {
                hook: b.hook,
                voice: b.voice || null,
                era: b.era || null,
                tags: Array.isArray(b.tags) ? b.tags.slice(0, 4) : [],
            };
        }

        const anchor = (b.anchor || '').replace(/&amp;/gi, '&').trim();
        const file = path.join(MIRROR, `${id}.txt`);
        let start = null;
        if (anchor.split(/\s+/).length >= 4 && existsSync(file)) {
            const tokens = tokenize(await readFile(file, 'utf8'));
            const idx = resolveAnchor(tokens, anchor);
            if (idx >= 0 && idx <= tokens.length * 0.45) start = idx;
        }
        if (start !== null) { verified[id] = start; stats.anchored++; }
        else { stats.kept++; if (!(id in verified)) verified[id] = detector[id]?.start ?? 0; }
    }

    await writeFile(path.join(DIR, 'verified.json'), JSON.stringify(verified));
    await writeFile(path.join(DIR, 'non-narrative.json'), JSON.stringify([...nonNarrative]));
    await writeFile(path.join(DIR, 'done.json'), JSON.stringify([...done]));
    await writeFile(path.join(DIR, 'redo-done.json'), JSON.stringify([...redoDone]));
    await writeFile(path.join(DIR, 'meta.json'), JSON.stringify(meta));
    console.log(`Redo-merged ${stats.seen}: ${stats.anchored} anchor-verified, ${stats.kept} kept prior/detector, ${stats.unflagged} un-flagged non-narrative, ${stats.nonNarrative} newly non-narrative.`);
    console.log(`Totals: verified=${Object.keys(verified).length} nonNarrative=${nonNarrative.size} redoDone=${redoDone.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
