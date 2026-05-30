import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '../theme';
import type { VisualizationMode } from '../components/Reader/VisualizationSelector';

export type ViewMode = 'INPUT' | 'TEXT_INPUT' | 'READING';
export type TabKey = 'today' | 'library' | 'shelves' | 'notebook';

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
    progress: ReadingProgress | null;
    stats: ReadingStats;
    /** Persisted reader preferences — survive reload. */
    wpm: number;
    visMode: VisualizationMode;

    setViewMode: (mode: ViewMode) => void;
    setThemeIndex: (i: number) => void;
    toggleMode: () => void;
    setActiveTab: (tab: TabKey) => void;
    /** Record/refresh reading progress for the book currently in the reader. */
    updateProgress: (p: Omit<ReadingProgress, 'lastReadAt'>) => void;
    /** Add one play→pause span to cumulative stats. */
    addSession: (words: number, ms: number) => void;
    setWpm: (wpm: number) => void;
    setVisMode: (m: VisualizationMode) => void;
}

const DEFAULT_WPM = 300;

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            viewMode: 'INPUT',
            themeIndex: 0,
            mode: 'light',
            activeTab: 'today',
            progress: null,
            stats: { wordsRead: 0, msRead: 0 },
            wpm: DEFAULT_WPM,
            visMode: 'rsvp',

            setViewMode: (mode) => set({ viewMode: mode }),
            setThemeIndex: (i) => set({ themeIndex: i }),
            toggleMode: () => set((s) => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
            setActiveTab: (tab) => set({ activeTab: tab }),
            updateProgress: (p) => set({ progress: { ...p, lastReadAt: Date.now() } }),
            addSession: (words, ms) => set((s) => ({
                stats: {
                    wordsRead: s.stats.wordsRead + Math.max(0, words),
                    msRead: s.stats.msRead + Math.max(0, ms),
                },
            })),
            setWpm: (wpm) => set({ wpm }),
            setVisMode: (visMode) => set({ visMode }),
        }),
        {
            name: 'focus-reader-state',
            // Bump on incompatible shape changes. Pair with a migrate step
            // below so existing users don't get a hard reset.
            version: 1,
            // viewMode is ephemeral (don't restore mid-reading on reload).
            partialize: (s) => ({
                themeIndex: s.themeIndex,
                mode: s.mode,
                activeTab: s.activeTab,
                progress: s.progress,
                stats: s.stats,
                wpm: s.wpm,
                visMode: s.visMode,
            }),
            migrate: (persistedState, version) => {
                // v0 → v1: added stats / wpm / visMode. Preserve existing
                // theme + progress; fill in defaults for the new fields.
                if (version === 0) {
                    const prev = (persistedState ?? {}) as Partial<AppState>;
                    return {
                        ...prev,
                        stats: prev.stats ?? { wordsRead: 0, msRead: 0 },
                        wpm: prev.wpm ?? DEFAULT_WPM,
                        visMode: prev.visMode ?? 'rsvp',
                    } as AppState;
                }
                return persistedState as AppState;
            },
        },
    ),
);
