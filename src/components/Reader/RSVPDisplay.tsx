import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { splitWord, effectiveBaseFontSize, type TextToken } from '../../utils/textProcessing';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { useStore } from '../../store/useStore';
import { useKineticScrub } from '../../hooks/useKineticScrub';

interface RSVPDisplayProps {
    tokens: TextToken[];
    currentIndex: number;
    fontSize?: number;
    className?: string;
    /** Whether playback is running — stops any in-flight fling so the reel
     *  doesn't keep coasting once the user hits play. */
    isPlaying?: boolean;
    /** Commit a new reading position (drives rsvp.seek). */
    onSeek: (index: number) => void;
    /** Fired when the user starts dragging the reel (pauses playback). */
    onScrubStart: () => void;
    /** Tap on the reel — peeks the reader chrome. */
    onTap?: () => void;
}

// How many neighbor words to render each side of centre. The frame only shows
// ~2, but rendering a couple extra keeps the reel full mid-flick.
const NEIGHBORS = 4;
// On-screen speed (steps/ms) at which neighbours reach full visibility. Below
// this they fade, so they only really show during a flick and melt away as it
// lands — at rest (and during playback) only the centre word is visible.
const NEIGHBOR_FULL_SPEED = 0.02;

/**
 * RSVPDisplay — the single-word "Focus" view, now a vertical date-picker reel.
 *
 * The centred word is the reading position; faded neighbours sit above and
 * below. A finger drag scrubs through the text with iOS-picker momentum (see
 * useKineticScrub): flick and words fly by then decelerate, drag slowly and
 * move one word at a time. The centred word keeps the classic focal-letter pin.
 */
export function RSVPDisplay({
    tokens,
    currentIndex,
    fontSize = 48,
    className = '',
    isPlaying = false,
    onSeek,
    onScrubStart,
    onTap,
}: RSVPDisplayProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const focalRef = useRef<HTMLSpanElement>(null);
    const [focalWidth, setFocalWidth] = useState(0);

    const fitMode = useStore((s) => s.fitMode);

    const len = tokens.length;
    const rowHeight = Math.round(fontSize * 1.5);

    // Continuous reel position + on-screen speed. Driven by the scrubber during
    // a drag/fling and synced to the committed index (with speed 0, so neighbours
    // stay hidden) the rest of the time — auto-play, seeking, rest.
    const [frac, setFrac] = useState(currentIndex);
    const [speed, setSpeed] = useState(0);
    const scrubbing = useRef(false);
    useEffect(() => {
        if (!scrubbing.current) { setFrac(currentIndex); setSpeed(0); }
    }, [currentIndex]);

    const scrub = useKineticScrub({
        axis: 'y',
        getIndex: () => currentIndex,
        min: 0,
        max: Math.max(0, len - 1),
        pxPerStep: rowHeight,
        disabled: len === 0,
        onStart: () => { scrubbing.current = true; onScrubStart(); },
        onFrame: (f, s) => { setFrac(f); setSpeed(s); },
        onCommit: onSeek,
        onTap,
        onSettle: () => { scrubbing.current = false; },
    });

    // Hitting play mid-fling should read from where you are, not keep coasting.
    useEffect(() => { if (isPlaying) scrub.stop(); }, [isPlaying, scrub.stop]);

    // Neighbours fade in with motion and out as the reel lands.
    const motion = Math.min(1, speed / NEIGHBOR_FULL_SPEED);

    const center = Math.max(0, Math.min(len - 1, Math.round(frac)));
    const centerWord = tokens[center]?.word ?? '';

    // Centre word keeps the shrink-to-fit + focal split of the original view.
    const renderFontSize = useFitFontSize(
        centerWord, effectiveBaseFontSize(fontSize, fitMode), rootRef, focalRef, fitMode,
    );

    useLayoutEffect(() => {
        if (focalRef.current) setFocalWidth(focalRef.current.getBoundingClientRect().width);
    }, [centerWord, renderFontSize]);

    const halfFocal = focalWidth / 2;
    const barColor = 'rgb(var(--text) / 0.14)';
    const lineColor = 'rgb(var(--text) / 0.22)';

    if (len === 0) {
        return (
            <div
                className={`relative ${className}`}
                style={{ height: `${fontSize * 4}px`, fontSize: `${fontSize}px` }}
            >
                <GuideFrame barColor={barColor} lineColor={lineColor} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-mocha font-serif">Ready</span>
                </div>
            </div>
        );
    }

    const rows: number[] = [];
    for (let i = center - NEIGHBORS; i <= center + NEIGHBORS; i++) {
        if (i >= 0 && i < len) rows.push(i);
    }

    return (
        <div
            ref={rootRef}
            onPointerDown={scrub.onPointerDown}
            className={`relative w-full overflow-hidden select-none cursor-grab active:cursor-grabbing ${className}`}
            style={{
                height: `${fontSize * 4}px`,
                fontSize: `${renderFontSize}px`,
                touchAction: 'none',
            }}
        >
            <GuideFrame barColor={barColor} lineColor={lineColor} />

            {rows.map((i) => {
                const token = tokens[i];
                const isCenter = i === center;
                const dist = i - frac;
                const offsetY = dist * rowHeight;
                // Centre word is always solid; neighbours fade with distance AND
                // only appear while the reel is moving (motion → 0 at rest).
                const distanceFade = Math.max(0, 1 - Math.abs(dist) * 0.4);
                const opacity = isCenter ? 1 : distanceFade * motion;
                const { before, focal, after } = splitWord(token.word, fitMode);

                return (
                    <div
                        key={token.id}
                        className="absolute left-0 right-0 flex items-center justify-center"
                        style={{
                            top: '50%',
                            height: `${rowHeight}px`,
                            transform: `translateY(calc(-50% + ${offsetY}px))`,
                            opacity,
                            fontSize: isCenter ? `${renderFontSize}px` : `${fontSize}px`,
                        }}
                    >
                        <span
                            className="absolute font-serif text-current whitespace-nowrap"
                            style={{ right: `calc(50% + ${halfFocal}px)` }}
                        >
                            {before}
                        </span>
                        <span
                            ref={isCenter ? focalRef : null}
                            className={`absolute font-serif whitespace-nowrap ${isCenter ? 'text-focal' : 'text-current'}`}
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
                );
            })}
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
                style={{ top: '4px', height: '28%', width: '4px', backgroundColor: lineColor }}
            />

            {/* Bottom vertical center line - extends up from bar, stops before text */}
            <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ bottom: '4px', height: '28%', width: '4px', backgroundColor: lineColor }}
            />
        </>
    );
}
