/**
 * Fold one snippet night's agent results into the snippet store.
 *
 *   node scripts/merge-snippets.mjs scripts/deep-starts/snippet-results/night-1.json
 *
 * Each book is { id, anchor, words, teaser, whyItHooks } — `anchor` is a
 * verbatim phrase at the snippet's first sentence, `words` the intended length
 * (400-700), `teaser` a spoiler-free 5-8 word label ("the typhoon hits"),
 * `whyItHooks` the agent's one-line justification (kept for auditing, not
 * shipped). The anchor resolves to a token index in the reader's id space (same
 * resolver as story starts); the snippet is [startIndex, startIndex + words).
 *
 * Writes scripts/deep-starts/snippets.json  { [id]: { start, words, teaser } }
 *        scripts/deep-starts/snippets-done.json (processed ids, drives the queue)
 * Unresolvable anchors are recorded in done (so the night moves on) but get no
 * snippet — rerun later with a fresh anchor if wanted.
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
if (!resultsPath) { console.error('usage: node scripts/merge-snippets.mjs <results.json>'); process.exit(1); }

const loadJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);

async function main() {
    const raw = JSON.parse(await readFile(path.resolve(resultsPath), 'utf8'));
    const books = Array.isArray(raw) ? raw : (raw.books || []);
    const snippets = await loadJson(path.join(DIR, 'snippets.json'), {});
    const done = new Set(await loadJson(path.join(DIR, 'snippets-done.json'), []));

    const stats = { seen: 0, added: 0, unresolved: 0, skipped: 0 };
    const problems = [];
    for (const b of books) {
        const id = String(b.id);
        stats.seen++;
        done.add(id);
        const anchor = (b.anchor || '').replace(/&amp;/gi, '&').trim();
        if (!anchor || anchor.split(/\s+/).length < 4) { stats.skipped++; continue; }
        const file = path.join(MIRROR, `${id}.txt`);
        if (!existsSync(file)) { stats.unresolved++; problems.push(`#${id}: no text`); continue; }
        const tokens = tokenize(await readFile(file, 'utf8'));
        const idx = resolveAnchor(tokens, anchor);
        if (idx < 0) { stats.unresolved++; problems.push(`#${id}: anchor not found: "${anchor.slice(0, 40)}…"`); continue; }
        const words = Math.max(300, Math.min(800, Number(b.words) || 550));
        snippets[id] = { start: idx, words: Math.min(words, tokens.length - idx), teaser: (b.teaser || '').slice(0, 60) };
        stats.added++;
    }

    await writeFile(path.join(DIR, 'snippets.json'), JSON.stringify(snippets));
    await writeFile(path.join(DIR, 'snippets-done.json'), JSON.stringify([...done]));
    console.log(`Merged ${stats.seen}: ${stats.added} snippets, ${stats.unresolved} unresolved, ${stats.skipped} skipped (no pick).`);
    if (problems.length) for (const p of problems.slice(0, 20)) console.log('  ' + p);
    console.log(`Totals: snippets=${Object.keys(snippets).length} done=${done.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
