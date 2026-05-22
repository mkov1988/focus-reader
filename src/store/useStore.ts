import { create } from 'zustand';

interface AppState {
    viewMode: 'INPUT' | 'TEXT_INPUT' | 'READING';

    // Actions
    setViewMode: (mode: 'INPUT' | 'TEXT_INPUT' | 'READING') => void;
}

export const useStore = create<AppState>((set) => ({
    viewMode: 'INPUT',

    setViewMode: (mode) => set({ viewMode: mode }),
}));
