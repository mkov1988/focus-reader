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
 *       · If text is already loaded → shortcut from current openness toward 0
 *         (close), fade overlay, hand off to reader.
 *       · If text is still loading → FREEZE openness at the current value,
 *         reveal a small "still loading" badge, then close on load.
 *   - On release outside the rect: CANCEL. Spring to 0, dismiss, abort fetch
 *     (handled at App level).
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
}

// ── Visual constants ───────────────────────────────────────────────────
const COVER_W = 180;
const COVER_H = 270; // 2:3
/** Maximum peel angle (negative rotateY around the spine).
 *  Subtle by design — the cover lifts to a "peek" angle, not edge-on. */
const MAX_PEEL_DEG = 50;
/** Scrim opacity at fully-open. Kept faint so the storefront stays visible. */
const MAX_SCRIM_OPACITY = 0.10;

// ── Spring constants ───────────────────────────────────────────────────
// Tuned for a calm, ease-in-out feel. Critical-ish damping (no bounce).
const STIFFNESS = 110;
const DAMPING = 22;
const SETTLE_VAL = 0.0008;
const SETTLE_VEL = 0.01;

type Phase = 'tracking' | 'committed' | 'closing' | 'cancelling';

export function BookOpenTransition({ book, originRect, targetRect, loaded, error, onComplete, onCancel }: Props) {
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
    const [phase, setPhase] = useState<Phase>('tracking');
    const phaseRef = useRef<Phase>(phase);
    phaseRef.current = phase;
    const loadedRef = useRef(loaded);
    loadedRef.current = loaded;
    // Callbacks via refs so the long-lived rAF loop always invokes the LATEST
    // version (avoids a stale closure where `onComplete` captured pre-load
    // state and early-returns, hanging the overlay).
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const onCancelRef = useRef(onCancel);
    onCancelRef.current = onCancel;

    // ── Geometry: origin → centre ─────────────────────────────────────
    // Captured once at mount — handles rotation/scrolling poorly, but the
    // gesture is short enough that this is fine in practice.
    const geom = useRef(computeGeometry(originRect)).current;

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
        const left = cx - (COVER_W * scale) / 2 + visualOffset;
        const top = cy - (COVER_H * scale) / 2;
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
    }, [geom]);

    // ── Spring tick ────────────────────────────────────────────────────
    const tick = useCallback((now: number) => {
        const last = lastTimeRef.current;
        if (last === null) {
            lastTimeRef.current = now;
            rafRef.current = requestAnimationFrame(tick);
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
            // Fire completion based on current phase (via refs → always latest)
            if (phaseRef.current === 'closing') onCompleteRef.current();
            else if (phaseRef.current === 'cancelling') onCancelRef.current();
            return;
        }

        apply(opennessRef.current);
        rafRef.current = requestAnimationFrame(tick);
    }, [apply]);

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
            targetRef.current = inside(e.clientX, e.clientY) ? 1 : 0;
            ensureTick();
        };

        const onUp = (e: PointerEvent) => {
            const stillInside = inside(e.clientX, e.clientY);
            if (stillInside) {
                // COMMIT
                if (loadedRef.current) {
                    // Shortcut: close from wherever we are.
                    targetRef.current = 0;
                    setPhase('closing');
                } else {
                    // Freeze in place + show "still loading" badge.
                    targetRef.current = opennessRef.current;
                    setPhase('committed');
                }
            } else {
                // CANCEL
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

    // Loaded while committed → close
    useEffect(() => {
        if (loaded && phase === 'committed') {
            targetRef.current = 0;
            setPhase('closing');
            ensureTick();
        }
    }, [loaded, phase, ensureTick]);

    // Error → cancel cleanly
    useEffect(() => {
        if (error && phase !== 'cancelling') {
            targetRef.current = 0;
            setPhase('cancelling');
            ensureTick();
        }
    }, [error, phase, ensureTick]);

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
