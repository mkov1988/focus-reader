import { useState, useEffect, useRef, useCallback } from 'react';

interface UseImmersiveModeOptions {
    isPlaying: boolean;
    idleTimeoutMs?: number;
}

export function useImmersiveMode({ isPlaying, idleTimeoutMs = 3000 }: UseImmersiveModeOptions) {
    const [chromeVisible, setChromeVisible] = useState(!isPlaying);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearIdleTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const startIdleTimer = useCallback(() => {
        clearIdleTimer();
        if (isPlaying) {
            timerRef.current = setTimeout(() => {
                setChromeVisible(false);
            }, idleTimeoutMs);
        }
    }, [isPlaying, idleTimeoutMs, clearIdleTimer]);

    // Sync visibility with play/pause state changes
    useEffect(() => {
        if (!isPlaying) {
            clearIdleTimer();
            setChromeVisible(true);
        } else {
            clearIdleTimer();
            // Start playback with a gentle fade out
            const fadeTimer = setTimeout(() => {
                setChromeVisible(false);
            }, 100);
            return () => clearTimeout(fadeTimer);
        }
    }, [isPlaying, clearIdleTimer]);

    // Background peek tap: reveals chrome while playing and starts idle timer
    const handlePeek = useCallback(() => {
        if (isPlaying) {
            setChromeVisible(true);
            startIdleTimer();
        }
    }, [isPlaying, startIdleTimer]);

    // Control interaction reset: keeps chrome visible while user operates controls
    const resetIdleTimer = useCallback(() => {
        if (isPlaying) {
            setChromeVisible(true);
            startIdleTimer();
        }
    }, [isPlaying, startIdleTimer]);

    return {
        chromeVisible,
        handlePeek,
        resetIdleTimer,
    };
}
