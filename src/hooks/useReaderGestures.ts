import type { PointerEvent as ReactPointerEvent } from 'react';

export interface UseReaderGesturesOpts {
    /** Single tap on the reading surface (low movement, short duration). */
    onTap: () => void;
    /** Swipe LEFT — finger moved leftward past the swipe threshold. By the
     *  stories / e-reader convention this advances forward. */
    onSwipeLeft: () => void;
    /** Swipe RIGHT — finger moved rightward. Goes back. */
    onSwipeRight: () => void;
    /** Strong downward flick — used to dismiss the reader. The threshold
     *  is deliberately large so casual finger movement (or a paragraph-mode
     *  scroll attempt) doesn't accidentally exit. */
    onSwipeDown: () => void;
}

// Tuning constants — picked for "feels right on a phone" not "passes a test".
const TAP_MS = 250;
const TAP_PX = 8;
const SWIPE_PX = 70;
const SWIPE_DOWN_PX = 110;

/**
 * Walk up from the pointer target looking for a vertically-scrollable text
 * surface (the paragraph / hybrid reading area, `overflow-y: auto`). If the
 * gesture started inside one, a vertical drag is the user scrolling the text —
 * NOT a swipe-down-to-exit. Without this, dragging to scroll ejects you out of
 * the reader. We match the scroll region by its declared overflow, not by
 * whether the current paragraph happens to overflow right now — a short
 * paragraph that fits shouldn't suddenly make the drag dismiss the reader.
 */
function startedInVerticalScroller(el: HTMLElement | null): boolean {
    let node: HTMLElement | null = el;
    while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return true;
        node = node.parentElement;
    }
    return false;
}

/**
 * Touch gestures for the reading view. The returned `onPointerDown` is meant
 * to be attached to the wrapper around the visualization. Buttons / inputs /
 * sliders inside the wrapper still work normally — we bail out if the
 * pointerdown landed on an interactive control.
 *
 * Resolution happens on `pointerup`:
 *   - Tap (small move, quick) → onTap()
 *   - Horizontal-dominant swipe past SWIPE_PX → onSwipeLeft / onSwipeRight
 *   - Vertical-dominant swipe-DOWN past SWIPE_DOWN_PX → onSwipeDown
 *   - Anything else → no-op
 *
 * Pointercancel (browser took the gesture for scrolling) aborts everything,
 * so vertical scroll attempts inside e.g. paragraph mode don't accidentally
 * trigger anything.
 */
export function useReaderGestures(opts: UseReaderGesturesOpts) {
    return {
        onPointerDown: (e: ReactPointerEvent) => {
            const target = e.target as HTMLElement;
            // Bail out if the gesture started on an interactive control. The
            // progress bar and paragraph scrubber are `role="slider"` elements
            // that own their own drag handling — without this, a horizontal
            // scrub drag would also bubble up here and fire a sentence-skip,
            // fighting the seek the user just made.
            if (target.closest('button, input, [role="button"], [role="slider"], a, label, select, textarea')) return;

            // If the drag begins inside a scrollable text area, vertical
            // movement is scrolling — suppress the swipe-down-to-exit so the
            // reader doesn't get dismissed when you scroll up through the text.
            const inScroller = startedInVerticalScroller(target);

            const startX = e.clientX;
            const startY = e.clientY;
            const startTime = Date.now();
            const pointerId = e.pointerId;
            let resolved = false;

            const cleanup = () => {
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onCancel);
            };

            const onUp = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId || resolved) return;
                resolved = true;
                cleanup();

                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                const absX = Math.abs(dx);
                const absY = Math.abs(dy);
                const elapsed = Date.now() - startTime;

                if (absX < TAP_PX && absY < TAP_PX && elapsed < TAP_MS) {
                    opts.onTap();
                    return;
                }
                if (absX > absY && absX > SWIPE_PX) {
                    if (dx < 0) opts.onSwipeLeft();
                    else opts.onSwipeRight();
                    return;
                }
                if (!inScroller && dy > absX && dy > SWIPE_DOWN_PX) {
                    opts.onSwipeDown();
                    return;
                }
            };

            const onCancel = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                resolved = true;
                cleanup();
            };

            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
        },
    };
}
