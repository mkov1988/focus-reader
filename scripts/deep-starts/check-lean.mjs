/**
 * Check one batch of the opening-pages pass (wf-listed-lean.mjs) and say
 * exactly what is wrong, so the agent that wrote it can put it right:
 *
 *   node scripts/deep-starts/check-lean.mjs 7        checks lean-results/batch-007.json
 *   node scripts/deep-starts/check-lean.mjs --all    checks every result file
 *
 * A book passes when: it was asked for; its anchor is a verbatim run of
 * words found in the opening 170 lines of public/books/<id>.txt (or empty,
 * for a text whose work has not begun by then); its hook is one sentence of
 * at most 25 words; voice, era and tags keep to the schema of
 * wf-chunk-lean.mjs; and nothing carries the word "Gutenberg" (LEGAL.md).
 * Exit 0 only when every book of the batch is present and passes.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, resolveAnchor } from '../build-story-starts.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
export const VOICES = ['first-person', 'third-person', 'letters', 'diary', 'verse', 'play', 'other'];
export const TAGS = ['cozy', 'adventurous', 'grim', 'romantic', 'funny', 'eerie', 'contemplative', 'thrilling', 'tragic', 'whimsical', 'philosophical', 'pastoral'];
const OPENING_LINES = 170;
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);

/** Everything wrong with one book's answer (an empty list: it passes). */
export function leanProblems(b) {
    const out = [];
    const file = path.join(ROOT, 'public', 'books', `${b.id}.txt`);
    if (!existsSync(file)) return [`no text at public/books/${b.id}.txt`];
    if (typeof b.anchor !== 'string') out.push('anchor is missing');
    else if (b.anchor.trim()) {
        const n = words(b.anchor).length;
        if (n < 8 || n > 14) out.push(`anchor is ${n} words, need 8 to 14`);
        const opening = readFileSync(file, 'utf8').split('\n').slice(0, OPENING_LINES + 30).join('\n');
        if (resolveAnchor(tokenize(opening), b.anchor) < 0) out.push('anchor is not a verbatim run of words from the opening of the text: copy it exactly');
    }
    if (typeof b.narrative !== 'boolean') out.push('narrative must be true or false');
    if (typeof b.hook !== 'string' || !b.hook.trim()) out.push('hook is missing');
    else if (words(b.hook).length > 25) out.push(`hook is ${words(b.hook).length} words, at most 25`);
    if (!VOICES.includes(b.voice)) out.push(`voice must be one of ${VOICES.join(', ')}`);
    if (typeof b.era !== 'string') out.push('era must be a string ("" if unclear)');
    else if (words(b.era).length > 6) out.push(`era is ${words(b.era).length} words, at most 6`);
    if (!Array.isArray(b.tags) || b.tags.length < 2 || b.tags.length > 4) out.push('tags must be 2 to 4');
    else {
        const bad = b.tags.filter((t) => !TAGS.includes(t));
        if (bad.length) out.push(`tags not in the vocabulary: ${bad.join(', ')}`);
        if (new Set(b.tags).size !== b.tags.length) out.push('tags repeat');
    }
    if (/gutenberg/i.test(JSON.stringify([b.hook, b.era]))) out.push('the word "Gutenberg" may not appear');
    return out;
}

function checkBatch(n) {
    const name = `batch-${String(n).padStart(3, '0')}.json`;
    const batchFile = path.join(DIR, 'batches', name);
    const resultFile = path.join(DIR, 'lean-results', name);
    if (!existsSync(resultFile)) { console.log(`${name}: no result file at scripts/deep-starts/lean-results/${name}`); return 1; }
    let books;
    try { books = JSON.parse(readFileSync(resultFile, 'utf8')).books; } catch (e) { console.log(`${name}: not valid JSON (${e.message})`); return 1; }
    if (!Array.isArray(books)) { console.log(`${name}: must be {"books":[...]}`); return 1; }
    const asked = existsSync(batchFile) ? JSON.parse(readFileSync(batchFile, 'utf8')).map((b) => String(b.id)) : null;
    let bad = 0;
    const seen = new Set();
    for (const b of books) {
        const id = String(b?.id);
        seen.add(id);
        const problems = asked && !asked.includes(id) ? ['this id was not in the batch'] : leanProblems({ ...b, id });
        if (problems.length) { bad += 1; console.log(`  #${id}: ${problems.join('; ')}`); }
    }
    for (const id of asked ?? []) if (!seen.has(id)) { bad += 1; console.log(`  #${id}: missing from the result`); }
    console.log(`${name}: ${books.length} books answered, ${bad} problem${bad === 1 ? '' : 's'}${bad ? '' : ' — PASS'}`);
    return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    let bad = 0;
    if (arg === '--all') {
        const dir = path.join(DIR, 'lean-results');
        for (const f of existsSync(dir) ? readdirSync(dir).sort() : []) bad += checkBatch(Number(/(\d+)/.exec(f)[1]));
    } else if (/^\d+$/.test(arg ?? '')) bad = checkBatch(Number(arg));
    else { console.error('usage: node scripts/deep-starts/check-lean.mjs <batch number> | --all'); process.exit(2); }
    process.exit(bad ? 1 : 0);
}
