import type { PointerEvent as ReactPointerEvent } from 'react';

interface PressGestureOptions {
    /** Fired once the user has committed to a press-and-hold gesture: either
     *  by holding for `holdMs` without moving, or by pulling the element
     *  vertically past `moveThreshold`. The caller hands off the rest of the
     *  gesture (move tracking, release) to the open-transition. */
    onPress: () => void;
    /** Fired on a quick tap (released before `holdMs` with little movement).
     *  Opens the book via the auto-commit path — no gesture tracking, just
     *  "I tapped, open it." */
    onActivate?: () => void;
    /** ms to wait before committing to press when the user just holds. */
    holdMs?: number;
    /** Pixels of movement past which we'll commit (or abort). */
    moveThreshold?: number;
    /** Extra horizontal travel that biases ambiguous diagonal swipes toward
     *  "this is a scroll, let the browser handle it". */
    horizontalBias?: number;
}

const DEFAULT_HOLD_MS = 130;
const DEFAULT_MOVE = 10;
const DEFAULT_BIAS = 4;

/**
 * Disambiguate "press-and-hold to open a book" from "I'm scrolling".
 * Fire this from a React `onPointerDown` handler.
 *
 * Resolution:
 *   - Held for `holdMs` without enough movement → `onPress()`
 *   - Vertical-dominant movement past `moveThreshold` → `onPress()` (committed)
 *   - Horizontal-dominant movement past `moveThreshold` → abort (browser scroll)
 *   - Released quickly with little movement → `onActivate()` (treat as tap)
 *   - `pointercancel` (browser claimed it for scroll) → abort
 *
 * Listeners are window-level (so they keep firing even if the finger leaves
 * the element bounds) and filtered by `pointerId` (multi-touch safe).
 */
export function startPressGesture(
    e: ReactPointerEvent,
    {
        onPress,
        onActivate,
        holdMs = DEFAULT_HOLD_MS,
        moveThreshold = DEFAULT_MOVE,
        horizontalBias = DEFAULT_BIAS,
    }: PressGestureOptions,
): void {
    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();
    const pointerId = e.pointerId;

    // One-shot: the first resolution path that wins gets to fire.
    let resolved = false;

    const cleanup = () => {
        window.clearTimeout(holdTimer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
    };

    const commitPress = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        onPress();
    };

    const commitTap = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        onActivate?.();
    };

    const abort = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
    };

    const holdTimer = window.setTimeout(commitPress, holdMs);

    const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || resolved) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX > absY + horizontalBias && absX > moveThreshold) {
            abort();
            return;
        }
        if (absY > moveThreshold) {
            commitPress();
        }
    };

    const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || resolved) return;
        const elapsed = Date.now() - startTime;
        if (elapsed < holdMs) commitTap();
    };

    const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        abort();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
}
