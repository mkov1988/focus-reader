/**
 * Build the bundled scene maps (src/data/scenes.json) from the hand-authored
 * anchors in scripts/scenes-src.json.
 *
 * Each authored scene gives a distinctive prose `anchor` from the start of the
 * scene; this resolves that anchor to a token index in the SAME id space the
 * reader uses (parseText), so a scene's `startIndex` lines up with
 * rsvp.currentIndex / TextToken.id, exactly like detected chapters. The app then
 * uses scenes for the "previously…" recap on resume (see services/scenes.ts).
 *
 * Matching is case and punctuation insensitive (curly quotes, em dashes, etc.
 * don't matter). Runs against the mirrored text in public/books/<id>.txt, so run
 * `npm run mirror:books` first.
 *
 *   node scripts/build-scenes.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PATH = path.join(ROOT, 'scripts', 'scenes-src.json');
const BOOKS_DIR = path.join(ROOT, 'public', 'books');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'scenes.json');

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Tokenize identically to parseText so indices == TextToken.id: blank lines
 *  become skipped [P] markers, everything else is whitespace split. */
function tokenize(raw) {
    const marked = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, ' [P] ');
    return marked.trim().split(/\s+/).filter((w) => w !== '[P]');
}

/** Resolve a prose anchor to the token index of its first word, or -1. Builds a
 *  separator-free normalized character stream (all punctuation and whitespace
 *  removed) with a char->token map, then does a substring find — so hyphens,
 *  apostrophes, curly quotes, and line breaks never break the match. */
function resolveAnchor(words, anchor) {
    let joined = '';
    const charToTok = [];
    for (let i = 0; i < words.length; i++) {
        const p = norm(words[i]);
        for (const ch of p) { joined += ch; charToTok.push(i); }
    }
    const needle = norm(anchor);
    if (!needle) return -1;
    const pos = joined.indexOf(needle);
    return pos >= 0 ? charToTok[pos] : -1;
}

async function main() {
    const src = JSON.parse(await readFile(SRC_PATH, 'utf8'));
    const out = {};
    let totalScenes = 0;
    const problems = [];

    for (const [id, scenes] of Object.entries(src)) {
        if (id.startsWith('_')) continue; // skip _comment
        const file = path.join(BOOKS_DIR, `${id}.txt`);
        if (!existsSync(file)) { problems.push(`#${id}: no mirrored text (run mirror:books)`); continue; }
        const words = tokenize(await readFile(file, 'utf8'));
        const resolved = [];
        let prev = -1;
        for (const s of scenes) {
            const startIndex = resolveAnchor(words, s.anchor);
            if (startIndex < 0) { problems.push(`#${id}: anchor not found: "${s.anchor.slice(0, 40)}…"`); continue; }
            if (startIndex <= prev) { problems.push(`#${id}: anchor out of order at "${s.label}" (idx ${startIndex} <= ${prev})`); }
            prev = startIndex;
            resolved.push({ startIndex, label: s.label, recap: s.recap });
        }
        resolved.sort((a, b) => a.startIndex - b.startIndex);
        out[id] = resolved;
        totalScenes += resolved.length;
        process.stdout.write(`  #${id}: ${resolved.length}/${scenes.length} scenes  (first @ token ${resolved[0]?.startIndex})\n`);
    }

    await writeFile(OUT_PATH, JSON.stringify(out));
    console.log(`\nWrote ${OUT_PATH} — ${Object.keys(out).length} books, ${totalScenes} scenes.`);
    if (problems.length) {
        console.log(`\n⚠ ${problems.length} problem(s):`);
        for (const p of problems) console.log('  ' + p);
        process.exitCode = 1;
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
