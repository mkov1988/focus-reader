/**
 * The script checks of the listed-book deep pass (wf-listed-deep.mjs). An
 * agent runs these on its own work and puts right what they print; the chunk
 * builder (build-listed-chunk.mjs) runs them again and takes only what
 * passes.
 *
 *   node scripts/deep-starts/check-deep.mjs notes <id> <segment>   a reader's notes for one segment
 *   node scripts/deep-starts/check-deep.mjs book <id>              the composed result for a book
 *
 * The rule that matters most: every anchor is a verbatim run of words of
 * the served text (public/books/<id>.txt), found by the same matcher
 * build-scenes.mjs uses, at the place it claims: inside the reader's own
 * segment, and in reading order in the composed book. The rest keeps the
 * fields to the shape the pickup page prints (docs/reader-feel-playbook.md):
 * short titles, one line recaps, six cast lines, a pace from 1 to 5, and
 * never the word "Gutenberg" (LEGAL.md).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, resolveAnchor } from '../build-story-starts.mjs';
import { VOICES, TAGS } from './check-lean.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const WORK = path.join(DIR, 'deep-work');
const count = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const isText = (s) => typeof s === 'string' && s.trim().length > 0;
const pad = (n) => String(n).padStart(2, '0');
const BANNED = /gutenberg/i;

export function loadPlan(id) {
    return JSON.parse(readFileSync(path.join(WORK, String(id), 'plan.json'), 'utf8'));
}
function bookLines(plan) {
    return readFileSync(path.join(ROOT, plan.file), 'utf8').replace(/\r\n?/g, '\n').split('\n');
}
/** Token index at which line `line` (1 based) begins. Segments are cut at
 *  blank lines, so a count of the lines before it is exact. */
const tokensBefore = (lines, line) => tokenize(lines.slice(0, line - 1).join('\n')).length;

function beatProblems(beat, where, tokens, lo, hi, prev) {
    const out = [];
    if (!isText(beat?.anchor)) return { out: [`${where}: anchor is missing`], at: prev };
    const n = count(beat.anchor);
    if (n < 8 || n > 14) out.push(`${where}: anchor is ${n} words, need 8 to 14`);
    const at = resolveAnchor(tokens, beat.anchor);
    if (at < 0) out.push(`${where}: anchor "${beat.anchor.slice(0, 50)}" is not in the text word for word. Read that place again and copy the words exactly`);
    else if (at < lo) out.push(`${where}: the words "${beat.anchor.slice(0, 50)}" first occur earlier in the book than this segment. Use the next words of the same sentence, or another sentence`);
    else if (at >= hi) out.push(`${where}: anchor "${beat.anchor.slice(0, 50)}" lies after this segment`);
    else if (at <= prev) out.push(`${where}: out of order: it comes before the one above it in the text`);
    if (!isText(beat.label)) out.push(`${where}: label is missing`);
    else if (count(beat.label) > 6) out.push(`${where}: label is ${count(beat.label)} words, at most 6`);
    if (typeof beat.recap !== 'string') out.push(`${where}: recap is missing`);
    else if (count(beat.recap) > 30) out.push(`${where}: recap is ${count(beat.recap)} words, at most 30`);
    return { out, at: at >= lo && at < hi && at > prev ? at : prev };
}

/** Everything wrong with a reader's notes for one segment. */
export function notesProblems(id, segNo) {
    const plan = loadPlan(id);
    const seg = plan.segments.find((s) => s.n === Number(segNo));
    if (!seg) return [`segment ${segNo} is not in the plan`];
    const file = path.join(WORK, String(id), `notes-${pad(seg.n)}.json`);
    if (!existsSync(file)) return [`no notes file at scripts/deep-starts/deep-work/${id}/notes-${pad(seg.n)}.json`];
    let notes;
    try { notes = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return [`the notes file is not valid JSON: ${e.message}`]; }
    const out = [];
    if (notes.kind !== 'story' && notes.kind !== 'not-story') out.push('kind must be "story" or "not-story"');
    if (!isText(notes.summary) || count(notes.summary) < 20) out.push('summary: 3 to 6 sentences on what this segment holds');
    const lines = bookLines(plan);
    const tokens = tokenize(lines.join('\n'));
    const lo = tokensBefore(lines, seg.from);
    const hi = tokensBefore(lines, seg.to + 1);
    if (!Array.isArray(notes.beats) || notes.beats.length < 2 || notes.beats.length > 8) out.push('beats: 3 to 6 of them');
    else {
        let prev = lo - 1;
        const at = [];
        notes.beats.forEach((b, i) => {
            const r = beatProblems(b, `beat ${i + 1}`, tokens, lo, hi, prev);
            out.push(...r.out);
            if (r.at > prev) at.push(r.at);
            prev = r.at;
        });
        // A book of one segment: spread over the whole of it. The editor
        // can only build the book's parts from these, and a book whose last
        // beat sits in its first half has no part for its second. (A longer
        // book is covered by its other segments' beats.)
        if (plan.segments.length === 1 && at.length === notes.beats.length && hi > lo) {
            const pos = (t) => (t - lo) / (hi - lo);
            if (pos(at[0]) > 0.35) out.push('beats: the first beat must be near the start of the segment (it begins more than a third of the way in). Add a beat near the start');
            if (pos(at[at.length - 1]) < 0.6) out.push('beats: the beats stop too early. The last beat must begin in the last 40% of the segment. Read the later part again and add a beat there');
            for (let i = 1; i < at.length; i += 1) {
                if (pos(at[i]) - pos(at[i - 1]) > 0.45) out.push(`beats: almost half the segment lies between beat ${i} and beat ${i + 1}. Add a beat between them`);
            }
        }
    }
    if (!Array.isArray(notes.cast) || notes.cast.length > 8 || notes.cast.some((c) => !isText(c))) out.push('cast: up to 8 lines of text ([] when there are no people)');
    if (!isText(notes.pacing)) out.push('pacing: one sentence on how this stretch reads');
    if (!(Number.isInteger(notes.pace) && notes.pace >= 1 && notes.pace <= 5)) out.push('pace: a whole number from 1 to 5');
    const listed = new Set(seg.chapters.map((c) => c.n));
    if (!Array.isArray(notes.chapterNotes)) out.push('chapterNotes: a list ([] when none)');
    else {
        for (const c of notes.chapterNotes) {
            if (!listed.has(c?.n)) out.push(`chapterNotes: chapter ${c?.n} is not one of this segment's chapters`);
            else if (!isText(c.note) || count(c.note) > 24) out.push(`chapterNotes: chapter ${c.n} needs one plain line of at most 24 words`);
        }
    }
    if (BANNED.test(JSON.stringify([notes.beats, notes.cast, notes.pacing, notes.chapterNotes]))) out.push('the word "Gutenberg" may not appear in labels, recaps, cast, pacing or chapter notes');
    return out;
}

/** Everything wrong with a composed book. */
export function bookProblems(id) {
    const plan = loadPlan(id);
    const file = path.join(WORK, String(id), 'result.json');
    if (!existsSync(file)) return [`no result file at scripts/deep-starts/deep-work/${id}/result.json`];
    let r;
    try { r = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return [`the result file is not valid JSON: ${e.message}`]; }
    const out = [];
    if (String(r.id) !== String(id)) out.push(`id must be "${id}"`);
    if (typeof r.nonNarrative !== 'boolean') out.push('nonNarrative must be true (not a story) or false (a story)');
    const scenes = Array.isArray(r.scenes) ? r.scenes : null;
    if (!scenes) out.push('scenes must be a list ([] for a book that keeps its own chapters)');
    const d = r.details ?? {};
    const keepsChapters = r.nonNarrative === true && plan.chapters !== null;
    // A pure reference work with no chapters the page can show has no parts.
    const bare = plan.reference === true && plan.chapters === null;
    if (plan.reference === true && r.nonNarrative !== true) out.push('this book is a reference work: nonNarrative must be true');
    if (scenes && bare) {
        if (scenes.length) out.push('this reference work has no chapters of its own: scenes must be []');
        if (Array.isArray(r.chapterNotes) && r.chapterNotes.length) out.push('chapterNotes must be [] (plan.json lists no chapters)');
    } else if (scenes && keepsChapters) {
        if (scenes.length) out.push('this book is not a story and has its own chapters: scenes must be [] (its chapters are its parts)');
        const known = new Set(plan.chapters.map((c) => c.n));
        if (!Array.isArray(r.chapterNotes)) out.push('chapterNotes must be a list');
        else {
            const seen = new Set();
            for (const c of r.chapterNotes) {
                if (!known.has(c?.n)) out.push(`chapterNotes: there is no chapter ${c?.n} in plan.json`);
                else if (seen.has(c.n)) out.push(`chapterNotes: chapter ${c.n} is there twice`);
                else if (!isText(c.note) || count(c.note) > 24) out.push(`chapterNotes: chapter ${c.n} needs one plain line of at most 24 words`);
                seen.add(c?.n);
            }
        }
    } else if (scenes) {
        const tokens = tokenize(bookLines(plan).join('\n'));
        const big = plan.segments.length >= 2 || plan.words >= 30000;
        const min = r.nonNarrative ? 3 : big ? 6 : 3;
        if (scenes.length < min || scenes.length > 12) out.push(`scenes: ${scenes.length} of them, need ${min} to 12`);
        let prev = -1;
        const starts = [];
        scenes.forEach((s, i) => {
            const res = beatProblems(s, `scene ${i + 1}`, tokens, 0, tokens.length, prev);
            out.push(...res.out.map((p) => p.replace('than this segment', 'than the place you mean').replace('lies after this segment', 'is not in the text')));
            if (res.at > prev) starts.push(res.at);
            prev = res.at;
            if (!isText(s.recap)) out.push(`scene ${i + 1}: recap is missing`);
        });
        if (starts.length === scenes.length && scenes.length >= min) {
            const total = tokens.length;
            if (starts[0] > 0.15 * total) out.push('scenes: the first part must begin where the book begins (it starts more than 15% in)');
            if (big && starts[starts.length - 1] < 0.55 * total) out.push('scenes: the parts stop too early: the last one must begin in the later part of the book (past 55%)');
            for (let i = 1; i < starts.length; i += 1) {
                if (big && starts[i] - starts[i - 1] > 0.4 * total) out.push(`scenes: more than 40% of the book lies between part ${i} and part ${i + 1}: add a part between them`);
            }
        }
    }
    if (!Array.isArray(d.cast) || d.cast.some((c) => !isText(c))) out.push('details.cast must be a list of lines');
    else if (d.cast.length > 6) out.push(`details.cast: ${d.cast.length} lines, at most 6`);
    else if (r.nonNarrative && d.cast.length) out.push('details.cast must be [] for a book that is not a story');
    if (typeof d.pacing !== 'string') out.push('details.pacing must be a sentence ("" only for a book that is not a story and has no pace to speak of)');
    else if (count(d.pacing) > 40) out.push(`details.pacing: ${count(d.pacing)} words, at most 40`);
    else if (!r.nonNarrative && !isText(d.pacing)) out.push('details.pacing: a story needs its pacing sentence');
    const paced = Number.isInteger(r.pace) && r.pace >= 1 && r.pace <= 5;
    if (!paced && !(r.nonNarrative && r.pace === null)) out.push('pace: a whole number from 1 to 5 (null only for a book that is not a story and has no pace to speak of)');
    if (paced !== isText(d.pacing)) out.push('pace and details.pacing go together: give both or neither');
    if (!plan.meta) {
        if (!isText(r.hook) || count(r.hook) > 25) out.push('hook: one sentence of at most 25 words');
        if (!VOICES.includes(r.voice)) out.push(`voice: one of ${VOICES.join(', ')}`);
        if (typeof r.era !== 'string' || count(r.era) > 6) out.push('era: 6 words or fewer ("" if unclear)');
        if (!Array.isArray(r.tags) || r.tags.length < 2 || r.tags.length > 4 || r.tags.some((t) => !TAGS.includes(t))) out.push(`tags: 2 to 4 from ${TAGS.join(', ')}`);
    }
    if (BANNED.test(JSON.stringify([r.scenes, d.cast, d.pacing, r.chapterNotes, r.hook, r.era]))) out.push('the word "Gutenberg" may not appear anywhere in the result');
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [what, id, seg] = process.argv.slice(2);
    if (!((what === 'notes' && id && seg) || (what === 'book' && id))) {
        console.error('usage: node scripts/deep-starts/check-deep.mjs notes <id> <segment> | book <id>');
        process.exit(2);
    }
    const problems = what === 'notes' ? notesProblems(id, seg) : bookProblems(id);
    for (const p of problems) console.log('  ' + p);
    console.log(problems.length ? `${problems.length} problem${problems.length === 1 ? '' : 's'}: fix and run again` : 'PASS');
    process.exit(problems.length ? 1 : 0);
}
