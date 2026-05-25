import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '../theme';

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

interface AppState {
    viewMode: ViewMode;
    themeIndex: number;
    mode: ThemeMode;
    activeTab: TabKey;
    progress: ReadingProgress | null;

    setViewMode: (mode: ViewMode) => void;
    setThemeIndex: (i: number) => void;
    setMode: (mode: ThemeMode) => void;
    toggleMode: () => void;
    setActiveTab: (tab: TabKey) => void;
    /** Record/refresh reading progress for the book currently in the reader. */
    updateProgress: (p: Omit<ReadingProgress, 'lastReadAt'>) => void;
    clearProgress: () => void;
}

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            viewMode: 'INPUT',
            themeIndex: 0,
            mode: 'light',
            activeTab: 'today',
            progress: null,

            setViewMode: (mode) => set({ viewMode: mode }),
            setThemeIndex: (i) => set({ themeIndex: i }),
            setMode: (mode) => set({ mode }),
            toggleMode: () => set((s) => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
            setActiveTab: (tab) => set({ activeTab: tab }),
            updateProgress: (p) => set({ progress: { ...p, lastReadAt: Date.now() } }),
            clearProgress: () => set({ progress: null }),
        }),
        {
            name: 'focus-reader-state',
            // viewMode is ephemeral (don't restore mid-reading on reload).
            partialize: (s) => ({
                themeIndex: s.themeIndex,
                mode: s.mode,
                activeTab: s.activeTab,
                progress: s.progress,
            }),
        },
    ),
);
