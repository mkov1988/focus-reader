/**
 * Fold the story-tag batch results into the single story-tags store.
 *
 *   node scripts/merge-story-tags.mjs
 *
 * Reads  scripts/deep-starts/story-tags/parts/batch-*.json  (tagging agents' output)
 *        scripts/deep-starts/snippets.json                  (coverage check)
 * Writes scripts/deep-starts/story-tags.json
 *        { [id]: { pairOverlap, pairNote, spans: { [tier]: {title, blurb, feelings,
 *          kind, warnings, intensity, spoiler, spoilerNote, broken, brokenNote} } } }
 *
 * Every id+tier in snippets.json must be covered; missing ones are listed and
 * the store is still written (rerun the missing batch, then merge again).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const PARTS = path.join(DIR, 'story-tags', 'parts');
const OUT = path.join(DIR, 'story-tags.json');

const snippets = JSON.parse(await readFile(path.join(DIR, 'snippets.json'), 'utf8'));

const store = {};
for (const f of (await readdir(PARTS)).filter((f) => f.startsWith('batch-')).sort()) {
    const { books } = JSON.parse(await readFile(path.join(PARTS, f), 'utf8'));
    for (const b of books || []) {
        const id = String(b.id).trim();
        const entry = store[id] || { pairOverlap: 'single', pairNote: '', spans: {} };
        entry.pairOverlap = b.pairOverlap || entry.pairOverlap;
        entry.pairNote = b.pairNote || entry.pairNote;
        for (const s of b.spans || []) {
            const { tier, ...tags } = s;
            if (tier) entry.spans[tier] = tags;
        }
        store[id] = entry;
    }
}

const missing = [];
for (const [id, tiers] of Object.entries(snippets))
    for (const tier of Object.keys(tiers))
        if (!store[id]?.spans?.[tier]) missing.push(`${id}:${tier}`);

await writeFile(OUT, JSON.stringify(store, null, 1));

const spans = Object.values(store).flatMap((b) => Object.values(b.spans));
const count = (pred) => spans.filter(pred).length;
console.log(`books=${Object.keys(store).length} spans=${spans.length} missing=${missing.length}${missing.length ? ' [' + missing.join(', ') + ']' : ''}`);
console.log(`broken=${count((s) => s.broken)} spoiler: ruins=${count((s) => s.spoiler === 'ruins')} mild=${count((s) => s.spoiler === 'mild')} unknown=${count((s) => s.spoiler === 'unknown-book')}`);
console.log(`pairs: deflates=${Object.values(store).filter((b) => b.pairOverlap === 'deflates').length} overlaps=${Object.values(store).filter((b) => b.pairOverlap === 'overlaps').length}`);
console.log(`intensity: gentle=${count((s) => s.intensity === 'gentle')} steady=${count((s) => s.intensity === 'steady')} gripping=${count((s) => s.intensity === 'gripping')}`);
console.log(`no-warnings=${count((s) => !s.warnings?.length)}`);
