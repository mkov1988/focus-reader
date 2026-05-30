/**
 * Light haptic feedback for committed actions.
 *
 * Android browsers ring the device's vibration motor via `navigator.vibrate`.
 * iOS Safari silently no-ops (no web haptics API on iOS). If a user has
 * disabled vibration at the OS level, or the page is in an insecure context,
 * these calls also degrade to nothing — callers don't need to guard.
 *
 * Be sparing: vibrate on *commit* moments (action confirmed, error,
 * mode switch), NOT on every tap. Over-vibrating is annoying and quickly
 * gets the user to disable vibration system-wide.
 */
function vibrate(pattern: number | number[]): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
        navigator.vibrate(pattern);
    } catch {
        // Some browsers throw on insecure contexts — ignore.
    }
}

export const haptics = {
    /** Soft tick — taps that confirm something small (play/pause, theme pick). */
    tick: (): void => vibrate(5),
    /** Firmer pulse — primary commits (book opens, action completes). */
    commit: (): void => vibrate(12),
    /** Two-pulse pattern — errors / rejections. */
    error: (): void => vibrate([10, 60, 10]),
};
