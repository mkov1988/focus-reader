/**
 * Build a per-book "story starts here" index for every mirrored book.
 *
 * Even after the Gutenberg boilerplate strip, a mirrored book opens with a wall
 * of front matter: [Illustration] tags, the title page, author/publisher lines,
 * a dedication, and a full Contents / table-of-contents block — sometimes a
 * translator's preface too. The reader should open on the first real narrative
 * words, not that wall.
 *
 * This resolves, for each book, the token index (in the SAME id space the reader
 * uses — see parseText) where the story actually begins, and writes
 * src/data/story-starts.json = { [id]: startIndex }. The reader seeks there on a
 * fresh open (App.tsx), replacing the heuristic readableStartWord which falls
 * back to 0 whenever chapter detection fails.
 *
 * Two tiers:
 *   - "high": the book has real, detectable chapter structure (>= 3 headings in
 *     one dialect). Story start = the first body heading that is not front matter
 *     (contents / title page / copyright / preface / foreword / introduction /
 *     dedication). A Prologue counts as story.
 *   - "prose": no reliable chapter structure. Story start = the first substantial
 *     narrative prose paragraph after the front-matter block.
 *   - "none": couldn't find anything convincing (start 0, flagged for review).
 *
 * Tokenization and heading dialects mirror src/utils/chapterDetection.ts and
 * parseText so a start index lines up with rsvp.currentIndex / TextToken.id.
 * Run `npm run mirror:books` first (reads public/books/<id>.txt).
 *
 *   node scripts/build-story-starts.mjs            # build + report
 *   node scripts/build-story-starts.mjs --report   # write full triage report, no write to src
 *   node scripts/build-story-starts.mjs --id 11    # inspect one book
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_DIR = path.join(ROOT, 'public', 'books');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'story-starts.json');
const SCENES_PATH = path.join(ROOT, 'src', 'data', 'scenes.json');
const OVERRIDES_PATH = path.join(ROOT, 'scripts', 'story-starts-overrides.json');
const REPORT_PATH = path.join(ROOT, 'scripts', '.story-starts-report.json');

const args = process.argv.slice(2);
const ONLY_ID = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const REPORT_ONLY = args.includes('--report');

// ── Tokenization (must match parseText's token id space) ─────────────────────
// parseText collapses blank-line runs to a [P] marker that is NOT added to the
// token array, then whitespace-splits. So the id space excludes [P].
function tokenize(raw) {
    const marked = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, ' [P] ');
    return marked.trim().split(/\s+/).filter((w) => w !== '[P]');
}

// ── Anchor resolution (for authored/agent-verified overrides) ────────────────
// A separator-free normalized substring find, identical to build-scenes.mjs: a
// distinctive prose phrase resolves to the token index of its first word, so
// hyphens/apostrophes/curly quotes/line breaks never break the match.
const normA = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
function resolveAnchor(words, anchor) {
    let joined = '';
    const charToTok = [];
    for (let i = 0; i < words.length; i++) {
        const p = normA(words[i]);
        for (const ch of p) { joined += ch; charToTok.push(i); }
    }
    const needle = normA(anchor);
    if (!needle) return -1;
    const pos = joined.indexOf(needle);
    return pos >= 0 ? charToTok[pos] : -1;
}

// ── Heading detection (mirrors chapterDetection.ts) ──────────────────────────
const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
function romanToInt(s) {
    const r = s.toLowerCase();
    let total = 0;
    for (let i = 0; i < r.length; i++) {
        const cur = ROMAN_VALUES[r[i]] ?? 0;
        const next = ROMAN_VALUES[r[i + 1]] ?? 0;
        total += cur < next ? -cur : cur;
    }
    return total;
}
const numKey = (raw) => (/^[0-9]+$/.test(raw) ? String(parseInt(raw, 10)) : String(romanToInt(raw)));

const KEYWORD_RE =
    /^(chapter|chap|book|part|letter|canto|stave|volume|section)\.?\s+(?:no\.?\s*)?([0-9]{1,3}|[ivxlcdm]+)[.):\]]*(?:\s+(.+))?$/i;
const STANDALONE_KEYWORD_RE = /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion)\.?(?:\s+(.+))?$/i;
const ROMAN_TITLE_RE = /^([IVXLCDM]+)\.\s+([A-Z][^a-z]*[A-Za-z].*)$/;
const BARE_ROMAN_RE = /^([IVXLCDM]+)\.?$/;
const BARE_NUMERIC_RE = /^(\d{1,3})\.?$/;
const MIN_CHAPTERS = 3;

function isHeadingTitleOk(rest) {
    if (!rest) return true;
    const r = rest.trim();
    if (r.length > 60) return false;
    return /^[A-Z0-9"'(\[“‘]/.test(r);
}
function titleCase(s) {
    return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
function cleanTitleStr(raw) {
    return raw.replace(/\s+/g, ' ').replace(/[.\]\s]+$/, '').trim();
}

/** Per-line token offsets in the [P]-excluded id space (mirrors buildLineOffsets). */
function buildLineOffsets(lines) {
    const offsets = [];
    let cumulative = 0;
    for (const line of lines) {
        offsets.push(cumulative);
        const trimmed = line.trim();
        if (trimmed) cumulative += trimmed.split(/\s+/).length;
    }
    return offsets;
}

function collect(lines, offsets, matcher, dialect) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        const m = matcher(trimmed);
        if (m) out.push({ lineIndex: i, wordIndex: offsets[i], title: m.title, key: m.key, kind: m.kind, dialect });
    }
    return out;
}
function dedupeKeepLast(candidates) {
    const byKey = new Map();
    for (const c of candidates) byKey.set(c.key, c);
    return [...byKey.values()].sort((a, b) => a.wordIndex - b.wordIndex);
}

const CHAPTER_MIN = 120;  // a real chapter body is at least this many tokens of prose

/** Normalize a heading for TOC-vs-body matching: drop dot leaders, trailing page
 *  numbers, and punctuation so "I. THE OLD SEA-DOG … . . . 11" == the body copy. */
function normHeading(title) {
    return title
        .toLowerCase()
        .replace(/[.\s]*\d+\s*$/, '')     // trailing page number + dot leaders
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** First candidate at or after `from` that isn't a front-matter title. */
function firstNonFront(cands, from) {
    for (let j = from; j < cands.length; j++) if (!isFrontHeading(cands[j])) return j;
    return from;
}

/**
 * Resolve the first BODY heading (the real chapter 1) from the winning dialect's
 * raw candidates (sorted by wordIndex). Returns { index, toc } where `toc` flags
 * that the result is likely still a table-of-contents line (low confidence).
 *
 * Handles the three real shapes seen in Project Gutenberg texts:
 *   - No TOC (headings appear once, in body order — incl. chapter numbers that
 *     restart each Book/Part like Crime & Punishment): the story starts at the
 *     first heading. Restart echoes must NOT be treated as a TOC.
 *   - TOC + body sharing a dialect: the body copy is the first key echo that is
 *     past the TOC cluster and followed by a chapter-sized run of prose.
 *   - TOC in one numbering style, body in another (Treasure Island roman TOC /
 *     arabic body): the winning dialect is TOC-only — nothing real follows the
 *     cluster, so we flag it `toc` for an agent read.
 */
function firstBodyHeading(cands, total) {
    if (!cands.length) return null;
    const gap = (i) => (i < cands.length - 1 ? cands[i + 1].wordIndex - cands[i].wordIndex : total - cands[i].wordIndex);

    // A TOC shows up as the first three headings packed a few tokens apart. Without
    // one, the headings are already in body order (including chapter numbers that
    // restart each Book/Part, e.g. Crime & Punishment) → the story starts at the
    // first heading. This is what keeps restart-numbering out of the echo logic.
    const hasTOC = cands.length >= 3 && gap(0) < CHAPTER_MIN && gap(1) < CHAPTER_MIN;
    if (!hasTOC) return { index: firstNonFront(cands, 0), toc: false };

    // TOC present: the body copy of chapter 1 is the first key echo that is
    // followed by a chapter-sized run of prose. Matching on the number key (not
    // the title) survives bare body headings ("CHAPTER I.") whose TOC line carried
    // a title; the prose-gap test skips TOC-internal echoes in restart books.
    const seen = new Set();
    let firstRepeat = -1;
    for (let i = 0; i < cands.length; i++) {
        const k = cands[i].key;
        if (!k) continue;
        if (seen.has(k)) {
            if (firstRepeat === -1) firstRepeat = i;
            if (gap(i) >= CHAPTER_MIN) return { index: firstNonFront(cands, i), toc: false };
        } else {
            seen.add(k);
        }
    }

    // A TOC exists but no body echo cleared the bar → the winning dialect is
    // TOC-only (the body numbers differently, e.g. Treasure Island's roman TOC /
    // arabic body). Best guess is a contents line — flag it for a read.
    return { index: firstNonFront(cands, firstRepeat === -1 ? 0 : firstRepeat), toc: true };
}

function detectDialect(lines, offsets) {
    const keyword = collect(lines, offsets, (t) => {
        const m = t.match(KEYWORD_RE);
        if (m && isHeadingTitleOk(m[3])) {
            const kind = m[1].toLowerCase().replace(/\.$/, '');
            const label = `${titleCase(kind)} ${m[2].toUpperCase()}`;
            const rest = cleanTitleStr(m[3] || '');
            return { title: rest ? `${label} — ${titleCase(rest)}` : label, key: `${kind}:${numKey(m[2])}`, kind };
        }
        const s = t.match(STANDALONE_KEYWORD_RE);
        if (s && isHeadingTitleOk(s[2])) {
            const rest = cleanTitleStr(s[2] || '');
            const name = titleCase(s[1]);
            return { title: rest ? `${name} — ${titleCase(rest)}` : name, key: s[1].toLowerCase(), kind: s[1].toLowerCase() };
        }
        return null;
    }, 'keyword');

    const romanTitle = collect(lines, offsets, (t) => {
        const m = t.match(ROMAN_TITLE_RE);
        return m ? { title: `${m[1]}. ${titleCase(m[2])}`, key: numKey(m[1]), kind: 'chapter' } : null;
    }, 'roman-title');

    const bareRoman = collect(lines, offsets, (t) => {
        const m = t.match(BARE_ROMAN_RE);
        return m ? { title: `Chapter ${m[1]}`, key: numKey(m[1]), kind: 'chapter' } : null;
    }, 'bare-roman');

    const bareNumeric = collect(lines, offsets, (t) => {
        const m = t.match(BARE_NUMERIC_RE);
        return m ? { title: `Chapter ${m[1]}`, key: numKey(m[1]), kind: 'chapter' } : null;
    }, 'bare-numeric');

    const ranked = [keyword, romanTitle, bareRoman, bareNumeric];
    for (const candidates of ranked) {
        const deduped = dedupeKeepLast(candidates);
        if (deduped.length >= MIN_CHAPTERS) {
            // Winner by deduped count, but return the RAW candidates (sorted by
            // position) so firstBodyHeading can tell the TOC echo from the body.
            const raw = [...candidates].sort((a, b) => a.wordIndex - b.wordIndex);
            return { candidates: raw, deduped, dialect: candidates[0].dialect };
        }
    }
    return null;
}

// Heading kinds/titles that are front matter, not the story.
const FRONT_KINDS = new Set(['preface', 'foreword', 'introduction', 'afterword', 'conclusion']);
const FRONT_TITLE_RE =
    /^(contents|table of contents|title page|copyright|dedication|list of|illustrations?|preface|foreword|introduction|editor'?s note|translator'?s|publisher'?s note|frontispiece)\b/i;

function isFrontHeading(c) {
    if (c.kind && FRONT_KINDS.has(c.kind)) return true;
    return FRONT_TITLE_RE.test(c.title.trim());
}

// ── Prose fallback (no reliable chapter structure) ───────────────────────────
// Rebuild paragraphs from the token stream (split on the collapsed [P] markers),
// then return the first paragraph that reads like narrative prose after the
// front-matter block: long enough, mostly lowercase (not a SHOUTING title/TOC
// line), and carrying sentence punctuation.
function proseStart(raw) {
    const marked = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, ' [P] ');
    const rawTokens = marked.trim().split(/\s+/);
    const paras = [];
    let cur = [];
    let idNoP = 0; // index in [P]-excluded space
    let start = 0;
    for (const w of rawTokens) {
        if (w === '[P]') {
            if (cur.length) { paras.push({ start, words: cur }); cur = []; }
            continue;
        }
        if (cur.length === 0) start = idNoP;
        cur.push(w);
        idNoP++;
    }
    if (cur.length) paras.push({ start, words: cur });

    const looksProse = (words) => {
        if (words.length < 35) return false;
        const text = words.join(' ');
        // Reject blocks dominated by ALL-CAPS tokens (title pages, TOC, running heads).
        const caps = words.filter((w) => /[A-Z]/.test(w) && w === w.toUpperCase() && w.length > 1).length;
        if (caps / words.length > 0.25) return false;
        // Reject image/asset leftovers and pure metadata.
        if (/\.(jpg|jpeg|png|gif)\b/i.test(text)) return false;
        // Needs at least a couple of sentence terminators to be real prose.
        const stops = (text.match(/[.!?]["'”’)]?(\s|$)/g) || []).length;
        if (stops < 2) return false;
        // A run of lowercase-started function words is a strong prose signal.
        const lower = words.filter((w) => /^[a-z]/.test(w)).length;
        return lower / words.length > 0.45;
    };

    for (const p of paras) {
        if (looksProse(p.words)) return p.start;
    }
    return null;
}

// ── Per-book resolution ──────────────────────────────────────────────────────
function resolveStart(raw) {
    const tokens = tokenize(raw);
    const total = tokens.length;
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const offsets = buildLineOffsets(lines);

    const det = detectDialect(lines, offsets);
    if (det) {
        const res = firstBodyHeading(det.candidates, total) || { index: 0, toc: false };
        const body = det.candidates[res.index];
        // Sanity: a real story start sits near the front. If the resolved heading
        // is deep in the book, the structure fooled us (restart numbering, stray
        // matches) — downgrade so it gets a read rather than being trusted.
        const deep = body.wordIndex > total * 0.4;
        // A real chapter 1 is followed by a chapter's worth of prose. If another
        // heading follows within a chapter length, we're likely still in a TOC or
        // a stack of Part/Chapter headings — send it for a read to be safe.
        const nextWi = res.index < det.candidates.length - 1 ? det.candidates[res.index + 1].wordIndex : total;
        const crowded = nextWi - body.wordIndex < CHAPTER_MIN;
        const low = deep || res.toc || crowded;
        return {
            start: body.wordIndex,
            confidence: low ? 'low' : 'high',
            method: `chapters:${det.dialect}${res.toc ? ':toc-only' : deep ? ':deep' : ''}`,
            headingTitle: body.title,
            nHeadings: det.deduped.length,
            total,
            preview: tokens.slice(body.wordIndex, body.wordIndex + 14).join(' '),
        };
    }

    const ps = proseStart(raw);
    if (ps != null) {
        return {
            start: ps,
            confidence: 'prose',
            method: 'prose-fallback',
            headingTitle: null,
            nHeadings: 0,
            total,
            preview: tokens.slice(ps, ps + 14).join(' '),
        };
    }

    return {
        start: 0,
        confidence: 'none',
        method: 'none',
        headingTitle: null,
        nHeadings: 0,
        total,
        preview: tokens.slice(0, 14).join(' '),
    };
}

async function main() {
    // Seed from hand-verified scene maps: scenes[0].startIndex is an authored,
    // trusted story start for those ~71 books. Detector never overrides these.
    let seeded = {};
    if (existsSync(SCENES_PATH)) {
        const scenes = JSON.parse(await readFile(SCENES_PATH, 'utf8'));
        for (const [id, arr] of Object.entries(scenes)) {
            if (Array.isArray(arr) && arr.length && typeof arr[0].startIndex === 'number') {
                seeded[id] = arr[0].startIndex;
            }
        }
    }

    // Agent/hand-verified overrides win over both seeds and the detector. Each is
    // a distinctive prose anchor at the true story start; resolve it per book.
    let overrides = {};
    if (existsSync(OVERRIDES_PATH)) {
        overrides = JSON.parse(await readFile(OVERRIDES_PATH, 'utf8'));
    }

    const files = ONLY_ID ? [`${ONLY_ID}.txt`] : (await readdir(BOOKS_DIR)).filter((f) => f.endsWith('.txt'));
    const map = {};
    const report = [];
    const counts = { override: 0, seeded: 0, high: 0, low: 0, prose: 0, none: 0 };
    const problems = [];

    for (const f of files) {
        const id = f.replace(/\.txt$/, '');
        const raw = await readFile(path.join(BOOKS_DIR, f), 'utf8');
        const tokens = tokenize(raw);

        // 1) Explicit override anchor (verified truth).
        const ov = overrides[id];
        if (ov && !id.startsWith('_') && ov.anchor) {
            const idx = resolveAnchor(tokens, ov.anchor);
            if (idx >= 0) {
                map[id] = idx;
                counts.override++;
                report.push({ id, start: idx, confidence: 'override', method: 'override',
                    total: tokens.length, preview: tokens.slice(idx, idx + 14).join(' ') });
                continue;
            }
            problems.push(`#${id}: override anchor not found: "${ov.anchor.slice(0, 40)}…"`);
        }

        // 2) Hand-authored scene map (trusted).
        if (Object.prototype.hasOwnProperty.call(seeded, id)) {
            map[id] = seeded[id];
            counts.seeded++;
            report.push({ id, start: seeded[id], confidence: 'seeded', method: 'scenes', total: tokens.length,
                preview: tokens.slice(seeded[id], seeded[id] + 14).join(' ') });
            continue;
        }

        // 3) Deterministic detector.
        const r = resolveStart(raw);
        map[id] = r.start;
        counts[r.confidence]++;
        report.push({ id, ...r });
    }

    // Report distribution.
    const pct = (n) => ((n / files.length) * 100).toFixed(1);
    console.log(`\nStory-start resolution over ${files.length} books:`);
    console.log(`  override (agent/hand):    ${counts.override}  (${pct(counts.override)}%)`);
    console.log(`  seeded (from scene maps): ${counts.seeded}  (${pct(counts.seeded)}%)`);
    console.log(`  high (chapter structure): ${counts.high}  (${pct(counts.high)}%)`);
    console.log(`  low (deep/uncertain):     ${counts.low}  (${pct(counts.low)}%)`);
    console.log(`  prose fallback:           ${counts.prose}  (${pct(counts.prose)}%)`);
    console.log(`  none (start 0, review):   ${counts.none}  (${pct(counts.none)}%)`);
    if (problems.length) { console.log(`\n⚠ ${problems.length} override problem(s):`); for (const p of problems) console.log('  ' + p); }

    if (ONLY_ID) {
        console.log('\n' + JSON.stringify(report[0], null, 2));
        return;
    }

    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nWrote triage report → ${path.relative(ROOT, REPORT_PATH)}`);

    if (!REPORT_ONLY) {
        await writeFile(OUT_PATH, JSON.stringify(map));
        console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} — ${Object.keys(map).length} books.`);
    }
}

export { resolveStart, tokenize, resolveAnchor };

// Run main() only when invoked directly, not when imported (validator/merge/-e).
if (process.argv[1] && process.argv[1].endsWith('build-story-starts.mjs')) {
    main().catch((e) => { console.error(e); process.exit(1); });
}
