import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TextToken } from '../../utils/textProcessing';
import { useKineticScrub } from '../../hooks/useKineticScrub';

interface SentenceDisplayProps {
    /** Full token stream — the reel shows a moving window of it. */
    tokens: TextToken[];
    currentIndex: number;
    fontSize: number;
    className?: string;
    onWordClick?: (index: number) => void;
    /** Commit a new reading position (drives rsvp.seek). */
    onSeek?: (index: number) => void;
    /** Fired when the user starts dragging (pauses playback). */
    onScrubStart?: () => void;
    // Accepted for API compatibility with the old wrapped layout; unused here.
    onLineBreaksChange?: (indices: Set<number>) => void;
    totalTokens?: number;
}

// Words rendered each side of centre — enough overlap that even a fast flick
// keeps the bracketing words on screen.
const WINDOW = 9;

// One reusable canvas for measuring word widths off the render path, so layout
// is analytic and the animation never reads the DOM (no layout thrash).
let _measureCtx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D | null {
    if (_measureCtx) return _measureCtx;
    if (typeof document === 'undefined') return null;
    _measureCtx = document.createElement('canvas').getContext('2d');
    return _measureCtx;
}

/**
 * SentenceDisplay — a horizontal reading reel. Words flow left/right in a single
 * line; the centred word is the reading position, and a finger flick sends them
 * streaming past with the shared kinetic momentum, easing smoothly onto a word
 * when it lands (see useKineticScrub).
 *
 * Smoothness comes from decoupling motion from React: the strip's translate is
 * written **imperatively** every frame (from a fractional-position ref), so the
 * flick never waits on a render. React only re-renders per *word* — to move the
 * highlight and shift the rendered window. Word widths are measured once with a
 * canvas and cached, so positions are pure arithmetic with no DOM reads.
 */
export function SentenceDisplay({
    tokens,
    currentIndex,
    fontSize,
    className = '',
    onWordClick,
    onSeek,
    onScrubStart,
}: SentenceDisplayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);

    const len = tokens.length;
    const displaySize = Math.max(32, Math.min(fontSize * 0.8, 64));
    const gap = displaySize * 0.4;
    // Roughly one average word-width of drag per word so the strip tracks the
    // finger. Variable widths make this an estimate, not exact 1:1.
    const pxPerStep = Math.round(displaySize * 2.6);

    // Imperative animation state (no React renders in the hot path).
    const fracRef = useRef(currentIndex);      // continuous reading position
    const midsRef = useRef<Map<number, number>>(new Map()); // index → centre-x in strip
    const contWRef = useRef(0);                 // container width
    const scrubbing = useRef(false);

    // Font measurement (off the animation path).
    const fontRef = useRef('');
    const widthCache = useRef<Map<string, number>>(new Map());
    const [, bump] = useState(0); // one re-render once real font widths are ready

    const measure = useCallback((word: string) => {
        const cx = measureCtx();
        if (!cx || !fontRef.current) return word.length * displaySize * 0.5; // pre-font fallback
        const cache = widthCache.current;
        const hit = cache.get(word);
        if (hit != null) return hit;
        cx.font = fontRef.current;
        const w = cx.measureText(word).width;
        cache.set(word, w);
        return w;
    }, [displaySize]);

    // Write the strip transform straight to the DOM from the current fractional
    // position. Called on every drag / inertia frame — must stay cheap.
    const applyTransform = useCallback(() => {
        const strip = stripRef.current;
        if (!strip) return;
        const mids = midsRef.current;
        const f = fracRef.current;
        const i0 = Math.floor(f);
        const m0 = mids.get(i0);
        const m1 = mids.get(i0 + 1);
        const at = m0 != null && m1 != null ? m0 + (m1 - m0) * (f - i0) : (m0 ?? m1 ?? 0);
        strip.style.transform = `translate3d(${contWRef.current / 2 - at}px, 0, 0)`;
    }, []);

    // Measure font + width when the size changes; force one re-render so the row
    // lays out with real (not fallback) widths.
    useLayoutEffect(() => {
        const strip = stripRef.current;
        const cont = containerRef.current;
        if (!strip || !cont) return;
        const cs = getComputedStyle(strip);
        fontRef.current = `${cs.fontStyle} ${cs.fontWeight} ${displaySize}px ${cs.fontFamily}`;
        widthCache.current.clear();
        contWRef.current = cont.clientWidth;
        bump((n) => n + 1);
    }, [displaySize]);

    useEffect(() => {
        const cont = containerRef.current;
        if (!cont || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => { contWRef.current = cont.clientWidth; applyTransform(); });
        ro.observe(cont);
        return () => ro.disconnect();
    }, [applyTransform]);

    const scrub = useKineticScrub({
        axis: 'x',
        getIndex: () => currentIndex,
        min: 0,
        max: Math.max(0, len - 1),
        pxPerStep,
        disabled: !onSeek || len === 0,
        onStart: () => { scrubbing.current = true; onScrubStart?.(); },
        onFrame: (f) => { fracRef.current = f; applyTransform(); },
        onCommit: (i) => onSeek?.(i),
        onSettle: () => { scrubbing.current = false; },
    });

    // Rendered window is built from the COMMITTED index — so this re-renders once
    // per word, not once per frame.
    const center = Math.max(0, Math.min(Math.max(0, len - 1), currentIndex));
    const indices: number[] = [];
    for (let i = center - WINDOW; i <= center + WINDOW; i++) {
        if (i >= 0 && i < len) indices.push(i);
    }

    // Cumulative left edges + centres (analytic; cached widths).
    let x = 0;
    const geo = indices.map((i) => {
        const w = measure(tokens[i].word);
        const g = { i, left: x, mid: x + w / 2 };
        x += w + gap;
        return g;
    });
    // Cache centres for the imperative transform.
    const mids = new Map<number, number>();
    for (const g of geo) mids.set(g.i, g.mid);
    midsRef.current = mids;

    // Re-sync the transform after each render (window shift / external seek).
    useLayoutEffect(() => {
        if (!scrubbing.current) fracRef.current = currentIndex;
        applyTransform();
    });

    if (len === 0) {
        return <div className={`w-full h-full ${className}`} />;
    }

    return (
        <div
            ref={containerRef}
            onPointerDown={scrub.onPointerDown}
            className={`w-full h-full relative overflow-hidden select-none cursor-grab active:cursor-grabbing ${className}`}
            style={{
                touchAction: 'pan-y',
                fontSize: `${displaySize}px`,
                // Soft-fade the words at the left/right edges.
                WebkitMaskImage: 'linear-gradient(to right, transparent, #000 15%, #000 85%, transparent)',
                maskImage: 'linear-gradient(to right, transparent, #000 15%, #000 85%, transparent)',
            }}
        >
            <div
                ref={stripRef}
                className="absolute inset-y-0 left-0 will-change-transform font-serif"
                style={{ transform: 'translate3d(0,0,0)' }}
            >
                {geo.map((g) => {
                    const token = tokens[g.i];
                    const dist = Math.abs(g.i - center);
                    const isCurrent = g.i === center;
                    const opacity = Math.max(0.2, 1 - dist * 0.16);
                    return (
                        <span
                            key={token.id}
                            onClick={() => onWordClick?.(token.id)}
                            className={`absolute top-1/2 whitespace-nowrap cursor-pointer ${isCurrent ? 'text-focal' : 'text-current'}`}
                            style={{ left: `${g.left}px`, transform: 'translateY(-50%)', opacity }}
                        >
                            {token.word}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
