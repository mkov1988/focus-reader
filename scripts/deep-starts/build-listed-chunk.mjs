/**
 * Gather a finished chunk of the listed-book deep pass (wf-listed-deep.mjs)
 * into one results file in the shape scripts/merge-deep-pass.mjs takes.
 *
 *   node scripts/deep-starts/build-listed-chunk.mjs            every composed book not merged yet
 *   node scripts/deep-starts/build-listed-chunk.mjs --ids 5197,10007
 *
 * Takes only books whose result passes check-deep.mjs (every anchor a
 * verbatim run of words of the served text, in reading order). For each:
 *  - a story (or a book that is not a story and has no chapters of its own):
 *    its composed parts go through as scenes, with its cast and pacing;
 *  - a book that is not a story and has its own chapters: those chapters
 *    become its parts. Each part's anchor is cut from the text at the
 *    chapter's first word (lengthened until those words occur nowhere
 *    earlier), its label is the chapter's own heading, and the editor's
 *    plain line goes along as its `note`. No cast;
 *  - a pure reference work with no chapters the page can show gets no parts;
 *  - the pace (1 Slow burn to 5 Gripping) is written to levels.json;
 *  - listed-deep.json records what each book got (a story or not, authored
 *    parts or its own chapters), which is also how the next chunk knows the
 *    book is done.
 *
 * Writes scripts/deep-starts/deep-pass-results/listed-NNN.json and prints
 * its path. Then: node scripts/merge-deep-pass.mjs <that file>,
 * npm run build:scenes, npm run export:native.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../build-story-starts.mjs';
import { anchorFinder } from '../lib/anchor-finder.mjs';
import { bookProblems, loadPlan } from './check-deep.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const WORK = path.join(DIR, 'deep-work');
const RESULTS = path.join(DIR, 'deep-pass-results');
const LEDGER = path.join(DIR, 'listed-deep.json');
const LEVELS = path.join(DIR, 'levels.json');
const args = process.argv.slice(2);
const only = args.includes('--ids') ? new Set(args[args.indexOf('--ids') + 1].split(',').map((s) => s.trim())) : null;
const clean = (s) => String(s ?? '').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
const src = JSON.parse(readFileSync(path.join(ROOT, 'data-src', 'scenes-src.json'), 'utf8'));
const levels = JSON.parse(readFileSync(LEVELS, 'utf8'));
const chunkNo = 1 + Math.max(0, ...readdirSync(RESULTS).map((f) => Number(/^listed-(\d+)\.json$/.exec(f)?.[1] ?? 0)));

/** A chapter's anchor: the words of the text from its first word on, as
 *  many as it takes for them to occur nowhere earlier. Null if 60 words do
 *  not do it, or the text there is not the heading the parser reported. */
function chapterAnchor(tokens, find, lines, chapter) {
    const first = norm((lines[chapter.line - 1] ?? '').trim().split(/\s+/)[0] ?? '');
    if (!first || norm(tokens[chapter.startIndex] ?? '') !== first) return null;
    for (let k = 10; k <= 60; k += 5) {
        const anchor = tokens.slice(chapter.startIndex, chapter.startIndex + k).join(' ');
        if (find(anchor) === chapter.startIndex) return anchor;
    }
    return null;
}

const books = [];
const skipped = [];
for (const id of existsSync(WORK) ? readdirSync(WORK) : []) {
    if (only ? !only.has(id) : Boolean(ledger[id] || src[id])) continue;
    if (!existsSync(path.join(WORK, id, 'result.json'))) continue;
    const problems = bookProblems(id);
    if (problems.length) { skipped.push(`#${id}: ${problems[0]}`); continue; }
    const plan = loadPlan(id);
    const r = JSON.parse(readFileSync(path.join(WORK, id, 'result.json'), 'utf8'));
    const d = r.details ?? {};
    const keepsChapters = r.nonNarrative && plan.chapters !== null;
    const bare = plan.reference === true && plan.chapters === null;
    let scenes;
    if (bare) scenes = [];
    else if (keepsChapters) {
        const text = readFileSync(path.join(ROOT, plan.file), 'utf8').replace(/\r\n?/g, '\n');
        const tokens = tokenize(text);
        const lines = text.split('\n');
        const notes = new Map((r.chapterNotes ?? []).map((c) => [c.n, clean(c.note)]));
        const find = anchorFinder(tokens);
        scenes = plan.chapters.map((c) => ({ anchor: chapterAnchor(tokens, find, lines, c), label: clean(c.heading), recap: '', ...(notes.get(c.n) ? { note: notes.get(c.n) } : {}) }));
        if (scenes.some((s) => !s.anchor)) { skipped.push(`#${id}: a chapter's first words could not be pinned in the text`); continue; }
    } else {
        scenes = r.scenes.map((s) => ({ anchor: clean(s.anchor), label: clean(s.label), recap: clean(s.recap) }));
    }
    const paced = Number.isInteger(r.pace) && typeof d.pacing === 'string' && d.pacing.trim();
    books.push({
        id,
        // merge-deep-pass.mjs skips a book flagged nonNarrative outright. A
        // listed book that is not a story still gets parts and pacing, so
        // the flag stays false here and the fact lives in listed-deep.json.
        nonNarrative: false,
        ...(plan.meta ? {} : { hook: clean(r.hook), voice: r.voice, era: clean(r.era), tags: r.tags }),
        scenes,
        details: {
            cast: r.nonNarrative ? [] : (d.cast ?? []).slice(0, 6).map(clean),
            ...(paced ? { pacing: clean(d.pacing) } : {}),
            contentNotes: (d.contentNotes ?? []).map(clean).filter(Boolean),
            themes: (d.themes ?? []).map(clean).filter(Boolean),
        },
        snipShort: null,
        snipStory: null,
    });
    ledger[id] = { story: !r.nonNarrative, parts: bare ? 'none' : keepsChapters ? 'chapters' : 'authored', chunk: chunkNo };
    if (paced) levels[id] = { ...(levels[id] ?? {}), pace: r.pace };
}

if (!books.length) { console.log(`nothing to gather (${skipped.length} skipped)`); for (const s of skipped.slice(0, 20)) console.log('  ' + s); process.exit(skipped.length ? 1 : 0); }
const out = path.join(RESULTS, `listed-${String(chunkNo).padStart(3, '0')}.json`);
writeFileSync(out, JSON.stringify({ books }, null, 1));
writeFileSync(LEDGER, '{\n' + Object.keys(ledger).sort((a, b) => Number(a) - Number(b)).map((k) => `${JSON.stringify(k)}:${JSON.stringify(ledger[k])}`).join(',\n') + '\n}\n');
const keys = Object.keys(levels).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
writeFileSync(LEVELS, '{\n' + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(levels[k])}`).join(',\n') + '\n}\n');
const stories = books.filter((b) => ledger[b.id].story).length;
console.log(`${path.relative(ROOT, out)}: ${books.length} books (${stories} stories, ${books.length - stories} not stories, ${books.filter((b) => ledger[b.id].parts === 'chapters').length} keeping their own chapters); ${skipped.length} skipped`);
for (const s of skipped.slice(0, 20)) console.log('  ' + s);
