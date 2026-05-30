import { useRef } from 'react';
import { BookCover, type CoverVariant } from './BookCover';
import { startPressGesture } from '../../utils/pressGesture';

interface BookCardProps {
    title: string;
    author: string;
    coverUrl?: string;
    variant?: CoverVariant;
    tint?: string;
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
}

export function BookCard({ title, author, coverUrl, variant, tint, widthClass = 'w-36', hidden, onPress, onActivate }: BookCardProps) {
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
                touchAction: 'manipulation',
                pointerEvents: hidden ? 'none' : undefined,
            }}
        >
            <div ref={coverRef} className="mb-2.5">
                {hidden ? (
                    <div
                        aria-hidden="true"
                        className="w-full aspect-[2/3] rounded-l-[3px] rounded-r-xl bg-espresso/[0.13] ring-1 ring-espresso/10 shadow-[inset_0_3px_10px_rgba(58,42,30,0.22)] animate-fade-in"
                    />
                ) : (
                    <BookCover
                        title={title}
                        author={author}
                        coverUrl={coverUrl}
                        variant={variant}
                        tint={tint}
                        size="md"
                    />
                )}
            </div>
            <h3 className={`font-serif text-[14px] font-medium leading-snug line-clamp-1 text-espresso transition-opacity ${hidden ? 'opacity-40' : ''}`}>{title}</h3>
            <p className={`text-[11px] text-mocha mt-0.5 italic line-clamp-1 transition-opacity ${hidden ? 'opacity-40' : ''}`}>{author}</p>
        </div>
    );
}
