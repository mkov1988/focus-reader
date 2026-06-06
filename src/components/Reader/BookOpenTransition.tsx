/**
 * Press-driven book-open transition.
 *
 * Design contract (from design conversation, 2026-05-24):
 *   - Mobile-first, touch-driven. There is no "click" — the gesture is
 *     press → hold → release.
 *   - A single `openness` value (0 → 1) drives the entire visual: lift +
 *     move-toward-finger + peel. While the finger is on the target rect, the
 *     spring targets 1. While off the rect, it targets 0. Reversible at any point.
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
 *   - Held indefinitely → stays at the max state (parked under the finger,
 *     half-open, with pages slowly riffling). No escalation.
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

// Dev-only gesture trace — shares the on-screen HUD channel with pressGesture
// so a real press-drag on a phone shows the whole sequence (pickup → tracking
// → release) without a console attached. Compiled out in production.
const traceDev: (m: string) => void = import.meta.env.DEV
    ? (m) => window.dispatchEvent(new CustomEvent('gesturetrace', { detail: m }))
    : () => {};

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

// ── Finger-follow constants ────────────────────────────────────────────
// The floating cover's open position gravitates toward the finger rather than
// a fixed screen centre. The anchor chases the finger with a low-pass ease so
// the book feels weighty (lags slightly, then settles) instead of being glued
// to the cursor. FOLLOW_TAU is that catch-up time constant in seconds — larger
// is laggier. The anchor is clamped so the fully-open cover stays on-screen.
// Deliberately weighty: the cover trails the finger rather than tracking it
// 1:1, which makes the "picking it up" gesture feel like it has mass.
const FOLLOW_TAU = 0.17;
const VIEWPORT_MARGIN = 12;

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

    // Open-anchor: the point the cover lifts toward. Eased toward the finger
    // each frame (see tick) so the lift gravitates to the touch with a little
    // weight. Starts at the tracking-rect centre so a keyboard open (no pointer)
    // simply lifts in place.
    const anchorRef = useRef<{ x: number; y: number }>({
        x: trackingCenterX,
        y: trackingCenterY,
    });

    // ── Apply: write spring value to the DOM. Called every animation frame. ─
    const apply = useCallback((o: number) => {
        // Wrapper: tween from the slot (origin centre, small scale) toward the
        // live open-anchor, which gravitates to the finger. Scale 0:scaleStart → 1:1.
        // At o=0 the anchor term vanishes, so the cover always starts in its slot;
        // at o=1 it sits on the anchor (the finger, clamped to the viewport).
        const cx = geom.startCX + (anchorRef.current.x - geom.startCX) * o;
        const cy = geom.startCY + (anchorRef.current.y - geom.startCY) * o;
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

        // Ease the open-anchor toward the finger — but only while the gesture is
        // live. Once committed/cancelling the anchor freezes so the cover doesn't
        // keep drifting after the finger has lifted.
        const anchorTarget = phaseRef.current === 'tracking'
            ? clampToViewport(fingerRef.current.x, fingerRef.current.y)
            : anchorRef.current;
        const k = 1 - Math.exp(-dt / FOLLOW_TAU);
        anchorRef.current.x += (anchorTarget.x - anchorRef.current.x) * k;
        anchorRef.current.y += (anchorTarget.y - anchorRef.current.y) * k;

        const springSettled =
            Math.abs(opennessRef.current - targetRef.current) < SETTLE_VAL &&
            Math.abs(velocityRef.current) < SETTLE_VEL;
        // Don't settle mid-chase: keep ticking until the anchor catches the
        // finger, or the lift would freeze before it reaches the touch point.
        const anchorSettled =
            Math.abs(anchorRef.current.x - anchorTarget.x) < 0.3 &&
            Math.abs(anchorRef.current.y - anchorTarget.y) < 0.3;

        if (springSettled && anchorSettled) {
            opennessRef.current = targetRef.current;
            velocityRef.current = 0;
            anchorRef.current = { x: anchorTarget.x, y: anchorTarget.y };
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

        // Counts pointermoves so the HUD can confirm the finger-follow stream is
        // actually reaching this window-level listener during a touch drag.
        let moves = 0;
        traceDev('track-start');

        const onMove = (e: PointerEvent) => {
            moves++;
            if (moves === 1) traceDev(`move#1 ${Math.round(e.clientX)},${Math.round(e.clientY)}`);
            // Track the finger for the rubber-band offset in apply().
            fingerRef.current = { x: e.clientX, y: e.clientY };
            targetRef.current = inside(e.clientX, e.clientY) ? 1 : 0;
            ensureTick();
        };

        const onUp = (e: PointerEvent) => {
            const stillInside = inside(e.clientX, e.clientY);
            traceDev(`up ${stillInside ? 'inside' : 'outside'} moves=${moves}`);
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

        // pointercancel is NOT a deliberate release — it means the system seized
        // the pointer (a scroll claim, an OS edge-gesture, or the source element
        // being torn out of the DOM when the card hides). It must never be read
        // as "the user chose to open this book." Wiring it to onUp did exactly
        // that: right after a touch pickup the finger is still inside the rect,
        // so a stray cancel committed the open and the book jumped to centre,
        // ignoring the finger. Treat it as an abort — spring back to the slot.
        const onCancelPointer = (e: PointerEvent) => {
            traceDev(`CANCEL moves=${moves} @${Math.round(e.clientX)},${Math.round(e.clientY)}`);
            targetRef.current = 0;
            setPhase('cancelling');
            ensureTick();
        };

        // The origin surface uses `touch-action: manipulation` so the browse
        // page can scroll normally. But once we're tracking a lifted book, the
        // finger is positioning it — a browser pan here would both scroll the
        // page out from under the gesture AND fire pointercancel (aborting the
        // open). Lock page scroll for the duration of tracking with a
        // non-passive touchmove that preventDefaults.
        const lockScroll = (e: TouchEvent) => e.preventDefault();
        window.addEventListener('touchmove', lockScroll, { passive: false });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancelPointer);
        return () => {
            window.removeEventListener('touchmove', lockScroll);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancelPointer);
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
                    pageContent={
                        <>
                            <FauxText />
                            <FlippingPages wrapRef={pagesWrapRef} />
                        </>
                    }
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
    };
}

/** Clamp an open-anchor point so the fully-open cover stays within the viewport. */
function clampToViewport(x: number, y: number) {
    const halfW = COVER_W / 2 + VIEWPORT_MARGIN;
    const halfH = COVER_H / 2 + VIEWPORT_MARGIN;
    const cx = window.innerWidth >= halfW * 2
        ? Math.min(window.innerWidth - halfW, Math.max(halfW, x))
        : window.innerWidth / 2;
    const cy = window.innerHeight >= halfH * 2
        ? Math.min(window.innerHeight - halfH, Math.max(halfH, y))
        : window.innerHeight / 2;
    return { x: cx, y: cy };
}

// ── Faux text ──────────────────────────────────────────────────────────
// Rows of "words" (dashed bars) revealed on the open page — ragged line widths,
// paragraph indents, and a centred chapter-heading mark. Reads as text without
// being legible, and deliberately broken (not solid ruled lines). Sits in the
// right ~60% reading area so the riffling pages near the spine don't cover it.
function FauxText() {
    const ink = 'rgba(74,55,40,0.32)';
    // Each inner array is a paragraph; numbers are line widths (% of column).
    const paras = [
        [97, 92, 95, 67],
        [94, 90, 96, 85, 51],
        [92, 88, 94, 60],
    ];
    let row = 0;
    return (
        <div className="absolute inset-y-[14%] left-[39%] right-[9%] flex flex-col">
            {/* chapter-heading mark */}
            <div
                style={{
                    alignSelf: 'center',
                    width: '46%',
                    height: '3px',
                    borderRadius: 9999,
                    background: ink,
                    opacity: 0.9,
                    marginBottom: '9px',
                }}
            />
            {paras.map((lines, pi) => (
                <div key={pi} className="flex flex-col" style={{ gap: '5px', marginTop: pi > 0 ? '8px' : 0 }}>
                    {lines.map((w, li) => {
                        // Vary the "word" length per row so the dashes don't line
                        // up into a grid; indent each paragraph's first line.
                        const wordPx = 3.6 + ((row * 3) % 4) * 0.5;
                        const indent = li === 0 ? 7 : 0;
                        row++;
                        return (
                            <div
                                key={li}
                                style={{
                                    width: `calc(${w}% - ${indent}px)`,
                                    marginLeft: indent,
                                    height: '2px',
                                    borderRadius: 9999,
                                    background: `repeating-linear-gradient(90deg, ${ink} 0 ${wordPx}px, transparent ${wordPx}px ${wordPx + 2.4}px)`,
                                }}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ── Pages turning ──────────────────────────────────────────────────────
// A few thin "pages" hinged at the spine, riffling near the binding so they
// read as page edges without covering the faux text in the reading area. Each
// turns slowly on a staggered loop so the motion feels continuous but calm.
// CSS animations only — no React state, no JS per frame.
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
                    className="absolute inset-y-[6%] left-[7%] right-[58%] rounded-r-md"
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
