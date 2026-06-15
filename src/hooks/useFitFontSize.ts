import { useLayoutEffect, useState, type RefObject } from 'react';
import { splitWord, type FitMode } from '../utils/textProcessing';

// Breathing room (px) kept on each side so a shrunk word never touches the edge.
// Set a few px above the visible gap we want: canvas text measurement runs
// slightly under real rendering, so this absorbs that drift and still leaves a
// comfortable ~10px gap in practice.
const FIT_SIDE_MARGIN = 14;
// Never shrink past this fraction of the base size. Real words never reach it
// (the longest English words sit around 0.6); it only guards against absurd
// input so a freak 40-letter string stays readable instead of vanishing.
const MIN_SCALE = 0.5;

// One reusable canvas context for text measurement (cheap, created lazily).
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
    if (measureCtx) return measureCtx;
    if (typeof document === 'undefined') return null;
    measureCtx = document.createElement('canvas').getContext('2d');
    return measureCtx;
}

/**
 * Font size for the current word that keeps it fully on screen while the focal
 * letter stays dead centre. Normal-length words return `baseFontSize` unchanged;
 * only a word whose longer half would run past the edge is scaled down by the
 * exact ratio needed to fit. The focal letter never leaves the centre and the
 * size is constant for the whole word (no per-letter jitter).
 *
 * How it decides: with the focal letter centred, each half of the word has half
 * the container to live in. We measure the longer half (text before vs after the
 * focal letter, plus half the focal letter) at the base size and, if it overruns
 * the available half, shrink the whole word to match. Measurement uses a canvas
 * with the element's real font, so it matches what actually gets painted, and is
 * always taken at the base size so the result is a stable fixed point (re-running
 * after a shrink yields the same answer — no feedback loop).
 *
 * @param word           the word being shown (may include punctuation)
 * @param baseFontSize   the normal reading size in px
 * @param containerRef   element whose width is the space to fit within
 * @param fontSourceRef  a rendered element carrying the word's font (e.g. the
 *                       focal span); read for font family/weight/style only
 * @param mode           the active fit mode; used to split the word the same way
 *                       it is shown so the measurement matches. Every mode shrinks
 *                       a word that would otherwise overflow (the no-clip backstop).
 */
export function useFitFontSize<C extends HTMLElement, F extends HTMLElement>(
    word: string,
    baseFontSize: number,
    containerRef: RefObject<C | null>,
    fontSourceRef: RefObject<F | null>,
    mode: FitMode,
): number {
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        const measure = () => {
            const container = containerRef.current;
            const fontEl = fontSourceRef.current;
            const ctx = getMeasureCtx();
            if (!container || !fontEl || !ctx || !word) {
                setScale(1);
                return;
            }
            const width = container.getBoundingClientRect().width;
            if (!width) {
                setScale(1);
                return;
            }

            const { before, focal, after } = splitWord(word, mode);
            const cs = getComputedStyle(fontEl);
            // Force the base size so the measurement is independent of the current
            // (possibly already-shrunk) render — this is what makes it stable.
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${baseFontSize}px ${cs.fontFamily}`;

            const halfFocal = ctx.measureText(focal).width / 2;
            const longerHalf = Math.max(
                ctx.measureText(before).width + halfFocal,
                ctx.measureText(after).width + halfFocal,
            );
            const availableHalf = width / 2 - FIT_SIDE_MARGIN;

            const next =
                longerHalf > availableHalf && longerHalf > 0
                    ? Math.max(MIN_SCALE, availableHalf / longerHalf)
                    : 1;
            setScale(next);
        };

        measure();
        // Note: re-fit happens on every word change (deps below), so during
        // reading any width change is absorbed within one word. We intentionally
        // do not listen for viewport resizes — reading is portrait and the only
        // gap would be rotating while paused on one long word.
    }, [word, baseFontSize, containerRef, fontSourceRef, mode]);

    return baseFontSize * scale;
}
