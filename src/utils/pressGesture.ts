import type { PointerEvent as ReactPointerEvent } from 'react';

interface PressGestureOptions {
    /** Fired once the user has committed to picking the book up — by holding
     *  past `holdMs`, or (mouse only) by dragging past `moveThreshold`. The
     *  caller hands the rest of the gesture (finger-follow, release) off to
     *  the open-transition. */
    onPress: () => void;
    /** Fired on a quick tap (released before `holdMs` with little movement).
     *  Opens the book via the instant auto-commit path — no follow phase. */
    onActivate?: () => void;
    /** ms to hold (roughly still) before a press commits to a pickup. */
    holdMs?: number;
    /** Pixels a mouse must drag before it counts as a deliberate pickup. */
    moveThreshold?: number;
    /** Set when this element lives inside a horizontal scroller. A sideways
     *  mouse drag then means "scroll the shelf", not "pick this up": the mouse
     *  path treats only a vertical pull (or a hold) as a pickup and aborts on
     *  horizontal drags so the scroller can pan. Touch already yields all drags
     *  to native scroll, so this flag only changes the mouse path. */
    scrollsHorizontally?: boolean;
}

const DEFAULT_HOLD_MS = 130;
const DEFAULT_MOVE = 10;
/** Touch is allowed a lot more drift than the mouse threshold before we call
 *  it a scroll. A deliberate press-and-hold on a phone is never still — the
 *  contact patch rolls as you press down, easily wandering 15-20px — so too
 *  tight a value aborts real holds as phantom scrolls (the book never lifts).
 *  A genuine scroll, by contrast, travels far past this within a few frames,
 *  so a generous slop still cleanly separates the two. */
const DEFAULT_TOUCH_SLOP = 22;

/**
 * Disambiguate "pick this book up" from "I'm scrolling" — the way a touch OS
 * does: a swipe navigates, a press selects. Fire from a React `onPointerDown`.
 *
 * The split is by input device, because they genuinely differ:
 *
 *   Touch / pen — the surface scrolls (a shelf sideways, the page vertically).
 *     - Any drag past the slop → it's a scroll → abort, let the browser pan.
 *     - Held ~`holdMs` roughly still → `onPress()` (pickup; finger-follow then
 *       takes over).
 *     - Quick release with little movement → `onActivate()` (tap-to-open).
 *
 *   Mouse — a drag can't scroll these surfaces, so there's nothing to protect.
 *     - Any drag past `moveThreshold` → `onPress()` (pickup) immediately, so a
 *       plain click-and-drag lifts the book.
 *     - Hold → `onPress()`; quick click → `onActivate()`.
 *
 * Listeners are window-level (so they keep firing past the element bounds) and
 * filtered by `pointerId` (multi-touch safe). `pointercancel` (browser claimed
 * the touch for a scroll) aborts.
 */
export function startPressGesture(
    e: ReactPointerEvent,
    {
        onPress,
        onActivate,
        holdMs = DEFAULT_HOLD_MS,
        moveThreshold = DEFAULT_MOVE,
        scrollsHorizontally = false,
    }: PressGestureOptions,
): void {
    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();
    const pointerId = e.pointerId;
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';

    // Dev-only gesture trace — broadcast to the on-screen HUD so a real
    // press-drag on a phone can be diagnosed without a console attached.
    const trace = import.meta.env.DEV
        ? (m: string) => window.dispatchEvent(new CustomEvent('gesturetrace', { detail: m }))
        : (_m: string) => {};
    trace(`down ${e.pointerType}`);

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
        trace(`PRESS @${Date.now() - startTime}ms`);
        cleanup();
        // Mouse only: capture the pointer to a stable element so move/up keep
        // firing even if the cursor leaves the window — without this, flinging
        // the lifted book to the viewport edge loses the pointerup and the book
        // sticks mid-air. Touch is deliberately left alone: it already has
        // implicit capture on the source element, and transferring it here
        // severed the finger-follow (window-level pointermove stopped arriving),
        // which made the lifted book ignore the finger.
        if (!isTouch) {
            try { document.body.setPointerCapture(pointerId); } catch { /* not capturable */ }
        }
        onPress();
    };

    const commitTap = () => {
        if (resolved) return;
        resolved = true;
        trace(`TAP @${Date.now() - startTime}ms`);
        cleanup();
        onActivate?.();
    };

    const abort = (reason: string) => {
        if (resolved) return;
        resolved = true;
        trace(`abort: ${reason}`);
        cleanup();
    };

    const holdTimer = window.setTimeout(commitPress, holdMs);

    const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || resolved) return;
        const absX = Math.abs(ev.clientX - startX);
        const absY = Math.abs(ev.clientY - startY);

        if (isTouch) {
            // A drag on a touch surface is a scroll — hand it back to the
            // browser. Pickup is reserved for a deliberate hold or a tap, so
            // scrolling never lifts a book.
            if (absX > DEFAULT_TOUCH_SLOP || absY > DEFAULT_TOUCH_SLOP) {
                abort(`scroll ${Math.round(Math.max(absX, absY))}px`);
            }
            return;
        }

        // Mouse: a drag normally can't scroll these surfaces, so it's a
        // deliberate pickup. The exception is a card inside a horizontal
        // scroller: there a sideways drag means "scroll the shelf", so we hand
        // horizontal drags back to it (abort) and only lift on a vertical pull
        // or a hold.
        if (scrollsHorizontally && absX > absY) {
            if (absX > moveThreshold) abort(`h-scroll ${Math.round(absX)}px`);
            return;
        }
        if (absX > moveThreshold || absY > moveThreshold) commitPress();
    };

    const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || resolved) return;
        const elapsed = Date.now() - startTime;
        if (elapsed < holdMs) commitTap();
        else trace(`up @${elapsed}ms — no-op (hold timer should have fired)`);
    };

    const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        abort(`pointercancel @${Date.now() - startTime}ms`);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
}
