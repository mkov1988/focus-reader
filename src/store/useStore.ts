import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '../theme';
import type { VisualizationMode } from '../components/Reader/VisualizationSelector';
import type { FitMode } from '../utils/textProcessing';

export type ViewMode = 'INPUT' | 'READING';
export type TabKey = 'today' | 'library' | 'notebook';

/**
 * A book the reader saved for later (a "want to read" pile). Unlike
 * ReadingProgress these carry no position — they haven't been started — just
 * enough metadata to render the row and open the book. Saved books live in the
 * Library tab below the in-progress Reading list. Grouping them into named
 * shelves (playlist-style) is a later enhancement.
 */
export interface SavedBook {
    bookId: string;
    title: string;
    author: string;
    coverUrl?: string;
    textUrl?: string;
    savedAt: number;
}

export interface ReadingProgress {
    bookId: string;
    title: string;
    author: string;
    coverUrl?: string;
    textUrl?: string;
    currentIndex: number;
    totalTokens: number;
    lastReadAt: number;
}

/**
 * Cumulative reading aggregates across all books / sessions, used to power
 * the "Your Reading" card on the home screen. Recorded by the App at
 * play→pause boundaries (one "session" = one continuous play span).
 */
export interface ReadingStats {
    wordsRead: number;
    /** Total ms spent with RSVP actively playing. */
    msRead: number;
}

interface AppState {
    viewMode: ViewMode;
    themeIndex: number;
    mode: ThemeMode;
    activeTab: TabKey;
    /** Per-book reading position, keyed by bookId. Every book keeps its own
     *  spot, so starting/switching books never clobbers another book's place.
     *  Also the data source for the Recents list (sort by lastReadAt). */
    progressById: Record<string, ReadingProgress>;
    /** Books saved for later, keyed by bookId (so a save toggles cleanly and
     *  never duplicates). Surfaced in the Library tab's "Saved for later" list. */
    savedById: Record<string, SavedBook>;
    stats: ReadingStats;
    /** Transient confirmation bubble (e.g. "Saved for later" after a save).
     *  Ephemeral — never persisted; a fresh `id` each time so the same message
     *  can re-trigger the pop. */
    toast: { id: number; message: string } | null;
    /** Persisted reader preferences — survive reload. */
    wpm: number;
    visMode: VisualizationMode;
    /** How long/overflowing words are placed and sized in the reader. */
    fitMode: FitMode;

    setViewMode: (mode: ViewMode) => void;
    setThemeIndex: (i: number) => void;
    toggleMode: () => void;
    setActiveTab: (tab: TabKey) => void;
    /** Record/refresh reading progress for the book currently in the reader. */
    updateProgress: (p: Omit<ReadingProgress, 'lastReadAt'>) => void;
    /** Add a book to (or remove it from) the saved-for-later list. */
    toggleSaved: (b: Omit<SavedBook, 'savedAt'>) => void;
    /** Pop a transient confirmation bubble. */
    showToast: (message: string) => void;
    /** Add one play→pause span to cumulative stats. */
    addSession: (words: number, ms: number) => void;
    setWpm: (wpm: number) => void;
    setVisMode: (m: VisualizationMode) => void;
    setFitMode: (m: FitMode) => void;
}

const DEFAULT_WPM = 300;

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            viewMode: 'INPUT',
            themeIndex: 0,
            mode: 'dark',
            activeTab: 'today',
            progressById: {},
            savedById: {},
            toast: null,
            stats: { wordsRead: 0, msRead: 0 },
            wpm: DEFAULT_WPM,
            visMode: 'rsvp',
            fitMode: 'centerAll',

            setViewMode: (mode) => set({ viewMode: mode }),
            setThemeIndex: (i) => set({ themeIndex: i }),
            toggleMode: () => set((s) => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
            setActiveTab: (tab) => set({ activeTab: tab }),
            updateProgress: (p) => set((s) => ({
                progressById: {
                    ...s.progressById,
                    [p.bookId]: { ...p, lastReadAt: Date.now() },
                },
            })),
            toggleSaved: (b) => set((s) => {
                const next = { ...s.savedById };
                if (next[b.bookId]) delete next[b.bookId];
                else next[b.bookId] = { ...b, savedAt: Date.now() };
                return { savedById: next };
            }),
            showToast: (message) => set({ toast: { id: Date.now(), message } }),
            addSession: (words, ms) => set((s) => ({
                stats: {
                    wordsRead: s.stats.wordsRead + Math.max(0, words),
                    msRead: s.stats.msRead + Math.max(0, ms),
                },
            })),
            setWpm: (wpm) => set({ wpm }),
            setVisMode: (visMode) => set({ visMode }),
            setFitMode: (fitMode) => set({ fitMode }),
        }),
        {
            name: 'focus-reader-state',
            // Bump on incompatible shape changes. Pair with a migrate step
            // below so existing users don't get a hard reset.
            version: 5,
            // viewMode is ephemeral (don't restore mid-reading on reload).
            // activeTab is ephemeral too: Recents/Shelves/Notebook are inner
            // pages you back out of, so the app always boots to the Today home
            // page — the same way the reader resets to the storefront on reload.
            partialize: (s) => ({
                themeIndex: s.themeIndex,
                mode: s.mode,
                progressById: s.progressById,
                savedById: s.savedById,
                stats: s.stats,
                wpm: s.wpm,
                visMode: s.visMode,
                fitMode: s.fitMode,
            }),
            migrate: (persistedState, version) => {
                const prev = (persistedState ?? {}) as Record<string, unknown>;
                // v0 → v1: added stats / wpm / visMode. Fill in defaults.
                if (version === 0) {
                    prev.stats = prev.stats ?? { wordsRead: 0, msRead: 0 };
                    prev.wpm = prev.wpm ?? DEFAULT_WPM;
                    prev.visMode = prev.visMode ?? 'rsvp';
                }
                // v0/v1 → v2: single `progress` slot became a per-book map.
                // Wrap any existing single progress under its bookId so the
                // user keeps the book they were last reading.
                if (version < 2) {
                    const old = prev.progress as ReadingProgress | null | undefined;
                    prev.progressById = old && old.bookId ? { [old.bookId]: old } : {};
                    delete prev.progress;
                }
                // v2 → v3: added the reader fit mode.
                if (version < 3) {
                    prev.fitMode = prev.fitMode ?? 'classic';
                }
                // v3 → v4: the clipping 'classic' mode was removed. Its name moved
                // to the centred default, so move anyone on it (or unset) there.
                if (version < 4) {
                    if (prev.fitMode == null || prev.fitMode === 'classic') {
                        prev.fitMode = 'centerAll';
                    }
                }
                // v4 → v5: added the saved-for-later list.
                if (version < 5) {
                    prev.savedById = prev.savedById ?? {};
                }
                return prev as unknown as AppState;
            },
        },
    ),
);
