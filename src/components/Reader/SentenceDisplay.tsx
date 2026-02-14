import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TextToken } from '../../utils/textProcessing';

interface SentenceDisplayProps {
    tokens: TextToken[];
    currentIndex: number;
    fontSize: number;
    className?: string;
    onWordClick?: (index: number) => void;
    onLineBreaksChange?: (indices: Set<number>) => void;
}

// Constants
const TRANSITION_DURATION = 150;
const LINE_HEIGHT_THRESHOLD_RATIO = 0.5;

export function SentenceDisplay({
    tokens,
    currentIndex,
    fontSize,
    className = '',
    onWordClick,
    onLineBreaksChange
}: SentenceDisplayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLSpanElement>(null);
    const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

    // State for managing transitions
    const [visibleTokens, setVisibleTokens] = useState<TextToken[]>(tokens);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [opacity, setOpacity] = useState(1);

    // Check if we have a new sentence
    const currentFirstId = tokens.length > 0 ? tokens[0].id : -1;
    const visibleFirstId = visibleTokens.length > 0 ? visibleTokens[0].id : -1;

    // Detect line breaks when tokens or size changes
    useLayoutEffect(() => {
        if (!onLineBreaksChange || visibleTokens.length === 0) return;

        const measure = () => {
            const lineStartIndices = new Set<number>();
            let lastTop = -1;
            let refCount = 0;

            visibleTokens.forEach((token) => {
                const el = wordRefs.current.get(token.id);
                if (el) {
                    refCount++;
                    const rect = el.getBoundingClientRect();

                    if (lastTop === -1) {
                        lastTop = rect.top;
                        lineStartIndices.add(token.id);
                    } else if (rect.top > lastTop + (fontSize * LINE_HEIGHT_THRESHOLD_RATIO)) {
                        lineStartIndices.add(token.id);
                        lastTop = rect.top;
                    }
                }
            });

            if (refCount > 0) {
                onLineBreaksChange(lineStartIndices);
            }
        };

        // Measure immediately
        measure();

        // And retry after a frame just in case of layout thrashing
        const raf = requestAnimationFrame(measure);

        return () => cancelAnimationFrame(raf);
    }, [visibleTokens, fontSize, onLineBreaksChange]);

    // Detect new sentence -> Trigger Fade Out
    useEffect(() => {
        if (currentFirstId !== visibleFirstId) {
            setOpacity(0);
            setIsTransitioning(true);

            // Wait for fade out (matches CSS duration), then swap data
            const timeout = setTimeout(() => {
                setVisibleTokens(tokens);
                // We do NOT fade in here. We wait for layout effect to handle the scroll reset first.
            }, TRANSITION_DURATION);

            return () => clearTimeout(timeout);
        }
    }, [currentFirstId, visibleFirstId, tokens]);

    // Handle Scroll Reset (Instant) when new tokens appear
    useLayoutEffect(() => {
        if (isTransitioning && containerRef.current && activeRef.current) {
            // We are hidden and just swapped tokens.
            // INSTANTLY jump to center.
            const container = containerRef.current;
            const element = activeRef.current;

            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const containerCenter = containerRect.top + (containerRect.height / 2);
            const elementCenter = elementRect.top + (elementRect.height / 2);
            const diff = elementCenter - containerCenter;

            container.scrollBy({
                top: diff,
                behavior: 'auto' // INSTANT
            });

            // Now that we are positioned, fade back in
            requestAnimationFrame(() => {
                setOpacity(1);
                setIsTransitioning(false);
            });
        }
    }, [visibleTokens, isTransitioning]);

    // Handle Active Word Tracking (Smooth) within the same sentence
    useEffect(() => {
        // Only run if we are NOT transitioning (i.e. normal reading)
        if (activeRef.current && containerRef.current && !isTransitioning && opacity === 1) {
            const container = containerRef.current;
            const element = activeRef.current;

            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const containerCenter = containerRect.top + (containerRect.height / 2);
            const elementCenter = elementRect.top + (elementRect.height / 2);
            const diff = elementCenter - containerCenter;

            // Only scroll if significantly off-center
            if (Math.abs(diff) > 5) {
                container.scrollBy({
                    top: diff,
                    behavior: 'smooth' // SMOOTH tracking
                });
            }
        }
    }, [currentIndex, fontSize, isTransitioning, opacity]);

    const displaySize = Math.max(32, Math.min(fontSize * 0.8, 64));

    return (
        <div
            ref={containerRef}
            className={`
                w-full max-w-3xl mx-auto h-[50vh] overflow-hidden relative
                p-8 text-center leading-normal no-scrollbar
                ${className}
            `}
            style={{ fontSize: `${displaySize}px` }}
        >
            <div
                className="flex flex-wrap justify-center gap-x-[0.3em] min-h-full items-center py-[25vh] transition-opacity duration-150 ease-in-out"
                style={{ opacity }}
            >
                {visibleTokens.map((token) => {
                    const isActive = token.id === currentIndex;
                    const isPassed = token.id < currentIndex;

                    return (
                        <span
                            key={token.id}
                            ref={(el) => {
                                if (isActive) activeRef.current = el;
                                if (el) wordRefs.current.set(token.id, el);
                                else wordRefs.current.delete(token.id);
                            }}
                            onClick={() => onWordClick?.(token.id)}
                            className={`
                                cursor-pointer transition-all duration-150 rounded px-1 -mx-1 inline-block
                                ${isActive
                                    ? 'bg-focal/10 text-focal scale-110 shadow-sm'
                                    : isPassed
                                        ? 'text-gray-400 dark:text-gray-600 opacity-60'
                                        : 'text-gray-800 dark:text-gray-200 opacity-100'
                                }
                            `}
                        >
                            {token.word}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
