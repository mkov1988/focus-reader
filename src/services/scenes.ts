/**
 * Authored scene maps for selected books (built offline by scripts/build-scenes.mjs
 * from scripts/scenes-src.json). A scene's `startIndex` is a token index in the
 * same space as the reader's currentIndex / TextToken.id, so we can tell which
 * scene a reader is in. Used for the calm "previously…" recap when resuming a
 * book, and (later) a labelled scene map in the reader. Books without an authored
 * map simply have no scenes and the recap is skipped.
 */
import scenesJson from '../data/scenes.json';

export interface Scene {
    /** Token index where the scene starts (aligns with rsvp.currentIndex). */
    startIndex: number;
    /** Spoiler-safe scene name. */
    label: string;
    /** One calm sentence summarizing this scene, safe to show on resume. */
    recap: string;
}

const SCENES = scenesJson as Record<string, Scene[]>;

/** All authored scenes for a book (ascending by startIndex), or [] if none. */
export function getScenes(bookId: string): Scene[] {
    return SCENES[bookId] ?? [];
}

/**
 * The scene a reader at `index` is currently in: the last scene whose start is at
 * or before `index`. Null if the book has no scene map (or `index` precedes the
 * first scene, e.g. still in the front matter).
 */
export function sceneAt(bookId: string, index: number): Scene | null {
    const scenes = SCENES[bookId];
    if (!scenes || scenes.length === 0) return null;
    let found: Scene | null = null;
    for (const s of scenes) {
        if (s.startIndex <= index) found = s;
        else break;
    }
    return found;
}
