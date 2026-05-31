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
    /** Dedup key — chapter numbers are unique per book, so TOC == body here. */
    key: string;
    dialect: string;
}

/** What a dialect matcher returns for a line: a display title + a dedup key. */
interface Match {
    title: string;
    key: string;
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
const KEYWORD_RE =
    /^(chapter|chap|book|part|letter|canto|stave|volume|section)\.?\s+(?:no\.?\s*)?([0-9]{1,3}|[ivxlcdm]+)[.):\]]*(?:\s+(.+))?$/i;

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
            out.push({ lineIndex: i, wordIndex: offsets[i], title: m.title, key: m.key, dialect });
        }
    }
    return out;
}

/**
 * Drop the Table of Contents. Chapter numbers are unique within a book, so a
 * TOC is simply a duplicate of the body headings. Keep the *last* occurrence
 * of each key — the body copy always comes after the contents page.
 */
function dedupeKeepLast(candidates: Candidate[]): Candidate[] {
    const byKey = new Map<string, Candidate>();
    for (const c of candidates) byKey.set(c.key, c); // later overwrites earlier
    return [...byKey.values()].sort((a, b) => a.wordIndex - b.wordIndex);
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
            if (m && isHeadingTitleOk(m[3])) {
                const kind = m[1].toLowerCase().replace(/\.$/, '');
                const label = `${titleCase(kind)} ${m[2].toUpperCase()}`;
                const rest = cleanTitle(m[3] || '');
                return {
                    title: rest ? `${label} — ${titleCase(rest)}` : label,
                    key: `${kind}:${numKey(m[2])}`,
                };
            }
            const s = t.match(STANDALONE_KEYWORD_RE);
            if (s && isHeadingTitleOk(s[2])) {
                const rest = cleanTitle(s[2] || '');
                const name = titleCase(s[1]);
                return { title: rest ? `${name} — ${titleCase(rest)}` : name, key: s[1].toLowerCase() };
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
            return m ? { title: `${m[1]}. ${titleCase(m[2])}`, key: numKey(m[1]) } : null;
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
        const deduped = dedupeKeepLast(candidates);
        if (deduped.length >= MIN_CHAPTERS) {
            return { candidates: deduped, dialect: candidates[0].dialect };
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
