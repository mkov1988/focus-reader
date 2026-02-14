import { useCallback, useEffect, useRef, useState } from 'react';
import { wpmToDelay, type TextToken } from '../utils/textProcessing';

export interface UseRSVPOptions {
    tokens: TextToken[];
    wpm: number;
    sentenceStartMultiplier?: number;
    sentenceStartOffset?: number; // Extra fixed delay in ms
    lineStartMultiplier?: number;
    lineStartIndices?: Set<number>;
    onComplete?: () => void;
}

export interface UseRSVPReturn {
    currentIndex: number;
    currentToken: TextToken | null;
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
 * The RSVP Engine Hook (Tokenized)
 */
export function useRSVP({
    tokens,
    wpm,
    sentenceStartMultiplier = 1,
    sentenceStartOffset = 0,
    lineStartMultiplier = 1,
    lineStartIndices = new Set(),
    onComplete
}: UseRSVPOptions): UseRSVPReturn {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Refs for animation loop
    const lastTimeRef = useRef<number>(0);
    const accumulatedTimeRef = useRef<number>(0);
    const rafIdRef = useRef<number | null>(null);
    const indexRef = useRef<number>(0);

    // Refs for options to avoid restarting the loop when they change
    const optionsRef = useRef({ sentenceStartMultiplier, sentenceStartOffset, lineStartMultiplier, lineStartIndices });
    useEffect(() => {
        optionsRef.current = { sentenceStartMultiplier, sentenceStartOffset, lineStartMultiplier, lineStartIndices };
    }, [sentenceStartMultiplier, sentenceStartOffset, lineStartMultiplier, lineStartIndices]);

    // Keep indexRef in sync
    useEffect(() => {
        indexRef.current = currentIndex;
    }, [currentIndex]);

    const currentToken = tokens[currentIndex] || null;
    const progress = tokens.length > 0 ? (currentIndex / (tokens.length - 1)) * 100 : 0;

    // Helper to calculate delay for a token based on current options
    const calculateWordDelay = (token: TextToken, baseDelay: number) => {
        const {
            sentenceStartMultiplier: ssm,
            sentenceStartOffset: sso,
            lineStartMultiplier: lsm,
            lineStartIndices: lsi
        } = optionsRef.current; // Read latest options

        let multiplier = token.delayMultiplier;
        let extraTime = 0;

        if (token.isSentenceStart) {
            if (ssm > 1) multiplier *= ssm;
            if (sso > 0) extraTime += sso;
        } else if (lsi.has(token.id) && lsm > 1) {
            multiplier *= lsm;
        }

        return (baseDelay * multiplier) + extraTime;
    };

    // Animation loop using RAF for butter-smooth updates
    const tick = useCallback((timestamp: number) => {
        if (!lastTimeRef.current) {
            lastTimeRef.current = timestamp;
        }

        const deltaTime = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;
        accumulatedTimeRef.current += deltaTime;

        const token = tokens[indexRef.current];
        if (!token) {
            setIsPlaying(false);
            onComplete?.();
            return;
        }

        const baseDelay = wpmToDelay(wpm);
        const wordDelay = calculateWordDelay(token, baseDelay);

        if (accumulatedTimeRef.current >= wordDelay) {
            accumulatedTimeRef.current = 0; // Reset accumulator

            if (indexRef.current < tokens.length - 1) {
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
    }, [tokens, wpm, onComplete]); // Options are read from ref, so no dependency needed

    // Start/stop animation based on isPlaying
    useEffect(() => {
        if (isPlaying && tokens.length > 0) {
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
    }, [isPlaying, tick, tokens.length]);

    const play = useCallback(() => {
        if (tokens.length > 0 && currentIndex < tokens.length - 1) {
            setIsPlaying(true);
        }
    }, [tokens.length, currentIndex]);

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
        const clampedIndex = Math.max(0, Math.min(index, tokens.length - 1));
        setCurrentIndex(clampedIndex);
        indexRef.current = clampedIndex;
        accumulatedTimeRef.current = 0;
    }, [tokens.length]);

    const skip = useCallback((delta: number) => {
        seek(currentIndex + delta);
    }, [currentIndex, seek]);

    return {
        currentIndex,
        currentToken,
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
