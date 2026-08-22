/**
 * Narration pipeline, step 1: plan a book for synthesis.
 *
 * Reads the exact served bytes (public/books/<id>.txt — run `npm run
 * mirror:books` first), tokenizes with the REAL reader tokenizer (via
 * scripts/lib/load-ts.mjs, never a replica), and writes a synthesis plan:
 * which token span gets narrated, cut into paragraph-aligned units small
 * enough for the model, grouped into ~20-minute segments.
 *
 *   node scripts/narration/plan.mjs --ids=84,1342,14838
 *   node scripts/narration/plan.mjs --ids=84 --text-dir=path/to/txt   (tests)
 *
 * Hard gate: any span token matching gutenberg/url/e-text leftovers EXCLUDES
 * the book (work/<id>/excluded.json). Narrated words must stay one-to-one
 * with reader token ids, so text is never edited for audio — exclusion is the
 * only mechanism (docs/narration-plan.md §8, LEGAL.md).
 *
 * Output: scripts/narration/work/<id>/plan.json (gitignored work area).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTextProcessing } from '../lib/load-ts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// A unit is one model call. Kokoro chunks internally past ~510 phonemes, but
// planning to ≤450 words keeps units at whole paragraphs (or whole sentences
// inside an oversized paragraph) so every unit boundary is a natural pause.
const UNIT_MAX_WORDS = 450;
// A segment is one shipped Opus file (~20 min at the ~200wpm master pace).
const SEGMENT_TARGET_WORDS = 3500;

// The leftover gate. The strip removes every line carrying the trademark
// phrase, but bare gutenberg.org URLs and "this Gutenberg eText" nicknames
// survive in ~50 texts (LEGAL.md open question) — narration must never voice
// them. Patterns run against raw token text over the narrated span.
const GATE_PATTERNS = [
    { name: 'gutenberg', re: /gutenberg/i },
    { name: 'url', re: /https?:\/\//i },
    { name: 'www', re: /\bwww\./i },
    { name: 'etext', re: /\be-?text\b/i },
];

const arg = (name, fallback = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};
const ids = (arg('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!ids.length) {
    console.error('Pass --ids=84,1342,14838');
    process.exit(1);
}
const TEXT_DIR = arg('text-dir', path.join(ROOT, 'public', 'books'));
const WORK = arg('work', path.join(ROOT, 'scripts', 'narration', 'work'));

const tp = loadTextProcessing();

function gateScan(tokens, start, end) {
    const hits = [];
    for (let i = start; i <= end; i++) {
        const w = tokens[i].word;
        for (const { name, re } of GATE_PATTERNS) {
            if (re.test(w)) hits.push({ token: i, word: w, pattern: name });
        }
    }
    return hits;
}

// Cut the readable span into units: whole paragraphs, oversized paragraphs
// split at sentence boundaries, a (pathological) oversized sentence split
// hard. Units carry contiguous token id ranges by construction.
function buildUnits(parsed, start, end) {
    const units = [];
    for (const para of parsed.paragraphs) {
        const clamped = para.filter((t) => t.id >= start && t.id <= end);
        if (!clamped.length) continue;
        if (clamped.length <= UNIT_MAX_WORDS) {
            units.push({ start: clamped[0].id, count: clamped.length, paraStart: true });
            continue;
        }
        let group = [];
        let first = true;
        const flush = () => {
            if (!group.length) return;
            units.push({ start: group[0].id, count: group.length, paraStart: first });
            first = false;
            group = [];
        };
        let sentence = [];
        const flushSentence = () => {
            if (!sentence.length) return;
            if (group.length && group.length + sentence.length > UNIT_MAX_WORDS) flush();
            while (sentence.length > UNIT_MAX_WORDS) {
                flush();
                group = sentence.slice(0, UNIT_MAX_WORDS);
                sentence = sentence.slice(UNIT_MAX_WORDS);
                flush();
            }
            group.push(...sentence);
            sentence = [];
        };
        for (const t of clamped) {
            sentence.push(t);
            if (t.isSentenceEnd) flushSentence();
        }
        flushSentence();
        flush();
    }
    return units;
}

// Group units into segments, closing a segment only where the next unit
// starts a paragraph (so every shipped file begins on a paragraph break).
// Backstop: a pathological run of paragraph-less units still closes at 2×
// target rather than growing one giant file.
function buildSegments(units) {
    const segments = [];
    let current = null;
    for (let u = 0; u < units.length; u++) {
        const unit = units[u];
        const shouldClose = current
            && current.words >= SEGMENT_TARGET_WORDS
            && (unit.paraStart || current.words >= SEGMENT_TARGET_WORDS * 2);
        if (!current || shouldClose) {
            current = { i: segments.length, startWord: unit.start, words: 0, units: [] };
            segments.push(current);
        }
        unit.seg = current.i;
        current.words += unit.count;
        current.units.push(u);
    }
    return segments;
}

let failures = 0;
for (const id of ids) {
    const src = path.join(TEXT_DIR, `${id}.txt`);
    if (!existsSync(src)) {
        console.error(`${id}: ${src} not found — run \`npm run mirror:books\` first (public/books is a gitignored local artifact).`);
        failures++;
        continue;
    }
    const text = readFileSync(src, 'utf8');
    const parsed = tp.parseText(text);
    const start = parsed.readableStartWord;
    const end = parsed.readableEndWord;
    const dir = path.join(WORK, String(id));
    mkdirSync(dir, { recursive: true });

    const gateHits = gateScan(parsed.tokens, start, end);
    if (gateHits.length) {
        writeFileSync(path.join(dir, 'excluded.json'), JSON.stringify({
            v: 1, bookId: String(id), reason: 'leftover-gate', hits: gateHits.slice(0, 50),
        }, null, 2) + '\n');
        console.error(`${id}: EXCLUDED — ${gateHits.length} leftover hit(s), first: token ${gateHits[0].token} "${gateHits[0].word}" (${gateHits[0].pattern})`);
        failures++;
        continue;
    }

    const units = buildUnits(parsed, start, end);
    const segments = buildSegments(units);
    const spanWords = units.reduce((n, u) => n + u.count, 0);
    // Sanity: units must tile the span exactly — every readable token narrated
    // once, in order. ([P] markers never become tokens, so ids are contiguous.)
    if (spanWords !== end - start + 1) {
        console.error(`${id}: PLAN BUG — units cover ${spanWords} words, span is ${end - start + 1}. Not writing a plan.`);
        failures++;
        continue;
    }

    const unitRecords = units.map((u, i) => ({
        i,
        seg: u.seg,
        start: u.start,
        count: u.count,
        // The model reads exactly the reader's tokens, joined with single
        // spaces. Underscores are Gutenberg italic markup, stripped for speech
        // (the alignment norm discards them anyway, so token space is safe).
        text: parsed.tokens.slice(u.start, u.start + u.count).map((t) => t.word).join(' ').replace(/_/g, ''),
    }));

    const plan = {
        v: 1,
        bookId: String(id),
        sourceSha256: createHash('sha256').update(text).digest('hex'),
        tokensTotal: parsed.tokens.length,
        span: [start, end],
        spanWords,
        units: unitRecords,
        segments: segments.map((s) => ({ i: s.i, startWord: s.startWord, words: s.words, units: s.units })),
    };
    writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan) + '\n');
    console.log(`${id}: plan ok — ${spanWords} span words (of ${parsed.tokens.length}), ${units.length} units, ${segments.length} segments`);
}
process.exit(failures ? 1 : 0);
