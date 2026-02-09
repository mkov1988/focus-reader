import { useCallback, useEffect, useRef, useState } from 'react';
import { getDelayMultiplier, wpmToDelay } from '../utils/textProcessing';

export interface UseRSVPOptions {
    words: string[];
    wpm: number;
    onComplete?: () => void;
}

export interface UseRSVPReturn {
    currentIndex: number;
    currentWord: string;
    isPlaying: boolean;
    progress: number;
    play: () => void;
    pause: () => void;
    toggle: () => void;
    reset: () => void;
    seek: (index: number) => void;
    skip: (delta: number) => void;
}

/**
 * The RSVP Engine Hook
 * 
 * Handles the timing loop for displaying words at the specified WPM.
 * Uses requestAnimationFrame for smooth, jitter-free updates.
 */
export function useRSVP({ words, wpm, onComplete }: UseRSVPOptions): UseRSVPReturn {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Refs for animation loop
    const lastTimeRef = useRef<number>(0);
    const accumulatedTimeRef = useRef<number>(0);
    const rafIdRef = useRef<number | null>(null);
    const indexRef = useRef<number>(0);

    // Keep indexRef in sync
    useEffect(() => {
        indexRef.current = currentIndex;
    }, [currentIndex]);

    const currentWord = words[currentIndex] || '';
    const progress = words.length > 0 ? (currentIndex / (words.length - 1)) * 100 : 0;

    // Animation loop using RAF for butter-smooth updates
    const tick = useCallback((timestamp: number) => {
        if (!lastTimeRef.current) {
            lastTimeRef.current = timestamp;
        }

        const deltaTime = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;
        accumulatedTimeRef.current += deltaTime;

        const word = words[indexRef.current];
        if (!word) {
            setIsPlaying(false);
            onComplete?.();
            return;
        }

        const baseDelay = wpmToDelay(wpm);
        const wordDelay = baseDelay * getDelayMultiplier(word);

        if (accumulatedTimeRef.current >= wordDelay) {
            accumulatedTimeRef.current = 0;

            if (indexRef.current < words.length - 1) {
                const nextIndex = indexRef.current + 1;
                indexRef.current = nextIndex;
                setCurrentIndex(nextIndex);
                rafIdRef.current = requestAnimationFrame(tick);
            } else {
                setIsPlaying(false);
                onComplete?.();
            }
        } else {
            rafIdRef.current = requestAnimationFrame(tick);
        }
    }, [words, wpm, onComplete]);

    // Start/stop animation based on isPlaying
    useEffect(() => {
        if (isPlaying && words.length > 0) {
            lastTimeRef.current = 0;
            accumulatedTimeRef.current = 0;
            rafIdRef.current = requestAnimationFrame(tick);
        } else if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }

        return () => {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, [isPlaying, tick, words.length]);

    const play = useCallback(() => {
        if (words.length > 0 && currentIndex < words.length - 1) {
            setIsPlaying(true);
        }
    }, [words.length, currentIndex]);

    const pause = useCallback(() => {
        setIsPlaying(false);
    }, []);

    const toggle = useCallback(() => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }, [isPlaying, play, pause]);

    const reset = useCallback(() => {
        setIsPlaying(false);
        setCurrentIndex(0);
        indexRef.current = 0;
        accumulatedTimeRef.current = 0;
    }, []);

    const seek = useCallback((index: number) => {
        const clampedIndex = Math.max(0, Math.min(index, words.length - 1));
        setCurrentIndex(clampedIndex);
        indexRef.current = clampedIndex;
        accumulatedTimeRef.current = 0;
    }, [words.length]);

    const skip = useCallback((delta: number) => {
        seek(currentIndex + delta);
    }, [currentIndex, seek]);

    return {
        currentIndex,
        currentWord,
        isPlaying,
        progress,
        play,
        pause,
        toggle,
        reset,
        seek,
        skip,
    };
}
