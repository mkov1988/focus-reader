/**
 * Plan the next chunk of the listed-book deep pass (wf-listed-deep.mjs): the
 * listed books that still have no authored parts, most downloaded first,
 * then the vibe shelf books.
 *
 *   node scripts/deep-starts/deep-queue.mjs --count 50     plan the next 50
 *   node scripts/deep-starts/deep-queue.mjs --ids 5197,100 plan these books
 *   node scripts/deep-starts/deep-queue.mjs --left         only say how many are left
 *   node scripts/deep-starts/deep-queue.mjs --requeue      put back the planned books a finished chunk left without a result
 *
 * A whole book does not fit in one reader's head, so each is cut into
 * segments of about SEGMENT_BYTES at paragraph breaks. One reader takes each
 * segment (by line numbers of public/books/<id>.txt, which the Read tool
 * shows), and one composer per book works from the readers' notes.
 *
 * Writes scripts/deep-starts/deep-work/<id>/plan.json:
 *   { id, title, author, file, lines, words, meta, chapters, segments }
 * `chapters` are the book's own chapters as the pickup page would show them
 * (the Android repo's partStarts rule, copied in measure-levels.mjs), each
 * with its heading, line and word index; null when the page shows none.
 * Each segment lists the chapters that start inside it, the reader's copy
 * of it (deep-work/<id>/seg-NN.txt) and the Read calls that cover it.
 * Prints the chunk as JSON for the workflow's args: [{ id, segments: n }]
 * (a pure reference work: { id, segments: 0, reference: true }).
 * Needs public/books/ (node scripts/fetch-data-plane.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listedBooks } from './listed-books.mjs';
import { partStarts } from './measure-levels.mjs';
import { loadTextProcessing } from '../lib/load-ts.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const WORK = path.join(DIR, 'deep-work');
const SEGMENT_BYTES = 240 * 1024;
/** One Read call's worth of a segment. */
const READ_BYTES = 56 * 1024;
/** A line longer than this is folded in the reader's copy. */
const MAX_LINE = 600;
/** A last segment smaller than this joins the one before it. */
const MIN_TAIL_BYTES = 60 * 1024;

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const src = JSON.parse(readFileSync(path.join(ROOT, 'data-src', 'scenes-src.json'), 'utf8'));
const meta = JSON.parse(readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
// Pure reference works (dictionaries, almanacs, rolls: the opening-pages
// pass's `narrative: false`, with three misjudged books taken out by hand).
// Nobody reads one through, and neither does this pass: one agent looks at
// its opening and the head of each chapter (wf-listed-deep.mjs).
const reference = new Set(JSON.parse(readFileSync(path.join(DIR, 'listed-reference.json'), 'utf8')));
const ledger = existsSync(path.join(DIR, 'listed-deep.json')) ? JSON.parse(readFileSync(path.join(DIR, 'listed-deep.json'), 'utf8')) : {};
const all = listedBooks();
const hasText = (b) => existsSync(path.join(ROOT, 'public', 'books', `${b.id}.txt`));
// Left to do: no authored parts, not in the ledger of this pass.
const left = all.filter((b) => !src[b.id] && !ledger[b.id] && hasText(b));
// Left to read: of those, the ones with no composed result waiting to be
// gathered (build-listed-chunk.mjs).
// gathered (build-listed-chunk.mjs) and that are not out with a reader now
// (a `queued` marker, written when a book is planned and cleared by
// --requeue for the books a finished chunk left without a result).
const unread = left.filter((b) => !existsSync(path.join(WORK, b.id, 'result.json')) && !existsSync(path.join(WORK, b.id, 'queued')));
if (args.includes('--requeue')) {
    let n = 0;
    for (const b of left) {
        const dir = path.join(WORK, b.id);
        if (existsSync(path.join(dir, 'queued')) && !existsSync(path.join(dir, 'result.json'))) { rmSync(path.join(dir, 'queued')); n += 1; }
    }
    console.log(`${n} planned books had no result and are back in the queue`);
    process.exit(0);
}
if (args.includes('--left')) { console.log(`${left.length} listed books still have no authored parts`); process.exit(0); }
const wanted = opt('--ids') ? opt('--ids').split(',').map((id) => all.find((b) => b.id === id.trim())).filter(Boolean) : unread.slice(0, Number(opt('--count') ?? 50));

const tp = loadTextProcessing();
const chunk = [];
for (const book of wanted) {
    const rel = `public/books/${book.id}.txt`;
    const text = readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    const parsed = tp.parseText(text);
    // The book's own chapters, as the pickup page would show them.
    let chapters = null;
    if (parsed.chapterConfidence === 'high') {
        const keep = new Set(partStarts(parsed.chapters.map((c) => c.wordIndex), parsed.readableStartWord, parsed.readableEndWord));
        const kept = parsed.chapters.filter((c) => keep.has(c.wordIndex));
        if (kept.length) chapters = kept.map((c, i) => ({ n: i + 1, heading: c.title, line: c.lineIndex + 1, startIndex: c.wordIndex }));
    }
    // Segments: about SEGMENT_BYTES each, cut at a blank line.
    const segments = [];
    let from = 1;
    let bytes = 0;
    for (let i = 0; i < lines.length; i += 1) {
        bytes += Buffer.byteLength(lines[i]) + 1;
        if (bytes >= SEGMENT_BYTES && lines[i].trim() === '') {
            segments.push({ from, to: i + 1, bytes });
            from = i + 2;
            bytes = 0;
        }
    }
    const isReference = reference.has(book.id);
    if (from <= lines.length) {
        if (segments.length && bytes < MIN_TAIL_BYTES) {
            segments[segments.length - 1].to = lines.length;
            segments[segments.length - 1].bytes += bytes;
        } else segments.push({ from, to: lines.length, bytes });
    }
    mkdirSync(path.join(WORK, book.id), { recursive: true });
    // A reference work is not read through: only its opening is laid out.
    if (isReference) segments.length = 1;
    segments.forEach((s, i) => {
        s.n = i + 1;
        s.chapters = (chapters ?? []).filter((c) => c.line >= s.from && c.line <= s.to).map(({ n, heading }) => ({ n, heading }));
        // The segment as a file of its own for the reader. A line too long
        // for the Read tool is folded at spaces (the words do not change),
        // and the reads are sized so none is refused for length.
        const out = [];
        for (const line of lines.slice(s.from - 1, s.to)) {
            if (line.length <= MAX_LINE) { out.push(line); continue; }
            let rest = line;
            while (rest.length > MAX_LINE) {
                let cut = rest.lastIndexOf(' ', MAX_LINE);
                if (cut <= 0) cut = MAX_LINE;
                out.push(rest.slice(0, cut));
                rest = rest.slice(cut + 1);
            }
            out.push(rest);
        }
        s.file = `scripts/deep-starts/deep-work/${book.id}/seg-${String(s.n).padStart(2, '0')}.txt`;
        writeFileSync(path.join(ROOT, s.file), out.join('\n'));
        s.reads = [];
        let offset = 1;
        let size = 0;
        for (let j = 0; j < out.length; j += 1) {
            size += Buffer.byteLength(out[j]) + 1;
            if (size >= READ_BYTES || j === out.length - 1) {
                s.reads.push({ offset, limit: j + 2 - offset });
                offset = j + 2;
                size = 0;
            }
        }
    });
    const plan = {
        id: book.id, title: book.title, author: book.author, file: rel, lines: lines.length,
        words: Math.max(0, parsed.readableEndWord - parsed.readableStartWord), meta: meta[book.id] ?? null, reference: isReference, chapters, segments,
    };
    writeFileSync(path.join(WORK, book.id, 'plan.json'), JSON.stringify(plan, null, 1));
    // Each reader's own brief: the one small file it needs.
    for (const s of segments) {
        writeFileSync(path.join(WORK, book.id, `seg-${String(s.n).padStart(2, '0')}.json`), JSON.stringify({
            id: book.id, title: book.title, author: book.author, segment: s.n, of: segments.length, file: s.file, reads: s.reads, chapters: s.chapters,
        }, null, 1));
    }
    writeFileSync(path.join(WORK, book.id, 'queued'), '');
    chunk.push(isReference ? { id: book.id, segments: 0, reference: true } : { id: book.id, segments: segments.length });
}
console.error(`planned ${chunk.length} books, ${chunk.reduce((n, b) => n + b.segments, 0)} segments; ${left.length} listed books had no authored parts before this chunk`);
console.log(JSON.stringify(chunk));
