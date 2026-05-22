import { useLayoutEffect, useRef, useState, useMemo } from 'react';
import { splitWord, type TextToken } from '../../utils/textProcessing';

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
    const focalRef = useRef<HTMLSpanElement>(null);
    const beforeRef = useRef<HTMLSpanElement>(null);
    const afterRef = useRef<HTMLSpanElement>(null);

    const [focalWidth, setFocalWidth] = useState(0);
    const [beforeWidth, setBeforeWidth] = useState(0);
    const [afterWidth, setAfterWidth] = useState(0);

    const currentWord = tokens[currentIndex]?.word || '';
    const { before, focal, after } = splitWord(currentWord);

    useLayoutEffect(() => {
        if (focalRef.current) setFocalWidth(focalRef.current.getBoundingClientRect().width);
        if (beforeRef.current) setBeforeWidth(beforeRef.current.getBoundingClientRect().width);
        if (afterRef.current) setAfterWidth(afterRef.current.getBoundingClientRect().width);
    }, [before, focal, after, fontSize]);

    const halfFocal = focalWidth / 2;
    const barColor = 'rgb(50, 50, 50)';
    const lineColor = 'rgb(60, 60, 60)';

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

    const ghostFontSize = fontSize * 0.82;
    const ghostColor = 'rgb(100, 100, 110)';

    if (!currentWord) {
        return (
            <div
                className={`relative w-full ${className}`}
                style={{ height: `${fontSize * 4}px`, fontSize: `${fontSize}px` }}
            >
                <GuideFrame barColor={barColor} lineColor={lineColor} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-gray-500 font-serif">Ready</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`relative w-full overflow-hidden ${className}`}
            style={{ height: `${fontSize * 4}px`, fontSize: `${fontSize}px` }}
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
