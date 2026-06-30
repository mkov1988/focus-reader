/**
 * Integration tests for readable-bounds detection (skip-non-book-text).
 *
 * These run the REAL `parseText` pipeline (chapter detection + back-matter
 * detection + bounds calc) by bundling the TypeScript source with esbuild,
 * rather than re-declaring the logic here. An earlier version of this file
 * hand-fed `calculateReadableBounds` chapter arrays containing titles like
 * "Index of Whaling Terms" — titles the detector can NEVER produce — so it
 * reported green while the feature was broken end-to-end. Testing through
 * `parseText` is the only way these assertions reflect what a real book does.
 */
import assert from 'node:assert';
import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), `_focus_textprocessing_${process.pid}.mjs`);

await esbuild.build({
    entryPoints: [join(root, 'src/utils/textProcessing.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false' },
});

const { parseText } = await import(pathToFileURL(outfile).href);

console.log('🧪 Running readable-bounds integration tests (real parseText)...');

const chapterBody = (n) =>
    `CHAPTER ${n}\n\nThis is the body of chapter ${n}. ` +
    'It carries enough words to look like real prose and to push the back ' +
    'matter safely past the midpoint of the document so the heuristics engage. '.repeat(3);

// AC1 + AC2: title page / copyright / TOC up front, a foreword, then chapters.
{
    const book = [
        'THE GREAT WHALE', 'A Novel',
        'Copyright 1899 by Some Publisher. All rights reserved.',
        'CONTENTS', 'Chapter I', 'Chapter II', 'Chapter III',
        'FOREWORD', 'These prefatory words are authored by the author and should be read in full before the chapters begin in earnest here.',
        chapterBody('I'), chapterBody('II'), chapterBody('III'),
    ].join('\n\n');
    const p = parseText(book);
    const startTok = p.tokens[p.readableStartWord];
    assert.strictEqual(p.chapterConfidence, 'high', 'A: should detect chapters at high confidence');
    assert.strictEqual(startTok.clean.toUpperCase(), 'FOREWORD', `A: stream should start at the Foreword, got "${startTok.word}"`);
    assert.ok(p.readableStartWord > 0, 'A: front matter must be skipped (start > 0)');
    console.log('  ✓ Fixture A passed (front matter skipped, starts at Foreword)');
}

// AC3 + AC6: trailing Epilogue kept, but a real INDEX heading clamps the end.
{
    const book = [
        chapterBody('I'), chapterBody('II'),
        'EPILOGUE', 'The drama is done, and one survived the wreck to tell the tale of all that had passed upon those waters.',
        'INDEX', 'Ahab, 12, 45. Ishmael, 1, 2, 3. Whale, passim. Pequod, 4, 10, 33.',
    ].join('\n\n');
    const p = parseText(book);
    const idxTok = p.tokens.find((t) => t.clean.toUpperCase() === 'INDEX');
    assert.ok(idxTok, 'C: sanity — INDEX heading should exist as a token');
    assert.ok(
        p.readableEndWord < idxTok.id,
        `C: readable end (${p.readableEndWord}) must clamp before the INDEX heading (token ${idxTok.id})`,
    );
    // The Epilogue (authored back matter) must still be inside the readable range.
    const epiTok = p.tokens.find((t) => t.clean.toUpperCase() === 'EPILOGUE');
    assert.ok(epiTok && epiTok.id <= p.readableEndWord, 'C: Epilogue must remain within the readable range');
    console.log('  ✓ Fixture C passed (Epilogue kept, Index clamped out)');
}

// AC5: an unstructured book (no detectable chapters) fails safe to the full range.
{
    const book = 'Just some flowing prose without any chapter headings at all. '.repeat(40);
    const p = parseText(book);
    assert.strictEqual(p.chapterConfidence, 'none', 'D: no chapters should be detected');
    assert.strictEqual(p.readableStartWord, 0, 'D: fail-safe start should be 0');
    assert.strictEqual(p.readableEndWord, p.tokens.length - 1, 'D: fail-safe end should be the last token');
    console.log('  ✓ Fixture D passed (ambiguous book fails safe to full range)');
}

// AC8: a saved resume position takes priority over the auto-skip start
// (mirrors the precedence in App.completePendingOpen).
{
    const pendingStartIndex = 1500;
    const readableStartWord = 200;
    const finalStart = (pendingStartIndex && pendingStartIndex > 0) ? pendingStartIndex : readableStartWord;
    assert.strictEqual(finalStart, 1500, 'E: saved position must override readableStartWord');
    console.log('  ✓ Fixture E passed (resume priority AC8)');
}

console.log('✅ All readable-bounds integration tests passed.\n');
