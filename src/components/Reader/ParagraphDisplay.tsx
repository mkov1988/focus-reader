import { useLayoutEffect, useRef } from 'react';
import type { TextToken } from '../../utils/textProcessing';

interface ParagraphDisplayProps {
    paragraphTokens: TextToken[];
    currentIndex: number;
    fontSize: number;
    className?: string;
    onWordClick?: (index: number) => void;
}

export function ParagraphDisplay({
    paragraphTokens,
    currentIndex,
    fontSize,
    className = '',
    onWordClick
}: ParagraphDisplayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLSpanElement>(null);
    const shouldInstantScroll = useRef(true);

    useLayoutEffect(() => {
        shouldInstantScroll.current = true;
    }, [paragraphTokens]);

    // Auto-scroll to keep active word in CENTER of view
    useLayoutEffect(() => {
        if (activeRef.current && containerRef.current) {
            const container = containerRef.current;
            const element = activeRef.current;

            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();

            // Calculate centers
            const containerCenter = containerRect.top + (containerRect.height / 2);
            const elementCenter = elementRect.top + (elementRect.height / 2);

            // Calculate difference
            const diff = elementCenter - containerCenter;

            // Scroll if difference is significant (avoid micro-jitters)
            if (Math.abs(diff) > 2) {
                container.scrollBy({
                    top: diff,
                    behavior: shouldInstantScroll.current ? 'auto' : 'smooth',
                });
            }

            shouldInstantScroll.current = false;
        }
    }, [currentIndex]);

    // Scale font size: Paragraph view usually needs smaller font than RSVP
    // Let's use a multiplier, e.g., 50% of RSVP size, but clamped
    const displaySize = Math.max(24, Math.min(fontSize * 0.6, 48));

    return (
        <div
            ref={containerRef}
            className={`
                w-full max-w-2xl mx-auto h-[60vh] overflow-y-auto 
                leading-relaxed px-8 py-[30vh] rounded-xl bg-white/5 dark:bg-black/20
                scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600
                ${className}
            `}
            style={{ fontSize: `${displaySize}px` }}
        >
            <div className="flex flex-wrap text-left gap-x-[0.25em]">
                {paragraphTokens.map((token) => {
                    const isActive = token.id === currentIndex;
                    const isPassed = token.id < currentIndex;

                    return (
                        <span
                            key={token.id}
                            ref={isActive ? activeRef : null}
                            onClick={() => onWordClick?.(token.id)}
                            className={`
                                cursor-pointer transition-colors duration-100 rounded px-1 -mx-1 inline-block
                                ${isActive
                                    ? 'bg-focal/20 text-focal scale-105'
                                    : isPassed
                                        ? 'text-gray-400 dark:text-gray-600'
                                        : 'text-gray-700 dark:text-gray-300'
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
