/**
 * Text Processing Utilities for RSVP Reader
 * 
 * These utilities handle word splitting, focal point calculation,
 * and intelligent text chunking for the speed reading engine.
 */

/**
 * Determines the optimal focal point index for a word.
 * Research suggests the optimal fixation point is around 25-35% into the word.
 * This creates the "Optimal Recognition Point" (ORP) for faster reading.
 */
// --- Configuration Constants ---
const ORP_PERCENTAGE = 0.3; // Optimal Recognition Point percentage

// Delays
const DELAY_PARAGRAPH = 5.0;
const DELAY_SENTENCE_END = 3.0;
const DELAY_COMMA = 2.0;
const DELAY_MINOR_PUNCTUATION = 0.5; // Added to base 1.0
const DELAY_LONG_WORD_8 = 0.2; // Added to base
const DELAY_LONG_WORD_12 = 0.3; // Added to base

// Regex Patterns (Compiled once for efficiency)
const REGEX_PAUSE_PUNCTUATION = /[.!?;:]$/;
const REGEX_MINOR_PUNCTUATION = /[,]$/;
const REGEX_SENTENCE_END = /[.!?]$/;
const REGEX_SUB_CLAUSE = /[;:]$/;

/**
 * Determines the optimal focal point index for a word.
 * Research suggests the optimal fixation point is around 25-35% into the word.
 * This creates the "Optimal Recognition Point" (ORP) for faster reading.
 */
export function getFocalIndex(word: string): number {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 3) return 1;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return Math.floor(len * ORP_PERCENTAGE);
}

/**
 * Split a word into three parts: before focal, focal letter, after focal.
 */
export interface WordParts {
    before: string;
    focal: string;
    after: string;
}

export function splitWord(word: string): WordParts {
    const cleanWord = word.trim();
    if (!cleanWord) return { before: '', focal: '', after: '' };

    const focalIdx = getFocalIndex(cleanWord);
    return {
        before: cleanWord.slice(0, focalIdx),
        focal: cleanWord[focalIdx] || '',
        after: cleanWord.slice(focalIdx + 1),
    };
}

/**
 * Split text into words, preserving punctuation attached to words.
 * Marks paragraph breaks with a special [P] token.
 */
export function tokenizeText(text: string): string[] {
    return text
        .trim()
        .replace(/\n\s*\n/g, ' [P] ')
        .split(/\s+/)
        .filter(word => word.length > 0);
}

/**
 * Check if a word ends with punctuation that warrants a pause.
 */
export function hasPausePunctuation(word: string): boolean {
    return REGEX_PAUSE_PUNCTUATION.test(word);
}

/**
 * Check if a word has minor punctuation (comma).
 */
export function hasMinorPunctuation(word: string): boolean {
    return REGEX_MINOR_PUNCTUATION.test(word);
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

/**
 * Estimate reading time for a text at given WPM.
 */
export function estimateReadingTime(words: string[], wpm: number): number {
    const baseDelay = wpmToDelay(wpm);
    let totalMs = 0;

    for (const word of words) {
        totalMs += baseDelay * getDelayMultiplier(word);
    }

    return totalMs;
}

/**
 * Format milliseconds to MM:SS display.
 */
export function formatTime(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
}

/**
 * Advanced parser that creates a structured representation of the text.
 * This supports Sentence View, Paragraph View, and Hybrid View.
 */
export function parseText(text: string): ParsedText {
    const rawTokens = text.trim().split(/\s+/);
    const tokens: TextToken[] = [];
    const sentences: TextToken[][] = [];
    const paragraphs: TextToken[][] = [];

    let currentSentenceIndex = 0;
    let currentParagraphIndex = 0;

    let currentSentence: TextToken[] = [];
    let currentParagraph: TextToken[] = [];

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

    return { tokens, sentences, paragraphs };
}
