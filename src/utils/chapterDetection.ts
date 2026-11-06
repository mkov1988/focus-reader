/**
 * Chapter detection for RSVP navigation.
 *
 * RSVP strips a book of all spatial structure, so the reader loses the ability
 * to "flip" to a chapter or skip frontmatter. This module recovers that
 * structure heuristically from Project Gutenberg plain text, which marks
 * chapters in several different "dialects" (CHAPTER II., Chapter 1, bare roman
 * numerals, etc.).
 *
 * Detection is tiered by confidence so the UI never shows a wrong map: when we
 * can't find reliable structure we report `none` and the caller falls back to
 * paragraph-level landmarks.
 *
 * Word offsets are expressed as indices into the same `\s+` tokenization that
 * `parseText` uses, so a chapter's `wordIndex` lines up with `TextToken.id`.
 */

export type ChapterConfidence = 'high' | 'medium' | 'none';

export interface Chapter {
    /** Display label, e.g. "Chapter II" or "I. A Scandal in Bohemia". */
    title: string;
    /** Token index (== TextToken.id) of the first word of the heading line. */
    wordIndex: number;
    /** Source line number — kept for debugging / validation. */
    lineIndex: number;
}

export interface ChapterDetection {
    chapters: Chapter[];
    confidence: ChapterConfidence;
    /** Which dialect won — useful when eyeballing detector output. */
    dialect: string;
}

/** A heading candidate before TOC-dedup / scoring. */
interface Candidate {
    lineIndex: number;
    wordIndex: number;
    title: string;
    /** Dedup key: dialect kind + normalised number ("chapter:12"), or the bare keyword. */
    key: string;
    dialect: string;
    /**
     * False for a line that is heading-*shaped* but not heading-*quality*: a
     * contents entry whose title runs past 60 characters, for instance. Loose
     * candidates never become chapters; they only help recognise a contents page
     * (see dropTableOfContents), where the long-titled entries are the ones that
     * would otherwise hide the shape of the list.
     */
    strict: boolean;
}

/** What a dialect matcher returns for a line: a display title + a dedup key. */
interface Match {
    title: string;
    key: string;
    /** Defaults to true; see Candidate.strict. */
    strict?: boolean;
}

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanToInt(s: string): number {
    const r = s.toLowerCase();
    let total = 0;
    for (let i = 0; i < r.length; i++) {
        const cur = ROMAN_VALUES[r[i]] ?? 0;
        const next = ROMAN_VALUES[r[i + 1]] ?? 0;
        total += cur < next ? -cur : cur;
    }
    return total;
}

/** Normalize a roman-or-arabic numeral string to a stable numeric key. */
function numKey(raw: string): string {
    return /^[0-9]+$/.test(raw) ? String(parseInt(raw, 10)) : String(romanToInt(raw));
}

// --- Tuning constants ---------------------------------------------------

/** Need at least this many real chapters to bother claiming structure. */
const MIN_CHAPTERS = 3;

// --- Heading dialects ---------------------------------------------------
//
// Each dialect is one regex tested against a single trimmed line. Order
// matters only for labelling; scoring picks the winner.

// Keyword + REQUIRED number, consuming the whole line. The number requirement
// is what keeps prose lines that merely start with "Book"/"Letter"/"Part" out.
// The `[.):\]]*` after the number tolerates trailing artifacts like the "]" in
// Project Gutenberg's "Chapter I.]" illustration captions.
// A title may follow after whitespace or an em/en dash ("CHAPTER I—M. MYRIEL",
// the Hapgood Les Misérables convention; without the dash none of its 365
// chapters were found). A plain hyphen is left out: "Chapter 1-3" is a range.
const KEYWORD_RE =
    /^(chapter|chap|book|part|letter|canto|stave|volume|section)\.?\s+(?:no\.?\s*)?([0-9]{1,3}|[ivxlcdm]+)[.):\]]*(?:(?:\s+|\s*[—–]\s*)(.+))?$/i;

// Unnumbered structural headings, but only when alone on their own line.
const STANDALONE_KEYWORD_RE = /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion)\.?(?:\s+(.+))?$/i;

/**
 * A real inline chapter title is short and starts strong (uppercase / quote /
 * digit). This rejects prose that survived the keyword+number gate, e.g.
 * "Chapter 1 was the happiest of his life".
 */
function isHeadingTitleOk(rest: string | undefined): boolean {
    if (!rest) return true;
    const r = rest.trim();
    if (r.length > 60) return false;
    return /^[A-Z0-9"'(\[“‘]/.test(r);
}

/** "I. A SCANDAL IN BOHEMIA" — roman numeral + period + title text. */
const ROMAN_TITLE_RE = /^([IVXLCDM]+)\.\s+([A-Z][^a-z]*[A-Za-z].*)$/;
/**
 * Initials look exactly like single-letter roman numerals: "M. Maret tells me",
 * "L. L. D.", "I. O. U.", "C. D. (Because the one who married…". A heading's
 * title never opens with another initial, and no book has a lone chapter M
 * (1000) or D (500). Ulysses got six "chapters" out of this and a reader start
 * a third of the way in; Napoleon's Letters started at "M. Maret".
 */
const INITIAL_RE = /^[A-Z]\.(?:\s|$)/;
const LONE_M_OR_D_RE = /^[MD]$/;

/** A line that is *only* an uppercase roman numeral (Gatsby-style). */
const BARE_ROMAN_RE = /^([IVXLCDM]+)\.?$/;

/** A line that is *only* an arabic number. */
const BARE_NUMERIC_RE = /^(\d{1,3})\.?$/;

function titleCase(s: string): string {
    return s
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

function cleanTitle(raw: string): string {
    return raw.replace(/\s+/g, ' ').replace(/[.\]\s]+$/, '').trim();
}

/**
 * Build a per-line lookup of the token index at each line's first word. Mirrors
 * `parseText`'s `text.trim().split(/\s+/)` so indices align with TextToken.id.
 */
function buildLineOffsets(lines: string[]): number[] {
    const offsets: number[] = [];
    let cumulative = 0;
    for (const line of lines) {
        offsets.push(cumulative);
        const trimmed = line.trim();
        if (trimmed) cumulative += trimmed.split(/\s+/).length;
    }
    return offsets;
}

/** Collect every candidate heading for a single dialect. */
function collect(
    lines: string[],
    offsets: number[],
    matcher: (trimmed: string) => Match | null,
    dialect: string,
): Candidate[] {
    const out: Candidate[] = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        const m = matcher(trimmed);
        if (m) {
            out.push({ lineIndex: i, wordIndex: offsets[i], title: m.title, key: m.key, dialect, strict: m.strict !== false });
        }
    }
    return out;
}

/**
 * Drop the Table of Contents, keep every body heading.
 *
 * The old rule ("chapter numbers are unique within a book, keep the last
 * occurrence of each") was wrong for the many books whose numbering restarts
 * per part: War and Peace has thirty-four body lines reading "CHAPTER I". Keep-
 * last threw away every part but the final one and left the reader (and the
 * narration built on it) opening at "CHAPTER XXXV" two thirds of the way in.
 *
 * A contents page is recognised by its shape instead: a dense run of headings
 * with almost no text between them, whose numbers all come round again later
 * in the body. Body headings have a chapter's worth of words between them.
 * Both halves of the test matter. Density alone swallows the body's first
 * heading, which usually sits a few words after the last contents entry
 * (Alice: "CHAPTER XII." ... "CHAPTER I."), and any FOREWORD wedged between
 * the two. Recurrence alone would drop every restarted part. Duplicate numbers
 * outside a contents run are kept when the numbering restarts; a repeat of the
 * *current* number is a stray (an illustration caption such as "Chapter I.]")
 * and is dropped.
 */
const TOC_MAX_GAP_WORDS = 30;
const TOC_MIN_RUN = 3;

/** Numeric part of a key such as "chapter:12" or "7"; NaN for keyword-only keys. */
function keyNumber(key: string): number {
    const n = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
    return /^[0-9]+$/.test(n) ? parseInt(n, 10) : NaN;
}
function keyKind(key: string): string {
    return key.includes(':') ? key.slice(0, key.indexOf(':')) : '';
}

function dropTableOfContents(candidates: Candidate[]): Candidate[] {
    // Loose candidates take part here (a contents page is mostly long-titled
    // entries: "CHAPTER I. IN WHICH PHILEAS FOGG AND PASSEPARTOUT ACCEPT EACH
    // OTHER…"; only the five short entries made it through before, too far
    // apart to look like a list) and are filtered out of the result below.
    const sorted = [...candidates].sort((a, b) => a.wordIndex - b.wordIndex);
    // "Comes round again" means a real heading later on, so only strict
    // candidates count as recurrences: a prose line such as "Introduction to
    // the Phaedrus)." must not make the body's INTRODUCTION look like an entry.
    const lastIndexOfKey = new Map<string, number>();
    sorted.forEach((c, i) => { if (c.strict) lastIndexOfKey.set(c.key, i); });
    const recursLater = (i: number) => (lastIndexOfKey.get(sorted[i].key) ?? i) > i;

    const isToc = new Array<boolean>(sorted.length).fill(false);
    let runStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
        const dense = i < sorted.length && sorted[i].wordIndex - sorted[i - 1].wordIndex <= TOC_MAX_GAP_WORDS;
        if (dense) continue;
        let recurring = 0;
        for (let k = runStart; k < i; k++) if (recursLater(k)) recurring++;
        if (recurring >= TOC_MIN_RUN) {
            for (let k = runStart; k < i; k++) if (recursLater(k)) isToc[k] = true;
        }
        runStart = i;
    }
    const body = sorted.filter((c, i) => c.strict && !isToc[i]);

    // Unnumbered headings (PREFACE, PROLOGUE, INTRODUCTION…) keep the old
    // keep-last rule: numbering restarts per part, a preface does not, so an
    // earlier PREFACE is the contents entry for the later one. Contents pages
    // whose other entries are not headings to us ("I IS IT A GHOST?") leave
    // that one entry too isolated for the density test above to catch.
    const lastOfKeyword = new Map<string, number>();
    body.forEach((c, i) => { if (Number.isNaN(keyNumber(c.key))) lastOfKeyword.set(c.key, i); });

    // Strays: the same kind and number as the most recent kept heading.
    const out: Candidate[] = [];
    const lastNumber = new Map<string, number>();
    body.forEach((c, i) => {
        const kind = keyKind(c.key);
        const n = keyNumber(c.key);
        if (Number.isNaN(n)) {
            if (lastOfKeyword.get(c.key) !== i) return;
        } else {
            if (lastNumber.get(kind) === n) return;
            lastNumber.set(kind, n);
        }
        out.push(c);
    });
    return out;
}

function detectDialect(
    lines: string[],
    offsets: number[],
): { candidates: Candidate[]; dialect: string } | null {
    const keyword = collect(
        lines,
        offsets,
        (t) => {
            const m = t.match(KEYWORD_RE);
            if (m) {
                const kind = m[1].toLowerCase().replace(/\.$/, '');
                const label = `${titleCase(kind)} ${m[2].toUpperCase()}`;
                const rest = cleanTitle(m[3] || '');
                return {
                    title: rest ? `${label} — ${titleCase(rest)}` : label,
                    key: `${kind}:${numKey(m[2])}`,
                    strict: isHeadingTitleOk(m[3]),
                };
            }
            const s = t.match(STANDALONE_KEYWORD_RE);
            if (s) {
                const rest = cleanTitle(s[2] || '');
                const name = titleCase(s[1]);
                return {
                    title: rest ? `${name} — ${titleCase(rest)}` : name,
                    key: s[1].toLowerCase(),
                    strict: isHeadingTitleOk(s[2]),
                };
            }
            return null;
        },
        'keyword',
    );

    const romanTitle = collect(
        lines,
        offsets,
        (t) => {
            const m = t.match(ROMAN_TITLE_RE);
            if (!m || INITIAL_RE.test(m[2]) || LONE_M_OR_D_RE.test(m[1])) return null;
            return { title: `${m[1]}. ${titleCase(m[2])}`, key: numKey(m[1]), strict: isHeadingTitleOk(m[2]) };
        },
        'roman-title',
    );

    const bareRoman = collect(
        lines,
        offsets,
        (t) => {
            const m = t.match(BARE_ROMAN_RE);
            return m ? { title: `Chapter ${m[1]}`, key: numKey(m[1]) } : null;
        },
        'bare-roman',
    );

    const bareNumeric = collect(
        lines,
        offsets,
        (t) => {
            const m = t.match(BARE_NUMERIC_RE);
            return m ? { title: `Chapter ${m[1]}`, key: numKey(m[1]) } : null;
        },
        'bare-numeric',
    );

    // Prefer dialects that carry the most meaning. Keyword and roman-title
    // headings are unambiguous; bare numerals are a last resort because lone
    // numbers/numerals show up in tables, dates, and stray lines.
    const ranked = [keyword, romanTitle, bareRoman, bareNumeric];
    for (const candidates of ranked) {
        const deduped = dropTableOfContents(candidates);
        if (deduped.length >= MIN_CHAPTERS) {
            return { candidates: deduped, dialect: deduped[0].dialect };
        }
    }
    return null;
}

/**
 * Standalone back-matter headings whose arrival marks the end of authored
 * prose. Deliberately conservative: we omit `appendix`, `footnotes`, and
 * `endnotes` because those frequently carry authored content the reader would
 * rather hear than have silently dropped (skip-non-book "fail safe to
 * inclusion"). The chapter detector never emits these as chapters, so the
 * readable-end clamp has to find them itself.
 */
const BACK_MATTER_RE =
    /^(index|glossary|bibliography|colophon|advertisements?|ads|further reading|list of (illustrations|figures|tables)|transcriber'?s note)\b/i;

/**
 * Find where back matter begins, expressed as a TextToken index, or `null` when
 * there's no recognizable back matter. Only a *standalone* heading line in the
 * back portion of the document qualifies, so a stray "index of refraction" in
 * mid-prose can't truncate the book. Returns the earliest qualifying heading so
 * everything from the first index/glossary/colophon onward is excluded.
 */
export function detectBackMatterStart(text: string, totalTokensCount: number): number | null {
    if (totalTokensCount <= 0) return null;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const offsets = buildLineOffsets(lines);
    // Back matter lives at the tail; requiring the heading past the midpoint
    // keeps a front-matter "List of Illustrations" or an early stray match from
    // clamping away the whole book.
    const threshold = totalTokensCount * 0.55;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        // Heading-shaped: short, starts with a capital, and a paragraph of its
        // own (blank lines on both sides). The last wrapped line of a prose
        // paragraph can be short and begin with "advertisement." — that is
        // exactly how The Enchanted April lost its final three chapters.
        if (!trimmed || trimmed.length > 40) continue;
        if (!/^[A-Z]/.test(trimmed)) continue;
        const blankBefore = i === 0 || lines[i - 1].trim() === '';
        const blankAfter = i === lines.length - 1 || lines[i + 1].trim() === '';
        if (!blankBefore || !blankAfter) continue;
        if (BACK_MATTER_RE.test(trimmed) && offsets[i] >= threshold) {
            return offsets[i];
        }
    }
    return null;
}

export function detectChapters(text: string): ChapterDetection {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const offsets = buildLineOffsets(lines);

    const result = detectDialect(lines, offsets);
    if (!result) {
        return { chapters: [], confidence: 'none', dialect: 'none' };
    }

    const chapters: Chapter[] = result.candidates.map((c) => ({
        title: c.title,
        wordIndex: c.wordIndex,
        lineIndex: c.lineIndex,
    }));

    // Unambiguous, named dialects are high confidence; bare numerals are
    // structurally plausible but easy to false-positive on, so cap at medium.
    const confidence: ChapterConfidence =
        result.dialect === 'keyword' || result.dialect === 'roman-title'
            ? 'high'
            : 'medium';

    return { chapters, confidence, dialect: result.dialect };
}
