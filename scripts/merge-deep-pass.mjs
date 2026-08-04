/**
 * Fold one deep-pass night's results into all the stores at once. The deep pass
 * is ONE full read per top-800 book producing every across-the-book feature:
 *
 *   node scripts/merge-deep-pass.mjs scripts/deep-starts/deep-pass-results/chunk-1.json
 *
 * Per book: { id, nonNarrative,
 *   scenes:   [{anchor,label,recap}]            — 6-12 spoiler-safe scene beats
 *   details:  { cast:[], pacing, contentNotes:[], themes:[] }
 *   snipShort:{ anchor, words, teaser }          — ~1-minute quick hit (240-320 words)
 *   snipStory:{ anchor, words, teaser }          — 3-5 minute story (800-1400 words)
 *   hook, voice, era, tags                       — details-page meta (fills the
 *                                                  shipped-set gap; merged into meta.json)
 * }
 *
 * Routing:
 *  - scenes for books with public/books/<id>.txt → scripts/scenes-src.json (the
 *    bundled pipeline; existing hand-authored entries are never overwritten;
 *    run `npm run build:scenes` after to resolve + validate anchors).
 *  - scenes for long-tail books (no public text) → deep-scenes.json (held for a
 *    future serving surface; the bundled scenes.json stays lean).
 *  - snippets → snippets.json { [id]: { short?, story? } }, anchors resolved to
 *    token indexes against mirror text (>75% depth rejected as spoiler risk).
 *  - details → details.json; meta fields → meta.json (only if absent).
 *  - every processed id → deep-pass-done.json.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, resolveAnchor } from './build-story-starts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const MIRROR = path.join(ROOT, 'mirror', 'books');
const PUBLIC = path.join(ROOT, 'public', 'books');
const SRC = path.join(ROOT, 'scripts', 'scenes-src.json');

const resultsPath = process.argv[2];
if (!resultsPath) { console.error('usage: node scripts/merge-deep-pass.mjs <results.json>'); process.exit(1); }

const loadJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);
const clean = (s) => (s || '').replace(/&amp;/gi, '&').trim();

async function main() {
    const raw = JSON.parse(await readFile(path.resolve(resultsPath), 'utf8'));
    const books = Array.isArray(raw) ? raw : (raw.books || []);
    const src = await loadJson(SRC, {});
    const deepScenes = await loadJson(path.join(DIR, 'deep-scenes.json'), {});
    const details = await loadJson(path.join(DIR, 'details.json'), {});
    const snippets = await loadJson(path.join(DIR, 'snippets.json'), {});
    const meta = await loadJson(path.join(DIR, 'meta.json'), {});
    const done = new Set(await loadJson(path.join(DIR, 'deep-pass-done.json'), []));

    const stats = { seen: 0, scenesBundled: 0, scenesDeep: 0, scenesSkippedExisting: 0, short: 0, story: 0, snipRejected: 0, detailed: 0, metaFilled: 0, nonNarrative: 0 };
    const problems = [];

    for (const b of books) {
        const id = String(b.id);
        stats.seen++;
        done.add(id);
        if (b.nonNarrative) { stats.nonNarrative++; continue; }

        // Scenes: bundled pipeline where possible, deep store otherwise.
        if (Array.isArray(b.scenes) && b.scenes.length) {
            if (src[id]) stats.scenesSkippedExisting++;
            else if (existsSync(path.join(PUBLIC, `${id}.txt`))) {
                src[id] = b.scenes.map((s) => ({ anchor: s.anchor, label: s.label, recap: s.recap }));
                stats.scenesBundled++;
            } else {
                deepScenes[id] = b.scenes;
                stats.scenesDeep++;
            }
        }

        // Snippets: resolve both tiers against mirror text.
        const file = path.join(MIRROR, `${id}.txt`);
        if (existsSync(file) && (b.snipShort || b.snipStory)) {
            const tokens = tokenize(await readFile(file, 'utf8'));
            const resolveSnip = (s, lo, hi, dflt) => {
                const anchor = clean(s && s.anchor);
                if (anchor.split(/\s+/).length < 4) return null;
                const idx = resolveAnchor(tokens, anchor);
                if (idx < 0 || idx > tokens.length * 0.75) return null;
                const words = Math.max(lo, Math.min(hi, Number(s.words) || dflt));
                return { start: idx, words: Math.min(words, tokens.length - idx), teaser: clean(s.teaser).slice(0, 60) };
            };
            const sh = resolveSnip(b.snipShort, 200, 340, 280);
            const st = resolveSnip(b.snipStory, 700, 1500, 1100);
            if (sh || st) {
                snippets[id] = { ...(snippets[id] || {}), ...(sh ? { short: sh } : {}), ...(st ? { story: st } : {}) };
                if (sh) stats.short++;
                if (st) stats.story++;
            }
            if (b.snipShort && !sh) { stats.snipRejected++; problems.push(`#${id}: short snippet anchor unresolved/deep`); }
            if (b.snipStory && !st) { stats.snipRejected++; problems.push(`#${id}: story snippet anchor unresolved/deep`); }
        }

        // Details + meta backfill.
        if (b.details && Array.isArray(b.details.cast)) { details[id] = b.details; stats.detailed++; }
        if (b.hook && !meta[id]) {
            meta[id] = { hook: clean(b.hook), voice: b.voice || null, era: b.era || null, tags: Array.isArray(b.tags) ? b.tags.slice(0, 4) : [] };
            stats.metaFilled++;
        }
    }

    await writeFile(SRC, JSON.stringify(src, null, 1));
    await writeFile(path.join(DIR, 'deep-scenes.json'), JSON.stringify(deepScenes));
    await writeFile(path.join(DIR, 'details.json'), JSON.stringify(details));
    await writeFile(path.join(DIR, 'snippets.json'), JSON.stringify(snippets));
    await writeFile(path.join(DIR, 'meta.json'), JSON.stringify(meta));
    await writeFile(path.join(DIR, 'deep-pass-done.json'), JSON.stringify([...done]));

    console.log(`Merged ${stats.seen}: scenes ${stats.scenesBundled} bundled / ${stats.scenesDeep} deep / ${stats.scenesSkippedExisting} hand-authored kept; snippets ${stats.short} short + ${stats.story} story (${stats.snipRejected} rejected); ${stats.detailed} details; ${stats.metaFilled} meta filled; ${stats.nonNarrative} non-narrative.`);
    if (problems.length) for (const p of problems.slice(0, 15)) console.log('  ' + p);
    console.log(`Totals: deep-pass-done=${done.size}/800. Now run: npm run build:scenes (validates bundled scene anchors).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
