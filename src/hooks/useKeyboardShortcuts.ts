import { useEffect } from 'react';
import type { UseRSVPReturn } from './useRSVP';

export interface UseKeyboardShortcutsOptions {
    isActive: boolean;
    rsvp: UseRSVPReturn;
    setWpm: (update: (prev: number) => number) => void;
    onEscape: () => void;
    onActivity?: () => void;
}

export function useKeyboardShortcuts({
    isActive,
    rsvp,
    setWpm,
    onEscape,
    onActivity,
}: UseKeyboardShortcutsOptions) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isActive) return;

            // Ignore if typing in an input
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
                return;
            }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    rsvp.toggle();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    onActivity?.();
                    rsvp.skipToSentence(-1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    onActivity?.();
                    rsvp.skipToSentence(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    onActivity?.();
                    setWpm(prev => Math.min(1000, prev + 50));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    onActivity?.();
                    setWpm(prev => Math.max(100, prev - 50));
                    break;
                case 'Escape':
                    onEscape();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, rsvp, setWpm, onEscape, onActivity]);
}
