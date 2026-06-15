import { useLayoutEffect, useRef, useState, useMemo } from 'react';
import { splitWord, effectiveBaseFontSize, type TextToken } from '../../utils/textProcessing';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { useStore } from '../../store/useStore';

interface GhostTrailDisplayProps {
    tokens: TextToken[];
    currentIndex: number;
    fontSize?: number;
    className?: string;
}

/**
 * GhostTrailDisplay — Same ORP-centered layout as RSVPDisplay,
 * but with faded neighboring words trailing on either side.
 *
 * The focal letter of the current word is ALWAYS pinned to the
 * center vertical guide — identical to the RSVP view.
 */

const TRAIL_COUNT = 5; // number of ghost words on each side

export function GhostTrailDisplay({
    tokens,
    currentIndex,
    fontSize = 48,
    className = '',
}: GhostTrailDisplayProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const focalRef = useRef<HTMLSpanElement>(null);
    const beforeRef = useRef<HTMLSpanElement>(null);
    const afterRef = useRef<HTMLSpanElement>(null);

    const [focalWidth, setFocalWidth] = useState(0);
    const [beforeWidth, setBeforeWidth] = useState(0);
    const [afterWidth, setAfterWidth] = useState(0);

    const fitMode = useStore((s) => s.fitMode);
    const currentWord = tokens[currentIndex]?.word || '';
    const { before, focal, after } = splitWord(currentWord, fitMode);

    // 'compact' reads at one slightly smaller base; every mode then shrinks a word
    // that would still overflow so nothing clips. Focal stays centred.
    const renderFontSize = useFitFontSize(currentWord, effectiveBaseFontSize(fontSize, fitMode), rootRef, focalRef, fitMode);

    useLayoutEffect(() => {
        if (focalRef.current) setFocalWidth(focalRef.current.getBoundingClientRect().width);
        if (beforeRef.current) setBeforeWidth(beforeRef.current.getBoundingClientRect().width);
        if (afterRef.current) setAfterWidth(afterRef.current.getBoundingClientRect().width);
    }, [before, focal, after, renderFontSize]);

    const halfFocal = focalWidth / 2;
    const barColor = 'rgb(var(--text) / 0.14)';
    const lineColor = 'rgb(var(--text) / 0.22)';

    // Build ghost word lists
    const { leftGhosts, rightGhosts } = useMemo(() => {
        const left: { word: string; opacity: number }[] = [];
        const right: { word: string; opacity: number }[] = [];

        for (let i = 1; i <= TRAIL_COUNT; i++) {
            const opacity = Math.max(0.04, 1 - i * 0.2);

            const li = currentIndex - i;
            if (li >= 0) {
                left.unshift({ word: tokens[li].word, opacity });
            }

            const ri = currentIndex + i;
            if (ri < tokens.length) {
                right.push({ word: tokens[ri].word, opacity });
            }
        }
        return { leftGhosts: left, rightGhosts: right };
    }, [tokens, currentIndex]);

    // Ghosts track the current word's size so the trail stays in proportion when
    // a long focal word shrinks (the focused word always reads larger than them).
    const ghostFontSize = renderFontSize * 0.82;
    const ghostColor = 'rgb(var(--text-muted))';

    if (!currentWord) {
        return (
            <div
                className={`relative w-full ${className}`}
                style={{ height: `${fontSize * 4}px`, fontSize: `${fontSize}px` }}
            >
                <GuideFrame barColor={barColor} lineColor={lineColor} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-mocha font-serif">Ready</span>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={rootRef}
            className={`relative w-full overflow-hidden ${className}`}
            style={{ height: `${fontSize * 4}px`, fontSize: `${renderFontSize}px` }}
        >
            <GuideFrame barColor={barColor} lineColor={lineColor} />

            {/* Current word — focal letter pinned to center, identical to RSVPDisplay */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ marginTop: '-8px' }}>
                <span
                    ref={beforeRef}
                    className="absolute font-serif text-current whitespace-nowrap"
                    style={{ right: `calc(50% + ${halfFocal}px)` }}
                >
                    {before}
                </span>

                <span
                    ref={focalRef}
                    className="absolute font-serif text-focal whitespace-nowrap"
                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                >
                    {focal}
                </span>

                <span
                    ref={afterRef}
                    className="absolute font-serif text-current whitespace-nowrap"
                    style={{ left: `calc(50% + ${halfFocal}px)` }}
                >
                    {after}
                </span>
            </div>

            {/* Left ghosts — trailing behind the current word's "before" text */}
            <div
                className="absolute inset-0 flex items-center"
                style={{ marginTop: '-8px' }}
            >
                <div
                    className="absolute flex items-baseline gap-[0.3em]"
                    style={{
                        right: `calc(50% + ${halfFocal}px)`,
                        // push past the "before" text with precise measured width + 8px gap
                        marginRight: before ? `${beforeWidth + 8}px` : '8px',
                        direction: 'rtl', // flow words right-to-left from the anchor
                    }}
                >
                    {/* Reverse so nearest word is closest to center */}
                    {[...leftGhosts].reverse().map((g, i) => (
                        <span
                            key={`l-${currentIndex}-${i}`}
                            className="font-serif whitespace-nowrap"
                            style={{
                                opacity: g.opacity,
                                fontSize: `${ghostFontSize}px`,
                                color: ghostColor,
                                direction: 'ltr', // text reads left-to-right
                            }}
                        >
                            {g.word}
                        </span>
                    ))}
                </div>
            </div>

            {/* Right ghosts — leading ahead of the current word's "after" text */}
            <div
                className="absolute inset-0 flex items-center"
                style={{ marginTop: '-8px' }}
            >
                <div
                    className="absolute flex items-baseline gap-[0.3em]"
                    style={{
                        left: `calc(50% + ${halfFocal}px)`,
                        marginLeft: after ? `${afterWidth + 8}px` : '8px',
                    }}
                >
                    {rightGhosts.map((g, i) => (
                        <span
                            key={`r-${currentIndex}-${i}`}
                            className="font-serif whitespace-nowrap"
                            style={{
                                opacity: g.opacity,
                                fontSize: `${ghostFontSize}px`,
                                color: ghostColor,
                            }}
                        >
                            {g.word}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}


function GuideFrame({ barColor, lineColor }: { barColor: string; lineColor: string }) {
    return (
        <>
            <div
                className="absolute top-0 left-0 right-0"
                style={{ height: '4px', backgroundColor: barColor }}
            />
            <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: '4px', backgroundColor: barColor }}
            />
            <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: '4px', height: '28%', width: '4px', backgroundColor: lineColor }}
            />
            <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ bottom: '4px', height: '28%', width: '4px', backgroundColor: lineColor }}
            />
        </>
    );
}
