import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import type { TextToken } from '../../utils/textProcessing';

interface ParagraphDisplayProps {
    paragraphTokens: TextToken[];
    currentIndex: number;
    fontSize: number;
    className?: string;
    onWordClick?: (index: number) => void;
    /** Fired when the user scrolls the text vertically by hand (wheel or a
     *  vertical touch drag). Lets the reader pause playback so the auto-recenter
     *  stops yanking the scroll position back. Programmatic recenter scrolls do
     *  not trigger this — only real input events do. */
    onManualScroll?: () => void;
    /** Fired when the user over-scrolls past the top (-1) or bottom (+1) edge.
     *  `count` is how many paragraphs to jump — 1 for a normal push, more for a
     *  strong flick. */
    onAdvanceParagraph?: (dir: -1 | 1, count: number) => void;
}

// How close to an edge (px) counts as "at the edge".
const EDGE_SLOP = 2;
// Deliberate over-scroll past the edge (px) before an advance fires. This is the
// "barrier": simply reaching the bottom while reading doesn't jump you onward —
// you have to keep dragging past it.
const OVERSCROLL_MIN = 34;
// Accumulated wheel delta past the edge before advancing (desktop).
const WHEEL_MIN = 90;
// Native scroll is disabled this long while the new paragraph lands, so the
// finger's leftover fling can't drag it down into the middle.
const LANDING_MS = 420;
// Over-scroll flick speed (px/ms) → how many paragraphs the flick jumps.
const V_TWO = 0.9;
const V_THREE = 1.5;

export function ParagraphDisplay({
    paragraphTokens,
    currentIndex,
    fontSize,
    className = '',
    onWordClick,
    onManualScroll,
    onAdvanceParagraph,
}: ParagraphDisplayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLSpanElement>(null);
    const shouldInstantScroll = useRef(true);
    const touchStart = useRef<{ x: number; y: number } | null>(null);
    const advanceLock = useRef(false);
    // Where the finger was when it first reached the edge, to measure over-scroll.
    const edgeAnchor = useRef<{ dir: 1 | -1; y: number } | null>(null);
    // Recent {t, y} samples for release-velocity (→ paragraph count).
    const velSamples = useRef<{ t: number; y: number }[]>([]);
    const wheelAccum = useRef(0);
    // When set, the next paragraph render lands at the TOP instead of centring.
    const landTop = useRef(false);
    // Paragraphs jumped by the last flick — scales the slide-in so a big flick
    // reads as travelling further.
    const enterCount = useRef(1);

    // Direction the next paragraph swap should animate from. Compared against the
    // last-rendered paragraph index; read (not mutated) during render.
    const lastParaIndex = useRef<number | null>(null);
    const paraIndex = paragraphTokens[0]?.paragraphIndex ?? null;
    const enterDir: 1 | -1 =
        lastParaIndex.current != null && paraIndex != null && paraIndex < lastParaIndex.current ? -1 : 1;
    useLayoutEffect(() => {
        lastParaIndex.current = paraIndex;
    }, [paraIndex]);

    const atTop = () => (containerRef.current?.scrollTop ?? 0) <= EDGE_SLOP;
    const atBottom = () => {
        const el = containerRef.current;
        if (!el) return false;
        return el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE_SLOP;
    };

    const releaseSpeed = () => {
        const s = velSamples.current;
        if (s.length < 2) return 0;
        const a = s[0];
        const b = s[s.length - 1];
        const dt = b.t - a.t;
        return dt > 0 ? Math.abs(b.y - a.y) / dt : 0;
    };

    const doAdvance = (dir: -1 | 1, count: number) => {
        if (advanceLock.current || !onAdvanceParagraph || count < 1) return;
        advanceLock.current = true;
        landTop.current = true;
        enterCount.current = count;
        // Kill any native fling so it can't carry into the new paragraph.
        const el = containerRef.current;
        if (el) el.style.overflowY = 'hidden';
        onAdvanceParagraph(dir, count);
        window.setTimeout(() => {
            advanceLock.current = false;
            enterCount.current = 1; // back to the normal slide for playback transitions
            if (containerRef.current) containerRef.current.style.overflowY = '';
        }, LANDING_MS);
    };

    const triggerAdvance = (dir: -1 | 1) => {
        const speed = releaseSpeed();
        const count = speed < V_TWO ? 1 : speed < V_THREE ? 2 : 3;
        doAdvance(dir, count);
        touchStart.current = null;
        edgeAnchor.current = null;
    };

    const handleWheel = (e: React.WheelEvent) => {
        onManualScroll?.();
        if (advanceLock.current) return;
        const downAtBottom = e.deltaY > 0 && atBottom();
        const upAtTop = e.deltaY < 0 && atTop();
        if (downAtBottom || upAtTop) {
            wheelAccum.current += Math.abs(e.deltaY);
            if (wheelAccum.current > WHEEL_MIN) {
                const mag = wheelAccum.current;
                const count = mag < 220 ? 1 : mag < 440 ? 2 : 3;
                wheelAccum.current = 0;
                doAdvance(downAtBottom ? 1 : -1, count);
            }
        } else {
            wheelAccum.current = 0;
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY };
        edgeAnchor.current = null;
        velSamples.current = [{ t: performance.now(), y: t.clientY }];
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        const start = touchStart.current;
        if (!start) return;
        const t = e.touches[0];

        const now = performance.now();
        velSamples.current.push({ t: now, y: t.clientY });
        while (velSamples.current.length > 2 && now - velSamples.current[0].t > 90) velSamples.current.shift();

        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        // Only vertical-dominant drags count as scrolling.
        if (Math.abs(dy) <= 8 || Math.abs(dy) <= Math.abs(dx)) return;

        onManualScroll?.();
        if (advanceLock.current) return;

        // Over-scroll past an edge → change paragraph, but only once the finger has
        // dragged a deliberate distance PAST the edge (the barrier).
        if (dy < 0 && atBottom()) {
            if (!edgeAnchor.current || edgeAnchor.current.dir !== 1) edgeAnchor.current = { dir: 1, y: t.clientY };
            if (edgeAnchor.current.y - t.clientY > OVERSCROLL_MIN) triggerAdvance(1);
        } else if (dy > 0 && atTop()) {
            if (!edgeAnchor.current || edgeAnchor.current.dir !== -1) edgeAnchor.current = { dir: -1, y: t.clientY };
            if (t.clientY - edgeAnchor.current.y > OVERSCROLL_MIN) triggerAdvance(-1);
        } else {
            edgeAnchor.current = null;
        }
    };

    useLayoutEffect(() => {
        shouldInstantScroll.current = true;
    }, [paragraphTokens]);

    // Position on paragraph/word change: land a flicked advance at the TOP of the
    // new paragraph; otherwise keep the active word centred (reading flow).
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        if (landTop.current) {
            landTop.current = false;
            container.scrollTop = 0;
            shouldInstantScroll.current = false;
            return;
        }

        if (activeRef.current) {
            const element = activeRef.current;
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const containerCenter = containerRect.top + containerRect.height / 2;
            const elementCenter = elementRect.top + elementRect.height / 2;
            const diff = elementCenter - containerCenter;
            if (Math.abs(diff) > 2) {
                container.scrollBy({ top: diff, behavior: shouldInstantScroll.current ? 'auto' : 'smooth' });
            }
            shouldInstantScroll.current = false;
        }
    }, [currentIndex]);

    // Scale font size: Paragraph view usually needs smaller font than RSVP
    // Let's use a multiplier, e.g., 50% of RSVP size, but clamped
    const displaySize = Math.max(24, Math.min(fontSize * 0.6, 48));

    // Slide-in distance / duration grow with how many paragraphs the flick jumped.
    const enterDist = 28 + (enterCount.current - 1) * 42;
    const enterDur = 300 + (enterCount.current - 1) * 150;

    return (
        <div
            ref={containerRef}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            className={`
                w-full max-w-2xl mx-auto h-full overflow-y-auto overscroll-contain
                leading-relaxed px-4 sm:px-8 py-32 rounded-xl bg-espresso/[0.04]
                ${className}
            `}
            style={{ fontSize: `${displaySize}px` }}
        >
            {/* Keyed by paragraph so each new paragraph remounts and plays the
                slide-in animation (from below when going forward, above when back). */}
            <div
                key={paragraphTokens[0]?.id ?? 'empty'}
                className={`flex flex-wrap text-left gap-x-[0.25em] ${enterDir === 1 ? 'para-enter-up' : 'para-enter-down'}`}
                style={{ '--enter-dist': `${enterDist}px`, animationDuration: `${enterDur}ms` } as React.CSSProperties}
            >
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
                                        ? 'text-mocha/50'
                                        : 'text-espresso/85'
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
