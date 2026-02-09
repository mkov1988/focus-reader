import { useLayoutEffect, useRef, useState } from 'react';
import { splitWord } from '../../utils/textProcessing';

interface RSVPDisplayProps {
    word: string;
    fontSize?: number;
    className?: string;
}

/**
 * RSVPDisplay Component - Matching Reference Exactly
 * 
 * Design elements:
 * - Thick horizontal bars at top and bottom (full width)
 * - Thin vertical center lines extending from bars toward text (with gap)
 * - NO arms/jut-outs
 * - Focal letter CENTER aligned to vertical guide
 */
export function RSVPDisplay({ word, fontSize = 48, className = '' }: RSVPDisplayProps) {
    const focalRef = useRef<HTMLSpanElement>(null);
    const [focalWidth, setFocalWidth] = useState(0);

    const { before, focal, after } = splitWord(word);

    useLayoutEffect(() => {
        if (focalRef.current && focal) {
            setFocalWidth(focalRef.current.getBoundingClientRect().width);
        }
    }, [focal, fontSize]);

    const halfFocal = focalWidth / 2;
    const barColor = 'rgb(50, 50, 50)'; // Faint gray for bars
    const lineColor = 'rgb(60, 60, 60)'; // Slightly lighter for center lines

    if (!word) {
        return (
            <div
                className={`relative ${className}`}
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
            className={`relative w-full ${className}`}
            style={{
                height: `${fontSize * 4}px`,
                fontSize: `${fontSize}px`,
            }}
        >
            <GuideFrame barColor={barColor} lineColor={lineColor} />

            {/* Word display container - shifted up slightly for visual centering */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ marginTop: '-8px' }}>
                <span
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
                    className="absolute font-serif text-current whitespace-nowrap"
                    style={{ left: `calc(50% + ${halfFocal}px)` }}
                >
                    {after}
                </span>
            </div>
        </div>
    );
}

function GuideFrame({ barColor, lineColor }: { barColor: string; lineColor: string }) {
    return (
        <>
            {/* Top thick horizontal bar - full width */}
            <div
                className="absolute top-0 left-0 right-0"
                style={{ height: '4px', backgroundColor: barColor }}
            />

            {/* Bottom thick horizontal bar - full width */}
            <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: '4px', backgroundColor: barColor }}
            />

            {/* Top vertical center line - extends down from bar, stops before text */}
            <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                    top: '4px',
                    height: '28%',
                    width: '4px',
                    backgroundColor: lineColor
                }}
            />

            {/* Bottom vertical center line - extends up from bar, stops before text */}
            <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                    bottom: '4px',
                    height: '28%',
                    width: '4px',
                    backgroundColor: lineColor
                }}
            />
        </>
    );
}
