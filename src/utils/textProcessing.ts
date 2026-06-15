/**
 * Text Processing Utilities for RSVP Reader
 * 
 * These utilities handle word splitting, focal point calculation,
 * and intelligent text chunking for the speed reading engine.
 */
import { detectChapters, type Chapter, type ChapterConfidence } from './chapterDetection';

// --- Configuration Constants ---

/**
 * How the reader places the coloured letter and handles words too wide for the
 * screen. User-selectable in the menu (persisted as `fitMode`). Nothing ever
 * clips in any mode — a per-word shrink is the backstop everywhere.
 *  - 'centerAll' : every word colours a middle letter so it balances and fits.
 *                  Shown as "Classic"; the default.
 *  - 'centerBig' : long words colour a middle letter; normal words stay a third
 *                  in. Shown as "Center long words".
 *  - 'shrink'    : colour a third in; shrink each long word that would overflow,
 *                  so long words read smaller than short ones. "Shrink long words".
 *  - 'compact'   : colour a third in, but render every word at one slightly
 *                  smaller size so nothing clips. Shown as "Compact".
 */
export type FitMode = 'centerAll' | 'centerBig' | 'shrink' | 'compact';

// Colour position inside a word, as a fraction of its length.
const ORP_FRACTION = 0.3;       // "a third in" — near where the eye naturally lands
const MIDDLE_FRACTION = 0.5;    // the middle — balances the word around the centre
const BIG_WORD_MIN_LENGTH = 11; // a word this long or longer counts as "big"

// 'compact' renders every word at this fraction of the base size — one uniform,
// slightly smaller size so even long words fit at the third-in placement without
// clipping. Tunable: lower fits longer words but reads smaller. The per-word
// shrink backstop still catches the rare word too long even at this size.
export const COMPACT_SCALE = 0.8;

// Delays
const DELAY_PARAGRAPH = 5.0;
const DELAY_SENTENCE_END = 3.0;
const DELAY_COMMA = 2.0;
const DELAY_MINOR_PUNCTUATION = 0.5; // Added to base 1.0
const DELAY_LONG_WORD_8 = 0.2; // Added to base
const DELAY_LONG_WORD_12 = 0.3; // Added to base

// Regex Patterns (Compiled once for efficiency)
const REGEX_MINOR_PUNCTUATION = /[,]$/;
const REGEX_SENTENCE_END = /[.!?]$/;
const REGEX_SUB_CLAUSE = /[;:]$/;

// "A third in" — the original placement (fixed steps for short words so the
// colour never sits on the very first or last letter).
function orpFocalIndex(len: number): number {
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return Math.floor(len * ORP_FRACTION);
}

// The middle of the word, so it balances around the coloured letter.
function middleFocalIndex(len: number): number {
    return len <= 1 ? 0 : Math.floor(len * MIDDLE_FRACTION);
}

/**
 * Index of the letter to colour (the focal letter) within a word, for the given
 * fit mode. The coloured letter is always centred on screen; this only decides
 * which letter it is. See {@link FitMode}.
 */
export function getFocalIndex(word: string, mode: FitMode = 'centerAll'): number {
    const len = word.length;
    if (len <= 1) return 0;
    if (mode === 'centerAll') return middleFocalIndex(len);
    if (mode === 'centerBig' && len >= BIG_WORD_MIN_LENGTH) return middleFocalIndex(len);
    return orpFocalIndex(len); // 'shrink', 'compact', and normal words in 'centerBig'
}

/**
 * Base font size to render at for a mode, before the per-word shrink backstop.
 * Only 'compact' changes it (one uniform, slightly smaller size); every other
 * mode reads at the full base size.
 */
export function effectiveBaseFontSize(fontSize: number, mode: FitMode): number {
    return mode === 'compact' ? fontSize * COMPACT_SCALE : fontSize;
}

/**
 * Split a word into three parts: before focal, focal letter, after focal.
 */
export interface WordParts {
    before: string;
    focal: string;
    after: string;
}

export function splitWord(word: string, mode: FitMode = 'centerAll'): WordParts {
    const cleanWord = word.trim();
    if (!cleanWord) return { before: '', focal: '', after: '' };

    const focalIdx = getFocalIndex(cleanWord, mode);
    return {
        before: cleanWord.slice(0, focalIdx),
        focal: cleanWord[focalIdx] || '',
        after: cleanWord.slice(focalIdx + 1),
    };
}

/**
 * Calculate delay multiplier based on word characteristics.
 * - Long words get slightly more time
 * - Periods get 2x pause time
 * - Other punctuation gets moderate pause
 */
export function getDelayMultiplier(word: string): number {
    let multiplier = 1.0;

    // Paragraph breaks get 5x delay
    if (word === '[P]') {
        return DELAY_PARAGRAPH;
    }

    // Long words need more time
    if (word.length > 8) multiplier += DELAY_LONG_WORD_8;
    if (word.length > 12) multiplier += DELAY_LONG_WORD_12;

    // Sentence-ending punctuation gets 3x delay
    if (REGEX_SENTENCE_END.test(word)) {
        multiplier = DELAY_SENTENCE_END;
    }
    // Commas get 2x delay
    else if (REGEX_MINOR_PUNCTUATION.test(word)) {
        multiplier = DELAY_COMMA;
    }
    // Other minor punctuation
    else if (REGEX_SUB_CLAUSE.test(word)) {
        multiplier += DELAY_MINOR_PUNCTUATION;
    }

    return multiplier;
}

/**
 * Calculate base delay in milliseconds from WPM.
 */
export function wpmToDelay(wpm: number): number {
    return 60000 / wpm;
}

// --- Structured Data Types for Advanced Views ---

export interface TextToken {
    id: number;          // Global index
    word: string;        // Display word including punctuation
    clean: string;       // Word used for logic (no punctuation)
    sentenceIndex: number;
    paragraphIndex: number;
    delayMultiplier: number;
    isSentenceStart: boolean;
    isSentenceEnd: boolean;
    isParagraphEnd: boolean;
}

export interface ParsedText {
    tokens: TextToken[];
    sentences: TextToken[][]; // Array of sentences (arrays of tokens)
    paragraphs: TextToken[][]; // Array of paragraphs (arrays of tokens)
    chapters: Chapter[]; // Detected structural landmarks (empty if none found)
    chapterConfidence: ChapterConfidence; // 'none' => fall back to paragraphs
}

/**
 * Advanced parser that creates a structured representation of the text.
 * This supports Sentence View, Paragraph View, and Hybrid View.
 */
export function parseText(text: string): ParsedText {
    // Source blank lines are paragraph boundaries. Convert them to explicit [P]
    // markers before tokenizing — otherwise `split(/\s+/)` collapses every
    // newline and the whole book becomes a single paragraph, breaking
    // paragraph-aware features (Paragraph view, scrubber paragraph-snapping).
    // [P] markers are skipped during tokenization (they never become tokens), so
    // real-word token ids are unchanged and stay aligned with chapterDetection's
    // offsets, which run on the original `text` below.
    const marked = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, ' [P] ');
    const rawTokens = marked.trim().split(/\s+/);
    const tokens: TextToken[] = [];
    const sentences: TextToken[][] = [];
    const paragraphs: TextToken[][] = [];

    let currentSentenceIndex = 0;
    let currentParagraphIndex = 0;

    const currentSentence: TextToken[] = [];
    const currentParagraph: TextToken[] = [];

    // Helper to finalize a structural unit (sentence or paragraph)
    const finalizeUnit = (
        buffer: TextToken[],
        collection: TextToken[][],
        isSentence: boolean
    ) => {
        if (buffer.length > 0) {
            const lastToken = buffer[buffer.length - 1];
            if (isSentence) {
                lastToken.isSentenceEnd = true;
                currentSentenceIndex++;
            } else {
                lastToken.isParagraphEnd = true;
                currentParagraphIndex++;
            }
            collection.push([...buffer]);
            buffer.length = 0; // Clear the buffer
        }
    };

    rawTokens.forEach((rawWord) => {
        // Handle explicit paragraph markers from previous tokenize logic or double newlines
        const isExplicitBreak = rawWord === '[P]';

        if (isExplicitBreak) {
            finalizeUnit(currentParagraph, paragraphs, false);
            finalizeUnit(currentSentence, sentences, true);
            return;
        }

        const displayWord = rawWord;
        const isSentenceEnd = /[.!?]$/.test(displayWord);
        const delay = getDelayMultiplier(displayWord);

        const token: TextToken = {
            id: tokens.length,
            word: displayWord,
            clean: displayWord.replace(/[.,!?;:]/g, ''),
            sentenceIndex: currentSentenceIndex,
            paragraphIndex: currentParagraphIndex,
            delayMultiplier: delay,
            isSentenceStart: currentSentence.length === 0,
            isSentenceEnd, // Will be confirmed when the sentence is finalized or by punctuation
            isParagraphEnd: false, // Will be set when paragraph is finalized
        };

        tokens.push(token);
        currentSentence.push(token);
        currentParagraph.push(token);

        // If sentence ended based on punctuation, finalize it
        if (isSentenceEnd) {
            finalizeUnit(currentSentence, sentences, true);
        }
    });

    // Cleanup lingering buffers at the end of text
    finalizeUnit(currentSentence, sentences, true);
    finalizeUnit(currentParagraph, paragraphs, false);

    // Recover spatial structure (chapters) from the original line-broken text —
    // word offsets align with token ids since both tokenize on /\s+/.
    const { chapters, confidence } = detectChapters(text);

    if (import.meta.env.DEV) {
        console.info(
            `[chapters] ${chapters.length} found (confidence: ${confidence})`,
            chapters.slice(0, 8).map((c) => `${(c.wordIndex / tokens.length * 100).toFixed(1)}% ${c.title}`),
        );
    }

    return { tokens, sentences, paragraphs, chapters, chapterConfidence: confidence };
}
