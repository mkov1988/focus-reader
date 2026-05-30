/**
 * Press-driven book-open transition.
 *
 * Design contract (from design conversation, 2026-05-24):
 *   - Mobile-first, touch-driven. There is no "click" — the gesture is
 *     press → hold → release.
 *   - A single `openness` value (0 → 1) drives the entire visual: lift +
 *     centre + peel. While the finger is on the target rect, the spring
 *     targets 1. While off the rect, it targets 0. Reversible at any point.
 *   - On release inside the rect: COMMIT.
 *       · If text is already loaded → freeze position, fade the cover + scrim
 *         out in place, hand off to reader. The book stays floating until the
 *         reader replaces it; it does NOT return to its slot first.
 *       · If text is still loading → FREEZE openness at the current value,
 *         reveal a small "still loading" badge, then fade out on load (same).
 *   - On release outside the rect: CANCEL. Spring to 0 (book returns to its
 *     slot — the universal "didn't mean to open this" gesture), abort fetch.
 *   - The animation IS the loading signal. No glow, no breathing, no scrim
 *     beyond a very faint dim.
 *   - Held indefinitely → stays at the max state (centred, half-open, with
 *     pages slowly riffling). No escalation.
 *
 * Performance: every per-frame mutation is `transform` or `opacity` only,
 * and applied directly to DOM refs (bypassing React reconciliation). The
 * component only re-renders when the *phase* changes (tracking → committed
 * → closing/cancelling), not every frame.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BookCover } from '../Input/BookCover';
import type { BookMetadata } from '../../services/types';
import { haptics } from '../../utils/haptics';

interface Props {
    book: BookMetadata;
    /** Where the cover lifts from visually (the cover element's rect). */
    originRect: DOMRect;
    /** Where the user's finger must stay to keep the cover open. Defaults to
     *  originRect. The hero card uses the full card rect so taps on its
     *  Resume/Restart buttons also count as "inside target". */
    targetRect?: DOMRect;
    /** True once the App has downloaded + parsed the text. */
    loaded: boolean;
    /** Set if the fetch failed — closes the transition cleanly. */
    error: string | null;
    /** Called after the close animation settles; App swaps to the reader. */
    onComplete: () => void;
    /** Called after the cancel animation settles; App clears pending state. */
    onCancel: () => void;
    /** Keyboard / accessibility activation: skip the press-and-hold gesture
     *  tracking entirely. The cover springs open on mount, the loading badge
     *  shows, and the transition closes into the reader as soon as text loads
     *  (or cancels on error). Mouse and touch users still get the gesture. */
    autoCommit?: boolean;
}

// ── Visual constants ───────────────────────────────────────────────────
const COVER_W = 180;
const COVER_H = 270; // 2:3
/** Maximum peel angle (negative rotateY around the spine).
 *  Subtle by design — the cover lifts to a "peek" angle, not edge-on. */
const MAX_PEEL_DEG = 50;
/** Scrim opacity at fully-open. Kept faint so the storefront stays visible. */
const MAX_SCRIM_OPACITY = 0.10;

// ── Elastic-finger constants ───────────────────────────────────────────
// The floating cover is mostly anchored at the screen-centre target, but
// nudged toward the finger with rubber-band resistance: easy to move when the
// finger is close to the centre, asymptotically harder as it moves away.
// MAX_FOLLOW_PX caps how far the cover can drift from centre regardless of
// how far the finger has gone — keeps the book from flying across the screen.
const FOLLOW_RESISTANCE = 220;
const MAX_FOLLOW_PX = 90;

// ── Spring constants ───────────────────────────────────────────────────
// Tuned for a calm, ease-in-out feel. Critical-ish damping (no bounce).
const STIFFNESS = 110;
const DAMPING = 22;
const SETTLE_VAL = 0.0008;
const SETTLE_VEL = 0.01;

type Phase = 'tracking' | 'committed' | 'closing' | 'cancelling';

export function BookOpenTransition({ book, originRect, targetRect, loaded, error, onComplete, onCancel, autoCommit = false }: Props) {
    const trackingRect = targetRect ?? originRect;
    const wrapRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<HTMLDivElement>(null);
    const scrimRef = useRef<HTMLDivElement>(null);
    const pagesWrapRef = useRef<HTMLDivElement>(null);

    // ── Spring state (refs — no re-renders from animation) ─────────────
    const opennessRef = useRef(0);
    const velocityRef = useRef(0);
    const targetRef = useRef(1); // initial: spring toward open
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);

    // ── Phase state (re-renders only on transition; cheap) ─────────────
    // Keyboard activation jumps straight to 'committed' — no pointer gesture
    // to track, just wait for load and close. The mount-effect still springs
    // the cover open (target=1) so users see the same animation.
    const [phase, setPhase] = useState<Phase>(autoCommit ? 'committed' : 'tracking');
    // Mirrors of phase + props in refs so the long-lived rAF loop always reads
    // the LATEST value (avoids a stale closure where `onComplete` captured a
    // pre-load value and early-returns, hanging the overlay). Refs are written
    // in effects (react-hooks/refs).
    const phaseRef = useRef<Phase>(phase);
    const loadedRef = useRef(loaded);
    const onCompleteRef = useRef(onComplete);
    const onCancelRef = useRef(onCancel);
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { loadedRef.current = loaded; }, [loaded]);
    useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
    useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

    // ── Geometry: origin → centre ─────────────────────────────────────
    // Captured once at mount via useState lazy init. Parent re-keys the
    // component on every new open, so a stale geom can't leak across opens.
    const [geom] = useState(() => computeGeometry(originRect));

    // ── Finger tracking (for elastic rubber-band offset on the cover) ─
    // Initialised at the centre of the tracking rect so the cover sits
    // centred until the user actually moves. Updated by the move listener.
    // `trackingCenter` is precomputed because trackingRect is stable across
    // the lifetime of this transition (parent re-keys on book change).
    const trackingCenterX = trackingRect.left + trackingRect.width / 2;
    const trackingCenterY = trackingRect.top + trackingRect.height / 2;
    const fingerRef = useRef<{ x: number; y: number }>({
        x: trackingCenterX,
        y: trackingCenterY,
    });

    // ── Apply: write spring value to the DOM. Called every animation frame. ─
    const apply = useCallback((o: number) => {
        // Wrapper: tween from origin centre → viewport centre, scale 0:scaleStart → 1:1.
        const cx = geom.startCX + (geom.endCX - geom.startCX) * o;
        const cy = geom.startCY + (geom.endCY - geom.startCY) * o;
        const scale = geom.startScale + (1 - geom.startScale) * o;
        // Tiny visual-centre compensation: as the cover peels around its left
        // edge, its apparent centre shifts left. Nudge right to keep it true-centred.
        const peelRad = (MAX_PEEL_DEG * Math.PI / 180) * o;
        const visualOffset = ((1 - Math.cos(peelRad)) * COVER_W * scale) / 2;
        // Rubber-band: pull the cover toward the finger relative to the
        // tracking-rect centre, with asymptotic damping so it can never fly
        // off screen. Scaled by `o` so a cancel (book returning to slot)
        // smoothly drops the offset back to zero alongside the close animation.
        const fingerDx = fingerRef.current.x - trackingCenterX;
        const fingerDy = fingerRef.current.y - trackingCenterY;
        const fingerDist = Math.hypot(fingerDx, fingerDy);
        const followFactor = fingerDist === 0
            ? 0
            : (FOLLOW_RESISTANCE * (1 - Math.exp(-fingerDist / FOLLOW_RESISTANCE)) / fingerDist);
        const followX = Math.max(-MAX_FOLLOW_PX, Math.min(MAX_FOLLOW_PX, fingerDx * followFactor)) * o;
        const followY = Math.max(-MAX_FOLLOW_PX, Math.min(MAX_FOLLOW_PX, fingerDy * followFactor)) * o;
        const left = cx - (COVER_W * scale) / 2 + visualOffset + followX;
        const top = cy - (COVER_H * scale) / 2 + followY;
        if (wrapRef.current) {
            wrapRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
            wrapRef.current.style.width = `${COVER_W * scale}px`;
            wrapRef.current.style.height = `${COVER_H * scale}px`;
        }

        // Cover face peel (around the spine, rotateY).
        if (faceRef.current) {
            faceRef.current.style.transform = `rotateY(${-MAX_PEEL_DEG * o}deg)`;
        }

        // Scrim — faint, fades in with openness, fades back out on close/cancel.
        if (scrimRef.current) {
            scrimRef.current.style.opacity = String(MAX_SCRIM_OPACITY * o);
        }

        // Pages: only visible when the cover is well past closed.
        if (pagesWrapRef.current) {
            const pagesOpacity = Math.max(0, (o - 0.55) / 0.45);
            pagesWrapRef.current.style.opacity = String(pagesOpacity);
        }
    }, [geom, trackingCenterX, trackingCenterY]);

    // ── Spring tick ────────────────────────────────────────────────────
    // Self-recursion goes through `tickRef` (synced below) so the rAF
    // self-reference doesn't trip react-hooks/immutability.
    const tickRef = useRef<((t: number) => void) | null>(null);
    const tick = useCallback((now: number) => {
        const last = lastTimeRef.current;
        if (last === null) {
            lastTimeRef.current = now;
            rafRef.current = requestAnimationFrame(tickRef.current!);
            return;
        }
        // Clamp dt to keep one big frame skip from yeeting the spring.
        const dt = Math.min(0.04, (now - last) / 1000);
        lastTimeRef.current = now;

        const force = -STIFFNESS * (opennessRef.current - targetRef.current);
        const damp = -DAMPING * velocityRef.current;
        velocityRef.current += (force + damp) * dt;
        opennessRef.current += velocityRef.current * dt;

        const settled =
            Math.abs(opennessRef.current - targetRef.current) < SETTLE_VAL &&
            Math.abs(velocityRef.current) < SETTLE_VEL;

        if (settled) {
            opennessRef.current = targetRef.current;
            velocityRef.current = 0;
            apply(opennessRef.current);
            lastTimeRef.current = null;
            rafRef.current = null;
            // 'cancelling' settles back at the slot — only path that hands off
            // via spring. 'closing' is handled by the fade-out effect below.
            if (phaseRef.current === 'cancelling') onCancelRef.current();
            return;
        }

        apply(opennessRef.current);
        rafRef.current = requestAnimationFrame(tickRef.current!);
    }, [apply]);
    useEffect(() => { tickRef.current = tick; }, [tick]);

    const ensureTick = useCallback(() => {
        if (rafRef.current === null) {
            lastTimeRef.current = null;
            rafRef.current = requestAnimationFrame(tick);
        }
    }, [tick]);

    // ── Mount: paint initial state, then spring to 1 ───────────────────
    useEffect(() => {
        apply(0);
        targetRef.current = 1;
        ensureTick();
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Pointer tracking while in 'tracking' phase ─────────────────────
    useEffect(() => {
        if (phase !== 'tracking') return;

        const rect = trackingRect;
        const inside = (x: number, y: number) =>
            x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

        const onMove = (e: PointerEvent) => {
            // Track the finger for the rubber-band offset in apply().
            fingerRef.current = { x: e.clientX, y: e.clientY };
            targetRef.current = inside(e.clientX, e.clientY) ? 1 : 0;
            ensureTick();
        };

        const onUp = (e: PointerEvent) => {
            const stillInside = inside(e.clientX, e.clientY);
            if (stillInside) {
                // COMMIT — freeze the cover in mid-air; the closing-phase
                // effect will fade it out in place (no return to slot).
                targetRef.current = opennessRef.current;
                setPhase(loadedRef.current ? 'closing' : 'committed');
            } else {
                // CANCEL — universal "didn't mean to" gesture, spring back to slot.
                targetRef.current = 0;
                setPhase('cancelling');
            }
            ensureTick();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [phase, trackingRect, ensureTick]);

    // Loaded while committed → close (fade out in place, no spring-to-slot).
    useEffect(() => {
        if (loaded && phase === 'committed') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPhase('closing');
        }
    }, [loaded, phase]);

    // Error → cancel cleanly. Same rationale as the close-on-load effect.
    useEffect(() => {
        if (error && phase !== 'cancelling') {
            haptics.error();
            targetRef.current = 0;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPhase('cancelling');
            ensureTick();
        }
    }, [error, phase, ensureTick]);

    // Closing phase: stop the spring (no return to slot), fade the cover + scrim
    // out in place over CLOSE_FADE_MS, then hand off to the reader.
    useEffect(() => {
        if (phase !== 'closing') return;
        // Tactile confirmation that the book opened (Android; iOS silently no-ops).
        haptics.commit();
        // Stop the spring loop — apply() must not overwrite the CSS opacity.
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        const CLOSE_FADE_MS = 240;
        if (wrapRef.current) {
            wrapRef.current.style.transition = `opacity ${CLOSE_FADE_MS}ms ease-out`;
            wrapRef.current.style.opacity = '0';
        }
        if (scrimRef.current) {
            scrimRef.current.style.transition = `opacity ${CLOSE_FADE_MS}ms ease-out`;
            scrimRef.current.style.opacity = '0';
        }
        const t = window.setTimeout(() => onCompleteRef.current(), CLOSE_FADE_MS);
        return () => window.clearTimeout(t);
    }, [phase]);

    // ── Render ─────────────────────────────────────────────────────────
    // The wrap is `pointer-events: none` — gesture is tracked at window level
    // via the original rect. The floating cover is purely visual.
    return (
        <>
            <div
                ref={scrimRef}
                className="fixed inset-0 z-[80] bg-espresso pointer-events-none"
                style={{ opacity: 0, willChange: 'opacity' }}
            />
            <div
                ref={wrapRef}
                className="fixed z-[81] pointer-events-none"
                style={{
                    left: 0,
                    top: 0,
                    width: COVER_W,
                    height: COVER_H,
                    transformOrigin: 'top left',
                    willChange: 'transform, width, height',
                }}
            >
                <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    coverFaceRef={faceRef}
                    coverFaceTransition="none"
                    pageContent={<FlippingPages wrapRef={pagesWrapRef} />}
                />
            </div>

            {/* "Still loading" badge — appears only while committed-and-waiting. */}
            {phase === 'committed' && (
                <div className="fixed inset-x-0 bottom-10 z-[82] flex justify-center pointer-events-none">
                    <div className="bg-cream/95 rounded-full px-4 py-2 flex items-center gap-2 ring-1 ring-espresso/10 shadow-lg">
                        <Loader2 size={14} className="text-coral-accent animate-spin" />
                        <span className="text-[12px] font-medium text-espresso">Brewing your book…</span>
                    </div>
                </div>
            )}
        </>
    );
}

// ── Geometry helper ────────────────────────────────────────────────────
function computeGeometry(origin: DOMRect) {
    return {
        startCX: origin.left + origin.width / 2,
        startCY: origin.top + origin.height / 2,
        startScale: origin.width / COVER_W,
        endCX: window.innerWidth / 2,
        endCY: window.innerHeight / 2,
    };
}

// ── Pages turning ──────────────────────────────────────────────────────
// Three thin "pages" hinged at the spine. Each turns slowly on a staggered
// loop so the riffling feels continuous but calm. CSS animations only — no
// React state, no JS per frame.
function FlippingPages({ wrapRef }: { wrapRef: React.Ref<HTMLDivElement> }) {
    const TURN_MS = 2400;     // one page turn
    const STAGGER_MS = 800;   // delay between sibling pages
    return (
        <div
            ref={wrapRef}
            className="absolute inset-0"
            style={{ opacity: 0, perspective: 1000, transformStyle: 'preserve-3d', willChange: 'opacity' }}
        >
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className="absolute inset-y-[6%] left-[8%] right-[6%] rounded-r-md"
                    style={{
                        background:
                            'linear-gradient(90deg, rgba(58,42,30,0.18) 0px, rgba(255,247,228,0.02) 8px, #FBF7EE 18px)',
                        transformOrigin: 'left center',
                        backfaceVisibility: 'hidden',
                        animation: `pageTurn ${TURN_MS}ms cubic-bezier(.55,0,.45,1) ${i * STAGGER_MS}ms infinite`,
                        boxShadow: '0 1px 2px rgba(58,42,30,0.06)',
                    }}
                />
            ))}
            <style>{`
                @keyframes pageTurn {
                    0%   { transform: rotateY(0deg); opacity: 1; }
                    45%  { transform: rotateY(-178deg); opacity: 1; }
                    50%  { transform: rotateY(-178deg); opacity: 0; }
                    100% { transform: rotateY(-178deg); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
