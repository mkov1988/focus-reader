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
export function getFocalIndex(word: string): number {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 3) return 1;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return Math.floor(len * 0.3);
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
    return /[.!?;:]$/.test(word);
}

/**
 * Check if a word has minor punctuation (comma).
 */
export function hasMinorPunctuation(word: string): boolean {
    return /[,]$/.test(word);
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
        return 5.0;
    }

    // Long words need more time
    if (word.length > 8) multiplier += 0.2;
    if (word.length > 12) multiplier += 0.3;

    // Sentence-ending punctuation gets 3x delay
    if (/[.!?]$/.test(word)) {
        multiplier = 3.0;
    }
    // Commas get 2x delay
    else if (/[,]$/.test(word)) {
        multiplier = 2.0;
    }
    // Other minor punctuation
    else if (/[;:]$/.test(word)) {
        multiplier += 0.5;
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
