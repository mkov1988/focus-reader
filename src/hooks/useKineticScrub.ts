import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface UseKineticScrubOpts {
    /** Which axis the drag runs along. 'y' = word/trail reel, 'x' = sentence. */
    axis: 'x' | 'y';
    /** Reads the current committed index — used to seed the drag. */
    getIndex: () => number;
    min: number;
    max: number;
    /** Drag pixels that equal one index step (one word). Smaller = more sensitive. */
    pxPerStep: number;
    disabled?: boolean;
    /** Fired once when a drag begins (e.g. pause playback). */
    onStart?: () => void;
    /** Continuous fractional position + current on-screen speed (steps/ms, always
     *  ≥ 0), emitted every drag / inertia / settle frame. Views use the position
     *  for the reel offset and the speed to fade neighbours in only while moving. */
    onFrame?: (frac: number, speed: number) => void;
    /** Integer index to commit (drives rsvp.seek). Only fires when it changes. */
    onCommit: (index: number) => void;
    /** Low-movement, short-duration press — used to peek the reader chrome. */
    onTap?: () => void;
    /** Fired once the reel has eased to rest on an integer index. */
    onSettle?: (index: number) => void;
}

// ── Feel constants (centralized so the "flick" can be tuned in one place). ──
const TAP_PX = 8;              // movement under this (px) + quick release = a tap
const TAP_MS = 250;
// Exponential velocity decay per millisecond: v *= exp(-FRICTION_K * dt).
// ~0.0035 lets a hard flick coast a bit over a second before it settles.
const FRICTION_K = 0.0035;
const HANDOFF_V = 0.004;       // steps/ms — coast hands off to the ease-in settle here
const MAX_V = 0.4;             // steps/ms — cap so one flick can't rocket away
const SAMPLE_WINDOW_MS = 90;   // release velocity is measured over this trailing window
const SETTLE_MS = 260;         // duration of the smooth ease onto the final word

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A pointer-driven kinetic scrubber that maps a finger drag along one axis to a
 * continuous position through an index range, with iOS-picker-style flick
 * momentum. Drag slowly → move one step at a time; flick → steps fly by and
 * gradually decelerate, then *ease* smoothly onto the nearest whole index (no
 * hard snap). Emits the current speed so views can fade motion cues in and out.
 *
 * Attach the returned `onPointerDown` to the reading surface (it stops
 * propagation so the coarse `<main>` swipe/exit gestures don't also fire). Call
 * `stop()` to abort any in-flight fling — e.g. when playback starts, so the reel
 * doesn't keep coasting out from under the reader.
 */
export function useKineticScrub(opts: UseKineticScrubOpts) {
    // Keep the latest options in a ref so the pointer handlers (attached once
    // per drag) always see current callbacks without re-binding.
    const optsRef = useRef(opts);
    useEffect(() => { optsRef.current = opts; });

    const rafRef = useRef<number | null>(null);
    const fracRef = useRef(0);
    // Previous emit, for measuring on-screen speed handed to onFrame.
    const lastEmitRef = useRef<{ frac: number; t: number }>({ frac: 0, t: 0 });

    const clampTo = (v: number) => Math.max(optsRef.current.min, Math.min(optsRef.current.max, v));

    const emit = useCallback((frac: number) => {
        const o = optsRef.current;
        const now = performance.now();
        const prev = lastEmitRef.current;
        const dt = now - prev.t;
        const speed = dt > 0 ? Math.abs(frac - prev.frac) / dt : 0;
        lastEmitRef.current = { frac, t: now };
        fracRef.current = frac;
        o.onFrame?.(frac, speed);
        o.onCommit(clampTo(Math.round(frac)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cancelRaf = useCallback(() => {
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    /** Finalize onto the nearest whole index right now (no animation). */
    const finalize = useCallback(() => {
        const o = optsRef.current;
        const target = clampTo(Math.round(fracRef.current));
        fracRef.current = target;
        lastEmitRef.current = { frac: target, t: performance.now() };
        o.onFrame?.(target, 0);
        o.onCommit(target);
        o.onSettle?.(target);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stop = useCallback(() => {
        // Only act on an in-flight fling/settle — otherwise a stray call (e.g.
        // playback starting after an unrelated seek) would revert the position.
        if (rafRef.current == null) return;
        cancelRaf();
        finalize();
    }, [cancelRaf, finalize]);

    useEffect(() => cancelRaf, [cancelRaf]);

    /** Ease the reel from its current position onto the nearest whole index. */
    const startSettle = useCallback(() => {
        const from = fracRef.current;
        const target = clampTo(Math.round(from));
        if (Math.abs(target - from) < 0.01 || prefersReducedMotion()) {
            finalize();
            return;
        }
        const t0 = performance.now();
        const step = (t: number) => {
            const p = Math.min(1, (t - t0) / SETTLE_MS);
            const frac = from + (target - from) * easeOutCubic(p);
            emit(frac);
            if (p >= 1) {
                fracRef.current = target;
                optsRef.current.onFrame?.(target, 0);
                optsRef.current.onCommit(target);
                optsRef.current.onSettle?.(target);
                rafRef.current = null;
                return;
            }
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emit, finalize]);

    const onPointerDown = useCallback((e: ReactPointerEvent) => {
        const o = optsRef.current;
        if (o.disabled) return;
        if (!e.isPrimary) return;
        const target = e.target as HTMLElement;
        // Let real controls (play/seek/slider) keep working.
        if (target.closest('button, input, [role="button"], [role="slider"], a, label, select, textarea')) return;

        // This pointer belongs to the scrubber — don't let the outer reader
        // gestures (swipe-skip / swipe-down-to-exit) arm for it too.
        e.stopPropagation();
        cancelRaf();

        const axis = o.axis;
        const pxPerStep = o.pxPerStep;
        const startCoord = axis === 'y' ? e.clientY : e.clientX;
        const base = o.getIndex();
        const pointerId = e.pointerId;
        const startTime = performance.now();
        let moved = 0;
        let resolved = false;

        fracRef.current = base;
        lastEmitRef.current = { frac: base, t: startTime };
        o.onStart?.();

        // Trailing velocity samples in step-space: { t, frac }.
        const samples: { t: number; frac: number }[] = [{ t: startTime, frac: base }];

        const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId || resolved) return;
            const coord = axis === 'y' ? ev.clientY : ev.clientX;
            // Up (y) / left (x) advances forward — hence (start - coord).
            const frac = clampTo(base + (startCoord - coord) / pxPerStep);
            moved = Math.max(moved, Math.abs(coord - startCoord));

            const now = performance.now();
            samples.push({ t: now, frac });
            while (samples.length > 2 && now - samples[0].t > SAMPLE_WINDOW_MS) samples.shift();

            emit(frac);
        };

        const finish = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };

        const onUp = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId || resolved) return;
            resolved = true;
            finish();

            const elapsed = performance.now() - startTime;
            if (moved < TAP_PX && elapsed < TAP_MS) {
                o.onTap?.();
                return;
            }

            // Release velocity (steps/ms) from the trailing sample window.
            const first = samples[0];
            const last = samples[samples.length - 1];
            const dt = last.t - first.t;
            let v = dt > 0 ? (last.frac - first.frac) / dt : 0;
            if (performance.now() - last.t > SAMPLE_WINDOW_MS * 1.5) v = 0; // stale hold
            v = Math.max(-MAX_V, Math.min(MAX_V, v));

            if (Math.abs(v) < HANDOFF_V || prefersReducedMotion()) {
                startSettle();
                return;
            }

            // Inertia: coast with exponential friction, then hand off to the
            // ease-in settle so the reel glides onto a word instead of snapping.
            let lastT = performance.now();
            const coast = (t: number) => {
                const frameDt = Math.min(64, t - lastT); // guard against tab-switch jumps
                lastT = t;

                let frac = fracRef.current + v * frameDt;
                v *= Math.exp(-FRICTION_K * frameDt);

                if (frac <= o.min || frac >= o.max) {
                    frac = clampTo(frac);
                    v = 0;
                }
                emit(frac);

                if (Math.abs(v) < HANDOFF_V) {
                    startSettle();
                    return;
                }
                rafRef.current = requestAnimationFrame(coast);
            };
            rafRef.current = requestAnimationFrame(coast);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [cancelRaf, emit, startSettle]);

    return { onPointerDown, stop };
}
