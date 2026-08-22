/**
 * Pins the narration pipeline's contracts WITHOUT needing Kokoro, a GPU, or
 * ffmpeg: the planner's tiling + gate, the alignment rails, and the timing
 * math are all pure and tested here. (The synthesis and encode steps are
 * covered by verify.mjs against real output.)
 *
 *   node scripts/narration/test-narration.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignUnit, buildTiming, norm } from './finish.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (label, cond, detail = '') => {
    if (cond) { console.log(`ok  ${label}`); } else { console.error(`FAIL ${label} ${detail}`); failures++; }
};
const throws = (label, fn, needle) => {
    try { fn(); check(label, false, '(did not throw)'); } catch (e) {
        check(label, !needle || String(e.message).includes(needle), `(threw wrong error: ${e.message})`);
    }
};

// ── 1. plan.mjs: tiling, unit splitting, segment grouping, the gate ────────
{
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'narr-test-'));
    const texts = path.join(tmp, 'texts');
    const work = path.join(tmp, 'work');
    mkdirSync(texts, { recursive: true });

    // A clean mini-book: normal paragraphs plus one paragraph long enough to
    // force sentence-boundary unit splitting (> 450 words).
    const sentence = 'The quick brown fox jumps over the lazy dog again today. ';
    const bigParagraph = sentence.repeat(60).trim(); // 600 words, 60 sentences
    const clean = [
        'A Tiny Test Book',
        'Once upon a time, there was a very small book. It had two paragraphs -- nothing more.',
        bigParagraph,
        'The end came quickly; everyone was satisfied.',
    ].join('\n\n');
    writeFileSync(path.join(texts, '900001.txt'), clean);

    // A dirty book: the strip's known leftovers that must EXCLUDE it.
    writeFileSync(path.join(texts, '900002.txt'), [
        'A Dirty Test Book',
        'This paragraph is fine and reads normally, like any other paragraph would.',
        'For more information visit www.gutenberg.org and enjoy this eText forever.',
    ].join('\n\n'));

    const r = spawnSync(process.execPath, [
        path.join(HERE, 'plan.mjs'),
        '--ids=900001,900002', `--text-dir=${texts}`, `--work=${work}`,
    ], { encoding: 'utf8' });

    check('plan: exit code flags the excluded book', r.status === 1, `(status ${r.status}, stderr: ${r.stderr})`);
    check('plan: clean book planned', existsSync(path.join(work, '900001', 'plan.json')));
    check('plan: dirty book excluded, no plan written', existsSync(path.join(work, '900002', 'excluded.json')) && !existsSync(path.join(work, '900002', 'plan.json')));

    const plan = JSON.parse(readFileSync(path.join(work, '900001', 'plan.json'), 'utf8'));
    const spanWords = plan.span[1] - plan.span[0] + 1;
    check('plan: units tile the span exactly', plan.spanWords === spanWords && plan.units.reduce((n, u) => n + u.count, 0) === spanWords);
    let cursor = plan.span[0];
    let contiguous = true;
    for (const u of plan.units) { if (u.start !== cursor) contiguous = false; cursor += u.count; }
    check('plan: units are contiguous and ordered', contiguous && cursor === plan.span[1] + 1);
    check('plan: oversized paragraph split into <=450-word units', plan.units.every((u) => u.count <= 450) && plan.units.length >= 4);
    check('plan: segments tile the units', plan.segments.reduce((n, s) => n + s.words, 0) === spanWords);
    check('plan: unit text carries no underscores', plan.units.every((u) => !u.text.includes('_')));

    const ex = JSON.parse(readFileSync(path.join(work, '900002', 'excluded.json'), 'utf8'));
    check('plan: exclusion names the offending token', ex.hits.length >= 2 && ex.hits.some((h) => h.pattern === 'gutenberg') && ex.hits.some((h) => h.pattern === 'etext'));

    rmSync(tmp, { recursive: true, force: true });
}

// ── 2. alignUnit: the deterministic walk and its rails ─────────────────────
{
    // Kokoro-style tokens for: `"Hello," she said -- quietly.`
    const words = ['"Hello,"', 'she', 'said', '--', 'quietly.'];
    const kokoro = [
        { text: 'Hello', start: 0.10, end: 0.42 },
        { text: ',', start: 0.42, end: 0.42 },
        { text: 'she', start: 0.55, end: 0.70 },
        { text: 'said', start: 0.72, end: 1.05 },
        { text: 'quietly', start: 1.60, end: 2.10 },
        { text: '.', start: 2.10, end: 2.10 },
    ];
    const starts = alignUnit(words, kokoro);
    check('align: word starts follow the voiced tokens', starts[0] === 0.10 && starts[1] === 0.55 && starts[2] === 0.72 && starts[4] === 1.60);
    check('align: empty-norm word ("--") borrows the next start (zero width)', starts[3] === 1.60);

    throws('align: stream mismatch is a hard failure', () => alignUnit(['Hello', 'world'], [{ text: 'Hello', start: 0, end: 1 }, { text: 'word', start: 1, end: 2 }]), 'stream mismatch');
    throws('align: non-monotonic timing is a hard failure', () => alignUnit(['a', 'b'], [{ text: 'a', start: 1.0, end: 1.2 }, { text: 'b', start: 0.5, end: 0.9 }]), 'non-monotonic');
    check('align: norm matches the modernity matcher', norm('“Hello,”—she’s FINE_') === 'helloshesfine');
}

// ── 3. buildTiming: telescoped rounding, coverage, the wpm rail ────────────
{
    // Two units, one segment: 6 words over 1.8030s of audio. Awkward
    // fractional starts on purpose — rounding must telescope so per-segment
    // sums stay EXACT, and 6 words / 1.80s lands at naturalWpm 200.0.
    const plan = {
        spanWords: 6,
        units: [{ i: 0, count: 3 }, { i: 1, count: 3 }],
        segments: [{ i: 0, startWord: 100, words: 6, units: [0, 1] }],
    };
    const unitData = {
        0: { starts: [0.0031, 0.3007, 0.6113], durS: 0.9013 },
        1: { starts: [0.0101, 0.2903, 0.6011], durS: 0.9017 },
    };
    const t = buildTiming(plan, unitData);
    check('timing: durCs covers every span word', t.durCs.length === 6);
    check('timing: segment sum is exact (telescoped rounding)', t.durCs.reduce((n, d) => n + d * 10, 0) === t.segments[0].durMs);
    check('timing: segment duration from unit audio', t.segments[0].durMs === 1800);
    check('timing: unit offsets accumulate across the segment', t.durCs[2] === Math.round((0.9013 + 0.0101) * 100) - Math.round(0.6113 * 100));
    check('timing: naturalWpm lands where the math says', t.naturalWpm === 200);
    check('timing: segment metadata carried through', t.segments[0].startWord === 100 && t.segments[0].words === 6 && t.segments[0].file === 'seg-000.opus');

    throws('timing: wpm outside the master range is a hard failure', () => buildTiming(
        { spanWords: 6, units: [{ i: 0, count: 6 }], segments: [{ i: 0, startWord: 0, words: 6, units: [0] }] },
        { 0: { starts: [0, 0.1, 0.2, 0.3, 0.4, 0.5], durS: 1.0 } },
    ), 'naturalWpm');
    throws('timing: starts count must match unit word count', () => buildTiming(
        plan,
        { 0: { starts: [0.0, 0.3], durS: 0.9 }, 1: unitData[1] },
    ), 'starts for');
    throws('timing: out-of-order starts across a unit boundary fail', () => buildTiming(
        { spanWords: 6, units: [{ i: 0, count: 3 }, { i: 1, count: 3 }], segments: [{ i: 0, startWord: 0, words: 6, units: [0, 1] }] },
        { 0: { starts: [0, 0.5, 0.95], durS: 0.9 }, 1: { starts: [0.01, 0.29, 0.60], durS: 0.9 } },
    ), 'negative duration');
}

// ── 4. Regressions from the 2026-08-22 adversarial review ──────────────────
{
    // Segment-leading silence: Kokoro leaves onset silence before the first
    // voiced word; it must attach to word 0 and the parity rail must hold.
    // (This exact input used to throw 'parity identity broke'.)
    const t = buildTiming(
        { spanWords: 3, units: [{ i: 0, count: 3 }], segments: [{ i: 0, startWord: 0, words: 3, units: [0] }] },
        { 0: { starts: [0.10, 0.35, 0.62], durS: 0.90 } },
    );
    check('regression: onset silence attaches to word 0, parity holds', t.durCs[0] === 35 && t.durCs.reduce((n, d) => n + d * 10, 0) === t.segments[0].durMs);

    // A trailing RUN of silent words ('. . .', '* * *' rows, dash runs) used
    // to leak null through the resolution loop and hard-fail the book.
    const starts = alignUnit(['Hello', '--', '--'], [{ text: 'Hello', start: 0.10, end: 0.42 }]);
    check('regression: trailing run of silent words collapses onto the end', starts[1] === 0.42 && starts[2] === 0.42);

    // An all-silent unit (a '* * *' separator paragraph) must resolve to
    // zeros, not leak nulls into buildTiming.
    const silent = alignUnit(['*', '*', '*'], []);
    check('regression: all-silent unit resolves to zeros', silent.every((s) => s === 0));
}

console.log('');
if (failures) { console.error(`${failures} failure(s).`); process.exit(1); }
console.log('narration pipeline contracts hold.');
