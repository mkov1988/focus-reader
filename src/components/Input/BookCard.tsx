import { useRef } from 'react';
import { BookCover, type CoverVariant } from './BookCover';
import { SaveButton } from './SaveButton';
import { startPressGesture } from '../../utils/pressGesture';
import type { BookMetadata } from '../../services/types';

interface BookCardProps {
    title: string;
    author: string;
    coverUrl?: string;
    variant?: CoverVariant;
    tint?: string;
    /** When provided, a save-for-later bookmark toggle is shown on the cover. */
    book?: BookMetadata;
    /** Optional small node under the author line (e.g. a read-time chip). */
    badge?: React.ReactNode;
    /** Tailwind width class for the card (and thus cover) — default w-36.
     *  Staff picks use a larger value (w-44) for bigger, tappable covers. */
    widthClass?: string;
    /** True while this card's book is being lifted by the open-transition.
     *  We hide the card so the floating cover doesn't visually double. */
    hidden?: boolean;
    /** Press-and-hold gesture. Fires once the user has clearly committed
     *  to "open this book" (held briefly OR pulled the cover up). The
     *  open-transition then tracks the gesture at the window level until
     *  release. Receives the cover's rect so the transition knows where
     *  to lift from. */
    onPress: (originRect: DOMRect) => void;
    /** Instant-open path: keyboard activation (Enter / Space) AND quick
     *  taps that released before the hold threshold. The transition skips
     *  the gesture-tracking phase and goes straight to "waiting for load,
     *  then close into reader". */
    onActivate?: (originRect: DOMRect | null) => void;
    /** Touch hold (ms) before a press commits to a pickup. Cards inside a
     *  horizontal scroller pass a longer value so a sideways swipe scrolls
     *  the shelf instead of being grabbed as a lift. Omitted = gesture default. */
    holdMs?: number;
    /** Set for cards inside a horizontal scroller. On mouse, a sideways drag
     *  then scrolls the shelf (handled by the scroller) instead of lifting the
     *  book; only a vertical pull or a hold lifts. Touch is unaffected. */
    scrollsHorizontally?: boolean;
}

export function BookCard({ title, author, coverUrl, variant, tint, book, badge, widthClass = 'w-36', hidden, onPress, onActivate, holdMs, scrollsHorizontally }: BookCardProps) {
    const coverRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (hidden) return;
        startPressGesture(e, {
            onPress: () => {
                const rect = coverRef.current?.getBoundingClientRect();
                if (rect) onPress(rect);
            },
            onActivate: () => {
                onActivate?.(coverRef.current?.getBoundingClientRect() ?? null);
            },
            holdMs,
            scrollsHorizontally,
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.key === 'Enter' || e.key === ' ') && onActivate) {
            e.preventDefault();
            onActivate(coverRef.current?.getBoundingClientRect() ?? null);
        }
    };

    return (
        <div
            role={hidden ? undefined : 'button'}
            tabIndex={hidden ? -1 : 0}
            aria-label={hidden ? undefined : `Open ${title} by ${author}`}
            aria-hidden={hidden || undefined}
            onPointerDown={hidden ? undefined : handlePointerDown}
            onKeyDown={hidden ? undefined : handleKeyDown}
            className={`relative flex flex-col ${widthClass} select-none group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent focus-visible:ring-offset-2 focus-visible:ring-offset-warm-beige`}
            style={{
                // Deliberately NOT pointer-events:none while hidden — the hidden
                // card still holds the touch's implicit pointer capture, and
                // suppressing pointer-events on it can stop that captured move
                // stream from reaching the window-level finger-follow. New
                // gestures are already blocked: onPointerDown/onKeyDown are
                // detached and tabIndex is -1 while hidden.
                touchAction: 'manipulation',
            }}
        >
            <div ref={coverRef} className="relative mb-2.5">
                {/* The cover stays mounted even while `hidden` — we only fade it
                 *  out and lay the slot outline over it. On touch the browser
                 *  implicitly captures the pointer to the element under the
                 *  finger at pointerdown (this cover); unmounting it the moment
                 *  the pickup commits fires pointercancel and severs the
                 *  finger-follow, so the lifted book stops tracking. Keeping it
                 *  mounted preserves that capture. Mouse has no implicit capture,
                 *  which is why this only ever broke on touch. */}
                <div className={hidden ? 'opacity-0' : ''}>
                    <BookCover
                        title={title}
                        author={author}
                        coverUrl={coverUrl}
                        variant={variant}
                        tint={tint}
                        size="md"
                    />
                </div>
                {hidden && (
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 rounded-l-[3px] rounded-r-xl bg-espresso/[0.13] ring-1 ring-espresso/10 shadow-[inset_0_3px_10px_rgba(58,42,30,0.22)] animate-fade-in"
                    />
                )}
                {book && !hidden && (
                    <SaveButton book={book} tone="ribbon" />
                )}
            </div>
            <h3 className={`font-serif text-[14px] font-medium leading-snug line-clamp-1 text-espresso transition-opacity ${hidden ? 'opacity-40' : ''}`}>{title}</h3>
            <p className={`text-[11px] text-mocha mt-0.5 italic line-clamp-1 transition-opacity ${hidden ? 'opacity-40' : ''}`}>{author}</p>
            {badge && <div className={`mt-1.5 transition-opacity ${hidden ? 'opacity-40' : ''}`}>{badge}</div>}
        </div>
    );
}
